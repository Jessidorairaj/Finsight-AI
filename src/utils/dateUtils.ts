/**
 * FinSight AI — Date Utility Functions
 * Robust multi-format date parser and formatter for transaction ledgers and charts.
 */

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_FULL = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Parses diverse transaction date strings into a JavaScript Date object.
 * Supports:
 * - "21 Aug 2025", "21-Aug-2025", "21 August 2025"
 * - "2025-08-21", "2025/08/21" (ISO YYYY-MM-DD)
 * - "21/08/2025", "21-08-2025" (DD/MM/YYYY)
 * - "08/21/2025", "08-21-2025" (MM/DD/YYYY)
 * - "Aug 21, 2025", "August 21, 2025"
 * - ISO string with timestamps
 */
export function parseTransactionDate(dateStr: string | undefined | null): Date | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // 1. Check for standard "DD Mon YYYY" or "DD-Mon-YYYY" (e.g. 21 Aug 2025, 21-Aug-2025, 21 August 2025, 21-Oct-26)
  const ddMonYyyyMatch = trimmed.match(/^(\d{1,2})[\s\-/,]+([A-Za-z]+)[\s\-/,]+(\d{2,4})$/);
  if (ddMonYyyyMatch) {
    const day = parseInt(ddMonYyyyMatch[1], 10);
    const monthText = ddMonYyyyMatch[2].toLowerCase();
    let year = parseInt(ddMonYyyyMatch[3], 10);
    if (year < 100) {
      year = year >= 70 ? 1900 + year : 2000 + year;
    }

    const monthIndex = MONTH_NAMES_FULL.findIndex(m => m.startsWith(monthText.slice(0, 3)));
    if (monthIndex !== -1 && day >= 1 && day <= 31) {
      const date = new Date(year, monthIndex, day);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // 2. Check for "Mon DD, YYYY" (e.g. Aug 21, 2025, Oct 1, 2026)
  const monDdYyyyMatch = trimmed.match(/^([A-Za-z]+)[\s\-/,]+(\d{1,2})[\s\-/,]+(\d{2,4})$/);
  if (monDdYyyyMatch) {
    const monthText = monDdYyyyMatch[1].toLowerCase();
    const day = parseInt(monDdYyyyMatch[2], 10);
    let year = parseInt(monDdYyyyMatch[3], 10);
    if (year < 100) {
      year = year >= 70 ? 1900 + year : 2000 + year;
    }

    const monthIndex = MONTH_NAMES_FULL.findIndex(m => m.startsWith(monthText.slice(0, 3)));
    if (monthIndex !== -1 && day >= 1 && day <= 31) {
      const date = new Date(year, monthIndex, day);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // 3. Check for ISO "YYYY-MM-DD" or "YYYY/MM/DD"
  const isoMatch = trimmed.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10) - 1;
    const day = parseInt(isoMatch[3], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }

  // 4. Check for "DD/MM/YYYY", "DD-MM-YYYY", "DD/MM/YY", or "MM/DD/YYYY"
  const ddMmYyyyMatch = trimmed.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (ddMmYyyyMatch) {
    const first = parseInt(ddMmYyyyMatch[1], 10);
    const second = parseInt(ddMmYyyyMatch[2], 10);
    let year = parseInt(ddMmYyyyMatch[3], 10);
    if (year < 100) {
      year = year >= 70 ? 1900 + year : 2000 + year;
    }

    // Heuristic: If first > 12, it must be DD/MM/YYYY
    if (first > 12 && second <= 12) {
      const date = new Date(year, second - 1, first);
      if (!isNaN(date.getTime())) return date;
    } else if (second > 12 && first <= 12) {
      // MM/DD/YYYY
      const date = new Date(year, first - 1, second);
      if (!isNaN(date.getTime())) return date;
    } else {
      // Default to DD/MM/YYYY for standard statements
      const date = new Date(year, second - 1, first);
      if (!isNaN(date.getTime())) return date;
    }
  }

  // 5. Fallback native Date parsing
  const nativeParsed = new Date(trimmed);
  if (!isNaN(nativeParsed.getTime())) {
    return nativeParsed;
  }

  return null;
}

/**
 * Normalizes any valid date string or Date object into "YYYY-MM-DD" for strict equality comparison
 */
export function normalizeDateToISO(dateInput: string | Date | undefined | null): string {
  if (!dateInput) return '';
  const d = dateInput instanceof Date ? dateInput : parseTransactionDate(dateInput);
  if (!d || isNaN(d.getTime())) return typeof dateInput === 'string' ? dateInput.trim().toLowerCase() : '';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Compares two date strings across different formats by converting to calendar year/month/day
 */
export function areDatesEqual(dateStrA: string | undefined | null, dateStrB: string | undefined | null): boolean {
  if (!dateStrA || !dateStrB) return false;
  if (dateStrA.trim() === dateStrB.trim()) return true;
  const isoA = normalizeDateToISO(dateStrA);
  const isoB = normalizeDateToISO(dateStrB);
  if (isoA && isoB) {
    return isoA === isoB;
  }
  return dateStrA.trim().toLowerCase() === dateStrB.trim().toLowerCase();
}

/**
 * Formats a Date into standard FinSight ledger format: "DD Mon YYYY" (e.g. "21 Aug 2026")
 */
export function formatStandardDate(date: Date): string {
  const day = date.getDate();
  const month = MONTH_NAMES_SHORT[date.getMonth()];
  const year = date.getFullYear();
  return `${day} ${month} ${year}`;
}

/**
 * Returns a 3-letter weekday abbreviation ('Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat')
 */
export function getWeekdayShort(date: Date): string {
  return DAY_NAMES_SHORT[date.getDay()];
}

/**
 * Returns a 3-letter month abbreviation ('Jan' | 'Feb' | ...)
 */
export function getMonthShort(date: Date): string {
  return MONTH_NAMES_SHORT[date.getMonth()];
}

export const MONTH_NAMES_CAPITALIZED = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export interface MonthOption {
  label: string;      // e.g. "All Time", "Aug 2026", "Sep 2026", "Oct 2026", "Nov 2026 (Forecast)", "Aug 2025"
  value: string;      // same as label
  baseLabel: string;  // e.g. "All Time", "Nov 2026", "Aug 2025"
  shortMonth: string; // e.g. "All", "Nov", "Aug"
  fullMonth: string;  // e.g. "All Time", "November", "August"
  year: number;       // e.g. 2026, 2025, 0 for All Time
  monthIndex: number; // 0-11, -1 for All Time
  isCurrent: boolean;
  isForecast: boolean;
  isPrevious: boolean;
  isAllTime?: boolean;
  isHistorical?: boolean;
}

export interface ParsedMonthSelection {
  year: number;
  monthIndex: number; // 0-11, -1 for All Time
  shortMonth: string;
  fullMonth: string;
  isForecast: boolean;
  baseMonthString: string; // e.g. "Oct 2026", "All Time"
}

/**
 * Dynamically calculates the month selector options:
 * 1. "All Time" option at index 0.
 * 2. Active 4-month rolling window based on system date: [Month - 2, Month - 1, Current Month, Next Month (Forecast)].
 * 3. Historical months found in transactions that fall outside the active 4-month window (e.g. "Aug 2025").
 */
export function generateDynamicMonthOptions(
  referenceDate: Date = new Date(),
  transactionDatesOrList?: Array<string | { date?: string }>,
  selectedMonth?: string
): MonthOption[] {
  const ref = referenceDate instanceof Date && !isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth();

  // 1. All Time Option
  const allTimeOption: MonthOption = {
    label: 'All Time',
    value: 'All Time',
    baseLabel: 'All Time',
    shortMonth: 'All',
    fullMonth: 'All Time',
    year: 0,
    monthIndex: -1,
    isCurrent: false,
    isForecast: false,
    isPrevious: false,
    isAllTime: true,
    isHistorical: false,
  };

  // 2. Offsets: [-2, -1, 0, 1] -> 2 previous months, current month, next month (forecast)
  const offsets = [-2, -1, 0, 1];
  const dynamicWindow = offsets.map(offset => {
    const d = new Date(refYear, refMonth + offset, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    const shortMonth = MONTH_NAMES_SHORT[monthIndex];
    const fullMonth = MONTH_NAMES_CAPITALIZED[monthIndex];
    const isCurrent = offset === 0;
    const isForecast = offset === 1;
    const isPrevious = offset < 0;

    const baseLabel = `${shortMonth} ${year}`;
    const label = isForecast ? `${baseLabel} (Forecast)` : baseLabel;

    return {
      label,
      value: label,
      baseLabel,
      shortMonth,
      fullMonth,
      year,
      monthIndex,
      isCurrent,
      isForecast,
      isPrevious,
      isAllTime: false,
      isHistorical: false,
    };
  });

  // Track existing (year, monthIndex) in the active window
  const seenYearMonths = new Set<string>();
  dynamicWindow.forEach(m => {
    seenYearMonths.add(`${m.year}-${m.monthIndex}`);
  });

  // 3. Extract historical months from transaction records
  const historicalMonthMap = new Map<string, { year: number; monthIndex: number }>();
  if (Array.isArray(transactionDatesOrList)) {
    transactionDatesOrList.forEach(item => {
      const dateStr = typeof item === 'string' ? item : item?.date;
      if (!dateStr) return;
      const parsed = parseTransactionDate(dateStr);
      if (!parsed) return;
      const y = parsed.getFullYear();
      const mIdx = parsed.getMonth();
      const key = `${y}-${mIdx}`;
      if (!seenYearMonths.has(key)) {
        historicalMonthMap.set(key, { year: y, monthIndex: mIdx });
      }
    });
  }

  // 4. Preserve active selectedMonth in options if specified and outside the active window
  if (selectedMonth && selectedMonth.trim() && selectedMonth.trim().toLowerCase() !== 'all time') {
    const parsedSelected = parseMonthSelectorValue(selectedMonth);
    if (parsedSelected && parsedSelected.monthIndex !== -1) {
      const key = `${parsedSelected.year}-${parsedSelected.monthIndex}`;
      if (!seenYearMonths.has(key) && !historicalMonthMap.has(key)) {
        historicalMonthMap.set(key, { year: parsedSelected.year, monthIndex: parsedSelected.monthIndex });
      }
    }
  }

  // Convert historical months to MonthOption and sort chronologically descending (newest historical first)
  const historicalOptions: MonthOption[] = Array.from(historicalMonthMap.values())
    .sort((a, b) => {
      if (a.year !== b.year) return b.year - a.year;
      return b.monthIndex - a.monthIndex;
    })
    .map(({ year, monthIndex }) => {
      const shortMonth = MONTH_NAMES_SHORT[monthIndex];
      const fullMonth = MONTH_NAMES_CAPITALIZED[monthIndex];
      const label = `${shortMonth} ${year}`;
      return {
        label,
        value: label,
        baseLabel: label,
        shortMonth,
        fullMonth,
        year,
        monthIndex,
        isCurrent: false,
        isForecast: false,
        isPrevious: true,
        isAllTime: false,
        isHistorical: true,
      };
    });

  return [allTimeOption, ...dynamicWindow, ...historicalOptions];
}

/**
 * Returns the dynamically calculated current month label (e.g. "Oct 2026")
 */
export function getCurrentMonthLabel(referenceDate: Date = new Date()): string {
  const ref = referenceDate instanceof Date && !isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const options = generateDynamicMonthOptions(ref);
  const current = options.find(o => o.isCurrent);
  if (current) return current.label;
  return `${MONTH_NAMES_SHORT[ref.getMonth()]} ${ref.getFullYear()}`;
}

/**
 * Parses a month selection string (e.g. "Oct 2026", "Nov 2026 (Forecast)", "August 2026")
 */
export function parseMonthSelectorValue(monthStr: string | undefined | null): ParsedMonthSelection | null {
  if (!monthStr || typeof monthStr !== 'string') return null;
  const trimmed = monthStr.trim();
  if (!trimmed) return null;

  if (trimmed.toLowerCase() === 'all time') {
    return {
      year: 0,
      monthIndex: -1,
      shortMonth: 'All',
      fullMonth: 'All Time',
      isForecast: false,
      baseMonthString: 'All Time',
    };
  }

  const isForecast = /\(forecast\)/i.test(trimmed);
  const cleaned = trimmed.replace(/\(forecast\)/i, '').trim();

  // Pattern: "Mon YYYY" or "Month YYYY"
  const match = cleaned.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (match) {
    const rawMonth = match[1].toLowerCase();
    const year = parseInt(match[2], 10);

    const monthIndex = MONTH_NAMES_FULL.findIndex(m => m.startsWith(rawMonth.slice(0, 3)));
    if (monthIndex !== -1 && !isNaN(year)) {
      const shortMonth = MONTH_NAMES_SHORT[monthIndex];
      const fullMonth = MONTH_NAMES_CAPITALIZED[monthIndex];
      return {
        year,
        monthIndex,
        shortMonth,
        fullMonth,
        isForecast,
        baseMonthString: `${shortMonth} ${year}`,
      };
    }
  }

  // Fallback: Try parsing via native Date
  const parsed = new Date(cleaned);
  if (!isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const monthIndex = parsed.getMonth();
    const shortMonth = MONTH_NAMES_SHORT[monthIndex];
    const fullMonth = MONTH_NAMES_CAPITALIZED[monthIndex];
    return {
      year,
      monthIndex,
      shortMonth,
      fullMonth,
      isForecast,
      baseMonthString: `${shortMonth} ${year}`,
    };
  }

  return null;
}

/**
 * Filters a transaction by matching its actual date against the selected month
 */
export function isTransactionInSelectedMonth(
  txDateStr: string | undefined | null,
  selectedMonth: string
): boolean {
  if (!txDateStr) return false;
  if (!selectedMonth || selectedMonth.toLowerCase() === 'all time') {
    return true;
  }

  const parsedTxDate = parseTransactionDate(txDateStr);
  if (!parsedTxDate) return false;

  const selection = parseMonthSelectorValue(selectedMonth);
  if (!selection || selection.monthIndex === -1) return true; // If All Time or no valid month parsed, include

  return (
    parsedTxDate.getFullYear() === selection.year &&
    parsedTxDate.getMonth() === selection.monthIndex
  );
}

/**
 * Returns a series of recent months ending in a reference month (e.g. for charts)
 */
export function getRecentMonthsSeries(
  count: number = 6,
  referenceDate: Date = new Date()
): Array<{ name: string; fullMonth: string; year: number; monthIndex: number; isCurrent: boolean }> {
  const ref = referenceDate instanceof Date && !isNaN(referenceDate.getTime()) ? referenceDate : new Date();
  const refYear = ref.getFullYear();
  const refMonth = ref.getMonth();

  const series: Array<{ name: string; fullMonth: string; year: number; monthIndex: number; isCurrent: boolean }> = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(refYear, refMonth - i, 1);
    const year = d.getFullYear();
    const monthIndex = d.getMonth();
    series.push({
      name: MONTH_NAMES_SHORT[monthIndex],
      fullMonth: MONTH_NAMES_CAPITALIZED[monthIndex],
      year,
      monthIndex,
      isCurrent: i === 0,
    });
  }
  return series;
}

