'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { apiRequest, logout, markSessionSignedOut } from '../../../lib/api';
import { useRequireRole } from '../../../lib/use-require-role';
import styles from './admin.module.css';

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user, ready } = useRequireRole('admin');
  const [dashboard, setDashboard] = useState(null);
  const [error, setError] = useState('');
  const [busyStoreId, setBusyStoreId] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      const { data } = await apiRequest('/admin/dashboard');
      setDashboard(data);
      setError('');
    } catch (requestError) {
      setError(requestError.message);
    }
  }, []);

  useEffect(() => {
    if (ready) loadDashboard();
  }, [ready, loadDashboard]);

  async function removeStall(stall) {
    const confirmed = window.confirm(
      `Remove ${stall.store_name} from the customer menu? Order history will be preserved.`
    );
    if (!confirmed) return;

    setBusyStoreId(stall.store_id);
    setError('');
    try {
      await apiRequest(`/admin/stalls/${stall.store_id}`, { method: 'DELETE' });
      await loadDashboard();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusyStoreId(null);
    }
  }

  async function handleLogout() {
    markSessionSignedOut();
    try {
      await logout();
    } finally {
      router.replace('/login');
    }
  }

  if (!ready) {
    return (
      <main className={styles.page}>
        <div className={styles.loadingCard}>Verifying administrator account...</div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.brand}>
          <div className={styles.logoFrame}>
            <Image
              src="/hnu-logo.png"
              alt="Holy Name University crest"
              width={56}
              height={66}
              priority
            />
          </div>
          <div>
            <p className={styles.eyebrow}>HOLY NAME UNIVERSITY</p>
            <h1>Administrator dashboard</h1>
            <p className={styles.welcome}>Welcome, {user?.full_name || 'Administrator'}</p>
          </div>
        </div>
        <button type="button" className={styles.logoutButton} onClick={handleLogout}>
          Log out
        </button>
      </header>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {!dashboard && !error && <div className={styles.loadingCard}>Loading campus overview...</div>}
      {dashboard && (
        <>
          <section className={styles.metrics} aria-label="Campus overview">
            <article className={styles.metricCard}>
              <span className={styles.metricIcon} aria-hidden="true">⌂</span>
              <span className={styles.metricLabel}>Active stalls</span>
              <strong>{dashboard.summary.active_stalls} <small>/ {dashboard.summary.total_stalls}</small></strong>
              <span className={styles.metricHint}>Currently listed on campus</span>
            </article>
            <article className={styles.metricCard}>
              <span className={`${styles.metricIcon} ${styles.orange}`} aria-hidden="true">↗</span>
              <span className={styles.metricLabel}>Open orders</span>
              <strong>{dashboard.summary.open_orders}</strong>
              <span className={styles.metricHint}>Orders still in progress</span>
            </article>
            <article className={styles.metricCard}>
              <span className={`${styles.metricIcon} ${styles.blue}`} aria-hidden="true">♙</span>
              <span className={styles.metricLabel}>Active sellers</span>
              <strong>{dashboard.summary.active_sellers}</strong>
              <span className={styles.metricHint}>Managing campus stalls</span>
            </article>
            <article className={styles.metricCard}>
              <span className={`${styles.metricIcon} ${styles.purple}`} aria-hidden="true">◎</span>
              <span className={styles.metricLabel}>Active customers</span>
              <strong>{dashboard.summary.active_customers}</strong>
              <span className={styles.metricHint}>Registered campus users</span>
            </article>
          </section>

          <section className={styles.management}>
            <div className={styles.sectionHeading}>
              <div>
                <p className={styles.sectionEyebrow}>CAMPUS DIRECTORY</p>
                <h2>Stall management</h2>
                <p>Manage stall visibility while preserving order and transaction history.</p>
              </div>
              <span className={styles.stallCount}>{dashboard.stalls.length} stalls</span>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr><th>Stall</th><th>Seller</th><th>Orders</th><th>Status</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {dashboard.stalls.map((stall) => (
                    <tr key={stall.store_id}>
                      <td>
                        <span className={styles.stallName}>{stall.store_name}</span>
                        <small className={styles.location}>{stall.store_location}</small>
                      </td>
                      <td>{stall.seller_name || 'Unassigned'}</td>
                      <td>
                        <span className={styles.orderCount}>{stall.order_count}</span>
                        <small className={styles.location}>{stall.open_order_count} open</small>
                      </td>
                      <td>
                        <span className={stall.is_active ? styles.activeStatus : styles.removedStatus}>
                          <span aria-hidden="true" />
                          {stall.is_active ? 'Active' : 'Removed'}
                        </span>
                      </td>
                      <td>
                        {stall.is_active && (
                          <button
                            type="button"
                            className={styles.removeButton}
                            disabled={busyStoreId === stall.store_id}
                            onClick={() => removeStall(stall)}
                          >
                            {busyStoreId === stall.store_id ? 'Removing...' : 'Remove stall'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!dashboard.stalls.length && (
                    <tr><td className={styles.emptyState} colSpan="5">No stalls found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
