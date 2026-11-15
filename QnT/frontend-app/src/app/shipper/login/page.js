// frontend-app\src\app\shipper\login\page.js

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import Head from 'next/head';
import './shipper-auth.css';

export default function ShipperLoginPage() {
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
      const response = await axios.post('/v1/auth/shipper/login', {
        email: formData.email,
        password: formData.password
      });

      // Store token and user info
      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      localStorage.setItem('userType', 'shipper');

      // Redirect to shipper dashboard
      router.push('/shipper/dashboard');

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
                      <li><a href="mailto:shipper@example.com"><i className="fas fa-envelope"></i> shipper@example.com</a></li>
                      <li><a href="tel:+84456789123"><i className="fas fa-headset"></i> +84 456 789 123</a></li>
                      <li className="help"><Link href="/shipper/help"><i className="fas fa-question-circle"></i> Need Help?</Link></li>
                    </ul>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-6 col-xl-7">
                  <div className="header-top-right">
                    <ul className="header-top-list">
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
              <Link href="/shipper" className="navbar-brand">
                <img src="/assets/img/logo/logo.png" alt="logo" style={{
                  maxWidth: '120px',
                  margin: '0 10px',
                  transform: 'translateY(18px)'
                }} />
              </Link>
              <div className="mobile-menu-right">
                <div className="mobile-menu-btn">
                  <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                  <Link href="/shipper/deliveries" className="nav-right-link"><i className="fas fa-box"></i><span>0</span></Link>
                  <Link href="/shipper/routes" className="nav-right-link"><i className="fas fa-route"></i><span>0</span></Link>
                </div>
                <button className="navbar-toggler" type="button">
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
              </div>
              <div className="navbar-collapse">
                <ul className="navbar-nav">
                  <li className="nav-item"><Link className="nav-link" href="/shipper">Shipper Home</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/shipper/about">About Us</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/shipper/support">Support</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/shipper/contact">Contact</Link></li>
                </ul>
                <div className="nav-right">
                  <ul className="nav-right-list">
                    <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                    <li><Link href="/shipper/deliveries" className="list-link"><i className="fas fa-box"></i><span>0</span></Link></li>
                    <li><Link href="/shipper/routes" className="list-link"><i className="fas fa-route"></i><span>0</span></Link></li>
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
              <h4 className="breadcrumb-title">Shipper Login</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/shipper"><i className="fas fa-home"></i> Shipper Home</Link></li>
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
                  <p>Login to Shipper area</p>
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
                      placeholder="Enter your shipper email"
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
                    <Link href="/shipper/forgot-password" className="forgot-pass">Forgot password?</Link>
                  </div>
                  <div className="d-flex align-items-center">
                    <button 
                      type="submit" 
                      className="theme-btn"
                      disabled={loading}
                    >
                      <i className="fas fa-truck"></i> 
                      {loading ? 'Processing...' : 'Login'}
                    </button>
                  </div>
                </form>
                <div className="login-footer">
                  <p>Need shipper account? Please contact administrator.</p>
                  <p><Link href="/login">Login with customer account</Link></p>
                  <p><Link href="/seller/login">Login with Seller account</Link></p>
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
                  <Link href="/shipper" className="footer-logo">
                    <img src="/assets/img/logo/logo-light.png" alt="" />
                  </Link>
                  <p className="mb-3">
                    Nền tảng giao hàng dành cho Shipper
                  </p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84456789123"><i className="fas fa-phone"></i>+84 456 789 123</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hà Nội, Việt Nam</li>
                    <li><a href="mailto:shipper@example.com"><i className="fas fa-envelope"></i>shipper@example.com</a></li>
                    <li><i className="fas fa-clock"></i>Thứ 2-CN (24/7)</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Shipper</h4>
                  <ul className="footer-list">
                    <li><Link href="/shipper/about">About Shipper</Link></li>
                    <li><Link href="/shipper/contact">Contact</Link></li>
                    <li><Link href="/shipper/blog">News</Link></li>
                    <li><Link href="/shipper/terms">Terms</Link></li>
                    <li><Link href="/shipper/privacy">Privacy</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Giao hàng</h4>
                  <ul className="footer-list">
                    <li><Link href="/shipper/deliveries">Đơn giao hàng</Link></li>
                    <li><Link href="/shipper/routes">Tuyến đường</Link></li>
                    <li><Link href="/shipper/earnings">Thu nhập</Link></li>
                    <li><Link href="/shipper/schedule">Lịch trình</Link></li>
                    <li><Link href="/shipper/vehicles">Phương tiện</Link></li>
                    <li><Link href="/shipper/analytics">Báo cáo</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Support</h4>
                  <ul className="footer-list">
                    <li><Link href="/shipper/faq">FAQ</Link></li>
                    <li><Link href="/shipper/help">Delivery Guide</Link></li>
                    <li><Link href="/shipper/training">Training</Link></li>
                    <li><Link href="/shipper/safety">Safety</Link></li>
                    <li><Link href="/shipper/contact">Contact Support</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Thanh toán</h4>
                  <div className="footer-payment mt-20">
                    <span>Phương thức thanh toán:</span>
                    <img src="/assets/img/payment/bank.svg" alt="" />
                    <img src="/assets/img/payment/momo.svg" alt="" />
                    <img src="/assets/img/payment/cash.svg" alt="" />
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
                    &copy; Copyright 2026 <a href="/shipper"> Shipper Hub </a> All Rights Reserved.
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