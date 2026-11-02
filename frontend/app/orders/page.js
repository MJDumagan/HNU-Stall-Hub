'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import LoadingScreen from '../components/loading-screen';
import { apiRequest } from '../../lib/api';
import { getStallNumber } from '../../lib/stall-number';
import { useRequireRole } from '../../lib/use-require-role';

export default function CustomerOrdersPage() {
  const { ready } = useRequireRole('customer');
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState('');
  const activeOrders = orders.filter(
    (order) => !['Completed', 'Cancelled'].includes(order.order_status)
  ).length;

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

  if (!ready) return <LoadingScreen title="Your orders are on the way" message="Checking your order history..." />;
  return (
    <main className="site-shell customer-orders-page">
      <header className="navbar"><Link href="/" className="brand"><Image className="brand-logo" src="/hnu-logo.png" alt="Holy Name University crest" width={34} height={40} />Stall<span>Hub</span></Link><nav className="nav-links"><Link href="/">Browse stalls</Link><Link href="/orders">My Orders</Link></nav></header>
      <section className="orders-page">
        <div className="orders-hero">
          <div className="orders-hero-copy">
            <p className="eyebrow">YOUR CAMPUS FOOD JOURNEY</p>
            <h1>My orders</h1>
            <p>Every craving, order, and pickup — all in one place.</p>
            <Link href="/" className="orders-browse-button">Explore campus stalls <span aria-hidden="true">→</span></Link>
          </div>
          <div className="orders-overview" aria-label="Order summary">
            <div className="orders-overview-icon" aria-hidden="true">▤</div>
            <span>ORDER HISTORY</span>
            <strong>{orders.length}</strong>
            <small>{orders.length === 1 ? 'order in your history' : 'orders in your history'}</small>
            <div className="orders-overview-active"><span />{activeOrders} {activeOrders === 1 ? 'active order' : 'active orders'}</div>
          </div>
          <span className="orders-hero-decoration" aria-hidden="true" />
        </div>
        <div className="orders-section-heading">
          <div><p className="eyebrow">ORDER UPDATES</p><h2>Your orders</h2><p className="section-description">We’ll keep your order status up to date.</p></div>
          {orders.length > 0 && <span className="orders-total-count">{orders.length} {orders.length === 1 ? 'order' : 'orders'}</span>}
        </div>
        {error && <div className="error-message" role="alert">{error}</div>}
        {orders.length === 0 ? <div className="orders-empty-state"><div className="orders-empty-icon" aria-hidden="true">▤</div><h3>Your next favorite is waiting</h3><p>Place your first order from a campus stall and it will show up here.</p><Link href="/" className="primary-button">Browse stalls <span aria-hidden="true">→</span></Link></div> : (
          <div className="orders-list">{orders.map((order) => {
            const progressSteps = ['Pending', 'Confirmed', 'Preparing', 'Ready for Pickup', 'Completed'];
            const currentStep = progressSteps.indexOf(order.order_status);
            const isCancelled = order.order_status === 'Cancelled';
            return <article className="order-card customer-order-card" key={order.order_id}>
              <div className="order-heading customer-order-heading">
                <div className="customer-order-identity">
                  <span className="customer-order-icon" aria-hidden="true">▤</span>
                  <div><p className="eyebrow">STALL NO. {getStallNumber(order.store_id)}</p><h3>Order #{order.order_id}</h3><p>{new Date(order.created_at).toLocaleString()}</p></div>
                </div>
                <span className={`customer-order-status${isCancelled ? ' cancelled' : order.order_status === 'Completed' ? ' completed' : ''}`}><span aria-hidden="true" />{order.order_status}</span>
              </div>
              {isCancelled ? <div className="customer-order-cancelled">This order was cancelled.</div> : (
                <div className="order-progress" aria-label={`Order progress: ${order.order_status}`}>
                  {progressSteps.map((step, index) => (
                    <div className={`order-progress-step${index <= currentStep ? ' reached' : ''}${index === currentStep ? ' current' : ''}`} key={step}>
                      <span className="order-progress-dot">{index < currentStep ? '✓' : index + 1}</span>
                      <span className="order-progress-label">{step === 'Ready for Pickup' ? 'Pickup' : step}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="customer-order-items">
                {order.items.map((item) => <div className="customer-order-item" key={item.product_id}><span><strong>{item.quantity}×</strong> {item.product_name}</span><strong>₱{(Number(item.unit_price) * item.quantity).toFixed(2)}</strong></div>)}
              </div>
              <div className="customer-order-bottom">
                <p className="order-payment-status">{order.payment_method
                  ? `Paid at stall · ${order.payment_method.replace('_', ' ')} · ${new Date(order.paid_at).toLocaleString()}`
                  : order.order_status === 'Completed' ? 'Payment not recorded in app' : 'Pay at the stall when you pick up your order'}</p>
                <div className="customer-order-total"><span>Total</span><strong>₱{Number(order.total_amount).toFixed(2)}</strong></div>
              </div>
            </article>;
          })}</div>
        )}
      </section>
    </main>
  );
}
