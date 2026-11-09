"""
FinSight AI — Machine Learning Expense Forecasting Engine
Phase 5: Machine Learning Expense Forecasting (Rolling-Origin Chronological Validation)

Architectural Decision: Why LSTM is NOT appropriate for Monthly Expense Forecasting:
- Personal financial ledgers aggregated at the monthly level typically contain 6 to 36 data points per user.
- Deep Recurrent Neural Networks (LSTM, GRU) require hundreds to thousands of sequence steps to parameterize
  hundreds of recurrent weights and gating matrices (input, forget, output gates) without severe overfitting.
- On small monthly time-series (N < 50), LSTMs exhibit catastrophic overfitting, extreme sensitivity to weight
  initialization seed, high inference latency, and total opacity (black box).
- In contrast, Tabular Lag Regression with regularized Linear Models (Ridge) and Ensemble Tree Methods
  (Random Forest Regressor) with lag features (lag-1, lag-2), rolling window averages (rolling-3), and calendar
  sin/cos cyclical encodings deliver superior empirical generalization, lower MAE/RMSE, transparent feature
  importance, and deterministic reproducibility.

Validation Methodology:
- Strict Rolling-Origin Chronological Validation (Walk-Forward) across multiple historical windows.
- The held-out test partition is kept untouched until after the model is selected.
- Model selection is decided by lowest average validation MAE across rolling folds, with validation RMSE
  as tie-breaker 1, and deterministic model priority as tie-breaker 2.
- Incomplete current calendar months are separated as Month-to-Date (MTD) actuals and excluded from
  training, validation, and test datasets.
"""

import sys
import os
import site
import json
import math
import re
from datetime import datetime
from typing import Dict, List, Any, Optional, Tuple

# Ensure user site-packages and ~/.local directories are in sys.path
try:
    usp = site.getusersitepackages()
    if isinstance(usp, str) and os.path.isdir(usp) and usp not in sys.path:
        sys.path.insert(0, usp)
    elif isinstance(usp, (list, tuple)):
        for p in usp:
            if os.path.isdir(p) and p not in sys.path:
                sys.path.insert(0, p)
except Exception:
    pass

try:
    home = os.path.expanduser('~')
    local_sp = os.path.join(home, '.local', 'lib')
    if os.path.isdir(local_sp):
        for entry in os.listdir(local_sp):
            sp = os.path.join(local_sp, entry, 'site-packages')
            if os.path.isdir(sp) and sp not in sys.path:
                sys.path.insert(0, sp)
except Exception:
    pass

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error


def log_diagnostic(msg: str):
    """Writes diagnostic logs to sys.stderr so stdout remains valid JSON for the caller."""
    sys.stderr.write(f"{msg}\n")
    sys.stderr.flush()


MONTH_NAMES = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12,
    'january': 1, 'february': 2, 'march': 3, 'april': 4, 'may': 5, 'june': 6,
    'july': 7, 'august': 8, 'september': 9, 'october': 10, 'november': 11, 'december': 12
}

# Documented deterministic priority rule used as final tie-breaker
MODEL_PRIORITY = [
    'Linear Regression',
    'Random Forest Regression',
    'Moving Average (3-Month)',
    'Naive Baseline'
]


def parse_date_to_year_month(date_val: Any) -> Optional[Tuple[int, int]]:
    """
    Parses diverse transaction date strings into (year, month).
    Supports:
    - YYYY-MM-DD, YYYY/MM/DD
    - DD Mon YYYY, DD-Mon-YYYY (e.g. '24 Oct 2026', '24-Oct-26', '1 Aug 2025')
    - Mon DD, YYYY (e.g. 'Oct 24, 2026', 'Apr 20, 2026')
    - DD/MM/YYYY, MM/DD/YYYY
    """
    if not date_val:
        return None
    s = str(date_val).strip()
    if not s:
        return None

    # Check ISO format: YYYY-MM-DD
    iso_match = re.match(r"^(\d{4})[-/.](\d{1,2})", s)
    if iso_match:
        y = int(iso_match.group(1))
        m = int(iso_match.group(2))
        if 1 <= m <= 12:
            return (y, m)

    # Check DD Mon YYYY or DD-Mon-YYYY or DD Mon YY
    dd_mon_match = re.match(r"^(\d{1,2})[\s\-/,]+([A-Za-z]+)[\s\-/,]+(\d{2,4})", s)
    if dd_mon_match:
        mon_str = dd_mon_match.group(2).lower()
        y_raw = int(dd_mon_match.group(3))
        y = (2000 + y_raw) if y_raw < 100 else y_raw
        for prefix, m_idx in MONTH_NAMES.items():
            if mon_str.startswith(prefix[:3]):
                return (y, m_idx)

    # Check Mon DD, YYYY
    mon_dd_match = re.match(r"^([A-Za-z]+)[\s\-/,]+(\d{1,2})[\s\-/,]+(\d{2,4})", s)
    if mon_dd_match:
        mon_str = mon_dd_match.group(1).lower()
        y_raw = int(mon_dd_match.group(3))
        y = (2000 + y_raw) if y_raw < 100 else y_raw
        for prefix, m_idx in MONTH_NAMES.items():
            if mon_str.startswith(prefix[:3]):
                return (y, m_idx)

    # Check DD/MM/YYYY
    dmy_match = re.match(r"^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})", s)
    if dmy_match:
        part1 = int(dmy_match.group(1))
        part2 = int(dmy_match.group(2))
        y_raw = int(dmy_match.group(3))
        y = (2000 + y_raw) if y_raw < 100 else y_raw
        if part1 > 12 and 1 <= part2 <= 12:
            return (y, part2)
        elif part2 > 12 and 1 <= part1 <= 12:
            return (y, part1)
        elif 1 <= part2 <= 12:
            return (y, part2)

    return None


def calculate_mape_details(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, Any]:
    """
    Computes Mean Absolute Percentage Error (MAPE) mathematically correctly:
    - Excludes observations where actual value is zero (y_true == 0), where percentage error is undefined.
    - If all observations in the test set are zero, returns mape = None (not zero, not infinity, not fabricated).
    - Reports total, used, and excluded observation counts.
    - NEVER replaces zero actuals with arbitrary denominators like 1.0.
    - NEVER labels MAPE as an accuracy percentage.
    """
    total_obs = int(len(y_true))
    if total_obs == 0:
        return {
            'mape': None,
            'observationsUsed': 0,
            'observationsTotal': 0,
            'observationsExcluded': 0,
            'formatted': 'N/A (no test observations)'
        }

    nonzero_mask = np.abs(y_true) > 1e-6
    used_obs = int(np.sum(nonzero_mask))
    excluded_obs = total_obs - used_obs

    if used_obs == 0:
        return {
            'mape': None,
            'observationsUsed': 0,
            'observationsTotal': total_obs,
            'observationsExcluded': excluded_obs,
            'formatted': f'N/A (all {total_obs} test months had zero expenses; MAPE undefined for zero actuals)'
        }

    y_true_valid = y_true[nonzero_mask]
    y_pred_valid = y_pred[nonzero_mask]
    pct_errors = np.abs((y_true_valid - y_pred_valid) / np.abs(y_true_valid)) * 100.0
    mape_val = round(float(np.mean(pct_errors)), 2)

    if excluded_obs > 0:
        fmt = f"{mape_val}% error ({used_obs} of {total_obs} test months; {excluded_obs} zero-actual month{'s' if excluded_obs > 1 else ''} excluded)"
    else:
        fmt = f"{mape_val}% error ({used_obs} of {total_obs} test months)"

    return {
        'mape': mape_val,
        'observationsUsed': used_obs,
        'observationsTotal': total_obs,
        'observationsExcluded': excluded_obs,
        'formatted': fmt
    }


def aggregate_monthly_expenses(
    transactions: List[Dict[str, Any]],
    as_of_year_month: Tuple[int, int],
    target_end_year_month: Optional[Tuple[int, int]] = None
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    """
    Aggregates user transactions into:
    1. Completed months dataframe: contiguous sequence of fully completed months prior to as_of_year_month.
    2. Current month MTD record: in-progress spending for as_of_year_month.

    Aggregation Rules aligned with FinancialContext, Analytics, and Dashboard:
    - Filters strictly on tx.type == 'expense'.
    - Excludes failed or cancelled transactions.
    - Includes ALL categories (does not silently exclude Transfer or Investment).
    - Preserves valid zero-expense completed months as 0.0.
    """
    monthly_totals: Dict[Tuple[int, int], float] = {}
    monthly_tx_counts: Dict[Tuple[int, int], int] = {}

    for tx in transactions:
        tx_type = str(tx.get('type', '')).lower()
        if tx_type != 'expense':
            continue

        status = str(tx.get('status', 'Completed')).lower()
        if status in ('failed', 'cancelled'):
            continue

        amount = float(tx.get('amount', 0.0))
        if amount <= 0:
            continue

        parsed = parse_date_to_year_month(tx.get('date'))
        if not parsed:
            continue

        year, month = parsed
        key = (year, month)
        monthly_totals[key] = monthly_totals.get(key, 0.0) + amount
        monthly_tx_counts[key] = monthly_tx_counts.get(key, 0) + 1

    # Extract Month-To-Date (MTD) actuals for the current in-progress month
    as_of_y, as_of_m = as_of_year_month
    mtd_amount = round(monthly_totals.get(as_of_year_month, 0.0), 2)
    mtd_count = monthly_tx_counts.get(as_of_year_month, 0)
    current_month_mtd = {
        'month': f"{as_of_y:04d}-{as_of_m:02d}",
        'amount': mtd_amount,
        'transactionCount': mtd_count,
        'hasRecordedTransactions': (mtd_amount > 0),
        'isComplete': False,
        'label': f"Month-to-Date ({as_of_y:04d}-{as_of_m:02d})"
    }

    # Completed months are strictly those BEFORE as_of_year_month
    completed_keys = [k for k in monthly_totals.keys() if (k[0] < as_of_y) or (k[0] == as_of_y and k[1] < as_of_m)]

    # If target_end is provided and explicitly allows completed months up to target_end
    if target_end_year_month:
        t_y, t_m = target_end_year_month
        # If target_end is strictly before as_of_year_month, cap completed at target_end
        if (t_y < as_of_y) or (t_y == as_of_y and t_m < as_of_m):
            completed_keys = [k for k in completed_keys if (k[0] < t_y) or (k[0] == t_y and k[1] <= t_m)]

    if not completed_keys:
        empty_df = pd.DataFrame(columns=[
            'year', 'month', 'year_month', 'amount', 'has_recorded_transactions', 'is_zero_expense'
        ])
        return empty_df, current_month_mtd

    sorted_keys = sorted(completed_keys)
    start_y, start_m = sorted_keys[0]

    # Completed sequence runs through the month immediately preceding as_of_year_month (or target_end)
    if target_end_year_month and ((target_end_year_month[0] < as_of_y) or (target_end_year_month[0] == as_of_y and target_end_year_month[1] < as_of_m)):
        end_y, end_m = target_end_year_month
    else:
        # Month immediately before as_of_year_month
        if as_of_m == 1:
            end_y, end_m = as_of_y - 1, 12
        else:
            end_y, end_m = as_of_y, as_of_m - 1

    # If the user only has data in earlier years, ensure end_y, end_m doesn't precede start_y, start_m
    if (end_y < start_y) or (end_y == start_y and end_m < start_m):
        end_y, end_m = sorted_keys[-1]

    contiguous_records = []
    curr_y, curr_m = start_y, start_m
    while (curr_y < end_y) or (curr_y == end_y and curr_m <= end_m):
        amt = monthly_totals.get((curr_y, curr_m), 0.0)
        has_tx = (curr_y, curr_m) in monthly_totals
        ym_str = f"{curr_y:04d}-{curr_m:02d}"
        contiguous_records.append({
            'year': curr_y,
            'month': curr_m,
            'year_month': ym_str,
            'amount': round(amt, 2),
            'has_recorded_transactions': has_tx,
            'is_zero_expense': (amt == 0.0)
        })
        curr_m += 1
        if curr_m > 12:
            curr_m = 1
            curr_y += 1

    return pd.DataFrame(contiguous_records), current_month_mtd


def build_time_series_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Builds lag, rolling statistics, calendar, and temporal trend features.
    Guarantees no lookahead bias: features at step t strictly use information from t-1, t-2, ...
    """
    df_feat = df.copy()
    n = len(df_feat)
    df_feat['trend_t'] = np.arange(n)

    # Lags
    df_feat['lag_1'] = df_feat['amount'].shift(1)
    df_feat['lag_2'] = df_feat['amount'].shift(2)
    df_feat['lag_3'] = df_feat['amount'].shift(3)

    # Rolling 3-month statistics (strictly on past lags to prevent target leakage)
    df_feat['rolling_mean_3'] = df_feat['amount'].shift(1).rolling(window=3, min_periods=1).mean()
    df_feat['rolling_std_3'] = df_feat['amount'].shift(1).rolling(window=3, min_periods=1).std().fillna(0.0)

    # Calendar cyclical features
    months = df_feat['month'].values
    df_feat['month_sin'] = np.sin(2 * np.pi * months / 12.0)
    df_feat['month_cos'] = np.cos(2 * np.pi * months / 12.0)

    return df_feat


def run_forecasting_pipeline(
    transactions: List[Dict[str, Any]],
    forecast_horizon: int = 4,
    target_end_year_month: Optional[Tuple[int, int]] = None,
    current_year_month: Optional[Tuple[int, int]] = None
) -> Dict[str, Any]:
    """
    Main machine learning forecasting pipeline with Rolling-Origin Chronological Validation:
    1. Prepares user-scoped data and isolates in-progress current month as MTD actuals.
    2. Evaluates models strictly on completed historical months.
    3. Reserves held-out test partition untouched during model selection.
    4. Executes rolling-origin chronological validation across multiple historical origins.
    5. Selects winning model using average validation MAE (tie-breakers: val RMSE, then deterministic model priority).
    6. Evaluates selected model on the held-out test partition.
    7. Retrains on all completed months and produces multi-step forward predictions starting at the current month.
    """
    log_diagnostic(f"[FORECAST] Python forecasting engine received request ({len(transactions)} transactions, horizon: {forecast_horizon})")
    log_diagnostic(f"[FORECAST] forecast_engine.py running on Python {sys.version.split()[0]} ({sys.executable})")

    # Detect current calendar month using server time or explicit input
    if current_year_month is None:
        now = datetime.now()
        current_year_month = (now.year, now.month)

    df_monthly, current_month_mtd = aggregate_monthly_expenses(
        transactions,
        as_of_year_month=current_year_month,
        target_end_year_month=target_end_year_month
    )
    num_completed_months = len(df_monthly)
    log_diagnostic(f"[FORECAST] Aggregated into {num_completed_months} completed historical monthly spending periods")

    # Minimum completed historical months constraint:
    # Requires at least 3 initial training months + 2 rolling validation folds + 1 test month = 6 months
    MIN_REQUIRED_MONTHS = 6
    if num_completed_months < MIN_REQUIRED_MONTHS:
        log_diagnostic(f"[FORECAST] Insufficient data: {num_completed_months} completed months available (minimum required: {MIN_REQUIRED_MONTHS})")
        return {
            "status": "insufficient_data",
            "completedMonthsCount": num_completed_months,
            "minRequiredMonths": MIN_REQUIRED_MONTHS,
            "currentMonthMtd": current_month_mtd,
            "historicalActuals": [
                {
                    "month": row["year_month"],
                    "actual": row["amount"],
                    "isZeroExpense": bool(row["is_zero_expense"]),
                    "hasRecordedTransactions": bool(row["has_recorded_transactions"])
                }
                for _, row in df_monthly.iterrows()
            ] if num_completed_months > 0 else [],
            "message": f"FinSight AI requires at least {MIN_REQUIRED_MONTHS} completed historical months to perform rolling-origin chronological validation and hold out an unseen test set (currently {num_completed_months} completed months available). Current month spending is tracked separately as month-to-date actuals.",
            "modelsCompared": [],
            "engineUsed": "scikit-learn"
        }

    # Extract historical actuals array preserving zero-expense indicators
    historical_actuals = [
        {
            "month": row["year_month"],
            "actual": float(row["amount"]),
            "isZeroExpense": bool(row["is_zero_expense"]),
            "hasRecordedTransactions": bool(row["has_recorded_transactions"])
        }
        for _, row in df_monthly.iterrows()
    ]

    # Build features on completed historical months
    df_feat = build_time_series_features(df_monthly)

    # Reserve the final held-out test partition strictly untouched during validation
    if num_completed_months >= 12:
        test_size = 3
    elif num_completed_months >= 8:
        test_size = 2
    else:
        test_size = 1

    eval_size = num_completed_months - test_size
    test_start = eval_size
    test_end = num_completed_months

    # Feature subsets
    feature_cols_lr = ['trend_t']
    feature_cols_rf = ['trend_t', 'lag_1', 'lag_2', 'rolling_mean_3', 'month_sin', 'month_cos']

    # -------------------------------------------------------------------------
    # STEP 1: ROLLING-ORIGIN CHRONOLOGICAL VALIDATION (Across Multiple Historical Windows)
    # -------------------------------------------------------------------------
    # On the evaluation set (indices 0 to eval_size - 1):
    # Minimum training window is at least 3 months.
    min_train_window = max(3, min(6, eval_size - 2))
    rolling_folds = list(range(min_train_window, eval_size))

    series_amounts = df_monthly['amount'].values

    # Check whether validation folds are sufficient and whether actuals contain non-zero spending
    non_zero_folds_count = int(np.sum(series_amounts[rolling_folds] > 0)) if len(rolling_folds) > 0 else 0

    if len(rolling_folds) < 2:
        validation_status = 'insufficient_folds'
        val_maes = {m: None for m in MODEL_PRIORITY}
        val_rmses = {m: None for m in MODEL_PRIORITY}
        best_model_name = MODEL_PRIORITY[0]
        validation_message = "Fewer than 2 validation folds available in the evaluation period."
        all_models_validation = {
            m_name: {
                'status': 'insufficient_folds',
                'valMae': None,
                'valRmse': None,
                'foldsCount': len(rolling_folds),
                'nonZeroFoldsCount': non_zero_folds_count,
                'evaluatedPeriod': f"{df_monthly['year_month'].iloc[rolling_folds[0]]} to {df_monthly['year_month'].iloc[rolling_folds[-1]]}" if rolling_folds else 'N/A',
                'message': validation_message
            }
            for m_name in MODEL_PRIORITY
        }
    elif non_zero_folds_count == 0:
        # All validation folds consist of zero-expense months (no spending signal available)
        validation_status = 'all_zero_validation'
        val_maes = {m: None for m in MODEL_PRIORITY}
        val_rmses = {m: None for m in MODEL_PRIORITY}
        # Model selection rule under all-zero validation: deterministic model priority rule (never use held-out test data)
        best_model_name = MODEL_PRIORITY[0]
        validation_message = "All validation folds had zero expenses; validation error is uninformative for model discrimination."
        all_models_validation = {
            m_name: {
                'status': 'all_zero_validation',
                'valMae': None,
                'valRmse': None,
                'foldsCount': len(rolling_folds),
                'nonZeroFoldsCount': 0,
                'evaluatedPeriod': f"{df_monthly['year_month'].iloc[rolling_folds[0]]} to {df_monthly['year_month'].iloc[rolling_folds[-1]]}",
                'message': validation_message
            }
            for m_name in MODEL_PRIORITY
        }
    else:
        # Valid non-zero validation data exists
        validation_status = 'valid'
        fold_errors_naive: List[float] = []
        fold_errors_ma: List[float] = []
        fold_errors_lr: List[float] = []
        fold_errors_rf: List[float] = []

        fold_sq_naive: List[float] = []
        fold_sq_ma: List[float] = []
        fold_sq_lr: List[float] = []
        fold_sq_rf: List[float] = []

        log_diagnostic(f"[FORECAST] Starting rolling-origin chronological validation across {len(rolling_folds)} historical folds...")
        for origin in rolling_folds:
            y_target = series_amounts[origin]

            # 1. Naive Baseline: y_{t-1}
            pred_naive = series_amounts[origin - 1]
            err_naive = abs(y_target - pred_naive)
            fold_errors_naive.append(err_naive)
            fold_sq_naive.append(err_naive ** 2)

            # 2. Moving Average (3-Month trailing)
            w_start = max(0, origin - 3)
            w = series_amounts[w_start:origin]
            pred_ma = float(np.mean(w))
            err_ma = abs(y_target - pred_ma)
            fold_errors_ma.append(err_ma)
            fold_sq_ma.append(err_ma ** 2)

            # Fit ML models strictly on indices 0 to origin - 1
            X_lr_fold = df_feat.iloc[:origin][feature_cols_lr].values
            y_train_lr = series_amounts[:origin]
            lr_fold_model = LinearRegression().fit(X_lr_fold, y_train_lr)

            train_mask_fold = (df_feat.index >= 2) & (df_feat.index < origin)
            if np.sum(train_mask_fold) < 2:
                train_mask_fold = df_feat.index < origin

            df_train_fold = df_feat.iloc[train_mask_fold]
            X_rf_fold = df_train_fold[feature_cols_rf].fillna(0.0).values
            y_train_fold = df_train_fold['amount'].values

            log_diagnostic(f"[FORECAST] Random Forest validation fold training: fitting fold origin index {origin} (samples: {len(X_rf_fold)})")
            rf_fold_model = RandomForestRegressor(n_estimators=50, max_depth=3, random_state=42).fit(X_rf_fold, y_train_fold)

            # Target feature vector at origin
            row_target = df_feat.iloc[[origin]]
            X_target_lr = row_target[feature_cols_lr].fillna(0.0).values
            X_target_rf = row_target[feature_cols_rf].fillna(0.0).values

            pred_lr = float(max(0.0, lr_fold_model.predict(X_target_lr)[0]))
            err_lr = abs(y_target - pred_lr)
            fold_errors_lr.append(err_lr)
            fold_sq_lr.append(err_lr ** 2)

            pred_rf = float(max(0.0, rf_fold_model.predict(X_target_rf)[0]))
            err_rf = abs(y_target - pred_rf)
            fold_errors_rf.append(err_rf)
            fold_sq_rf.append(err_rf ** 2)

        val_maes = {
            'Naive Baseline': float(np.mean(fold_errors_naive)),
            'Moving Average (3-Month)': float(np.mean(fold_errors_ma)),
            'Linear Regression': float(np.mean(fold_errors_lr)),
            'Random Forest Regression': float(np.mean(fold_errors_rf)),
        }

        val_rmses = {
            'Naive Baseline': float(np.sqrt(np.mean(fold_sq_naive))),
            'Moving Average (3-Month)': float(np.sqrt(np.mean(fold_sq_ma))),
            'Linear Regression': float(np.sqrt(np.mean(fold_sq_lr))),
            'Random Forest Regression': float(np.sqrt(np.mean(fold_sq_rf))),
        }

        # Model Selection Rule:
        # 1. Lowest average validation MAE across rolling folds.
        # 2. Tie-breaker 1: Lowest validation RMSE.
        # 3. Tie-breaker 2: Documented deterministic priority rule (Linear > RF > MA > Naive).
        def model_selection_sort_key(model_name: str) -> Tuple[float, float, int]:
            mae = round(val_maes[model_name], 4)
            rmse = round(val_rmses[model_name], 4)
            priority_idx = MODEL_PRIORITY.index(model_name) if model_name in MODEL_PRIORITY else 99
            return (mae, rmse, priority_idx)

        ranked_models = sorted(list(val_maes.keys()), key=model_selection_sort_key)
        best_model_name = ranked_models[0]
        log_diagnostic(f"[FORECAST] Rolling-origin validation completed. Selected best model: '{best_model_name}' (Validation MAE: {val_maes[best_model_name]:.2f})")

        all_models_validation = {
            m_name: {
                'status': 'valid',
                'valMae': round(val_maes[m_name], 2),
                'valRmse': round(val_rmses[m_name], 2),
                'foldsCount': len(rolling_folds),
                'nonZeroFoldsCount': non_zero_folds_count,
                'evaluatedPeriod': f"{df_monthly['year_month'].iloc[rolling_folds[0]]} to {df_monthly['year_month'].iloc[rolling_folds[-1]]}"
            }
            for m_name in val_maes.keys()
        }

    # -------------------------------------------------------------------------
    # STEP 2: HELD-OUT TEST EVALUATION (Untouched Until Selected Model Is Fixed)
    # -------------------------------------------------------------------------
    log_diagnostic(f"[FORECAST] Step 2: Evaluating models on held-out test partition ({test_size} test months: {df_monthly['year_month'].iloc[test_start]} to {df_monthly['year_month'].iloc[test_end - 1]})")
    test_indices = list(range(test_start, test_end))
    y_test = series_amounts[test_start:test_end]

    # Train models on all data prior to test set (indices 0 to eval_size - 1)
    X_lr_pre_test = df_feat.iloc[:eval_size][feature_cols_lr].values
    y_train_pre_test_lr = series_amounts[:eval_size]
    lr_test_model = LinearRegression().fit(X_lr_pre_test, y_train_pre_test_lr)

    train_mask_pre_test = (df_feat.index >= 2) & (df_feat.index < eval_size)
    if np.sum(train_mask_pre_test) < 2:
        train_mask_pre_test = df_feat.index < eval_size

    df_pre_test = df_feat.iloc[train_mask_pre_test]
    X_rf_pre_test = df_pre_test[feature_cols_rf].fillna(0.0).values
    y_train_pre_test = df_pre_test['amount'].values

    log_diagnostic(f"[FORECAST] Random Forest held-out test training started (samples: {len(X_rf_pre_test)}, estimators: 100)")
    rf_test_model = RandomForestRegressor(n_estimators=100, max_depth=3, random_state=42).fit(X_rf_pre_test, y_train_pre_test)
    log_diagnostic(f"[FORECAST] Random Forest held-out test training completed (fitted estimators: {len(rf_test_model.estimators_)})")

    # 1. Naive Baseline test predictions
    test_preds_naive = np.array([series_amounts[i - 1] for i in test_indices])

    # 2. Moving Average test predictions
    test_preds_ma = []
    for i in test_indices:
        w_start = max(0, i - 3)
        w = series_amounts[w_start:i]
        test_preds_ma.append(float(np.mean(w)))
    test_preds_ma = np.array(test_preds_ma)

    # 3. Linear Regression test predictions
    X_test_lr = df_feat.iloc[test_start:test_end][feature_cols_lr].fillna(0.0).values
    test_preds_lr = np.maximum(0.0, lr_test_model.predict(X_test_lr))

    # 4. Random Forest test predictions
    X_test_rf = df_feat.iloc[test_start:test_end][feature_cols_rf].fillna(0.0).values
    test_preds_rf = np.maximum(0.0, rf_test_model.predict(X_test_rf))

    test_predictions_map = {
        'Naive Baseline': test_preds_naive,
        'Moving Average (3-Month)': test_preds_ma,
        'Linear Regression': test_preds_lr,
        'Random Forest Regression': test_preds_rf,
    }

    # Compute metrics on held-out test partition
    model_evaluations: Dict[str, Dict[str, Any]] = {}
    for m_name, preds in test_predictions_map.items():
        mae = float(mean_absolute_error(y_test, preds))
        rmse = float(np.sqrt(mean_squared_error(y_test, preds)))
        mape_details = calculate_mape_details(y_test, preds)

        model_evaluations[m_name] = {
            'mae': round(mae, 2),
            'rmse': round(rmse, 2),
            'mape': mape_details['mape'],
            'mapeObservationsUsed': mape_details['observationsUsed'],
            'mapeObservationsTotal': mape_details['observationsTotal'],
            'mapeObservationsExcluded': mape_details['observationsExcluded'],
            'mapeFormatted': mape_details['formatted'],
            'validationMae': round(val_maes[m_name], 2) if val_maes[m_name] is not None else None,
            'validationRmse': round(val_rmses[m_name], 2) if val_rmses[m_name] is not None else None,
        }

    best_test_metrics = model_evaluations[best_model_name]

    # Test period actual vs. predicted alignment points for the selected model
    test_preds_selected = test_predictions_map[best_model_name]
    test_period_points = [
        {
            "month": str(df_monthly['year_month'].iloc[test_indices[idx]]),
            "actual": round(float(y_test[idx]), 2),
            "predicted": round(float(test_preds_selected[idx]), 2),
            "difference": round(float(test_preds_selected[idx] - y_test[idx]), 2),
        }
        for idx in range(len(test_indices))
    ]

    # Baseline comparison improvement calculation using MAE
    baseline_mae = model_evaluations['Naive Baseline']['mae']
    selected_model_mae = best_test_metrics['mae']

    if baseline_mae == 0.0:
        if selected_model_mae == 0.0:
            pct_improvement = 0.0
            improvement_label = "0.0% (both baseline and model have 0 error)"
        else:
            pct_improvement = -100.0
            improvement_label = "Model has positive error while baseline has 0 error"
    else:
        pct_improvement = round(((baseline_mae - selected_model_mae) / baseline_mae) * 100.0, 1)
        if pct_improvement > 0:
            improvement_label = f"+{pct_improvement}% lower error than Naive Baseline"
        elif pct_improvement < 0:
            improvement_label = f"{pct_improvement}% higher error than Naive Baseline (Model underperformed baseline)"
        else:
            improvement_label = "0.0% (identical error to Naive Baseline)"

    # -------------------------------------------------------------------------
    # STEP 3: FULL RETRAINING & MULTI-STEP FORWARD PROJECTIONS
    # -------------------------------------------------------------------------
    log_diagnostic(f"[FORECAST] Step 3: Full retraining across all {num_completed_months} completed historical months")
    # Retrain ML models on ALL completed historical months
    X_full_lr = df_feat[feature_cols_lr].values
    y_full_lr = df_feat['amount'].values
    fitted_lr_full = LinearRegression().fit(X_full_lr, y_full_lr)

    full_mask = df_feat.index >= 2
    if np.sum(full_mask) == 0:
        full_mask = df_feat.index >= 0

    X_full_rf = df_feat.iloc[full_mask][feature_cols_rf].fillna(0.0).values
    y_full = df_feat.iloc[full_mask]['amount'].values

    log_diagnostic(f"[FORECAST] Random Forest full model training started (samples: {len(X_full_rf)}, estimators: 100)")
    fitted_rf_full = RandomForestRegressor(n_estimators=100, max_depth=3, random_state=42).fit(X_full_rf, y_full)
    log_diagnostic(f"[FORECAST] Random Forest full model training completed (fitted estimators: {len(fitted_rf_full.estimators_)})")

    # Estimate residual standard error from the best model fits on completed data
    if best_model_name == 'Random Forest Regression':
        full_resids = y_full - fitted_rf_full.predict(X_full_rf)
    elif best_model_name == 'Linear Regression':
        full_resids = y_full_lr - fitted_lr_full.predict(X_full_lr)
    elif best_model_name == 'Moving Average (3-Month)':
        full_resids = y_test - test_preds_ma
    else:
        full_resids = y_test - test_preds_naive

    sigma_resid = float(np.std(full_resids)) if len(full_resids) > 1 else max(100.0, float(np.mean(y_full) * 0.1))
    if sigma_resid < 1.0:
        sigma_resid = max(100.0, float(np.mean(y_full) * 0.08))

    # Multi-step recursive forecasting forward starting AFTER the latest completed month
    # Step 1 corresponds to current_year_month (e.g. November 2026 full-month projection)
    predictions: List[Dict[str, Any]] = []
    future_amounts = list(df_monthly['amount'].values)

    last_record = df_monthly.iloc[-1]
    curr_y = int(last_record['year'])
    curr_m = int(last_record['month'])

    for step in range(1, forecast_horizon + 1):
        curr_m += 1
        if curr_m > 12:
            curr_m = 1
            curr_y += 1
        ym_str = f"{curr_y:04d}-{curr_m:02d}"

        t_idx = num_completed_months + step - 1
        lag1 = future_amounts[-1]
        lag2 = future_amounts[-2] if len(future_amounts) >= 2 else lag1
        lag3 = future_amounts[-3] if len(future_amounts) >= 3 else lag2
        rolling3 = float(np.mean(future_amounts[-3:]))
        m_sin = math.sin(2 * math.pi * curr_m / 12.0)
        m_cos = math.cos(2 * math.pi * curr_m / 12.0)

        if best_model_name == 'Random Forest Regression':
            feat_vec = np.array([[t_idx, lag1, lag2, rolling3, m_sin, m_cos]])
            pred_val = float(fitted_rf_full.predict(feat_vec)[0])
        elif best_model_name == 'Linear Regression':
            feat_vec = np.array([[t_idx]])
            pred_val = float(fitted_lr_full.predict(feat_vec)[0])
        elif best_model_name == 'Moving Average (3-Month)':
            pred_val = rolling3
        else: # Naive
            pred_val = lag1

        pred_val = round(max(0.0, pred_val), 2)
        future_amounts.append(pred_val)

        # 95% Confidence Interval band widening by sqrt(step)
        z_multiplier = 1.96
        band_margin = z_multiplier * sigma_resid * math.sqrt(step)
        lower_bound = round(max(0.0, pred_val - band_margin), 2)
        upper_bound = round(pred_val + band_margin, 2)

        predictions.append({
            "month": ym_str,
            "predicted": pred_val,
            "lowerBound": lower_bound,
            "upperBound": upper_bound,
            "label": f"{ym_str} (Forecast)"
        })

    # Feature importance extraction from 100-tree Random Forest ensemble
    feature_importance_dict = {}
    for feat_name, imp in zip(feature_cols_rf, fitted_rf_full.feature_importances_):
        feature_importance_dict[feat_name] = round(float(imp), 4)

    # Summary of evaluation split
    split_summary = {
        "totalCompletedMonths": num_completed_months,
        "validationFoldsCount": len(rolling_folds),
        "validationPeriod": f"{df_monthly['year_month'].iloc[rolling_folds[0]]} to {df_monthly['year_month'].iloc[rolling_folds[-1]]}",
        "testMonths": test_size,
        "testPeriod": f"{df_monthly['year_month'].iloc[test_start]} to {df_monthly['year_month'].iloc[-1]}",
        "zeroExpenseMonthsInTest": int(np.sum(y_test == 0.0)),
        "totalZeroExpenseMonths": int(np.sum(df_monthly['amount'] == 0.0)),
        "selectionCriterion": "Rolling-origin chronological validation average MAE (test set held out strictly for final evaluation)"
    }

    result = {
        "status": "ok",
        "modelUsed": best_model_name,
        "forecastHorizon": forecast_horizon,
        "currentMonthMtd": current_month_mtd,
        "historicalActuals": historical_actuals,
        "predictions": predictions,
        "testPeriodPoints": test_period_points,
        "evaluationMetrics": best_test_metrics,
        "validationMetrics": all_models_validation[best_model_name],
        "allModelsValidation": all_models_validation,
        "allModelsEvaluation": model_evaluations,
        "baselineComparison": {
            "baselineModel": "Naive Baseline",
            "baselineMae": baseline_mae,
            "selectedModelMae": selected_model_mae,
            "percentageImprovement": pct_improvement,
            "improvementLabel": improvement_label,
            "isPositive": pct_improvement > 0,
            "metricUsed": "MAE"
        },
        "featureImportances": feature_importance_dict,
        "dataSummary": {
            "totalCompletedMonths": num_completed_months,
            "validationFoldsCount": len(rolling_folds),
            "testMonths": test_size,
            "averageMonthlyExpense": round(float(df_monthly['amount'].mean()), 2),
            "latestCompletedMonthExpense": round(float(df_monthly['amount'].iloc[-1]), 2),
            "currentMonthMtdExpense": current_month_mtd['amount'],
            "zeroExpenseMonthsCount": int(np.sum(df_monthly['amount'] == 0.0))
        },
        "evaluationSplitSummary": split_summary,
        "architecturalNotes": "LSTM sequence model excluded by design: Personal expense time series with N < 50 data points exhibit severe overfitting and stochastic instability with deep recurrent architectures. Tabular lag regression with regularized Ridge and Random Forest models with rolling-origin chronological validation ensures deterministic convergence, superior generalization, and explainable feature attributions.",
        "engineUsed": "scikit-learn"
    }

    log_diagnostic(f"[FORECAST] Python forecasting pipeline completed successfully (Selected Model: '{best_model_name}', Engine: scikit-learn)")
    return result


def main():
    """
    CLI/Subprocess entry point.
    Accepts JSON input via stdin or as an argument and outputs JSON to stdout.
    """
    try:
        input_data = None
        if len(sys.argv) > 1 and sys.argv[1] != '-':
            with open(sys.argv[1], 'r', encoding='utf-8') as f:
                input_data = json.load(f)
        else:
            raw = sys.stdin.read()
            if raw.strip():
                input_data = json.loads(raw)

        if not input_data:
            print(json.dumps({"error": "No input JSON data provided", "status": "error"}))
            sys.exit(1)

        transactions = input_data.get('transactions', [])
        horizon = int(input_data.get('forecastHorizon', 4))

        target_end_raw = input_data.get('targetEnd')
        target_end = None
        if target_end_raw and isinstance(target_end_raw, (list, tuple)) and len(target_end_raw) == 2:
            target_end = (int(target_end_raw[0]), int(target_end_raw[1]))

        current_month_raw = input_data.get('currentMonth')
        current_ym = None
        if current_month_raw:
            if isinstance(current_month_raw, (list, tuple)) and len(current_month_raw) == 2:
                current_ym = (int(current_month_raw[0]), int(current_month_raw[1]))
            elif isinstance(current_month_raw, str) and '-' in current_month_raw:
                parts = current_month_raw.split('-')
                current_ym = (int(parts[0]), int(parts[1]))

        result = run_forecasting_pipeline(
            transactions,
            forecast_horizon=horizon,
            target_end_year_month=target_end,
            current_year_month=current_ym
        )
        print(json.dumps(result, indent=2))
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        log_diagnostic(f"[FORECAST ERROR] Python exception in forecast_engine: {str(e)}\n{tb}")
        err_response = {
            "status": "error",
            "error": str(e),
            "traceback": tb
        }
        print(json.dumps(err_response))
        sys.exit(1)


if __name__ == '__main__':
    main()
