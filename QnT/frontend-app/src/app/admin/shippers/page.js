'use client';
import { useState, useEffect, useCallback } from 'react';
import { getAuthHeader } from '@/lib/auth';

const API = 'http://localhost:4000/api';

export default function AdminShippersPage() {
  const [shippers, setShippers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', phone: '' });
  const [editForm, setEditForm] = useState({ full_name: '', email: '', phone: '', password: '' });
  const [editingShipperId, setEditingShipperId] = useState(null);
  const [formErr, setFormErr] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchShippers = useCallback(async () => {
    setLoading(true);
    try {
      let url = `${API}/v1/admin/shippers`;
      if (search) {
        url += `?search=${encodeURIComponent(search)}`;
      }
      const res = await fetch(url, {
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Lỗi tải danh sách');
      setShippers(body.shippers || []);
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Search debounce
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Global search listener
  useEffect(() => {
    const handleGlobalSearch = (e) => setSearchInput(e.detail || '');
    if (typeof window !== 'undefined') window.addEventListener('adminGlobalSearch', handleGlobalSearch);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('adminGlobalSearch', handleGlobalSearch); };
  }, []);

  useEffect(() => { fetchShippers(); }, [fetchShippers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!form.email || !form.password || !form.full_name) {
      setFormErr('Vui lòng điền đầy đủ thông tin bắt buộc.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/v1/admin/shippers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Tạo thất bại');
      showToast('success', `Đã tạo tài khoản shipper: ${form.email}`);
      setShowModal(false);
      setForm({ email: '', password: '', full_name: '', phone: '' });
      fetchShippers();
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (shipper) => {
    try {
      const res = await fetch(`${API}/v1/admin/shippers/${shipper.id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Lỗi cập nhật');
      showToast('success', body.message);
      fetchShippers();
    } catch (e) {
      showToast('error', e.message);
    }
  };

  const handleEditOpen = (shipper) => {
    setEditingShipperId(shipper.id);
    setEditForm({
      full_name: `${shipper.firstname || ''} ${shipper.lastname || ''}`.trim(),
      email: shipper.email || '',
      phone: shipper.phone || '',
      password: ''
    });
    setShowEditModal(true);
    setFormErr('');
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editForm.full_name) {
      setFormErr('Tên đơn vị là bắt buộc');
      return;
    }
    setSubmitting(true);
    try {
      const payload = { display_name: editForm.full_name };
      if (editForm.password && editForm.password.trim()) {
        payload.password = editForm.password.trim();
        console.log('🔐 Password length:', payload.password.length);
      }

      console.log('📤 Sending payload:', { ...payload, password: payload.password ? '[$PASSWORD]' : 'none' });

      const res = await fetch(`${API}/v1/admin/shippers/${editingShipperId}/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Cập nhật thất bại');
      showToast('success', 'Cập nhật thông tin đơn vị vận chuyển thành công');
      setShowEditModal(false);
      setEditingShipperId(null);
      fetchShippers();
    } catch (e) {
      setFormErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? '#22BAA0' : '#e74c3c',
          color: '#fff', padding: '12px 20px', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,.15)', fontSize: '.9rem',
        }}>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Quản lý đơn vị vận chuyển</h2>
            <small style={{ color: '#999' }}>Trang chủ / Đơn vị vận chuyển</small>
          </div>
          <button
            onClick={() => { setShowModal(true); setFormErr(''); }}
            style={{
              background: '#22BAA0', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer',
              fontWeight: 600, fontSize: '.9rem', display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <i className="las la-plus"></i> Thêm đơn vị vận chuyển
          </button>
        </div>

        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #f0f0f0' }}>
                <th style={thStyle}>Họ tên</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Số điện thoại</th>
                <th style={thStyle}>Trạng thái</th>
                <th style={thStyle}>Ngày tạo</th>
                <th style={thStyle}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem', color: '#22BAA0' }}>
                  <i className="las la-spinner" style={{ fontSize: '2rem' }}></i>
                </td></tr>
              ) : shippers.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
                  <i className="las la-truck" style={{ fontSize: '2.5rem', display: 'block', marginBottom: 8 }}></i>
                  Chưa có đơn vị vận chuyển nào
                </td></tr>
              ) : shippers.map(s => (
                <tr key={s.id} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: '50%',
                        background: '#22BAA0', color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '.9rem', flexShrink: 0,
                      }}>
                        {(s.firstname || s.lastname || 'S').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontWeight: 600 }}>{`${s.firstname || ''} ${s.lastname || ''}`.trim() || '—'}</div>
                    </div>
                  </td>
                  <td style={tdStyle}>{s.email}</td>
                  <td style={tdStyle}>{s.phone || '—'}</td>
                  <td style={tdStyle}>
                    <span style={{
                      padding: '3px 10px', borderRadius: 20, fontSize: '.75rem', fontWeight: 600,
                      background: s.isactive ? '#e5f8f4' : '#fde8e8',
                      color: s.isactive ? '#22BAA0' : '#e74c3c',
                    }}>
                      {s.isactive ? 'Hoạt động' : 'Đã khóa'}
                    </span>
                  </td>
                  <td style={{ ...tdStyle, color: '#999', fontSize: '.8rem' }}>
                    {new Date(s.created_at).toLocaleDateString('vi-VN')}
                  </td>
                  <td style={tdStyle}>
                    <button
                      onClick={() => handleEditOpen(s)}
                      style={{
                        padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontSize: '.8rem', fontWeight: 600, marginRight: 6,
                        background: '#e8f0ff',
                        color: '#2980b9',
                      }}>
                      Chỉnh sửa
                    </button>
                    <button
                      onClick={() => handleToggle(s)}
                      style={{
                        padding: '5px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
                        fontSize: '.8rem', fontWeight: 600,
                        background: s.isactive ? '#fde8e8' : '#e5f8f4',
                        color: s.isactive ? '#e74c3c' : '#22BAA0',
                      }}>
                      {s.isactive ? 'Khóa' : 'Kích hoạt'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460,
            boxShadow: '0 20px 60px rgba(0,0,0,.2)', overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                <i className="las la-truck" style={{ marginRight: 8, color: '#22BAA0' }}></i>
                Thêm đơn vị vận chuyển
              </h3>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            <form onSubmit={handleCreate} style={{ padding: '20px 24px' }}>
              {formErr && (
                <div style={{ background: '#fde8e8', color: '#e74c3c', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '.85rem' }}>
                  {formErr}
                </div>
              )}
              <Field label="Tên đơn vị vận chuyển *" value={form.full_name} onChange={v => setForm(f => ({...f, full_name: v}))} placeholder="VD: GHN Express, GHTK..." />
              <Field label="Email *" type="email" value={form.email} onChange={v => setForm(f => ({...f, email: v}))} placeholder="shipper@email.com" />
              <Field label="Mật khẩu *" type="password" value={form.password} onChange={v => setForm(f => ({...f, password: v}))} placeholder="Tối thiểu 6 ký tự" />
              <Field label="Số điện thoại" value={form.phone} onChange={v => setForm(f => ({...f, phone: v}))} placeholder="0900000000" />
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #ddd', background: '#f8f9fa', cursor: 'pointer', fontWeight: 600 }}>
                  Hủy
                </button>
                <button type="submit" disabled={submitting}
                  style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#22BAA0', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  {submitting ? 'Đang tạo...' : 'Tạo tài khoản'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showEditModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={e => e.target === e.currentTarget && setShowEditModal(false)}>
          <div style={{
            background: '#fff', borderRadius: 14, width: '100%', maxWidth: 460,
            boxShadow: '0 20px 60px rgba(0,0,0,.2)', overflow: 'hidden',
          }}>
            <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
                <i className="las la-edit" style={{ marginRight: 8, color: '#2980b9' }}></i>
                Chỉnh sửa đơn vị vận chuyển
              </h3>
              <button onClick={() => setShowEditModal(false)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#999' }}>✕</button>
            </div>
            <form onSubmit={handleEditSubmit} style={{ padding: '20px 24px' }}>
              {formErr && (
                <div style={{ background: '#fde8e8', color: '#e74c3c', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '.85rem' }}>
                  {formErr}
                </div>
              )}
              <Field label="Tên đơn vị vận chuyển *" value={editForm.full_name} onChange={v => setEditForm(f => ({...f, full_name: v}))} placeholder="VD: GHN Express, GHTK..." />
              <Field label="Email" value={editForm.email} onChange={v => setEditForm(f => ({...f, email: v}))} placeholder="shipper@email.com" disabled />
              <Field label="Mật khẩu mới (không bắt buộc)" type="password" value={editForm.password} onChange={v => setEditForm(f => ({...f, password: v}))} placeholder="Để trống nếu không muốn thay đổi" />
              <Field label="Số điện thoại" value={editForm.phone} onChange={v => setEditForm(f => ({...f, phone: v}))} placeholder="0900000000" disabled />
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button type="button" onClick={() => setShowEditModal(false)}
                  style={{ flex: 1, padding: '10px', borderRadius: 8, border: '1px solid #ddd', background: '#f8f9fa', cursor: 'pointer', fontWeight: 600 }}>
                  Hủy
                </button>
                <button type="submit" disabled={submitting}
                  style={{ flex: 2, padding: '10px', borderRadius: 8, border: 'none', background: '#2980b9', color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
                  {submitting ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder, disabled }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, marginBottom: 5, color: '#444' }}>{label}</label>
      <input
        type={type} value={value} placeholder={placeholder} disabled={disabled}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: '.9rem', boxSizing: 'border-box', outline: 'none', background: disabled ? '#f5f5f5' : '#fff', cursor: disabled ? 'not-allowed' : 'text' }}
      />
    </div>
  );
}

const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: '.8rem', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' };
const tdStyle = { padding: '14px 16px', verticalAlign: 'middle' };
