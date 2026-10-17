
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import './globals.css';

const API_URL = 'http://localhost:5000/api/products';

export default function Home() {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function loadProducts() {
      try {
        const response = await fetch(API_URL);

        if (!response.ok) {
          throw new Error('Could not load products.');
        }

        const data = await response.json();
        setProducts(
        Array.isArray(data) ? data : data.data || data.products || []);
      } catch {
        setError('Unable to load products. Make sure your backend is running.');
      } finally {
        setLoading(false);
      }
    }

    loadProducts();
  }, []);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const name = product.product_name || product.name || '';
      const matchesSearch = name.toLowerCase().includes(search.toLowerCase());
      const price = Number(product.price || 0);

      const matchesCategory =
        category === 'All' ||
        (category === 'Budget' && price < 100) ||
        (category === 'Premium' && price >= 100);

      return matchesSearch && matchesCategory;
    });
  }, [products, search, category]);

  return (
    <main className="site-shell">
      <header className="navbar">
        <Link href="/" className="brand">
          <span className="brand-icon">S</span>
          Stall<span>Hub</span>
        </Link>

        <nav className="nav-links">
          <Link href="/">Home</Link>
          <a href="#products">Products</a>
          <Link href="/add-product">Add Product</Link>
        </nav>

        <Link href="/add-product" className="nav-button">
          + Add Product
        </Link>
      </header>

      <section className="hero">
        <div className="hero-content">
          <p className="eyebrow">YOUR LOCAL MARKETPLACE</p>
          <h1>
            Discover great finds.
            <br />
            <span>Shop your way.</span>
          </h1>
          <p className="hero-description">
            Explore products from your marketplace in one simple place.
            Find what you need and discover something new.
          </p>

          <a href="#products" className="primary-button">
            Explore Products <span>→</span>
          </a>

          <div className="hero-note">
            <span className="status-dot" />
            Simple shopping. Local discovery.
          </div>
        </div>

        <div className="hero-art" aria-label="Marketplace illustration">
          <div className="art-circle" />
          <div className="art-card art-card-one">
            <span>✦</span>
            <p>Good finds</p>
          </div>
          <div className="art-bag">S</div>
          <div className="art-card art-card-two">
            <span>✓</span>
            <p>Easy to explore</p>
          </div>
          <div className="art-sparkle">✳</div>
        </div>
      </section>

      <section className="benefits">
        <div>
          <span className="benefit-icon">⌕</span>
          <div>
            <strong>Easy discovery</strong>
            <p>Search for products quickly</p>
          </div>
        </div>
        <div>
          <span className="benefit-icon">◇</span>
          <div>
            <strong>Explore your options</strong>
            <p>Browse the available items</p>
          </div>
        </div>
        <div>
          <span className="benefit-icon">＋</span>
          <div>
            <strong>Add products</strong>
            <p>Share new items with the store</p>
          </div>
        </div>
      </section>

      <section className="products-section" id="products">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE COLLECTION</p>
            <h2>Explore products</h2>
            <p className="section-description">
              Find something that fits your needs.
            </p>
          </div>

          <Link href="/add-product" className="text-link">
            Add a product →
          </Link>
        </div>

        <div className="product-tools">
          <div className="search-box">
            <span>⌕</span>
            <input
              type="search"
              placeholder="Search products..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search products"
            />
          </div>

          <div className="filter-buttons">
            {['All', 'Budget', 'Premium'].map((item) => (
              <button
                key={item}
                className={category === item ? 'filter active' : 'filter'}
                onClick={() => setCategory(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="message">Loading products...</p>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : filteredProducts.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">⌕</div>
            <h3>No products found</h3>
            <p>Try another search or add a new product.</p>
            <Link href="/add-product" className="primary-button">
              Add a Product
            </Link>
          </div>
        ) : (
          <div className="product-grid">
            {filteredProducts.map((product, index) => (
              <article
                className="product-card"
                key={product.product_id || product.id || product.sku || `${product.product_name}-${index}`}
              >
                <div className={`product-art product-art-${index % 4}`}>
                  <span className="product-art-letter">
                    {(product.product_name || product.name || 'P')
                      .charAt(0)
                      .toUpperCase()}
                  </span>
                  <span className="product-tag">AVAILABLE</span>
                </div>

                <div className="product-info">
                  <p className="product-category">
                    {product.category_name || 'Marketplace item'}
                  </p>
                  <h3>{product.product_name || product.name || 'Unnamed product'}</h3>
                  {product.sku && (
                    <p className="product-sku">SKU: {product.sku}</p>
                  )}

                  <div className="product-bottom">
                    <strong>
                      ₱{Number(product.price || 0).toLocaleString('en-PH', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </strong>
                    <span className="product-arrow">↗</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="seller-banner">
        <div>
          <p className="eyebrow">GROW YOUR COLLECTION</p>
          <h2>Have a product to share?</h2>
          <p>Add a new item to your Stall Hub marketplace.</p>
        </div>
        <Link href="/add-product" className="banner-button">
          Add Your Product →
        </Link>
      </section>

      <footer className="footer">
        <Link href="/" className="brand">
          <span className="brand-icon">S</span>
          Stall<span>Hub</span>
        </Link>
        <p>A simple marketplace for discovering products.</p>
        <span>© {new Date().getFullYear()} Stall Hub</span>
      </footer>
    </main>
  );
}
