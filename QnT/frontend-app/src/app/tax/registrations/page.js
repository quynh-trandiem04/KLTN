'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';
import '../login/styles.css';
import './styles.css';

export default function TaxRegistrationsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('PENDING');
  const [actionLoading, setActionLoading] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [message, setMessage] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, total: 0 });

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (!token || !stored) {
      router.push('/tax/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  const fetchApplications = useCallback(async () => {
    setLoading(true);
    try {
      const params = statusFilter ? { status: statusFilter } : {};
      const response = await axios.get('/v1/tax/registrations', {
        headers: { Authorization: getAuthHeader() },
        params
      });
      setApplications(response.data.applications);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  const fetchStats = useCallback(async () => {
    try {
      const response = await axios.get('/v1/tax/registrations', {
        headers: { Authorization: getAuthHeader() }
      });
      const all = response.data.applications;
      setStats({
        total: all.length,
        pending: all.filter(a => a.status === 'PENDING').length,
        approved: all.filter(a => a.status === 'APPROVED').length,
        rejected: all.filter(a => a.status === 'REJECTED').length,
      });
    } catch (err) { /* ignore */ }
  }, []);

  useEffect(() => {
    if (user) {
      fetchApplications();
      fetchStats();
    }
  }, [user, fetchApplications, fetchStats]);

  const handleApprove = async (id) => {
    if (!confirm('Xác nhận duyệt hồ sơ đăng ký MST này?\nDoanh nghiệp sẽ được thêm vào sổ đăng ký thuế.')) return;
    setActionLoading(id);
    try {
      const response = await axios.post(`/v1/tax/registrations/approve/${id}`, {}, {
        headers: { Authorization: getAuthHeader() }
      });
      setMessage({ type: 'success', text: response.data.message });
      setDetailModal(null);
      fetchApplications();
      fetchStats();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Lỗi khi duyệt' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason || rejectReason.trim().length < 5) {
      setMessage({ type: 'error', text: 'Lý do từ chối phải có ít nhất 5 ký tự' });
      return;
    }
    setActionLoading(rejectModal);
    try {
      const response = await axios.post(`/v1/tax/registrations/reject/${rejectModal}`, {
        reason: rejectReason
      }, {
        headers: { Authorization: getAuthHeader() }
      });
      setMessage({ type: 'success', text: response.data.message });
      setRejectModal(null);
      setRejectReason('');
      setDetailModal(null);
      fetchApplications();
      fetchStats();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Lỗi khi từ chối' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    router.push('/tax/login');
  };

  const businessTypeLabels = {
    COMPANY: 'Công ty TNHH', JSC: 'Công ty Cổ phần', SOLE_PROP: 'DN Tư nhân',
    PARTNERSHIP: 'Công ty Hợp danh', BRANCH: 'Chi nhánh', REPRESENTATIVE: 'VP Đại diện'
  };

  const statusConfig = {
    PENDING: { label: 'Chờ duyệt', cls: 'tax-badge-pending', icon: 'fa-clock' },
    APPROVED: { label: 'Đã duyệt', cls: 'tax-badge-approved', icon: 'fa-check-circle' },
    REJECTED: { label: 'Từ chối', cls: 'tax-badge-rejected', icon: 'fa-times-circle' }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  useEffect(() => {
    if (message) {
      const t = setTimeout(() => setMessage(null), 5000);
      return () => clearTimeout(t);
    }
  }, [message]);

  return (
    <>
      {/* ===== HEADER (same as login) ===== */}
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
                  {user && (
                    <li><span><i className="fas fa-user-shield"></i> {user.full_name || user.email}</span></li>
                  )}
                  <li>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
                      <i className="fas fa-sign-out-alt"></i> Đăng xuất
                    </a>
                  </li>
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
                <Link href="/tax/audit">Tra cứu</Link>
                <Link href="/tax/registrations" className="active">Hồ sơ đăng ký</Link>
                <Link href="/tax/declarations">Khai báo thuế</Link>
                <Link href="/tax/analytics">
                  <i className="fas fa-chart-bar" style={{ marginRight: 5 }}></i>Phân tích dữ liệu
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* ===== BREADCRUMB ===== */}
      <main className="tax-main">
        <div className="tax-breadcrumb">
          <div className="container">
            <h4 className="tax-breadcrumb-title">Quản lý hồ sơ đăng ký MST</h4>
            <ul className="tax-breadcrumb-menu">
              <li><Link href="/tax"><i className="fas fa-home"></i> Trang chủ</Link></li>
              <li className="active">Hồ sơ đăng ký</li>
            </ul>
          </div>
        </div>

        {/* ===== DASHBOARD CONTENT ===== */}
        <div className="tax-dashboard-area">
          <div className="container">


            {/* Stats Cards */}
            <div className="tax-stats-grid">
              {[
                { label: 'Tổng hồ sơ', value: stats.total, icon: 'fa-folder-open', cls: 'tax-stat-blue' },
                { label: 'Chờ duyệt', value: stats.pending, icon: 'fa-clock', cls: 'tax-stat-amber' },
                { label: 'Đã duyệt', value: stats.approved, icon: 'fa-check-circle', cls: 'tax-stat-green' },
                { label: 'Từ chối', value: stats.rejected, icon: 'fa-times-circle', cls: 'tax-stat-red' },
              ].map((s, i) => (
                <div key={i} className={`tax-stat-card ${s.cls}`}>
                  <div className="tax-stat-info">
                    <span className="tax-stat-label">{s.label}</span>
                    <span className="tax-stat-value">{s.value}</span>
                  </div>
                  <div className="tax-stat-icon">
                    <i className={`fas ${s.icon}`}></i>
                  </div>
                </div>
              ))}
            </div>

            {/* Message toast */}
            {message && (
              <div className={`tax-toast ${message.type === 'success' ? 'tax-toast-success' : 'tax-toast-error'}`}>
                <i className={`fas ${message.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                <span>{message.text}</span>
                <button onClick={() => setMessage(null)} className="tax-toast-close">&times;</button>
              </div>
            )}

            {/* Table card */}
            <div className="tax-table-card">
              {/* Filter tabs */}
              <div className="tax-table-header">
                <div className="tax-filter-tabs">
                  {[
                    { key: 'PENDING', label: 'Chờ duyệt', count: stats.pending },
                    { key: 'APPROVED', label: 'Đã duyệt', count: stats.approved },
                    { key: 'REJECTED', label: 'Từ chối', count: stats.rejected },
                    { key: '', label: 'Tất cả', count: stats.total },
                  ].map(f => (
                    <button
                      key={f.key}
                      onClick={() => setStatusFilter(f.key)}
                      className={`tax-filter-tab ${statusFilter === f.key ? 'active' : ''}`}
                    >
                      {f.label} <span className="tax-filter-count">({f.count})</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => { fetchApplications(); fetchStats(); }} className="tax-refresh-btn" title="Làm mới">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>

              {/* Table content */}
              {loading ? (
                <div className="tax-table-empty">
                  <i className="fas fa-spinner fa-spin tax-spinner"></i>
                  <span>Đang tải dữ liệu...</span>
                </div>
              ) : applications.length === 0 ? (
                <div className="tax-table-empty">
                  <div className="tax-empty-icon"><i className="fas fa-inbox"></i></div>
                  <span className="tax-empty-title">Không có hồ sơ nào</span>
                  <span className="tax-empty-sub">Hiện chưa có hồ sơ ở trạng thái này</span>
                </div>
              ) : (
                <div className="tax-table-wrap">
                  <table className="tax-table">
                    <thead>
                      <tr>
                        <th>Mã số thuế</th>
                        <th>Doanh nghiệp</th>
                        <th>Người đại diện</th>
                        <th>Loại hình</th>
                        <th>Trạng thái</th>
                        <th>Ngày nộp</th>
                        <th className="text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {applications.map(app => (
                        <tr key={app.id}>
                          <td>
                            <span className="tax-code-badge">{app.tax_code}</span>
                          </td>
                          <td>
                            <div className="tax-biz-name">{app.business_name}</div>
                            {app.business_name_en && (
                              <div className="tax-biz-name-en">{app.business_name_en}</div>
                            )}
                          </td>
                          <td>{app.legal_representative}</td>
                          <td>
                            <span className="tax-type-badge">
                              {businessTypeLabels[app.business_type] || app.business_type}
                            </span>
                          </td>
                          <td>
                            <span className={`tax-status-badge ${statusConfig[app.status]?.cls}`}>
                              <i className={`fas ${statusConfig[app.status]?.icon}`}></i>
                              {statusConfig[app.status]?.label || app.status}
                            </span>
                          </td>
                          <td className="tax-date-cell">{formatDate(app.submitted_at)}</td>
                          <td className="text-center">
                            <div className="tax-action-group">
                              <button onClick={() => setDetailModal(app)} className="tax-action-btn tax-action-view" title="Xem chi tiết">
                                <i className="fas fa-eye"></i>
                              </button>
                              {app.status === 'PENDING' && (
                                <>
                                  <button
                                    onClick={() => handleApprove(app.id)}
                                    disabled={actionLoading === app.id}
                                    className="tax-action-btn tax-action-approve"
                                    title="Duyệt"
                                  >
                                    <i className={`fas ${actionLoading === app.id ? 'fa-spinner fa-spin' : 'fa-check'}`}></i>
                                  </button>
                                  <button
                                    onClick={() => { setRejectModal(app.id); setRejectReason(''); }}
                                    className="tax-action-btn tax-action-reject"
                                    title="Từ chối"
                                  >
                                    <i className="fas fa-times"></i>
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Table footer */}
              {!loading && applications.length > 0 && (
                <div className="tax-table-footer">
                  <span>Hiển thị {applications.length} hồ sơ</span>
                  <span>Cập nhật lúc {new Date().toLocaleTimeString('vi-VN')}</span>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

      {/* ===== FOOTER (same as login) ===== */}
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

      {/* ====== Detail Modal ====== */}
      {detailModal && (
        <div className="tax-modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="tax-modal" onClick={e => e.stopPropagation()}>
            <div className="tax-modal-header">
              <div className="tax-modal-header-left">
                <div className="tax-modal-icon"><i className="fas fa-building"></i></div>
                <div>
                  <h3>Chi tiết hồ sơ #{detailModal.id}</h3>
                  <p>MST: {detailModal.tax_code}</p>
                </div>
              </div>
              <button onClick={() => setDetailModal(null)} className="tax-modal-close"><i className="fas fa-times"></i></button>
            </div>

            <div className="tax-modal-body">
              <div className={`tax-modal-status ${statusConfig[detailModal.status]?.cls}`}>
                <i className={`fas ${statusConfig[detailModal.status]?.icon}`}></i>
                <div>
                  <strong>{statusConfig[detailModal.status]?.label}</strong>
                  {detailModal.reject_reason && <span className="tax-reject-reason">Lý do: {detailModal.reject_reason}</span>}
                </div>
              </div>

              <div className="tax-detail-grid">
                <div className="tax-detail-item full">
                  <label><i className="fas fa-building"></i> Tên doanh nghiệp</label>
                  <span>{detailModal.business_name}</span>
                </div>
                {detailModal.business_name_en && (
                  <div className="tax-detail-item full">
                    <label><i className="fas fa-globe"></i> Tên tiếng Anh</label>
                    <span>{detailModal.business_name_en}</span>
                  </div>
                )}
                <div className="tax-detail-item">
                  <label><i className="fas fa-barcode"></i> Mã số thuế</label>
                  <span className="mono">{detailModal.tax_code}</span>
                </div>
                <div className="tax-detail-item">
                  <label><i className="fas fa-briefcase"></i> Loại hình</label>
                  <span>{businessTypeLabels[detailModal.business_type] || detailModal.business_type}</span>
                </div>
                <div className="tax-detail-item full">
                  <label><i className="fas fa-map-marker-alt"></i> Địa chỉ</label>
                  <span>{detailModal.business_address}</span>
                </div>
                <div className="tax-detail-item">
                  <label><i className="fas fa-user-tie"></i> Người đại diện</label>
                  <span>{detailModal.legal_representative}</span>
                </div>
                <div className="tax-detail-item">
                  <label><i className="fas fa-id-card"></i> Số ĐKKD</label>
                  <span>{detailModal.business_registration_number || '—'}</span>
                </div>
                <div className="tax-detail-item">
                  <label><i className="fas fa-calendar-alt"></i> Ngày cấp GP</label>
                  <span>{detailModal.license_issue_date ? new Date(detailModal.license_issue_date).toLocaleDateString('vi-VN') : '—'}</span>
                </div>
                <div className="tax-detail-item">
                  <label><i className="fas fa-university"></i> Cơ quan cấp</label>
                  <span>{detailModal.licensing_authority || '—'}</span>
                </div>
                <div className="tax-detail-item">
                  <label><i className="fas fa-phone"></i> Điện thoại</label>
                  <span>{detailModal.phone || '—'}</span>
                </div>
                <div className="tax-detail-item">
                  <label><i className="fas fa-envelope"></i> Email</label>
                  <span>{detailModal.email || '—'}</span>
                </div>
                {detailModal.business_license_file && (
                  <div className="tax-detail-item full">
                    <label><i className="fas fa-file-pdf"></i> Giấy phép kinh doanh</label>
                    <a
                      href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}${detailModal.business_license_file}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="tax-file-link"
                    >
                      <i className="fas fa-download"></i> Xem / Tải file
                    </a>
                  </div>
                )}
                <div className="tax-detail-item">
                  <label><i className="fas fa-calendar"></i> Ngày nộp</label>
                  <span>{formatDate(detailModal.submitted_at)}</span>
                </div>
                {detailModal.reviewed_at && (
                  <div className="tax-detail-item">
                    <label><i className="fas fa-calendar-check"></i> Ngày duyệt</label>
                    <span>{formatDate(detailModal.reviewed_at)}</span>
                  </div>
                )}
                {detailModal.reviewed_by && (
                  <div className="tax-detail-item">
                    <label><i className="fas fa-user-check"></i> Duyệt bởi</label>
                    <span>{detailModal.reviewed_by}</span>
                  </div>
                )}
              </div>
            </div>

            {detailModal.status === 'PENDING' && (
              <div className="tax-modal-actions">
                <button
                  onClick={() => handleApprove(detailModal.id)}
                  disabled={actionLoading === detailModal.id}
                  className="tax-modal-btn tax-modal-btn-approve"
                >
                  <i className={`fas ${actionLoading === detailModal.id ? 'fa-spinner fa-spin' : 'fa-check-circle'}`}></i>
                  Duyệt hồ sơ
                </button>
                <button
                  onClick={() => { setRejectModal(detailModal.id); setRejectReason(''); }}
                  className="tax-modal-btn tax-modal-btn-reject"
                >
                  <i className="fas fa-times-circle"></i>
                  Từ chối
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ====== Reject Modal ====== */}
      {rejectModal && (
        <div className="tax-modal-overlay" style={{ zIndex: 60 }} onClick={() => { setRejectModal(null); setRejectReason(''); }}>
          <div className="tax-modal tax-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="tax-modal-header tax-modal-header-red">
              <div className="tax-modal-header-left">
                <div className="tax-modal-icon-red"><i className="fas fa-ban"></i></div>
                <div>
                  <h3>Từ chối hồ sơ</h3>
                  <p>Nhập lý do để từ chối hồ sơ đăng ký MST</p>
                </div>
              </div>
            </div>
            <div className="tax-modal-body">
              <textarea
                className="tax-form-control tax-textarea"
                placeholder="Nhập lý do từ chối (ít nhất 5 ký tự)..."
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                autoFocus
              />
            </div>
            <div className="tax-modal-actions">
              <button
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                className="tax-modal-btn tax-modal-btn-cancel"
              >
                Hủy
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectModal || rejectReason.trim().length < 5}
                className="tax-modal-btn tax-modal-btn-reject-confirm"
              >
                {actionLoading === rejectModal ? (
                  <><i className="fas fa-spinner fa-spin"></i> Đang xử lý...</>
                ) : (
                  'Xác nhận từ chối'
                )}
              </button>
            </div>
          </div>
        </div>
      )}




    </>
  );
}
