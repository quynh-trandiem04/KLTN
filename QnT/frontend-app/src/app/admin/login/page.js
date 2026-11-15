// frontend-app\src\app\admin\login\page.js

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import Head from 'next/head';
import './styles.css';

export default function AdminLoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    adminSecret: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('/v1/auth/admin/login', {
        email: formData.email,
        password: formData.password
      }, {
        headers: {
          'X-Admin-Secret': formData.adminSecret
        }
      });

      // Store token and user info
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      localStorage.setItem('userType', 'admin');

      // Redirect to admin dashboard
      router.push('/admin/dashboard');

    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials and Admin secret code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </Head>
      
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
                      <li><a href="#"><i className="fas fa-question-circle"></i> Admin Support</a></li>
                    </ul>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-6 col-xl-7">
                  <div className="header-top-right">
                    <ul className="header-top-list">
                      <li><Link href="/admin/register"><i className="fas fa-user-shield"></i> Register</Link></li>
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
              <Link href="/admin" className="navbar-brand">
                <img src="/assets/img/logo/logo.png" alt="logo" style={{
                  maxWidth: '120px',
                  margin: '0 10px',
                  transform: 'translateY(18px)'
                }} />
              </Link>
              <div className="mobile-menu-right">
                <div className="mobile-menu-btn">
                  <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                  <Link href="/admin/users" className="nav-right-link"><i className="fas fa-users"></i><span>0</span></Link>
                  <Link href="/admin/shippers" className="nav-right-link"><i className="fas fa-truck"></i><span>0</span></Link>
                  <Link href="/admin/orders" className="nav-right-link"><i className="fas fa-shopping-cart"></i><span>0</span></Link>
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
                  <li className="nav-item"><Link className="nav-link" href="/admin/support">Support</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/admin/contact">Contact</Link></li>
                </ul>
                <div className="nav-right">
                  <ul className="nav-right-list">
                    <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                    <li><Link href="/admin/users" className="list-link"><i className="fas fa-users"></i><span>0</span></Link></li>
                    <li><Link href="/admin/shippers" className="list-link"><i className="fas fa-truck"></i><span>0</span></Link></li>
                    <li><Link href="/admin/orders" className="list-link"><i className="fas fa-shopping-cart"></i><span>0</span></Link></li>
                  </ul>
                </div>
              </div>
            </div>
          </nav>
        </div>
        {/* navbar end */}
      </header>

      {/* breadcrumb */}
      <main className="main">
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{background: 'url(/assets/img/breadcrumb/01.jpg)'}}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">Admin Login</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/admin"><i className="fas fa-home"></i> Admin Panel</Link></li>
                <li className="active">Login</li>
              </ul>
            </div>
          </div>
        </div>
        {/* breadcrumb end */}

        {/* login area */}
        <div className="login-area">
          <div className="container">
            <div className="col-md-7 col-lg-5 mx-auto">
              <div className="login-form">
                <div className="login-header">
                  <img 
                    src="/assets/img/logo/logo.png" 
                    alt="Logo"
                    style={{ maxWidth: '150px' }}
                  />
                  <p>Login to admin area</p>
                </div>

                {error && (
                  <div className="error-alert">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="admin-secret-group">
                    <div className="form-group">
                      <label>Mã bí mật Admin</label>
                      <input 
                        type="password" 
                        className="form-control" 
                        placeholder="Nhập mã bí mật quản trị"
                        value={formData.adminSecret}
                        onChange={(e) => setFormData({...formData, adminSecret: e.target.value})}
                        required
                      />
                      <div className="admin-note">*Requires secret code from system administrator</div>
                    </div>
                  </div>

                  <div className="form-group">
                    <label>Admin Email Address</label>
                    <input 
                      type="email" 
                      className="form-control" 
                      placeholder="Enter admin email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Mật khẩu</label>
                    <input 
                      type="password" 
                      className="form-control" 
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      required
                    />
                  </div>
                  <div className="d-flex justify-content-between mb-4">
                    <div className="form-check">
                      <input 
                        className="form-check-input" 
                        type="checkbox" 
                        value="" 
                        id="remember"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      <label className="form-check-label" htmlFor="remember">
                        Remember session
                      </label>
                    </div>
                    <Link href="/admin/forgot-password" className="forgot-pass">Forgot password?</Link>
                  </div>
                  <div className="d-flex align-items-center">
                    <button 
                      type="submit" 
                      className="theme-btn"
                      disabled={loading}
                    >
                      <i className="fas fa-shield-alt"></i> 
                      {loading ? 'Authenticating...' : 'Admin Login'}
                    </button>
                  </div>
                </form>
                <div className="login-footer">
                  <p><Link href="/login">Login with customer account</Link></p>
                  <p><Link href="/seller/login">Login with Seller account</Link></p>
                  <p><Link href="/shipper/login">Login with Shipper account</Link></p>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* login area end */}
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