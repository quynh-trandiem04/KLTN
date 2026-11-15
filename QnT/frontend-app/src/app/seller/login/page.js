// frontend-app\src\app\seller\login\page.js

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import Head from 'next/head';
import './styles.css';

export default function SellerLoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('/v1/auth/seller/login', {
        email: formData.email,
        password: formData.password
      });

      // Store token and user info
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      localStorage.setItem('userType', 'seller');

      // Redirect to seller dashboard
      router.push('/seller/dashboard');

    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
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
                      <li><a href="mailto:seller@example.com"><i className="fas fa-envelope"></i> seller@example.com</a></li>
                      <li><a href="tel:+84987654321"><i className="fas fa-headset"></i> +84 987 654 321</a></li>
                      <li><a href="#"><i className="fas fa-question-circle"></i> Seller Support</a></li>
                    </ul>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-6 col-xl-7">
                  <div className="header-top-right">
                    <ul className="header-top-list">
                      <li><Link href="/seller/register"><i className="fas fa-store"></i> Seller Registration</Link></li>
                      <li><Link href="/login"><i className="fas fa-user"></i> Customer</Link></li>
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
              <Link href="/seller" className="navbar-brand">
                <img src="/assets/img/logo/logo.png" alt="logo" style={{
                  maxWidth: '120px',
                  margin: '0 10px',
                  transform: 'translateY(18px)'
                }} />
              </Link>
              <div className="mobile-menu-right">
                <div className="mobile-menu-btn">
                  <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                  <Link href="/seller/products" className="nav-right-link"><i className="fas fa-box"></i><span>0</span></Link>
                  <Link href="/seller/orders" className="nav-right-link"><i className="fas fa-shopping-cart"></i><span>0</span></Link>
                </div>
                <button className="navbar-toggler" type="button">
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
              </div>
              <div className="navbar-collapse">
                <ul className="navbar-nav">
                  <li className="nav-item"><Link className="nav-link" href="/seller">Seller Home</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/seller/about">About Us</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/seller/support">Support</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/seller/contact">Contact</Link></li>
                </ul>
                <div className="nav-right">
                  <ul className="nav-right-list">
                    <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                    <li><Link href="/seller/products" className="list-link"><i className="fas fa-box"></i><span>0</span></Link></li>
                    <li><Link href="/seller/orders" className="list-link"><i className="fas fa-shopping-cart"></i><span>0</span></Link></li>
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
              <h4 className="breadcrumb-title">Seller Login</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/seller"><i className="fas fa-home"></i> Seller Home</Link></li>
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
                  <p>Login to Seller area</p>
                </div>

                {error && (
                  <div className="error-alert">
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input 
                      type="email" 
                      className="form-control" 
                      placeholder="Enter shop email"
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
                        Remember login
                      </label>
                    </div>
                    <Link href="/seller/forgot-password" className="forgot-pass">Forgot password?</Link>
                  </div>
                  <div className="d-flex align-items-center">
                    <button 
                      type="submit" 
                      className="theme-btn"
                      disabled={loading}
                    >
                      <i className="fas fa-sign-in-alt"></i> 
                      {loading ? 'Processing...' : 'Login'}
                    </button>
                  </div>
                </form>
                <div className="login-footer">
                  <p>Don't have a shop? <Link href="/seller/register">Register Seller.</Link></p>
                  <p><Link href="/login">Login with customer account</Link></p>
                  <div className="social-login">
                    <span className="social-divider"></span>
                    <p>Continue with social media</p>
                    <div className="social-login-list">
                      <a href="#" className="gl-auth"><i className="fab fa-google"></i> Google</a>
                    </div>
                  </div>
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
                  <Link href="/seller" className="footer-logo">
                    <img src="/assets/img/logo/logo-light.png" alt="" />
                  </Link>
                  <p className="mb-3">
                    Nền tảng bán hàng trực tuyến dành cho Seller
                  </p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84987654321"><i className="fas fa-phone"></i>+84 987 654 321</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hà Nội, Việt Nam</li>
                    <li><a href="mailto:seller@example.com"><i className="fas fa-envelope"></i>seller@example.com</a></li>
                    <li><i className="fas fa-clock"></i>Thứ 2-7 (8:00 - 20:00)</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Seller</h4>
                  <ul className="footer-list">
                    <li><Link href="/seller/about">Về Seller Hub</Link></li>
                    <li><Link href="/seller/help">Seller Support</Link></li>
                    <li><Link href="/seller/contact">Contact</Link></li>
                    <li><Link href="/seller/blog">Tin tức Seller</Link></li>
                    <li><Link href="/seller/terms">Điều khoản Seller</Link></li>
                    <li><Link href="/seller/privacy">Chính sách</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Quản lý</h4>
                  <ul className="footer-list">
                    <li><Link href="/seller/products">Sản phẩm</Link></li>
                    <li><Link href="/seller/orders">Đơn hàng</Link></li>
                    <li><Link href="/seller/customers">Customers</Link></li>
                    <li><Link href="/seller/analytics">Báo cáo</Link></li>
                    <li><Link href="/seller/promotion">Khuyến mãi</Link></li>
                    <li><Link href="/seller/settings">Cài đặt</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Support</h4>
                  <ul className="footer-list">
                    <li><Link href="/seller/faq">FAQ</Link></li>
                    <li><Link href="/seller/help">Hướng dẫn bán hàng</Link></li>
                    <li><Link href="/seller/training">Đào tạo</Link></li>
                    <li><Link href="/seller/policy">Chính sách</Link></li>
                    <li><Link href="/seller/contact">Contact Support</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Thanh toán</h4>
                  <div className="footer-payment mt-20">
                    <span>Phương thức thanh toán:</span>
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
                    &copy; Copyright 2026 <a href="/seller"> Seller Hub </a> All Rights Reserved.
                  </p>
                </div>
                <div className="col-12 col-lg-6 align-self-center">
                  <div className="footer-social">
                    <span>Theo dõi:</span>
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