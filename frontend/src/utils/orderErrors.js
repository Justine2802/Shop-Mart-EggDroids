// Turn an order API error into a message that tells the customer what to correct.
// The server returns zod's flattened errors in `details.fieldErrors` for INVALID_ORDER.
const FIELD_HINTS = [
  ['customerName', 'Full name: enter 2 to 80 characters.'],
  ['email', 'Email address: enter a valid email address such as name@example.com.'],
  ['address', 'Delivery address: enter 10 to 300 characters.'],
  ['items', 'Cart: review the products and quantities in your cart.']
];

export function describeOrderError(error) {
  const fieldErrors = error?.details?.fieldErrors;
  if (error?.code !== 'INVALID_ORDER' || !fieldErrors) return error?.message ?? 'The order could not be placed.';
  const hints = FIELD_HINTS.filter(([field]) => fieldErrors[field]?.length).map(([, hint]) => hint);
  return [error.message, ...hints].join(' ');
}
