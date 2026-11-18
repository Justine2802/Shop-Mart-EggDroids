import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { requireUser } from '../lib/auth.js';
import { orderIdSchema, orderSchema } from '../validators/schemas.js';
const router = Router();

// Every order route needs a signed-in customer. Ownership is checked in each query (userId = request.user.id),
// so a customer can never read another customer's order, even by guessing its id.
router.use(requireUser);

function serializeOrder(order) {
  return {
    ...order,
    total: Number(order.total),
    items: order.items.map((item) => ({ ...item, unitPrice: Number(item.unitPrice) }))
  };
}

const ORDER_ITEMS = { items: { include: { product: { select: { id: true, name: true, emoji: true } } }, orderBy: { id: 'asc' } } };

router.get('/', async (request, response, next) => {
  try {
    const orders = await prisma.order.findMany({ where: { userId: request.user.id }, include: ORDER_ITEMS, orderBy: { createdAt: 'desc' } });
    response.json(orders.map(serializeOrder));
  } catch (error) { next(error); }
});

router.get('/:id', async (request, response, next) => {
  try {
    const id = orderIdSchema.safeParse(request.params.id);
    if (!id.success) return response.status(400).json({ error: { code: 'INVALID_ORDER_ID', message: 'Order ID must be a positive integer.' } });
    // Someone else's order gets the same 404 as a missing one, so ids cannot be probed.
    const order = await prisma.order.findFirst({ where: { id: id.data, userId: request.user.id }, include: ORDER_ITEMS });
    if (!order) return response.status(404).json({ error: { code: 'ORDER_NOT_FOUND', message: 'Order not found.' } });
    response.json(serializeOrder(order));
  } catch (error) { next(error); }
});

router.post('/', async (request, response, next) => {
  try {
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) return response.status(422).json({ error: { code: 'INVALID_ORDER', message: 'Check the customer and cart information.', details: parsed.error.flatten() } });

    const productIds = [...new Set(parsed.data.items.map((item) => item.productId))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds }, active: true } });
    if (products.length !== productIds.length) return response.status(422).json({ error: { code: 'PRODUCT_UNAVAILABLE', message: 'One or more products are unavailable.' } });

    const productMap = new Map(products.map((product) => [product.id, product]));
    const normalizedItems = parsed.data.items.map((item) => ({ ...item, product: productMap.get(item.productId) }));
    const unavailable = normalizedItems.find((item) => item.quantity > item.product.stock);
    if (unavailable) return response.status(409).json({ error: { code: 'INSUFFICIENT_STOCK', message: `Only ${unavailable.product.stock} unit(s) of ${unavailable.product.name} are available.` } });

    const total = normalizedItems.reduce((sum, item) => sum.plus(new Prisma.Decimal(item.product.price).times(item.quantity)), new Prisma.Decimal(0));
    const order = await prisma.$transaction(async (transaction) => {
      for (const item of normalizedItems) {
        const updated = await transaction.product.updateMany({
          where: { id: item.productId, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } }
        });
        if (updated.count !== 1) throw Object.assign(new Error('Stock changed while placing the order.'), { status: 409, code: 'STOCK_CHANGED' });
      }
      return transaction.order.create({
        data: {
          customerName: parsed.data.customerName, email: parsed.data.email, address: parsed.data.address, total,
          userId: request.user.id,
          items: { create: normalizedItems.map((item) => ({ productId: item.productId, quantity: item.quantity, unitPrice: item.product.price })) }
        },
        include: { items: true }
      });
    });
    response.status(201).json(serializeOrder(order));
  } catch (error) { next(error); }
});

export default router;
