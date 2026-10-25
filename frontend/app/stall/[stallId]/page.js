'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiRequest } from '../../../lib/api';
import { useRequireRole } from '../../../lib/use-require-role';

export default function StallMenuPage() {
  const params = useParams();
  const router = useRouter();
  const { user, ready } = useRequireRole('customer');
  const [stall, setStall] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState({});
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);

  useEffect(() => {
    if (!ready || !params.stallId) return;
    apiRequest(`/stalls/${params.stallId}/products`)
      .then(({ data }) => { setStall(data.stall); setProducts(data.products); })
      .catch((requestError) => setError(requestError.message));
  }, [ready, params.stallId]);

  const cartItems = useMemo(
    () => products.filter((product) => cart[product.product_id] > 0),
    [products, cart]
  );
  const total = cartItems.reduce((sum, product) => sum + Number(product.price) * cart[product.product_id], 0);

  function changeQuantity(product, amount) {
    setCart((current) => {
      const nextQuantity = Math.max(0, Math.min(Number(product.quantity_in_stock), (current[product.product_id] || 0) + amount));
      return { ...current, [product.product_id]: nextQuantity };
    });
  }

  async function submitOrder() {
    setError('');
    setPlacingOrder(true);
    try {
      const result = await apiRequest('/customer/orders', {
        method: 'POST',
        body: JSON.stringify({ items: cartItems.map((product) => ({ product_id: product.product_id, quantity: cart[product.product_id] })) }),
      });
      setOrder(result.data);
      setCart({});
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPlacingOrder(false);
    }
  }

  if (!ready) return <main className="site-shell"><p className="message">Loading...</p></main>;

  return (
    <main className="site-shell">
      <header className="navbar">
        <Link href="/" className="brand"><span className="brand-icon">S</span>Stall<span>Hub</span></Link>
        <nav className="nav-links"><Link href="/">All stalls</Link><Link href="/orders">My Orders</Link></nav>
        <span className="account-name">{user?.full_name}</span>
      </header>
      <section className="menu-page">
        <Link href="/" className="back-link">← All stalls</Link>
        {error && <div className="error-message" role="alert">{error}</div>}
        {stall && <>
          <div className="menu-heading"><p className="eyebrow">HNU CAMPUS STALL</p><h1>{stall.store_name}</h1><p>{stall.store_location || 'Holy Name University'}{stall.description ? ` · ${stall.description}` : ''}</p></div>
          {order && <div className="success-message" role="status"><strong>Order #{order.order_id} placed!</strong> Your order is pending confirmation. <Link href="/orders">Track order →</Link></div>}
          {products.length === 0 ? <div className="empty-state"><h3>No available menu items</h3><p>This stall has no items available right now.</p></div> : (
            <div className="menu-layout">
              <div className="menu-grid">
                {products.map((product) => (
                  <article className="menu-item-card" key={product.product_id}>
                    {product.image_url ? <img className="menu-item-image" src={product.image_url} alt="" /> : <div className="menu-item-image menu-item-placeholder">{product.product_name.charAt(0).toUpperCase()}</div>}
                    <div className="menu-item-body"><p className="eyebrow">AVAILABLE · {product.quantity_in_stock} LEFT</p><h3>{product.product_name}</h3>{product.product_description && <p>{product.product_description}</p>}
                      <div className="menu-item-bottom"><strong>₱{Number(product.price).toFixed(2)}</strong><div className="quantity-control"><button onClick={() => changeQuantity(product, -1)} aria-label={`Remove one ${product.product_name}`}>−</button><span>{cart[product.product_id] || 0}</span><button onClick={() => changeQuantity(product, 1)} disabled={(cart[product.product_id] || 0) >= Number(product.quantity_in_stock)} aria-label={`Add one ${product.product_name}`}>+</button></div></div>
                    </div>
                  </article>
                ))}
              </div>
              <aside className="cart-card">
                <p className="eyebrow">YOUR CART</p><h2>Order summary</h2>
                {cartItems.length === 0 ? <p className="muted-copy">Choose items to start your order.</p> : cartItems.map((product) => <div className="cart-line" key={product.product_id}><span>{cart[product.product_id]} × {product.product_name}</span><strong>₱{(Number(product.price) * cart[product.product_id]).toFixed(2)}</strong></div>)}
                <div className="cart-total"><span>Total</span><strong>₱{total.toFixed(2)}</strong></div>
                <button className="submit-button" onClick={submitOrder} disabled={cartItems.length === 0 || placingOrder}>{placingOrder ? 'Placing order...' : 'Place order'}</button>
                <p className="muted-copy">Prices and stock are verified by the server at checkout.</p>
              </aside>
            </div>
          )}
        </>}
      </section>
    </main>
  );
}
