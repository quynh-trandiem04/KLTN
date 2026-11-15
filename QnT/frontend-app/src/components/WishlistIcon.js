'use client';

import Link from 'next/link';
import { useWishlistStore } from '@/store/useWishlistStore';
import { useUserStore } from '@/store/useUserStore';
import { useEffect, useState } from 'react';

export default function WishlistIcon({ className = '', linkClass = '' }) {
  const { user } = useUserStore();
  const count = useWishlistStore(state => state.count);
  const fetchCount = useWishlistStore(state => state.fetchCount);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (user) fetchCount();
  }, [user, fetchCount]);

  if (!mounted) return null;

  return (
    <Link href="/profile?tab=wishlist" className={linkClass || className || 'list-link'}>
      <i className="far fa-heart"></i>
      {count > 0 && <span>{count}</span>}
    </Link>
  );
}
