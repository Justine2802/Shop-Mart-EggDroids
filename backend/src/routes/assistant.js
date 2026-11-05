import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { createProviderFromEnv } from '../services/aiProvider.js';
import { answerQuestion } from '../services/assistant.js';
import { assistantQuestionSchema } from '../validators/schemas.js';
const router = Router();

const assistantLimiter = rateLimit({ windowMs: 60_000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false });

// Only public catalog fields are loaded. Orders, customer data and timestamps never reach the assistant.
const PUBLIC_PRODUCT_FIELDS = { id: true, name: true, description: true, category: true, price: true, stock: true, active: true };

router.post('/questions', assistantLimiter, async (request, response, next) => {
  try {
    const parsed = assistantQuestionSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_QUESTION', message: 'Question must contain between 3 and 300 characters.' } });
    const products = await prisma.product.findMany({ where: { active: true }, select: PUBLIC_PRODUCT_FIELDS, orderBy: { price: 'asc' } });
    const result = await answerQuestion({
      products,
      question: parsed.data.question,
      provider: createProviderFromEnv(),
      // Log codes only: never the API key, the prompt, or the raw model output.
      log: (event) => console.warn(`[${request.id}] assistant ${event.event}: ${event.code}${event.status ? ` (HTTP ${event.status})` : ''}${event.detail ? ` [${event.detail}]` : ''}`)
    });
    delete result.fallbackReason; // internal diagnostic code; the customer sees `notice` instead
    response.json(result);
  } catch (error) { next(error); }
});

export default router;
