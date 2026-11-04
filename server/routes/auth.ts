import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getUserByEmail,
  getUserById,
  createUser,
  sanitizeUser,
} from '../repositories/userRepository.js';
import {
  hashPassword,
  verifyPassword,
  signSessionToken,
  verifySessionToken,
  getSessionCookieOptions,
  SESSION_COOKIE_NAME,
} from '../services/authService.js';

export const authRouter = Router();

authRouter.use((_req, res, next) => {
  res.setHeader('X-Environment', 'development-isolated');
  res.setHeader('X-Auth-Mode', 'session-cookie-authenticated');
  next();
});

// Rate limiting on login attempts: 10 in production, 100 in dev/test per 15 minutes per IP
const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many login attempts. Please wait 15 minutes before trying again.',
  },
});

// Rate limiting on registration attempts: 10 in production, 100 in dev/test per 15 minutes per IP
const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Too many account registration attempts. Please wait 15 minutes before trying again.',
  },
});

/**
 * Validates email format.
 */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * POST /api/auth/register
 * Public registration endpoint. Always creates a user with role 'user'.
 */
authRouter.post('/register', registerRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, displayName, monthlyIncome } = req.body;

    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      res.status(400).json({ status: 'error', message: 'Please provide a valid email address.' });
      return;
    }

    if (!password || typeof password !== 'string' || password.length < 6) {
      res.status(400).json({ status: 'error', message: 'Password must be at least 6 characters in length.' });
      return;
    }

    if (!displayName || typeof displayName !== 'string' || displayName.trim() === '') {
      res.status(400).json({ status: 'error', message: 'Please provide a display name.' });
      return;
    }

    // Check if email already registered
    const existing = await getUserByEmail(email);
    if (existing) {
      res.status(409).json({ status: 'error', message: 'An account with this email address already exists.' });
      return;
    }

    const passwordHash = await hashPassword(password);
    const user = await createUser({
      email,
      passwordHash,
      displayName,
      monthlyIncome: monthlyIncome !== undefined ? Number(monthlyIncome) : 48500.00,
    });

    // Issue signed session token
    const token = signSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    res.status(201).json({
      status: 'ok',
      message: 'Account successfully registered.',
      user,
      token,
    });
  } catch (error) {
    console.error('[API /api/auth/register Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'An unexpected error occurred during registration.' });
  }
});

/**
 * POST /api/auth/login
 * Authenticates user credentials with rate limiting and generic error responses.
 */
authRouter.post('/login', loginRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      res.status(400).json({ status: 'error', message: 'Please enter both email and password.' });
      return;
    }

    const user = await getUserByEmail(email);

    // Generic error to prevent email enumeration
    const GENERIC_AUTH_ERROR = 'Invalid email or password.';

    if (!user) {
      res.status(401).json({ status: 'error', message: GENERIC_AUTH_ERROR });
      return;
    }

    const isMatch = await verifyPassword(password, user.password_hash);
    if (!isMatch) {
      res.status(401).json({ status: 'error', message: GENERIC_AUTH_ERROR });
      return;
    }

    const sanitized = sanitizeUser(user);

    // Issue signed session token
    const token = signSessionToken({
      sub: sanitized.id,
      email: sanitized.email,
      role: sanitized.role,
    });

    res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

    res.status(200).json({
      status: 'ok',
      message: 'Authentication successful.',
      user: sanitized,
      token,
    });
  } catch (error) {
    console.error('[API /api/auth/login Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'An unexpected error occurred during authentication.' });
  }
});

/**
 * GET /api/auth/me
 * Returns the currently authenticated user based on the verified session cookie.
 */
authRouter.get('/me', async (req: Request, res: Response) => {
  try {
    // Look in cookies first, or Authorization Bearer header as fallback
    let token = req.cookies?.[SESSION_COOKIE_NAME];
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      res.status(401).json({ status: 'unauthenticated', message: 'No active session found.' });
      return;
    }

    const payload = verifySessionToken(token);
    if (!payload || !payload.sub) {
      res.status(401).json({ status: 'unauthenticated', message: 'Session token is invalid or expired.' });
      return;
    }

    const user = await getUserById(payload.sub);
    if (!user) {
      res.status(401).json({ status: 'unauthenticated', message: 'User account no longer exists.' });
      return;
    }

    res.status(200).json({
      status: 'authenticated',
      user: sanitizeUser(user),
      token,
    });
  } catch (error) {
    console.error('[API /api/auth/me Error]:', error instanceof Error ? error.message : 'Unknown');
    res.status(500).json({ status: 'error', message: 'Failed to verify session.' });
  }
});

/**
 * POST /api/auth/logout
 * Clears the session cookie.
 */
authRouter.post('/logout', (_req: Request, res: Response) => {
  const { maxAge: _unusedMaxAge, ...cookieOptions } = getSessionCookieOptions();
  res.cookie(SESSION_COOKIE_NAME, '', {
    ...cookieOptions,
    maxAge: 0,
    expires: new Date(0),
  });
  res.status(200).json({
    status: 'ok',
    message: 'Session terminated successfully.',
  });
});
