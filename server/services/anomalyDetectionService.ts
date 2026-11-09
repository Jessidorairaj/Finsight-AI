/**
 * FinSight AI — Expense Anomaly Detection Engine
 * Rolling Historical Median & Interquartile Range (IQR) Anomaly Detection
 *
 * Evaluates authenticated user personal transaction history to identify:
 * 1. Sudden aggregate spending surges across completed months.
 * 2. Abnormal category-level expense spikes compared against historical baselines.
 *
 * Mathematical Framework:
 * - Median (Q2), First Quartile (Q1, 25th percentile), Third Quartile (Q3, 75th percentile).
 * - Interquartile Range: IQR = Q3 - Q1.
 * - Upper Statistical Bound: Threshold = Q3 + 1.5 * IQR.
 * - Severity Tiers:
 *   - Low: Exceeds Q3 + 1.5*IQR by <= 50%
 *   - Medium: Exceeds by 50% - 100% or exceeds Q3 + 2.0*IQR
 *   - High: Exceeds by 100% - 200%
 *   - Critical: Exceeds by > 200% or exceeds Q3 + 3.0*IQR
 */

import { FrontendTransaction } from '../repositories/transactionRepository.js';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ExpenseAnomaly {
  id: string;
  type: 'total_spending_spike' | 'category_unusual_spend';
  category?: string;
  month: string;
  actualAmount: number;
  baselineAmount: number; // Historical median
  normalUpperThreshold: number; // Q3 + 1.5 * IQR
  diffAmount: number; // actualAmount - baselineAmount
  diffPercentage: number; // ((actualAmount - baselineAmount) / baselineAmount) * 100
  severity: AnomalySeverity;
  reason: string;
  iqrDetails: {
    q1: number;
    median: number;
    q3: number;
    iqr: number;
    historicalMonthsCount: number;
  };
  detectedAt: string;
}

export interface CategoryAnomalySummary {
  category: string;
  monthlyMedian: number;
  normalThreshold: number;
  latestActual: number;
  isAnomaly: boolean;
  anomalySeverity?: AnomalySeverity;
  diffAmount?: number;
  diffPercentage?: number;
}

export interface AnomalyDetectionResult {
  status: 'ok' | 'insufficient_data';
  anomalies: ExpenseAnomaly[];
  totalAnomaliesCount: number;
  highestSeverity: AnomalySeverity | 'none';
  evaluatedPeriod: string;
  completedMonthsCount: number;
  summary: string;
  categoryBreakdown: Record<string, CategoryAnomalySummary>;
}

/**
 * Calculates percentile from a sorted array of numbers using linear interpolation.
 */
function calculatePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];

  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;

  if (lower === upper) return sorted[lower];
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Computes Q1, Median, Q3, and IQR from a sample array.
 */
export function computeIqrStats(values: number[]): { q1: number; median: number; q3: number; iqr: number } {
  if (values.length === 0) {
    return { q1: 0, median: 0, q3: 0, iqr: 0 };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = Math.round(calculatePercentile(sorted, 0.25) * 100) / 100;
  const median = Math.round(calculatePercentile(sorted, 0.50) * 100) / 100;
  const q3 = Math.round(calculatePercentile(sorted, 0.75) * 100) / 100;
  const iqr = Math.max(0, Math.round((q3 - q1) * 100) / 100);

  return { q1, median, q3, iqr };
}

/**
 * Parses diverse transaction dates into 'YYYY-MM'.
 */
function extractYearMonth(dateStr: string): string | null {
  if (!dateStr) return null;
  const match = String(dateStr).trim().match(/^(\d{4})[-/.](\d{1,2})/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    return `${y}-${m}`;
  }
  return null;
}

/**
 * Identifies expenditure anomalies for an authenticated user using rolling historical IQR.
 */
export function detectExpenseAnomalies(
  transactions: FrontendTransaction[],
  asOfYearMonth?: string
): AnomalyDetectionResult {
  // Determine target current calendar month
  const now = new Date();
  const currentYm = asOfYearMonth || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  // Filter valid completed expense transactions (excluding transfers, credits, and current ongoing month)
  const monthlyTotals: Record<string, number> = {};
  const categoryMonthlyTotals: Record<string, Record<string, number>> = {};

  for (const tx of transactions) {
    const isExpense = tx.type?.toLowerCase() === 'expense' || (tx as any).direction === 'out';
    if (!isExpense) continue;

    const ym = extractYearMonth(tx.date);
    if (!ym) continue;

    // Exclude current incomplete month from baseline completed statistics
    if (ym >= currentYm) continue;

    const amount = Math.abs(Number(tx.amount) || 0);
    if (amount <= 0) continue;

    monthlyTotals[ym] = (monthlyTotals[ym] || 0) + amount;

    const cat = tx.category?.trim() || 'General';
    if (!categoryMonthlyTotals[cat]) {
      categoryMonthlyTotals[cat] = {};
    }
    categoryMonthlyTotals[cat][ym] = (categoryMonthlyTotals[cat][ym] || 0) + amount;
  }

  const sortedMonths = Object.keys(monthlyTotals).sort();
  const completedMonthsCount = sortedMonths.length;

  if (completedMonthsCount < 3) {
    return {
      status: 'insufficient_data',
      anomalies: [],
      totalAnomaliesCount: 0,
      highestSeverity: 'none',
      evaluatedPeriod: completedMonthsCount > 0 ? `${sortedMonths[0]} to ${sortedMonths[sortedMonths.length - 1]}` : 'N/A',
      completedMonthsCount,
      summary: `At least 3 completed historical months are required for statistical IQR anomaly detection. Currently ${completedMonthsCount} completed month(s) available.`,
      categoryBreakdown: {},
    };
  }

  const anomalies: ExpenseAnomaly[] = [];
  const latestCompletedMonth = sortedMonths[sortedMonths.length - 1];

  // 1. Total Spending Anomaly Detection across latest completed months (evaluating latest up to 3 completed months)
  const monthsToEvaluate = sortedMonths.slice(-3); // Inspect latest 3 completed months
  const allMonthlyValues = sortedMonths.map(m => monthlyTotals[m]);
  const totalIqr = computeIqrStats(allMonthlyValues);

  // Normal upper bound: Q3 + 1.5 * IQR. (Min bound buffer: at least 15% above median or +Rs 500)
  const totalThreshold = Math.max(
    totalIqr.q3 + 1.5 * totalIqr.iqr,
    totalIqr.median * 1.15,
    totalIqr.median + 500
  );

  for (const evalMonth of monthsToEvaluate) {
    const monthSpend = monthlyTotals[evalMonth];
    if (monthSpend > totalThreshold) {
      const diffAmount = Math.round((monthSpend - totalIqr.median) * 100) / 100;
      const diffPercentage = totalIqr.median > 0
        ? Math.round(((monthSpend - totalIqr.median) / totalIqr.median) * 1000) / 10
        : 100.0;

      let severity: AnomalySeverity = 'low';
      if (diffPercentage > 200 || monthSpend > (totalIqr.q3 + 3.0 * totalIqr.iqr)) {
        severity = 'critical';
      } else if (diffPercentage > 100 || monthSpend > (totalIqr.q3 + 2.5 * totalIqr.iqr)) {
        severity = 'high';
      } else if (diffPercentage > 50 || monthSpend > (totalIqr.q3 + 2.0 * totalIqr.iqr)) {
        severity = 'medium';
      }

      anomalies.push({
        id: `anom-total-${evalMonth}`,
        type: 'total_spending_spike',
        month: evalMonth,
        actualAmount: monthSpend,
        baselineAmount: totalIqr.median,
        normalUpperThreshold: Math.round(totalThreshold),
        diffAmount,
        diffPercentage,
        severity,
        reason: `Total spending reached ₹${monthSpend.toLocaleString('en-IN')} in ${evalMonth}, which is ₹${diffAmount.toLocaleString('en-IN')} (+${diffPercentage}%) above your personal median of ₹${totalIqr.median.toLocaleString('en-IN')}, exceeding the statistical upper bound of ₹${Math.round(totalThreshold).toLocaleString('en-IN')} (Q3 + 1.5×IQR).`,
        iqrDetails: {
          q1: totalIqr.q1,
          median: totalIqr.median,
          q3: totalIqr.q3,
          iqr: totalIqr.iqr,
          historicalMonthsCount: completedMonthsCount,
        },
        detectedAt: new Date().toISOString(),
      });
    }
  }

  // 2. Category-Specific Anomaly Detection
  const categoryBreakdown: Record<string, CategoryAnomalySummary> = {};

  for (const [cat, monthMap] of Object.entries(categoryMonthlyTotals)) {
    // Fill all completed historical months for this category (0 if no spend recorded in that month)
    const catSeries = sortedMonths.map(m => monthMap[m] || 0);
    const nonZeroSeries = catSeries.filter(v => v > 0);

    // Require at least 2 non-zero spending occurrences in category
    if (nonZeroSeries.length < 2) continue;

    const catIqr = computeIqrStats(catSeries);
    const catThreshold = Math.max(
      catIqr.q3 + 1.5 * catIqr.iqr,
      catIqr.median * 1.25,
      catIqr.median + 300
    );

    const latestCatSpend = monthMap[latestCompletedMonth] || 0;
    const isAnomaly = latestCatSpend > catThreshold && (latestCatSpend - catIqr.median) >= 300;

    let catSeverity: AnomalySeverity | undefined = undefined;
    let diffAmount: number | undefined = undefined;
    let diffPercentage: number | undefined = undefined;

    if (isAnomaly) {
      diffAmount = Math.round((latestCatSpend - catIqr.median) * 100) / 100;
      diffPercentage = catIqr.median > 0
        ? Math.round(((latestCatSpend - catIqr.median) / catIqr.median) * 1000) / 10
        : 100.0;

      if (diffPercentage > 200 || latestCatSpend > (catIqr.q3 + 3.0 * catIqr.iqr)) {
        catSeverity = 'critical';
      } else if (diffPercentage > 100 || latestCatSpend > (catIqr.q3 + 2.5 * catIqr.iqr)) {
        catSeverity = 'high';
      } else if (diffPercentage > 50 || latestCatSpend > (catIqr.q3 + 2.0 * catIqr.iqr)) {
        catSeverity = 'medium';
      } else {
        catSeverity = 'low';
      }

      anomalies.push({
        id: `anom-cat-${cat}-${latestCompletedMonth}`,
        type: 'category_unusual_spend',
        category: cat,
        month: latestCompletedMonth,
        actualAmount: latestCatSpend,
        baselineAmount: catIqr.median,
        normalUpperThreshold: Math.round(catThreshold),
        diffAmount,
        diffPercentage,
        severity: catSeverity,
        reason: `${cat} spending surged to ₹${latestCatSpend.toLocaleString('en-IN')} in ${latestCompletedMonth}, which is ₹${diffAmount.toLocaleString('en-IN')} (+${diffPercentage}%) higher than your historical median of ₹${catIqr.median.toLocaleString('en-IN')}, surpassing the normal threshold of ₹${Math.round(catThreshold).toLocaleString('en-IN')} (Q3 + 1.5×IQR).`,
        iqrDetails: {
          q1: catIqr.q1,
          median: catIqr.median,
          q3: catIqr.q3,
          iqr: catIqr.iqr,
          historicalMonthsCount: completedMonthsCount,
        },
        detectedAt: new Date().toISOString(),
      });
    }

    categoryBreakdown[cat] = {
      category: cat,
      monthlyMedian: catIqr.median,
      normalThreshold: Math.round(catThreshold),
      latestActual: latestCatSpend,
      isAnomaly,
      anomalySeverity: catSeverity,
      diffAmount,
      diffPercentage,
    };
  }

  // Sort anomalies: Critical > High > Medium > Low, then by date descending
  const severityRank: Record<AnomalySeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  anomalies.sort((a, b) => {
    const rankDiff = severityRank[b.severity] - severityRank[a.severity];
    if (rankDiff !== 0) return rankDiff;
    return b.month.localeCompare(a.month);
  });

  const highestSeverity = anomalies.length > 0 ? anomalies[0].severity : 'none';
  const evaluatedPeriod = `${sortedMonths[0]} to ${latestCompletedMonth}`;
  const summary = anomalies.length > 0
    ? `Detected ${anomalies.length} spending anomal${anomalies.length === 1 ? 'y' : 'ies'} across ${completedMonthsCount} historical months using rolling IQR statistical analysis.`
    : `All spending patterns normal across ${completedMonthsCount} historical months. No IQR statistical anomalies detected.`;

  return {
    status: 'ok',
    anomalies,
    totalAnomaliesCount: anomalies.length,
    highestSeverity,
    evaluatedPeriod,
    completedMonthsCount,
    summary,
    categoryBreakdown,
  };
}
