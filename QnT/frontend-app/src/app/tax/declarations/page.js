'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import './styles.css';
import '../registrations/styles.css';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api/v1';

const fmt = (n) => Number(n || 0).toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
const fmtDate = (d) => {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });
};

const STATUS_MAP = {
  SUBMITTED:       { label: 'Chờ duyệt',    cls: 'decl-badge-pending',  icon: 'fa-clock' },
  APPROVED:        { label: 'Đã duyệt',      cls: 'decl-badge-approved', icon: 'fa-check-circle' },
  REJECTED:        { label: 'Từ chối',       cls: 'decl-badge-rejected', icon: 'fa-times-circle' },
  PENDING_PAYMENT: { label: 'Chờ nộp thuế', cls: 'decl-badge-warning',  icon: 'fa-exclamation-circle' },
  PAID:            { label: 'Đã nộp thuế',   cls: 'decl-badge-paid',     icon: 'fa-money-check-alt' },
};

function getCurrentPeriod() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export default function TaxDeclarationsPage() {
  const [token, setToken]           = useState('');
  const [declarations, setDeclarations] = useState([]);
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(false);
  const [toast, setToast]           = useState(null);
  const [total, setTotal]           = useState(0);
  const [autoReviewing, setAutoReviewing] = useState(false);

  // Detail modal
  const [detailModal, setDetailModal] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Review modal (single)
  const [reviewModal, setReviewModal] = useState(null);
  const [reviewNote, setReviewNote]   = useState('');
  const [submitting, setSubmitting]   = useState(false);

  // Payment modal
  const [payModal, setPayModal]       = useState(null);
  const [payForm, setPayForm]         = useState({ amount_paid: '', payment_method: 'BANK_TRANSFER', payment_reference: '' });
  const [paying, setPaying]           = useState(false);

  // Filters
  const [filterStatus, setFilterStatus]   = useState('');
  const [filterPeriod, setFilterPeriod]   = useState('');
  const [filterTaxCode, setFilterTaxCode] = useState('');
  const [page, setPage]                   = useState(1);
  const limit                             = 20;

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) setToken(t);
  }, []);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4500);
  };

  const loadStats = useCallback(async (tkn) => {
    if (!tkn) return;
    try {
      const res = await fetch(`${API}/tax/declarations/stats`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = await res.json();
      if (res.ok) setStats(data.stats);
    } catch {}
  }, []);

  const loadDeclarations = useCallback(async (tkn, params = {}) => {
    if (!tkn) return;
    setLoading(true);
    try {
      const q = new URLSearchParams();
      if (params.status)       q.set('status', params.status);
      if (params.period_month) q.set('period_month', params.period_month);
      if (params.tax_code)     q.set('tax_code', params.tax_code);
      q.set('page', params.page || 1);
      q.set('limit', limit);

      const res = await fetch(`${API}/tax/declarations?${q.toString()}`, {
        headers: { Authorization: `Bearer ${tkn}` }
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.detail || 'Lỗi tải dữ liệu', 'error'); return; }
      setDeclarations(data.declarations || []);
      setTotal(data.total || 0);
      setPage(data.page || 1);
    } catch {
      showToast('Lỗi kết nối server', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (t) {
      setToken(t);
      loadDeclarations(t, {});
      loadStats(t);
    }
  }, [loadDeclarations, loadStats]);

  const handleSearch = () => loadDeclarations(token, {
    status: filterStatus,
    period_month: filterPeriod,
    tax_code: filterTaxCode,
    page: 1
  });

  const handleReset = () => {
    setFilterStatus(''); setFilterPeriod(''); setFilterTaxCode(''); setPage(1);
    loadDeclarations(token, { page: 1 });
    loadStats(token);
  };

  const handlePageChange = (newPage) => {
    const totalPages = Math.ceil(total / limit);
    if (newPage < 1 || newPage > totalPages) return;
    setPage(newPage);
    loadDeclarations(token, {
      status: filterStatus,
      period_month: filterPeriod,
      tax_code: filterTaxCode,
      page: newPage
    });
  };

  // ── Auto review ──────────────────────────────────────────────────────────────
  const handleAutoReview = async () => {
    if (!confirm(`Tự động xét duyệt tất cả tờ khai SUBMITTED${filterPeriod ? ` kỳ ${filterPeriod}` : ''}?\nHệ thống sẽ so sánh với dữ liệu hóa đơn thực tế.`)) return;
    setAutoReviewing(true);
    try {
      const body = filterPeriod ? { period_month: filterPeriod } : {};
      const res = await fetch(`${API}/tax/declarations/auto-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.detail || 'Lỗi tự động duyệt', 'error'); return; }
      showToast(data.message, 'success');
      loadDeclarations(token, { status: filterStatus, period_month: filterPeriod, tax_code: filterTaxCode });
      loadStats(token);
    } catch {
      showToast('Lỗi kết nối server', 'error');
    } finally {
      setAutoReviewing(false);
    }
  };

  // ── Open detail ───────────────────────────────────────────────────────────────
  const openDetail = async (decl) => {
    setDetailModal({ ...decl, payments: [] });
    setDetailLoading(true);
    try {
      const res = await fetch(`${API}/tax/declarations/${decl.declaration_id || decl.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) setDetailModal({ ...data.declaration, payments: data.payments || [] });
    } catch {}
    setDetailLoading(false);
  };

  // ── Single review ─────────────────────────────────────────────────────────────
  const openReview = (decl) => {
    setReviewModal(decl);
    setReviewNote('');
  };

  const handleReview = async () => {
    if (!reviewModal) return;
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/tax/declarations/${reviewModal.declaration_id || reviewModal.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ note: reviewNote })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.detail || 'Lỗi xét duyệt', 'error'); return; }
      showToast(data.message, 'success');
      setReviewModal(null);
      if (detailModal) setDetailModal(null);
      loadDeclarations(token, { status: filterStatus, period_month: filterPeriod, tax_code: filterTaxCode });
      loadStats(token);
    } catch {
      showToast('Lỗi kết nối server', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Record payment ────────────────────────────────────────────────────────────
  const openPayModal = (decl) => {
    setPayModal(decl);
    setPayForm({
      amount_paid: decl.declared_tax_amount || '',
      payment_method: 'BANK_TRANSFER',
      payment_reference: ''
    });
  };

  const handleRecordPayment = async () => {
    if (!payModal) return;
    setPaying(true);
    try {
      const res = await fetch(`${API}/tax/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          seller_tax_code: payModal.seller_tax_code,
          period_month: payModal.period_month,
          amount_paid: parseFloat(payForm.amount_paid),
          payment_method: payForm.payment_method,
          payment_reference: payForm.payment_reference
        })
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.detail || 'Lỗi ghi nhận thanh toán', 'error'); return; }
      showToast(data.message, 'success');
      setPayModal(null);
      if (detailModal) setDetailModal(null);
      loadDeclarations(token, { status: filterStatus, period_month: filterPeriod, tax_code: filterTaxCode });
      loadStats(token);
    } catch {
      showToast('Lỗi kết nối server', 'error');
    } finally {
      setPaying(false);
    }
  };

  const st = (d) => STATUS_MAP[d?.status] || { label: d?.status, cls: 'decl-badge-pending', icon: 'fa-question' };

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
                  <li><a href="/tax/login"><i className="fas fa-sign-in-alt"></i> Đăng nhập cán bộ</a></li>
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
                <Link href="/tax/registrations">Hồ sơ đăng ký</Link>
                <Link href="/tax/declarations" className="active">Khai báo thuế</Link>
                <Link href="/tax/analytics">
                  <i className="fas fa-chart-bar" style={{ marginRight: 5 }}></i>Phân tích dữ liệu
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="tax-main">
        {/* Breadcrumb */}
        <div className="tax-breadcrumb">
          <div className="container">
            <h4 className="tax-breadcrumb-title">Quản lý Khai báo thuế</h4>
            <ul className="tax-breadcrumb-menu">
              <li><Link href="/tax"><i className="fas fa-home"></i> Trang chủ</Link></li>
              <li><Link href="/tax/registrations">Hồ sơ đăng ký</Link></li>
              <li className="active">Khai báo thuế</li>
            </ul>
          </div>
        </div>

        <div className="tax-dashboard-area">
          <div className="container">

            {/* Toast */}
            {toast && (
              <div className={`tax-toast ${toast.type === 'success' ? 'tax-toast-success' : 'tax-toast-error'}`}>
                <i className={`fas ${toast.type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}`}></i>
                <span>{toast.msg}</span>
                <button onClick={() => setToast(null)} className="tax-toast-close">&times;</button>
              </div>
            )}

            {/* Stats */}
            {stats && (
              <div className="tax-stats-grid" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
                {[
                  { label: 'Tổng tờ khai', value: stats.total,     icon: 'fa-file-alt',      cls: 'tax-stat-blue'  },
                  { label: 'Chờ duyệt',    value: stats.submitted,  icon: 'fa-clock',          cls: 'tax-stat-amber' },
                  { label: 'Đã duyệt',     value: stats.approved,   icon: 'fa-check-circle',   cls: 'tax-stat-green' },
                  { label: 'Từ chối',      value: stats.rejected,   icon: 'fa-times-circle',   cls: 'tax-stat-red'   },
                  { label: 'Tổng thuế',    value: fmt(stats.total_tax), icon: 'fa-coins',      cls: 'tax-stat-purple', small: true },
                ].map((c, i) => (
                  <div key={i} className={`tax-stat-card ${c.cls}`}>
                    <div className="tax-stat-info">
                      <span className="tax-stat-label">{c.label}</span>
                      <span className="tax-stat-value" style={c.small ? { fontSize: 16, marginTop: 6 } : {}}>{c.value}</span>
                    </div>
                    <div className="tax-stat-icon"><i className={`fas ${c.icon}`}></i></div>
                  </div>
                ))}
              </div>
            )}

            {/* Filters + Actions */}
            <div className="decl-filter-bar">
              <div className="decl-filters">
                <div>
                  <div className="decl-filter-label">Trạng thái</div>
                  <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="decl-select">
                    <option value="">-- Tất cả --</option>
                    <option value="SUBMITTED">Chờ duyệt</option>
                    <option value="APPROVED">Đã duyệt</option>
                    <option value="REJECTED">Từ chối</option>
                    <option value="PAID">Đã nộp thuế</option>
                  </select>
                </div>
                <div>
                  <div className="decl-filter-label">Kỳ khai báo</div>
                  <input type="month" value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)}
                    max={getCurrentPeriod()} className="decl-input" />
                </div>
                <div>
                  <div className="decl-filter-label">Mã số thuế</div>
                  <input type="text" placeholder="Tìm theo MST..." value={filterTaxCode}
                    onChange={e => setFilterTaxCode(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSearch()}
                    className="decl-input" style={{ width: 200 }} />
                </div>
                <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
                  <button onClick={handleSearch} className="decl-btn decl-btn-primary">
                    <i className="fas fa-search"></i> Lọc
                  </button>
                  <button onClick={handleReset} className="decl-btn decl-btn-outline">
                    <i className="fas fa-redo"></i> Reset
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <button onClick={handleAutoReview} disabled={autoReviewing} className="decl-btn decl-btn-auto">
                  <i className={`fas ${autoReviewing ? 'fa-spinner fa-spin' : 'fa-robot'}`}></i>
                  {autoReviewing ? 'Đang duyệt...' : 'Tự động duyệt'}
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="tax-table-card">
              <div className="tax-table-header">
                <span style={{ fontWeight: 700, fontSize: 14, color: '#333' }}>
                  <i className="fas fa-list-alt" style={{ marginRight: 6, color: '#C41E3A' }}></i>
                  Danh sách tờ khai thuế
                  {total > 0 && <span style={{ fontSize: 12, fontWeight: 400, color: '#999', marginLeft: 8 }}>({total} tờ khai)</span>}
                </span>
                <button onClick={() => { loadDeclarations(token, { status: filterStatus, period_month: filterPeriod, tax_code: filterTaxCode }); loadStats(token); }}
                  className="tax-refresh-btn" title="Làm mới">
                  <i className="fas fa-sync-alt"></i>
                </button>
              </div>

              {loading ? (
                <div className="tax-table-empty">
                  <i className="fas fa-spinner fa-spin tax-spinner"></i>
                  <span>Đang tải dữ liệu...</span>
                </div>
              ) : declarations.length === 0 ? (
                <div className="tax-table-empty">
                  <div className="tax-empty-icon"><i className="fas fa-inbox"></i></div>
                  <span className="tax-empty-title">Không có tờ khai nào</span>
                  <span className="tax-empty-sub">Thử thay đổi bộ lọc hoặc kỳ khai báo</span>
                </div>
              ) : (
                <div className="tax-table-wrap">
                  <table className="tax-table">
                    <thead>
                      <tr>
                        <th>MST / Doanh nghiệp</th>
                        <th>Kỳ khai báo</th>
                        <th>Doanh thu khai báo</th>
                        <th>Thuế phải nộp</th>
                        <th>Trạng thái</th>
                        <th>Ngày nộp</th>
                        <th>Người duyệt</th>
                        <th className="text-center">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {declarations.map(d => {
                        const badge = st(d);
                        return (
                          <tr key={d.declaration_id || d.id}>
                            <td>
                              <div className="tax-biz-name">{d.business_name || '—'}</div>
                              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                                <span className="tax-code-badge">{d.seller_tax_code}</span>
                              </div>
                              {d.phone && <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{d.phone}</div>}
                            </td>
                            <td>
                              <strong style={{ fontSize: 15, color: '#1d4ed8' }}>{d.period_month}</strong>
                            </td>
                            <td style={{ fontWeight: 500 }}>{fmt(d.declared_revenue)}</td>
                            <td style={{ fontWeight: 700, color: '#C41E3A' }}>{fmt(d.declared_tax_amount)}</td>
                            <td>
                              <span className={`decl-status-badge ${badge.cls}`}>
                                <i className={`fas ${badge.icon}`}></i> {badge.label}
                              </span>
                            </td>
                            <td className="tax-date-cell">{fmtDate(d.submitted_at)}</td>
                            <td style={{ fontSize: 12, color: '#888' }}>{d.reviewed_by || '—'}</td>
                            <td className="text-center">
                              <div className="tax-action-group">
                                <button onClick={() => openDetail(d)} className="tax-action-btn tax-action-view" title="Xem chi tiết">
                                  <i className="fas fa-eye"></i>
                                </button>
                                {d.status === 'SUBMITTED' && (
                                  <button onClick={() => openReview(d)} className="tax-action-btn tax-action-approve" title="Xét duyệt">
                                    <i className="fas fa-gavel"></i>
                                  </button>
                                )}
                                {d.status === 'APPROVED' && (
                                  <button onClick={() => openPayModal(d)} className="tax-action-btn tax-action-pay" title="Ghi nhận nộp thuế">
                                    <i className="fas fa-money-bill-wave"></i>
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {!loading && declarations.length > 0 && (
                <div className="tax-table-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <span>Hiển thị {(page - 1) * limit + 1} - {Math.min(page * limit, total)} / {total} tờ khai</span>
                  
                  <div className="tax-pagination" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button 
                      onClick={() => handlePageChange(page - 1)} 
                      disabled={page === 1}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: page === 1 ? '#f3f4f6' : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? '#9ca3af' : '#374151', transition: 'all 0.2s' }}
                    >
                      <i className="fas fa-chevron-left"></i>
                    </button>
                    
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#4b5563' }}>Trang {page} / {Math.max(1, Math.ceil(total / limit))}</span>
                    
                    <button 
                      onClick={() => handlePageChange(page + 1)} 
                      disabled={page >= Math.ceil(total / limit)}
                      style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #e5e7eb', background: page >= Math.ceil(total / limit) ? '#f3f4f6' : '#fff', cursor: page >= Math.ceil(total / limit) ? 'not-allowed' : 'pointer', color: page >= Math.ceil(total / limit) ? '#9ca3af' : '#374151', transition: 'all 0.2s' }}
                    >
                      <i className="fas fa-chevron-right"></i>
                    </button>
                  </div>
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

      {/* ===== DETAIL MODAL ===== */}
      {detailModal && (
        <div className="tax-modal-overlay" onClick={() => setDetailModal(null)}>
          <div className="tax-modal decl-detail-modal" onClick={e => e.stopPropagation()}>
            <div className="tax-modal-header">
              <div className="tax-modal-header-left">
                <div className="tax-modal-icon"><i className="fas fa-file-invoice-dollar"></i></div>
                <div>
                  <h3>Chi tiết tờ khai thuế</h3>
                  <p>Kỳ: {detailModal.period_month} — MST: {detailModal.seller_tax_code}</p>
                </div>
              </div>
              <button onClick={() => setDetailModal(null)} className="tax-modal-close"><i className="fas fa-times"></i></button>
            </div>

            <div className="tax-modal-body">
              {detailLoading ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#999' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
                </div>
              ) : (
                <>
                  {/* Status banner */}
                  <div className={`decl-detail-status ${st(detailModal).cls}`}>
                    <i className={`fas ${st(detailModal).icon}`}></i>
                    <div>
                      <strong>{st(detailModal).label}</strong>
                      {detailModal.note && <span className="decl-note-text">{detailModal.note}</span>}
                    </div>
                  </div>

                  {/* Main info grid */}
                  <div className="tax-detail-grid" style={{ marginBottom: 20 }}>
                    <div className="tax-detail-item">
                      <label><i className="fas fa-building"></i> Doanh nghiệp</label>
                      <span>{detailModal.business_name || '—'}</span>
                    </div>
                    <div className="tax-detail-item">
                      <label><i className="fas fa-barcode"></i> Mã số thuế</label>
                      <span className="mono">{detailModal.seller_tax_code}</span>
                    </div>
                    <div className="tax-detail-item">
                      <label><i className="fas fa-calendar-alt"></i> Kỳ khai báo</label>
                      <span style={{ fontWeight: 700, color: '#1d4ed8', fontSize: 16 }}>{detailModal.period_month}</span>
                    </div>
                    <div className="tax-detail-item">
                      <label><i className="fas fa-clock"></i> Ngày nộp</label>
                      <span>{fmtDate(detailModal.submitted_at)}</span>
                    </div>
                  </div>

                  {/* Revenue comparison */}
                  <div className="decl-compare-grid">
                    <div className="decl-compare-card decl-compare-declared">
                      <div className="decl-compare-title"><i className="fas fa-pen"></i> Khai báo</div>
                      <div className="decl-compare-revenue">{fmt(detailModal.declared_revenue)}</div>
                      <div className="decl-compare-label">Doanh thu</div>
                      <div className="decl-compare-tax">{fmt(detailModal.declared_tax_amount)}</div>
                      <div className="decl-compare-label">Thuế phải nộp</div>
                    </div>
                    <div className="decl-compare-card decl-compare-system">
                      <div className="decl-compare-title"><i className="fas fa-database"></i> Hệ thống</div>
                      <div className="decl-compare-revenue">{fmt(detailModal.system_revenue)}</div>
                      <div className="decl-compare-label">Doanh thu thực tế</div>
                      <div className="decl-compare-tax">{fmt(detailModal.system_tax_amount)}</div>
                      <div className="decl-compare-label">Thuế theo hệ thống</div>
                    </div>
                    <div className="decl-compare-card decl-compare-gap">
                      <div className="decl-compare-title"><i className="fas fa-balance-scale"></i> Chênh lệch</div>
                      <div className="decl-compare-revenue" style={{ color: parseFloat(detailModal.revenue_gap) < -1 ? '#dc2626' : '#059669' }}>
                        {fmt(detailModal.revenue_gap)}
                      </div>
                      <div className="decl-compare-label">Chênh lệch doanh thu</div>
                      <div className="decl-compare-tax" style={{ color: parseFloat(detailModal.tax_gap) < -1 ? '#dc2626' : '#059669' }}>
                        {fmt(detailModal.tax_gap)}
                      </div>
                      <div className="decl-compare-label">Chênh lệch thuế</div>
                    </div>
                  </div>

                  {/* Audit info */}
                  {detailModal.invoice_count !== undefined && (
                    <div className="decl-audit-row">
                      <div className="decl-audit-item">
                        <i className="fas fa-receipt"></i>
                        <div>
                          <div className="decl-audit-val">{detailModal.invoice_count}</div>
                          <div className="decl-audit-label">Hóa đơn trong kỳ</div>
                        </div>
                      </div>
                      {detailModal.declaration_check && (
                        <div className="decl-audit-item">
                          <i className="fas fa-shield-alt"></i>
                          <div>
                            <div className="decl-audit-val" style={{ fontSize: 13 }}>{detailModal.declaration_check}</div>
                            <div className="decl-audit-label">Kết quả kiểm tra</div>
                          </div>
                        </div>
                      )}
                      {detailModal.reviewed_by && (
                        <div className="decl-audit-item">
                          <i className="fas fa-user-check"></i>
                          <div>
                            <div className="decl-audit-val" style={{ fontSize: 13 }}>{detailModal.reviewed_by}</div>
                            <div className="decl-audit-label">Người duyệt</div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payments */}
                  {detailModal.payments && detailModal.payments.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, color: '#333', marginBottom: 10 }}>
                        <i className="fas fa-money-check-alt" style={{ marginRight: 6, color: '#059669' }}></i>
                        Lịch sử nộp thuế
                      </div>
                      {detailModal.payments.map((p, i) => (
                        <div key={i} className="decl-payment-row">
                          <div><i className="fas fa-check-circle" style={{ color: '#059669' }}></i> {fmtDate(p.payment_date)}</div>
                          <div style={{ fontWeight: 700, color: '#059669' }}>{fmt(p.amount_paid)}</div>
                          <div style={{ fontSize: 12, color: '#888' }}>{p.payment_method}</div>
                          {p.payment_reference && <div style={{ fontSize: 12, color: '#aaa' }}>#{p.payment_reference}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Modal actions */}
            {!detailLoading && (
              <div className="tax-modal-actions">
                {detailModal.status === 'SUBMITTED' && (
                  <button onClick={() => { setDetailModal(null); openReview(detailModal); }}
                    className="tax-modal-btn tax-modal-btn-approve">
                    <i className="fas fa-gavel"></i> Xét duyệt
                  </button>
                )}
                {detailModal.status === 'APPROVED' && (
                  <button onClick={() => { setDetailModal(null); openPayModal(detailModal); }}
                    className="tax-modal-btn" style={{ background: '#059669', color: '#fff' }}>
                    <i className="fas fa-money-bill-wave"></i> Ghi nhận nộp thuế
                  </button>
                )}
                <button onClick={() => setDetailModal(null)} className="tax-modal-btn tax-modal-btn-cancel">
                  Đóng
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== REVIEW MODAL ===== */}
      {reviewModal && (
        <div className="tax-modal-overlay" style={{ zIndex: 60 }} onClick={() => setReviewModal(null)}>
          <div className="tax-modal tax-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="tax-modal-header">
              <div className="tax-modal-header-left">
                <div className="tax-modal-icon"><i className="fas fa-gavel"></i></div>
                <div>
                  <h3>Xét duyệt tờ khai thuế</h3>
                  <p>MST {reviewModal.seller_tax_code} — Kỳ {reviewModal.period_month}</p>
                </div>
              </div>
              <button onClick={() => setReviewModal(null)} className="tax-modal-close"><i className="fas fa-times"></i></button>
            </div>
            <div className="tax-modal-body">
              <div className="decl-review-info">
                <i className="fas fa-info-circle"></i>
                <span>Hệ thống sẽ tự động so sánh dữ liệu khai báo với hóa đơn thực tế để quyết định duyệt hoặc từ chối.</span>
              </div>
              <div className="decl-filter-label" style={{ marginBottom: 6, marginTop: 14 }}>Ghi chú (tùy chọn)</div>
              <textarea
                className="tax-form-control tax-textarea"
                placeholder="Nhập ghi chú của cán bộ thuế (không bắt buộc)..."
                value={reviewNote}
                onChange={e => setReviewNote(e.target.value)}
                rows={3}
              />
            </div>
            <div className="tax-modal-actions">
              <button onClick={() => setReviewModal(null)} className="tax-modal-btn tax-modal-btn-cancel">Hủy</button>
              <button onClick={handleReview} disabled={submitting} className="tax-modal-btn tax-modal-btn-approve">
                <i className={`fas ${submitting ? 'fa-spinner fa-spin' : 'fa-check-circle'}`}></i>
                {submitting ? 'Đang xử lý...' : 'Xác nhận xét duyệt'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PAYMENT MODAL ===== */}
      {payModal && (
        <div className="tax-modal-overlay" style={{ zIndex: 60 }} onClick={() => setPayModal(null)}>
          <div className="tax-modal tax-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="tax-modal-header" style={{ background: 'linear-gradient(135deg,#065f46,#059669)' }}>
              <div className="tax-modal-header-left">
                <div className="tax-modal-icon"><i className="fas fa-money-bill-wave"></i></div>
                <div>
                  <h3>Ghi nhận nộp thuế</h3>
                  <p>MST {payModal.seller_tax_code} — Kỳ {payModal.period_month}</p>
                </div>
              </div>
              <button onClick={() => setPayModal(null)} className="tax-modal-close"><i className="fas fa-times"></i></button>
            </div>
            <div className="tax-modal-body">
              <div style={{ marginBottom: 14 }}>
                <div className="decl-filter-label">Số tiền nộp thuế (VNĐ) <span style={{ color: '#dc2626' }}>*</span></div>
                <input type="number" min="0" step="1000"
                  value={payForm.amount_paid}
                  onChange={e => setPayForm(f => ({ ...f, amount_paid: e.target.value }))}
                  className="tax-form-control"
                  placeholder="Nhập số tiền..."
                  style={{ width: '100%', marginTop: 6 }}
                />
                <div style={{ fontSize: 12, color: '#059669', marginTop: 4 }}>
                  Thuế khai báo: {fmt(payModal.declared_tax_amount)}
                </div>
              </div>
              <div style={{ marginBottom: 14 }}>
                <div className="decl-filter-label">Phương thức thanh toán</div>
                <select value={payForm.payment_method}
                  onChange={e => setPayForm(f => ({ ...f, payment_method: e.target.value }))}
                  className="tax-form-control" style={{ width: '100%', marginTop: 6 }}>
                  <option value="BANK_TRANSFER">Chuyển khoản ngân hàng</option>
                  <option value="CASH">Tiền mặt</option>
                  <option value="ONLINE">Thanh toán trực tuyến</option>
                </select>
              </div>
              <div>
                <div className="decl-filter-label">Mã tham chiếu</div>
                <input type="text"
                  value={payForm.payment_reference}
                  onChange={e => setPayForm(f => ({ ...f, payment_reference: e.target.value }))}
                  className="tax-form-control"
                  placeholder="Mã giao dịch / số hóa đơn..."
                  style={{ width: '100%', marginTop: 6 }}
                />
              </div>
            </div>
            <div className="tax-modal-actions">
              <button onClick={() => setPayModal(null)} className="tax-modal-btn tax-modal-btn-cancel">Hủy</button>
              <button onClick={handleRecordPayment} disabled={paying || !payForm.amount_paid}
                className="tax-modal-btn"
                style={{ background: '#059669', color: '#fff', opacity: (!payForm.amount_paid || paying) ? 0.6 : 1 }}>
                <i className={`fas ${paying ? 'fa-spinner fa-spin' : 'fa-check-circle'}`}></i>
                {paying ? 'Đang ghi nhận...' : 'Xác nhận nộp thuế'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
