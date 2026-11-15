'use client';
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { getAuthHeader } from '@/lib/auth';

const API = 'http://localhost:4000/api';

function fmtVnd(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

const STATUS_META = {
  CREATED:           { cls: 'badge-pending',  text: 'Vừa đặt'             },
  PAID:              { cls: 'badge-info',      text: 'Đã thanh toán'       },
  SHIPPED:           { cls: 'badge-purple',    text: 'Đang giao'           },
  DELIVERED:         { cls: 'badge-success',   text: 'Đã giao'             },
  CANCELLED:         { cls: 'badge-danger',    text: 'Đã hủy'              },
  RETURN_REQUESTED:  { cls: 'badge-warning',   text: 'Yêu cầu trả hàng'   },
  RETURN_IN_TRANSIT: { cls: 'badge-purple',    text: 'Shipper lấy hàng về' },
  RETURNED:          { cls: 'badge-secondary', text: 'Đã hoàn hàng'        },
  SETTLED:           { cls: 'badge-success',   text: 'Đã quyết toán'       },
};

const COD_STATUS_LABEL = {
  NOT_COLLECTED: 'Chưa thu tiền',
  PENDING_REMITTANCE: 'Shipper đã thu, đang giữ',
  REMITTED: 'Sàn đã nhận tiền nộp về',
};

const TABS = [
  { value: '',                 label: 'Tất cả'            },
  { value: 'CREATED',          label: 'Vừa đặt'           },
  { value: 'PAID',             label: 'Đã thanh toán'     },
  { value: 'SHIPPED',          label: 'Đang giao'         },
  { value: 'DELIVERED',        label: 'Đã giao'           },
  { value: 'CANCELLED',        label: 'Đã hủy'            },
  { value: 'RETURN_REQUESTED', label: 'Yêu cầu trả hàng' },
  { value: 'RETURN_IN_TRANSIT',label: 'Shipper đang lấy'  },
  { value: 'RETURNED',         label: 'Đã hoàn hàng'      },
  { value: 'SETTLED',          label: 'Đã quyết toán'     },
];

export default function SellerOrdersPage() {
  const searchParams = useSearchParams();
  const [orders,  setOrders]  = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast,   setToast]   = useState(null);

  const [tab,  setTab]  = useState('');
  const [page, setPage] = useState(1);
  const LIMIT = 12;

  // detail modal
  const [detail,   setDetail]   = useState(null);
  const [items,    setItems]    = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [updating, setUpdating] = useState(false);

  const openDetail = async (order) => {
    setDetail(order);
    setItems([]);
    setItemsLoading(true);
    try {
      const res = await fetch(`${API}/v1/seller/orders/${order.id}/items`, {
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      setItems(body.items || []);
    } catch (e) {
      // silently fail — items section will show empty
    } finally {
      setItemsLoading(false);
    }
  };

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (tab) params.append('status', tab);
      const res  = await fetch(`${API}/v1/seller/orders?${params}`, {
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
  }, [tab, page]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  // Auto-refresh orders every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchOrders();
    }, 30000); // 30 seconds
    
    return () => clearInterval(interval);
  }, [fetchOrders]);

  // Handle highlight parameter from dashboard
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    if (highlightId && orders.length > 0) {
      const order = orders.find(o => o.id === highlightId);
      if (order) {
        openDetail(order);
        // Clear highlight parameter after opening
        window.history.replaceState({}, '', '/seller/orders');
      }
    }
  }, [orders, searchParams]);

  const confirmReturnReceived = async (orderId) => {
    setUpdating(true);
    try {
      const res  = await fetch(`${API}/v1/seller/orders/${orderId}/confirm-return-received`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi cập nhật');
      showToast('success', `Đã xác nhận nhận lại hàng!`);
      setDetail(null);
      fetchOrders();
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setUpdating(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  // Status flow indicator
  const StatusFlow = ({ current }) => {
    const FLOW = ['CREATED', 'PAID', 'SHIPPED', 'DELIVERED', 'SETTLED'];
    if (current === 'CANCELLED') {
      return <span className="s-badge badge-danger"><i className="las la-times-circle"></i> Đã hủy</span>;
    }
    if (['RETURN_REQUESTED', 'RETURN_IN_TRANSIT', 'RETURNED'].includes(current)) {
      return <span className="s-badge badge-warning"><i className="las la-undo"></i> {STATUS_META[current]?.text}</span>;
    }
    const idx = FLOW.indexOf(current);
    return (
      <div className="status-flow">
        {FLOW.map((s, i) => (
          <span key={s} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <span className={`s-step${i < idx ? ' done' : i === idx ? ' current' : ''}`}>
              {i < idx ? <i className="las la-check-circle"></i> : null} {STATUS_META[s]?.text}
            </span>
            {i < FLOW.length - 1 && <span className="s-step-arrow">›</span>}
          </span>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="s-page-header">
        <h1>Quản lý đơn hàng</h1>
        <small><a href="/seller/dashboard">Trang chủ</a> / Đơn hàng</small>
      </div>

      <div className="s-page-content">
        {toast && (
          <div className={`s-toast ${toast.type}`}>
            <i className={`las la-${toast.type === 'success' ? 'check-circle' : 'exclamation-circle'}`}></i>
            {toast.msg}
          </div>
        )}

        {/* Filter tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:'1rem', flexWrap:'wrap' }}>
          {TABS.map(t => (
            <button key={t.value} onClick={() => { setTab(t.value); setPage(1); }}
              style={{
                padding: '6px 14px', borderRadius: 20, border: 'none', cursor:'pointer',
                fontSize: '.8rem', fontWeight: 500,
                background: tab === t.value ? '#22BAA0' : '#fff',
                color: tab === t.value ? '#fff' : '#555',
                boxShadow: '0 1px 4px rgba(0,0,0,.08)',
              }}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="s-records">
          <div className="s-record-header">
            <h3><i className="las la-shopping-bag" style={{ marginRight:6 }}></i>
              {tab ? STATUS_META[tab]?.text : 'Tất cả đơn hàng'} ({total})
            </h3>
          </div>

          <div className="s-table-wrap">
            <table className="s-table">
              <thead>
                <tr>
                  <th>#ID</th>
                  <th>Khách hàng</th>
                  <th>Địa chỉ giao</th>
                  <th>Tổng tiền</th>
                  <th>Thanh toán</th>
                  <th>Trạng thái</th>
                  <th>Ngày đặt</th>
                  <th style={{ width:130 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign:'center', padding:'2.5rem', color:'#22BAA0' }}>
                    <i className="las la-spinner la-spin" style={{ fontSize:'2rem' }}></i>
                  </td></tr>
                ) : orders.length === 0 ? (
                  <tr><td colSpan={8} className="s-empty">
                    <i className="las la-inbox"></i> Không có đơn hàng nào
                  </td></tr>
                ) : orders.map(o => {
                  const { cls, text } = STATUS_META[o.status] || { cls:'badge-grey', text: o.status };
                  const addr = [o.shippingaddressline1, o.shippingdistrict, o.shippingcity].filter(Boolean).join(', ');
                  return (
                    <tr key={o.id}
                      style={{ cursor: 'pointer', transition: 'background-color 0.2s ease' }}
                      title="Click để xem chi tiết đơn hàng"
                      onMouseEnter={(e) => e.target.style.backgroundColor = '#f8f9fa'}
                      onMouseLeave={(e) => e.target.style.backgroundColor = ''}
                      onClick={() => openDetail(o)}>
                      <td style={{ fontFamily:'monospace', fontSize:'.73rem', color:'#999' }}>
                        {String(o.id).slice(0,8)}…
                      </td>
                      <td>
                        <div className="s-client">
                          <div className="s-client-av">{(o.buyer_name || 'K').charAt(0).toUpperCase()}</div>
                          <div className="s-client-info">
                            <h4>{o.buyer_name || 'Khách hàng'}</h4>
                            <small>{o.buyer_phone || o.buyer_email || '—'}</small>
                          </div>
                        </div>
                      </td>
                      <td style={{ maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'#666', fontSize:'.78rem' }}>
                        {addr || '—'}
                      </td>
                      <td style={{ fontWeight:600, color:'#22BAA0', whiteSpace:'nowrap' }}>
                        {fmtVnd(o.total_amount)}
                      </td>
                      <td style={{ fontSize:'.78rem', color:'#555' }}>{o.paymentmethod || '—'}</td>
                      <td>
                        <span className={`s-badge ${cls}`}>{text}</span>
                        {String(o.paymentmethod || '').toUpperCase() === 'COD' && (
                          <div style={{ marginTop: 4, fontSize: '.72rem', color: '#8a6d3b' }}>
                            COD: {COD_STATUS_LABEL[o.codstatus] || o.codstatus || 'Chưa thu tiền'}
                          </div>
                        )}
                      </td>
                      <td style={{ color:'#999', fontSize:'.78rem', whiteSpace:'nowrap' }}>
                        {new Date(o.created_at).toLocaleDateString('vi-VN')}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="s-actions">
                          <span className="s-action-btn" title="Chi tiết" onClick={() => openDetail(o)}>
                            <i className="las la-eye"></i>
                          </span>
                          {o.status === 'RETURN_IN_TRANSIT' && (
                            <span className="s-action-btn" title="Xác nhận nhận lại hàng"
                              style={{ background:'#e5f8ed', borderColor:'#22BAA0', color:'#22BAA0' }}
                              onClick={() => confirmReturnReceived(o.id)}>
                              <i className="las la-check"></i>
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="s-table-foot">
            <span>Hiển thị {total === 0 ? 0 : Math.min((page-1)*LIMIT+1, total)}–{Math.min(page*LIMIT, total)} / {total} đơn</span>
            <div style={{ display:'flex', gap:6 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p-1)}
                style={{ padding:'3px 10px', border:'1px solid #ddd', borderRadius:5, cursor: page<=1?'not-allowed':'pointer', background:'#fff', color:'#555' }}>
                ‹ Trước
              </button>
              <span style={{ padding:'3px 10px', background:'#22BAA0', color:'#fff', borderRadius:5 }}>{page}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p+1)}
                style={{ padding:'3px 10px', border:'1px solid #ddd', borderRadius:5, cursor: page>=totalPages?'not-allowed':'pointer', background:'#fff', color:'#555' }}>
                Sau ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* DETAIL MODAL */}
      {detail && (() => {
        const { cls, text } = STATUS_META[detail.status] || { cls:'badge-grey', text: detail.status };
        const addr = [detail.shippingaddressline1, detail.shippingaddressline2, detail.shippingward, detail.shippingdistrict, detail.shippingcity].filter(Boolean).join(', ');
        return (
          <div className="s-modal-overlay" onClick={e => e.target === e.currentTarget && setDetail(null)}>
            <div className="s-modal s-modal-lg">
              <div className="s-modal-head">
                <h3><i className="las la-receipt" style={{ marginRight:6 }}></i>Chi tiết đơn hàng</h3>
                <button className="s-modal-close" onClick={() => setDetail(null)}>✕</button>
              </div>
              <div className="s-modal-body">
                {/* status flow */}
                <StatusFlow current={detail.status} />
                <hr style={{ margin:'.7rem 0', border:'none', borderTop:'1px solid #f0f0f0' }} />

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1rem' }}>
                  <div>
                    <div style={{ fontSize:'.75rem', color:'#999', marginBottom:3 }}>Mã đơn hàng</div>
                    <div style={{ fontFamily:'monospace', fontSize:'.82rem' }}>{detail.id}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'.75rem', color:'#999', marginBottom:3 }}>Ngày đặt</div>
                    <div style={{ fontSize:'.85rem' }}>{new Date(detail.created_at).toLocaleString('vi-VN')}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'.75rem', color:'#999', marginBottom:3 }}>Khách hàng</div>
                    <div style={{ fontWeight:500 }}>{detail.buyer_name || '—'}</div>
                    <small style={{ color:'#999' }}>{detail.buyer_email}</small>
                  </div>
                  <div>
                    <div style={{ fontSize:'.75rem', color:'#999', marginBottom:3 }}>Số điện thoại</div>
                    <div>{detail.buyer_phone || detail.shippingphone || '—'}</div>
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <div style={{ fontSize:'.75rem', color:'#999', marginBottom:3 }}>Địa chỉ giao hàng</div>
                    <div style={{ fontSize:'.84rem' }}>{addr || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'.75rem', color:'#999', marginBottom:3 }}>Phương thức TT</div>
                    <div>{detail.paymentmethod || '—'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize:'.75rem', color:'#999', marginBottom:3 }}>Trạng thái</div>
                    <span className={`s-badge ${cls}`}>{text}</span>
                    {String(detail.paymentmethod || '').toUpperCase() === 'COD' && (
                      <div style={{ marginTop: 6, fontSize: '.78rem', color: '#8a6d3b' }}>
                        COD: {COD_STATUS_LABEL[detail.codstatus] || detail.codstatus || 'Chưa thu tiền'}
                      </div>
                    )}
                  </div>
                </div>

                <hr style={{ border:'none', borderTop:'1px solid #f0f0f0', margin:'.5rem 0' }} />

                {/* PRODUCT ITEMS */}
                <div style={{ marginBottom:'1rem' }}>
                  <div style={{ fontWeight:600, fontSize:'.85rem', marginBottom:'.6rem', color:'#333' }}>
                    Sản phẩm trong đơn
                  </div>
                  {itemsLoading ? (
                    <div style={{ textAlign:'center', padding:'1rem', color:'#22BAA0' }}>
                      <i className="las la-spinner la-spin" style={{ fontSize:'1.5rem' }}></i>
                    </div>
                  ) : items.length === 0 ? (
                    <div style={{ color:'#999', fontSize:'.82rem' }}>Không có sản phẩm</div>
                  ) : (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      {items.map((item, i) => (
                        <div key={i} style={{ display:'flex', alignItems:'center', gap:12, background:'#fafafa', borderRadius:8, padding:'8px 10px', border:'1px solid #f0f0f0' }}>
                          {item.image ? (
                            <img src={item.image} alt={item.product_name} style={{ width:56, height:56, objectFit:'cover', borderRadius:6, flexShrink:0, border:'1px solid #eee' }} />
                          ) : (
                            <div style={{ width:56, height:56, background:'#eee', borderRadius:6, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', color:'#bbb' }}>
                              <i className="las la-image" style={{ fontSize:'1.4rem' }}></i>
                            </div>
                          )}
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontWeight:500, fontSize:'.85rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.product_name}</div>
                            {item.variant_name && <div style={{ fontSize:'.75rem', color:'#888' }}>{item.variant_name}</div>}
                            <div style={{ fontSize:'.78rem', color:'#22BAA0', fontWeight:600, marginTop:2 }}>
                              {fmtVnd(item.promotional_price || item.price)}
                            </div>
                          </div>
                          <div style={{ flexShrink:0, textAlign:'center' }}>
                            <div style={{ fontWeight:700, fontSize:'1rem' }}>x{item.quantity}</div>
                            <div style={{ fontSize:'.72rem', color:'#999' }}>SL</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <hr style={{ border:'none', borderTop:'1px solid #f0f0f0', margin:'.5rem 0' }} />
                {(() => {
                  // Debug logging to see what data we have
                  console.log('Coupon Debug Data:', {
                    shop_discount: detail.shop_discount,
                    shop_discount_type: typeof detail.shop_discount,
                    platform_discount: detail.platform_discount,
                    platform_discount_type: typeof detail.platform_discount,
                    shop_coupon_code: detail.shop_coupon_code,
                    platform_coupon_code: detail.platform_coupon_code,
                    condition: ((Number(detail.shop_discount) || 0) > 0 || (Number(detail.platform_discount) || 0) > 0)
                  });
                  
                  return ((Number(detail.shop_discount) || 0) > 0 || (Number(detail.platform_discount) || 0) > 0) ? (
                    <>
                      {(Number(detail.shop_discount) || 0) > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.5rem 0' }}>
                          <span style={{ color:'#555', fontSize:'.85rem' }}>
                            Mã shop: {detail.shop_coupon_code}
                            {detail.shop_coupon_description && (
                              <span style={{ color:'#999', marginLeft:4 }}>({detail.shop_coupon_description})</span>
                            )}
                          </span>
                          <span style={{ color:'#e74c3c' }}>- {fmtVnd(Number(detail.shop_discount) || 0)}</span>
                        </div>
                      )}
                      {(Number(detail.platform_discount) || 0) > 0 && (
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.5rem 0' }}>
                          <span style={{ color:'#555', fontSize:'.85rem' }}>
                            Mã platform: {detail.platform_coupon_code}
                            {detail.platform_coupon_description && (
                              <span style={{ color:'#999', marginLeft:4 }}>({detail.platform_coupon_description})</span>
                            )}
                          </span>
                          <span style={{ color:'#e74c3c' }}>- {fmtVnd(Number(detail.platform_discount) || 0)}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.5rem 0' }}>
                      <span style={{ color:'#555', fontSize:'.85rem' }}>Giảm giá</span>
                      <span style={{ color:'#999' }}>—</span>
                    </div>
                  );
                })()}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'.4rem 0', fontWeight:700, fontSize:'1rem' }}>
                  <span>Tổng thanh toán</span>
                  <span style={{ color:'#22BAA0' }}>{fmtVnd(detail.total_amount)}</span>
                </div>
              </div>
              <div className="s-modal-foot">
                <button className="btn-primary" style={{ background:'#eee', color:'#555' }} onClick={() => setDetail(null)}>Đóng</button>
                {detail.status === 'RETURN_IN_TRANSIT' && (
                  <button className="btn-primary" onClick={() => confirmReturnReceived(detail.id)} disabled={updating}>
                    {updating
                      ? <><i className="las la-spinner la-spin"></i> Đang cập nhật…</>
                      : <><i className="las la-check"></i> Xác nhận nhận lại hàng</>}
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
