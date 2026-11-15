// frontend-app\src\components\shared\Header.js

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/store/useUserStore';
import './Header.css';

export default function Header() {
  const router = useRouter();
  const { user, clearUser } = useUserStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    try {
      if (user?.id) {
        await fetch('http://localhost:4000/api/v1/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id })
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    clearUser();
    router.push('/login');
  };

  // Prevent hydration mismatch
  if (!mounted) {
    return (
      <header className="header">
        <div className="header-top">
          <div className="container">
            <div className="header-top-content">
              <div className="header-top-left">
                <ul className="header-top-list">
                  <li>
                    <a href="mailto:support@ecommerce.vn">
                      <i className="far fa-envelope"></i>
                      support@ecommerce.vn
                    </a>
                  </li>
                  <li>
                    <a href="tel:+84123456789">
                      <i className="far fa-phone"></i>
                      +84 123 456 789
                    </a>
                  </li>
                </ul>
              </div>
              <div className="header-top-right">
                <ul className="header-top-list">
                  <li><Link href="/login"><i className="far fa-sign-in"></i> Login</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="header">
      <div className="header-top">
        <div className="container">
          <div className="header-top-content">
            <div className="header-top-left">
              <ul className="header-top-list">
                <li>
                  <a href="mailto:support@ecommerce.vn">
                    <i className="far fa-envelope"></i>
                    support@ecommerce.vn
                  </a>
                </li>
                <li>
                  <a href="tel:+84123456789">
                    <i className="far fa-phone"></i>
                    +84 123 456 789
                  </a>
                </li>
              </ul>
            </div>
            <div className="header-top-right">
              <ul className="header-top-list">
                {user ? (
                  <>
                    <li>
                      <Link href="/profile">
                        <i className="fas fa-user"></i> {user.full_name || user.email}
                      </Link>
                    </li>
                    <li>
                      <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>
                        <i className="fas fa-sign-out-alt"></i> Logout
                      </button>
                    </li>
                  </>
                ) : (
                  <>
                    <li><Link href="/login"><i className="fas fa-sign-in-alt"></i> Login</Link></li>
                    <li><Link href="/register"><i className="fas fa-user-plus"></i> Register</Link></li>
                  </>
                )}
                <li>
                  <div className="header-top-social">
                    <span>Follow: </span>
                    <a href="#"><i className="fab fa-facebook"></i></a>
                    <a href="#"><i className="fab fa-twitter"></i></a>
                    <a href="#"><i className="fab fa-instagram"></i></a>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

