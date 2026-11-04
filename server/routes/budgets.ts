import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getAllBudgets,
  getBudgetById,
  getBudgetByUserMonthCategory,
  insertBudget,
  updateBudget,
  deleteBudgetById,
  bulkInsertBudgets,
} from '../repositories/financialEntitiesRepository.js';

export const budgetsRouter = Router();

// Enforce authentication on all budget operations
budgetsRouter.use(requireAuth);

budgetsRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'authenticated-user-scoped');
  next();
});

// GET /api/budgets
budgetsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const month = typeof req.query.month === 'string' ? req.query.month.trim() : undefined;
    const list = await getAllBudgets(userId, month);
    res.status(200).json(list);
  } catch (error) {
    console.error('[API /api/budgets GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve budgets.' });
  }
});

// GET /api/budgets/:id
budgetsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await getBudgetById(req.params.id, userId);
    if (!item) {
      res.status(404).json({ status: 'error', message: `Budget "${req.params.id}" not found.` });
      return;
    }
    res.status(200).json(item);
  } catch (error) {
    console.error('[API /api/budgets/:id GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve budget.' });
  }
});

// POST /api/budgets
budgetsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id, category, allocated, color, month, suggestedByAI } = req.body;
    if (!category || typeof category !== 'string' || category.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "category" must be a non-empty string.' });
      return;
    }
    const numAlloc = Number(allocated);
    if (typeof allocated !== 'number' || isNaN(numAlloc) || numAlloc < 0) {
      res.status(400).json({ status: 'error', message: 'Field "allocated" must be a non-negative number.' });
      return;
    }

    const normMonth = month && typeof month === 'string' && month.trim() !== '' ? month.trim() : 'All';
    const normCategory = category.trim();

    if (id && typeof id === 'string') {
      const existing = await getBudgetById(id.trim(), userId);
      if (existing) {
        res.status(409).json({ status: 'error', message: `Budget ID "${id}" already exists.` });
        return;
      }
    }

    // Duplicate check: Prevent duplicate budgets for the same user, month, and category
    const duplicate = await getBudgetByUserMonthCategory(userId, normMonth, normCategory);
    if (duplicate) {
      res.status(409).json({
        status: 'error',
        message: `A budget for category "${normCategory}" already exists for ${normMonth}. Please edit the existing budget envelope instead.`,
      });
      return;
    }

    const created = await insertBudget(
      {
        id: id ? String(id).trim() : undefined,
        category: normCategory,
        allocated: numAlloc,
        color: color ? String(color).trim() : '#00E5BE',
        month: normMonth,
        suggestedByAI: suggestedByAI !== undefined ? Number(suggestedByAI) : undefined,
      },
      userId
    );

    res.status(201).json(created);
  } catch (error) {
    console.error('[API /api/budgets POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to create budget.' });
  }
});

// POST /api/budgets/bulk
budgetsRouter.post('/bulk', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { budgets, onConflict } = req.body;
    if (!Array.isArray(budgets)) {
      res.status(400).json({ status: 'error', message: 'Field "budgets" must be an array.' });
      return;
    }
    const result = await bulkInsertBudgets(budgets, userId, onConflict || 'skip');
    res.status(201).json({
      status: 'ok',
      budgets: result.inserted,
      insertedCount: result.inserted.length,
      skippedCount: result.skippedCount,
    });
  } catch (error) {
    console.error('[API /api/budgets/bulk POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Bulk budget creation failed.' });
  }
});

// PUT /api/budgets/:id
budgetsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getBudgetById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Budget "${req.params.id}" not found.` });
      return;
    }

    const { category, allocated, color, month, suggestedByAI } = req.body;
    if (allocated !== undefined) {
      const numAlloc = Number(allocated);
      if (typeof allocated !== 'number' || isNaN(numAlloc) || numAlloc < 0) {
        res.status(400).json({ status: 'error', message: 'Field "allocated" must be a non-negative number.' });
        return;
      }
    }

    const targetCategory = category ? String(category).trim() : existing.category;
    const targetMonth = month ? String(month).trim() : (existing.month || 'All');

    // Check duplicate conflict with another budget record
    if (
      targetCategory.toLowerCase() !== existing.category.toLowerCase() ||
      targetMonth.toLowerCase() !== (existing.month || 'all').toLowerCase()
    ) {
      const conflict = await getBudgetByUserMonthCategory(userId, targetMonth, targetCategory);
      if (conflict && conflict.id !== req.params.id) {
        res.status(409).json({
          status: 'error',
          message: `A budget for category "${targetCategory}" already exists for ${targetMonth}.`,
        });
        return;
      }
    }

    const updated = await updateBudget(req.params.id, userId, {
      category: targetCategory,
      allocated: allocated !== undefined ? Number(allocated) : undefined,
      color: color ? String(color).trim() : undefined,
      month: targetMonth,
      suggestedByAI: suggestedByAI !== undefined ? Number(suggestedByAI) : undefined,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('[API /api/budgets/:id PUT Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to update budget.' });
  }
});

// DELETE /api/budgets/:id
budgetsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getBudgetById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Budget "${req.params.id}" not found.` });
      return;
    }

    await deleteBudgetById(req.params.id, userId);
    res.status(200).json({ status: 'ok', message: `Budget "${req.params.id}" deleted.`, id: req.params.id });
  } catch (error) {
    console.error('[API /api/budgets/:id DELETE Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to delete budget.' });
  }
});
