'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useParams } from 'next/navigation';
import LoadingScreen from '../../components/loading-screen';
import ProductImage from '../../components/product-image';
import { apiRequest } from '../../../lib/api';
import { getStallNumber } from '../../../lib/stall-number';
import { useRequireRole } from '../../../lib/use-require-role';

const RICE_ADDONS = {
  none: { price: 0, label: '' },
  half: { price: 8, label: '½ cup rice' },
  full: { price: 15, label: '1 cup rice' },
};

export default function StallMenuPage() {
  const params = useParams();
  const { user, ready } = useRequireRole('customer');
  const [stall, setStall] = useState(null);
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [cart, setCart] = useState({});
  const [riceAddons, setRiceAddons] = useState({});
  const [checkoutStarted, setCheckoutStarted] = useState(false);
  const [error, setError] = useState('');
  const [order, setOrder] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);

  useEffect(() => {
    if (!ready || !params.stallId) return;
    apiRequest(`/stalls/${params.stallId}/products`)
      .then(({ data }) => { setStall(data.stall); setProducts(data.products); setCategories(data.categories); })
      .catch((requestError) => setError(requestError.message));
  }, [ready, params.stallId]);

  const cartItems = useMemo(
    () => products.filter((product) => cart[product.product_id] > 0),
    [products, cart]
  );
  const visibleProducts = selectedCategory === 'All'
    ? products
    : products.filter((product) => product.category_name === selectedCategory);
  const total = cartItems.reduce((sum, product) => {
    const ricePrice = product.rice_addon_eligible
      ? RICE_ADDONS[riceAddons[product.product_id] || 'none'].price
      : 0;
    return sum + (Number(product.price) + ricePrice) * cart[product.product_id];
  }, 0);

  function changeQuantity(product, amount) {
    setCheckoutStarted(false);
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
        body: JSON.stringify({
          items: cartItems.map((product) => ({
            product_id: product.product_id,
            quantity: cart[product.product_id],
            rice_addon: riceAddons[product.product_id] || 'none',
          })),
        }),
      });
      setOrder(result.data);
      setCart({});
      setRiceAddons({});
      setCheckoutStarted(false);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setPlacingOrder(false);
    }
  }

  if (!ready) return <LoadingScreen title="Opening the stall" message="Getting the latest menu ready..." />;

  return (
    <main className="site-shell">
      <header className="navbar">
        <Link href="/" className="brand">
          <Image className="brand-logo" src="/hnu-logo.png" alt="Holy Name University crest" width={34} height={40} />
          Stall<span>Hub</span>
        </Link>
        <nav className="nav-links"><Link href="/">All stalls</Link><Link href="/orders">My Orders</Link></nav>
        <span className="account-name">{user?.full_name}</span>
      </header>
      <section className="menu-page">
        <Link href="/" className="back-link">← All stalls</Link>
        {error && <div className="error-message" role="alert">{error}</div>}
        {stall && <>
          {stall.cover_image_url && (
            <div className="stall-menu-banner">
              <img src={stall.cover_image_url} alt={`${stall.store_name} food counter`} />
              <span>{stall.store_name}</span>
            </div>
          )}
          <div className="menu-heading"><p className="eyebrow">HNU CAMPUS STALL</p><h1>{stall.store_name || `Stall No. ${getStallNumber(stall.store_id)}`}</h1><p>{stall.store_location || 'Holy Name University'}{stall.description ? ` · ${stall.description}` : ''}</p></div>
          {order && <div className="success-message" role="status"><strong>Order #{order.order_id} placed!</strong> Your order is pending confirmation. <Link href="/orders">Track order →</Link></div>}
          {products.length === 0 ? <div className="empty-state"><h3>No available menu items</h3><p>This stall has no items available right now.</p></div> : (
            <div className="menu-layout">
              <div>
                <nav className="category-filters" aria-label="Filter menu by category">
                  {['All', ...categories.map((category) => category.category_name)].map((category) => (
                    <button
                      className={`category-filter${selectedCategory === category ? ' active' : ''}`}
                      key={category}
                      type="button"
                      aria-pressed={selectedCategory === category}
                      onClick={() => setSelectedCategory(category)}
                    >{category}</button>
                  ))}
                </nav>
                {visibleProducts.length === 0
                  ? <p className="empty-inline">No available items in this category yet.</p>
                  : <div className="menu-grid">
                {visibleProducts.map((product) => (
                  <article className="menu-item-card" key={product.product_id}>
                    {product.image_url ? <ProductImage key={product.image_url} className="menu-item-image" src={product.image_url} /> : <div className="menu-item-image menu-item-placeholder">{product.product_name.charAt(0).toUpperCase()}</div>}
                    <div className="menu-item-body"><p className="eyebrow">{product.category_name || 'UNCATEGORIZED'} · AVAILABLE · {product.quantity_in_stock} LEFT</p><h3>{product.product_name}</h3>{product.product_description && <p>{product.product_description}</p>}{product.tags?.length > 0 && <p className="product-tags">Tags: {product.tags.join(', ')}</p>}
                      <div className="menu-item-bottom"><strong>₱{Number(product.price).toFixed(2)}</strong><div className="quantity-control"><button onClick={() => changeQuantity(product, -1)} aria-label={`Remove one ${product.product_name}`}>−</button><span>{cart[product.product_id] || 0}</span><button onClick={() => changeQuantity(product, 1)} disabled={(cart[product.product_id] || 0) >= Number(product.quantity_in_stock)} aria-label={`Add one ${product.product_name}`}>+</button></div></div>
                    </div>
                  </article>
                ))}
                </div>}
              </div>
              <aside className="cart-card">
                <p className="eyebrow">YOUR CART</p><h2>Order summary</h2>
                {cartItems.length === 0 ? <p className="muted-copy">Choose items to start your order.</p> : cartItems.map((product) => {
                  const riceAddon = RICE_ADDONS[riceAddons[product.product_id] || 'none'];
                  return <div className="cart-line" key={product.product_id}>
                    <span>{cart[product.product_id]} × {product.product_name}{riceAddon.label ? ` + ${riceAddon.label}` : ''}</span>
                    <strong>₱{((Number(product.price) + riceAddon.price) * cart[product.product_id]).toFixed(2)}</strong>
                  </div>;
                })}
                {checkoutStarted && cartItems.length > 0 && (
                  <div className="rice-addon-list">
                    <p className="eyebrow">OPTIONAL RICE ADD-ONS</p>
                    <p className="muted-copy">Choose rice for each viand serving, or leave it as no rice.</p>
                    {cartItems.filter((product) => product.rice_addon_eligible).map((product) => (
                      <label className="rice-addon-option" key={product.product_id}>
                        <span>{cart[product.product_id]} × {product.product_name}</span>
                        <select
                          value={riceAddons[product.product_id] || 'none'}
                          onChange={(event) => setRiceAddons((current) => ({
                            ...current,
                            [product.product_id]: event.target.value,
                          }))}
                        >
                          <option value="none">No rice</option>
                          <option value="half">½ cup rice · ₱8 each</option>
                          <option value="full">1 cup rice · ₱15 each</option>
                        </select>
                      </label>
                    ))}
                    {!cartItems.some((product) => product.rice_addon_eligible) && (
                      <p className="muted-copy">Rice add-ons are not available for drinks or snacks.</p>
                    )}
                  </div>
                )}
                <div className="cart-total"><span>Total</span><strong>₱{total.toFixed(2)}</strong></div>
                {!checkoutStarted ? (
                  <button className="submit-button" onClick={() => setCheckoutStarted(true)} disabled={cartItems.length === 0}>Continue to checkout</button>
                ) : (
                  <>
                    <button className="submit-button" onClick={submitOrder} disabled={cartItems.length === 0 || placingOrder}>{placingOrder ? 'Confirming order...' : 'Confirm order'}</button>
                    <button className="outline-button checkout-cancel" onClick={() => setCheckoutStarted(false)} disabled={placingOrder}>Back to menu</button>
                  </>
                )}
                <p className="muted-copy">Prices and stock are verified by the server at checkout.</p>
              </aside>
            </div>
          )}
        </>}
      </section>
    </main>
  );
}
