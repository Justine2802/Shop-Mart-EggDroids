const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function request(path, { timeoutMs, ...options } = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
    });
  } catch (caught) {
    const timedOut = caught?.name === 'TimeoutError' || caught?.name === 'AbortError';
    const error = new Error(timedOut
      ? 'ShopSmart took too long to answer. Please try again.'
      : 'Could not reach the ShopSmart server. Check your connection and try again.');
    error.code = timedOut ? 'CLIENT_TIMEOUT' : 'NETWORK_ERROR';
    throw error;
  }

  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const message = data?.error?.message || `Request failed with status ${response.status}.`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.error?.code;
    error.details = data?.error?.details;
    throw error;
  }
  return data;
}

export const api = {
  getProducts: (query = '') => request(`/products${query ? `?search=${encodeURIComponent(query)}` : ''}`),
  getProduct: (id) => request(`/products/${id}`),
  createOrder: (order) => request('/orders', { method: 'POST', body: JSON.stringify(order) }),
  askAssistant: (question) => request('/assistant/questions', {
    // Longer than the server's provider timeout, so the server fallback normally wins,
    // but the page can never wait forever.
    method: 'POST', body: JSON.stringify({ question }), timeoutMs: 20_000
  })
};
