'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';

const STATUS_CONFIG = {
  CREATED:           { text: 'Chờ xác nhận TT', color: '#f59e0b', bg: '#fffbeb', icon: 'la-clock' },
  PAID:              { text: 'Đã thanh toán',    color: '#3b82f6', bg: '#eff6ff', icon: 'la-check-circle' },
  SHIPPED:           { text: 'Đang giao hàng',   color: '#f97316', bg: '#fff7ed', icon: 'la-truck' },
  DELIVERED:         { text: 'Đã giao',           color: '#22c55e', bg: '#f0fdf4', icon: 'la-box' },
  SETTLED:           { text: 'Hoàn tất',          color: '#16a34a', bg: '#f0fdf4', icon: 'la-check-double' },
  CANCELLED:         { text: 'Đã hủy',            color: '#ef4444', bg: '#fef2f2', icon: 'la-times-circle' },
  RETURN_REQUESTED:  { text: 'Yêu cầu hoàn',     color: '#a855f7', bg: '#faf5ff', icon: 'la-undo' },
  RETURN_IN_TRANSIT: { text: 'Đang hoàn',         color: '#f97316', bg: '#fff7ed', icon: 'la-sync' },
  RETURNED:          { text: 'Đã hoàn',           color: '#06b6d4', bg: '#ecfeff', icon: 'la-check' },
};

// Luồng PREPAID: CREATED → PAID → SHIPPED → DELIVERED → SETTLED
const PREPAID_FLOW = ['CREATED', 'PAID', 'SHIPPED', 'DELIVERED', 'SETTLED'];

const COD_STATUS_LABEL = {
  NOT_COLLECTED: 'Khởi tạo ban đầu (chưa thu tiền)',
  PENDING_REMITTANCE: 'Shipper đã thu tiền của khách, đang giữ tiền',
  REMITTED: 'Sàn xác nhận đã nhận được tiền nộp về từ Shipper',
};

const fmt = (v) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(v || 0);
const fmtDate = (d) => d ? new Date(d).toLocaleString('vi-VN') : '—';

export default function AdminOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [order, setOrder]   = useState(null);
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);

  const fetchOrder = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/v1/admin/orders/' + id, {
        headers: { Authorization: getAuthHeader() }
      });
      setOrder(res.data.order);
      setItems(res.data.items || []);
    } catch (e) {
      const detail = e.response?.data?.detail || e.message || 'Không thể tải thông tin đơn hàng';
      setError(detail);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchOrder(); }, [fetchOrder]);

  const confirmAction = (endpoint, confirmMsg, successMsg, isDestructive = false) => {
    setConfirmDialog({ endpoint, confirmMsg, successMsg, isDestructive });
  };

  const doAction = async (endpoint, successMsg) => {
    setActionLoading(true);
    setMessage(null);
    try {
      const res = await axios.post(`/v1/admin/orders/${id}/${endpoint}`, {}, {
        headers: { Authorization: getAuthHeader() }
      });
      setMessage({ type: 'success', text: res.data?.message || successMsg });
      fetchOrder();
    } catch (e) {
      setMessage({ type: 'error', text: e.response?.data?.detail || 'Thao tác thất bại' });
    } finally {
      setActionLoading(false);
      setConfirmDialog(null);
    }
  };

  if (loading) return (
    <div style={{ padding: 60, textAlign: 'center', color: '#22BAA0' }}>
      <i className="las la-spinner" style={{ fontSize: '2.5rem' }}></i>
      <p style={{ color: '#888', marginTop: 12 }}>Đang tải đơn hàng...</p>
    </div>
  );

  if (error) return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ color: '#ef4444', marginBottom: 16, fontSize: '1rem' }}><i className="las la-exclamation-triangle" style={{ marginRight: 6 }}></i>{error}</div>
      <button onClick={() => router.back()} style={btnOutline}>← Quay lại</button>
    </div>
  );

  if (!order) return null;

  const statusCfg = STATUS_CONFIG[order.status] || { text: order.status, color: '#888', bg: '#f5f5f5', icon: 'la-circle' };
  const pm = (order.paymentmethod || '').toUpperCase();
  const isPrepaid = pm === 'PREPAID';
  const isCOD = pm === 'COD';

  // Tính step hiện tại trong flow PREPAID
  const currentStep = PREPAID_FLOW.indexOf(order.status);
  const isCancelled = order.status === 'CANCELLED';

  // Điều kiện hiển thị nút hành động
  const canConfirmPayment = order.status === 'CREATED' && isPrepaid;
  const canPayout = order.status === 'DELIVERED';
  const canCancel = ['CREATED', 'PAID'].includes(order.status);

  return (
    <>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .admin-sidebar, .admin-header, .admin-sidebar-toggle { display: none !important; }
          .admin-main-content { margin-left: 0 !important; }
        }
        .od-card { background:#fff; border-radius:12px; border:1px solid #e5e7eb; padding:20px; margin-bottom:16px; }
        .od-card h3 { font-size:.95rem; font-weight:700; color:#111; margin:0 0 14px; padding-bottom:10px; border-bottom:1px solid #f0f0f0; display:flex; align-items:center; gap:8px; }
        .od-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
        .od-row { display:flex; flex-direction:column; gap:3px; }
        .od-label { font-size:.72rem; color:#6b7280; text-transform:uppercase; font-weight:600; letter-spacing:.4px; }
        .od-value { font-size:.9rem; color:#111; font-weight:500; }
        .pt { width:100%; border-collapse:collapse; }
        .pt th { background:#f9fafb; padding:10px 12px; text-align:left; font-size:.8rem; color:#6b7280; font-weight:600; border-bottom:2px solid #e5e7eb; }
        .pt td { padding:12px; border-bottom:1px solid #f3f4f6; font-size:.9rem; vertical-align:middle; }
        .pt tr:last-child td { border-bottom:none; }
        .pimg { width:52px; height:52px; object-fit:cover; border-radius:8px; border:1px solid #e5e7eb; }
        .action-btn { padding:10px 22px; border-radius:8px; border:none; font-weight:700; cursor:pointer; font-size:.88rem; display:inline-flex; align-items:center; gap:7px; transition:opacity .15s; }
        .action-btn:disabled { opacity:.55; cursor:not-allowed; }
      `}</style>

      <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>

        {/* ── Header ── */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
          <button onClick={() => router.back()} style={btnOutline}>← Quay lại</button>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#111' }}>Chi tiết đơn hàng</h1>
            <div style={{ color: '#6b7280', fontSize: '.82rem', marginTop: 2, fontFamily: 'monospace' }}>{order.id}</div>
          </div>
          <span style={{ padding: '6px 16px', borderRadius: 20, fontWeight: 700, fontSize: '.85rem', color: statusCfg.color, background: statusCfg.bg }}>
            <i className={`las ${statusCfg.icon}`} style={{ marginRight: 5 }}></i>{statusCfg.text}
          </span>
          <button onClick={() => window.print()} style={{ ...btnOutline, borderColor: '#22BAA0', color: '#22BAA0' }}>
            <i className="las la-print" style={{ marginRight: 5 }}></i>In đơn
          </button>
        </div>

        {/* ── Message ── */}
        {message && (
          <div className="no-print" style={{
            marginBottom: 16, padding: '12px 16px', borderRadius: 8,
            background: message.type === 'success' ? '#f0fdf4' : '#fef2f2',
            color: message.type === 'success' ? '#16a34a' : '#dc2626',
            border: '1px solid ' + (message.type === 'success' ? '#86efac' : '#fca5a5'),
            fontWeight: 600, fontSize: '.9rem',
          }}>
            <i className={`las ${message.type === 'success' ? 'la-check-circle' : 'la-times-circle'}`} style={{ marginRight: 6 }}></i>{message.text}
          </div>
        )}

        {/* ── TIMELINE LUỒNG PREPAID ────────────────────────────────── */}
        {!isCancelled && isPrepaid && (
          <div className="od-card no-print" style={{ marginBottom: 16 }}>
            <h3><i className="las la-stream"></i> Tiến trình đơn hàng (PREPAID)</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 0, overflowX: 'auto', paddingBottom: 4 }}>
              {PREPAID_FLOW.map((step, idx) => {
                const done   = currentStep > idx;
                const active = currentStep === idx;
                const cfg = STATUS_CONFIG[step];
                return (
                  <div key={step} style={{ display: 'flex', alignItems: 'center', flex: idx < PREPAID_FLOW.length - 1 ? 1 : 'none', minWidth: 0 }}>
                    {/* Step node */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, minWidth: 90 }}>
                      <div style={{
                        width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '1.1rem',
                        background: done ? '#22BAA0' : active ? cfg.bg : '#f3f4f6',
                        border: `2px solid ${done ? '#22BAA0' : active ? cfg.color : '#e5e7eb'}`,
                        color: done ? '#fff' : active ? cfg.color : '#9ca3af',
                        fontWeight: 700, transition: 'all .3s',
                        boxShadow: active ? `0 0 0 4px ${cfg.bg}` : 'none',
                      }}>
                        {done ? <i className="las la-check"></i> : <i className={`las ${cfg.icon}`}></i>}
                      </div>
                      <span style={{
                        fontSize: '.72rem', fontWeight: active ? 700 : 500, textAlign: 'center',
                        color: done ? '#22BAA0' : active ? cfg.color : '#9ca3af',
                        whiteSpace: 'nowrap',
                      }}>
                        {cfg.text}
                      </span>
                    </div>
                    {/* Connector */}
                    {idx < PREPAID_FLOW.length - 1 && (
                      <div style={{
                        flex: 1, height: 3, margin: '0 4px', marginBottom: 22,
                        background: done ? '#22BAA0' : '#e5e7eb',
                        borderRadius: 4, minWidth: 20, transition: 'background .3s',
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── ACTION BUTTONS ─────────────────────────────────────────── */}
        {!isCancelled && (
          <div className="od-card no-print" style={{ marginBottom: 16 }}>
            <h3><i className="las la-bolt"></i> Hành động</h3>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>

              {/* Bước 2: Admin xác nhận thanh toán PREPAID */}
              {canConfirmPayment && (
                <button
                  className="action-btn"
                  disabled={actionLoading}
                  onClick={() => confirmAction('confirm-payment', 'Xác nhận đã nhận được tiền từ khách hàng?', 'Đã xác nhận thanh toán')}
                  style={{ background: '#3b82f6', color: '#fff' }}
                >
                  <i className="las la-check-circle"></i> Xác nhận thanh toán (CREATED → PAID)
                </button>
              )}

              {/* Bước 5: Admin thanh toán cho Shop */}
              {canPayout && (
                <button
                  className="action-btn"
                  disabled={actionLoading}
                  onClick={() => confirmAction('payout', 'Xác nhận thanh toán cho Shop? Đơn hàng sẽ kết thúc.', 'Đã thanh toán cho Shop')}
                  style={{ background: '#16a34a', color: '#fff' }}
                >
                  <i className="las la-money-bill-wave"></i> Thanh toán cho Shop (DELIVERED → SETTLED)
                </button>
              )}

              {/* Trạng thái SETTLED - hoàn tất */}
              {order.status === 'SETTLED' && (
                <div style={{ padding: '10px 18px', borderRadius: 8, background: '#f0fdf4', color: '#16a34a', fontWeight: 700, fontSize: '.88rem', border: '1px solid #86efac' }}>
                  <i className="las la-check-double"></i> Đơn hàng đã hoàn tất - Shop đã được thanh toán
                </div>
              )}

              {/* Trạng thái chờ Shipper */}
              {order.status === 'PAID' && (
                <div style={{ padding: '10px 18px', borderRadius: 8, background: '#eff6ff', color: '#3b82f6', fontWeight: 600, fontSize: '.88rem', border: '1px solid #bfdbfe' }}>
                  🚚 Đợi Shipper lấy hàng (PAID → SHIPPED)
                </div>
              )}

              {order.status === 'SHIPPED' && (
                <div style={{ padding: '10px 18px', borderRadius: 8, background: '#fff7ed', color: '#f97316', fontWeight: 600, fontSize: '.88rem', border: '1px solid #fed7aa' }}>
                  📦 Đang giao - Đợi Shipper xác nhận giao thành công (SHIPPED → DELIVERED)
                </div>
              )}

              {/* Hủy đơn */}
              {canCancel && (
                <button
                  className="action-btn"
                  disabled={actionLoading}
                  onClick={() => confirmAction('cancel', 'Xác nhận hủy đơn hàng này? Thao tác này không thể hoàn tác.', 'Đã hủy đơn hàng', true)}
                  style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fca5a5', marginLeft: 'auto' }}
                >
                  <i className="las la-times"></i> Hủy đơn
                </button>
              )}
            </div>

            {/* Ghi chú luồng */}
            {isPrepaid && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: '.8rem', color: '#6b7280', borderLeft: '3px solid #22BAA0' }}>
                <strong>Luồng PREPAID:</strong> Admin xác nhận TT → Shipper lấy hàng → Shipper giao xong → Admin thanh toán Shop
              </div>
            )}
            {isCOD && (
              <div style={{ marginTop: 14, padding: '10px 14px', background: '#f8fafc', borderRadius: 8, fontSize: '.8rem', color: '#6b7280', borderLeft: '3px solid #f59e0b' }}>
                <strong>Luồng COD:</strong> Shipper lấy hàng → Shipper thu tiền & giao → Shipper nộp tiền → Admin thanh toán Shop
              </div>
            )}
          </div>
        )}

        {/* ── GRID THÔNG TIN ────────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* Thông tin đơn */}
          <div className="od-card">
            <h3><i className="las la-file-alt"></i> Thông tin đơn hàng</h3>
            <div className="od-grid">
              <div className="od-row"><span className="od-label">Mã đơn</span><span className="od-value" style={{ fontFamily: 'monospace', fontSize: '.78rem' }}>{order.id}</span></div>
              <div className="od-row"><span className="od-label">Trạng thái</span><span className="od-value" style={{ color: statusCfg.color, fontWeight: 700 }}><i className={`las ${statusCfg.icon}`} style={{ marginRight: 4 }}></i>{statusCfg.text}</span></div>
              <div className="od-row"><span className="od-label">Ngày tạo</span><span className="od-value">{fmtDate(order.created_at)}</span></div>
              <div className="od-row"><span className="od-label">Cập nhật</span><span className="od-value">{fmtDate(order.updated_at)}</span></div>
              <div className="od-row">
                <span className="od-label">Thanh toán</span>
                <span className="od-value">
                  <span style={{ padding: '2px 8px', borderRadius: 12, fontSize: '.75rem', fontWeight: 700, background: isPrepaid ? '#eff6ff' : '#fffbeb', color: isPrepaid ? '#3b82f6' : '#f59e0b' }}>
                    {order.paymentmethod}
                  </span>
                </span>
              </div>
              {isCOD && <div className="od-row"><span className="od-label">COD Status</span><span className="od-value">{COD_STATUS_LABEL[order.codstatus] || order.codstatus || '—'}</span></div>}
            </div>
            <div style={{ marginTop: 16, padding: 12, background: '#f9fafb', borderRadius: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#6b7280' }}>Tiền hàng:</span><span style={{ fontWeight: 600 }}>{fmt(order.price)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#6b7280' }}>Phí ship:</span><span style={{ fontWeight: 600 }}>{fmt(order.deliveryprice)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid #e5e7eb' }}>
                <span style={{ fontWeight: 700 }}>Tổng cộng:</span>
                <span style={{ fontWeight: 800, color: '#22BAA0', fontSize: '1.05rem' }}>{fmt(order.finalprice)}</span>
              </div>
            </div>
          </div>

          {/* Shop + Khách hàng */}
          <div className="od-card">
            <h3><i className="las la-store"></i> Shop</h3>
            <div className="od-grid" style={{ marginBottom: 16 }}>
              <div className="od-row"><span className="od-label">Tên shop</span><span className="od-value">{order.storename || '—'}</span></div>
              <div className="od-row"><span className="od-label">Mã shop</span><span className="od-value" style={{ fontFamily: 'monospace', fontSize: '.8rem' }}>{order.storeid || '—'}</span></div>
            </div>
            <h3 style={{ borderTop: '1px solid #f0f0f0', paddingTop: 12, marginTop: 4 }}><i className="las la-user"></i> Khách hàng</h3>
            <div className="od-grid">
              <div className="od-row"><span className="od-label">Họ tên</span><span className="od-value">{order.buyer_name || '—'}</span></div>
              <div className="od-row"><span className="od-label">Email</span><span className="od-value">{order.buyer_email || '—'}</span></div>
              <div className="od-row"><span className="od-label">SĐT</span><span className="od-value">{order.shippingphone || '—'}</span></div>
              <div className="od-row"><span className="od-label">Địa chỉ</span><span className="od-value">{[order.shippingaddressline1, order.shippingdistrict, order.shippingcity].filter(Boolean).join(', ') || '—'}</span></div>
            </div>
          </div>

          {/* Shipper */}
          <div className="od-card">
            <h3><i className="las la-truck"></i> Shipper</h3>
            {order.shipper_id ? (
              <div className="od-grid">
                <div className="od-row"><span className="od-label">Họ tên</span><span className="od-value">{order.shipper_name || '—'}</span></div>
                <div className="od-row"><span className="od-label">Email</span><span className="od-value">{order.shipper_email || '—'}</span></div>
                <div className="od-row"><span className="od-label">SĐT</span><span className="od-value">{order.shipper_phone || '—'}</span></div>
                <div className="od-row"><span className="od-label">Mã shipper</span><span className="od-value" style={{ fontFamily: 'monospace', fontSize: '.78rem' }}>{order.shipper_id}</span></div>
              </div>
            ) : (
              <div style={{ color: '#9ca3af', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>
                Chưa có shipper nhận đơn
              </div>
            )}
          </div>

          {/* Địa chỉ giao hàng */}
          <div className="od-card">
            <h3><i className="las la-map-marker-alt"></i> Địa chỉ giao hàng</h3>
            <div style={{ lineHeight: 2, color: '#374151' }}>
              <div><strong>Người nhận:</strong> {order.buyer_name || '—'}</div>
              <div><strong>SĐT:</strong> {order.shippingphone || '—'}</div>
              <div><strong>Địa chỉ:</strong> {order.shippingaddressline1 || '—'}</div>
              {order.shippingaddressline2 && <div><strong>Địa chỉ 2:</strong> {order.shippingaddressline2}</div>}
              <div><strong>Quận/Huyện:</strong> {order.shippingdistrict || '—'}</div>
              <div><strong>Tỉnh/TP:</strong> {order.shippingcity || '—'}</div>
            </div>
          </div>
        </div>

        {/* ── Sản phẩm ────────────────────────────────────────────────── */}
        <div className="od-card">
          <h3><i className="las la-shopping-bag"></i> Sản phẩm ({items.length})</h3>
          <div style={{ overflowX: 'auto' }}>
            <table className="pt">
              <thead>
                <tr>
                  <th style={{ width: 64 }}>Ảnh</th>
                  <th>Sản phẩm</th>
                  <th>Phân loại</th>
                  <th style={{ textAlign: 'right' }}>Đơn giá</th>
                  <th style={{ textAlign: 'center' }}>SL</th>
                  <th style={{ textAlign: 'right' }}>Thành tiền</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => {
                  const unitPrice = item.promotional_price || item.price || 0;
                  const total = unitPrice * (item.quantity || 1);
                  return (
                    <tr key={item.id || i}>
                      <td>
                        {item.image
                          ? <img src={item.image} alt={item.product_name} className="pimg" onError={(e) => { e.target.style.display = 'none'; }} />
                          : <div className="pimg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', color: '#ccc' }}></div>
                        }
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#111' }}>{item.product_name || 'Sản phẩm'}</div>
                        <div style={{ fontSize: '.78rem', color: '#9ca3af', fontFamily: 'monospace' }}>{item.product_id}</div>
                      </td>
                      <td style={{ color: '#6b7280' }}>{item.variant_name || '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {item.promotional_price && item.promotional_price < item.price ? (
                          <><div style={{ fontWeight: 600 }}>{fmt(item.promotional_price)}</div><div style={{ textDecoration: 'line-through', color: '#9ca3af', fontSize: '.8rem' }}>{fmt(item.price)}</div></>
                        ) : (
                          <div style={{ fontWeight: 600 }}>{fmt(item.price)}</div>
                        )}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600 }}>{item.quantity}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: '#22BAA0' }}>{fmt(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', padding: '12px', fontWeight: 600, color: '#6b7280', borderTop: '2px solid #e5e7eb' }}>Tổng tiền hàng:</td>
                  <td style={{ textAlign: 'right', padding: '12px', fontWeight: 800, borderTop: '2px solid #e5e7eb' }}>{fmt(order.price)}</td>
                </tr>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', padding: '4px 12px', color: '#6b7280' }}>Phí vận chuyển:</td>
                  <td style={{ textAlign: 'right', padding: '4px 12px' }}>{fmt(order.deliveryprice)}</td>
                </tr>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', padding: '12px', fontWeight: 800, color: '#111', borderTop: '1px solid #e5e7eb', fontSize: '1rem' }}>TỔNG CỘNG:</td>
                  <td style={{ textAlign: 'right', padding: '12px', fontWeight: 900, color: '#22BAA0', fontSize: '1.1rem', borderTop: '1px solid #e5e7eb' }}>{fmt(order.finalprice)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Print footer */}
        <div style={{ display: 'none' }} className="print-ftr">
          <style>{`.print-ftr{display:block!important} @media screen{.print-ftr{display:none!important}}`}</style>
          <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid #ddd', color: '#888', fontSize: '.8rem' }}>
            Báo cáo được tạo bởi QnT Admin | {new Date().toLocaleString('vi-VN')}
          </div>
        </div>

        {/* Modal Xác Nhận (Confirm Dialog) */}
        {confirmDialog && (
          <div className="no-print" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, transition: 'all 0.3s' }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: 24, width: '100%', maxWidth: 420, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', animation: 'fadeIn 0.2s ease-out' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{ width: 50, height: 50, borderRadius: '50%', background: confirmDialog.isDestructive ? '#fef2f2' : '#eff6ff', color: confirmDialog.isDestructive ? '#ef4444' : '#3b82f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.8rem', flexShrink: 0 }}>
                  <i className={`las ${confirmDialog.isDestructive ? 'la-exclamation-triangle' : 'la-question-circle'}`}></i>
                </div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#111', fontWeight: 700 }}>Xác nhận thao tác</h3>
              </div>
              
              <p style={{ color: '#4b5563', fontSize: '.95rem', marginBottom: 28, lineHeight: 1.6, paddingLeft: 64 }}>
                {confirmDialog.confirmMsg}
              </p>
              
              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button 
                  onClick={() => setConfirmDialog(null)}
                  disabled={actionLoading}
                  style={{ ...btnOutline, padding: '9px 18px', border: '1px solid #d1d5db', color: '#374151' }}
                >
                  Hủy bỏ
                </button>
                <button 
                  onClick={() => doAction(confirmDialog.endpoint, confirmDialog.successMsg)}
                  disabled={actionLoading}
                  style={{ ...btnOutline, padding: '9px 18px', border: 'none', background: confirmDialog.isDestructive ? '#ef4444' : '#22BAA0', color: '#fff' }}
                >
                  {actionLoading ? <i className="las la-spinner la-spin"></i> : 'Xác nhận'}
                </button>
              </div>
            </div>
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </div>
        )}
      </div>
    </>
  );
}

const btnOutline = {
  padding: '8px 16px', borderRadius: 8, border: '1px solid #ddd',
  background: '#fff', cursor: 'pointer', fontSize: '.88rem', fontWeight: 500,
};
