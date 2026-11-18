import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { useAuth } from '../context/AuthContext.jsx';

// Only allow redirects to paths inside this app (prevents ?next=https://evil.example).
function safeNext(value) {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : '/orders';
}

export default function AccountPage() {
  const { user, checking, login, register, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (checking) return <section><StatusMessage>Checking your session…</StatusMessage></section>;

  if (user) return (
    <section className="success-card">
      <p className="eyebrow">SIGNED IN</p>
      <h1>Hello, {user.name}</h1>
      <p>{user.email}</p>
      <div className="button-row">
        <Link className="button" to="/orders">My orders</Link>
        <button type="button" className="button secondary" onClick={logout}>Sign out</button>
      </div>
    </section>
  );

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') await login({ email: form.email, password: form.password });
      else await register(form);
      navigate(safeNext(searchParams.get('next')), { replace: true });
    } catch (caught) {
      setError(caught.message);
    } finally {
      setSubmitting(false);
    }
  }

  const isLogin = mode === 'login';
  return (
    <section className="account-layout">
      <form onSubmit={submit}>
        <p className="eyebrow">{isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}</p>
        <h1>{isLogin ? 'Welcome back' : 'Create a test account'}</h1>
        <StatusMessage>Demo store: use a fictional name and an @example.com email. Do not reuse a real password.</StatusMessage>
        <StatusMessage type="error">{error}</StatusMessage>
        {!isLogin && <label>Name<input name="name" value={form.name} onChange={updateField} minLength="2" maxLength="80" required autoComplete="name" /></label>}
        <label>Email address<input name="email" type="email" value={form.email} onChange={updateField} required autoComplete="email" /></label>
        <label>Password<input name="password" type="password" value={form.password} onChange={updateField} minLength={isLogin ? 1 : 8} maxLength="128" required autoComplete={isLogin ? 'current-password' : 'new-password'} /></label>
        <button disabled={submitting}>{submitting ? 'Please wait…' : isLogin ? 'Sign in' : 'Create account'}</button>
        <button type="button" className="link-button" onClick={() => { setMode(isLogin ? 'register' : 'login'); setError(''); }}>
          {isLogin ? 'New here? Create an account' : 'Already have an account? Sign in'}
        </button>
      </form>
    </section>
  );
}
