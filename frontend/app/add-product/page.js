'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireRole } from '../../lib/use-require-role';

export default function AddProductPage() {
  const router = useRouter();
  const { ready } = useRequireRole('seller');
  useEffect(() => {
    if (ready) router.replace('/seller/dashboard');
  }, [ready, router]);
  return <main className="site-shell"><p className="message">Opening stall management...</p></main>;
}
