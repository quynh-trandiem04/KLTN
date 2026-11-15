'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';

const STATUS_CONFIG = {
  CREATED:           { text: 'Chờ xử lý',    cls: 'admin-badge-pending',  icon: 'la-clock' },
  PAID:              { text: 'Đã thanh toán', cls: 'admin-badge-info',     icon: 'la-credit-card' },
  SHIPPED:           { text: 'Đang giao',     cls: 'admin-badge-warning',  icon: 'la-shipping-fast' },
  DELIVERED:         { text: 'Đã giao',       cls: 'admin-badge-success',  icon: 'la-check-circle' },
  SETTLED:           { text: 'Hoàn tất',      cls: 'admin-badge-success',  icon: 'la-check-double' },
  CANCELLED:         { text: 'Đã hủy',        cls: 'admin-badge-danger',   icon: 'la-ban' },
  RETURN_REQUESTED:  { text: 'Yêu cầu hoàn', cls: 'admin-badge-pending',  icon: 'la-undo' },
  RETURN_IN_TRANSIT: { text: 'Đang hoàn',    cls: 'admin-badge-warning',  icon: 'la-exchange-alt' },
  RETURNED:          { text: 'Đã hoàn',       cls: 'admin-badge-info',     icon: 'la-box' },
};

const PAYMENT_LABEL = { PREPAID: 'Trả trước', COD: 'COD' };

const COD_STATUS_LABEL = {
  NOT_COLLECTED: 'Khởi tạo ban đầu (chưa thu tiền)',
  PENDING_REMITTANCE: 'Shipper đã thu tiền của khách, đang giữ tiền',
  REMITTED: 'Sàn xác nhận đã nhận được tiền nộp về từ Shipper',
};

const FILTERS = [
  { key: '',                label: 'Tất cả' },
  { key: 'CREATED',         label: 'Chờ xử lý' },
  { key: 'PAID',            label: 'Đã TT' },
  { key: 'SHIPPED',         label: 'Đang giao' },
  { key: 'DELIVERED',       label: 'Đã giao' },
  { key: 'SETTLED',         label: 'Hoàn tất' },
  { key: 'CANCELLED',       label: 'Đã hủy' },
  { key: 'RETURN_REQUESTED',label: 'Yêu cầu hoàn' },
  { key: 'RETURNED',        label: 'Đã hoàn' },
];

export default function AdminOrdersPage() {
  const router = useRouter();
  const [orders, setOrders]               = useState([]);
  const [total, setTotal]                 = useState(0);
  const [loading, setLoading]             = useState(true);
  const [statusFilter, setStatusFilter]   = useState('');
  const [page, setPage]                   = useState(1);
  const [actionLoading, setActionLoading] = useState(null);
  const [message, setMessage]             = useState(null);
  const [sideOrder, setSideOrder]         = useState(null);
  const [sideItems, setSideItems]         = useState([]);
  const [sideItemsLoading, setSideItemsLoading] = useState(false);
  const [search, setSearch]               = useState('');
  const [searchInput, setSearchInput]       = useState('');
  const limit = 20;

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (statusFilter) params.status = statusFilter;
      if (search) params.search = search;
      const res = await axios.get('/v1/admin/orders', {
        headers: { Authorization: getAuthHeader() },
        params,
      });
      setOrders(res.data.orders || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      showMessage('error', 'Không thể tải danh sách đơn hàng');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, search]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setSearch(searchInput); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    const handleGlobalSearch = (e) => setSearchInput(e.detail);
    if (typeof window !== 'undefined') window.addEventListener('adminGlobalSearch', handleGlobalSearch);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('adminGlobalSearch', handleGlobalSearch); };
  }, []);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh orders every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const showMessage = (type, text) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 4000);
  };

  const openSidebar = async (order) => {
    setSideOrder(order);
    setSideItems([]);
    setSideItemsLoading(true);
    try {
      const res = await axios.get(`/v1/admin/orders/${order.id}/items`, {
        headers: { Authorization: getAuthHeader() },
      });
      setSideItems(res.data.items || []);
    } catch (e) {
      console.error('sideItems fetch error:', e.response?.data || e.message);
    } finally {
      setSideItemsLoading(false);
    }
  };

  const handleCancel = async (orderId) => {
    if (!confirm('Xác nhận hủy đơn hàng này?')) return;
    setActionLoading(orderId);
    try {
      await axios.post(`/v1/admin/orders/${orderId}/cancel`, {}, {
        headers: { Authorization: getAuthHeader() },
      });
      showMessage('success', 'Đã hủy đơn hàng thành công');
      fetchOrders();
      if (sideOrder && sideOrder.id === orderId) setSideOrder(prev => ({ ...prev, status: 'CANCELLED' }));
    } catch (err) {
      showMessage('error', (err.response && err.response.data && err.response.data.detail) || 'Không thể hủy đơn hàng');
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmPayment = async (orderId) => {
    if (!confirm('Xác nhận rằng khách hàng đã chuyển khoản thanh toán?')) return;
    setActionLoading(orderId);
    try {
      const response = await axios.post(`/v1/admin/orders/${orderId}/confirm-payment`, {}, {
        headers: { Authorization: getAuthHeader() },
      });
      showMessage('success', response.data.message || 'Đã xác nhận thanh toán thành công');
      fetchOrders();
      if (sideOrder && sideOrder.id === orderId) {
        setSideOrder(prev => ({ ...prev, status: 'PAID' }));
      }
    } catch (err) {
      showMessage('error', (err.response && err.response.data && err.response.data.detail) || 'Không thể xác nhận thanh toán');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRemitCOD = async (orderId) => {
    if (!confirm('Xác nhận rằng tiền COD đã về túi? Số tiền sẽ được trừ khỏi tài khoản shipper.')) return;
    setActionLoading(orderId);
    try {
      const response = await axios.post(`/v1/admin/orders/${orderId}/remit-cod`, {}, {
        headers: { Authorization: getAuthHeader() },
      });
      showMessage('success', response.data.message || 'Đã xác nhận tiền COD về túi');
      fetchOrders();
      if (sideOrder && sideOrder.id === orderId) {
        setSideOrder(prev => ({ ...prev, codstatus: 'REMITTED' }));
      }
    } catch (error) {
      const msg = error.response?.data?.detail || error.message || 'Có lỗi xảy ra';
      showMessage('error', msg);
    } finally {
      setActionLoading(null);
    }
  };


  const handlePayoutToSeller = async (orderId) => {
    if (!confirm('Xác nhận thanh toán cho Shop? Đơn hàng sẽ kết thúc và không thể hoàn tác.')) return;
    setActionLoading(orderId);
    try {
      const response = await axios.post(`/v1/admin/orders/${orderId}/payout`, {}, {
        headers: { Authorization: getAuthHeader() },
      });
      showMessage('success', response.data.message || 'Đã thanh toán cho Shop thành công');
      fetchOrders();
      if (sideOrder && sideOrder.id === orderId) {
        setSideOrder(prev => ({ ...prev, status: 'SETTLED' }));
      }
    } catch (err) {
      showMessage('error', (err.response && err.response.data && err.response.data.detail) || 'Không thể thanh toán cho Shop');
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (val) =>
    new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(val || 0);

  const formatDate = (d) => {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const totalPages = Math.ceil(total / limit);
  const canCancel = (status) => status === 'CREATED' || status === 'PAID';
  const canPayout = (order) => {
    if (order.status !== 'DELIVERED') return false;
    const pm = (order.paymentmethod || '').toUpperCase();
    if (pm === 'COD' && order.codstatus !== 'REMITTED') return false;
    
    // Check 5-minute window has passed
    const deliveredAt = new Date(order.updated_at);
    const now = new Date();
    const diffMs = now - deliveredAt;
    return diffMs >= 5 * 60 * 1000; // 5 minutes
  };

  const canRemitCOD = (order) => {
    return order && 
           (order.paymentmethod || '').toUpperCase() === 'COD' &&
           order.status === 'DELIVERED' &&
           order.codstatus === 'PENDING_REMITTANCE';
  };


  const getPayoutTimeRemaining = (order) => {
    if (order.status !== 'DELIVERED') return null;
    const deliveredAt = new Date(order.updated_at);
    const now = new Date();
    const diffMs = now - deliveredAt;
    const remainingMs = (5 * 60 * 1000) - diffMs;
    
    if (remainingMs <= 0) return 'Có thể thanh toán';
    
    const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
    return `Còn ${remainingMinutes} phút`;
  };

  return (
    <>
      <div className="admin-page-header">
        <h1>Quản lý Đơn hàng</h1>
        <small><Link href="/admin/dashboard">Home</Link> / Đơn hàng</small>
      </div>

      <div className="admin-page-content" style={{ display: 'flex', gap: 0, position: 'relative' }}>

        {message && (
          <div style={{
            position: 'fixed', top: 70, right: 20, zIndex: 9000,
            padding: '12px 20px', borderRadius: 8, fontWeight: 500, minWidth: 280,
            background: message.type === 'success' ? '#d4edda' : '#f8d7da',
            color: message.type === 'success' ? '#155724' : '#721c24',
            border: '1px solid ' + (message.type === 'success' ? '#c3e6cb' : '#f5c6cb'),
            boxShadow: '0 4px 12px rgba(0,0,0,.15)',
          }}>
            {message.text}
          </div>
        )}

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="admin-records">
            <div className="admin-record-header" style={{ flexWrap: 'wrap', gap: 8 }}>
              <h3>Danh sách đơn hàng ({total})</h3>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {FILTERS.map(f => (
                  <button key={f.key}
                    onClick={() => { setStatusFilter(f.key); setPage(1); }}
                    style={{
                      padding: '5px 12px', borderRadius: 20, border: '1px solid',
                      borderColor: statusFilter === f.key ? '#22BAA0' : '#ddd',
                      background: statusFilter === f.key ? '#22BAA0' : '#fff',
                      color: statusFilter === f.key ? '#fff' : '#555',
                      cursor: 'pointer', fontSize: '.8rem',
                      fontWeight: statusFilter === f.key ? 600 : 400,
                    }}
                  >{f.label}</button>
                ))}
              </div>
            </div>

            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>#</th><th>Khách hàng</th><th>Shop</th>
                    <th>TT</th><th>Tổng tiền</th><th>Trạng thái</th>
                    <th>Ngày đặt</th><th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#999' }}>Đang tải...</td></tr>
                  ) : orders.length === 0 ? (
                    <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#999' }}>Không có đơn hàng nào</td></tr>
                  ) : (
                    orders.map((order, idx) => {
                      const cfg = STATUS_CONFIG[order.status] || { text: order.status, cls: 'admin-badge-pending', icon: 'la-question' };
                      const isActive = sideOrder && sideOrder.id === order.id;
                      return (
                        <tr key={order.id}
                          title="Click để xem chi tiết đơn hàng"
                          style={{ 
                            background: isActive ? '#f0faf8' : '', 
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            if (!isActive) e.target.style.backgroundColor = '#f8f9fa';
                          }}
                          onMouseLeave={(e) => {
                            if (!isActive) e.target.style.backgroundColor = '';
                          }}
                          onClick={() => openSidebar(order)}>
                          <td style={{ fontSize: '.8rem', color: '#999' }}>{(page - 1) * limit + idx + 1}</td>
                          <td>
                            <div className="admin-client">
                              <div className="admin-client-avatar">
                                {(order.buyer_name || order.buyer_email || 'K').charAt(0).toUpperCase()}
                              </div>
                              <div className="admin-client-info">
                                <h4>{order.buyer_name || '—'}</h4>
                                <small>{order.buyer_email}</small>
                              </div>
                            </div>
                          </td>
                          <td style={{ fontSize: '.85rem', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {order.storename || '—'}
                          </td>
                          <td>
                            <span style={{
                              padding: '2px 7px', borderRadius: 4, fontSize: '.72rem', fontWeight: 600,
                              background: order.paymentmethod === 'COD' ? '#fff3cd' : '#d1ecf1',
                              color: order.paymentmethod === 'COD' ? '#856404' : '#0c5460',
                            }}>
                              {PAYMENT_LABEL[order.paymentmethod] || order.paymentmethod}
                            </span>
                          </td>
                          <td style={{ fontWeight: 600, color: '#22BAA0', whiteSpace: 'nowrap' }}>
                            {formatCurrency(order.finalprice)}
                          </td>
                          <td>
                            <span className={'admin-badge ' + cfg.cls}>
                              <span className={'las ' + cfg.icon} style={{ marginRight: 3 }}></span>
                              {cfg.text}
                            </span>
                          </td>
                          <td style={{ fontSize: '.78rem', color: '#777', whiteSpace: 'nowrap' }}>
                            {formatDate(order.created_at)}
                          </td>
                          <td onClick={e => e.stopPropagation()}>
                            <div className="admin-action-btns">
                              <button className="admin-action-btn" title="Xem chi tiết" onClick={() => openSidebar(order)}>
                                <span className="las la-eye"></span>
                              </button>
                              {canCancel(order.status) && (
                                <button className="admin-action-btn" title="Hủy đơn"
                                  disabled={actionLoading === order.id}
                                  onClick={() => handleCancel(order.id)}
                                  style={{ color: '#dc3545' }}>
                                  <span className={actionLoading === order.id ? 'las la-spinner la-spin' : 'las la-ban'}></span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="admin-table-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px' }}>
                <span style={{ fontSize: '.85rem', color: '#777' }}>Trang {page}/{totalPages} — {total} đơn</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: page === 1 ? '#f5f5f5' : '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer' }}>
                    ← Trước
                  </button>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const pg = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                    if (pg > totalPages) return null;
                    return (
                      <button key={pg} onClick={() => setPage(pg)} style={{
                        padding: '5px 10px', borderRadius: 6,
                        border: '1px solid ' + (pg === page ? '#22BAA0' : '#ddd'),
                        background: pg === page ? '#22BAA0' : '#fff',
                        color: pg === page ? '#fff' : '#555',
                        cursor: 'pointer', fontWeight: pg === page ? 600 : 400,
                      }}>{pg}</button>
                    );
                  })}
                  <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid #ddd', background: page === totalPages ? '#f5f5f5' : '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer' }}>
                    Sau →
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {sideOrder && (
          <div style={{
            width: '42%', minWidth: 360, maxWidth: 520,
            position: 'sticky', top: 0, height: 'calc(100vh - 80px)',
            overflowY: 'auto', background: '#fff',
            borderLeft: '1px solid #e8ecef', borderRadius: '0 0 12px 0',
            boxShadow: '-4px 0 20px rgba(0,0,0,.07)', marginLeft: 20, flexShrink: 0,
          }}>
            <div style={{
              position: 'sticky', top: 0, background: '#fff', zIndex: 10,
              padding: '16px 20px', borderBottom: '1px solid #f0f0f0',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem' }}>Chi tiết đơn hàng</h4>
                <small style={{ color: '#999', fontFamily: 'monospace' }}>{sideOrder.id}</small>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setSideOrder(null)}
                  style={{ background: 'none', border: 'none', fontSize: '1.3rem', cursor: 'pointer', color: '#999' }}>×</button>
              </div>
            </div>

            <div style={{ padding: '14px 20px', borderBottom: '1px solid #f5f5f5' }}>
              {(() => {
                const cfg = STATUS_CONFIG[sideOrder.status] || { text: sideOrder.status, cls: 'admin-badge-pending', icon: 'la-question' };
                return (
                  <span className={'admin-badge ' + cfg.cls} style={{ fontSize: '.85rem', padding: '5px 12px' }}>
                    <span className={'las ' + cfg.icon} style={{ marginRight: 5 }}></span>
                    {cfg.text}
                  </span>
                );
              })()}
              {canCancel(sideOrder.status) && (
                <button onClick={() => handleCancel(sideOrder.id)} disabled={actionLoading === sideOrder.id}
                  style={{ marginLeft: 10, padding: '5px 14px', borderRadius: 8, border: 'none', background: '#dc3545', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '.82rem' }}>
                  {actionLoading === sideOrder.id ? 'Đang xử lý...' : 'Hủy đơn'}
                </button>
              )}
              {sideOrder.paymentmethod === 'PREPAID' && sideOrder.status === 'CREATED' && (
                <button onClick={() => handleConfirmPayment(sideOrder.id)} disabled={actionLoading === sideOrder.id}
                  style={{ marginLeft: 10, padding: '5px 14px', borderRadius: 8, border: 'none', background: '#28a745', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '.82rem' }}>
                  {actionLoading === sideOrder.id ? 'Đang xử lý...' : 'Xác nhận TT'}
                </button>
              )}
              {canRemitCOD(sideOrder) && (
                <button onClick={() => handleRemitCOD(sideOrder.id)} disabled={actionLoading === sideOrder.id}
                  style={{ marginLeft: 10, padding: '5px 14px', borderRadius: 8, border: 'none', background: '#ffc107', color: '#000', fontWeight: 600, cursor: 'pointer', fontSize: '.82rem' }}>
                  {actionLoading === sideOrder.id ? 'Đang xử lý...' : 'Xác nhận COD'}
                </button>
              )}
              {canPayout(sideOrder) && (
                <button onClick={() => handlePayoutToSeller(sideOrder.id)} disabled={actionLoading === sideOrder.id}
                  style={{ marginLeft: 10, padding: '5px 14px', borderRadius: 8, border: 'none', background: '#17a2b8', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: '.82rem' }}>
                  {actionLoading === sideOrder.id ? 'Đang xử lý...' : 'Thanh toán Shop'}
                </button>
              )}
            </div>

            <div style={{ padding: '14px 20px' }}>
              {[
                { title: 'Thông tin đơn hàng', rows: [
                  ['Shop', sideOrder.storename || '—'],
                  ['Phương thức TT', PAYMENT_LABEL[sideOrder.paymentmethod] || sideOrder.paymentmethod],
                  ...(sideOrder.paymentmethod === 'COD' && sideOrder.codstatus ? [['COD Status', COD_STATUS_LABEL[sideOrder.codstatus] || sideOrder.codstatus]] : []),
                  ['Tiền hàng', formatCurrency(sideOrder.price)],
                  ['Phí ship', formatCurrency(sideOrder.deliveryprice)],
                  ...(Number(sideOrder.shop_discount) > 0 ? [['Mã giảm giá Shop', `${sideOrder.shop_coupon_code} (-${formatCurrency(sideOrder.shop_discount)})`]] : []),
                  ...(Number(sideOrder.platform_discount) > 0 ? [['Mã giảm giá Platform', `${sideOrder.platform_coupon_code} (-${formatCurrency(sideOrder.platform_discount)})`]] : []),
                  ['Tổng cộng', formatCurrency(sideOrder.finalprice)],
                ]},
                { title: 'Khách hàng', rows: [
                  ['Tên', sideOrder.buyer_name || '—'],
                  ['Email', sideOrder.buyer_email || '—'],
                  ['SĐT', sideOrder.shippingphone || '—'],
                  ['Địa chỉ', [sideOrder.shippingaddressline1, sideOrder.shippingcity].filter(Boolean).join(', ') || '—'],
                ]},
                { title: 'Thời gian', rows: [
                  ['Ngày đặt', formatDate(sideOrder.created_at)],
                  ['Cập nhật', formatDate(sideOrder.updated_at)],
                  ...(sideOrder.status === 'DELIVERED' ? [['Payout status', getPayoutTimeRemaining(sideOrder)]] : []),
                ]},
              ].map(section => (
                <div key={section.title} style={{ marginBottom: 18 }}>
                  <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#444', marginBottom: 8 }}>{section.title}</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>
                      {section.rows.map(function(row) {
                        return (
                          <tr key={row[0]} style={{ borderBottom: '1px solid #f5f5f5' }}>
                            <td style={{ padding: '7px 0', color: '#888', fontSize: '.8rem', width: '42%' }}>{row[0]}</td>
                            <td style={{ padding: '7px 0', fontSize: '.85rem' }}>{row[1]}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}

              {/* Product images */}
              <div style={{ marginTop: 4 }}>
                <div style={{ fontWeight: 600, fontSize: '.85rem', color: '#444', marginBottom: 10 }}>Sản phẩm</div>
                {sideItemsLoading ? (
                  <div style={{ color: '#999', fontSize: '.85rem', padding: '8px 0' }}>Đang tải...</div>
                ) : sideItems.length === 0 ? (
                  <div style={{ color: '#bbb', fontSize: '.82rem', fontStyle: 'italic' }}>Không có sản phẩm</div>
                ) : (
                  sideItems.map((item, i) => (
                    <div key={item.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f5f5f5' }}>
                      {item.image ? (
                        <img src={item.image} alt={item.product_name} style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 8, background: '#f3f4f6', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ccc' }}>
                          <span className="las la-image" style={{ fontSize: 22 }}></span>
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: '.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.product_name || 'Sản phẩm'}</div>
                        {item.variant_name && <div style={{ fontSize: '.75rem', color: '#888' }}>{item.variant_name}</div>}
                        <div style={{ fontSize: '.8rem', color: '#22BAA0', fontWeight: 600 }}>
                          x{item.quantity} × {formatCurrency(item.promotional_price || item.price)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}