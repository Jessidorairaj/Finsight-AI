import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { CookieOptions } from 'express';

const BCRYPT_SALT_ROUNDS = 10;
const SESSION_EXPIRATION = '7d';
export const SESSION_COOKIE_NAME = 'finsight_session';

/**
 * Retrieves the JWT secret from environment variables.
 * Disallows using DATABASE_URL as a secret fallback.
 */
function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: JWT_SECRET environment variable is missing in production runtime.');
    }
    // Fallback development secret with prominent warning
    console.warn('[AUTH WARNING]: JWT_SECRET is not configured. Using development fallback secret.');
    return 'dev_jwt_secret_finsight_ai_strictly_for_local_testing_min_32_chars';
  }
  if (process.env.NODE_ENV === 'production' && secret.trim().length < 32) {
    throw new Error('FATAL: JWT_SECRET must be at least 32 characters in length for production security.');
  }
  return secret.trim();
}

/**
 * Hashes a plaintext password using bcrypt.
 */
export async function hashPassword(plaintext: string): Promise<string> {
  return bcrypt.hash(plaintext, BCRYPT_SALT_ROUNDS);
}

/**
 * Verifies a plaintext password against a stored bcrypt hash.
 */
export async function verifyPassword(plaintext: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plaintext, hash);
}

export interface SessionPayload {
  sub: string;
  email: string;
  role: 'user' | 'admin';
}

/**
 * Signs an authenticated session JWT token.
 */
export function signSessionToken(payload: SessionPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: SESSION_EXPIRATION });
}

/**
 * Verifies a session JWT token and returns the decoded payload.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getJwtSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

/**
 * Returns secure cookie options.
 * Configured with sameSite: 'none' and secure: true to ensure cookies are
 * properly delivered within AI Studio's cross-origin HTTPS iframe preview environment.
 */
export function getSessionCookieOptions(): CookieOptions {
  const sameSite = (process.env.COOKIE_SAME_SITE as 'none' | 'lax' | 'strict') || 'none';
  return {
    httpOnly: true,
    secure: true,
    sameSite,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };
}
