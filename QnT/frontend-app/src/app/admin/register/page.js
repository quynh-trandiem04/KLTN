// frontend-app\src\app\admin\register\page.js

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import WishlistIcon from '@/components/WishlistIcon';
import './styles.css';

export default function AdminRegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    admin_secret: ''
  });
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!agreed) {
      setError('You must agree to the Terms of Service');
      return;
    }

    setLoading(true);

    try {
      // Register admin account with admin secret in header
      await axios.post('/v1/auth/admin/register', {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name
      }, {
        headers: {
          'X-Admin-Secret': formData.admin_secret
        }
      });

      alert('Admin account registered successfully!');
      router.push('/login');

    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please check your admin code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="header">
        {/* header top */}
        <div className="header-top">
          <div className="container">
            <div className="header-top-wrapper">
              <div className="row">
                <div className="col-12 col-md-6 col-lg-6 col-xl-5">
                  <div className="header-top-left">
                    <ul className="header-top-list">
                      <li><a href="mailto:admin@example.com"><i className="fas fa-envelope"></i> admin@example.com</a></li>
                      <li><a href="tel:+84123456789"><i className="fas fa-headset"></i> +84 123 456 789</a></li>
                      <li><a href="#"><i className="fas fa-question-circle"></i> System Support</a></li>
                    </ul>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-6 col-xl-7">
                  <div className="header-top-right">
                    <ul className="header-top-list">
                      <li><Link href="/admin/login"><i className="fas fa-user-shield"></i> Admin</Link></li>
                      <li><Link href="/login"><i className="fas fa-user"></i> Customer</Link></li>
                      <li><Link href="/seller/login"><i className="fas fa-store"></i> Seller</Link></li>
                      <li><Link href="/shipper/login"><i className="fas fa-shipping-fast"></i> Shipper</Link></li>

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
        {/* header top end */}

        {/* navbar */}
        <div className="main-navigation">
          <nav className="navbar navbar-expand-lg">
            <div className="container position-relative">
              <Link href="/" className="navbar-brand">
                <img src="/assets/img/logo/logo.png" alt="logo" style={{
                  maxWidth: '120px',
                  margin: '0 10px',
                  transform: 'translateY(18px)'
                }} />
              </Link>
              <div className="mobile-menu-right">
                <div className="mobile-menu-btn">
                  <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                  <WishlistIcon className="nav-right-link" />
                  <Link href="/cart" className="nav-right-link"><i className="fas fa-shopping-bag"></i><span>0</span></Link>
                </div>
                <button className="navbar-toggler" type="button">
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
              </div>
              <div className="navbar-collapse">
                <ul className="navbar-nav">
                  <li className="nav-item"><Link className="nav-link" href="/admin">Admin Panel</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/admin/about">System</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/admin/docs">Documentation</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/admin/support">Support</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/admin/contact">Contact</Link></li>
                </ul>
                <div className="nav-right">
                  <ul className="nav-right-list">
                    <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                    <li><WishlistIcon linkClass="list-link" /></li>
                    <li><Link href="/admin/orders" className="list-link"><i className="fas fa-shopping-cart"></i><span>0</span></Link></li>
                  </ul>
                </div>
              </div>
            </div>
          </nav>
        </div>
      </header>
      <main className="main">
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{background: 'url(/assets/img/breadcrumb/01.jpg)'}}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">Register</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="fas fa-home"></i> Home</Link></li>
                <li className="active">Admin Registration</li>
              </ul>
            </div>
          </div>
        </div>
        {/* breadcrumb end */}

      <div className="login-area">
        <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 15px' }}>
          <div className="col-md-5" style={{ maxWidth: '500px', margin: '0 auto' }}>
            <div className="login-form">
              <div className="login-header">
                <img 
                  src="/assets/img/logo/logo.png" 
                  alt="Logo"
                  style={{ maxWidth: '150px', margin: '0 auto 15px', display: 'block' }}
                />
                <h2>Register Admin Account</h2>
                <p>Create system administrator account</p>
              </div>

              <div className="info-box">
                ⓘ You need a valid admin code to register
              </div>

              {error && (
                <div className="error-alert">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="form-group">
                  <label htmlFor="full_name">Full Name *</label>
                  <input
                    type="text"
                    id="full_name"
                    className="form-control"
                    placeholder="Enter full name"
                    value={formData.full_name}
                    onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="email">Email *</label>
                  <input
                    type="email"
                    id="email"
                    className="form-control"
                    placeholder="Enter email address"
                    value={formData.email}
                    onChange={(e) => setFormData({...formData, email: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="password">Password *</label>
                  <input
                    type="password"
                    id="password"
                    className="form-control"
                    placeholder="Enter password"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    required
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="admin_secret">Admin Secret Code *</label>
                  <input
                    type="password"
                    id="admin_secret"
                    className="form-control"
                    placeholder="Enter admin secret code"
                    value={formData.admin_secret}
                    onChange={(e) => setFormData({...formData, admin_secret: e.target.value})}
                    required
                  />
                </div>

                <div className="form-check">
                  <input
                    type="checkbox"
                    id="agree"
                    className="form-check-input"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                  />
                  <label htmlFor="agree" className="form-check-label">
                    I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>
                  </label>
                </div>

                <button
                  type="submit"
                  className="theme-btn"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm"></span>
                      Processing...
                    </>
                  ) : (
                    'Register Now'
                  )}
                </button>
              </form>

              <div className="login-footer">
                <p>Already have an account? <Link href="/login">Sign In</Link></p>
                <p>Register other account? <Link href="/register">Customer Account</Link> | <Link href="/seller/register">Seller Account</Link></p>
              </div>
            </div>
          </div>
        </div>
      </div>
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
                    <li><Link href="/shop">Furniture</Link></li>
                    <li><Link href="/shop">Electronics</Link></li>
                    <li><Link href="/shop">Fashion</Link></li>
                    <li><Link href="/shop">Beauty</Link></li>
                    <li><Link href="/shop">Sports</Link></li>
                    <li><Link href="/shop">Books</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Support</h4>
                  <ul className="footer-list">
                    <li><Link href="/faq">FAQ</Link></li>
                    <li><Link href="/help">Shopping Guide</Link></li>
                    <li><Link href="/track">Track Order</Link></li>
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
