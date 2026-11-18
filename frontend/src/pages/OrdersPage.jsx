import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import SignInPrompt from '../components/SignInPrompt.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { formatDate, formatPeso } from '../utils/format.js';

export default function OrdersPage() {
  const { user, checking } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return undefined;
    let active = true;
    api.getOrders()
      .then((data) => { if (active) setOrders(data); })
      .catch((caught) => { if (active) setError(caught.message); });
    return () => { active = false; };
  }, [user]);

  if (checking) return <section><StatusMessage>Checking your session…</StatusMessage></section>;
  if (!user) return <SignInPrompt title="Sign in to see your orders" />;
  if (error) return <section><StatusMessage type="error">{error}</StatusMessage></section>;
  if (!orders) return <section><StatusMessage>Loading your orders…</StatusMessage></section>;
  if (orders.length === 0) return <section><div className="empty-state"><h1>No orders yet</h1><Link className="button" to="/">Browse products</Link></div></section>;

  return (
    <section>
      <p className="eyebrow">MY ORDERS</p>
      <h1>Your simulated orders</h1>
      <ul className="order-list">
        {orders.map((order) => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`}>
              <strong>Order #{order.id}</strong>
              <span>{formatDate(order.createdAt)} · {order.items.length} item(s) · {order.status}</span>
              <strong>{formatPeso(order.total)}</strong>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
