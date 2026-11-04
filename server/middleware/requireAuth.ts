import { Request, Response, NextFunction } from 'express';
import { verifySessionToken, SESSION_COOKIE_NAME } from '../services/authService.js';
import { getUserById, sanitizeUser, SanitizedUser } from '../repositories/userRepository.js';

// Extend Express Request interface to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: SanitizedUser;
    }
  }
}

/**
 * Middleware: Enforces that requests contain a cryptographically valid session token,
 * queries the database for the active user record (guaranteeing fresh role check),
 * and attaches req.user.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authStart = performance.now();
  try {
    let token = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token === 'string') {
      token = token.trim();
      if (token === '' || token === 'undefined' || token === 'null') {
        token = undefined;
      }
    }

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      const headerToken = req.headers.authorization.split(' ')[1]?.trim();
      if (headerToken && headerToken !== 'undefined' && headerToken !== 'null') {
        token = headerToken;
      }
    }

    if (!token) {
      res.status(401).json({
        status: 'error',
        message: 'Authentication required. No active session found.',
      });
      return;
    }

    const payload = verifySessionToken(token);
    if (!payload || !payload.sub) {
      res.status(401).json({
        status: 'error',
        message: 'Invalid or expired session token.',
      });
      return;
    }

    // Always fetch fresh user from database to verify active existence and current role
    const dbUser = await getUserById(payload.sub);
    if (!dbUser) {
      res.status(401).json({
        status: 'error',
        message: 'User account associated with this session no longer exists.',
      });
      return;
    }

    // Attach verified user identity from database
    req.user = sanitizeUser(dbUser);
    (req as any).authMs = parseFloat((performance.now() - authStart).toFixed(2));
    next();
  } catch (error) {
    console.error('[requireAuth Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({
      status: 'error',
      message: 'Authentication validation encountered an unexpected server error.',
    });
  }
}
