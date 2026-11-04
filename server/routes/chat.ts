/**
 * FinSight AI — Grounded Financial Chatbot Router
 *
 * REST Endpoints:
 * - POST /api/chat: Submits a financial query grounded in authenticated user data.
 * - GET /api/chat/context: Returns active grounded financial summary for conversational greeting.
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { processChatMessage, buildUserFinancialContext, ChatMessageItem } from '../services/chatbotService.js';

export const chatRouter = Router();

// Enforce authentication on all chat endpoints
chatRouter.use(requireAuth);

chatRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'authenticated-user-scoped');
  next();
});

// Rate limiting on conversational assistant queries: 60 per 15m in prod, 600 in dev/test
const chatRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 60 : 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'You have submitted too many chat requests. Please wait a few moments before asking another question.',
  },
});

/**
 * POST /api/chat
 * Generates an accurate, grounded financial answer for the authenticated user.
 */
chatRouter.post('/', chatRateLimiter, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { message, history, clientDate, mode } = req.body;

    let chatMode: 'auto' | 'gemini' | 'engine' = 'auto';
    if (mode === 'gemini' || mode === 'engine' || mode === 'auto') {
      chatMode = mode;
    }

    let refDate = new Date();
    if (clientDate && typeof clientDate === 'string') {
      const parsed = new Date(clientDate);
      if (!isNaN(parsed.getTime())) {
        refDate = parsed;
      }
    }

    if (!message || typeof message !== 'string' || message.trim() === '') {
      res.status(400).json({
        status: 'error',
        message: 'The "message" field is required and must be a non-empty string.',
      });
      return;
    }

    if (message.length > 2000) {
      res.status(400).json({
        status: 'error',
        message: 'Message exceeds maximum length of 2000 characters.',
      });
      return;
    }

    const validatedHistory: ChatMessageItem[] = [];
    if (Array.isArray(history)) {
      for (const item of history) {
        if (
          item &&
          typeof item === 'object' &&
          (item.role === 'user' || item.role === 'assistant' || item.role === 'model') &&
          typeof item.content === 'string'
        ) {
          validatedHistory.push({
            role: item.role === 'model' ? 'assistant' : item.role,
            content: item.content.slice(0, 2000),
          });
        }
      }
    }

    const authMs = typeof (req as any).authMs === 'number' ? (req as any).authMs : 0;
    const result = await processChatMessage(userId, message.trim(), validatedHistory, refDate, chatMode, authMs);

    res.status(200).json({
      status: 'ok',
      reply: result.reply,
      grounded: result.grounded,
      engineUsed: result.engineUsed,
      mode: chatMode,
      summary: result.summary,
      timings: result.timings,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to process financial query. Please try again.';
    console.error('[API /api/chat Error]:', errorMsg);
    const statusCode = errorMsg.includes('Gemini') ? 503 : 500;
    res.status(statusCode).json({
      status: 'error',
      message: errorMsg,
    });
  }
});

/**
 * GET /api/chat/context
 * Returns authenticated user's financial totals for conversational initialization.
 */
chatRouter.get('/context', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const context = await buildUserFinancialContext(userId);

    res.status(200).json({
      status: 'ok',
      summary: {
        totalIncome: context.aggregates.totalIncome,
        totalExpenses: context.aggregates.totalExpenses,
        netSavings: context.aggregates.netSavings,
        savingsRate: context.aggregates.savingsRate,
        transactionCount: context.aggregates.transactionCount,
        budgetsCount: context.budgets.length,
        goalsCount: context.goals.length,
        billsCount: context.bills.length,
        recurringCount: context.recurring.length,
      },
    });
  } catch (error) {
    console.error('[API /api/chat/context Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve chatbot financial context.',
    });
  }
});

