/**
 * FinSight AI — Machine Learning Expense Forecasting Service
 * Phase 5: Machine Learning Expense Forecasting (Rolling-Origin Chronological Validation)
 *
 * Coordinates execution across:
 * 1. Python FastAPI microservice (if active on port 8000)
 * 2. Python scikit-learn ML engine via child process (`ml_service/forecast_engine.py`)
 * 3. High-availability TypeScript mathematical regression fallback
 */

import { spawn, spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { FrontendTransaction } from '../repositories/transactionRepository.js';

export interface ForecastActualPoint {
  month: string; // 'YYYY-MM'
  actual: number;
  isZeroExpense?: boolean;
  hasRecordedTransactions?: boolean;
}

export interface ForecastPredictionPoint {
  month: string; // 'YYYY-MM'
  predicted: number;
  lowerBound: number;
  upperBound: number;
  label?: string;
}

export interface TestPeriodPoint {
  month: string; // 'YYYY-MM'
  actual: number;
  predicted: number;
  difference: number; // predicted - actual
}

export interface CurrentMonthMtd {
  month: string; // 'YYYY-MM'
  amount: number;
  transactionCount: number;
  hasRecordedTransactions: boolean;
  isComplete: false;
  label: string;
}

export interface ModelMetrics {
  mae: number;
  rmse: number;
  mape: number | null;
  mapeObservationsUsed: number;
  mapeObservationsTotal: number;
  mapeObservationsExcluded: number;
  mapeFormatted: string;
  validationMae?: number | null;
  validationRmse?: number | null;
}

export interface ValidationMetrics {
  status: 'valid' | 'all_zero_validation' | 'insufficient_folds';
  valMae: number | null;
  valRmse: number | null;
  foldsCount: number;
  nonZeroFoldsCount?: number;
  evaluatedPeriod: string;
  message?: string;
}

export interface BaselineComparison {
  baselineModel: string;
  baselineMae: number;
  selectedModelMae: number;
  percentageImprovement: number;
  improvementLabel: string;
  isPositive: boolean;
  metricUsed: string;
}

export interface EvaluationSplitSummary {
  totalCompletedMonths: number;
  validationFoldsCount: number;
  validationPeriod: string;
  testMonths: number;
  testPeriod: string;
  zeroExpenseMonthsInTest: number;
  totalZeroExpenseMonths: number;
  selectionCriterion: string;
}

export interface ForecastResponse {
  status: 'ok' | 'insufficient_data' | 'error';
  modelUsed?: string;
  forecastHorizon?: number;
  completedMonthsCount?: number;
  minRequiredMonths?: number;
  currentMonthMtd?: CurrentMonthMtd;
  historicalActuals: ForecastActualPoint[];
  predictions?: ForecastPredictionPoint[];
  testPeriodPoints?: TestPeriodPoint[];
  evaluationMetrics?: ModelMetrics;
  validationMetrics?: ValidationMetrics;
  allModelsValidation?: Record<string, ValidationMetrics>;
  allModelsEvaluation?: Record<string, ModelMetrics>;
  baselineComparison?: BaselineComparison;
  featureImportances?: Record<string, number>;
  dataSummary?: {
    totalCompletedMonths: number;
    validationFoldsCount: number;
    testMonths: number;
    averageMonthlyExpense: number;
    latestCompletedMonthExpense: number;
    currentMonthMtdExpense: number;
    zeroExpenseMonthsCount: number;
  };
  evaluationSplitSummary?: EvaluationSplitSummary;
  message?: string;
  architecturalNotes?: string;
  engineUsed?: 'scikit-learn' | 'python-fastapi' | 'python-subprocess' | 'typescript-fallback' | string;
}

const MODEL_PRIORITY = [
  'Linear Regression',
  'Random Forest Regression',
  'Moving Average (3-Month)',
  'Naive Baseline'
];

const FALLBACK_MODEL_PRIORITY = [
  'Linear Regression (Fallback)',
  'Autoregressive Blend (Fallback)',
  'Moving Average (3-Month Fallback)',
  'Naive Baseline (Fallback)',
];

/**
 * Attempts to fetch forecast from running FastAPI microservice if explicitly configured.
 */
async function callFastApi(
  transactions: FrontendTransaction[],
  forecastHorizon: number,
  targetEnd?: [number, number],
  currentMonth?: [number, number] | string
): Promise<ForecastResponse | null> {
  const fastApiUrl = process.env.ML_SERVICE_URL;
  if (!fastApiUrl) {
    // In standard Render single-service deployment, Express directly executes forecast_engine.py
    // via subprocess. Skip polling port 8000 when ML_SERVICE_URL is not explicitly configured.
    return null;
  }

  try {
    console.log(`[FORECAST] Checking FastAPI forecasting service at ${fastApiUrl}...`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500);

    const res = await fetch(fastApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactions, forecastHorizon, targetEnd, currentMonth }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      console.log(`[FORECAST] Python service reachable (FastAPI microservice status ${res.status})`);
      const data = (await res.json()) as ForecastResponse;
      data.engineUsed = data.engineUsed || 'scikit-learn';
      console.log(`[FORECAST] Python forecast response received from FastAPI`);
      return data;
    }
    console.log(`[FORECAST] FastAPI service returned HTTP ${res.status}`);
    return null;
  } catch (err: any) {
    console.log(`[FORECAST] FastAPI service not reachable (${err?.message || 'connection failed'}) - switching to Python subprocess`);
    return null;
  }
}

/**
 * Resolves the appropriate Python binary for the current host environment
 * (Render Linux, local Windows, or custom virtualenv).
 */
function resolvePythonBinary(): { pythonBin: string; pythonHome?: string; pythonPath?: string } {
  // 1. Explicit user override via environment variable
  if (process.env.PYTHON_BIN) {
    return {
      pythonBin: process.env.PYTHON_BIN,
      pythonHome: process.env.PYTHONHOME,
      pythonPath: process.env.PYTHONPATH,
    };
  }

  // 2. Check local/virtualenv directories relative to project root
  const projectRoot = process.cwd();
  const venvPaths = [
    path.join(projectRoot, '.venv', 'bin', 'python'),
    path.join(projectRoot, '.venv', 'bin', 'python3'),
    path.join(projectRoot, '.venv', 'Scripts', 'python.exe'),
    '/opt/render/project/src/.venv/bin/python',
    '/opt/render/project/src/.venv/bin/python3',
  ];

  for (const vp of venvPaths) {
    if (fs.existsSync(vp)) {
      return { pythonBin: vp };
    }
  }

  // 3. Platform-specific resolution
  if (process.platform === 'win32') {
    const winDevPath = 'C:\\Python314\\python.exe';
    if (fs.existsSync(winDevPath)) {
      return {
        pythonBin: winDevPath,
        pythonHome: 'C:\\Users\\Jessi\\AppData\\Local\\Programs\\Python\\Python314',
        pythonPath: [
          'C:\\Users\\Jessi\\AppData\\Local\\Programs\\Python\\Python314\\Lib',
          'C:\\Users\\Jessi\\AppData\\Local\\Programs\\Python\\Python314\\Lib\\site-packages',
        ].join(path.delimiter),
      };
    }
    return { pythonBin: 'python' };
  }

  // 4. Linux / Render production resolution
  const linuxBins = [
    '/usr/bin/python3',
    '/usr/local/bin/python3',
    '/usr/bin/python',
    'python3',
    'python',
  ];

  for (const lb of linuxBins) {
    if (path.isAbsolute(lb) && fs.existsSync(lb)) {
      return { pythonBin: lb };
    }
  }

  return { pythonBin: 'python3' };
}

interface PythonVerificationResult {
  ok: boolean;
  pythonBin: string;
  missingModules?: string[];
  error?: string;
  scikitLearnVersion?: string;
  pandasVersion?: string;
  numpyVersion?: string;
}

let cachedVerification: { result: PythonVerificationResult; timestamp: number } | null = null;

/**
 * Pre-flight verification that checks if required Python libraries (numpy, pandas, sklearn)
 * can be imported into the active Python environment before invoking the forecast engine.
 */
function verifyPythonEnvironment(pythonBin: string, env: NodeJS.ProcessEnv): PythonVerificationResult {
  const now = Date.now();
  if (cachedVerification && (now - cachedVerification.timestamp < 30000)) {
    return cachedVerification.result;
  }

  const checkCode = `import sys
missing = []
for mod in ['numpy', 'pandas', 'sklearn']:
    try:
        __import__(mod)
    except ImportError:
        missing.append(mod)

if missing:
    sys.stdout.write("MISSING:" + ",".join(missing) + "\\n")
    sys.exit(1)
else:
    import numpy, pandas, sklearn
    sys.stdout.write("OK:" + str(numpy.__version__) + ":" + str(pandas.__version__) + ":" + str(sklearn.__version__) + "\\n")
`;

  try {
    const res = spawnSync(pythonBin, ['-c', checkCode], {
      env,
      timeout: 5000,
      encoding: 'utf8',
    });

    const stdout = (res.stdout || '').trim();
    const stderr = (res.stderr || '').trim();

    if (res.status === 0 && stdout.startsWith('OK:')) {
      const parts = stdout.split(':');
      const vResult: PythonVerificationResult = {
        ok: true,
        pythonBin,
        numpyVersion: parts[1],
        pandasVersion: parts[2],
        scikitLearnVersion: parts[3],
      };
      cachedVerification = { result: vResult, timestamp: now };
      return vResult;
    }

    let missingModules: string[] = [];
    if (stdout.startsWith('MISSING:')) {
      missingModules = stdout.replace('MISSING:', '').split(',');
    } else if (stderr.includes('No module named')) {
      const match = stderr.match(/No module named ['"]([^'"]+)['"]/);
      if (match) missingModules = [match[1]];
    }

    const errMessage = stderr || stdout || (res.error ? res.error.message : 'Unknown Python verification failure');
    const vResult: PythonVerificationResult = {
      ok: false,
      pythonBin,
      missingModules,
      error: errMessage,
    };
    cachedVerification = { result: vResult, timestamp: now };
    return vResult;
  } catch (err: any) {
    const vResult: PythonVerificationResult = {
      ok: false,
      pythonBin,
      error: err?.message || 'Failed to spawn Python verification process',
    };
    cachedVerification = { result: vResult, timestamp: now };
    return vResult;
  }
}

/**
 * Spawns python `ml_service/forecast_engine.py` via child process.
 */
function callPythonSubprocess(
  transactions: FrontendTransaction[],
  forecastHorizon: number,
  targetEnd?: [number, number],
  currentMonth?: [number, number] | string
): Promise<ForecastResponse | null> {
  return new Promise(resolve => {
    try {
      const { pythonBin, pythonHome, pythonPath } = resolvePythonBinary();
      const scriptPath = path.resolve(process.cwd(), 'ml_service', 'forecast_engine.py');

      if (!fs.existsSync(scriptPath)) {
        console.error(`[FORECAST ERROR] Forecast engine script not found at ${scriptPath}`);
        return resolve(null);
      }

      const env: NodeJS.ProcessEnv = { ...process.env };
      if (pythonHome) {
        env.PYTHONHOME = pythonHome;
      }

      const projectRoot = process.cwd();
      const paths = [projectRoot, path.join(projectRoot, 'ml_service')];
      if (pythonPath) {
        paths.push(pythonPath);
      }
      if (env.PYTHONPATH) {
        paths.push(env.PYTHONPATH);
      }
      env.PYTHONPATH = paths.join(path.delimiter);

      // Verify that Python and required libraries (numpy, pandas, sklearn) can be imported
      const verification = verifyPythonEnvironment(pythonBin, env);
      if (!verification.ok) {
        console.error(`[FORECAST ERROR] Python dependency check failed for interpreter '${pythonBin}':`);
        if (verification.missingModules && verification.missingModules.length > 0) {
          console.error(`[FORECAST ERROR] Missing Python modules: ${verification.missingModules.join(', ')}`);
        }
        if (verification.error) {
          console.error(`[FORECAST ERROR] Diagnostic details: ${verification.error}`);
        }
        console.error(`[FORECAST ERROR] Render Deployment Fix: In Render Dashboard -> Settings -> Build Command, update to:`);
        console.error(`[FORECAST ERROR] -> pip install -r requirements.txt && npm install && npm run build`);
        return resolve(null);
      }

      console.log(`[FORECAST] Python ML environment verified (NumPy ${verification.numpyVersion}, Pandas ${verification.pandasVersion}, Scikit-Learn ${verification.scikitLearnVersion}) using interpreter: ${pythonBin}`);
      console.log(`[FORECAST] Spawning Python scikit-learn forecasting subprocess (${pythonBin})...`);

      const proc = spawn(pythonBin, [scriptPath, '-'], { env });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', d => {
        stdout += d.toString();
      });

      proc.stderr.on('data', d => {
        const text = d.toString();
        stderr += text;
        const lines = text.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed) {
            console.log(trimmed);
          }
        }
      });

      const timer = setTimeout(() => {
        console.error('[FORECAST ERROR] Python subprocess timed out after 30000ms');
        proc.kill();
        resolve(null);
      }, 30000);

      proc.on('close', code => {
        clearTimeout(timer);
        if (code === 0 && stdout.trim()) {
          try {
            const parsed = JSON.parse(stdout) as ForecastResponse;
            parsed.engineUsed = parsed.engineUsed || 'scikit-learn';
            console.log(`[FORECAST] Python forecast response received from subprocess`);
            return resolve(parsed);
          } catch (jsonErr: any) {
            console.error('[FORECAST ERROR] Failed to parse Python subprocess JSON output:', jsonErr?.message);
            return resolve(null);
          }
        }
        if (code !== 0) {
          console.error(`[FORECAST ERROR] Python subprocess exited with code ${code}. Stderr:\n${stderr.trim()}`);
        }
        resolve(null);
      });

      proc.on('error', (err) => {
        clearTimeout(timer);
        console.error('[FORECAST ERROR] Failed to spawn Python process:', err.message);
        resolve(null);
      });

      proc.stdin.write(JSON.stringify({ transactions, forecastHorizon, targetEnd, currentMonth }));
      proc.stdin.end();
    } catch (err: any) {
      console.error('[FORECAST ERROR] Exception in callPythonSubprocess:', err?.message || err);
      resolve(null);
    }
  });
}

/**
 * Computes MAPE correctly by excluding zero-actual observations only.
 */
function calculateMapeDetailsTs(yTrue: number[], yPred: number[]): {
  mape: number | null;
  observationsUsed: number;
  observationsTotal: number;
  observationsExcluded: number;
  formatted: string;
} {
  const totalObs = yTrue.length;
  if (totalObs === 0) {
    return {
      mape: null,
      observationsUsed: 0,
      observationsTotal: 0,
      observationsExcluded: 0,
      formatted: 'N/A (no test observations)'
    };
  }

  let used = 0;
  let sumPct = 0;
  for (let i = 0; i < totalObs; i++) {
    if (Math.abs(yTrue[i]) > 1e-6) {
      used++;
      sumPct += (Math.abs(yTrue[i] - yPred[i]) / Math.abs(yTrue[i])) * 100;
    }
  }

  const excluded = totalObs - used;
  if (used === 0) {
    return {
      mape: null,
      observationsUsed: 0,
      observationsTotal: totalObs,
      observationsExcluded: excluded,
      formatted: `N/A (all ${totalObs} test months had zero expenses; MAPE undefined for zero actuals)`
    };
  }

  const mapeVal = Math.round((sumPct / used) * 100) / 100;
  const formatted = excluded > 0
    ? `${mapeVal}% error (${used} of ${totalObs} test months; ${excluded} zero-actual month${excluded > 1 ? 's' : ''} excluded)`
    : `${mapeVal}% error (${used} of ${totalObs} test months)`;

  return {
    mape: mapeVal,
    observationsUsed: used,
    observationsTotal: totalObs,
    observationsExcluded: excluded,
    formatted
  };
}

/**
 * Deterministic TypeScript regression engine matching identical scikit-learn mathematical models.
 * Used as a zero-downtime fallback.
 */
export function computeFallbackForecast(
  transactions: FrontendTransaction[],
  forecastHorizon: number = 4,
  targetEnd?: [number, number],
  currentMonth?: [number, number] | string
): ForecastResponse {
  // Resolve current calendar month (as-of date)
  let asOfY: number;
  let asOfM: number;
  if (currentMonth) {
    if (Array.isArray(currentMonth) && currentMonth.length === 2) {
      asOfY = Number(currentMonth[0]);
      asOfM = Number(currentMonth[1]);
    } else if (typeof currentMonth === 'string' && currentMonth.includes('-')) {
      const parts = currentMonth.split('-').map(Number);
      asOfY = parts[0];
      asOfM = parts[1];
    } else {
      const now = new Date();
      asOfY = now.getFullYear();
      asOfM = now.getMonth() + 1;
    }
  } else {
    const now = new Date();
    asOfY = now.getFullYear();
    asOfM = now.getMonth() + 1;
  }

  // 1. Group transactions into monthly expense totals (aligned with FinancialContext, Analytics, Dashboard)
  const monthlyExpenses = new Map<string, { year: number; month: number; amount: number; count: number }>();

  for (const tx of transactions) {
    if (tx.type !== 'expense') continue;
    if (tx.status === 'Pending' || (tx.status as any) === 'Failed' || (tx.status as any) === 'Cancelled') continue;
    const amount = Number(tx.amount);
    if (isNaN(amount) || amount <= 0) continue;

    // Parse date into YYYY-MM
    let y = 0;
    let m = 0;
    const raw = (tx.date || '').trim();

    // Standard ISO: YYYY-MM-DD
    const isoMatch = raw.match(/^(\d{4})[-/.](\d{1,2})/);
    if (isoMatch) {
      y = parseInt(isoMatch[1], 10);
      m = parseInt(isoMatch[2], 10);
    } else {
      const MONTH_MAP: Record<string, number> = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
      };
      // 1. DD Mon YYYY or DD-Mon-YYYY
      const dmy = raw.match(/^(\d{1,2})[\s\-/,]+([A-Za-z]+)[\s\-/,]+(\d{2,4})/);
      if (dmy) {
        const monStr = dmy[2].toLowerCase().slice(0, 3);
        const yRaw = parseInt(dmy[3], 10);
        y = yRaw < 100 ? 2000 + yRaw : yRaw;
        m = MONTH_MAP[monStr] || 0;
      } else {
        // 2. Mon DD, YYYY
        const mdy = raw.match(/^([A-Za-z]+)[\s\-/,]+(\d{1,2})[\s\-/,]+(\d{2,4})/);
        if (mdy) {
          const monStr = mdy[1].toLowerCase().slice(0, 3);
          const yRaw = parseInt(mdy[3], 10);
          y = yRaw < 100 ? 2000 + yRaw : yRaw;
          m = MONTH_MAP[monStr] || 0;
        } else {
          // 3. Fallback Date parsing
          const nativeDate = new Date(raw);
          if (!isNaN(nativeDate.getTime())) {
            y = nativeDate.getFullYear();
            m = nativeDate.getMonth() + 1;
          }
        }
      }
    }

    if (y > 0 && m >= 1 && m <= 12) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      const existing = monthlyExpenses.get(key) || { year: y, month: m, amount: 0, count: 0 };
      existing.amount += amount;
      existing.count += 1;
      monthlyExpenses.set(key, existing);
    }
  }

  // Extract MTD actuals for current in-progress month
  const currentKey = `${asOfY}-${String(asOfM).padStart(2, '0')}`;
  const currentMtdRecord = monthlyExpenses.get(currentKey);
  const currentMonthMtd: CurrentMonthMtd = {
    month: currentKey,
    amount: currentMtdRecord ? Math.round(currentMtdRecord.amount * 100) / 100 : 0.0,
    transactionCount: currentMtdRecord ? currentMtdRecord.count : 0,
    hasRecordedTransactions: Boolean(currentMtdRecord && currentMtdRecord.amount > 0),
    isComplete: false,
    label: `Month-to-Date (${currentKey})`,
  };

  // Filter completed months strictly prior to asOfY, asOfM
  const completedKeys = Array.from(monthlyExpenses.keys())
    .filter(k => {
      const [y, m] = k.split('-').map(Number);
      return y < asOfY || (y === asOfY && m < asOfM);
    })
    .sort();

  if (targetEnd) {
    const [tY, tM] = targetEnd;
    if (tY < asOfY || (tY === asOfY && tM < asOfM)) {
      // Capped by targetEnd
    }
  }

  if (completedKeys.length === 0) {
    return {
      status: 'insufficient_data',
      completedMonthsCount: 0,
      minRequiredMonths: 6,
      currentMonthMtd,
      historicalActuals: [],
      message: 'FinSight AI requires at least 6 completed historical months to train machine learning models and perform rolling-origin validation.',
      engineUsed: 'typescript-fallback',
    };
  }

  const [firstYStr, firstMStr] = completedKeys[0].split('-');
  const startY = parseInt(firstYStr, 10);
  const startM = parseInt(firstMStr, 10);

  let endY = asOfM === 1 ? asOfY - 1 : asOfY;
  let endM = asOfM === 1 ? 12 : asOfM - 1;

  if (targetEnd) {
    const [tY, tM] = targetEnd;
    if (tY < asOfY || (tY === asOfY && tM < asOfM)) {
      endY = tY;
      endM = tM;
    }
  }

  if (endY < startY || (endY === startY && endM < startM)) {
    const [lastYStr, lastMStr] = completedKeys[completedKeys.length - 1].split('-');
    endY = parseInt(lastYStr, 10);
    endM = parseInt(lastMStr, 10);
  }

  // Generate contiguous sequence of completed months, preserving zero-expense months
  const historicalActuals: ForecastActualPoint[] = [];
  let curY = startY;
  let curM = startM;
  while (curY < endY || (curY === endY && curM <= endM)) {
    const key = `${curY}-${String(curM).padStart(2, '0')}`;
    const item = monthlyExpenses.get(key);
    const amt = item ? item.amount : 0.0;
    historicalActuals.push({
      month: key,
      actual: Math.round(amt * 100) / 100,
      isZeroExpense: amt === 0.0,
      hasRecordedTransactions: Boolean(item && item.amount > 0),
    });
    curM++;
    if (curM > 12) {
      curM = 1;
      curY++;
    }
  }

  const numCompletedMonths = historicalActuals.length;
  const MIN_REQUIRED_MONTHS = 6;

  if (numCompletedMonths < MIN_REQUIRED_MONTHS) {
    return {
      status: 'insufficient_data',
      completedMonthsCount: numCompletedMonths,
      minRequiredMonths: MIN_REQUIRED_MONTHS,
      currentMonthMtd,
      historicalActuals,
      message: `FinSight AI requires at least ${MIN_REQUIRED_MONTHS} completed historical months to perform rolling-origin chronological validation and hold out an unseen test set (currently ${numCompletedMonths} completed months available). Current month spending is tracked separately as month-to-date actuals.`,
      engineUsed: 'typescript-fallback',
    };
  }

  // Reserve held-out test partition untouched during model selection
  const testSize = numCompletedMonths >= 12 ? 3 : (numCompletedMonths >= 8 ? 2 : 1);
  const evalSize = numCompletedMonths - testSize;
  const testStart = evalSize;
  const testEnd = numCompletedMonths;

  const series = historicalActuals.map(h => h.actual);

  // Linear Regression helper
  const fitLinear = (yArr: number[]) => {
    const n = yArr.length;
    let sumT = 0, sumY = 0, sumTY = 0, sumT2 = 0;
    for (let i = 0; i < n; i++) {
      sumT += i;
      sumY += yArr[i];
      sumTY += i * yArr[i];
      sumT2 += i * i;
    }
    const denom = (n * sumT2 - sumT * sumT) || 1;
    const slope = (n * sumTY - sumT * sumY) / denom;
    const intercept = (sumY - slope * sumT) / n;
    return { slope, intercept };
  };

  // -------------------------------------------------------------------------
  // STEP 1: ROLLING-ORIGIN CHRONOLOGICAL VALIDATION
  // -------------------------------------------------------------------------
  const minTrainWindow = Math.max(3, Math.min(6, evalSize - 2));
  const rollingFolds: number[] = [];
  for (let k = minTrainWindow; k < evalSize; k++) {
    rollingFolds.push(k);
  }

  const nonZeroFoldsCount = rollingFolds.filter(k => series[k] > 0).length;

  let bestModelName = FALLBACK_MODEL_PRIORITY[0];
  let valMaes: Record<string, number | null> = {
    'Naive Baseline (Fallback)': null,
    'Moving Average (3-Month Fallback)': null,
    'Linear Regression (Fallback)': null,
    'Autoregressive Blend (Fallback)': null,
  };
  let valRmses: Record<string, number | null> = {
    'Naive Baseline (Fallback)': null,
    'Moving Average (3-Month Fallback)': null,
    'Linear Regression (Fallback)': null,
    'Autoregressive Blend (Fallback)': null,
  };
  const allModelsValidation: Record<string, ValidationMetrics> = {};

  if (rollingFolds.length < 2) {
    const validationMessage = 'Fewer than 2 validation folds available in the evaluation period.';
    for (const mName of FALLBACK_MODEL_PRIORITY) {
      allModelsValidation[mName] = {
        status: 'insufficient_folds',
        valMae: null,
        valRmse: null,
        foldsCount: rollingFolds.length,
        nonZeroFoldsCount,
        evaluatedPeriod: rollingFolds.length > 0
          ? `${historicalActuals[rollingFolds[0]].month} to ${historicalActuals[rollingFolds[rollingFolds.length - 1]].month}`
          : 'N/A',
        message: validationMessage,
      };
    }
    bestModelName = FALLBACK_MODEL_PRIORITY[0];
  } else if (nonZeroFoldsCount === 0) {
    const validationMessage = 'All validation folds had zero expenses; validation error is uninformative for model discrimination.';
    for (const mName of FALLBACK_MODEL_PRIORITY) {
      allModelsValidation[mName] = {
        status: 'all_zero_validation',
        valMae: null,
        valRmse: null,
        foldsCount: rollingFolds.length,
        nonZeroFoldsCount: 0,
        evaluatedPeriod: `${historicalActuals[rollingFolds[0]].month} to ${historicalActuals[rollingFolds[rollingFolds.length - 1]].month}`,
        message: validationMessage,
      };
    }
    bestModelName = FALLBACK_MODEL_PRIORITY[0];
  } else {
    const foldErrorsNaive: number[] = [];
    const foldErrorsMa: number[] = [];
    const foldErrorsLr: number[] = [];
    const foldErrorsBlend: number[] = [];

    const foldSqNaive: number[] = [];
    const foldSqMa: number[] = [];
    const foldSqLr: number[] = [];
    const foldSqBlend: number[] = [];

    for (const origin of rollingFolds) {
      const yTarget = series[origin];
      const trainSlice = series.slice(0, origin);
      const { slope: fSlope, intercept: fIntercept } = fitLinear(trainSlice);

      // 1. Naive Baseline (Fallback)
      const predNaive = series[origin - 1];
      const errNaive = Math.abs(yTarget - predNaive);
      foldErrorsNaive.push(errNaive);
      foldSqNaive.push(errNaive * errNaive);

      // 2. Moving Average (Fallback)
      const window = series.slice(Math.max(0, origin - 3), origin);
      const predMa = window.reduce((a, b) => a + b, 0) / window.length;
      const errMa = Math.abs(yTarget - predMa);
      foldErrorsMa.push(errMa);
      foldSqMa.push(errMa * errMa);

      // 3. Linear Regression (Fallback)
      const predLr = Math.max(0, fIntercept + fSlope * origin);
      const errLr = Math.abs(yTarget - predLr);
      foldErrorsLr.push(errLr);
      foldSqLr.push(errLr * errLr);

      // 4. Autoregressive Blend (Fallback proxy)
      const lag1 = series[origin - 1];
      const lag2 = origin >= 2 ? series[origin - 2] : lag1;
      const predBlend = Math.max(0, 0.45 * lag1 + 0.35 * lag2 + 0.20 * (fIntercept + fSlope * origin));
      const errBlend = Math.abs(yTarget - predBlend);
      foldErrorsBlend.push(errBlend);
      foldSqBlend.push(errBlend * errBlend);
    }

    const calcMean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
    const calcRmse = (sqArr: number[]) => Math.sqrt(sqArr.reduce((a, b) => a + b, 0) / sqArr.length);

    valMaes = {
      'Linear Regression (Fallback)': calcMean(foldErrorsLr),
      'Autoregressive Blend (Fallback)': calcMean(foldErrorsBlend),
      'Moving Average (3-Month Fallback)': calcMean(foldErrorsMa),
      'Naive Baseline (Fallback)': calcMean(foldErrorsNaive),
    };

    valRmses = {
      'Linear Regression (Fallback)': calcRmse(foldSqLr),
      'Autoregressive Blend (Fallback)': calcRmse(foldSqBlend),
      'Moving Average (3-Month Fallback)': calcRmse(foldSqMa),
      'Naive Baseline (Fallback)': calcRmse(foldSqNaive),
    };

    // Model Selection Rule among Fallback Algorithms:
    const sortedModels = Object.keys(valMaes).sort((a, b) => {
      const diffMae = Math.round((valMaes[a] ?? 0) * 10000) - Math.round((valMaes[b] ?? 0) * 10000);
      if (diffMae !== 0) return diffMae;
      const diffRmse = Math.round((valRmses[a] ?? 0) * 10000) - Math.round((valRmses[b] ?? 0) * 10000);
      if (diffRmse !== 0) return diffRmse;
      return FALLBACK_MODEL_PRIORITY.indexOf(a) - FALLBACK_MODEL_PRIORITY.indexOf(b);
    });
    bestModelName = sortedModels[0];

    for (const mName of FALLBACK_MODEL_PRIORITY) {
      allModelsValidation[mName] = {
        status: 'valid',
        valMae: Math.round((valMaes[mName] ?? 0) * 100) / 100,
        valRmse: Math.round((valRmses[mName] ?? 0) * 100) / 100,
        foldsCount: rollingFolds.length,
        nonZeroFoldsCount,
        evaluatedPeriod: `${historicalActuals[rollingFolds[0]].month} to ${historicalActuals[rollingFolds[rollingFolds.length - 1]].month}`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // STEP 2: HELD-OUT TEST EVALUATION
  // -------------------------------------------------------------------------
  const yTest = series.slice(testStart, testEnd);
  const preTestSlice = series.slice(0, evalSize);
  const { slope: preTestSlope, intercept: preTestIntercept } = fitLinear(preTestSlice);

  const testNaivePreds = series.slice(testStart - 1, testEnd - 1);
  const testMaPreds: number[] = [];
  for (let i = testStart; i < testEnd; i++) {
    const window = series.slice(Math.max(0, i - 3), i);
    testMaPreds.push(window.reduce((a, b) => a + b, 0) / window.length);
  }
  const testLrPreds: number[] = [];
  for (let i = testStart; i < testEnd; i++) {
    testLrPreds.push(Math.max(0, preTestIntercept + preTestSlope * i));
  }
  const testBlendPreds: number[] = [];
  for (let i = testStart; i < testEnd; i++) {
    const lag1 = series[i - 1];
    const lag2 = i >= 2 ? series[i - 2] : lag1;
    const trend = preTestSlope * i + preTestIntercept;
    testBlendPreds.push(Math.max(0, 0.45 * lag1 + 0.35 * lag2 + 0.20 * trend));
  }

  const calcTestMetrics = (preds: number[], modelKey: string): ModelMetrics => {
    let sumAbs = 0;
    let sumSq = 0;
    for (let i = 0; i < yTest.length; i++) {
      const err = yTest[i] - preds[i];
      sumAbs += Math.abs(err);
      sumSq += err * err;
    }
    const n = yTest.length;
    const mapeDetails = calculateMapeDetailsTs(yTest, preds);

    return {
      mae: Math.round((sumAbs / n) * 100) / 100,
      rmse: Math.round(Math.sqrt(sumSq / n) * 100) / 100,
      mape: mapeDetails.mape,
      mapeObservationsUsed: mapeDetails.observationsUsed,
      mapeObservationsTotal: mapeDetails.observationsTotal,
      mapeObservationsExcluded: mapeDetails.observationsExcluded,
      mapeFormatted: mapeDetails.formatted,
      validationMae: valMaes[modelKey] !== null ? Math.round(valMaes[modelKey]! * 100) / 100 : null,
      validationRmse: valRmses[modelKey] !== null ? Math.round(valRmses[modelKey]! * 100) / 100 : null,
    };
  };

  const allModels: Record<string, ModelMetrics> = {
    'Naive Baseline (Fallback)': calcTestMetrics(testNaivePreds, 'Naive Baseline (Fallback)'),
    'Moving Average (3-Month Fallback)': calcTestMetrics(testMaPreds, 'Moving Average (3-Month Fallback)'),
    'Linear Regression (Fallback)': calcTestMetrics(testLrPreds, 'Linear Regression (Fallback)'),
    'Autoregressive Blend (Fallback)': calcTestMetrics(testBlendPreds, 'Autoregressive Blend (Fallback)'),
  };

  const bestMetrics = allModels[bestModelName];

  const selectedTestPreds =
    bestModelName === 'Naive Baseline (Fallback)' ? testNaivePreds :
    bestModelName === 'Moving Average (3-Month Fallback)' ? testMaPreds :
    bestModelName === 'Linear Regression (Fallback)' ? testLrPreds : testBlendPreds;

  const testPeriodPoints: TestPeriodPoint[] = [];
  for (let i = 0; i < yTest.length; i++) {
    const mIdx = testStart + i;
    const actualVal = Math.round(yTest[i] * 100) / 100;
    const predVal = Math.round(selectedTestPreds[i] * 100) / 100;
    testPeriodPoints.push({
      month: historicalActuals[mIdx].month,
      actual: actualVal,
      predicted: predVal,
      difference: Math.round((predVal - actualVal) * 100) / 100,
    });
  }

  // Baseline comparison improvement calculation using MAE
  const baselineMae = allModels['Naive Baseline (Fallback)'].mae;
  const selectedModelMae = bestMetrics.mae;
  let pctImprovement = 0.0;
  let improvementLabel = '';

  if (baselineMae === 0.0) {
    if (selectedModelMae === 0.0) {
      pctImprovement = 0.0;
      improvementLabel = '0.0% (both baseline and model have 0 error)';
    } else {
      pctImprovement = -100.0;
      improvementLabel = 'Model has positive error while baseline has 0 error';
    }
  } else {
    pctImprovement = Math.round(((baselineMae - selectedModelMae) / baselineMae) * 1000) / 10;
    if (pctImprovement > 0) {
      improvementLabel = `+${pctImprovement}% lower error than Naive Baseline`;
    } else if (pctImprovement < 0) {
      improvementLabel = `${pctImprovement}% higher error than Naive Baseline (Model underperformed baseline)`;
    } else {
      improvementLabel = '0.0% (identical error to Naive Baseline)';
    }
  }

  // -------------------------------------------------------------------------
  // STEP 3: FULL RETRAINING & MULTI-STEP FORWARD PREDICTIONS
  // -------------------------------------------------------------------------
  const { slope: fullSlope, intercept: fullIntercept } = fitLinear(series);

  // Residual std error
  let resSumSq = 0;
  for (let i = 0; i < numCompletedMonths; i++) {
    const fitted = fullIntercept + fullSlope * i;
    resSumSq += Math.pow(series[i] - fitted, 2);
  }
  const sigmaResid = Math.sqrt(resSumSq / Math.max(1, numCompletedMonths - 2)) || 500;

  // Multi-step forward predictions start AFTER the latest completed month
  // Step 1 corresponds to current in-progress month (e.g. November 2026 full-month projection)
  const predictions: ForecastPredictionPoint[] = [];
  const [finalYStr, finalMStr] = historicalActuals[historicalActuals.length - 1].month.split('-');
  let fY = parseInt(finalYStr, 10);
  let fM = parseInt(finalMStr, 10);
  const futureSeries = [...series];

  for (let step = 1; step <= forecastHorizon; step++) {
    fM += 1;
    if (fM > 12) {
      fM = 1;
      fY += 1;
    }
    const ymStr = `${fY}-${String(fM).padStart(2, '0')}`;
    const tIdx = numCompletedMonths + step - 1;

    let predVal = 0;
    if (bestModelName === 'Linear Regression (Fallback)') {
      predVal = fullIntercept + fullSlope * tIdx;
    } else if (bestModelName === 'Moving Average (3-Month Fallback)') {
      const window = futureSeries.slice(-3);
      predVal = window.reduce((a, b) => a + b, 0) / window.length;
    } else if (bestModelName === 'Autoregressive Blend (Fallback)') {
      const lag1 = futureSeries[futureSeries.length - 1];
      const lag2 = futureSeries[futureSeries.length - 2] || lag1;
      predVal = 0.5 * lag1 + 0.3 * lag2 + 0.2 * (fullIntercept + fullSlope * tIdx);
    } else {
      predVal = futureSeries[futureSeries.length - 1];
    }

    predVal = Math.round(Math.max(0, predVal) * 100) / 100;
    futureSeries.push(predVal);

    const margin = Math.round(1.96 * sigmaResid * Math.sqrt(step) * 100) / 100;
    predictions.push({
      month: ymStr,
      predicted: predVal,
      lowerBound: Math.max(0, Math.round((predVal - margin) * 100) / 100),
      upperBound: Math.round((predVal + margin) * 100) / 100,
      label: `${ymStr} (Forecast)`,
    });
  }

  const zeroExpenseMonthsCount = historicalActuals.filter(h => h.actual === 0).length;
  const zeroExpenseInTest = yTest.filter(v => v === 0).length;

  return {
    status: 'ok',
    modelUsed: bestModelName,
    forecastHorizon,
    completedMonthsCount: numCompletedMonths,
    currentMonthMtd,
    historicalActuals,
    predictions,
    testPeriodPoints,
    evaluationMetrics: bestMetrics,
    validationMetrics: allModelsValidation[bestModelName],
    allModelsValidation,
    allModelsEvaluation: allModels,
    baselineComparison: {
      baselineModel: 'Naive Baseline (Fallback)',
      baselineMae,
      selectedModelMae,
      percentageImprovement: pctImprovement,
      improvementLabel,
      isPositive: pctImprovement > 0,
      metricUsed: 'MAE',
    },
    featureImportances: {},
    dataSummary: {
      totalCompletedMonths: numCompletedMonths,
      validationFoldsCount: rollingFolds.length,
      testMonths: testSize,
      averageMonthlyExpense: Math.round((series.reduce((a, b) => a + b, 0) / numCompletedMonths) * 100) / 100,
      latestCompletedMonthExpense: series[series.length - 1],
      currentMonthMtdExpense: currentMonthMtd.amount,
      zeroExpenseMonthsCount,
    },
    evaluationSplitSummary: {
      totalCompletedMonths: numCompletedMonths,
      validationFoldsCount: rollingFolds.length,
      validationPeriod: `${historicalActuals[rollingFolds[0]].month} to ${historicalActuals[rollingFolds[rollingFolds.length - 1]].month}`,
      testMonths: testSize,
      testPeriod: `${historicalActuals[testStart].month} to ${historicalActuals[testEnd - 1].month}`,
      zeroExpenseMonthsInTest: zeroExpenseInTest,
      totalZeroExpenseMonths: zeroExpenseMonthsCount,
      selectionCriterion: 'Rolling-origin chronological validation average MAE (test set held out strictly for final evaluation)',
    },
    message: 'Notice: Python Scikit-learn environment was unavailable on host; forecast was generated via TypeScript mathematical fallback. Install Python dependencies (numpy, pandas, scikit-learn) to enable genuine Scikit-learn Random Forest forecasting.',
    architecturalNotes:
      'TypeScript Mathematical Fallback: Heuristic lag-trend regression executed in Node.js because the Python Scikit-learn environment was unavailable. Deploy with Python dependencies to run genuine RandomForestRegressor.',
    engineUsed: 'typescript-fallback',
  };
}

/**
 * Executes the full machine learning expense forecasting pipeline.
 */
export async function generateUserForecast(
  transactions: FrontendTransaction[],
  forecastHorizon: number = 4,
  targetEnd?: [number, number],
  currentMonth?: [number, number] | string
): Promise<ForecastResponse> {
  console.log(`[FORECAST] Initiating forecast pipeline for ${transactions.length} user transactions...`);

  // Tier 1: Try Python FastAPI service if running
  const apiResult = await callFastApi(transactions, forecastHorizon, targetEnd, currentMonth);
  if (apiResult) {
    console.log(`[FORECAST] Python forecast response received (FastAPI, status: ${apiResult.status}, modelUsed: ${apiResult.modelUsed})`);
    console.log(`[FORECAST] Engine used: ${apiResult.engineUsed}`);
    console.log(`[FORECAST] TypeScript fallback: NOT USED`);
    return apiResult;
  }

  // Tier 2: Try Python subprocess directly with scikit-learn
  const subprocessResult = await callPythonSubprocess(transactions, forecastHorizon, targetEnd, currentMonth);
  if (subprocessResult) {
    console.log(`[FORECAST] Python forecast response received (Subprocess, status: ${subprocessResult.status}, modelUsed: ${subprocessResult.modelUsed})`);
    console.log(`[FORECAST] Engine used: ${subprocessResult.engineUsed}`);
    console.log(`[FORECAST] TypeScript fallback: NOT USED`);
    return subprocessResult;
  }

  // Tier 3: High-availability mathematical TypeScript fallback
  console.warn(`[FORECAST] TypeScript fallback: INVOKED (Python FastAPI and subprocess were unavailable)`);
  const fallbackResult = computeFallbackForecast(transactions, forecastHorizon, targetEnd, currentMonth);
  console.log(`[FORECAST] Engine used: ${fallbackResult.engineUsed}`);
  return fallbackResult;
}
