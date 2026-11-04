import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/requireAuth.js';
import { getDbPool } from '../db.js';

export const adminRouter = Router();

// 1. Enforce authentication
adminRouter.use(requireAuth);

// 2. Enforce active database-verified admin role
adminRouter.use((req: Request, res: Response, next) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({
      status: 'error',
      message: 'Access denied. Administrator privileges required.',
    });
    return;
  }
  next();
});

/**
 * GET /api/admin/stats
 * Retrieves sensitive administrative telemetry, only accessible by verified admins.
 */
adminRouter.get('/stats', async (_req: Request, res: Response) => {
  try {
    const pool = getDbPool();
    const userCountRes = pool ? await pool.query('SELECT COUNT(*) as c FROM users;') : { rows: [{ c: 0 }] };

    res.status(200).json({
      status: 'ok',
      registeredUsers: parseInt(userCountRes.rows[0].c, 10),
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsageMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[API /api/admin/stats Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve administrative statistics.',
    });
  }
});
