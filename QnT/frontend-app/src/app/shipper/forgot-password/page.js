'use client';

import { useState } from 'react';
import Link from 'next/link';
import axios from '@/lib/axios';
import '../login/shipper-auth.css';

export default function ShipperForgotPasswordPage() {
  const [email, setEmail]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [success, setSuccess]   = useState(false);
  const [error, setError]       = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await axios.post('/v1/auth/forgot-password', { email });
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.detail || 'Có lỗi xảy ra. Vui lòng thử lại.');
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
                      <li><a href="mailto:shipper@example.com"><i className="fas fa-envelope"></i> shipper@example.com</a></li>
                      <li><a href="tel:+84456789123"><i className="fas fa-headset"></i> +84 456 789 123</a></li>
                      <li><Link href="/shipper/help"><i className="fas fa-question-circle"></i> Need Help?</Link></li>
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
                <img src="/assets/img/logo/logo.png" alt="logo" style={{ maxWidth: '120px', margin: '0 10px', transform: 'translateY(18px)' }} />
              </Link>
              <div className="mobile-menu-right">
                <div className="mobile-menu-btn">
                  <Link href="/shipper/deliveries" className="nav-right-link"><i className="fas fa-box"></i></Link>
                  <Link href="/shipper/routes" className="nav-right-link"><i className="fas fa-route"></i></Link>
                </div>
                <button className="navbar-toggler" type="button">
                  <span></span><span></span><span></span>
                </button>
              </div>
              <div className="navbar-collapse">
                <ul className="navbar-nav">
                  <li className="nav-item"><Link className="nav-link" href="/shipper">Shipper Home</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/shipper/login">Đăng nhập</Link></li>
                </ul>
                <div className="nav-right">
                  <ul className="nav-right-list">
                    <li><Link href="/shipper/deliveries" className="list-link"><i className="fas fa-box"></i></Link></li>
                    <li><Link href="/shipper/routes" className="list-link"><i className="fas fa-route"></i></Link></li>
                  </ul>
                </div>
              </div>
            </div>
          </nav>
        </div>
        {/* navbar end */}
      </header>

      <main className="main">
        {/* breadcrumb */}
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{ background: 'url(/assets/img/breadcrumb/01.jpg)' }}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">Forgot Password</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/shipper"><i className="fas fa-home"></i> Shipper Home</Link></li>
                <li className="active">Forgot Password</li>
              </ul>
            </div>
          </div>
        </div>
        {/* breadcrumb end */}

        {/* forgot password */}
        <div className="login-area py-100">
          <div className="container">
            <div className="col-md-5 mx-auto">
              <div className="login-form">
                <div className="login-header">
                  <img src="/assets/img/logo/logo.png" alt="" style={{ maxWidth: '150px' }} />
                  <p>Reset your shipper account password</p>
                </div>

                {success ? (
                  <div style={{ textAlign: 'center', padding: '20px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', color: '#16a34a' }}>
                    <i className="fas fa-check-circle" style={{ fontSize: '2rem', marginBottom: '10px', display: 'block' }}></i>
                    <p style={{ fontWeight: 600, marginBottom: '8px' }}>Email đã được gửi!</p>
                    <p style={{ fontSize: '14px', color: '#166534' }}>Vui lòng kiểm tra hộp thư <strong>{email}</strong> và làm theo hướng dẫn để đặt lại mật khẩu.</p>
                    <Link href="/shipper/login" style={{ display: 'inline-block', marginTop: '16px', color: '#5c86b8', fontWeight: 600, textDecoration: 'none' }}>
                      <i className="fas fa-arrow-left"></i> Quay lại đăng nhập
                    </Link>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit}>
                    {error && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '12px', borderRadius: '6px', marginBottom: '16px', fontSize: '14px' }}>
                        <i className="fas fa-exclamation-circle" style={{ marginRight: '6px' }}></i>{error}
                      </div>
                    )}
                    <div className="form-group">
                      <label>Email Address</label>
                      <input
                        type="email"
                        className="form-control"
                        placeholder="Your shipper email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>
                    <div className="d-flex align-items-center" style={{ flexDirection: 'column', gap: '12px' }}>
                      <button type="submit" className="theme-btn" disabled={loading} style={{ width: '100%' }}>
                        <i className="fas fa-key"></i> {loading ? 'Sending...' : 'Send Reset Link'}
                      </button>
                      <Link href="/shipper/login" style={{ color: '#6b7280', fontSize: '14px', textDecoration: 'none' }}>
                        <i className="fas fa-arrow-left"></i> Back to Login
                      </Link>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* forgot password end */}
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
                  <p className="mb-3">Nền tảng giao hàng chuyên nghiệp</p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84456789123"><i className="fas fa-phone"></i>+84 456 789 123</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hà Nội, Việt Nam</li>
                    <li><a href="mailto:shipper@example.com"><i className="fas fa-envelope"></i>shipper@example.com</a></li>
                    <li><i className="fas fa-clock"></i>Thứ 2-CN (7:00 - 22:00)</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Shipper Hub</h4>
                  <ul className="footer-list">
                    <li><Link href="/shipper/login">Đăng nhập</Link></li>
                    <li><Link href="/shipper/forgot-password">Quên mật khẩu</Link></li>
                    <li><Link href="/shipper/help">Shipper Support</Link></li>
                    <li><Link href="/shipper/terms">Điều khoản</Link></li>
                  </ul>
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
                  <p className="copyright-text">&copy; Copyright 2026 <a href="/shipper"> Shipper Hub </a> All Rights Reserved.</p>
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

      <a href="#" id="scroll-top"><i className="fas fa-arrow-up"></i></a>
    </>
  );
}