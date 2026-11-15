'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';

const STATUS_CONFIG = {
  PENDING:      { text: 'Chờ duyệt',   cls: 'admin-badge-pending', icon: 'la-clock' },
  APPROVED:     { text: 'Đã duyệt',    cls: 'admin-badge-success', icon: 'la-check-double' },
  REJECTED:     { text: 'Từ chối',      cls: 'admin-badge-danger',  icon: 'la-ban' },
};

const FILTERS = [
  { key: '',             label: 'Tất cả' },
  { key: 'PENDING',      label: 'Chờ duyệt' },
  { key: 'APPROVED',     label: 'Đã duyệt' },
  { key: 'REJECTED',     label: 'Từ chối' },
];

export default function SellerApplicationsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const highlightSellerId = searchParams.get('highlight');
  
  const [apps, setApps] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });

  // Handle auto-open detail modal from highlight parameter
  useEffect(() => {
    if (highlightSellerId && apps.length > 0) {
      const targetApp = apps.find(a => a.id == highlightSellerId);
      if (targetApp) {
        setDetailModal(targetApp);
        // Clean URL parameter
        router.replace('/admin/seller-applications');
      }
    }
  }, [highlightSellerId, apps, router]);

  const fetchApps = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await axios.get('/v1/admin/seller-applications', {
        headers: { Authorization: getAuthHeader() }, params
      });
      setApps(res.data.applications);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const handleGlobalSearch = (e) => setSearchInput(e.detail);
    if (typeof window !== 'undefined') window.addEventListener('adminGlobalSearch', handleGlobalSearch);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('adminGlobalSearch', handleGlobalSearch); };
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get('/v1/admin/seller-applications', {
        headers: { Authorization: getAuthHeader() }
      });
      const all = res.data.applications;
      setStats({
        total: all.length,
        pending: all.filter(a => a.status === 'PENDING').length,
        approved: all.filter(a => a.status === 'APPROVED').length,
        rejected: all.filter(a => a.status === 'REJECTED').length,
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchApps(); fetchStats(); }, [fetchApps, fetchStats]);

  useEffect(() => {
    if (message) { const t = setTimeout(() => setMessage(null), 5000); return () => clearTimeout(t); }
  }, [message]);

  const handleApprove = async (id) => {
    if (!confirm('Xác nhận duyệt tài khoản seller này?\nSeller sẽ được cấp quyền bán hàng và shop sẽ hoạt động.')) return;
    setActionLoading(id);
    try {
      const res = await axios.post(`/v1/admin/approve-seller/${id}`, {}, {
        headers: { Authorization: getAuthHeader() }
      });
      setMessage({ type: 'success', text: res.data.message });
      setDetailModal(null);
      fetchApps(); fetchStats();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Lỗi khi duyệt' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async () => {
    if (!rejectReason || rejectReason.trim().length < 10) {
      setMessage({ type: 'error', text: 'Lý do từ chối phải có ít nhất 10 ký tự' });
      return;
    }
    setActionLoading(rejectModal);
    try {
      const res = await axios.post(`/v1/admin/reject-seller/${rejectModal}`, {
        reason: rejectReason
      }, {
        headers: { Authorization: getAuthHeader() }
      });
      setMessage({ type: 'success', text: res.data.message });
      setRejectModal(null); setRejectReason('');
      setDetailModal(null);
      fetchApps(); fetchStats();
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Lỗi khi từ chối' });
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const cfg = STATUS_CONFIG[status] || { text: status, cls: 'admin-badge-pending', icon: 'la-question' };
    return (
      <span className={`admin-badge ${cfg.cls}`}>
        <span className={`las ${cfg.icon}`} style={{ marginRight: 4 }}></span>
        {cfg.text}
      </span>
    );
  };

  const getInitial = (name) => (name || '?').charAt(0).toUpperCase();

  const app = detailModal;

  return (
    <>
      <div className="admin-page-header">
        <h1>Duyệt Seller</h1>
        <small><Link href="/admin/dashboard">Home</Link> / Duyệt Seller</small>
      </div>

      <div className="admin-page-content">
        {/* Stats Cards */}
        <div className="admin-analytics">
          {[
            { label: 'Tổng đơn', value: stats.total, icon: 'la-folder-open', iconCls: 'icon-blue' },
            { label: 'Chờ duyệt', value: stats.pending, icon: 'la-clock', iconCls: 'icon-amber' },
            { label: 'Đã duyệt', value: stats.approved, icon: 'la-check-double', iconCls: 'icon-green' },
            { label: 'Từ chối', value: stats.rejected, icon: 'la-ban', iconCls: 'icon-red' },
          ].map((s, i) => (
            <div key={i} className="admin-card">
              <div className="admin-card-head">
                <h2>{s.value}</h2>
                <div className={`card-icon ${s.iconCls}`}>
                  <span className={`las ${s.icon}`}></span>
                </div>
              </div>
              <div className="admin-card-progress">
                <small>{s.label}</small>
              </div>
            </div>
          ))}
        </div>

        {/* Toast message */}
        {message && (
          <div style={{
            padding: '12px 20px', borderRadius: 8, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 10,
            background: message.type === 'success' ? '#e5f8ed' : '#fce8e8',
            color: message.type === 'success' ? '#16a34a' : '#e74c3c',
            border: `1px solid ${message.type === 'success' ? '#bbf0d0' : '#f5c6c6'}`,
            fontSize: '.85rem', fontWeight: 500,
          }}>
            <span className={`las ${message.type === 'success' ? 'la-check-circle' : 'la-exclamation-circle'}`} style={{ fontSize: '1.1rem' }}></span>
            <span style={{ flex: 1 }}>{message.text}</span>
            <button onClick={() => setMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'inherit' }}>&times;</button>
          </div>
        )}

        {/* Table */}
        <div className="admin-records">
          <div className="admin-record-header">
            <h3>Đơn đăng ký Seller</h3>
            <div className="admin-record-actions">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{ height: 34, border: '1px solid #d5d5d5', borderRadius: 6, padding: '0 8px', fontSize: '.8rem', color: '#555' }}
              >
                {FILTERS.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <button onClick={() => { fetchApps(); fetchStats(); }} className="add-btn" style={{
                background: '#22BAA0', color: '#fff', border: 'none', borderRadius: 6, height: 34,
                padding: '0 14px', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6
              }}>
                <span className="las la-sync-alt"></span> Làm mới
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
              <span className="las la-spinner la-spin" style={{ fontSize: '2rem' }}></span>
              <p style={{ marginTop: '.5rem' }}>Đang tải...</p>
            </div>
          ) : apps.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
              <span className="las la-inbox" style={{ fontSize: '3rem', display: 'block', marginBottom: '.5rem' }}></span>
              <p>Không có đơn đăng ký nào</p>
            </div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Seller</th>
                    <th>MST</th>
                    <th>Tên DN / Shop</th>
                    <th>Trạng thái</th>
                    <th>Ngày nộp</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.map(a => (
                    <tr key={a.id}
                      style={{ 
                        cursor: 'pointer', 
                        transition: 'background-color 0.2s ease',
                        backgroundColor: a.id == highlightSellerId ? '#fff3cd' : ''
                      }}
                      title="Click để xem chi tiết đơn đăng ký"
                      onMouseEnter={(e) => {
                        if (a.id != highlightSellerId) {
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (a.id != highlightSellerId) {
                          e.currentTarget.style.backgroundColor = '';
                        }
                      }}
                      onClick={() => setDetailModal(a)}>
                      <td>#{a.id}</td>
                      <td>
                        <div className="admin-client">
                          <div className="admin-client-avatar">{getInitial(a.user.full_name)}</div>
                          <div className="admin-client-info">
                            <h4>{a.user.full_name}</h4>
                            <small>{a.user.email}</small>
                          </div>
                        </div>
                      </td>
                      <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>{a.tax_code || '—'}</td>
                      <td>{a.business_name}</td>
                      <td>{getStatusBadge(a.status)}</td>
                      <td style={{ whiteSpace: 'nowrap', fontSize: '.8rem' }}>{formatDate(a.submitted_at)}</td>
                      <td>
                        <div className="admin-action-btns">
                          <button 
                            className="admin-action-btn" 
                            title="Chi tiết" 
                            onClick={(e) => {
                              e.stopPropagation();
                              setDetailModal(a);
                            }}>
                            <span className="las la-eye"></span>
                          </button>
                          {a.status === 'PENDING' && (
                            <button
                              className="admin-action-btn"
                              title="Duyệt"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleApprove(a.id);
                              }}
                              disabled={actionLoading === a.id}
                              style={{ color: actionLoading === a.id ? '#ccc' : '#22BAA0' }}
                            >
                              <span className={`las ${actionLoading === a.id ? 'la-spinner la-spin' : 'la-check'}`}></span>
                            </button>
                          )}
                          {!['APPROVED', 'REJECTED'].includes(a.status) && (
                            <button
                              className="admin-action-btn btn-danger"
                              title="Từ chối"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRejectModal(a.id);
                                setRejectReason('');
                              }}
                            >
                              <span className="las la-times"></span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!loading && apps.length > 0 && (
            <div className="admin-table-footer">
              <span>Hiển thị {apps.length} đơn</span>
              <span>Cập nhật: {new Date().toLocaleTimeString('vi-VN')}</span>
            </div>
          )}
        </div>
      </div>

      {/* ====== DETAIL MODAL ====== */}
      {app && (
        <div onClick={() => setDetailModal(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 12, width: '100%', maxWidth: 680,
            maxHeight: '90vh', overflow: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,.2)'
          }}>
            {/* Modal header */}
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #eee',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, background: '#22BAA0',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
                }}>
                  <span className="las la-store"></span>
                </div>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#333', margin: 0 }}>
                    Đơn đăng ký #{app.id}
                  </h3>
                  <span style={{ fontSize: '.78rem', color: '#999' }}>MST: {app.tax_code || '—'}</span>
                </div>
              </div>
              <button onClick={() => setDetailModal(null)} style={{
                background: 'none', border: 'none', fontSize: '1.3rem', color: '#999', cursor: 'pointer'
              }}>
                <span className="las la-times"></span>
              </button>
            </div>

            {/* Status banner */}
            <div style={{
              margin: '16px 24px 0', padding: '10px 16px', borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 10,
              background: app.status === 'APPROVED' ? '#e5f8ed' :
                          app.status === 'PENDING' ? '#fff9e6' :
                          app.status === 'REJECTED' ? '#fce8e8' : '#f5f5f5',
              border: `1px solid ${
                app.status === 'APPROVED' ? '#bbf0d0' :
                app.status === 'PENDING' ? '#fde68a' :
                app.status === 'REJECTED' ? '#f5c6c6' : '#ddd'
              }`,
            }}>
              {getStatusBadge(app.status)}
              <div style={{ fontSize: '.8rem', color: '#555' }}>
                {app.status === 'PENDING' && 'Đang chờ Admin duyệt đơn đăng ký'}
                {app.status === 'APPROVED' && 'Đã duyệt — Seller đã được cấp quyền bán hàng'}
                {app.status === 'REJECTED' && 'Đã bị từ chối bởi Admin'}
              </div>
            </div>

            {/* Reject reason */}
            {app.reject_reason && (
              <div style={{
                margin: '10px 24px 0', padding: '10px 16px', borderRadius: 8,
                background: '#fef2f2', border: '1px solid #fecaca', fontSize: '.82rem', color: '#b91c1c'
              }}>
                <strong>Lý do từ chối:</strong> {app.reject_reason}
              </div>
            )}

            {/* Detail body */}
            <div style={{ padding: '16px 24px' }}>
              {/* Seller Info */}
              <h4 style={{ fontSize: '.85rem', fontWeight: 600, color: '#555', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="las la-user" style={{ color: '#22BAA0' }}></span> Thông tin Seller
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 20 }}>
                <DetailItem icon="la-user" label="Họ tên" value={app.user.full_name} />
                <DetailItem icon="la-envelope" label="Email" value={app.user.email} />
                <DetailItem icon="la-phone" label="Điện thoại" value={app.user.phone || '—'} />
                <DetailItem icon="la-calendar" label="Ngày nộp" value={formatDate(app.submitted_at)} />
              </div>

              {/* Business Info */}
              <h4 style={{ fontSize: '.85rem', fontWeight: 600, color: '#555', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="las la-building" style={{ color: '#22BAA0' }}></span> Thông tin doanh nghiệp
              </h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px', marginBottom: 20 }}>
                <DetailItem icon="la-store" label="Tên DN / Shop" value={app.business_name} full />
                <DetailItem icon="la-barcode" label="Mã số thuế" value={app.tax_code || '—'} mono />
                <DetailItem icon="la-id-card" label="Số ĐKKD" value={app.business_license || '—'} />
                <DetailItem icon="la-map-marker" label="Địa chỉ" value={app.business_address} full />
              </div>

              {/* Review info */}
              {app.reviewed_at && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 20px', marginBottom: 10 }}>
                  <DetailItem icon="la-calendar-check" label="Ngày duyệt" value={formatDate(app.reviewed_at)} />
                  <DetailItem icon="la-user-check" label="Duyệt bởi" value={app.reviewed_by || '—'} />
                </div>
              )}
            </div>

            {/* Modal actions */}
            {app.status === 'PENDING' && (
              <div style={{
                padding: '16px 24px', borderTop: '1px solid #eee',
                display: 'flex', justifyContent: 'flex-end', gap: 10
              }}>
                <button
                  onClick={() => { setRejectModal(app.id); setRejectReason(''); }}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: '1px solid #e74c3c',
                    background: '#fff', color: '#e74c3c', cursor: 'pointer', fontWeight: 600, fontSize: '.82rem',
                    display: 'flex', alignItems: 'center', gap: 6
                  }}
                >
                  <span className="las la-times-circle"></span> Từ chối
                </button>
                <button
                  onClick={() => handleApprove(app.id)}
                  disabled={actionLoading === app.id}
                  style={{
                    padding: '8px 20px', borderRadius: 8, border: 'none',
                    background: '#22BAA0', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '.82rem',
                    display: 'flex', alignItems: 'center', gap: 6,
                    opacity: actionLoading === app.id ? 0.6 : 1
                  }}
                >
                  <span className={`las ${actionLoading === app.id ? 'la-spinner la-spin' : 'la-check-circle'}`}></span>
                  Duyệt Seller
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* ====== REJECT MODAL ====== */}
      {rejectModal && (
        <div onClick={() => { setRejectModal(null); setRejectReason(''); }} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 210,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem'
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 12, width: '100%', maxWidth: 460,
            boxShadow: '0 20px 60px rgba(0,0,0,.2)'
          }}>
            <div style={{
              padding: '18px 24px', borderBottom: '1px solid #eee',
              display: 'flex', alignItems: 'center', gap: 12
            }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10, background: '#fce8e8',
                color: '#e74c3c', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem'
              }}>
                <span className="las la-ban"></span>
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#333', margin: 0 }}>Từ chối đơn đăng ký</h3>
                <span style={{ fontSize: '.78rem', color: '#999' }}>Nhập lý do để từ chối seller</span>
              </div>
            </div>
            <div style={{ padding: '16px 24px' }}>
              <textarea
                placeholder="Nhập lý do từ chối (ít nhất 10 ký tự)..."
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                autoFocus
                rows={4}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #ddd',
                  fontSize: '.85rem', resize: 'vertical', outline: 'none', fontFamily: 'inherit',
                }}
              />
              <span style={{ fontSize: '.75rem', color: rejectReason.trim().length < 10 ? '#e74c3c' : '#999' }}>
                {rejectReason.trim().length}/10 ký tự tối thiểu
              </span>
            </div>
            <div style={{
              padding: '12px 24px 18px', display: 'flex', justifyContent: 'flex-end', gap: 10
            }}>
              <button
                onClick={() => { setRejectModal(null); setRejectReason(''); }}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd',
                  background: '#fff', color: '#666', cursor: 'pointer', fontSize: '.82rem'
                }}
              >
                Hủy
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectModal || rejectReason.trim().length < 10}
                style={{
                  padding: '8px 18px', borderRadius: 8, border: 'none',
                  background: '#e74c3c', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '.82rem',
                  opacity: (actionLoading === rejectModal || rejectReason.trim().length < 10) ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', gap: 6
                }}
              >
                {actionLoading === rejectModal ? (
                  <><span className="las la-spinner la-spin"></span> Đang xử lý...</>
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

function DetailItem({ icon, label, value, full, mono, color }) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{ fontSize: '.72rem', color: '#999', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className={`las ${icon}`} style={{ fontSize: '.8rem' }}></span> {label}
      </div>
      <div style={{
        fontSize: '.84rem', color: color || '#333', fontWeight: 500,
        fontFamily: mono ? 'monospace' : 'inherit'
      }}>
        {value}
      </div>
    </div>
  );
}
