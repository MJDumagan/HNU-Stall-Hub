'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiRequest } from '../../lib/api';
import { useRequireRole } from '../../lib/use-require-role';

export default function CustomerOrdersPage() {
  const { ready } = useRequireRole('customer');
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ready) return;
    let active = true;
    const loadOrders = () => apiRequest('/customer/orders')
      .then(({ data }) => { if (active) setOrders(data); })
      .catch((requestError) => { if (active) setError(requestError.message); });
    loadOrders();
    const timer = window.setInterval(loadOrders, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [ready]);

  if (!ready) return <main className="site-shell"><p className="message">Loading...</p></main>;
  return (
    <main className="site-shell">
      <header className="navbar"><Link href="/" className="brand"><span className="brand-icon">S</span>Stall<span>Hub</span></Link><nav className="nav-links"><Link href="/">Browse stalls</Link><Link href="/orders">My Orders</Link></nav></header>
      <section className="orders-page">
        <p className="eyebrow">CUSTOMER ACCOUNT</p><h1>My orders</h1><p className="section-description">Track active orders and revisit your order history.</p>
        {error && <div className="error-message" role="alert">{error}</div>}
        {orders.length === 0 ? <div className="empty-state"><h3>No orders yet</h3><p>Place an order at a campus stall to see it here.</p><Link href="/" className="primary-button">Browse stalls</Link></div> : (
          <div className="orders-list">{orders.map((order) => <article className="order-card" key={order.order_id}>
            <div className="order-heading"><div><p className="eyebrow">{order.store_name}</p><h2>Order #{order.order_id}</h2><p>{new Date(order.created_at).toLocaleString()}</p></div><span className="status-pill">{order.order_status}</span></div>
            <div className="order-items">{order.items.map((item) => <p key={item.product_id}>{item.quantity} × {item.product_name} <span>₱{(Number(item.unit_price) * item.quantity).toFixed(2)}</span></p>)}</div>
            <div className="cart-total"><span>Total</span><strong>₱{Number(order.total_amount).toFixed(2)}</strong></div>
          </article>)}</div>
        )}
      </section>
    </main>
  );
}
