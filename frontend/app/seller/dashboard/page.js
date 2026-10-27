'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import LoadingScreen from '../../components/loading-screen';
import ProductImage from '../../components/product-image';
import { apiRequest, logout, markSessionSignedOut } from '../../../lib/api';
import { getStallNumber } from '../../../lib/stall-number';
import { useRequireRole } from '../../../lib/use-require-role';

const EMPTY_PRODUCT = { product_name: '', category_id: '', description: '', image_url: '', tags: [], price: '', quantity_in_stock: '0', reorder_level: '5' };
const ORDERS_PER_PAGE = 5;

export default function SellerDashboardPage() {
  const router = useRouter();
  const { user, ready } = useRequireRole('seller');
  const [dashboard, setDashboard] = useState(null);
  const [orderPage, setOrderPage] = useState(1);
  const [paymentMethods, setPaymentMethods] = useState({});
  const [form, setForm] = useState(EMPTY_PRODUCT);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileNotice, setProfileNotice] = useState('');
  const [uploadingCover, setUploadingCover] = useState(false);
  const coverInputRef = useRef(null);
  const orderPageCount = dashboard ? Math.ceil(dashboard.orders.length / ORDERS_PER_PAGE) : 0;
  const currentOrderPage = Math.min(orderPage, Math.max(1, orderPageCount));
  const firstOrderIndex = (currentOrderPage - 1) * ORDERS_PER_PAGE;
  const visibleOrders = dashboard?.orders.slice(firstOrderIndex, firstOrderIndex + ORDERS_PER_PAGE) || [];
  const orderPageNumbers = [...new Set([
    1,
    currentOrderPage - 1,
    currentOrderPage,
    currentOrderPage + 1,
    orderPageCount,
  ])].filter((page) => page >= 1 && page <= orderPageCount).sort((a, b) => a - b);

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

  function toggleTag(tagName) {
    setForm((current) => {
      const selected = current.tags.includes(tagName);
      if (!selected && current.tags.length >= 10) return current;
      return {
        ...current,
        tags: selected
          ? current.tags.filter((tag) => tag !== tagName)
          : [...current.tags, tagName],
      };
    });
  }

  async function saveProduct(event) {
    event.preventDefault();
    setError('');
    setNotice('');
    setSaving(true);
    const body = {
      product_name: form.product_name,
      category_id: Number(form.category_id),
      description: form.description,
      image_url: form.image_url,
      tags: form.tags,
      price: Number(form.price),
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
      category_id: String(product.category_id || ''),
      description: product.description || '',
      image_url: product.image_url || '',
      tags: product.tags || [],
      price: String(product.price),
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

  async function saveCoverPhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setProfileError('');
    setProfileNotice('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024) {
      setProfileError('Choose a JPEG, PNG, or WebP image no larger than 10 MB.');
      return;
    }

    setUploadingCover(true);
    try {
      const coverImage = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result !== 'string') {
            reject(new Error('Could not read that image. Please try another file.'));
            return;
          }
          resolve(reader.result);
        };
        reader.onerror = () => reject(new Error('Could not read that image. Please try another file.'));
        reader.readAsDataURL(file);
      });
      await apiRequest('/vendor/cover', {
        method: 'PATCH',
        body: JSON.stringify({ cover_image: coverImage }),
      });
      await refresh();
      setProfileNotice('Your stall cover photo has been updated.');
    } catch (requestError) {
      setProfileError(requestError.message);
    } finally {
      setUploadingCover(false);
    }
  }

  async function removeCoverPhoto() {
    setProfileError('');
    setProfileNotice('');
    setUploadingCover(true);
    try {
      await apiRequest('/vendor/cover', {
        method: 'PATCH',
        body: JSON.stringify({ cover_image: null }),
      });
      await refresh();
      setProfileNotice('Your stall cover photo has been removed.');
    } catch (requestError) {
      setProfileError(requestError.message);
    } finally {
      setUploadingCover(false);
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
        <div className="account-actions">
          <button className="profile-trigger" type="button" onClick={() => { setProfileOpen(true); setProfileError(''); setProfileNotice(''); }}>
            <span className="profile-avatar" aria-hidden="true">{user?.full_name?.charAt(0)?.toUpperCase() || 'S'}</span>
            <span>{user?.full_name}</span><span aria-hidden="true">⌄</span>
          </button>
          <button className="outline-button" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <section className="seller-page">
        {error && <div className="error-message" role="alert">{error}</div>}
        {notice && <div className="success-message" role="status">{notice}</div>}
        {!dashboard ? <LoadingScreen title="Preparing your stall" message="Loading your menu and latest orders..." /> : <>
          <div className={`seller-welcome${dashboard.stall.cover_image_url ? ' has-cover' : ''}`}>
          {dashboard.stall.cover_image_url && <img className="seller-cover-image" src={dashboard.stall.cover_image_url} alt="" />}
          <div className="seller-welcome-content"><p className="eyebrow">SELLER DASHBOARD</p><h1>{dashboard.stall.store_name || `Stall No. ${getStallNumber(dashboard.stall.store_id)}`}</h1><p>{dashboard.stall.store_location || 'Holy Name University'}{dashboard.stall.description ? ` · ${dashboard.stall.description}` : ''}</p></div>
          <div className="seller-summary"><span>{dashboard.products.filter((product) => product.is_available).length} active menu items</span><span>{dashboard.metrics.open_order_count} open orders</span><span>₱{Number(dashboard.metrics.completed_sales).toFixed(2)} completed sales</span></div>
        </div>

          {dashboard.lowStock.length > 0 && <section className="low-stock-alert"><strong>Low-stock alert</strong><span>{dashboard.lowStock.map((item) => `${item.product_name} (${item.quantity_in_stock} left)`).join(' · ')}</span></section>}

          <section className="seller-section" id="menu">
            <div className="seller-section-heading"><div><p className="eyebrow">STALL MANAGEMENT</p><h2>{editingId ? 'Edit menu item' : 'Add a menu item'}</h2></div></div>
            <form className="product-form-grid" onSubmit={saveProduct}>
              <label>Product name<input name="product_name" value={form.product_name} onChange={updateForm} required /></label>
              <label>Category<select name="category_id" value={form.category_id} onChange={updateForm} required><option value="">Choose a category</option>{dashboard.categories.map((category) => <option key={category.category_id} value={category.category_id}>{category.category_name}</option>)}</select></label>
              <label>Price (₱)<input name="price" type="number" min="0" step="0.01" value={form.price} onChange={updateForm} required /></label>
              <label>Stock quantity<input name="quantity_in_stock" type="number" min="0" step="1" value={form.quantity_in_stock} onChange={updateForm} required /></label>
              <label>Low-stock threshold<input name="reorder_level" type="number" min="0" step="1" value={form.reorder_level} onChange={updateForm} required /></label>
              <label>Image URL (optional)<input name="image_url" type="url" value={form.image_url} onChange={updateForm} /></label>
              <fieldset className="tag-picker form-wide">
                <legend>Product tags (select up to 10)</legend>
                {dashboard.tagCatalog?.length
                  ? <div className="tag-picker-options">{dashboard.tagCatalog.map((tag) => (
                    <label className="tag-picker-option" key={tag.tag_id}>
                      <input
                        type="checkbox"
                        checked={form.tags.includes(tag.tag_name)}
                        disabled={!form.tags.includes(tag.tag_name) && form.tags.length >= 10}
                        onChange={() => toggleTag(tag.tag_name)}
                      />
                      {tag.tag_name}
                    </label>
                  ))}
                  </div>
                  : <p className="muted-copy">No tag options are available yet. Apply the starter tag migration after the product-tag schema migration.</p>}
              </fieldset>
              <label className="form-wide">Description<input name="description" value={form.description} onChange={updateForm} /></label>
              <div className="form-wide form-actions"><button className="submit-button" type="submit" disabled={saving}>{saving ? 'Saving...' : editingId ? 'Save changes' : 'Add to menu'}</button>{editingId && <button type="button" className="outline-button" onClick={() => { setEditingId(null); setForm(EMPTY_PRODUCT); }}>Cancel edit</button>}</div>
            </form>
          </section>

          <section className="seller-section">
            <div className="seller-section-heading"><div><p className="eyebrow">YOUR STALL</p><h2>My food menu</h2></div></div>
            {dashboard.products.length === 0 ? <p className="empty-inline">No products yet. Add a menu item above to get started.</p> : <div className="seller-product-list">
              {dashboard.products.map((product) => <article className="seller-product-row" key={product.product_id}>
                <div className="seller-product-main">{product.image_url && <ProductImage key={product.image_url} src={product.image_url} />}<div><h3>{product.product_name}</h3><p>{product.category_name || 'Uncategorized'} · ₱{Number(product.price).toFixed(2)}</p><p>Stock: {product.quantity_in_stock} · Alert at: {product.reorder_level}</p>{product.tags?.length > 0 && <p>Tags: {product.tags.join(', ')}</p>}</div></div>
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
            {dashboard.orders.length === 0 ? <p className="empty-inline">New orders for your stall will appear here.</p> : <>
              <p className="orders-count">Showing {firstOrderIndex + 1}–{Math.min(firstOrderIndex + ORDERS_PER_PAGE, dashboard.orders.length)} of {dashboard.orders.length} orders</p>
              <div className="orders-list">
              {visibleOrders.map((order) => {
                const nextStatus = { Pending: 'Confirmed', Confirmed: 'Preparing', Preparing: 'Ready for Pickup' }[order.order_status];
                const canRecordPayment = !order.payment_method &&
                  (order.order_status === 'Ready for Pickup' || order.order_status === 'Completed');
                return <article className="order-card" key={order.order_id}>
                  <div className="order-heading"><div><p className="eyebrow">{new Date(order.created_at).toLocaleString()}</p><h2>Order #{order.order_id}</h2><p>{order.customer_name} · {order.customer_school_id}</p></div><span className="status-pill">{order.order_status}</span></div>
                  <div className="order-items">{order.items.map((item) => <p key={item.product_id}>{item.quantity} × {item.product_name} <span>₱{(Number(item.unit_price) * item.quantity).toFixed(2)}</span></p>)}</div>
                  <p className="order-payment-status">{order.payment_method
                    ? `Paid at stall · ${order.payment_method.replace('_', ' ')} · ${new Date(order.paid_at).toLocaleString()}`
                    : order.order_status === 'Completed' ? 'Payment not recorded in app' : 'Payment due at stall on pickup'}</p>
                  <div className="seller-order-footer"><strong>Total ₱{Number(order.total_amount).toFixed(2)}</strong>{nextStatus && <button className="small-action primary-action" onClick={() => runAction(() => apiRequest(`/vendor/orders/${order.order_id}/status`, { method: 'PATCH', body: JSON.stringify({ order_status: nextStatus }) }), `Order moved to ${nextStatus}.`)}>Mark {nextStatus}</button>}
                    {canRecordPayment && <div className="seller-payment-actions">
                      <label htmlFor={`payment-method-${order.order_id}`}>{order.order_status === 'Completed' ? 'Record previous payment' : 'Payment received'}</label>
                      <select
                        id={`payment-method-${order.order_id}`}
                        className="payment-method-select"
                        value={paymentMethods[order.order_id] || 'Cash'}
                        onChange={(event) => setPaymentMethods((current) => ({ ...current, [order.order_id]: event.target.value }))}
                      >
                        <option value="Cash">Cash</option>
                        <option value="GCash">GCash</option>
                        <option value="PayMaya">PayMaya</option>
                        <option value="Debit_Card">Debit card</option>
                        <option value="Credit_Card">Credit card</option>
                      </select>
                      <button
                        className="small-action primary-action"
                        onClick={() => {
                          const method = paymentMethods[order.order_id] || 'Cash';
                          if (window.confirm(`Confirm you received ₱${Number(order.total_amount).toFixed(2)} via ${method.replace('_', ' ')} for Order #${order.order_id}?`)) {
                            runAction(
                              () => apiRequest(`/vendor/orders/${order.order_id}/payment`, {
                                method: 'POST',
                                body: JSON.stringify({ payment_method: method }),
                              }),
                              `Payment recorded and Order #${order.order_id} completed.`
                            );
                          }
                        }}
                      >{order.order_status === 'Completed' ? 'Record payment' : 'Confirm payment received'}</button>
                    </div>}
                  </div>
                </article>;
              })}
              </div>
              {orderPageCount > 1 && <nav className="order-pagination" aria-label="Order pages">
                <button type="button" className="small-action" onClick={() => setOrderPage(currentOrderPage - 1)} disabled={currentOrderPage === 1}>Previous</button>
                {orderPageNumbers.map((page, index) => (
                  <span className="order-page-group" key={page}>
                    {index > 0 && page - orderPageNumbers[index - 1] > 1 && <span className="order-page-ellipsis" aria-hidden="true">…</span>}
                    <button
                      type="button"
                      className={`small-action order-page-button${page === currentOrderPage ? ' active' : ''}`}
                      aria-label={`Page ${page}`}
                      aria-current={page === currentOrderPage ? 'page' : undefined}
                      onClick={() => setOrderPage(page)}
                    >{page}</button>
                  </span>
                ))}
                <button type="button" className="small-action" onClick={() => setOrderPage(currentOrderPage + 1)} disabled={currentOrderPage === orderPageCount}>Next</button>
              </nav>}
            </>}
          </section>
        </>}
      </section>
      {profileOpen && (
        <div className="profile-overlay" onKeyDown={(event) => { if (event.key === 'Escape') setProfileOpen(false); }} onMouseDown={(event) => { if (event.target === event.currentTarget) setProfileOpen(false); }}>
          <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title" tabIndex={-1}>
            <div className="profile-dialog-header">
              <div><p className="eyebrow">SELLER ACCOUNT</p><h2 id="profile-title">Your profile</h2></div>
              <button className="profile-close" type="button" aria-label="Close profile" onClick={() => setProfileOpen(false)}>×</button>
            </div>
            <p className="profile-intro">Manage your account and how customers see your stall.</p>
            {profileError && <p className="form-error" role="alert">{profileError}</p>}
            {profileNotice && <p className="success-message" role="status">{profileNotice}</p>}

            <section className="profile-section">
              <div>
                <h3>Stall cover photo</h3>
                <p>Choose a JPEG, PNG, or WebP photo up to 10 MB for the customer stall banner.</p>
              </div>
              {dashboard?.stall.cover_image_url && (
                <img className="profile-cover-preview" src={dashboard.stall.cover_image_url} alt="Current stall cover" />
              )}
              <input
                ref={coverInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={saveCoverPhoto}
              />
              <div className="profile-actions">
                <button
                  className="submit-button"
                  type="button"
                  disabled={uploadingCover}
                  onClick={() => coverInputRef.current?.click()}
                >
                  {uploadingCover ? 'Saving photo...' : dashboard?.stall.cover_image_url ? 'Change cover photo' : 'Add cover photo'}
                </button>
                {dashboard?.stall.cover_image_url && (
                  <button className="outline-button" type="button" disabled={uploadingCover} onClick={removeCoverPhoto}>
                    Remove photo
                  </button>
                )}
              </div>
            </section>

          </section>
        </div>
      )}
    </main>
  );
}
