'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import WishlistIcon from '@/components/WishlistIcon';
import '../styles.css';
import './styles.css';

export default function BlogPage() {
  const router = useRouter();
  const { user, clearUser } = useUserStore();
  const { count: cartCount, fetchCount } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [blogs, setBlogs] = useState([]);
  const [loadingBlogs, setLoadingBlogs] = useState(true);
  const [blogError, setBlogError] = useState('');

  useEffect(() => {
    setMounted(true);
    fetchCount();
  }, []);

  useEffect(() => {
    const fetchBlogs = async () => {
      try {
        setLoadingBlogs(true);
        setBlogError('');

        const candidates = [
          '/internal-api/v1/blog',
          '/api/v1/blog',
          '/api/v1/blogs',
          '/api/blog',
          '/api/blogs'
        ];

        let payload = null;

        for (const url of candidates) {
          try {
            const res = await fetch(url, {
              method: 'GET',
              headers: { 'Content-Type': 'application/json' }
            });

            if (!res.ok) {
              lastError = `HTTP ${res.status} at ${url}`;
              continue;
            }

            payload = await res.json();
            break;
          } catch (err) {
            lastError = `${url}: ${err?.message || 'Network error'}`;
          }
        }

        if (!payload) {
          // Không có endpoint nào hợp lệ: hiển thị danh sách rỗng thay vì throw lỗi runtime
          setBlogs([]);
          setBlogError('');
          return;
        }

        const rawBlogs = Array.isArray(payload)
          ? payload
          : Array.isArray(payload?.data)
            ? payload.data
            : Array.isArray(payload?.blogs)
              ? payload.blogs
              : [];

        const normalized = rawBlogs.map((item) => ({
          id: item.id,
          title: item.title || 'Untitled',
          description: item.description || '',
          content: item.content || '',
          imageUrl: item.imageurl || '/assets/img/blog/01.jpg',
          createdAt: item.createdat || item.createdAt || item.created_at || null
        }));

        setBlogs(normalized);
      } catch (error) {
        console.error('Fetch blog error:', error);
        setBlogError(error?.message || 'Không tải được danh sách blog. Vui lòng thử lại sau.');
      } finally {
        setLoadingBlogs(false);
      }
    };

    fetchBlogs();
  }, []);

  const handleLogout = async () => {
    try {
      if (user?.id) {
        await fetch('/api/v1/auth/logout', {
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

  if (!mounted) return null;

  return (
    <>
      {/* Header Top */}
      <div className="header-top">
        <div className="container">
          <div className="header-top-wrapper">
            <div className="row">
              <div className="col-12 col-md-7 col-lg-7 col-xl-7">
                <div className="header-top-left">
                  <ul className="header-top-list">
                    <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i> info@example.com</a></li>
                    <li><a href="tel:+21236547898"><i className="fas fa-headset"></i> +2 123 654 7898</a></li>
                    <li><a href="#"><i className="fas fa-question-circle"></i> Need Help?</a></li>
                  </ul>
                </div>
              </div>
              <div className="col-12 col-md-5 col-lg-5 col-xl-5" style={{ marginLeft: 'auto', flex: 'none', width: 'auto', maxWidth: 'none', paddingRight: 0 }}>
                <div className="header-top-right">
                  <ul className="header-top-list">
                    {user ? (
                      <>
                        <li><Link href="/profile"><i className="fas fa-user"></i> {user.full_name || 'User'}</Link></li>
                        <li>
                          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit' }}>
                            <i className="fas fa-sign-out-alt"></i> Logout
                          </button>
                        </li>
                      </>
                    ) : (
                      <li><Link href="/login"><i className="fas fa-sign-in-alt"></i> Login</Link></li>
                    )}
                    <li className="social">
                      <div className="header-top-social">
                        <span>Follow Us: </span>
                        <a href="#"><i className="fab fa-facebook"></i></a>
                        <a href="#"><i className="fab fa-x-twitter"></i></a>
                        <a href="#"><i className="fab fa-instagram"></i></a>
                        <a href="#"><i className="fab fa-linkedin"></i></a>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navbar */}
      <div className="main-navigation">
        <nav className="navbar navbar-expand-lg">
          <div className="container position-relative">
            <a className="navbar-brand" href="/">
              <img alt="logo" src="/assets/img/logo/logo.png" style={{maxWidth: '120px', margin: '0 10px', transform: 'translateY(18px)'}} />
            </a>
            <div className="mobile-menu-right">
              <div className="mobile-menu-btn">
                <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                <WishlistIcon className="nav-right-link" />
                <a className="nav-right-link" href="/cart"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</a>
              </div>
              <button className="navbar-toggler" type="button"><span></span><span></span><span></span></button>
            </div>
            <div className="navbar-collapse">
              <ul className="navbar-nav">
                <li className="nav-item"><a className="nav-link" href="/">Home</a></li>
                <li className="nav-item"><a className="nav-link" href="/about">About</a></li>
                <li className="nav-item"><a className="nav-link" href="/shop-search">Shop</a></li>
                <li className="nav-item"><a className="nav-link active" href="/blog">Blog</a></li>
                <li className="nav-item"><a className="nav-link" href="/contact">Contact</a></li>
              </ul>
              <div className="nav-right">
                <ul className="nav-right-list">
                  <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                  <li><WishlistIcon linkClass="list-link" /></li>
                  <li><a className="list-link" href="/cart"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</a></li>
                </ul>
              </div>
            </div>
          </div>
        </nav>
      </div>
      {/* Navbar end */}

      <main className="main">
        {/* Breadcrumb */}
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{background: 'url(/assets/img/breadcrumb/01.jpg)'}}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">Our Blog</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="far fa-home"></i> Home</Link></li>
                <li className="active">Our Blog</li>
              </ul>
            </div>
          </div>
        </div>
        {/* Breadcrumb end */}

        {/* Blog Area */}
        <div className="blog-area py-100">
          <div className="container">
            <div className="row">
              <div className="col-lg-6 mx-auto">
                <div className="site-heading text-center">
                  <span className="site-title-tagline">Our Blog</span>
                  <h2 className="site-title">Our Latest News & <span>Blog</span></h2>
                </div>
              </div>
            </div>
            <div className="row g-4">
              {loadingBlogs && (
                <div className="col-12 text-center">Đang tải blog...</div>
              )}

              {!loadingBlogs && blogError && (
                <div className="col-12 text-center" style={{ color: 'red' }}>{blogError}</div>
              )}

              {!loadingBlogs && !blogError && blogs.length === 0 && (
                <div className="col-12 text-center">Chưa có bài blog nào.</div>
              )}

              {!loadingBlogs && !blogError && blogs.map((blog) => (
                <div className="col-md-6 col-lg-4" key={blog.id}>
                  <div className="blog-item">
                    <div className="blog-item-img">
                      <img src={blog.imageUrl} alt={blog.title || 'Blog'} />
                      <span className="blog-date">
                        <i className="far fa-calendar-alt"></i>{' '}
                        {blog.createdAt ? new Date(blog.createdAt).toLocaleDateString('vi-VN') : 'N/A'}
                      </span>
                    </div>
                    <div className="blog-item-info">
                      <div className="blog-item-meta">
                        <ul>
                          <li><a href="#"><i className="far fa-user-circle"></i> By Admin</a></li>
                        </ul>
                      </div>
                      <h4 className="blog-title">
                        <Link href={`/blog/${blog.id}`}>{blog.title}</Link>
                      </h4>
                      <p>{blog.description || blog.content?.slice(0, 120) || 'No description'}</p>
                      <Link className="theme-btn" href={`/blog/${blog.id}`}>Read More<i className="fas fa-arrow-right"></i></Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            <div className="pagination-area mt-60">
              <div aria-label="Page navigation">
                <ul className="pagination">
                  <li className="page-item">
                    <a className="page-link" href="#" aria-label="Previous">
                      <span aria-hidden="true"><i className="far fa-arrow-left"></i></span>
                    </a>
                  </li>
                  <li className="page-item active"><a className="page-link" href="#">1</a></li>
                  <li className="page-item"><a className="page-link" href="#">2</a></li>
                  <li className="page-item"><span className="page-link">...</span></li>
                  <li className="page-item"><a className="page-link" href="#">10</a></li>
                  <li className="page-item">
                    <a className="page-link" href="#" aria-label="Next">
                      <span aria-hidden="true"><i className="far fa-arrow-right"></i></span>
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            {/* Pagination end */}
          </div>
        </div>
        {/* Blog Area end */}
      </main>

      {/* Footer */}
      <footer className="footer-area ft-bg">
        <div className="footer-widget">
          <div className="container">
            <div className="row footer-widget-wrapper pt-100 pb-40">
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box about-us">
                  <Link href="/" className="footer-logo">
                    <img src="/assets/img/logo/logo-light.png" alt="" />
                  </Link>
                  <p className="mb-3">
                    Modern e-commerce platform with blockchain technology
                  </p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84123456789"><i className="fas fa-phone"></i>+84 123 456 789</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hanoi, Vietnam</li>
                    <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i>info@example.com</a></li>
                    <li><i className="fas fa-clock"></i>Mon-Sat (9:00 - 18:00)</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Quick Links</h4>
                  <ul className="footer-list">
                    <li><Link href="/about">About Us</Link></li>
                    <li><Link href="/help">Help</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                    <li><Link href="/blog">News</Link></li>
                    <li><Link href="/terms">Terms</Link></li>
                    <li><Link href="/privacy">Privacy</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Categories</h4>
                  <ul className="footer-list">
                    <li><Link href="/shop-search">Furniture</Link></li>
                    <li><Link href="/shop-search">Electronics</Link></li>
                    <li><Link href="/shop-search">Fashion</Link></li>
                    <li><Link href="/shop-search">Beauty</Link></li>
                    <li><Link href="/shop-search">Sports</Link></li>
                    <li><Link href="/shop-search">Books</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Support</h4>
                  <ul className="footer-list">
                    <li><Link href="/faq">FAQ</Link></li>
                    <li><Link href="/help">Shopping Guide</Link></li>
                    <li><Link href="/track-order">Track Order</Link></li>
                    <li><Link href="/return">Return Policy</Link></li>
                    <li><Link href="/contact">Contact Us</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Payment</h4>
                  <div className="footer-payment mt-20">
                    <span>We accept:</span>
                    <img src="/assets/img/payment/visa.svg" alt="" />
                    <img src="/assets/img/payment/mastercard.svg" alt="" />
                    <img src="/assets/img/payment/momo.svg" alt="" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="copyright">
          <div className="container">
            <div className="copyright-wrap">
              <div className="row">
                <div className="col-12 col-lg-6 align-self-center">
                  <p className="copyright-text">
                    &copy; Copyright 2026 <a href="/"> E-Commerce </a> All Rights Reserved.
                  </p>
                </div>
                <div className="col-12 col-lg-6 align-self-center">
                  <div className="footer-social">
                    <span>Follow Us:</span>
                    <a href="#"><i className="fab fa-facebook-f"></i></a>
                    <a href="#"><i className="fab fa-x-twitter"></i></a>
                    <a href="#"><i className="fab fa-linkedin-in"></i></a>
                    <a href="#"><i className="fab fa-youtube"></i></a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Scroll to top */}
      <a href="#" id="scroll-top"><i className="fas fa-arrow-up"></i></a>
    </>
  );
}
