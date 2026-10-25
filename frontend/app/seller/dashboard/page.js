'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import LoadingScreen from '../../components/loading-screen';
import { apiRequest, logout } from '../../../lib/api';
import { useRequireRole } from '../../../lib/use-require-role';

const EMPTY_PRODUCT = { product_name: '', description: '', image_url: '', price: '', sku: '', quantity_in_stock: '0', reorder_level: '5' };

export default function SellerDashboardPage() {
  const router = useRouter();
  const { user, ready } = useRequireRole('seller');
  const [dashboard, setDashboard] = useState(null);
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    const { data } = await apiRequest('/vendor/dashboard');
    setDashboard(data);
  }, []);

  useEffect(() => {
    if (!ready) return;
    refresh().catch((requestError) => setError(requestError.message));
    const timer = window.setInterval(() => {
      refresh().catch((requestError) => setError(requestError.message));
    }, 10000);
    return () => window.clearInterval(timer);
  }, [ready, refresh]);

  function updateForm(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  }

  async function saveProduct(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    const body = {
      product_name: form.product_name,
      description: form.description,
      image_url: form.image_url,
      price: Number(form.price),
      sku: form.sku,
      quantity_in_stock: Number(form.quantity_in_stock),
      reorder_level: Number(form.reorder_level),
    };
    try {
      if (editingId) {
        await apiRequest(`/vendor/products/${editingId}`, { method: 'PATCH', body: JSON.stringify(body) });
        await apiRequest(`/vendor/products/${editingId}/stock`, {
          method: 'PATCH',
          body: JSON.stringify({ quantity_in_stock: body.quantity_in_stock, reorder_level: body.reorder_level }),
        });
      } else {
        await apiRequest('/vendor/products', { method: 'POST', body: JSON.stringify(body) });
      }
      setForm(EMPTY_PRODUCT);
      setEditingId(null);
      setNotice(editingId ? 'Product updated.' : 'Product added to your menu.');
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSaving(false);
    }
  }

  function startEditing(product) {
    setEditingId(product.product_id);
    setForm({
      product_name: product.product_name,
      description: product.description || '',
      image_url: product.image_url || '',
      price: String(product.price),
      sku: product.sku || '',
      quantity_in_stock: String(product.quantity_in_stock),
      reorder_level: String(product.reorder_level),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function runAction(action, successMessage) {
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(successMessage);
      await refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function handleLogout() {
    try {
      await logout();
      router.replace('/login');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (!ready) return <LoadingScreen title="Welcome back" message="Securing your seller dashboard..." />;

  return (
    <main className="site-shell">
      <header className="navbar">
        <Link href="/seller/dashboard" className="brand">
          <Image className="brand-logo" src="/hnu-logo.png" alt="Holy Name University crest" width={34} height={40} />
          Stall<span>Hub</span>
        </Link>
        <nav className="nav-links"><a href="#menu">My menu</a><a href="#orders">Orders</a></nav>
        <div className="account-actions"><span className="account-name">{user?.full_name}</span><button className="outline-button" onClick={handleLogout}>Log out</button></div>
      </header>

      <section className="seller-page">
        {error && <div className="error-message" role="alert">{error}</div>}
        {notice && <div className="success-message" role="status">{notice}</div>}
        {!dashboard ? <LoadingScreen title="Preparing your stall" message="Loading your menu and latest orders..." /> : <>
          <div className="seller-welcome">
            <div><p className="eyebrow">SELLER DASHBOARD</p><h1>{dashboard.stall.store_name}</h1><p>{dashboard.stall.store_location || 'Holy Name University'}{dashboard.stall.description ? ` · ${dashboard.stall.description}` : ''}</p></div>
            <div className="seller-summary"><span>{dashboard.products.filter((product) => product.is_available).length} active menu items</span><span>{dashboard.orders.filter((order) => order.order_status !== 'Completed').length} open orders</span></div>
          </div>

          {dashboard.lowStock.length > 0 && <section className="low-stock-alert"><strong>Low-stock alert</strong><span>{dashboard.lowStock.map((item) => `${item.product_name} (${item.quantity_in_stock} left)`).join(' · ')}</span></section>}

          <section className="seller-section" id="menu">
            <div className="seller-section-heading"><div><p className="eyebrow">STALL MANAGEMENT</p><h2>{editingId ? 'Edit menu item' : 'Add a menu item'}</h2></div></div>
            <form className="product-form-grid" onSubmit={saveProduct}>
              <label>Product name<input name="product_name" value={form.product_name} onChange={updateForm} required /></label>
              <label>Price (₱)<input name="price" type="number" min="0" step="0.01" value={form.price} onChange={updateForm} required /></label>
              <label>Stock quantity<input name="quantity_in_stock" type="number" min="0" step="1" value={form.quantity_in_stock} onChange={updateForm} required /></label>
              <label>Low-stock threshold<input name="reorder_level" type="number" min="0" step="1" value={form.reorder_level} onChange={updateForm} required /></label>
              <label>SKU (optional)<input name="sku" value={form.sku} onChange={updateForm} /></label>
              <label>Image URL (optional)<input name="image_url" type="url" value={form.image_url} onChange={updateForm} /></label>
              <label className="form-wide">Description<input name="description" value={form.description} onChange={updateForm} /></label>
              <div className="form-wide form-actions"><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Add to menu'}</button>{editingId && <button type="button" className="outline-button" onClick={() => { setEditingId(null); setForm(EMPTY_PRODUCT); }}>Cancel edit</button>}</div>
            </form>
          </section>

          <section className="seller-section">
            <div className="seller-section-heading"><div><p className="eyebrow">YOUR STALL</p><h2>My food menu</h2></div></div>
            {dashboard.products.length === 0 ? <p className="empty-inline">No products yet. Add a menu item above to get started.</p> : <div className="seller-product-list">
              {dashboard.products.map((product) => <article className="seller-product-row" key={product.product_id}>
                <div className="seller-product-main">{product.image_url && <img src={product.image_url} alt="" />}<div><h3>{product.product_name}</h3><p>₱{Number(product.price).toFixed(2)} · SKU {product.sku || '—'}</p><p>Stock: {product.quantity_in_stock} · Alert at: {product.reorder_level}</p></div></div>
                <div className="seller-product-actions">
                  <span className={product.is_available ? 'status-pill' : 'status-pill status-muted'}>{product.is_available ? 'Available' : 'Sold out'}</span>
                  <button className="small-action" onClick={() => runAction(() => apiRequest(`/vendor/products/${product.product_id}/availability`, { method: 'PATCH', body: JSON.stringify({ is_available: !product.is_available }) }), product.is_available ? 'Item marked unavailable.' : 'Item marked available.')}>{product.is_available ? 'Mark sold out' : 'Make available'}</button>
                  <button className="small-action" onClick={() => startEditing(product)}>Edit</button>
                  <button className="small-action danger-action" onClick={() => { if (window.confirm(`Remove ${product.product_name} from your menu?`)) runAction(() => apiRequest(`/vendor/products/${product.product_id}`, { method: 'DELETE' }), 'Product removed.'); }}>Remove</button>
                </div>
              </article>)}
            </div>}
          </section>

          <section className="seller-section" id="orders">
            <div className="seller-section-heading"><div><p className="eyebrow">FULFILLMENT</p><h2>Customer orders</h2></div></div>
            {dashboard.orders.length === 0 ? <p className="empty-inline">New orders for your stall will appear here.</p> : <div className="orders-list">
              {dashboard.orders.map((order) => {
                const nextStatus = { Pending: 'Confirmed', Confirmed: 'Preparing', Preparing: 'Ready for Pickup', 'Ready for Pickup': 'Completed' }[order.order_status];
                return <article className="order-card" key={order.order_id}>
                  <div className="order-heading"><div><p className="eyebrow">{new Date(order.created_at).toLocaleString()}</p><h2>Order #{order.order_id}</h2><p>{order.customer_name} · {order.customer_school_id}</p></div><span className="status-pill">{order.order_status}</span></div>
                  <div className="order-items">{order.items.map((item) => <p key={item.product_id}>{item.quantity} × {item.product_name} <span>₱{(Number(item.unit_price) * item.quantity).toFixed(2)}</span></p>)}</div>
                  <div className="seller-order-footer"><strong>Total ₱{Number(order.total_amount).toFixed(2)}</strong>{nextStatus && <button className="small-action primary-action" onClick={() => runAction(() => apiRequest(`/vendor/orders/${order.order_id}/status`, { method: 'PATCH', body: JSON.stringify({ order_status: nextStatus }) }), `Order moved to ${nextStatus}.`)}>Mark {nextStatus}</button>}</div>
                </article>;
              })}
            </div>}
          </section>
        </>}
      </section>
    </main>
  );
}
