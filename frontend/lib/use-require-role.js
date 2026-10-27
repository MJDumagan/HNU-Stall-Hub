'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest, isSessionSignedOut, logout, markSessionSignedOut } from './api';

export function useRequireRole(role) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    let requestId = 0;

    async function checkSession(reset = false) {
      const currentRequestId = ++requestId;
      if (reset) {
        setReady(false);
        setUser(null);
      }
      if (isSessionSignedOut()) {
        router.replace('/login');
        return;
      }
      try {
        const { data } = await apiRequest('/auth/me');
        if (!active || currentRequestId !== requestId) return;
        if (isSessionSignedOut()) {
          router.replace('/login');
          return;
        }
        if (data.user.role !== role) {
          const destinations = {
            admin: '/admin/dashboard',
            seller: '/seller/dashboard',
            customer: '/',
          };
          router.replace(destinations[data.user.role] || '/login');
          return;
        }
        setUser(data.user);
        setReady(true);
      } catch {
        if (!active || currentRequestId !== requestId) return;
        router.replace('/login');
      } finally {
        if (active && currentRequestId === requestId) setError('');
      }
    }

    function handlePopState() {
      if (window.location.pathname === '/login') {
        markSessionSignedOut();
        requestId += 1;
        logout().catch((logoutError) => setError(logoutError.message));
        return;
      }
      checkSession(true);
    }

    function handlePageShow(event) {
      if (event.persisted) checkSession(true);
    }

    checkSession();
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pageshow', handlePageShow);
    return () => {
      active = false;
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, [role, router]);

  return { user, ready, error };
}
