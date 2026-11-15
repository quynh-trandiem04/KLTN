'use client';
import { useState, useEffect, useCallback } from 'react';
import { getAuthHeader } from '@/lib/auth';

const API = 'http://localhost:4000/api';

function fmtVnd(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

const STATUS_META = {
  CREATED:           { cls: 'badge-pending',  text: 'Vừa đặt',            action: 'ship',        actionLabel: 'Lấy hàng'       },
  PAID:              { cls: 'badge-info',      text: 'Đã thanh toán',      action: 'ship',        actionLabel: 'Lấy hàng'       },
  SHIPPED:           { cls: 'badge-purple',    text: 'Đang giao',          action: 'deliver',     actionLabel: 'Xác nhận giao'  },
  DELIVERED:         { cls: 'badge-success',   text: 'Đã giao',            action: null,          actionLabel: null             },
  CANCELLED:         { cls: 'badge-danger',    text: 'Đã hủy',             action: null,          actionLabel: null             },
  RETURN_REQUESTED:  { cls: 'badge-warning',   text: 'Yêu cầu trả hàng',  action: 'ship-return', actionLabel: 'Lấy hàng hoàn' },
  RETURN_IN_TRANSIT: { cls: 'badge-purple',    text: 'Đang lấy hoàn',      action: null,          actionLabel: null             },
  RETURNED:          { cls: 'badge-secondary', text: 'Đã hoàn hàng',       action: null,          actionLabel: null             },
  SETTLED:           { cls: 'badge-success',   text: 'Đã quyết toán',      action: null,          actionLabel: null             },
};

const TABS = [
  { value: '',                  label: 'Tất cả'           },
  { value: 'CREATED',           label: 'Vừa đặt (COD)'   },
  { value: 'PAID',              label: 'Đã TT (PREPAID)'  },
  { value: 'SHIPPED',           label: 'Đang giao'        },
  { value: 'DELIVERED',         label: 'Đã giao'          },
  { value: 'RETURN_REQUESTED',  label: 'Cần lấy hoàn'     },
  { value: 'RETURN_IN_TRANSIT', label: 'Đang lấy hoàn'    },
];

export default function ShipperDashboardPage() {
  const [orders,   setOrders]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);
  const [tab,      setTab]      = useState('');
  const [page,     setPage]     = useState(1);
  const [search,   setSearch]   = useState('');
  const [detail,   setDetail]   = useState(null);
  const [updating, setUpdating] = useState(false);
  const LIMIT = 15;

  // Check URL for detail parameter on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const detailId = urlParams.get('detail');
      const statusParam = urlParams.get('status');
      
      if (detailId) {
        // Wait for orders to load then auto-open detail
        const checkAndOpenDetail = () => {
          const order = orders.find(o => o.id === detailId);
          if (order) {
            setDetail(order);
            // Clean up URL
            urlParams.delete('detail');
            const newUrl = urlParams.toString() 
              ? `${window.location.pathname}?${urlParams}`
              : window.location.pathname;
            window.history.replaceState({}, '', newUrl);
          }
        };
        
        if (orders.length > 0) {
          checkAndOpenDetail();
        } else {
          // Set timer to check after orders load
          const timer = setTimeout(checkAndOpenDetail, 500);
          return () => clearTimeout(timer);
        }
      }
      
      if (statusParam) {
        setTab(statusParam);
      }
    }
  }, [orders]);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (tab) params.append('status', tab);
      if (search) params.append('search', search);
      const res  = await fetch(`${API}/v1/shipper/orders?${params}`, {
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi tải đơn hàng');
      setOrders(body.orders || []);
      setTotal(body.total || 0);
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [tab, page, search]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh orders every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const doAction = async (orderId, action, paymentMethod, actionLabel) => {
    // Hiển thị confirm dialog
    const confirmMessage = actionLabel 
      ? `Bạn có chắc chắn muốn thực hiện "${actionLabel}"?` 
      : 'Bạn có chắc chắn muốn thực hiện hành động này?';
    
    if (!window.confirm(confirmMessage)) {
      return; // Hủy nếu user không confirm
    }

    setUpdating(true);
    try {
      // For SHIPPED orders with COD, use deliver-cod endpoint
      let endpoint = action;
      if (action === 'deliver' && (paymentMethod || '').toUpperCase() === 'COD') {
        endpoint = 'deliver-cod';
      }
      const res  = await fetch(`${API}/v1/shipper/orders/${orderId}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi cập nhật');
      showToast('success', body.message || 'Cập nhật thành công!');
      setDetail(null);
      fetchOrders();
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setUpdating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
          <i className="las la-truck" style={{ marginRight: 8, color: '#22BAA0' }}></i>
          Đơn hàng cần giao
        </h1>
        <small style={{ color: '#999' }}>Trang shipper – quản lý đơn giao hàng</small>
      </div>

      {toast && (
        <div style={{
          padding: '10px 16px', borderRadius: 8, marginBottom: '1rem', fontWeight: 500,
          background: toast.type === 'success' ? '#e8f7f0' : '#fdecea',
          color: toast.type === 'success' ? '#22BAA0' : '#e74c3c',
          border: `1px solid ${toast.type === 'success' ? '#22BAA0' : '#e74c3c'}`,
        }}>
          {toast.msg}
        </div>
      )}

      {/* Search box */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Tìm kiếm theo ID đơn, tên khách hàng, email..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          style={{
            width: '100%',
            padding: '10px 14px',
            border: '1px solid #ddd',
            borderRadius: 8,
            fontSize: '.9rem',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onKeyPress={(e) => e.key === 'Enter' && fetchOrders()}
        />
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem', flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.value} onClick={() => { setTab(t.value); setPage(1); }}
            style={{
              padding: '6px 14px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: '.8rem', fontWeight: 500,
              background: tab === t.value ? '#22BAA0' : '#fff',
              color: tab === t.value ? '#fff' : '#555',
              boxShadow: '0 1px 4px rgba(0,0,0,.08)',
            }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,.06)', overflow: 'hidden' }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f0f0f0' }}>
          <h3 style={{ margin: 0, fontWeight: 600 }}>
            {tab ? STATUS_META[tab]?.text : 'Tất cả đơn hàng'} ({total})
          </h3>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.85rem' }}>
            <thead>
              <tr style={{ background: '#f9f9f9' }}>
                {['#ID', 'Khách hàng', 'Địa chỉ', 'Tổng tiền', 'TT/COD', 'Trạng thái', 'Ngày đặt', 'Thao tác'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#555', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#22BAA0' }}>Đang tải...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem', color: '#aaa' }}>Không có đơn hàng nào</td></tr>
              ) : orders.map(o => {
                const meta = STATUS_META[o.status] || { cls: '', text: o.status };
                const { action, actionLabel } = meta;
                const addr = [o.shippingaddressline1, o.shippingdistrict, o.shippingcity].filter(Boolean).join(', ');
                const pm = (o.paymentmethod || '').toUpperCase();
                const canAct = action && (
                  (action === 'ship' && (pm === 'COD' ? o.status === 'CREATED' : o.status === 'PAID')) ||
                  (action === 'deliver' && o.status === 'SHIPPED') ||
                  (action === 'ship-return' && o.status === 'RETURN_REQUESTED')
                );
                return (
                  <tr key={o.id} 
                      style={{ 
                        borderBottom: '1px solid #f5f5f5',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = 'transparent';
                      }}
                      onClick={() => setDetail(o)}>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: '.72rem', color: '#999' }}>
                      {String(o.id).slice(0, 8)}…
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ fontWeight: 500 }}>{o.buyer_name || 'Khách hàng'}</div>
                      <div style={{ fontSize: '.75rem', color: '#999' }}>{o.buyer_email || '—'}</div>
                    </td>
                    <td style={{ padding: '10px 12px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666', fontSize: '.78rem' }}>
                      {addr || '—'}
                    </td>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#22BAA0', whiteSpace: 'nowrap' }}>
                      {o.paymentmethod === 'PREPAID' ? fmtVnd(0) : fmtVnd(o.finalprice)}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: '.78rem' }}>
                      <div>{o.paymentmethod || '—'}</div>
                      {pm === 'COD' && o.codstatus && (
                        <div style={{ fontSize: '.72rem', color: '#999' }}>{o.codstatus}</div>
                      )}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{
                        display: 'inline-block', padding: '2px 10px', borderRadius: 12, fontSize: '.75rem', fontWeight: 600,
                        background: meta.cls?.includes('success') ? '#e8f7f0' : meta.cls?.includes('danger') ? '#fdecea' : meta.cls?.includes('warning') ? '#fff8e1' : meta.cls?.includes('info') ? '#e3f2fd' : meta.cls?.includes('purple') ? '#f3e5f5' : '#f5f5f5',
                        color: meta.cls?.includes('success') ? '#22BAA0' : meta.cls?.includes('danger') ? '#e74c3c' : meta.cls?.includes('warning') ? '#f59c00' : meta.cls?.includes('info') ? '#1976d2' : meta.cls?.includes('purple') ? '#9c27b0' : '#555',
                      }}>
                        {meta.text}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#999', fontSize: '.78rem', whiteSpace: 'nowrap' }}>
                      {new Date(o.created_at).toLocaleDateString('vi-VN')}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={(e) => {
                          e.stopPropagation();
                          setDetail(o);
                        }}
                          style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: '.78rem' }}>
                          Chi tiết
                        </button>
                        {canAct && (
                          <button onClick={(e) => {
                            e.stopPropagation();
                            doAction(o.id, action, o.paymentmethod, actionLabel);
                          }}
                            disabled={updating}
                            style={{ 
                              padding: '4px 10px', 
                              borderRadius: 6, 
                              border: 'none', 
                              background: updating ? '#ccc' : '#22BAA0', 
                              color: '#fff', 
                              cursor: updating ? 'not-allowed' : 'pointer', 
                              fontSize: '.78rem', 
                              fontWeight: 600,
                              opacity: updating ? 0.6 : 1
                            }}>
                            {updating ? '⏳ Đang xử lý...' : actionLabel}
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
        <div style={{ padding: '10px 1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f0f0f0', fontSize: '.82rem', color: '#555' }}>
          <span>Hiển thị {total === 0 ? 0 : Math.min((page - 1) * LIMIT + 1, total)}–{Math.min(page * LIMIT, total)} / {total} đơn</span>
          <div style={{ display: 'flex', gap: 6 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              style={{ padding: '3px 10px', border: '1px solid #ddd', borderRadius: 5, cursor: page <= 1 ? 'not-allowed' : 'pointer', background: '#fff' }}>
              ‹
            </button>
            <span style={{ padding: '3px 10px', background: '#22BAA0', color: '#fff', borderRadius: 5 }}>{page}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              style={{ padding: '3px 10px', border: '1px solid #ddd', borderRadius: 5, cursor: page >= totalPages ? 'not-allowed' : 'pointer', background: '#fff' }}>
              ›
            </button>
          </div>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {detail && (() => {
        const meta = STATUS_META[detail.status] || { text: detail.status, cls: '' };
        const { action, actionLabel } = meta;
        const pm = (detail.paymentmethod || '').toUpperCase();
        const addr = [detail.shippingaddressline1, detail.shippingaddressline2, detail.shippingdistrict, detail.shippingcity].filter(Boolean).join(', ');
        const canAct = action && (
          (action === 'ship' && (pm === 'COD' ? detail.status === 'CREATED' : detail.status === 'PAID')) ||
          (action === 'deliver' && detail.status === 'SHIPPED') ||
          (action === 'ship-return' && detail.status === 'RETURN_REQUESTED')
        );
        return (
          <div onClick={e => e.target === e.currentTarget && setDetail(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#fff', borderRadius: 12, width: '90%', maxWidth: 520, maxHeight: '90vh', overflow: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
              <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 style={{ margin: 0, fontWeight: 700 }}>Chi tiết đơn hàng</h3>
                <button onClick={() => setDetail(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#999' }}>✕</button>
              </div>
              <div style={{ padding: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                  {[
                    ['Mã đơn hàng', <span style={{ fontFamily: 'monospace', fontSize: '.82rem' }}>{detail.id}</span>],
                    ['Ngày đặt', new Date(detail.created_at).toLocaleString('vi-VN')],
                    ['Khách hàng', detail.buyer_name || '—'],
                    ['Số điện thoại', detail.shippingphone || '—'],
                  ].map(([label, val]) => (
                    <div key={label}>
                      <div style={{ fontSize: '.72rem', color: '#999', marginBottom: 3 }}>{label}</div>
                      <div style={{ fontSize: '.85rem' }}>{val}</div>
                    </div>
                  ))}
                  <div style={{ gridColumn: '1/-1' }}>
                    <div style={{ fontSize: '.72rem', color: '#999', marginBottom: 3 }}>Địa chỉ giao</div>
                    <div style={{ fontSize: '.84rem' }}>{addr || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '.72rem', color: '#999', marginBottom: 3 }}>Thanh toán</div>
                    <div>{detail.paymentmethod}</div>
                    {pm === 'COD' && detail.codstatus && <div style={{ fontSize: '.75rem', color: '#999' }}>COD: {detail.codstatus}</div>}
                  </div>
                  <div>
                    <div style={{ fontSize: '.72rem', color: '#999', marginBottom: 3 }}>Trạng thái</div>
                    <div style={{ fontWeight: 600 }}>{meta.text}</div>
                  </div>
                </div>
                <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: '.75rem', display: 'flex', justifyContent: 'space-between', fontWeight: 700 }}>
                  <span>Tổng thanh toán</span>
                  <span style={{ color: '#22BAA0' }}>{pm === 'PREPAID' ? fmtVnd(0) : fmtVnd(detail.finalprice)}</span>
                </div>
              </div>
              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setDetail(null)}
                  style={{ padding: '8px 18px', borderRadius: 8, border: '1px solid #ddd', background: '#f5f5f5', cursor: 'pointer' }}>
                  Đóng
                </button>
                {canAct && (
                  <button onClick={() => doAction(detail.id, action, detail.paymentmethod, actionLabel)} disabled={updating}
                    style={{ 
                      padding: '8px 18px', 
                      borderRadius: 8, 
                      border: 'none', 
                      background: updating ? '#ccc' : '#22BAA0', 
                      color: '#fff', 
                      cursor: updating ? 'not-allowed' : 'pointer', 
                      fontWeight: 600,
                      opacity: updating ? 0.6 : 1
                    }}>
                    {updating ? '⏳ Đang xử lý...' : actionLabel}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
