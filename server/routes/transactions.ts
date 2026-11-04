import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getAllTransactions,
  getTransactionById,
  insertTransaction,
  updateTransaction,
  deleteTransactionById,
  bulkInsertTransactions,
  DbTransactionInput,
} from '../repositories/transactionRepository.js';

export const transactionsRouter = Router();

// Enforce authentication on all transaction operations
transactionsRouter.use(requireAuth);

transactionsRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'authenticated-user-scoped');
  next();
});

/**
 * Validates a single transaction input object.
 */
function validateTransactionInput(body: any): string | null {
  if (!body || typeof body !== 'object') {
    return 'Request body must be a JSON object.';
  }

  if (typeof body.name !== 'string' || body.name.trim() === '') {
    return 'Field "name" must be a non-empty string.';
  }

  const numAmount = Number(body.amount);
  if (typeof body.amount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
    return 'Field "amount" must be a positive number greater than 0.';
  }

  if (typeof body.date !== 'string' || body.date.trim() === '') {
    return 'Field "date" must be a non-empty string.';
  }

  if (body.type !== 'income' && body.type !== 'expense') {
    return 'Field "type" must be either "income" or "expense".';
  }

  if (body.status !== undefined && body.status !== 'Completed' && body.status !== 'Pending') {
    return 'Field "status", if provided, must be either "Completed" or "Pending".';
  }

  return null;
}

/**
 * GET /api/transactions
 * Returns all transactions owned by the authenticated user.
 */
transactionsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const limit = req.query.limit ? Math.min(Math.max(parseInt(req.query.limit as string, 10) || 5000, 1), 10000) : 5000;
    const offset = req.query.offset ? Math.max(parseInt(req.query.offset as string, 10) || 0, 0) : 0;
    const transactions = await getAllTransactions(userId, limit, offset);
    res.status(200).json(transactions);
  } catch (error) {
    console.error('[API /api/transactions GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve transactions from the database.',
    });
  }
});

/**
 * GET /api/transactions/:id
 * Retrieves a single transaction strictly matching the authenticated user.
 */
transactionsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const tx = await getTransactionById(id, userId);

    if (!tx) {
      res.status(404).json({
        status: 'error',
        message: `Transaction with ID "${id}" was not found.`,
      });
      return;
    }

    res.status(200).json(tx);
  } catch (error) {
    console.error('[API /api/transactions/:id GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve transaction from the database.',
    });
  }
});

/**
 * POST /api/transactions
 * Creates a transaction owned by the authenticated user.
 */
transactionsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const validationError = validateTransactionInput(req.body);
    if (validationError) {
      res.status(400).json({ status: 'error', message: validationError });
      return;
    }

    const { id, name, category, amount, date, type, paymentMethod, status, notes, merchantIcon } = req.body;

    // If ID supplied, verify it doesn't already exist for this user
    if (id && typeof id === 'string' && id.trim() !== '') {
      const existing = await getTransactionById(id.trim(), userId);
      if (existing) {
        res.status(409).json({
          status: 'error',
          message: `Transaction with ID "${id}" already exists.`,
        });
        return;
      }
    }

    const input: DbTransactionInput = {
      id: id ? String(id).trim() : undefined,
      name: String(name).trim(),
      category: category ? String(category).trim() : 'Others',
      amount: Number(amount),
      date: String(date).trim(),
      type,
      paymentMethod: paymentMethod ? String(paymentMethod).trim() : 'Card',
      status: status || 'Completed',
      notes: notes ? String(notes).trim() : undefined,
      merchantIcon: merchantIcon ? String(merchantIcon).trim() : undefined,
    };

    const created = await insertTransaction(input, userId);
    res.status(201).json(created);
  } catch (error) {
    console.error('[API /api/transactions POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({
      status: 'error',
      message: 'Failed to create transaction record in the database.',
    });
  }
});

/**
 * PUT /api/transactions/:id
 * Updates an existing transaction strictly owned by the authenticated user.
 */
transactionsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await getTransactionById(id, userId);
    if (!existing) {
      res.status(404).json({
        status: 'error',
        message: `Transaction with ID "${id}" was not found.`,
      });
      return;
    }

    const body = req.body;
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.trim() === '')) {
      res.status(400).json({ status: 'error', message: 'Field "name" must be a non-empty string.' });
      return;
    }

    if (body.amount !== undefined) {
      const numAmount = Number(body.amount);
      if (typeof body.amount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
        res.status(400).json({ status: 'error', message: 'Field "amount" must be a positive number.' });
        return;
      }
    }

    if (body.type !== undefined && body.type !== 'income' && body.type !== 'expense') {
      res.status(400).json({ status: 'error', message: 'Field "type" must be either "income" or "expense".' });
      return;
    }

    if (body.status !== undefined && body.status !== 'Completed' && body.status !== 'Pending') {
      res.status(400).json({ status: 'error', message: 'Field "status" must be either "Completed" or "Pending".' });
      return;
    }

    const updates: Partial<DbTransactionInput> = {
      name: body.name !== undefined ? String(body.name).trim() : undefined,
      category: body.category !== undefined ? String(body.category).trim() : undefined,
      amount: body.amount !== undefined ? Number(body.amount) : undefined,
      date: body.date !== undefined ? String(body.date).trim() : undefined,
      type: body.type !== undefined ? body.type : undefined,
      paymentMethod: body.paymentMethod !== undefined ? String(body.paymentMethod).trim() : undefined,
      status: body.status !== undefined ? body.status : undefined,
      notes: body.notes !== undefined ? String(body.notes).trim() : undefined,
      merchantIcon: body.merchantIcon !== undefined ? String(body.merchantIcon).trim() : undefined,
    };

    const updated = await updateTransaction(id, userId, updates);
    res.status(200).json(updated);
  } catch (error) {
    console.error('[API /api/transactions/:id PUT Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({
      status: 'error',
      message: 'Failed to update transaction in the database.',
    });
  }
});

/**
 * DELETE /api/transactions/:id
 * Deletes a transaction strictly owned by the authenticated user.
 */
transactionsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const existing = await getTransactionById(id, userId);
    if (!existing) {
      res.status(404).json({
        status: 'error',
        message: `Transaction with ID "${id}" was not found.`,
      });
      return;
    }

    const deleted = await deleteTransactionById(id, userId);
    if (deleted) {
      res.status(200).json({
        status: 'ok',
        message: `Transaction with ID "${id}" was successfully deleted.`,
        id,
      });
    } else {
      res.status(500).json({
        status: 'error',
        message: `Failed to delete transaction with ID "${id}".`,
      });
    }
  } catch (error) {
    console.error('[API /api/transactions/:id DELETE Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete transaction from the database.',
    });
  }
});

/**
 * POST /api/transactions/bulk
 * Atomically inserts multiple transactions scoped to the authenticated user.
 */
transactionsRouter.post('/bulk', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    let rawList: any[] = [];
    let onConflict: 'skip' | 'error' = 'skip';

    if (Array.isArray(req.body)) {
      rawList = req.body;
    } else if (req.body && Array.isArray(req.body.transactions)) {
      rawList = req.body.transactions;
      if (req.body.onConflict === 'error' || req.body.onConflict === 'skip') {
        onConflict = req.body.onConflict;
      }
    } else {
      res.status(400).json({
        status: 'error',
        message: 'Request body must be an array of transactions or an object containing a "transactions" array.',
      });
      return;
    }

    if (rawList.length === 0) {
      res.status(400).json({
        status: 'error',
        message: 'The transactions array cannot be empty.',
      });
      return;
    }

    const validatedInputs: DbTransactionInput[] = [];
    for (let i = 0; i < rawList.length; i++) {
      const item = rawList[i];
      const err = validateTransactionInput(item);
      if (err) {
        res.status(400).json({
          status: 'error',
          message: `Validation failed on record [${i}]: ${err}`,
        });
        return;
      }

      validatedInputs.push({
        id: item.id ? String(item.id).trim() : undefined,
        name: String(item.name).trim(),
        category: item.category ? String(item.category).trim() : 'Others',
        amount: Number(item.amount),
        date: String(item.date).trim(),
        type: item.type,
        paymentMethod: item.paymentMethod ? String(item.paymentMethod).trim() : 'Card',
        status: item.status || 'Completed',
        notes: item.notes ? String(item.notes).trim() : undefined,
        merchantIcon: item.merchantIcon ? String(item.merchantIcon).trim() : undefined,
      });
    }

    const result = await bulkInsertTransactions(validatedInputs, userId, onConflict);

    res.status(201).json({
      status: 'ok',
      totalSubmitted: validatedInputs.length,
      insertedCount: result.inserted.length,
      skippedCount: result.skippedCount,
      transactions: result.inserted,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown bulk error';
    console.error('[API /api/transactions/bulk Error]:', errorMsg);

    if (errorMsg.includes('DUPLICATE_ID_CONFLICT')) {
      res.status(409).json({
        status: 'error',
        message: errorMsg,
      });
      return;
    }

    res.status(500).json({
      status: 'error',
      message: 'Failed to complete atomic bulk transaction insert.',
    });
  }
});
