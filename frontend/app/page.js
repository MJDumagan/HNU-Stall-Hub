'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import LoadingScreen from './components/loading-screen';
import { apiRequest, logout } from '../lib/api';
import { getStallNumber } from '../lib/stall-number';
import { useRequireRole } from '../lib/use-require-role';

export default function Home() {
  const router = useRouter();
  const { user, ready } = useRequireRole('customer');
  const [stalls, setStalls] = useState([]);
  const [error, setError] = useState('');
  const [activeBannerImage, setActiveBannerImage] = useState(0);
  const bannerImages = [
    { src: '/janssen-food-court.jpg', alt: 'Janssen Food Court entrance and sign' },
    { src: '/janssen-food-court-seating.jpg', alt: 'Students dining at tables in Janssen Food Court' },
  ];

  useEffect(() => {
    if (!ready) return;
    apiRequest('/stalls')
      .then(({ data }) => setStalls(data))
      .catch((requestError) => setError(requestError.message));
  }, [ready]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveBannerImage((current) => (current + 1) % bannerImages.length);
    }, 6000);
    return () => window.clearInterval(timer);
  }, [bannerImages.length]);

  async function handleLogout() {
    try {
      await logout();
      router.replace('/login');
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  if (!ready) return <LoadingScreen title="Welcome to StallHub" message="Preparing your campus food hub..." />;

  return (
    <main className="site-shell customer-home">
      <header className="navbar">
        <Link href="/" className="brand">
          <Image className="brand-logo" src="/hnu-logo.png" alt="Holy Name University crest" width={34} height={40} />
          Stall<span>Hub</span>
        </Link>
        <nav className="nav-links">
          <Link href="/">Stalls</Link>
          <Link href="/orders">My Orders</Link>
        </nav>
        <div className="account-actions">
          <span className="account-name">Hi, {user?.full_name}</span>
          <button className="outline-button" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <section className="hero">
        <div className="hero-slides" aria-live="polite">
          {bannerImages.map((image, index) => (
            <img
              key={image.src}
              className={`hero-slide${index === activeBannerImage ? ' active' : ''}`}
              src={image.src}
              alt={image.alt}
              aria-hidden={index !== activeBannerImage}
            />
          ))}
        </div>
        <div className="hero-image-shade" />
        <div className="hero-content">
          <p className="eyebrow">HOLY NAME UNIVERSITY</p>
          <h1>Good food, right here on <span>campus.</span></h1>
          <p className="hero-description">Explore campus cafeteria stalls, browse their live menus, and order your favorites.</p>
          <a href="#stalls" className="primary-button">Browse stalls <span>→</span></a>
          <div className="hero-note"><span className="status-dot" />Menus and availability come from the stalls</div>
        </div>
        <div className="hero-slide-controls" aria-label="Banner photo controls">
          <button
            type="button"
            aria-label="Show previous banner photo"
            onClick={() => setActiveBannerImage((current) => (current + bannerImages.length - 1) % bannerImages.length)}
          >‹</button>
          {bannerImages.map((image, index) => (
            <button
              key={image.src}
              type="button"
              className={index === activeBannerImage ? 'active' : ''}
              aria-label={`Show banner photo ${index + 1}`}
              aria-pressed={index === activeBannerImage}
              onClick={() => setActiveBannerImage(index)}
            />
          ))}
          <button
            type="button"
            aria-label="Show next banner photo"
            onClick={() => setActiveBannerImage((current) => (current + 1) % bannerImages.length)}
          >›</button>
        </div>
      </section>

      <section className="products-section stall-directory" id="stalls">
        <div className="section-heading">
          <div><p className="eyebrow">CAMPUS FOOD</p><h2>Find your next meal</h2><p className="section-description">Choose a stall to see its available food and drinks.</p></div>
          <Link href="/orders" className="text-link">Track my orders →</Link>
        </div>
        {error ? <div className="error-message" role="alert">{error}</div> : stalls.length === 0 ? (
          <div className="empty-state"><div className="empty-icon">⌕</div><h3>No stalls are open yet</h3><p>Check back when a campus stall has published its menu.</p></div>
        ) : (
          <div className="stall-grid">
            {stalls.map((stall) => (
              <Link className="stall-card" href={`/stall/${stall.store_id}`} key={stall.store_id}>
                {stall.cover_image_url
                  ? <img className="stall-card-image" src={stall.cover_image_url} alt={`${stall.store_name} at the HNU food court`} />
                  : <div className="stall-card-icon" aria-hidden="true">✦</div>}
                <div><p className="eyebrow">HNU CAMPUS STALL</p><h3>{stall.store_name || `Stall No. ${getStallNumber(stall.store_id)}`}</h3><p>{stall.store_location || 'Holy Name University'}</p>{stall.description && <p>{stall.description}</p>}</div>
                <div className="stall-card-bottom"><span>{stall.available_products} menu items</span><strong>View menu →</strong></div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <footer className="footer">
        <Link href="/" className="brand">
          <Image className="brand-logo" src="/hnu-logo.png" alt="Holy Name University crest" width={30} height={36} />
          Stall<span>Hub</span>
        </Link>
        <p>HNU campus ordering</p>
      </footer>
    </main>
  );
}
