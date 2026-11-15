'use client';
import { useState, useEffect } from 'react';
import { getAuthHeader } from '@/lib/auth';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

const EMPTY = {
  code: '', description: '', discounttype: 'PERCENTAGE', discountvalue: '',
  minordervalue: '', maxdiscount: '', startdate: '', enddate: '', usagelimit: '', isactive: true
};

const thStyle = { padding: '12px 16px', textAlign: 'left', fontWeight: 600, fontSize: '.82rem', color: '#555', whiteSpace: 'nowrap' };
const tdStyle = { padding: '12px 16px', fontSize: '.88rem', color: '#333', verticalAlign: 'middle' };

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}
function toInputDate(d) {
  if (!d) return '';
  return new Date(d).toISOString().slice(0, 16);
}
function fmtPrice(v) {
  if (!v && v !== 0) return '—';
  return Number(v).toLocaleString('vi-VN') + '₫';
}

export default function AdminCouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: getAuthHeader() });

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3000); };

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/v1/coupons`, { headers: headers() });
      const d = await r.json();
      setCoupons(Array.isArray(d) ? d : []);
    } catch { setCoupons([]); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => { setForm(EMPTY); setEditId(null); setError(''); setShowForm(true); };
  const openEdit = (c) => {
    setForm({
      ...c,
      startdate: toInputDate(c.startdate),
      enddate: toInputDate(c.enddate),
      discountvalue: String(c.discountvalue),
      minordervalue: c.minordervalue || '',
      maxdiscount: c.maxdiscount || '',
      usagelimit: c.usagelimit || ''
    });
    setEditId(c.id); setError(''); setShowForm(true);
  };

  const handleSave = async () => {
    setSaving(true); setError('');
    try {
      const url = editId ? `${API}/v1/coupons/${editId}` : `${API}/v1/coupons`;
      const method = editId ? 'PUT' : 'POST';
      const r = await fetch(url, { method, headers: headers(), body: JSON.stringify(form) });
      const d = await r.json();
      if (!r.ok) { setError(d.detail || 'Lỗi'); setSaving(false); return; }
      setShowForm(false);
      showToast('success', editId ? 'Đã cập nhật coupon' : 'Đã tạo coupon mới');
      load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm('Xóa coupon này?')) return;
    await fetch(`${API}/v1/coupons/${id}`, { method: 'DELETE', headers: headers() });
    showToast('success', 'Đã xóa');
    load();
  };

  const toggle = async (c) => {
    await fetch(`${API}/v1/coupons/${c.id}`, {
      method: 'PUT', headers: headers(),
      body: JSON.stringify({ ...c, isactive: !c.isactive, startdate: toInputDate(c.startdate), enddate: toInputDate(c.enddate) })
    });
    showToast('success', c.isactive ? 'Đã tắt coupon' : 'Đã bật coupon');
    load();
  };

  const now = new Date();
  const statusBadge = (c) => {
    let bg = '#22BAA0', label = 'Đang chạy';
    if (!c.isactive) { bg = '#aaa'; label = 'Tắt'; }
    else if (new Date(c.enddate) < now) { bg = '#e53935'; label = 'Hết hạn'; }
    else if (new Date(c.startdate) > now) { bg = '#fb8c00'; label = 'Chưa bắt đầu'; }
    return <span style={{ background: bg, color: '#fff', borderRadius: 4, padding: '3px 10px', fontSize: 11, fontWeight: 600 }}>{label}</span>;
  };

  const Field = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>{label}</label>
      {children}
    </div>
  );
  const inputStyle = { width: '100%', padding: '8px 12px', border: '1px solid #ddd', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' };

  return (
    <>
      {toast && (
        <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 9999, background: toast.type === 'success' ? '#22BAA0' : '#e74c3c', color: '#fff', padding: '12px 20px', borderRadius: 8, boxShadow: '0 4px 12px rgba(0,0,0,.15)', fontSize: '.9rem' }}>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: '24px 28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Coupon / Mã giảm giá</h2>
            <small style={{ color: '#999' }}>Trang chủ / Mã giảm giá</small>
          </div>
          <button onClick={openCreate}
            style={{ background: '#22BAA0', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <i className="las la-plus"></i> Tạo coupon mới
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Platform', count: coupons.filter(c => c.storeid === null).length, color: '#5c86b8' },
            { label: 'Shop', count: coupons.filter(c => c.storeid !== null).length, color: '#22BAA0' },
            { label: 'Đang chạy', count: coupons.filter(c => c.isactive && new Date(c.enddate) >= now && new Date(c.startdate) <= now).length, color: '#43a047' },
            { label: 'Hết hạn', count: coupons.filter(c => new Date(c.enddate) < now).length, color: '#e53935' },
          ].map(s => (
            <div key={s.label} style={{ background: '#fff', borderRadius: 10, padding: '14px 20px', boxShadow: '0 2px 8px rgba(0,0,0,.06)', flex: 1, borderTop: `3px solid ${s.color}` }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #f0f0f0' }}>
                <th style={thStyle}>Mã</th>
                <th style={thStyle}>Giảm</th>
                <th style={thStyle}>Tối đa</th>
                <th style={thStyle}>Đơn tối thiểu</th>
                <th style={thStyle}>Hiệu lực</th>
                <th style={thStyle}>Đã dùng</th>
                <th style={thStyle}>Loại</th>
                <th style={thStyle}>Trạng thái</th>
                <th style={thStyle}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '2.5rem', color: '#22BAA0' }}>
                  <i className="las la-spinner la-spin" style={{ fontSize: '2rem' }}></i>
                </td></tr>
              ) : coupons.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
                  <i className="las la-ticket-alt" style={{ fontSize: '2.5rem', display: 'block', marginBottom: 8 }}></i>
                  Chưa có coupon nào
                </td></tr>
              ) : coupons.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={tdStyle}><b style={{ fontFamily: 'monospace', fontSize: 13, letterSpacing: 1 }}>{c.code}</b></td>
                  <td style={tdStyle}><b style={{ color: '#e53935' }}>{c.discounttype === 'PERCENTAGE' ? `${c.discountvalue}%` : fmtPrice(c.discountvalue)}</b></td>
                  <td style={{ ...tdStyle, color: '#888', fontSize: 12 }}>{c.maxdiscount ? fmtPrice(c.maxdiscount) : '—'}</td>
                  <td style={{ ...tdStyle, fontSize: 12 }}>{fmtPrice(c.minordervalue)}</td>
                  <td style={{ ...tdStyle, fontSize: 11, color: '#666' }}>{formatDate(c.startdate)}<br />{formatDate(c.enddate)}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>{c.usedcount || 0}{c.usagelimit ? <span style={{ color: '#aaa' }}>/{c.usagelimit}</span> : ''}</td>
                  <td style={tdStyle}>
                    {c.storeid === null
                      ? <span style={{ background: '#e8f0fe', color: '#5c86b8', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>Platform</span>
                      : <span style={{ background: '#f1f8f6', color: '#22BAA0', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 600 }}>{c.store_name || `Shop #${c.storeid}`}</span>}
                  </td>
                  <td style={tdStyle}>{statusBadge(c)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button title="Sửa" onClick={() => openEdit(c)}
                        style={{ background: '#e8f0fe', color: '#5c86b8', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 13 }}>
                        <i className="las la-edit"></i>
                      </button>
                      <button title={c.isactive ? 'Tắt' : 'Bật'} onClick={() => toggle(c)}
                        style={{ background: c.isactive ? '#fff3e0' : '#f1f8f6', color: c.isactive ? '#fb8c00' : '#22BAA0', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 13 }}>
                        <i className={`las la-toggle-${c.isactive ? 'on' : 'off'}`}></i>
                      </button>
                      <button title="Xóa" onClick={() => handleDelete(c.id)}
                        style={{ background: '#fdecea', color: '#e53935', border: 'none', borderRadius: 6, padding: '5px 10px', cursor: 'pointer', fontSize: 13 }}>
                        <i className="las la-trash"></i>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: 16, width: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 40px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fafafa', borderRadius: '16px 16px 0 0' }}>
              <div>
                <h5 style={{ margin: 0, fontWeight: 700, fontSize: '1.05rem', color: '#1a1a2e' }}>{editId ? 'Chỉnh sửa coupon' : 'Tạo platform coupon mới'}</h5>
                <div style={{ fontSize: 12, color: '#999', marginTop: 3 }}>Áp dụng cho toàn bộ sàn</div>
              </div>
              <button onClick={() => setShowForm(false)} style={{ background: '#f0f0f0', border: 'none', width: 30, height: 30, borderRadius: '50%', cursor: 'pointer', color: '#666', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              {error && <div style={{ background: '#fdecea', color: '#e53935', padding: '10px 14px', borderRadius: 8, marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}><i className="las la-exclamation-circle"></i>{error}</div>}

              {/* Code + Description */}
              <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>Mã coupon *</label>
                  <input style={{ ...inputStyle, textTransform: 'uppercase', fontFamily: 'monospace', fontWeight: 700, letterSpacing: 1, fontSize: 14 }}
                    value={form.code} placeholder="VD: SALE50K" disabled={!!editId}
                    onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                    onBlur={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>Mô tả</label>
                  <input style={inputStyle} value={form.description || ''} placeholder="VD: Giảm 50k đơn từ 200k"
                    onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
              </div>

              {/* Discount type + value */}
              <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10 }}>Giá trị giảm</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>Loại giảm *</label>
                    <select style={inputStyle} value={form.discounttype} onChange={e => setForm(p => ({ ...p, discounttype: e.target.value }))}>
                      <option value="PERCENTAGE">Phần trăm (%)</option>
                      <option value="FIXED_AMOUNT">Số tiền cố định (₫)</option>
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>
                      Giá trị * {form.discounttype === 'PERCENTAGE' ? <span style={{ color: '#e53935' }}>(1–100%)</span> : <span style={{ color: '#e53935' }}>(₫)</span>}
                    </label>
                    <input style={inputStyle} type="number" min="0" max={form.discounttype === 'PERCENTAGE' ? 100 : undefined}
                      value={form.discountvalue}
                      placeholder={form.discounttype === 'PERCENTAGE' ? 'VD: 10 (tức 10%)' : 'VD: 50000'}
                      onChange={e => setForm(p => ({ ...p, discountvalue: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>Đơn tối thiểu (₫)</label>
                    <input style={inputStyle} type="number" min="0" value={form.minordervalue}
                      placeholder="VD: 100000 (100k)"
                      onChange={e => setForm(p => ({ ...p, minordervalue: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>
                      Giảm tối đa (₫) {form.discounttype === 'PERCENTAGE' && <span style={{ color: '#999', fontSize: 11 }}>(cap)</span>}
                    </label>
                    <input style={inputStyle} type="number" min="0" value={form.maxdiscount}
                      placeholder="VD: 50000 (bỏ trống = không giới hạn)"
                      onChange={e => setForm(p => ({ ...p, maxdiscount: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Date range */}
              <div style={{ background: '#f8f9fa', borderRadius: 10, padding: '14px 16px', marginBottom: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 10 }}>Thời gian hiệu lực</div>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>Bắt đầu *</label>
                    <input style={inputStyle} type="datetime-local" value={form.startdate}
                      onChange={e => setForm(p => ({ ...p, startdate: e.target.value }))} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>Kết thúc *</label>
                    <input style={inputStyle} type="datetime-local" value={form.enddate}
                      onChange={e => setForm(p => ({ ...p, enddate: e.target.value }))} />
                  </div>
                </div>
              </div>

              {/* Usage limit + active */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 4 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 5, color: '#444' }}>Giới hạn lượt dùng</label>
                  <input style={inputStyle} type="number" min="1" value={form.usagelimit}
                    placeholder="Bỏ trống = không giới hạn"
                    onChange={e => setForm(p => ({ ...p, usagelimit: e.target.value }))} />
                </div>
                {editId && (
                  <div style={{ paddingBottom: 2 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '9px 14px', border: `1.5px solid ${form.isactive ? '#22BAA0' : '#ddd'}`, borderRadius: 8, background: form.isactive ? '#f1faf8' : '#fafafa', fontSize: 13 }}>
                      <input type="checkbox" id="isactive-check" checked={!!form.isactive}
                        onChange={e => setForm(p => ({ ...p, isactive: e.target.checked }))} style={{ accentColor: '#22BAA0' }} />
                      <span style={{ fontWeight: 600, color: form.isactive ? '#22BAA0' : '#aaa' }}>{form.isactive ? 'Đang bật' : 'Đang tắt'}</span>
                    </label>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 24px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, justifyContent: 'flex-end', background: '#fafafa', borderRadius: '0 0 16px 16px' }}>
              <button onClick={() => setShowForm(false)}
                style={{ padding: '9px 20px', borderRadius: 8, border: '1px solid #ddd', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#555', fontWeight: 500 }}>
                Hủy
              </button>
              <button onClick={handleSave} disabled={saving}
                style={{ padding: '9px 28px', borderRadius: 8, border: 'none', background: '#22BAA0', color: '#fff', cursor: saving ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 700, opacity: saving ? .7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
                {saving ? <><i className="las la-spinner la-spin"></i> Đang lưu...</> : <><i className="las la-save"></i> Lưu coupon</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

