import { useState } from 'react';
import { Link } from 'react-router-dom';
import StatusMessage from '../components/StatusMessage.jsx';
import { api } from '../services/api.js';

const formatPeso = (value) => `₱${Number(value).toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;

export default function AssistantPage() {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function ask(event) {
    event.preventDefault(); setError(''); setResult(null); setLoading(true);
    try { setResult(await api.askAssistant(question)); }
    catch (caught) {
      setError(caught.status === 429
        ? 'You have asked several questions in a short time. Please wait a minute and try again.'
        : caught.message);
    }
    finally { setLoading(false); }
  }

  return (
    <section className="assistant-layout">
      <div>
        <p className="eyebrow">CATALOG-GROUNDED ASSISTANT</p>
        <h1>Find a product</h1>
        <p>Ask about a product type or budget. Answers use only current ShopSmart catalog data, and every recommended product links to its catalog page.</p>
        <form onSubmit={ask}>
          <label>Your question<textarea value={question} onChange={(event) => setQuestion(event.target.value)} minLength="3" maxLength="300" placeholder="Which keyboard is below ₱2,000?" required /></label>
          <button disabled={loading}>{loading ? 'Searching…' : 'Ask ShopSmart'}</button>
        </form>
      </div>
      <div className="assistant-answer" aria-live="polite" aria-busy={loading}>
        <h2>Assistant response</h2>
        <StatusMessage type="error">{error}</StatusMessage>
        {loading && <StatusMessage>Checking the current catalog and preparing an answer…</StatusMessage>}
        {!result && !error && !loading && <p>Your answer will appear here.</p>}
        {result && <>
          <p className={`answer-mode ${result.mode === 'ai' ? 'ai' : 'rules'}`}>
            {result.mode === 'ai' ? 'AI-drafted, verified against the catalog' : 'Answered from catalog data'}
          </p>
          <p className="answer-text">{result.answer}</p>
          <StatusMessage>{result.notice}</StatusMessage>
          {result.recommendedProducts.length > 0 && <div className="recommendations">
            {result.recommendedProducts.map((product) => (
              <Link key={product.id} to={`/products/${product.id}`}>
                <span>{product.name}</span>
                <span className="recommendation-meta">{formatPeso(product.price)}{product.stock !== undefined && ` · ${product.stock} in stock`}</span>
              </Link>
            ))}
          </div>}
          <details className="answer-sources" open={result.sources.length > 0}>
            <summary>Sources ({result.sources.length})</summary>
            {result.sources.length === 0
              ? <p>No catalog product matched, so no product is cited.</p>
              : <ul>
                {result.sources.map((source) => (
                  <li key={`${source.type}-${source.id}`}>
                    <Link to={`/products/${source.id}`}>Product #{source.id}: {source.name}</Link>
                    {source.price !== undefined && <> · {formatPeso(source.price)} · {source.stock} in stock</>}
                  </li>
                ))}
              </ul>}
          </details>
        </>}
      </div>
    </section>
  );
}
