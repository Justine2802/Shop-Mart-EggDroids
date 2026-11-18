import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import SignInPrompt from '../components/SignInPrompt.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { formatDate, formatPeso } from '../utils/format.js';

export default function OrderDetailsPage() {
  const { orderId } = useParams();
  const { user, checking } = useAuth();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    api.getOrder(orderId)
      .then((data) => { if (active) { setOrder(data); setError(''); } })
      .catch((caught) => { if (active) { setOrder(null); setError(caught.message); } });
    return () => { active = false; };
  }, [orderId, user]);

  if (checking) return <section><StatusMessage>Checking your session…</StatusMessage></section>;
  if (!user) return <SignInPrompt title="Sign in to see this order" />;
  if (error) return (
    <section>
      <StatusMessage type="error">{error}</StatusMessage>
      <Link className="button secondary" to="/orders">Back to my orders</Link>
    </section>
  );
  if (!order || String(order.id) !== orderId) return <section><StatusMessage>Loading order…</StatusMessage></section>;

  return (
    <section className="summary order-details">
      <p className="eyebrow">ORDER #{order.id} · {order.status}</p>
      <h1>Placed {formatDate(order.createdAt)}</h1>
      <p><span>Deliver to</span><span>{order.customerName}, {order.address}</span></p>
      <ul className="checkout-items">
        {order.items.map((item) => (
          <li key={item.id}>
            <span>{item.product.emoji} {item.product.name} × {item.quantity}</span>
            <strong>{formatPeso(item.unitPrice * item.quantity)}</strong>
          </li>
        ))}
      </ul>
      <p className="summary-total"><span>Total</span><strong>{formatPeso(order.total)}</strong></p>
      <Link className="button secondary" to="/orders">Back to my orders</Link>
    </section>
  );
}
