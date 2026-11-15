// frontend-app\src\app\(auth)\register\page.js

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import Head from 'next/head';
import WishlistIcon from '@/components/WishlistIcon';
import './register.css';

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    phone_number: ''
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
      await axios.post('/v1/auth/register', {
        email: formData.email,
        password: formData.password,
        full_name: formData.full_name,
        phone_number: formData.phone_number
      });

      alert('Registration successful!');
      router.push('/login');

    } catch (err) {
      setError(err.response?.data?.detail || 'Registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        <link rel="stylesheet" href="/assets/css/all-fontawesome.min.css" />
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
                      <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i> info@example.com</a></li>
                      <li><a href="tel:+21236547898"><i className="fas fa-headset"></i> +2 123 654 7898</a></li>
                      <li><a href="#"><i className="fas fa-question-circle"></i> Need Help?</a></li>
                    </ul>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-6 col-xl-7">
                  <div className="header-top-right">
                    <ul className="header-top-list">
                      <li><Link href="/login"><i className="fas fa-sign-in-alt"></i> Login</Link></li>
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
                  <li className="nav-item"><Link className="nav-link" href="/">Home</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/about">About</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/shop-search">Shop</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/blog">Blog</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/contact">Contact</Link></li>
                </ul>
                <div className="nav-right">
                  <ul className="nav-right-list">
                    <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                    <li><WishlistIcon linkClass="list-link" /></li>
                    <li><Link href="/cart" className="list-link"><i className="fas fa-shopping-bag"></i><span>0</span></Link></li>
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
              <h4 className="breadcrumb-title">Register</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="fas fa-home"></i> Home</Link></li>
                <li className="active">Register</li>
              </ul>
            </div>
          </div>
        </div>
        {/* breadcrumb end */}

        <div className="login-area">
          <div className="container" style={{ maxWidth: '1200px', margin: '0 auto', padding: '0 15px' }}>
            <div className="col-md-5" style={{ maxWidth: '600px', margin: '0 auto' }}>
              <div className="login-form">
                <div className="login-header">
                  <img 
                    src="/assets/img/logo/logo.png" 
                    alt="Logo"
                    style={{ maxWidth: '150px', margin: '0 auto 15px', display: 'block' }}
                  />
                  <h2>Create Account</h2>
                  <p>Create your free account</p>
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
                    <label htmlFor="email">Email Address *</label>
                    <input
                      type="email"
                      id="email"
                      className="form-control"
                      placeholder="Enter email"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="phone_number">Phone Number *</label>
                    <input 
                      type="tel"
                      id="phone_number" 
                      className="form-control" 
                      placeholder="Enter phone number"
                      value={formData.phone_number}
                      onChange={(e) => setFormData({...formData, phone_number: e.target.value})}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label htmlFor="password">Mật khẩu *</label>
                    <input 
                      type="password"
                      id="password" 
                      className="form-control" 
                      placeholder="Enter password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      required
                      minLength={8}
                    />
                  </div>

                  <div className="form-check">
                    <input 
                      className="form-check-input" 
                      type="checkbox" 
                      id="agree"
                      checked={agreed}
                      onChange={(e) => setAgreed(e.target.checked)}
                    />
                    <label className="form-check-label" htmlFor="agree">
                      I agree to the <a href="#">Terms of Service.</a>
                    </label>
                  </div>

                  <div className="d-flex align-items-center">
                    <button 
                      type="submit" 
                      className="theme-btn"
                      disabled={loading}
                    >
                      <i className="far fa-paper-plane"></i> 
                      {loading ? 'Processing...' : 'Register'}
                    </button>
                  </div>
                </form>

                <div className="login-footer">
                  <p>
                    Already have an account? <Link href="/login">Login.</Link>
                  </p>

                  <div className="social-login">
                    <div className="social-divider"></div>
                    <p>Continue with social media</p>
                    <div className="social-login-list">
                      <a href="#" className="gl-auth">
                        <i className="fab fa-google"></i> Google
                      </a>
                    </div>
                  </div>
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
                    Nền tảng thương mại điện tử hiện đại với công nghệ blockchain
                  </p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84123456789"><i className="fas fa-phone"></i>+84 123 456 789</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hà Nội, Việt Nam</li>
                    <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i>info@example.com</a></li>
                    <li><i className="fas fa-clock"></i>Thứ 2-7 (9:00 - 18:00)</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Liên kết</h4>
                  <ul className="footer-list">
                    <li><Link href="/about">About Us</Link></li>
                    <li><Link href="/help">Support</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                    <li><Link href="/blog">News</Link></li>
                    <li><Link href="/terms">Terms</Link></li>
                    <li><Link href="/privacy">Chính sách</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Danh mục</h4>
                  <ul className="footer-list">
                    <li><Link href="/shop">Nội thất</Link></li>
                    <li><Link href="/shop">Điện tử</Link></li>
                    <li><Link href="/shop">Thời trang</Link></li>
                    <li><Link href="/shop">Làm đẹp</Link></li>
                    <li><Link href="/shop">Thể thao</Link></li>
                    <li><Link href="/shop">Sách</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Support</h4>
                  <ul className="footer-list">
                    <li><Link href="/faq">FAQ</Link></li>
                    <li><Link href="/help">Shopping Guide</Link></li>
                    <li><Link href="/track">Theo dõi đơn hàng</Link></li>
                    <li><Link href="/return">Return Policy</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Thanh toán</h4>
                  <div className="footer-payment mt-20">
                    <span>Chúng tôi chấp nhận:</span>
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
