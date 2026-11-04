/**
 * FinSight AI — ML Forecast Router
 * Phase 5: Machine Learning Expense Forecasting
 */

import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getAllTransactions } from '../repositories/transactionRepository.js';
import { generateUserForecast } from '../services/mlForecastService.js';

export const forecastRouter = Router();

// Enforce authentication on all forecast endpoints
forecastRouter.use(requireAuth);

forecastRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'authenticated-user-scoped');
  next();
});

/**
 * GET /api/forecast
 * Computes machine learning expense forecast strictly for the authenticated user.
 */
forecastRouter.get('/', async (req: Request, res: Response) => {
  try {
    const user = (req as any).user;
    const userId = user?.id || user?.userId;
    if (!userId) {
      res.status(401).json({ status: 'error', message: 'User authentication required.' });
      return;
    }

    const horizonQuery = parseInt(req.query.horizon as string, 10);
    const forecastHorizon = !isNaN(horizonQuery) && horizonQuery >= 1 && horizonQuery <= 12 ? horizonQuery : 4;

    let targetEnd: [number, number] | undefined = undefined;
    if (typeof req.query.endMonth === 'string' && /^\d{4}-\d{2}$/.test(req.query.endMonth)) {
      const [y, m] = req.query.endMonth.split('-').map(Number);
      targetEnd = [y, m];
    }

    let currentMonth: [number, number] | string | undefined = undefined;
    if (typeof req.query.currentMonth === 'string' && /^\d{4}-\d{2}$/.test(req.query.currentMonth)) {
      currentMonth = req.query.currentMonth;
    }

    // Retrieve user transactions from PostgreSQL
    const transactions = await getAllTransactions(userId, 5000);

    const forecastResult = await generateUserForecast(transactions, forecastHorizon, targetEnd, currentMonth);
    res.json(forecastResult);
  } catch (error: any) {
    console.error('[Forecast Route Error]:', error);
    res.status(500).json({
      status: 'error',
      message: error?.message || 'Failed to generate machine learning forecast.',
    });
  }
});

/**
 * GET /api/forecast/models
 * Returns metadata regarding evaluated forecasting models and architectural justification.
 */
forecastRouter.get('/models', async (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    models: [
      {
        name: 'Naive Baseline',
        type: 'Baseline Persistence',
        description: 'Projects the previous month’s actual expenditure into the future (y_t = y_{t-1}). Serves as the critical baseline benchmark for ML superiority.'
      },
      {
        name: 'Moving Average (3-Month)',
        type: 'Rolling Window',
        description: 'Smooths recent expenditure using a configurable 3-month trailing window to buffer short-term variance.'
      },
      {
        name: 'Linear Regression',
        type: 'Parametric Linear Lag Model',
        description: 'Uses regularized Ridge regression fitted against chronological trend index and lagged monthly expenses (lag-1, lag-2, rolling-3).'
      },
      {
        name: 'Random Forest Regression',
        type: 'Non-linear Ensemble Trees',
        description: '100-tree ensemble fitted on lag features, rolling statistics, and cyclical calendar sinusoidal encodings to capture non-linear spending shifts.'
      }
    ],
    deepLearningOmissionRationale:
      'Long Short-Term Memory (LSTM) networks are deliberately excluded: Personal financial ledgers aggregated at monthly granularity contain small sequence lengths (N < 50 data points). Deep sequence architectures require thousands of steps to fit recurrent gates without severe overfitting, high stochastic initialization variance, and opacity. Regularized tabular regression with lag and rolling features delivers superior held-out generalization, transparent feature attribution, and deterministic inference.'
  });
});
