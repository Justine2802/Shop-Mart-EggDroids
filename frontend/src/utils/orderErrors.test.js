import { describe, expect, it } from 'vitest';
import { describeOrderError } from './orderErrors.js';

// DEFECT-01: checkout showed only "Check the customer and cart information." when the server
// rejected a field (e.g. juan@localhost passes the browser's email check but not the server's),
// so the customer could not tell what to correct.
describe('describeOrderError', () => {
  it('names the rejected customer fields', () => {
    const error = Object.assign(new Error('Check the customer and cart information.'), {
      code: 'INVALID_ORDER',
      details: { formErrors: [], fieldErrors: { email: ['Invalid email address'] } }
    });
    expect(describeOrderError(error)).toBe('Check the customer and cart information. Email address: enter a valid email address such as name@example.com.');
  });

  it('lists several fields in form order', () => {
    const error = Object.assign(new Error('Check the customer and cart information.'), {
      code: 'INVALID_ORDER',
      details: { fieldErrors: { address: ['Too small'], customerName: ['Too small'] } }
    });
    const message = describeOrderError(error);
    expect(message.indexOf('Full name')).toBeLessThan(message.indexOf('Delivery address'));
  });

  it('describes a cart problem', () => {
    const error = Object.assign(new Error('Check the customer and cart information.'), {
      code: 'INVALID_ORDER', details: { fieldErrors: { items: ['Too small'] } }
    });
    expect(describeOrderError(error)).toContain('Cart:');
  });

  it('keeps other server messages unchanged', () => {
    const error = Object.assign(new Error('Only 5 unit(s) of 1080p Webcam are available.'), { code: 'INSUFFICIENT_STOCK' });
    expect(describeOrderError(error)).toBe('Only 5 unit(s) of 1080p Webcam are available.');
  });
});
