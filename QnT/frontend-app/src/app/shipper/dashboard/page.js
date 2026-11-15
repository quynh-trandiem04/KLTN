'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getAuthHeader } from '@/lib/auth';
import '../../admin/dashboard/styles.css';

const API = 'http://localhost:4000/api';

function fmtVnd(n) {
  if (!n && n !== 0) return '0đ';
  return Number(n).toLocaleString('vi-VN') + 'đ';
}

const STATUS_META = {
  CREATED:           { text: 'Vừa đặt',          color: '#f39c12', bg: '#fff8e1' },
  PAID:              { text: 'Đã thanh toán',     color: '#3498db', bg: '#e8f4fd' },
  SHIPPED:           { text: 'Đang giao',         color: '#9b59b6', bg: '#f5eef8' },
  DELIVERED:         { text: 'Đã giao',           color: '#27ae60', bg: '#e9f7ef' },
  CANCELLED:         { text: 'Đã hủy',            color: '#e74c3c', bg: '#fde8e8' },
  RETURN_REQUESTED:  { text: 'YC trả hàng',       color: '#e67e22', bg: '#fef5e7' },
  RETURN_IN_TRANSIT: { text: 'Đang lấy hoàn',     color: '#9b59b6', bg: '#f5eef8' },
  RETURNED:          { text: 'Đã hoàn hàng',      color: '#7f8c8d', bg: '#f2f3f4' },
  SETTLED:           { text: 'Đã quyết toán',     color: '#27ae60', bg: '#e9f7ef' },
};

export default function ShipperDashboardPage() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    if (stored) setUser(JSON.parse(stored));
  }, []);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/v1/shipper/dashboard-stats`, {
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Lỗi tải dữ liệu');
      setStats(body.stats);
      setRecent(body.recent_orders || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  // Auto-refresh stats every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchStats();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchStats]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Chào buổi sáng';
    if (h < 18) return 'Chào buổi chiều';
    return 'Chào buổi tối';
  };

  const shippingPct = Math.min(((stats?.shipping || 0) / Math.max(stats?.total || 1, 1)) * 100, 100);
  const pickupPct   = Math.min(((stats?.pending_pickup || 0) / Math.max(stats?.total || 1, 1)) * 100, 100);
  const todayPct    = Math.min(((stats?.delivered_today || 0) / Math.max(stats?.delivered || 1, 1)) * 100, 100);
  const delivPct    = Math.min(((stats?.delivered || 0) / Math.max(stats?.total || 1, 1)) * 100, 100);

  return (
    <>
      <div className="admin-page-header">
        <h1>Dashboard</h1>
        <small><Link href="/shipper/dashboard">Trang chủ</Link> / Tổng quan</small>
      </div>

      <div className="admin-page-content">
        {/* COD holding alert */}
        {stats && Number(stats.cod_holding) > 0 && (
          <div style={{ background: '#fff3cd', border: '1px solid #ffc107', borderRadius: 10, padding: '12px 18px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10 }}>
            <i className="las la-exclamation-triangle" style={{ fontSize: '1.3rem', color: '#856404' }}></i>
            <span style={{ color: '#856404', fontWeight: 500 }}>
              Bạn đang giữ tiền COD chưa nộp: <strong>{fmtVnd(stats.cod_holding)}</strong>
            </span>
          </div>
        )}

        {/* Stat cards — dùng đúng admin CSS */}
        <div className="admin-analytics">
          <div className="admin-card">
            <div className="admin-card-head">
              <h2>{loading ? '…' : (stats?.shipping || 0)}</h2>
              <div className="card-icon icon-purple">
                <span className="las la-shipping-fast"></span>
              </div>
            </div>
            <div className="admin-card-progress">
              <small>Đang giao — {stats?.total || 0} tổng đơn</small>
              <div className="admin-card-indicator">
                <div className="admin-indicator" style={{ width: `${shippingPct}%`, background: '#9b59b6' }}></div>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <h2>{loading ? '…' : (stats?.pending_pickup || 0)}</h2>
              <div className="card-icon icon-amber">
                <span className="las la-box"></span>
              </div>
            </div>
            <div className="admin-card-progress">
              <small>Cần lấy hàng — chờ shipper nhận</small>
              <div className="admin-card-indicator">
                <div className="admin-indicator ind-amber" style={{ width: `${pickupPct}%` }}></div>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <h2>{loading ? '…' : (stats?.delivered_today || 0)}</h2>
              <div className="card-icon icon-green">
                <span className="las la-check-circle"></span>
              </div>
            </div>
            <div className="admin-card-progress">
              <small>Giao hôm nay — {stats?.delivered || 0} tổng đã giao</small>
              <div className="admin-card-indicator">
                <div className="admin-indicator ind-green" style={{ width: `${todayPct}%` }}></div>
              </div>
            </div>
          </div>

          <div className="admin-card">
            <div className="admin-card-head">
              <h2>{loading ? '…' : (stats?.delivered || 0)}</h2>
              <div className="card-icon icon-blue">
                <span className="las la-clipboard-check"></span>
              </div>
            </div>
            <div className="admin-card-progress">
              <small>Tổng đã giao — {stats?.total || 0} tổng đơn</small>
              <div className="admin-card-indicator">
                <div className="admin-indicator ind-blue" style={{ width: `${delivPct}%` }}></div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <Link href="/shipper" style={{ textDecoration: 'none' }}>
            <button style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#22BAA0', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="las la-list"></i> Xem tất cả đơn hàng
            </button>
          </Link>
          <Link href="/shipper?status=CREATED" style={{ textDecoration: 'none' }}>
            <button style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#f39c12', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="las la-box"></i> Đơn cần lấy (COD)
            </button>
          </Link>
          <Link href="/shipper?status=SHIPPED" style={{ textDecoration: 'none' }}>
            <button style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: '#9b59b6', color: '#fff', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <i className="las la-shipping-fast"></i> Đơn đang giao
            </button>
          </Link>
        </div>

        {/* Recent orders */}
        <div className="admin-records">
          <div className="admin-record-header">
            <h3><i className="las la-history" style={{ marginRight: 6 }}></i>Hoạt động gần đây</h3>
            <Link href="/shipper" style={{ color: '#22BAA0', fontSize: '.85rem', textDecoration: 'none', fontWeight: 600 }}>Xem tất cả →</Link>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Mã đơn</th>
                  <th>Khách hàng</th>
                  <th>Cửa hàng</th>
                  <th>Địa chỉ giao</th>
                  <th>Tổng tiền</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2rem', color: '#22BAA0' }}>
                    <i className="las la-spinner la-spin" style={{ fontSize: '1.8rem' }}></i>
                  </td></tr>
                ) : recent.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#999' }}>
                    Chưa có đơn hàng nào được giao cho bạn
                  </td></tr>
                ) : recent.map(o => {
                  const s = STATUS_META[o.status] || { text: o.status, color: '#999', bg: '#f5f5f5' };
                  return (
                    <tr key={o.id} 
                        style={{ 
                          cursor: 'pointer',
                          transition: 'all 0.2s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#f8f9fa';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                        onClick={() => {
                          // Navigate to main shipper page with order detail
                          window.location.href = `/shipper?detail=${o.id}`;
                        }}>
                      <td style={{ fontFamily: 'monospace', fontSize: '.75rem', color: '#888' }}>
                        {String(o.id).slice(0, 14)}…
                      </td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{o.buyer_name || '—'}</div>
                        <small style={{ color: '#999' }}>{o.buyer_phone || ''}</small>
                      </td>
                      <td style={{ color: '#555', fontSize: '.85rem' }}>{o.storename || '—'}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666', fontSize: '.82rem' }}>
                        {[o.shippingaddressline1, o.shippingcity].filter(Boolean).join(', ') || '—'}
                      </td>
                      <td style={{ fontWeight: 600, color: '#22BAA0', whiteSpace: 'nowrap' }}>
                        {o.paymentmethod === 'PREPAID' ? fmtVnd(0) : fmtVnd(o.finalprice)}
                        {o.paymentmethod === 'COD' && <span style={{ marginLeft: 4, fontSize: '.7rem', background: '#fff3cd', color: '#856404', padding: '1px 6px', borderRadius: 4 }}>COD</span>}
                      </td>
                      <td>
                        <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '.75rem', fontWeight: 600, background: s.bg, color: s.color }}>
                          {s.text}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
