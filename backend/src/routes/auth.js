import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { endSession, hashPassword, publicUser, startSession, verifyPassword } from '../lib/auth.js';
import { loginSchema, registerSchema } from '../validators/schemas.js';
const router = Router();

// Slows password guessing: 10 sign-in or sign-up attempts per IP per 15 minutes.
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false });

// A fixed hash to compare against when the email is unknown, so both cases take similar time.
const dummyHash = hashPassword('not-a-real-password');

router.post('/register', authLimiter, async (request, response, next) => {
  try {
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_ACCOUNT', message: 'Enter your name, a valid email and a password of at least 8 characters.', details: parsed.error.flatten() } });
    const { name, email, password } = parsed.data;
    let user;
    try {
      user = await prisma.user.create({ data: { name, email, passwordHash: await hashPassword(password) } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return response.status(409).json({ error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists. Sign in instead.' } });
      }
      throw error;
    }
    await startSession(response, user.id);
    response.status(201).json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

router.post('/login', authLimiter, async (request, response, next) => {
  try {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_LOGIN', message: 'Enter a valid email and your password.' } });
    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });
    const valid = await verifyPassword(parsed.data.password, user ? user.passwordHash : await dummyHash);
    if (!user || !valid) return response.status(401).json({ error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect.' } });
    await startSession(response, user.id);
    response.json({ user: publicUser(user) });
  } catch (error) { next(error); }
});

router.post('/logout', async (request, response, next) => {
  try {
    await endSession(request, response);
    response.status(204).end();
  } catch (error) { next(error); }
});

// Guests get 200 { user: null } so the frontend can check the session on every page load without a console error.
router.get('/me', (request, response) => response.json({ user: request.user ?? null }));

export default router;
