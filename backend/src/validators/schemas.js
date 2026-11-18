import { z } from 'zod';

// Largest value a PostgreSQL INTEGER (Prisma Int) column can hold.
export const MAX_DB_INT = 2_147_483_647;

export const orderSchema = z.object({
  customerName: z.string().trim().min(2).max(80),
  email: z.email(),
  address: z.string().trim().min(10).max(300),
  items: z.array(z.object({
    productId: z.coerce.number().int().positive().max(MAX_DB_INT),
    quantity: z.coerce.number().int().min(1).max(20)
  })).min(1).max(20).refine(
    (items) => new Set(items.map((item) => item.productId)).size === items.length,
    { message: 'Each product may appear only once in an order.' }
  )
});

export const assistantQuestionSchema = z.object({
  question: z.string().trim().min(3).max(300)
});

const accountEmail = z.string().trim().toLowerCase().pipe(z.email().max(254));

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: accountEmail,
  password: z.string().min(8).max(128)
});

export const loginSchema = z.object({
  email: accountEmail,
  password: z.string().min(1).max(128)
});

export const orderIdSchema = z.coerce.number().int().positive().max(MAX_DB_INT);
