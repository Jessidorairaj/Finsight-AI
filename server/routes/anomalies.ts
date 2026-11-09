/**
 * FinSight AI — Expense Anomaly Detection Router
 * Strictly evaluates authenticated user's own transaction ledger.
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getAllTransactions } from '../repositories/transactionRepository.js';
import { detectExpenseAnomalies } from '../services/anomalyDetectionService.js';

export const anomalyRouter = Router();

// Enforce authentication on all anomaly routes
anomalyRouter.use(requireAuth);

/**
 * GET /api/anomalies
 * Evaluates spending anomalies using rolling historical median and IQR.
 */
anomalyRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user?.id || user?.userId;
    if (!userId) {
      res.status(401).json({ status: 'error', message: 'User authentication required.' });
      return;
    }

    const currentMonthQuery = typeof req.query.currentMonth === 'string' && /^\d{4}-\d{2}$/.test(req.query.currentMonth)
      ? req.query.currentMonth
      : undefined;

    console.log(`[ANOMALY] Running anomaly detection for user ${userId}...`);
    const transactions = await getAllTransactions(userId, 5000);
    console.log(`[ANOMALY] Loaded ${transactions.length} personal transactions for anomaly evaluation`);

    const result = detectExpenseAnomalies(transactions, currentMonthQuery);
    console.log(`[ANOMALY] Evaluation complete: ${result.anomalies.length} anomalies detected (highest severity: ${result.highestSeverity})`);

    res.json(result);
  } catch (error: any) {
    console.error('[Anomaly Route Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error?.message || 'Failed to detect expenditure anomalies.',
    });
  }
});

