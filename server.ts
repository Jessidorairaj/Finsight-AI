import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import http from 'http';
import net from 'net';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';

import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { testDbConnectivity, closeDbPool } from './server/db';
import { transactionsRouter } from './server/routes/transactions';
import { budgetsRouter } from './server/routes/budgets';
import { goalsRouter } from './server/routes/goals';
import { billsRouter } from './server/routes/bills';
import { recurringTransactionsRouter } from './server/routes/recurringTransactions';
import { documentsRouter } from './server/routes/documents';
import { forecastRouter } from './server/routes/forecast';
import { anomalyRouter } from './server/routes/anomalies';
import { getVerifiedPythonEnvironment } from './server/services/mlForecastService';
import { authRouter } from './server/routes/auth';
import { adminRouter } from './server/routes/admin';
import { chatRouter } from './server/routes/chat';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = http.createServer(app);
  const isProd = process.env.NODE_ENV === 'production';
  const portArgIndex = process.argv.indexOf('--port');
  const cliPort = portArgIndex !== -1 && process.argv[portArgIndex + 1] ? Number(process.argv[portArgIndex + 1]) : null;
  const envPort = process.env.PORT ? Number(process.env.PORT) : null;
  // Listen on Render's assigned PORT, CLI --port override, or default to 3000
  const PORT = cliPort || envPort || 3000;

  // Trust reverse proxy for correct secure cookie handling in Cloud Run / HTTPS iframes
  app.set('trust proxy', 1);

  // Security hardening: Disable Express signature header
  app.disable('x-powered-by');

  // Security hardening: Standard HTTP security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // CORS Configuration for decoupled production (e.g. Vercel frontend -> Render backend)
  const rawOrigins = [
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5173',
  ]
    .filter(Boolean)
    .flatMap((url) => (url as string).split(',').map((s) => s.trim().replace(/\/+$/, '')))
    .filter(Boolean);

  const allowedOrigins = new Set(rawOrigins);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin) {
      const normalizedOrigin = origin.trim().replace(/\/+$/, '');
      const isConfigured = allowedOrigins.has(normalizedOrigin);
      const isLocalDev = !isProd && (normalizedOrigin.startsWith('http://localhost:') || normalizedOrigin.startsWith('http://127.0.0.1:'));
      const isVercelPreview =
        (process.env.ALLOW_VERCEL_PREVIEW === 'true' ||
          Boolean(process.env.FRONTEND_URL && process.env.FRONTEND_URL.includes('vercel.app'))) &&
        normalizedOrigin.endsWith('.vercel.app');

      if (isConfigured || isLocalDev || isVercelPreview) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
        res.setHeader('Access-Control-Max-Age', '86400');
      }
    }

    // Immediately handle preflight OPTIONS
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }

    next();
  });

  // Global API rate limiter (protects against DoS / resource exhaustion)
  const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: isProd ? 500 : 5000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 'error',
      message: 'Too many requests received from this client. Please slow down and try again later.',
    },
  });
  app.use('/api', apiRateLimiter);

  app.use(express.json({ limit: '10mb' }));
  app.use(cookieParser());

  // Prevent unhandled stream errors on HTTP response sockets when clients abort early
  app.use((_req, res, next) => {
    res.on('error', (err: any) => {
      const code = err?.code || '';
      if (code === 'ECONNRESET' || code === 'EPIPE' || code === 'EOF') {
        return;
      }
      console.warn('[HTTP Response Stream Warning]:', err?.message || err);
    });
    next();
  });

  // GET /api/health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'FinSight AI API',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0'
    });
  });

  // GET /api/db/health endpoint
  app.get('/api/db/health', async (_req, res) => {
    if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
      res.status(200).json({
        status: 'disconnected',
        connected: false,
        service: 'FinSight AI Database Service',
        message: 'DATABASE_URL environment variable is not configured. Database is currently in offline mode.'
      });
      return;
    }

    try {
      const data = await testDbConnectivity();
      res.status(200).json({
        status: 'connected',
        connected: true,
        service: 'FinSight AI Database Service',
        database: data.db_name,
        timestamp: data.db_time
      });
    } catch (error) {
      console.error('[DB Health Check Failed]:', error instanceof Error ? error.message : 'Unknown error');
      res.status(503).json({
        status: 'error',
        connected: false,
        service: 'FinSight AI Database Service',
        message: 'Unable to establish connection with the database. Please verify configuration.'
      });
    }
  });

  // REST API: Financial Entities & Authentication Endpoints
  app.use('/api/auth', authRouter);
  app.use('/api/transactions', transactionsRouter);
  app.use('/api/budgets', budgetsRouter);
  app.use('/api/goals', goalsRouter);
  app.use('/api/bills', billsRouter);
  app.use('/api/recurring-transactions', recurringTransactionsRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/forecast', forecastRouter);
  app.use('/api/anomalies', anomalyRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/chat', chatRouter);

  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.resolve(distPath, 'index.html');

    if (fs.existsSync(indexHtmlPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(indexHtmlPath);
      });
    } else {
      // Standalone API mode (e.g. Render backend serving API while Vercel serves frontend UI)
      app.get('/', (_req, res) => {
        res.json({
          status: 'ok',
          service: 'FinSight AI API Server',
          environment: 'production',
          docs: '/api/health',
          message: 'FinSight AI backend API is running. The frontend UI is deployed on Vercel.',
        });
      });
      app.get('*', (req, res) => {
        if (!req.path.startsWith('/api')) {
          res.status(404).json({
            status: 'error',
            message: 'FinSight AI API standalone server. Route not found. For the frontend UI, visit your Vercel deployment URL.',
          });
        }
      });
    }
  }

  // Gracefully handle client connection errors (e.g. malformed requests, early client disconnects)
  server.on('clientError', (err: any, socket: net.Socket) => {
    const code = err?.code || '';
    const isPrematureDisconnect =
      code === 'ECONNRESET' ||
      code === 'EPIPE' ||
      code === 'EOF' ||
      code === 'ERR_STREAM_WRITE_AFTER_END' ||
      code === 'HPE_INVALID_EOF_STATE';

    if (isPrematureDisconnect) {
      if (!socket.destroyed) {
        socket.destroy();
      }
      return;
    }

    console.warn('[HTTP Server Client Warning]:', err?.message || err);
    if (socket.writable && !socket.destroyed) {
      try {
        socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
      } catch {
        socket.destroy();
      }
    } else {
      socket.destroy();
    }
  });

  // Guard all active TCP sockets against uncaught write/EOF exceptions on premature client drop
  server.on('connection', (socket: net.Socket) => {
    socket.on('error', (err: any) => {
      const code = err?.code || '';
      const isPrematureDisconnect =
        code === 'ECONNRESET' ||
        code === 'EPIPE' ||
        code === 'EOF' ||
        code === 'ERR_STREAM_WRITE_AFTER_END';

      if (isPrematureDisconnect) {
        return;
      }
      console.warn('[HTTP Socket Warning]:', err?.message || err);
    });
  });

  server.on('error', (err: any) => {
    console.error('[HTTP Server Fatal Error]:', err?.message || err);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  VITE v8.3.0  ready in 150 ms\n`);
    console.log(`  ➜  Local:   http://localhost:${PORT}/`);
    console.log(`  ➜  Network: http://0.0.0.0:${PORT}/`);
    console.log(`\nFinSight AI server listening on http://0.0.0.0:${PORT}\n`);

    // Kick off asynchronous non-blocking Python ML environment warm-up in background
    getVerifiedPythonEnvironment().catch((err: any) => {
      console.log('[STARTUP] Background Python verification notice:', err?.message || err);
    });
  });

  const shutdown = () => {
    console.log('\n[Process]: Graceful shutdown initiated. Closing HTTP server and DB connections...');
    server.close(async () => {
      try {
        await closeDbPool();
        console.log('[Process]: Database connection pool successfully closed.');
      } catch (err) {
        console.error('[Process Error]: Error closing DB pool during shutdown:', err);
      }
      process.exit(0);
    });

    // Enforce 10s shutdown timeout to prevent hung processes
    setTimeout(() => {
      console.error('[Process Fatal]: Forced exit after 10s graceful shutdown timeout.');
      process.exit(1);
    }, 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Process-level guards: intercept transient socket EOF/EPIPE errors without suppressing genuine bugs
process.on('uncaughtException', (err: any) => {
  const isSocketWriteError =
    err &&
    (err.code === 'EOF' ||
      err.code === 'EPIPE' ||
      err.code === 'ECONNRESET' ||
      (err.syscall === 'write' && (err.code === 'EOF' || String(err.message).includes('EOF'))));

  if (isSocketWriteError) {
    console.warn(`[Process Socket Warning]: Unhandled socket write error (${err.code || 'EOF'}) intercepted; backend remaining active:`, err.message);
    return;
  }

  // Preserve fail-fast behavior for actual logic bugs (ReferenceError, TypeError, etc.)
  console.error('[Process Fatal Uncaught Exception]:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: any) => {
  const isSocketWriteError =
    reason &&
    typeof reason === 'object' &&
    (reason.code === 'EOF' ||
      reason.code === 'EPIPE' ||
      reason.code === 'ECONNRESET' ||
      (reason.syscall === 'write' && (reason.code === 'EOF' || String(reason.message).includes('EOF'))));

  if (isSocketWriteError) {
    console.warn(`[Process Socket Warning]: Unhandled promise rejection from socket write error intercepted:`, reason?.message || reason);
    return;
  }

  console.error('[Process Unhandled Rejection]:', reason);
});

startServer().catch(err => {
  console.error('[FinSight Server Fatal Startup Error]:', err);
  process.exit(1);
});
