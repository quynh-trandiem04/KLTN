'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getAuthHeader } from '@/lib/auth';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';

const API = 'http://localhost:4000/api';

const STATUS_BADGE = {
  PENDING:    { cls: 'badge-pending', text: 'Chờ xác nhận' },
  CONFIRMED:  { cls: 'badge-info',    text: 'Đã xác nhận'  },
  PREPARING:  { cls: 'badge-info',    text: 'Đang chuẩn bị'},
  SHIPPING:   { cls: 'badge-purple',  text: 'Đang giao'    },
  DELIVERED:  { cls: 'badge-success', text: 'Đã giao'      },
  CANCELLED:  { cls: 'badge-danger',  text: 'Đã hủy'       },
};

const PAYMENT_LABEL = { COD: 'COD', PREPAID: 'Chuyển khoản' };
function fmtPayment(pm) { return PAYMENT_LABEL[pm] || pm || 'COD'; }

function fmtVnd(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

export default function SellerDashboardPage() {
  const router = useRouter();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const handleRowClick = (orderId) => {
    router.push(`/seller/orders?highlight=${orderId}`);
  };

  const fetchStats = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`${API}/v1/seller/dashboard-stats`, {
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi tải dữ liệu');
      setStats(body);
    } catch (e) {
      setError(e.message);
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

  const s = stats || {};
  const totalRevenue = Number(s.revenue?.total || 0);
  const monthRevenue = Number(s.revenue?.this_month || 0);
  const revPct = totalRevenue > 0 ? Math.min(100, Math.round((monthRevenue / totalRevenue) * 100)) : 0;

  const CARDS = [
    { label: 'Tổng sản phẩm',    value: s.products?.total || 0,     sub: `${s.products?.active || 0} đang bán`,    pct: s.products?.total ? Math.min(100, (s.products.active / s.products.total) * 100) : 0, icon: 'la-box-open',     ic: 'icon-green', bar: 'bar-green' },
    { label: 'Đơn chờ xác nhận', value: s.orders?.pending || 0,     sub: `${s.orders?.total || 0} tổng đơn`,      pct: s.orders?.total ? Math.min(100, (s.orders.pending / s.orders.total) * 100) : 0, icon: 'la-clock',        ic: 'icon-amber', bar: 'bar-amber' },
    { label: 'Đơn đã giao',      value: s.orders?.delivered || 0,   sub: `${s.orders?.total || 0} tổng đơn`,      pct: s.orders?.total ? Math.min(100, (s.orders.delivered / s.orders.total) * 100) : 0, icon: 'la-check-circle', ic: 'icon-blue',  bar: 'bar-blue'  },
    { label: 'Doanh thu tháng',  value: fmtVnd(monthRevenue),        sub: `Tổng ${fmtVnd(totalRevenue)}`,          pct: revPct,                                                                            icon: 'la-coins',        ic: 'icon-red',   bar: 'bar-red'   },
  ];

  return (
    <>
      <div className="s-page-header">
        <h1>Dashboard</h1>
        <small><a href="#">Trang chủ</a> / Tổng quan</small>
      </div>

      <div className="s-page-content">
        {error && <div className="s-toast error"><i className="las la-exclamation-circle"></i> {error}</div>}

        {loading ? (
          <div style={{ textAlign:'center', padding:'3rem', color:'#22BAA0' }}>
            <i className="las la-spinner la-spin" style={{ fontSize:'2.5rem' }}></i>
            <p style={{ marginTop:'.5rem', color:'#999' }}>Đang tải...</p>
          </div>
        ) : (
          <>
            {/* Revenue highlight */}
            <div className="revenue-box">
              <div>
                <div className="rev-label">Tổng doanh thu</div>
                <div className="rev-value">{fmtVnd(totalRevenue)}</div>
                <small style={{ opacity:.7 }}>Tháng này: {fmtVnd(monthRevenue)}</small>
              </div>
              <i className="las la-chart-line"></i>
            </div>

            {/* Analytics cards */}
            <div className="s-analytics">
              {CARDS.map(c => (
                <div className="s-card" key={c.label}>
                  <div className="s-card-head">
                    <h2>{c.value}</h2>
                    <div className={`s-card-icon ${c.ic}`}>
                      <i className={`las ${c.icon}`}></i>
                    </div>
                  </div>
                  <div className="s-card-foot">
                    <small>{c.label} &mdash; {c.sub}</small>
                    <div className="s-card-bar">
                      <div className={`bar ${c.bar}`} style={{ width: `${c.pct}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Charts Section */}
            {stats?.trends && stats.trends.length > 0 && (
              <div className="s-charts-section" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                <div className="s-card" style={{ padding: '1.5rem', background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1.05rem', color: '#1f2937', fontWeight: 600 }}>Biểu đồ Doanh thu (14 ngày qua)</h3>
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                      <AreaChart data={stats.trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                        <YAxis tickFormatter={(value) => value >= 1000000 ? `${(value / 1000000).toFixed(1)}M` : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dx={-10} width={60} />
                        <RechartsTooltip formatter={(value) => typeof value === 'number' ? fmtVnd(value) : value} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Area type="monotone" dataKey="revenue" name="Doanh thu" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="s-card" style={{ padding: '1.5rem', background: '#fff', borderRadius: '12px', boxShadow: '0 2px 8px rgba(0,0,0,0.04)' }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1.05rem', color: '#1f2937', fontWeight: 600 }}>Biểu đồ Đơn hàng (14 ngày qua)</h3>
                  <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                      <AreaChart data={stats.trends} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorOrders" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#22BAA0" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#22BAA0" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#6B7280' }} dx={-10} allowDecimals={false} width={40} />
                        <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                        <Area type="monotone" dataKey="orders" name="Đơn hàng" stroke="#22BAA0" strokeWidth={3} fillOpacity={1} fill="url(#colorOrders)" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* Recent orders */}
            <div className="s-records">
              <div className="s-record-header">
                <h3><i className="las la-list-alt" style={{ marginRight:6 }}></i>Đơn hàng gần đây</h3>
                <a href="/seller/orders" style={{ fontSize:'.8rem', color:'#22BAA0', textDecoration:'none' }}>
                  Xem tất cả →
                </a>
              </div>
              <div className="s-table-wrap">
                <table className="s-table">
                  <thead>
                    <tr>
                      <th>#ID</th>
                      <th>Khách hàng</th>
                      <th>Tổng tiền</th>
                      <th>Phương thức</th>
                      <th>Trạng thái</th>
                      <th>Ngày đặt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(s.recent_orders || []).length === 0 ? (
                      <tr><td colSpan={6} className="s-empty"><i className="las la-inbox"></i> Chưa có đơn hàng</td></tr>
                    ) : (s.recent_orders || []).map(o => {
                      const { cls, text } = STATUS_BADGE[o.status] || { cls:'badge-grey', text: o.status };
                      return (
                        <tr key={o.id}
                          style={{ cursor: 'pointer', transition: 'background-color 0.2s ease' }}
                          title="Click để xem chi tiết đơn hàng"
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = ''}
                          onClick={() => handleRowClick(o.id)}>
                          <td style={{ fontFamily:'monospace', fontSize:'.75rem' }}>{String(o.id).slice(0,8)}…</td>
                          <td>
                            <div className="s-client">
                              <div className="s-client-av">{(o.buyer_name || 'K').charAt(0).toUpperCase()}</div>
                              <div className="s-client-info">
                                <h4>{o.buyer_name || 'Khách hàng'}</h4>
                                <small>{o.buyer_email}</small>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontWeight:600, color:'#22BAA0' }}>{fmtVnd(o.total_amount)}</td>
                          <td>{fmtPayment(o.paymentmethod)}</td>
                          <td><span className={`s-badge ${cls}`}>{text}</span></td>
                          <td style={{ color:'#999' }}>{new Date(o.created_at).toLocaleDateString('vi-VN')}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
