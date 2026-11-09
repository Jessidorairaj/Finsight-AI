# FinSight AI — Final-Year Project Review Verification Report

**Project Title:** FinSight AI — Intelligent Financial Expense Forecasting & Analytical Advisory Platform  
**Evaluation Focus:** Machine Learning Pipeline, Statistical Anomaly Detection, Dataset Integrity, and Expanding Window Progression  
**Execution Environment:** Node.js / Express Backend + PostgreSQL (Neon Cloud) + Python 3.14 Scikit-Learn Engine  
**Execution Timestamp:** 2026-11-09T14:46:59+05:30  
**Test Suite File:** [`server/testFinalYearReviewVerification.ts`](file:///c:/Users/Jessi/Downloads/finsight-ai%20(2)/server/testFinalYearReviewVerification.ts)  
**Overall Result:** **23 / 23 Tests PASSED (100% Pass Rate)**

---

## Executive Summary

This document presents the formal technical verification of four core machine learning and analytical features of FinSight AI, conducted prior to the final-year engineering project review.

To ensure strict data integrity and academic authenticity:
1. **Zero Production Contamination:** All tests operated exclusively on ephemeral, cryptographically isolated test accounts generated during the test run (`test_user_a_*`, `test_user_b_*`, `test_user_c_*`, `test_user_d_*`).
2. **PostgreSQL Relational Verification:** Real SQL queries (`SELECT COUNT(*) WHERE user_id = $1`, `bulkInsertTransactions`, and `DELETE`) were executed against the live PostgreSQL database.
3. **Automated Teardown:** 100% of test entities (58 transactions and 4 test accounts) were completely purged upon execution completion. No real user transactions were modified, fabricated, or exposed.

---

## Summary of Verification Results

| Test Category | Focus Area | Test Cases | Passed | Failed | Compliance |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Test 1** | **Statistical Anomaly Detection (IQR Engine)** | 7 | 7 | 0 | 100% |
| **Test 2** | **Dataset Statistics & PostgreSQL Isolation** | 6 | 6 | 0 | 100% |
| **Test 3** | **Six-Month Minimum Historical Threshold** | 5 | 5 | 0 | 100% |
| **Test 4** | **Expanding Training Window & Temporal Causality** | 5 | 5 | 0 | 100% |
| **Total** | **Comprehensive Pre-Review Test Suite** | **23** | **23** | **0** | **100%** |

---

## Detailed Test Case Audit Report

### Test 1: Statistical Anomaly Detection Engine

Evaluates non-parametric rolling historical median and Interquartile Range (IQR) analytics for expenditure spike detection:
$$\text{IQR} = Q_3 - Q_1, \quad \text{Upper Bound} = Q_3 + 1.5 \times \text{IQR}$$

#### [TC-AD-01] Evaluate Normal Historical Spending Without Spikes
- **Category:** Anomaly Detection
- **Description:** Verifies that steady, predictable monthly expenses across standard categories produce zero false alerts.
- **Input Data:** 6 completed historical months (May–Oct 2026) with steady ~₹20,000 monthly spend (Food: ₹8,000, Housing: ₹12,000).
- **Expected Result:** `totalAnomaliesCount = 0`, `highestSeverity = "none"`, `status = "ok"`
- **Actual Result:** `totalAnomaliesCount = 0`, `highestSeverity = "none"`, `status = "ok"`
- **Status:** **PASS**
- **Evidence:** `{"count": 0, "highestSeverity": "none", "status": "ok"}`

#### [TC-AD-02] Detect Sudden Increase in Monthly Total Expenditure
- **Category:** Anomaly Detection
- **Description:** Verifies that a massive surge in total monthly spending is flagged with appropriate severity and textual justification.
- **Input Data:** Baseline monthly median ₹20,100; October 2026 spend surges to ₹85,150 (+323%) due to emergency healthcare.
- **Expected Result:** `type = "total_spending_spike"`, `severity = "critical"` or `"high"`, `actualAmount = 85150`, `diffAmount > 60000`
- **Actual Result:** `type = "total_spending_spike"`, `severity = "critical"`, `actualAmount = ₹85,150`, `diff = ₹65,050 (+323.6%)`
- **Status:** **PASS**
- **Evidence:** `"Total spending reached ₹85,150 in 2026-10, which is ₹65,050 (+323.6%) above your personal median of ₹20,100, exceeding the statistical upper bound of ₹23,288 (Q3 + 1.5×IQR)."`

#### [TC-AD-03] Detect Sudden Category-Wise Spending Surge (Food & Dining)
- **Category:** Anomaly Detection
- **Description:** Verifies that an isolated surge in a specific expense category is correctly isolated without requiring an overall budget failure.
- **Input Data:** Food & Dining baseline median ~₹8,075; October 2026 surges to ₹23,150.
- **Expected Result:** `type = "category_unusual_spend"`, `category = "Food & Dining"`, `actualAmount = 23150`, `diffPercentage > 150%`
- **Actual Result:** `category = "Food & Dining"`, `actualAmount = ₹23,150`, `baseline = ₹8,075`, `diff = +186.7%`, `severity = "high"`
- **Status:** **PASS**
- **Evidence:** `"Food & Dining spending surged to ₹23,150 in 2026-10, which is ₹15,075 (+186.7%) higher than your historical median of ₹8,075, surpassing the normal threshold of ₹8,338 (Q3 + 1.5×IQR)."`

#### [TC-AD-04] Verify Statistical IQR Computation (Q1, Median, Q3, IQR)
- **Category:** Anomaly Detection
- **Description:** Verifies mathematical precision of linear interpolation percentile computation against manual statistical proof.
- **Input Data:** Sorted sample array `[10000, 12000, 14000, 16000, 18000, 20000]`
- **Expected Result:** $Q_1 = 12500$, $\text{Median} = 15000$, $Q_3 = 17500$, $\text{IQR} = 5000$
- **Actual Result:** $Q_1 = 12500$, $\text{Median} = 15000$, $Q_3 = 17500$, $\text{IQR} = 5000$
- **Status:** **PASS**
- **Evidence:** `IQR = Q3 - Q1 = 17500 - 12500 = 5000; Upper threshold = 17500 + 1.5*(5000) = 25000`

#### [TC-AD-05] False-Positive Suppression for Small Monetary Variations
- **Category:** Anomaly Detection
- **Description:** Verifies that minor variations below safety buffers ($\Delta < ₹500$ overall or $< ₹300$ per category) are not flagged.
- **Input Data:** Steady baseline ₹1,000; latest month ₹1,200 ($\Delta = +₹200$).
- **Expected Result:** `0` anomalies detected (suppressed by minimum monetary threshold).
- **Actual Result:** `0` anomalies detected.
- **Status:** **PASS**
- **Evidence:** `{"anomaliesCount": 0}` (Correctly suppressed frivolous alerts).

#### [TC-AD-06] Handle Insufficient Historical Data (< 3 Completed Months)
- **Category:** Anomaly Detection
- **Description:** Verifies graceful handling when the user history has fewer than 3 completed months for statistical IQR estimation.
- **Input Data:** 2 completed historical months (September and October 2026).
- **Expected Result:** `status = "insufficient_data"`, `completedMonthsCount = 2`, `anomalies = []`
- **Actual Result:** `status = "insufficient_data"`, `completedMonthsCount = 2`, `anomaliesCount = 0`
- **Status:** **PASS**
- **Evidence:** `"At least 3 completed historical months are required for statistical IQR anomaly detection. Currently 2 completed month(s) available."`

#### [TC-AD-07] Authenticated User Isolation in PostgreSQL
- **Category:** Anomaly Detection
- **Description:** Confirms that User A's large anomalies never leak or contaminate User B's analytical state.
- **Input Data:** User A with ₹85,150 spike vs. User B with ₹20,000 normal spending inserted into live PostgreSQL.
- **Expected Result:** User A anomalies $> 0$, User B anomalies $= 0$, completely independent evaluation.
- **Actual Result:** User A anomalies $= 2$ (highest: `critical`), User B anomalies $= 0$.
- **Status:** **PASS**
- **Evidence:** `User A (usr_...): 2 anomalies detected | User B (usr_...): 0 anomalies detected. Strict WHERE user_id = $1 isolation verified.`

---

### Test 2: Dataset Statistics & PostgreSQL Verification

Verifies alignment between PostgreSQL transaction storage, feature vectors, and frontend contract models:

#### [TC-DS-01] Verify Total Transaction Count Matches PostgreSQL Database Query
- **Category:** Dataset Statistics
- **Description:** Verifies that `datasetStats.totalTransactionRecords` matches `SELECT COUNT(*)` on PostgreSQL.
- **Input Data:** `SELECT COUNT(*) FROM transactions WHERE user_id = $1` on Test User C.
- **Expected Result:** `totalTransactionRecords = 26`
- **Actual Result:** `getAllTransactions loaded = 26, DB count = 26`
- **Status:** **PASS**
- **Evidence:** `PostgreSQL rows: 26, repository returned: 26`

#### [TC-DS-02] Verify Completed Monthly Aggregates Count
- **Category:** Dataset Statistics
- **Description:** Verifies grouping of transactions into calendar month buckets strictly prior to the current month.
- **Input Data:** 8 completed months (March 2026 to October 2026).
- **Expected Result:** `completedMonthlyRecords = 8`, `completedMonthsCount = 8`
- **Actual Result:** `completedMonthlyRecords = 8`, `completedMonthsCount = 8`
- **Status:** **PASS**
- **Evidence:** `Months: 2026-03, 2026-04, 2026-05, 2026-06, 2026-07, 2026-08, 2026-09, 2026-10`

#### [TC-DS-03] Current-Month MTD Transaction Count and Amount Isolation
- **Category:** Dataset Statistics
- **Description:** Ensures ongoing month transactions are captured as Month-to-Date (MTD) actuals without leaking into completed historical actuals.
- **Input Data:** 2 transactions in November 2026: ₹350 + ₹850 = ₹1,200.
- **Expected Result:** `currentMonthTransactionCount = 2`, `currentMonthMtdAmount = 1200`, `isComplete = false`
- **Actual Result:** `currentMonthTransactionCount = 2`, `currentMonthMtdAmount = 1200`, `isComplete = false`
- **Status:** **PASS**
- **Evidence:** `{"month": "2026-11", "amount": 1200, "transactionCount": 2, "hasRecordedTransactions": true, "isComplete": false}`

#### [TC-DS-04] Training Samples, Validation Folds, and Held-Out Test Partition
- **Category:** Dataset Statistics
- **Description:** Verifies statistical train/val/test partitioning for rolling-origin evaluation.
- **Input Data:** 8 completed monthly periods.
- **Expected Result:** `trainingRecordsCount = 6`, `heldOutTestMonths = 2`, `validationFoldsCount >= 2`
- **Actual Result:** `trainingRecordsCount = 6`, `heldOutTestMonths = 2`, `validationFoldsCount = 2`
- **Status:** **PASS**
- **Evidence:** `Evaluation splits: Train = 6, Test = 2, Folds = 2`

#### [TC-DS-05] Tenant Isolation of Dataset Statistics
- **Category:** Dataset Statistics
- **Description:** Confirms statistics metadata verifies row-level ownership and user isolation.
- **Input Data:** Test User C vs. all database records.
- **Expected Result:** `userScoped = true`, `tenantIsolationVerified = true`, `totalTransactionRecords = 26`
- **Actual Result:** `userScoped = true`, `tenantIsolationVerified = true`, `total = 26`
- **Status:** **PASS**
- **Evidence:** `WHERE user_id = $1 filter verified on PostgreSQL connection pool`

#### [TC-DS-06] API Payload Dashboard Contract Validation
- **Category:** Dataset Statistics
- **Description:** Verifies all frontend contracts expected by `Forecast.tsx` and `Dashboard.tsx` are present in API output.
- **Input Data:** Full JSON response from `generateUserForecast`.
- **Expected Result:** Contains `datasetStats`, `expandingWindow`, `anomalies`, `predictions[4]`, `evaluationMetrics`.
- **Actual Result:** All required dashboard contracts present.
- **Status:** **PASS**
- **Evidence:** `predictions: 4 steps, dataSummary: complete, expandingWindow: verified`

---

### Test 3: Six-Month Minimum Historical Threshold

Verifies strict rejection of under-determined time series ($< 6$ completed months) and enablement at $\ge 6$ completed months:

#### [TC-SM-01] Test User with 3 Completed Months
- **Category:** Six-Month Minimum
- **Description:** Verifies rejection of 3 completed months.
- **Input Data:** 3 completed months: 2026-01 to 2026-03 (as-of 2026-04).
- **Expected Result:** `status = "insufficient_data"`, `completedMonthsCount = 3`, `minRequiredMonths = 6`
- **Actual Result:** `status = "insufficient_data"`, `completedMonthsCount = 3`, `minRequiredMonths = 6`
- **Status:** **PASS**
- **Evidence:** `"FinSight AI requires at least 6 completed historical months to perform rolling-origin chronological validation and hold out an unseen test set (currently 3 completed months available)."`

#### [TC-SM-02] Test User with 5 Completed Months
- **Category:** Six-Month Minimum
- **Description:** Verifies rejection of 5 completed months.
- **Input Data:** 5 completed months: 2026-01 to 2026-05 (as-of 2026-06).
- **Expected Result:** `status = "insufficient_data"`, `completedMonthsCount = 5`, `minRequiredMonths = 6`
- **Actual Result:** `status = "insufficient_data"`, `completedMonthsCount = 5`, `minRequiredMonths = 6`
- **Status:** **PASS**
- **Evidence:** `"FinSight AI requires at least 6 completed historical months to perform rolling-origin chronological validation and hold out an unseen test set (currently 5 completed months available)."`

#### [TC-SM-03] Incomplete Ongoing Month Excluded from 6-Month Count
- **Category:** Six-Month Minimum
- **Description:** Verifies that transactions in the current ongoing month (MTD) do NOT count as a completed month.
- **Input Data:** 5 completed months + 1 transaction in ongoing month 2026-06 (as-of 2026-06).
- **Expected Result:** `status = "insufficient_data"`, `completedMonthsCount = 5`, `currentMonthMtd.amount = 450`
- **Actual Result:** `status = "insufficient_data"`, `completedMonthsCount = 5`, `MTD = ₹450`
- **Status:** **PASS**
- **Evidence:** `Incomplete month 2026-06 strictly isolated as MTD; completed count remains 5`

#### [TC-SM-04] Test User with Exactly 6 Completed Months
- **Category:** Six-Month Minimum
- **Description:** Verifies full eligibility when threshold of 6 completed months is met.
- **Input Data:** 6 completed months: 2026-01 to 2026-06 (as-of 2026-07).
- **Expected Result:** `status = "ok"`, `completedMonthsCount = 6`, `predictions.length = 4`
- **Actual Result:** `status = "ok"`, `completedMonthsCount = 6`, `predictions = 4 steps`
- **Status:** **PASS**
- **Evidence:** `Model: Linear Regression, Validation folds: 2, Test set: 1 month`

#### [TC-SM-05] Test User with 7 Completed Months
- **Category:** Six-Month Minimum
- **Description:** Verifies full eligibility with 7 completed months.
- **Input Data:** 7 completed months: 2026-01 to 2026-07 (as-of 2026-08).
- **Expected Result:** `status = "ok"`, `completedMonthsCount = 7`, `predictions.length = 4`
- **Actual Result:** `status = "ok"`, `completedMonthsCount = 7`, `predictions = 4 steps`
- **Status:** **PASS**
- **Evidence:** `Model: Linear Regression, Validation folds: 2, Test set: 1 month`

---

### Test 4: Expanding Training Window Progression

Verifies that adding newly completed months expands the training horizon without sliding-window data loss or future-data leakage:

#### [TC-EW-01] Step 1: Initial Forecast with 6 Completed Monthly Periods
- **Category:** Expanding Training Window
- **Description:** Runs baseline forecast on 6 completed historical months.
- **Input Data:** 6 completed months: 2026-01 to 2026-06, as-of month: 2026-07.
- **Expected Result:** `completedMonthsCount = 6`, `historicalActuals = 6`, next prediction target $= 2026-07$
- **Actual Result:** `completedMonthsCount = 6`, `historical = 6`, next target $= 2026-07$
- **Status:** **PASS**
- **Evidence:** `History: 2026-01 -> 2026-06, Target 1: 2026-07`

#### [TC-EW-02] Step 2 & 3: Retain All 7 Historical Periods Without Data Loss
- **Category:** Expanding Training Window
- **Description:** Adds month 7 to the database and re-runs; verifies all 7 periods are retained without sliding-window truncation.
- **Input Data:** Database updated with 7th month (2026-07, ₹26,000); as-of month advanced to 2026-08.
- **Expected Result:** `completedMonthsCount = 7`, `historicalActuals = 7`, `retainsAllHistoricalData = true`
- **Actual Result:** `completedMonthsCount = 7`, `historical = 7`, `retainsAll = true`
- **Status:** **PASS**
- **Evidence:** `Periods retained: 2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06, 2026-07`

#### [TC-EW-03] Step 4: Incorporate Newly Completed Month into Next Training Cycle
- **Category:** Expanding Training Window
- **Description:** Verifies that the new month is actively used in the subsequent training and validation cycle.
- **Input Data:** Comparison between 6-month cycle vs. 7-month cycle.
- **Expected Result:** `completedMonthlyRecords` expands from 6 to 7.
- **Actual Result:** `completedMonthlyRecords = 7`, validation folds: $2 \rightarrow 2$ (with expanded training window).
- **Status:** **PASS**
- **Evidence:** `"Months 1–6 → Baseline origin fitted; Expanding window sequentially incorporates Months 7–7 for continuous retraining without discarding historical records."`

#### [TC-EW-04] Step 5: Chronological Target Progression
- **Category:** Expanding Training Window
- **Description:** Verifies that the prediction horizon target advances chronologically to the next calendar month.
- **Input Data:** 6-month forecast target vs. 7-month forecast target.
- **Expected Result:** Prediction step 1 advances from 2026-07 to 2026-08.
- **Actual Result:** `Target before = 2026-07, Target after = 2026-08`
- **Status:** **PASS**
- **Evidence:** `Target 1 advanced chronologically from 2026-07 to 2026-08`

#### [TC-EW-05] Step 6: Confirm Absence of Future-Data Leakage
- **Category:** Expanding Training Window
- **Description:** Confirms strict temporal separation between training data, held-out test data, and forward prediction horizons.
- **Input Data:** Completed months: 2026-01 to 2026-07; Forecast horizon: 2026-08 to 2026-11.
- **Expected Result:** Zero overlap between historical training/test splits and forward predictions; strictly ordered temporal causality.
- **Actual Result:** Strict temporal ordering verified with zero lookahead leakage.
- **Status:** **PASS**
- **Evidence:** `Historical: [2026-01, 2026-02, 2026-03, 2026-04, 2026-05, 2026-06, 2026-07] | Future Forecast: [2026-08, 2026-09, 2026-10, 2026-11]`

---

## Production Teardown & Cleanliness Audit

```text
--- Cleaning Up Automated Test Fixtures from PostgreSQL ---
[CLEANUP] Deleted 58 isolated test transactions.
[CLEANUP] Deleted 4 isolated test user accounts.
```
- **Integrity Guarantee:** Zero test rows remain in the PostgreSQL database.
- **Production Safety:** Real user records and transactions were unaffected.
