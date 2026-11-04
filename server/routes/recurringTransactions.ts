import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getAllRecurringTransactions,
  getRecurringTransactionById,
  insertRecurringTransaction,
  updateRecurringTransaction,
  deleteRecurringTransactionById,
  processRecurringTransaction,
} from '../repositories/recurringTransactionsRepository.js';

export const recurringTransactionsRouter = Router();

// Enforce authentication on all operations
recurringTransactionsRouter.use(requireAuth);

recurringTransactionsRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'authenticated-user-scoped');
  next();
});

// GET /api/recurring-transactions
recurringTransactionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const items = await getAllRecurringTransactions(userId);
    res.status(200).json(items);
  } catch (error) {
    console.error('[API /api/recurring-transactions GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve recurring transactions.' });
  }
});

// GET /api/recurring-transactions/:id
recurringTransactionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await getRecurringTransactionById(req.params.id, userId);
    if (!item) {
      res.status(404).json({ status: 'error', message: `Recurring transaction "${req.params.id}" not found.` });
      return;
    }
    res.status(200).json(item);
  } catch (error) {
    console.error('[API /api/recurring-transactions/:id GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve recurring transaction.' });
  }
});

// POST /api/recurring-transactions
recurringTransactionsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, description, amount, type, category, frequency, startDate, endDate, nextDueDate, status, autoCreate } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "name" must be a non-empty string.' });
      return;
    }

    const numAmount = Number(amount);
    if (typeof amount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ status: 'error', message: 'Field "amount" must be greater than 0.' });
      return;
    }

    if (type !== 'income' && type !== 'expense') {
      res.status(400).json({ status: 'error', message: 'Field "type" must be either "income" or "expense".' });
      return;
    }

    if (!category || typeof category !== 'string' || category.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "category" must be a non-empty string.' });
      return;
    }

    if (frequency !== 'weekly' && frequency !== 'monthly' && frequency !== 'yearly') {
      res.status(400).json({ status: 'error', message: 'Field "frequency" must be "weekly", "monthly", or "yearly".' });
      return;
    }

    if (!startDate || typeof startDate !== 'string' || startDate.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "startDate" must be a non-empty string.' });
      return;
    }

    const created = await insertRecurringTransaction(
      {
        name: name.trim(),
        description: description ? String(description).trim() : '',
        amount: numAmount,
        type,
        category: category.trim(),
        frequency,
        startDate: startDate.trim(),
        endDate: endDate ? String(endDate).trim() : undefined,
        nextDueDate: nextDueDate ? String(nextDueDate).trim() : undefined,
        status: status === 'paused' ? 'paused' : 'active',
        autoCreate: Boolean(autoCreate),
      },
      userId
    );

    res.status(201).json(created);
  } catch (error) {
    console.error('[API /api/recurring-transactions POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to create recurring transaction.' });
  }
});

// PUT /api/recurring-transactions/:id
recurringTransactionsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getRecurringTransactionById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Recurring transaction "${req.params.id}" not found.` });
      return;
    }

    const { name, description, amount, type, category, frequency, startDate, endDate, nextDueDate, status, autoCreate } = req.body;

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (typeof amount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
        res.status(400).json({ status: 'error', message: 'Field "amount" must be greater than 0.' });
        return;
      }
    }

    if (type !== undefined && type !== 'income' && type !== 'expense') {
      res.status(400).json({ status: 'error', message: 'Field "type" must be either "income" or "expense".' });
      return;
    }

    if (frequency !== undefined && frequency !== 'weekly' && frequency !== 'monthly' && frequency !== 'yearly') {
      res.status(400).json({ status: 'error', message: 'Field "frequency" must be "weekly", "monthly", or "yearly".' });
      return;
    }

    if (status !== undefined && status !== 'active' && status !== 'paused') {
      res.status(400).json({ status: 'error', message: 'Field "status" must be "active" or "paused".' });
      return;
    }

    const updated = await updateRecurringTransaction(req.params.id, userId, {
      name: name !== undefined ? String(name).trim() : undefined,
      description: description !== undefined ? String(description).trim() : undefined,
      amount: amount !== undefined ? Number(amount) : undefined,
      type: type || undefined,
      category: category !== undefined ? String(category).trim() : undefined,
      frequency: frequency || undefined,
      startDate: startDate !== undefined ? String(startDate).trim() : undefined,
      endDate: endDate !== undefined ? String(endDate).trim() : undefined,
      nextDueDate: nextDueDate !== undefined ? String(nextDueDate).trim() : undefined,
      status: status || undefined,
      autoCreate: autoCreate !== undefined ? Boolean(autoCreate) : undefined,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('[API /api/recurring-transactions/:id PUT Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to update recurring transaction.' });
  }
});

// PATCH /api/recurring-transactions/:id/status
recurringTransactionsRouter.patch('/:id/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status } = req.body;
    if (status !== 'active' && status !== 'paused') {
      res.status(400).json({ status: 'error', message: 'Field "status" must be "active" or "paused".' });
      return;
    }

    const updated = await updateRecurringTransaction(req.params.id, userId, { status });
    if (!updated) {
      res.status(404).json({ status: 'error', message: `Recurring transaction "${req.params.id}" not found.` });
      return;
    }

    res.status(200).json(updated);
  } catch (error) {
    console.error('[API /api/recurring-transactions/:id/status PATCH Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to update status.' });
  }
});

// POST /api/recurring-transactions/:id/process
recurringTransactionsRouter.post('/:id/process', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { confirmCreate } = req.body;

    const result = await processRecurringTransaction(req.params.id, userId, {
      confirmCreate: Boolean(confirmCreate),
    });

    res.status(200).json({
      status: 'ok',
      ...result,
    });
  } catch (error) {
    console.error('[API /api/recurring-transactions/:id/process POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to process recurring transaction.' });
  }
});

// DELETE /api/recurring-transactions/:id
recurringTransactionsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const deleted = await deleteRecurringTransactionById(req.params.id, userId);
    if (!deleted) {
      res.status(404).json({ status: 'error', message: `Recurring transaction "${req.params.id}" not found.` });
      return;
    }

    res.status(200).json({ status: 'ok', message: `Recurring transaction "${req.params.id}" deleted.`, id: req.params.id });
  } catch (error) {
    console.error('[API /api/recurring-transactions/:id DELETE Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to delete recurring transaction.' });
  }
});

