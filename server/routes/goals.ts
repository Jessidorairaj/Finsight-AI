import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getAllGoals,
  getGoalById,
  insertGoal,
  updateGoal,
  deleteGoalById,
  contributeToGoal,
  bulkInsertGoals,
} from '../repositories/financialEntitiesRepository.js';

export const goalsRouter = Router();

// Enforce authentication on all goal operations
goalsRouter.use(requireAuth);

goalsRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'authenticated-user-scoped');
  next();
});

// GET /api/goals
goalsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const list = await getAllGoals(userId);
    res.status(200).json(list);
  } catch (error) {
    console.error('[API /api/goals GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve goals.' });
  }
});

// GET /api/goals/:id
goalsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await getGoalById(req.params.id, userId);
    if (!item) {
      res.status(404).json({ status: 'error', message: `Goal "${req.params.id}" not found.` });
      return;
    }
    res.status(200).json(item);
  } catch (error) {
    console.error('[API /api/goals/:id GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve goal.' });
  }
});

// POST /api/goals
goalsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id, title, targetAmount, currentAmount, targetDate, category, monthlyContribution } = req.body;

    if (!title || typeof title !== 'string' || title.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "title" must be a non-empty string.' });
      return;
    }

    const numTarget = Number(targetAmount);
    if (typeof targetAmount !== 'number' || isNaN(numTarget) || numTarget <= 0) {
      res.status(400).json({ status: 'error', message: 'Field "targetAmount" must be a number greater than 0.' });
      return;
    }

    if (currentAmount !== undefined) {
      const numCurrent = Number(currentAmount);
      if (typeof currentAmount !== 'number' || isNaN(numCurrent) || numCurrent < 0) {
        res.status(400).json({ status: 'error', message: 'Field "currentAmount" must be a non-negative number.' });
        return;
      }
    }

    if (id && typeof id === 'string') {
      const existing = await getGoalById(id.trim(), userId);
      if (existing) {
        res.status(409).json({ status: 'error', message: `Goal ID "${id}" already exists.` });
        return;
      }
    }

    const created = await insertGoal(
      {
        id: id ? String(id).trim() : undefined,
        title: String(title).trim(),
        targetAmount: numTarget,
        currentAmount: currentAmount !== undefined ? Number(currentAmount) : 0,
        targetDate: targetDate && typeof targetDate === 'string' && targetDate.trim() !== '' ? String(targetDate).trim() : undefined,
        category: category ? String(category).trim() : 'General',
        monthlyContribution: monthlyContribution !== undefined ? Number(monthlyContribution) : 0,
      },
      userId
    );

    res.status(201).json(created);
  } catch (error) {
    console.error('[API /api/goals POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to create goal.' });
  }
});

// POST /api/goals/bulk
goalsRouter.post('/bulk', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { goals, onConflict } = req.body;
    if (!Array.isArray(goals)) {
      res.status(400).json({ status: 'error', message: 'Field "goals" must be an array.' });
      return;
    }
    const result = await bulkInsertGoals(goals, userId, onConflict || 'skip');
    res.status(201).json({
      status: 'ok',
      goals: result.inserted,
      insertedCount: result.inserted.length,
      skippedCount: result.skippedCount,
    });
  } catch (error) {
    console.error('[API /api/goals/bulk POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Bulk goal creation failed.' });
  }
});

// PUT /api/goals/:id
goalsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getGoalById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Goal "${req.params.id}" not found.` });
      return;
    }

    const { title, targetAmount, currentAmount, targetDate, category, monthlyContribution } = req.body;

    if (targetAmount !== undefined) {
      const numTarget = Number(targetAmount);
      if (typeof targetAmount !== 'number' || isNaN(numTarget) || numTarget <= 0) {
        res.status(400).json({ status: 'error', message: 'Field "targetAmount" must be greater than 0.' });
        return;
      }
    }

    if (currentAmount !== undefined) {
      const numCurrent = Number(currentAmount);
      if (typeof currentAmount !== 'number' || isNaN(numCurrent) || numCurrent < 0) {
        res.status(400).json({ status: 'error', message: 'Field "currentAmount" must be non-negative.' });
        return;
      }
    }

    const updated = await updateGoal(req.params.id, userId, {
      title: title ? String(title).trim() : undefined,
      targetAmount: targetAmount !== undefined ? Number(targetAmount) : undefined,
      currentAmount: currentAmount !== undefined ? Number(currentAmount) : undefined,
      targetDate: targetDate ? String(targetDate).trim() : undefined,
      category: category ? String(category).trim() : undefined,
      monthlyContribution: monthlyContribution !== undefined ? Number(monthlyContribution) : undefined,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('[API /api/goals/:id PUT Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to update goal.' });
  }
});

// POST /api/goals/:id/contribute
goalsRouter.post('/:id/contribute', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getGoalById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Goal "${req.params.id}" not found.` });
      return;
    }

    const { amount } = req.body;
    const numAmount = Number(amount);
    if (typeof amount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ status: 'error', message: 'Contribution amount must be a number greater than 0.' });
      return;
    }

    const updated = await contributeToGoal(req.params.id, userId, numAmount);
    res.status(200).json({
      status: 'ok',
      message: `Contributed ₹${numAmount} to goal "${existing.title}".`,
      goal: updated,
    });
  } catch (error) {
    console.error('[API /api/goals/:id/contribute Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to contribute to goal.' });
  }
});

// DELETE /api/goals/:id
goalsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getGoalById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Goal "${req.params.id}" not found.` });
      return;
    }

    await deleteGoalById(req.params.id, userId);
    res.status(200).json({ status: 'ok', message: `Goal "${req.params.id}" deleted.`, id: req.params.id });
  } catch (error) {
    console.error('[API /api/goals/:id DELETE Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to delete goal.' });
  }
});
