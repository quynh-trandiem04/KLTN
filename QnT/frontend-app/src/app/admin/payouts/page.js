'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';

const PAYMENT_LABEL = { PREPAID: 'Trả trước', COD: 'COD' };
const LIMIT = 20;

export default function PayoutsPage() {
  const [payouts, setPayouts] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Detail sidebar
  const [selected, setSelected] = useState(null);

  // Toast
  const [toast, setToast] = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchPayouts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: LIMIT };
      if (search) params.search = search;
      if (dateFrom) params.from = dateFrom;
      if (dateTo) params.to = dateTo;

      const res = await axios.get('/v1/admin/payouts', {
        headers: { Authorization: getAuthHeader() },
        params,
      });
      setPayouts(res.data.payouts || []);
      setTotal(res.data.total || 0);
      setStats(res.data.stats || null);
    } catch (e) {
      showToast('error', e.response?.data?.detail || 'Không tải được dữ liệu đối soát');
    } finally {
      setLoading(false);
    }
  }, [page, search, dateFrom, dateTo]);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setSearch(searchInput); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Global search listener
  useEffect(() => {
    const handler = (e) => setSearchInput(e.detail || '');
    if (typeof window !== 'undefined') window.addEventListener('adminGlobalSearch', handler);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('adminGlobalSearch', handler); };
  }, []);

  useEffect(() => { fetchPayouts(); }, [fetchPayouts]);

  const formatCurrency = (v) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / LIMIT);

  const handleApplyDate = () => { setPage(1); fetchPayouts(); };
  const handleClearDate = () => { setDateFrom(''); setDateTo(''); setPage(1); };

  const sellerGross = (p) => {
    const subtotal = Number(p.price || 0) - Number(p.shop_discount || 0);
    return subtotal > 0 ? subtotal : 0;
  };

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', top: 70, right: 20, zIndex: 9999,
          padding: '10px 18px', borderRadius: 8, fontSize: '.85rem', fontWeight: 500,
          display: 'flex', alignItems: 'center', gap: 8,
          background: toast.type === 'success' ? '#e5f8ed' : '#fce8e8',
          color: toast.type === 'success' ? '#22BAA0' : '#e74c3c',
          border: `1px solid ${toast.type === 'success' ? '#c3f0e0' : '#f5c6c6'}`,
          boxShadow: '0 4px 12px rgba(0,0,0,.1)',
        }}>
          <span className={`las ${toast.type === 'success' ? 'la-check-circle' : 'la-exclamation-circle'}`} />
          {toast.msg}
          <button onClick={() => setToast(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', padding: 0 }}>×</button>
        </div>
      )}

      <div className="admin-page-header">
        <h1>Đối soát</h1>
        <small><Link href="/admin/dashboard">Home</Link> / Đối soát</small>
      </div>

      <div className="admin-page-content">

        {/* ── Stats cards ── */}
        {stats && (
          <div className="admin-analytics" style={{ gridTemplateColumns: 'repeat(3, 1fr)', marginBottom: '1.5rem' }}>
            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <h2>{stats.total_orders.toLocaleString('vi-VN')}</h2>
                  <div className="admin-card-progress"><small>Đơn đã đối soát</small></div>
                </div>
                <div className="card-icon icon-green"><span className="las la-check-double" /></div>
              </div>
              <div className="admin-card-indicator">
                <div className="admin-indicator ind-green" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <h2 style={{ fontSize: '1.2rem' }}>{formatCurrency(stats.total_revenue)}</h2>
                  <div className="admin-card-progress"><small>Tổng doanh thu (finalPrice)</small></div>
                </div>
                <div className="card-icon icon-blue"><span className="las la-money-bill-wave" /></div>
              </div>
              <div className="admin-card-indicator">
                <div className="admin-indicator ind-blue" style={{ width: '100%' }} />
              </div>
            </div>
            <div className="admin-card">
              <div className="admin-card-head">
                <div>
                  <h2 style={{ fontSize: '1.2rem' }}>{formatCurrency(stats.total_seller_gross)}</h2>
                  <div className="admin-card-progress"><small>Tổng doanh thu Seller (trước VAT)</small></div>
                </div>
                <div className="card-icon icon-amber"><span className="las la-store" /></div>
              </div>
              <div className="admin-card-indicator">
                <div className="admin-indicator ind-amber" style={{ width: '100%' }} />
              </div>
            </div>
          </div>
        )}

        {/* ── Table area + sidebar ── */}
        <div style={{ display: 'flex', gap: 0, position: 'relative' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="admin-records">
              <div className="admin-record-header" style={{ flexWrap: 'wrap', gap: 8 }}>
                <h3>
                  Lịch sử đối soát
                  <span style={{ marginLeft: 8, fontWeight: 400, fontSize: '.85rem', color: '#999' }}>({total} đơn)</span>
                </h3>
                <div className="admin-record-actions" style={{ flexWrap: 'wrap' }}>
                  {/* Search */}
                  <input
                    className="search-input"
                    placeholder="Tìm shop, đơn hàng..."
                    value={searchInput}
                    onChange={e => setSearchInput(e.target.value)}
                    style={{ width: 200 }}
                  />
                  {/* Date range */}
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={e => setDateFrom(e.target.value)}
                    title="Từ ngày"
                    style={{ height: 34, border: '1px solid #d5d5d5', borderRadius: 6, padding: '0 8px', fontSize: '.8rem', color: '#555', outline: 'none' }}
                  />
                  <span style={{ color: '#999', fontSize: '.8rem' }}>→</span>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={e => setDateTo(e.target.value)}
                    title="Đến ngày"
                    style={{ height: 34, border: '1px solid #d5d5d5', borderRadius: 6, padding: '0 8px', fontSize: '.8rem', color: '#555', outline: 'none' }}
                  />
                  <button onClick={handleApplyDate} className="add-btn" style={{ height: 34, fontSize: '.8rem', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="las la-filter" /> Lọc
                  </button>
                  {(dateFrom || dateTo) && (
                    <button onClick={handleClearDate} style={{ height: 34, border: '1px solid #d5d5d5', background: '#fff', borderRadius: 6, padding: '0 12px', fontSize: '.8rem', color: '#666', cursor: 'pointer' }}>
                      Xóa lọc
                    </button>
                  )}
                  <button onClick={fetchPayouts} style={{ height: 34, border: '1px solid #d5d5d5', background: '#fff', borderRadius: 6, padding: '0 12px', fontSize: '.8rem', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span className="las la-sync-alt" /> Làm mới
                  </button>
                </div>
              </div>

              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Shop</th>
                      <th>MST Shop</th>
                      <th>Khách hàng</th>
                      <th>PT thanh toán</th>
                      <th>Doanh thu</th>
                      <th>Ngày đặt</th>
                      <th>Ngày đối soát</th>
                      <th>Chi tiết</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#999' }}>Đang tải...</td></tr>
                    ) : payouts.length === 0 ? (
                      <tr>
                        <td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#bbb' }}>
                          <span className="las la-inbox" style={{ fontSize: '2rem', display: 'block', marginBottom: 8 }} />
                          Chưa có đơn nào được đối soát
                        </td>
                      </tr>
                    ) : payouts.map((p, idx) => {
                      const isActive = selected?.id === p.id;
                      return (
                        <tr
                          key={p.id}
                          style={{ background: isActive ? '#f0faf8' : '', cursor: 'pointer', transition: 'background .15s' }}
                          onClick={() => setSelected(isActive ? null : p)}
                        >
                          <td style={{ color: '#22BAA0', fontWeight: 600, fontSize: '.8rem' }}>
                            {(page - 1) * LIMIT + idx + 1}
                          </td>
                          <td>
                            <div className="admin-client">
                              <div className="admin-client-avatar" style={{ background: '#e0f7f2', color: '#22BAA0' }}>
                                {(p.storename || 'S').charAt(0).toUpperCase()}
                              </div>
                              <div className="admin-client-info">
                                <h4>{p.storename || '—'}</h4>
                                <small style={{ fontFamily: 'monospace' }}>{String(p.id).slice(0, 8)}...</small>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontFamily: 'monospace', fontSize: '.82rem', color: '#666' }}>
                            {p.store_tax_code || '—'}
                          </td>
                          <td style={{ fontSize: '.82rem', color: '#555' }}>
                            {p.buyer_name || p.buyer_email || '—'}
                          </td>
                          <td>
                            <span style={{
                              padding: '2px 8px', borderRadius: 4, fontSize: '.75rem', fontWeight: 600,
                              background: p.paymentmethod === 'COD' ? '#fff3cd' : '#d1ecf1',
                              color: p.paymentmethod === 'COD' ? '#856404' : '#0c5460',
                            }}>
                              {PAYMENT_LABEL[p.paymentmethod] || p.paymentmethod}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: '#22BAA0', whiteSpace: 'nowrap' }}>
                            {formatCurrency(p.finalprice)}
                          </td>
                          <td style={{ fontSize: '.78rem', color: '#888', whiteSpace: 'nowrap' }}>
                            {formatDate(p.created_at)}
                          </td>
                          <td style={{ fontSize: '.78rem', color: '#555', whiteSpace: 'nowrap' }}>
                            {formatDate(p.settled_at)}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div className="admin-action-btns">
                              <button
                                className="admin-action-btn"
                                title="Xem chi tiết"
                                onClick={() => setSelected(isActive ? null : p)}
                              >
                                <span className={`las ${isActive ? 'la-times' : 'la-eye'}`} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="admin-table-footer">
                  <span>Trang {page}/{totalPages} — {total} đơn</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ddd', background: page === 1 ? '#f5f5f5' : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', fontSize: '.82rem' }}
                    >← Trước</button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                      if (pg > totalPages) return null;
                      return (
                        <button key={pg} onClick={() => setPage(pg)} style={{
                          padding: '4px 10px', borderRadius: 6, fontSize: '.82rem',
                          border: `1px solid ${pg === page ? '#22BAA0' : '#ddd'}`,
                          background: pg === page ? '#22BAA0' : '#fff',
                          color: pg === page ? '#fff' : '#555',
                          cursor: 'pointer', fontWeight: pg === page ? 600 : 400,
                        }}>{pg}</button>
                      );
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #ddd', background: page === totalPages ? '#f5f5f5' : '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', fontSize: '.82rem' }}
                    >Sau →</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Sidebar chi tiết ── */}
          {selected && (
            <div style={{
              width: '38%', minWidth: 320, maxWidth: 480,
              position: 'sticky', top: 0, height: 'calc(100vh - 80px)',
              overflowY: 'auto', background: '#fff', marginLeft: 20,
              borderLeft: '1px solid #e8ecef', borderRadius: '0 0 8px 0',
              boxShadow: '-4px 0 20px rgba(0,0,0,.07)', flexShrink: 0,
            }}>
              {/* Sidebar header */}
              <div style={{
                position: 'sticky', top: 0, background: '#fff', zIndex: 10,
                padding: '14px 18px', borderBottom: '1px solid #f0f0f0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '.95rem', color: '#333' }}>Chi tiết đối soát</div>
                  <div style={{ fontFamily: 'monospace', fontSize: '.75rem', color: '#999', marginTop: 2 }}>{selected.id}</div>
                </div>
                <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#999' }}>×</button>
              </div>

              <div style={{ padding: '16px 18px' }}>

                {/* Status badge */}
                <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="admin-badge admin-badge-success">
                    <span className="las la-check-double" /> Đã đối soát (SETTLED)
                  </span>
                  <span style={{
                    padding: '3px 8px', borderRadius: 4, fontSize: '.75rem', fontWeight: 600,
                    background: selected.paymentmethod === 'COD' ? '#fff3cd' : '#d1ecf1',
                    color: selected.paymentmethod === 'COD' ? '#856404' : '#0c5460',
                  }}>
                    {PAYMENT_LABEL[selected.paymentmethod] || selected.paymentmethod}
                  </span>
                </div>

                {/* Shop info */}
                {[
                  {
                    title: 'Thông tin Shop', rows: [
                      ['Tên Shop', selected.storename || '—'],
                      ['MST Shop', selected.store_tax_code || '—'],
                    ]
                  },
                  {
                    title: 'Khách hàng', rows: [
                      ['Tên', selected.buyer_name || '—'],
                      ['Email', selected.buyer_email || '—'],
                    ]
                  },
                  {
                    title: 'Tài chính', rows: [
                      ['Tiền hàng (giá gốc)', formatCurrency(selected.price)],
                      ['Giảm giá Shop', selected.shop_discount > 0 ? `−${formatCurrency(selected.shop_discount)}` : '0 ₫'],
                      ['Giảm giá Platform', selected.platform_discount > 0 ? `−${formatCurrency(selected.platform_discount)}` : '0 ₫'],
                      ['Phí vận chuyển', formatCurrency(selected.deliveryprice)],
                      ['Doanh thu Seller (trước VAT)', formatCurrency(sellerGross(selected))],
                      ['Tổng thanh toán (finalPrice)', formatCurrency(selected.finalprice)],
                    ]
                  },
                  {
                    title: 'Thời gian', rows: [
                      ['Ngày đặt hàng', formatDate(selected.created_at)],
                      ['Ngày đối soát (SETTLED)', formatDate(selected.settled_at)],
                    ]
                  },
                ].map(section => (
                  <div key={section.title} style={{ marginBottom: 18 }}>
                    <div style={{ fontWeight: 600, fontSize: '.8rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>{section.title}</div>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        {section.rows.map(([label, value]) => (
                          <tr key={label} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '7px 0', color: '#888', fontSize: '.8rem', width: '45%' }}>{label}</td>
                            <td style={{ padding: '7px 0', fontSize: '.84rem', fontWeight: label.includes('Tổng') || label.includes('Doanh thu') ? 700 : 400, color: label.includes('Tổng') ? '#22BAA0' : '#333' }}>
                              {value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}

                {/* Link to order detail */}
                <Link
                  href={`/admin/orders?highlight=${selected.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    width: '100%', padding: '9px', borderRadius: 6, marginTop: 4,
                    border: '1px solid #e2e8f0', background: '#f8fafc',
                    color: '#555', fontSize: '.82rem', fontWeight: 500, textDecoration: 'none',
                  }}
                >
                  <span className="las la-external-link-alt" /> Xem trong trang Đơn hàng
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
