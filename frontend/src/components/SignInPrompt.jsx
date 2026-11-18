import { Link, useLocation } from 'react-router-dom';

export default function SignInPrompt({ title = 'Sign in to continue', children }) {
  const location = useLocation();
  const next = encodeURIComponent(location.pathname);
  return (
    <section>
      <div className="empty-state">
        <p className="eyebrow">ACCOUNT REQUIRED</p>
        <h1>{title}</h1>
        {children && <p>{children}</p>}
        <Link className="button" to={`/account?next=${next}`}>Sign in or create an account</Link>
      </div>
    </section>
  );
}
