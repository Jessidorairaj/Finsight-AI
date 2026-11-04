import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  getAllBills,
  getBillById,
  insertBill,
  updateBill,
  deleteBillById,
  bulkInsertBills,
  payBillAndLinkTransaction,
} from '../repositories/financialEntitiesRepository.js';

export const billsRouter = Router();

// Enforce authentication on all bill operations
billsRouter.use(requireAuth);

billsRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'authenticated-user-scoped');
  next();
});

// GET /api/bills
billsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const list = await getAllBills(userId);
    res.status(200).json(list);
  } catch (error) {
    console.error('[API /api/bills GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve bills.' });
  }
});

// GET /api/bills/:id
billsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const item = await getBillById(req.params.id, userId);
    if (!item) {
      res.status(404).json({ status: 'error', message: `Bill "${req.params.id}" not found.` });
      return;
    }
    res.status(200).json(item);
  } catch (error) {
    console.error('[API /api/bills/:id GET Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to retrieve bill.' });
  }
});

// POST /api/bills
billsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id, name, category, amount, dueDate, dueInDays, status, iconType, reminderDays, isRecurring, recurringFrequency } = req.body;

    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "name" must be a non-empty string.' });
      return;
    }

    if (!category || typeof category !== 'string' || category.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "category" must be a non-empty string.' });
      return;
    }

    const numAmount = Number(amount);
    if (typeof amount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
      res.status(400).json({ status: 'error', message: 'Field "amount" must be greater than 0.' });
      return;
    }

    if (!dueDate || typeof dueDate !== 'string' || dueDate.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Field "dueDate" must be a non-empty string.' });
      return;
    }

    if (id && typeof id === 'string') {
      const existing = await getBillById(id.trim(), userId);
      if (existing) {
        res.status(409).json({ status: 'error', message: `Bill ID "${id}" already exists.` });
        return;
      }
    }

    const created = await insertBill(
      {
        id: id ? String(id).trim() : undefined,
        name: String(name).trim(),
        category: String(category).trim(),
        amount: numAmount,
        dueDate: String(dueDate).trim(),
        dueInDays: dueInDays !== undefined ? Number(dueInDays) : 0,
        status: status || 'unpaid',
        iconType: iconType ? String(iconType).trim() : 'electricity',
        reminderDays: reminderDays !== undefined ? Number(reminderDays) : 3,
        isRecurring: Boolean(isRecurring),
        recurringFrequency: recurringFrequency ? String(recurringFrequency).trim() : 'monthly',
      },
      userId
    );

    res.status(201).json(created);
  } catch (error) {
    console.error('[API /api/bills POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to create bill.' });
  }
});

// POST /api/bills/bulk
billsRouter.post('/bulk', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { bills, onConflict } = req.body;
    if (!Array.isArray(bills)) {
      res.status(400).json({ status: 'error', message: 'Field "bills" must be an array.' });
      return;
    }
    const result = await bulkInsertBills(bills, userId, onConflict || 'skip');
    res.status(201).json({
      status: 'ok',
      bills: result.inserted,
      insertedCount: result.inserted.length,
      skippedCount: result.skippedCount,
    });
  } catch (error) {
    console.error('[API /api/bills/bulk POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Bulk bill creation failed.' });
  }
});

// POST /api/bills/:id/pay - Mark paid & link transaction without duplication
billsRouter.post('/:id/pay', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { paymentMethod, date } = req.body || {};
    const result = await payBillAndLinkTransaction(req.params.id, userId, {
      paymentMethod: paymentMethod ? String(paymentMethod).trim() : undefined,
      date: date ? String(date).trim() : undefined,
    });

    res.status(200).json({
      status: 'ok',
      bill: result.bill,
      transaction: result.transaction,
      alreadyPaid: result.alreadyPaid,
      message: result.alreadyPaid
        ? `Bill "${result.bill.name}" was already marked as paid.`
        : `Payment for bill "${result.bill.name}" recorded and linked to transactions.`,
    });
  } catch (error) {
    console.error('[API /api/bills/:id/pay POST Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: error instanceof Error ? error.message : 'Failed to pay bill.' });
  }
});

// PUT /api/bills/:id
billsRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getBillById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Bill "${req.params.id}" not found.` });
      return;
    }

    const { name, category, amount, dueDate, dueInDays, status, iconType, reminderDays, isRecurring, recurringFrequency, transactionId } = req.body;

    if (amount !== undefined) {
      const numAmount = Number(amount);
      if (typeof amount !== 'number' || isNaN(numAmount) || numAmount <= 0) {
        res.status(400).json({ status: 'error', message: 'Field "amount" must be greater than 0.' });
        return;
      }
    }

    if (status !== undefined && status !== 'unpaid' && status !== 'paid' && status !== 'scheduled') {
      res.status(400).json({ status: 'error', message: 'Field "status" must be "unpaid", "paid", or "scheduled".' });
      return;
    }

    const updated = await updateBill(req.params.id, userId, {
      name: name ? String(name).trim() : undefined,
      category: category ? String(category).trim() : undefined,
      amount: amount !== undefined ? Number(amount) : undefined,
      dueDate: dueDate ? String(dueDate).trim() : undefined,
      dueInDays: dueInDays !== undefined ? Number(dueInDays) : undefined,
      status: status || undefined,
      iconType: iconType ? String(iconType).trim() : undefined,
      reminderDays: reminderDays !== undefined ? Number(reminderDays) : undefined,
      isRecurring: isRecurring !== undefined ? Boolean(isRecurring) : undefined,
      recurringFrequency: recurringFrequency ? String(recurringFrequency).trim() : undefined,
      transactionId: transactionId ? String(transactionId).trim() : undefined,
    });

    res.status(200).json(updated);
  } catch (error) {
    console.error('[API /api/bills/:id PUT Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to update bill.' });
  }
});

// DELETE /api/bills/:id
billsRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const existing = await getBillById(req.params.id, userId);
    if (!existing) {
      res.status(404).json({ status: 'error', message: `Bill "${req.params.id}" not found.` });
      return;
    }

    await deleteBillById(req.params.id, userId);
    res.status(200).json({ status: 'ok', message: `Bill "${req.params.id}" deleted.`, id: req.params.id });
  } catch (error) {
    console.error('[API /api/bills/:id DELETE Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to delete bill.' });
  }
});
