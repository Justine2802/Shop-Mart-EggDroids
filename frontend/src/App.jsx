import { NavLink, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useCart } from './context/CartContext.jsx';
import ProductsPage from './pages/ProductsPage.jsx';
import ProductDetailsPage from './pages/ProductDetailsPage.jsx';
import CartPage from './pages/CartPage.jsx';
import CheckoutPage from './pages/CheckoutPage.jsx';
import AssistantPage from './pages/AssistantPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import AccountPage from './pages/AccountPage.jsx';
import OrdersPage from './pages/OrdersPage.jsx';
import OrderDetailsPage from './pages/OrderDetailsPage.jsx';

export default function App() {
  const { itemCount } = useCart();
  const { user } = useAuth();

  return (
    <div className="app-shell">
      <header className="site-header">
        <NavLink className="brand" to="/">ShopSmart</NavLink>
        <nav aria-label="Primary navigation">
          <NavLink to="/">Products</NavLink>
          <NavLink to="/assistant">AI Assistant</NavLink>
          <NavLink to="/cart">Cart ({itemCount})</NavLink>
          {user && <NavLink to="/orders">My orders</NavLink>}
          <NavLink to="/account">{user ? user.name.split(' ')[0] : 'Sign in'}</NavLink>
        </nav>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<ProductsPage />} />
          <Route path="/products/:productId" element={<ProductDetailsPage />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/assistant" element={<AssistantPage />} />
          <Route path="/account" element={<AccountPage />} />
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/orders/:orderId" element={<OrderDetailsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>

      <footer className="site-footer">
        ShopSmart classroom starter • Simulated purchases only
      </footer>
    </div>
  );
}
