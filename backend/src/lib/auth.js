// Customer sign-in for ShopSmart (fictional test customers only).
// - Passwords are hashed with scrypt (Node's built-in crypto), never stored or logged in plain text.
// - A session is a random token in an httpOnly cookie; the database stores only its SHA-256 hash,
//   so a leaked database row cannot be replayed as a cookie.
// This is application identity. It has nothing to do with AWS IAM, which controls who manages servers.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { prisma } from './prisma.js';

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 64;

export const SESSION_COOKIE = 'shopsmart_session';
export const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, saltText, hashText] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltText || !hashText) return false;
  const expected = Buffer.from(hashText, 'base64');
  const derived = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length);
  return crypto.timingSafeEqual(derived, expected);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function readCookie(request, name) {
  const header = request.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return undefined; }
    }
  }
  return undefined;
}

// Same-origin hosting (one HTTPS address) works with SameSite=Lax. Only a split frontend/API on
// different sites needs COOKIE_SAMESITE=none, which browsers accept only together with Secure.
export function cookieOptions() {
  const sameSite = (process.env.COOKIE_SAMESITE || 'lax').toLowerCase();
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    path: '/',
    maxAge: SESSION_TTL_MS
  };
}

export async function startSession(response, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await prisma.session.create({
    data: { tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) }
  });
  response.cookie(SESSION_COOKIE, token, cookieOptions());
}

export async function endSession(request, response) {
  const token = readCookie(request, SESSION_COOKIE);
  if (token) await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  const options = cookieOptions();
  delete options.maxAge;
  response.clearCookie(SESSION_COOKIE, options);
}

// Attaches request.user when the cookie names a live session. Never rejects on its own.
export async function loadUser(request, _response, next) {
  try {
    const token = readCookie(request, SESSION_COOKIE);
    if (!token) return next();
    const session = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
    if (session && session.expiresAt > new Date()) {
      request.user = { id: session.user.id, email: session.user.email, name: session.user.name };
    }
    next();
  } catch (error) { next(error); }
}

export function requireUser(request, response, next) {
  if (!request.user) {
    return response.status(401).json({ error: { code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' } });
  }
  next();
}

export function publicUser(user) {
  return { id: user.id, email: user.email, name: user.name };
}
