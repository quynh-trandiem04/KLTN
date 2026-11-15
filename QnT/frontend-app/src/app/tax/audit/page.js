'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import './styles.css';

export default function TaxAuditPage() {
  const [taxCode, setTaxCode] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState(null);
  const router = useRouter();
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
    router.push('/tax');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setResults(null);

    if (!taxCode.trim() && !businessName.trim()) {
      setError('Vui lòng nhập ít nhất một thông tin để tra cứu.');
      return;
    }

    setLoading(true);
    try {
      const params = {};
      if (taxCode.trim()) params.tax_code = taxCode.trim();
      if (businessName.trim()) params.business_name = businessName.trim();

      const response = await axios.get('/v1/tax/lookup', { params });
      setResults(response.data);
    } catch (err) {
      setError(err.response?.data?.detail || 'Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const statusConfig = {
    PENDING: { label: 'Đang chờ duyệt', cls: 'audit-status-pending', icon: 'fa-clock', desc: 'Hồ sơ đang được xem xét bởi cơ quan thuế' },
    APPROVED: { label: 'Đã duyệt', cls: 'audit-status-approved', icon: 'fa-check-circle', desc: 'Hồ sơ đã được duyệt và MST đã được cấp' },
    REJECTED: { label: 'Bị từ chối', cls: 'audit-status-rejected', icon: 'fa-times-circle', desc: 'Hồ sơ không đạt yêu cầu' }
  };

  const businessTypeLabels = {
    COMPANY: 'Công ty TNHH', JSC: 'Công ty Cổ phần', SOLE_PROP: 'DN Tư nhân',
    PARTNERSHIP: 'Công ty Hợp danh', BRANCH: 'Chi nhánh', REPRESENTATIVE: 'VP Đại diện'
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <>
      {/* ===== HEADER ===== */}
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
              <div className="tax-header-top-right">
                <ul className="tax-header-top-list">
                  {user ? (
                    <>
                      <li><span><i className="fas fa-user-shield"></i> {user.full_name || user.email}</span></li>
                      <li><a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}><i className="fas fa-sign-out-alt"></i> Đăng xuất</a></li>
                    </>
                  ) : (
                    <li><a href="/tax/login"><i className="fas fa-sign-in-alt"></i> Đăng nhập cán bộ</a></li>
                  )}
                </ul>
              </div>
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
                <Link href="/tax/audit" className="active">Tra cứu</Link>
                {!user && <Link href="/tax/register">Đăng ký MST</Link>}
                {user && <Link href="/tax/registrations">Hồ sơ đăng ký</Link>}
                {user && <Link href="/tax/declarations">Khai báo thuế</Link>}
                {user && (
                  <Link href="/tax/analytics">
                    <i className="fas fa-chart-bar" style={{ marginRight: 5 }}></i>Phân tích dữ liệu
                  </Link>
                )}
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* ===== MAIN ===== */}
      <main className="tax-main">
        <div className="tax-breadcrumb">
          <div className="container">
            <h4 className="tax-breadcrumb-title">Tra cứu tình trạng hồ sơ đăng ký MST</h4>
            <ul className="tax-breadcrumb-menu">
              <li><Link href="/tax"><i className="fas fa-home"></i> Trang chủ</Link></li>
              <li className="active">Tra cứu</li>
            </ul>
          </div>
        </div>

        <div className="tax-register-area">
          <div className="container">
            <div className="tax-register-wrapper">

              {/* Info box */}
              <div className="tax-flow-info">
                <h4><i className="fas fa-info-circle"></i> Hướng dẫn tra cứu</h4>
                <p className="audit-guide-text">
                  Nhập <strong>Mã số thuế</strong> hoặc <strong>Tên doanh nghiệp</strong> để tra cứu tình trạng hồ sơ đăng ký mã số thuế. 
                  Kết quả sẽ hiển thị trạng thái xét duyệt và các thông tin liên quan.
                </p>
              </div>

              {/* Error */}
              {error && (
                <div className="tax-error-alert">
                  <i className="fas fa-exclamation-circle"></i>
                  {error}
                </div>
              )}

              {/* Search form */}
              <div className="tax-register-form">
                <div className="tax-register-header">
                  <div className="tax-login-icon">
                    <i className="fas fa-search"></i>
                  </div>
                  <h3>Tra cứu hồ sơ đăng ký MST</h3>
                  <p>Nhập thông tin để kiểm tra tình trạng xét duyệt hồ sơ</p>
                </div>

                <form onSubmit={handleSubmit}>
                  <div className="tax-form-group">
                    <label><i className="fas fa-barcode"></i> Mã số thuế</label>
                    <input
                      type="text"
                      className="tax-form-control"
                      placeholder="VD: 0309532909"
                      value={taxCode}
                      onChange={(e) => setTaxCode(e.target.value)}
                    />
                  </div>

                  <div className="audit-divider">
                    <span>hoặc</span>
                  </div>

                  <div className="tax-form-group">
                    <label><i className="fas fa-building"></i> Tên doanh nghiệp</label>
                    <input
                      type="text"
                      className="tax-form-control"
                      placeholder="VD: Công ty TNHH ABC"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                    />
                  </div>

                  <button type="submit" className="tax-btn-submit" disabled={loading}>
                    <i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-search'}`}></i>
                    {loading ? 'Đang tra cứu...' : 'Tra cứu'}
                  </button>
                </form>
              </div>

              {/* Results */}
              {results && (
                <div className="audit-results">
                  <div className="audit-results-header">
                    <i className="fas fa-clipboard-list"></i>
                    <span>Kết quả tra cứu ({results.total} hồ sơ)</span>
                  </div>

                  {results.total === 0 ? (
                    <div className="audit-no-result">
                      <div className="audit-no-result-icon"><i className="fas fa-search"></i></div>
                      <strong>Không tìm thấy kết quả</strong>
                      <p>Không có hồ sơ đăng ký nào khớp với thông tin tra cứu. Vui lòng kiểm tra lại hoặc <Link href="/tax/register">đăng ký mã số thuế mới</Link>.</p>
                    </div>
                  ) : (
                    <div className="audit-cards">
                      {results.applications.map(app => {
                        const cfg = statusConfig[app.status] || statusConfig.PENDING;
                        return (
                          <div key={app.id} className="audit-card">
                            {/* Status banner */}
                            <div className={`audit-card-status ${cfg.cls}`}>
                              <div className="audit-card-status-left">
                                <i className={`fas ${cfg.icon}`}></i>
                                <div>
                                  <strong>{cfg.label}</strong>
                                  <span>{cfg.desc}</span>
                                </div>
                              </div>
                              <span className="audit-card-id">#{app.id}</span>
                            </div>

                            {/* Card body */}
                            <div className="audit-card-body">
                              <div className="audit-card-grid">
                                <div className="audit-card-field">
                                  <label><i className="fas fa-barcode"></i> Mã số thuế</label>
                                  <span className="mono">{app.tax_code}</span>
                                </div>
                                <div className="audit-card-field">
                                  <label><i className="fas fa-briefcase"></i> Loại hình</label>
                                  <span>{businessTypeLabels[app.business_type] || app.business_type}</span>
                                </div>
                                <div className="audit-card-field full">
                                  <label><i className="fas fa-building"></i> Tên doanh nghiệp</label>
                                  <span>{app.business_name}</span>
                                </div>
                                {app.business_name_en && (
                                  <div className="audit-card-field full">
                                    <label><i className="fas fa-globe"></i> Tên tiếng Anh</label>
                                    <span>{app.business_name_en}</span>
                                  </div>
                                )}
                                <div className="audit-card-field full">
                                  <label><i className="fas fa-map-marker-alt"></i> Địa chỉ</label>
                                  <span>{app.business_address}</span>
                                </div>
                                <div className="audit-card-field">
                                  <label><i className="fas fa-user-tie"></i> Người đại diện</label>
                                  <span>{app.legal_representative}</span>
                                </div>
                                <div className="audit-card-field">
                                  <label><i className="fas fa-calendar"></i> Ngày nộp</label>
                                  <span>{formatDate(app.submitted_at)}</span>
                                </div>
                                {app.reviewed_at && (
                                  <div className="audit-card-field">
                                    <label><i className="fas fa-calendar-check"></i> Ngày xử lý</label>
                                    <span>{formatDate(app.reviewed_at)}</span>
                                  </div>
                                )}
                                {app.reject_reason && (
                                  <div className="audit-card-field full">
                                    <label><i className="fas fa-comment-alt"></i> Lý do từ chối</label>
                                    <span className="audit-reject-text">{app.reject_reason}</span>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>
        </div>
      </main>

      {/* ===== FOOTER ===== */}
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
