'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import './styles.css';

export default function TaxLoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (token && stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    setUser(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await axios.post('/v1/auth/tax/login', {
        email: formData.email,
        password: formData.password
      });

      localStorage.setItem('token', response.data.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      localStorage.setItem('userType', 'tax_org');

      router.push('/tax/registrations');

    } catch (err) {
      setError(err.response?.data?.detail || 'Đăng nhập thất bại. Vui lòng kiểm tra thông tin đăng nhập.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <header className="tax-header">
        <div className="tax-header-top">
          <div className="container">
            <div className="tax-header-top-wrapper">
              <div className="tax-header-top-left">
                <ul className="tax-header-top-list">
                  <li><a href="mailto:tax@gov.vn"><i className="fas fa-envelope"></i> tax@gov.vn</a></li>
                  <li><a href="tel:19006543"><i className="fas fa-headset"></i> 1900 6543</a></li>
                </ul>
              </div>
              {user ? (
                <div className="tax-header-top-right">
                  <ul className="tax-header-top-list">
                    <li><span><i className="fas fa-user-shield"></i> {user.full_name || user.email}</span></li>
                    <li><a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}><i className="fas fa-sign-out-alt"></i> Đăng xuất</a></li>
                  </ul>
                </div>
              ) : (
                <div className="tax-header-top-right">
                  <ul className="tax-header-top-list">
                    <li><a href="/tax/login"><i className="fas fa-sign-in-alt"></i> Đăng nhập cán bộ</a></li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="tax-navbar">
          <div className="container">
            <div className="tax-navbar-inner">
              <Link href="/tax" className="tax-navbar-brand">
                <div className="tax-logo-group">
                  <i className="fas fa-landmark tax-logo-icon"></i>
                  <div>
                    <span className="tax-logo-title">TỔNG CỤC THUẾ</span>
                    <span className="tax-logo-sub">Hệ thống xác minh MST</span>
                  </div>
                </div>
              </Link>
              <nav className="tax-nav-links">
                <Link href="/tax">Trang chủ</Link>
                <Link href="/tax/audit">Tra cứu</Link>
                {!user && <Link href="/tax/register">Đăng ký MST</Link>}
                {user && <Link href="/tax/registrations">Hồ sơ đăng ký</Link>}
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="tax-main">
        <div className="tax-breadcrumb">
          <div className="container">
            <h4 className="tax-breadcrumb-title">Đăng nhập Cơ quan Thuế</h4>
            <ul className="tax-breadcrumb-menu">
              <li><Link href="/tax"><i className="fas fa-home"></i> Trang chủ</Link></li>
              <li className="active">Đăng nhập</li>
            </ul>
          </div>
        </div>

        <div className="tax-login-area">
          <div className="container">
            <div className="tax-login-wrapper">
              <div className="tax-login-form">
                <div className="tax-login-header">
                  <div className="tax-login-icon">
                    <i className="fas fa-landmark"></i>
                  </div>
                  <h3>Cổng đăng nhập</h3>
                  <p>Hệ thống xác minh mã số thuế doanh nghiệp</p>
                </div>

                {error && (
                  <div className="tax-error-alert">
                    <i className="fas fa-exclamation-circle"></i>
                    {error}
                  </div>
                )}

                <form onSubmit={handleSubmit}>
                  <div className="tax-form-group">
                    <label><i className="fas fa-envelope"></i> Email đăng nhập</label>
                    <input
                      type="email"
                      className="tax-form-control"
                      placeholder="Nhập email cơ quan thuế"
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      required
                    />
                  </div>
                  <div className="tax-form-group">
                    <label><i className="fas fa-lock"></i> Mật khẩu</label>
                    <input
                      type="password"
                      className="tax-form-control"
                      placeholder="Nhập mật khẩu"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      required
                    />
                  </div>
                  <div className="tax-form-options">
                    <div className="tax-form-check">
                      <input
                        type="checkbox"
                        id="remember"
                        checked={remember}
                        onChange={(e) => setRemember(e.target.checked)}
                      />
                      <label htmlFor="remember">Ghi nhớ phiên đăng nhập</label>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="tax-btn-submit"
                    disabled={loading}
                  >
                    <i className="fas fa-sign-in-alt"></i>
                    {loading ? 'Đang xác thực...' : 'Đăng nhập'}
                  </button>
                </form>

                <div className="tax-login-footer">
                  <div className="tax-login-info">
                    <i className="fas fa-info-circle"></i>
                    <p>Tài khoản được cấp bởi Quản trị viên hệ thống. Liên hệ Admin nếu chưa có tài khoản.</p>
                  </div>
  
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="tax-footer">
        <div className="container">
          <div className="tax-footer-inner">
            <div className="tax-footer-left">
              <p>&copy; 2026 Tổng cục Thuế - Hệ thống xác minh mã số thuế</p>
            </div>
            <div className="tax-footer-right">
              <p>Hỗ trợ: <a href="tel:19006543">1900 6543</a> | <a href="mailto:tax@gov.vn">tax@gov.vn</a></p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
