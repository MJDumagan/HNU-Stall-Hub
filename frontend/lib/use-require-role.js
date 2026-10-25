'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiRequest } from './api';

export function useRequireRole(role) {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiRequest('/auth/me')
      .then(({ data }) => {
        if (!active) return;
        if (data.user.role !== role) {
          router.replace(data.user.role === 'seller' ? '/seller/dashboard' : '/');
          return;
        }
        setUser(data.user);
        setReady(true);
      })
      .catch(() => {
        if (!active) return;
        router.replace('/login');
      })
      .finally(() => {
        if (active) setError('');
      });
    return () => {
      active = false;
    };
  }, [role, router]);

  return { user, ready, error };
}
