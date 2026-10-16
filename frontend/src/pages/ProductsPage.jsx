import { useEffect, useState } from 'react';
import ProductCard from '../components/ProductCard.jsx';
import StatusMessage from '../components/StatusMessage.jsx';
import { useCart } from '../context/CartContext.jsx';
import { api } from '../services/api.js';

export default function ProductsPage() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortOrder, setSortOrder] = useState('default');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { addToCart, cartMessage } = useCart();
  const searchTerm = search.trim();

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api.getProducts(searchTerm)
      .then((data) => {
        setCategories((current) => [
          'All',
          ...new Set([...current.slice(1), ...data.products.map((product) => product.category)])
        ]);
        if (active) setProducts(data.products);
      })
      .catch((caught) => {
        if (!active) return;
        setProducts([]);
        setError(caught.message);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [searchTerm]);

  const visibleProducts = products.filter((product) => {
    const matchesCategory = category === 'All' || product.category === category;
    return matchesCategory;
  });
  const sortedProducts = [...visibleProducts];
  if (sortOrder === 'price-ascending') {
    sortedProducts.sort((a, b) => Number(a.price) - Number(b.price));
  } else if (sortOrder === 'price-descending') {
    sortedProducts.sort((a, b) => Number(b.price) - Number(a.price));
  } else if (sortOrder === 'name-ascending') {
    sortedProducts.sort((a, b) => a.name.localeCompare(b.name));
  }

  return (
    <section>
      <div className="hero">
        <div>
          <p className="eyebrow">BSIT FULL-STACK PROJECT</p>
          <h1>Technology for study, work and play</h1>
          <p>Browse the starter catalog, build a cart and complete a simulated order.</p>
        </div>
      </div>

      <div className="toolbar">
        <label>
          <span>Search products</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Try keyboard" />
        </label>
        <label>
          <span>Category</span>
          <select value={category} onChange={(event) => setCategory(event.target.value)}>
            {categories.map((item) => <option key={item}>{item}</option>)}
          </select>
        </label>
        <label>
          <span>Sort</span>
          <select value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
            <option value="default">Default</option>
            <option value="price-ascending">Price: low to high</option>
            <option value="price-descending">Price: high to low</option>
            <option value="name-ascending">Name: A to Z</option>
          </select>
        </label>
      </div>

      <StatusMessage>{cartMessage}</StatusMessage>
      {loading && <StatusMessage>Loading products…</StatusMessage>}
      {error && <StatusMessage type="error">{error} Make sure the backend is running.</StatusMessage>}
      {!loading && !error && visibleProducts.length === 0 && <StatusMessage>No products match your search and filters.</StatusMessage>}

      {!loading && !error && (
        <div className="product-grid">
          {sortedProducts.map((product) => (
            <ProductCard key={product.id} product={product} onAddToCart={addToCart} />
          ))}
        </div>
      )}
    </section>
  );
}
