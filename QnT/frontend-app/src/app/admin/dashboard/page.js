'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';
import { embedDashboard } from '@superset-ui/embedded-sdk';

const DASHBOARD_ID = 'd1922d3e-6045-45af-985a-dc79ecd05efb';
const SUPERSET_URL  = 'http://192.168.147.11:8088';

// ── Stats cards helper ────────────────────────────────────────────────────────
function formatCurrency(val) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);
}
function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}
const statusLabel = {
  PENDING:  { text: 'Chờ duyệt', cls: 'admin-badge-pending'  },
  APPROVED: { text: 'Đã duyệt',  cls: 'admin-badge-success'  },
  REJECTED: { text: 'Từ chối',   cls: 'admin-badge-danger'   },
};

// ── Superset Embed Component ──────────────────────────────────────────────────
function SupersetDashboard() {
  const containerRef = useRef(null);
  const [embedState, setEmbedState] = useState('idle'); // idle | loading | ready | error
  const [errorMsg, setErrorMsg]     = useState('');

  const fetchGuestToken = useCallback(async () => {
    const res = await axios.get('/v1/admin/superset/guest-token', {
      headers: { Authorization: getAuthHeader() }
    });
    return res.data.token;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    setEmbedState('loading');

    (async () => {
      try {
        await embedDashboard({
          id: DASHBOARD_ID,
          supersetDomain: SUPERSET_URL,
          mountPoint: containerRef.current,
          fetchGuestToken,
          dashboardUiConfig: {
            hideTitle: true,
            hideChartControls: false,
            hideTab: false,
            filters: { expanded: false },
          },
        });
        if (!cancelled) setEmbedState('ready');
      } catch (err) {
        if (!cancelled) {
          console.error('[Superset embed]', err);
          setErrorMsg(err?.message || 'Không thể tải dashboard Superset');
          setEmbedState('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fetchGuestToken]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 520 }}>
      {/* Loading overlay */}
      {embedState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', borderRadius: 10
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg,#ff4d4f,#cf1322)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: '0 8px 24px rgba(255,77,79,.3)',
            animation: 'spin 1.4s linear infinite'
          }}>
            <span className="las la-chart-pie" style={{ color: '#fff', fontSize: '1.6rem' }}></span>
          </div>
          <p style={{ color: '#666', fontWeight: 600, fontSize: 15, margin: 0 }}>Đang tải Superset Dashboard…</p>
          <p style={{ color: '#aaa', fontSize: 13, marginTop: 6 }}>Đang lấy guest token &amp; render biểu đồ</p>
        </div>
      )}

      {/* Error state */}
      {embedState === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#fff5f5', borderRadius: 10, border: '1px solid #fecaca'
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: '#fef2f2', border: '2px solid #fecaca',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16
          }}>
            <span className="las la-exclamation-triangle" style={{ color: '#ef4444', fontSize: '1.8rem' }}></span>
          </div>
          <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 15, margin: 0 }}>
            Không thể tải Superset Dashboard
          </p>
          <p style={{ color: '#999', fontSize: 13, marginTop: 8, maxWidth: 400, textAlign: 'center' }}>
            {errorMsg}
          </p>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setEmbedState('idle'); setTimeout(() => setEmbedState('loading'), 50); }}
              style={{
                padding: '8px 18px', borderRadius: 8,
                background: 'linear-gradient(135deg,#ff4d4f,#cf1322)',
                color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13
              }}
            >
              <span className="las la-redo" style={{ marginRight: 6 }}></span>Thử lại
            </button>
            <a
              href={`${SUPERSET_URL}/superset/dashboard/${DASHBOARD_ID}/`}
              target="_blank" rel="noreferrer"
              style={{
                padding: '8px 18px', borderRadius: 8,
                background: '#f3f4f6', color: '#374151',
                border: '1px solid #d1d5db', textDecoration: 'none',
                fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6
              }}
            >
              <span className="las la-external-link-alt"></span>Mở Superset
            </a>
          </div>
        </div>
      )}

      {/* Superset iframe mount point */}
      <div
        ref={containerRef}
        style={{
          width: '100%', height: '100%', minHeight: 520,
          opacity: embedState === 'ready' ? 1 : 0,
          transition: 'opacity 0.4s ease',
          borderRadius: 10, overflow: 'hidden'
        }}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        #superset-embed-container iframe {
          border: none !important;
          border-radius: 10px !important;
          width: 100% !important;
          min-height: 520px !important;
        }
      `}</style>
    </div>
  );
}

// ── Main Admin Dashboard Page ─────────────────────────────────────────────────
export default function AdminDashboardPage() {
  const router        = useRouter();
  const [stats, setStats]           = useState(null);
  const [loading, setLoading]       = useState(true);
  const [globalSearch, setGlobalSearch] = useState('');

  const handleSellerClick = (sellerId) => router.push(`/admin/seller-applications?highlight=${sellerId}`);

  const fetchStats = useCallback(async () => {
    try {
      const res = await axios.get('/v1/admin/dashboard-stats', {
        headers: { Authorization: getAuthHeader() }
      });
      setStats(res.data);
    } catch (err) {
      console.error('Dashboard stats error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => {
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  useEffect(() => {
    const handler = (e) => setGlobalSearch((e.detail || '').trim().toLowerCase());
    if (typeof window !== 'undefined') window.addEventListener('adminGlobalSearch', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('adminGlobalSearch', handler); };
  }, []);

  const sellerTotal      = stats?.sellers?.total   || 0;
  const sellerPending    = stats?.sellers?.pending  || 0;
  const sellerPendingPct = sellerTotal > 0 ? Math.round((sellerPending / sellerTotal) * 100) : 0;

  const filteredRecentSellers = (stats?.recent_sellers || []).filter(s => {
    if (!globalSearch) return true;
    return (s.full_name?.toLowerCase().includes(globalSearch) ||
            s.email?.toLowerCase().includes(globalSearch) ||
            s.business_name?.toLowerCase().includes(globalSearch) ||
            s.tax_code?.toLowerCase().includes(globalSearch) ||
            s.id?.toString().includes(globalSearch));
  });

  return (
    <>
      {/* Page Header */}
      <div className="admin-page-header">
        <h1>Dashboard</h1>
        <small><Link href="/admin/dashboard">Home</Link> / Dashboard</small>
      </div>

      <div className="admin-page-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
            <span className="las la-spinner la-spin" style={{ fontSize: '2rem' }}></span>
            <p style={{ marginTop: '.5rem' }}>Đang tải dữ liệu...</p>
          </div>
        ) : (
          <>
            {/* ── Analytics Cards ── */}
            <div className="admin-analytics">
              {/* Total Users */}
              <div className="admin-card">
                <div className="admin-card-head">
                  <h2>{stats?.users?.total || 0}</h2>
                  <div className="card-icon icon-green"><span className="las la-user-friends"></span></div>
                </div>
                <div className="admin-card-progress">
                  <small>Tổng người dùng — {stats?.users?.new_this_month || 0} mới tháng này</small>
                  <div className="admin-card-indicator">
                    <div className="admin-indicator ind-green"
                      style={{ width: `${Math.min((stats?.users?.new_this_month || 0) / Math.max(stats?.users?.total || 1, 1) * 100, 100)}%` }}>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sellers Pending */}
              <div className="admin-card">
                <div className="admin-card-head">
                  <h2>{stats?.sellers?.pending || 0}</h2>
                  <div className="card-icon icon-amber"><span className="las la-store"></span></div>
                </div>
                <div className="admin-card-progress">
                  <small>Seller chờ duyệt — {sellerPending}/{sellerTotal} đơn</small>
                  <div className="admin-card-indicator">
                    <div className="admin-indicator ind-amber" style={{ width: `${sellerPendingPct}%` }}></div>
                  </div>
                </div>
              </div>

              {/* Orders */}
              <div className="admin-card">
                <div className="admin-card-head">
                  <h2>{stats?.orders?.total || 0}</h2>
                  <div className="card-icon icon-blue"><span className="las la-shopping-cart"></span></div>
                </div>
                <div className="admin-card-progress">
                  <small>Tổng đơn hàng — {stats?.orders?.this_month || 0} tháng này</small>
                  <div className="admin-card-indicator">
                    <div className="admin-indicator ind-blue"
                      style={{ width: `${Math.min((stats?.orders?.this_month || 0) / Math.max(stats?.orders?.total || 1, 1) * 100, 100)}%` }}>
                    </div>
                  </div>
                </div>
              </div>

              {/* Revenue */}
              <div className="admin-card">
                <div className="admin-card-head">
                  <h2>{formatCurrency(stats?.revenue?.total)}</h2>
                  <div className="card-icon icon-red"><span className="las la-money-bill-wave"></span></div>
                </div>
                <div className="admin-card-progress">
                  <small>Doanh thu (đơn hoàn thành)</small>
                  <div className="admin-card-indicator">
                    <div className="admin-indicator ind-red" style={{ width: '45%' }}></div>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Superset Dashboard ── */}
            <div style={{
              background: '#fff',
              borderRadius: 12,
              boxShadow: '0 2px 12px rgba(0,0,0,.06)',
              marginBottom: '2rem',
              overflow: 'hidden'
            }}>
              {/* Header bar */}
              <div style={{
                padding: '16px 22px',
                borderBottom: '1px solid #f0f2f5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 10
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: 'linear-gradient(135deg,#ff4d4f,#cf1322)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 4px 12px rgba(255,77,79,.3)'
                  }}>
                    <span className="las la-chart-pie" style={{ color: '#fff', fontSize: '1.1rem' }}></span>
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>Phân tích dữ liệu</div>
                    <div style={{ fontSize: 12, color: '#aaa', marginTop: 1 }}>
                      Powered by Apache Superset — Dashboard ID: <span style={{ fontFamily: 'monospace' }}>{DASHBOARD_ID}</span>
                    </div>
                  </div>
                </div>
                <a
                  href={`${SUPERSET_URL}/superset/dashboard/${DASHBOARD_ID}/`}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px', borderRadius: 8,
                    background: '#f3f4f6', color: '#374151',
                    border: '1px solid #e5e7eb', textDecoration: 'none',
                    fontSize: 13, fontWeight: 600, transition: 'background .15s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#e5e7eb'}
                  onMouseLeave={e => e.currentTarget.style.background = '#f3f4f6'}
                >
                  <span className="las la-external-link-alt"></span>
                  Mở Superset
                </a>
              </div>

              {/* Embed area */}
              <div style={{ padding: '0', minHeight: 560 }} id="superset-embed-container">
                <SupersetDashboard />
              </div>
            </div>

            {/* ── Quick Stats ── */}
            <div className="admin-quick-stats">
              <div className="admin-quick-card">
                <h4><span className="las la-store" style={{ marginRight: 8, color: '#22BAA0' }}></span>Seller Applications</h4>
                <ul className="admin-quick-list">
                  <li><span>Chờ duyệt</span><span className="stat-value">{stats?.sellers?.pending || 0}</span></li>
                  <li><span>Đã duyệt (hoạt động)</span><span className="stat-value">{stats?.sellers?.approved || 0}</span></li>
                  <li><span>Từ chối</span><span className="stat-value">{stats?.sellers?.rejected || 0}</span></li>
                  <li style={{ fontWeight: 600 }}><span>Tổng</span><span className="stat-value">{stats?.sellers?.total || 0}</span></li>
                </ul>
              </div>

              <div className="admin-quick-card">
                <h4><span className="las la-shopping-cart" style={{ marginRight: 8, color: '#11a8c3' }}></span>Orders</h4>
                <ul className="admin-quick-list">
                  <li><span>Đang xử lý</span><span className="stat-value">{stats?.orders?.pending || 0}</span></li>
                  <li><span>Đã giao</span><span className="stat-value">{stats?.orders?.delivered || 0}</span></li>
                  <li><span>Tháng này</span><span className="stat-value">{stats?.orders?.this_month || 0}</span></li>
                  <li style={{ fontWeight: 600 }}><span>Tổng</span><span className="stat-value">{stats?.orders?.total || 0}</span></li>
                </ul>
              </div>

              <div className="admin-quick-card">
                <h4><span className="las la-user-friends" style={{ marginRight: 8, color: '#8854d0' }}></span>Users</h4>
                <ul className="admin-quick-list">
                  <li><span>Tổng tài khoản</span><span className="stat-value">{stats?.users?.total || 0}</span></li>
                  <li><span>Mới tháng này</span><span className="stat-value">{stats?.users?.new_this_month || 0}</span></li>
                </ul>
              </div>
            </div>

            {/* ── Recent Seller Applications ── */}
            <div className="admin-records">
              <div className="admin-record-header">
                <h3>Đơn đăng ký Seller gần đây</h3>
                <div className="admin-record-actions">
                  <Link
                    href="/admin/seller-applications"
                    className="add-btn"
                    style={{
                      textDecoration: 'none', color: '#fff', background: '#22BAA0',
                      padding: '6px 14px', borderRadius: 6, fontSize: '.8rem', fontWeight: 600
                    }}
                  >
                    Xem tất cả
                  </Link>
                </div>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Seller</th>
                      <th>MST</th>
                      <th>Tên DN</th>
                      <th>Trạng thái</th>
                      <th>Ngày nộp</th>
                      <th>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecentSellers.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                          {globalSearch ? 'Không tìm thấy kết quả nào phù hợp' : 'Chưa có đơn đăng ký seller nào'}
                        </td>
                      </tr>
                    ) : (
                      filteredRecentSellers.map(seller => (
                        <tr
                          key={seller.id}
                          style={{ cursor: 'pointer', transition: 'background-color 0.2s ease' }}
                          title="Click để xem chi tiết seller application"
                          onMouseEnter={e  => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                          onMouseLeave={e  => e.currentTarget.style.backgroundColor = ''}
                          onClick={() => handleSellerClick(seller.id)}
                        >
                          <td>#{seller.id}</td>
                          <td>
                            <div className="admin-client">
                              <div className="admin-client-avatar">
                                {(seller.full_name || seller.email).charAt(0).toUpperCase()}
                              </div>
                              <div className="admin-client-info">
                                <h4>{seller.full_name}</h4>
                                <small>{seller.email}</small>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontWeight: 500 }}>{seller.tax_code || '—'}</td>
                          <td>{seller.business_name}</td>
                          <td>
                            <span className={`admin-badge ${statusLabel[seller.status]?.cls || 'admin-badge-pending'}`}>
                              {statusLabel[seller.status]?.text || seller.status}
                            </span>
                          </td>
                          <td>{formatDate(seller.submitted_at)}</td>
                          <td>
                            <div className="admin-action-btns">
                              <button
                                className="admin-action-btn"
                                title="Xem chi tiết"
                                onClick={e => { e.stopPropagation(); handleSellerClick(seller.id); }}
                              >
                                <span className="las la-eye"></span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {filteredRecentSellers.length > 0 && (
                <div className="admin-table-footer">
                  <span>Hiển thị {filteredRecentSellers.length} đơn</span>
                  <span>Cập nhật: {new Date().toLocaleTimeString('vi-VN')}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}
