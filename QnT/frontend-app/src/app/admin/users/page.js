'use client';
import { useState, useEffect, useCallback } from 'react';
import { getAuthHeader } from '@/lib/auth';

const API = 'http://localhost:4000/api';

const ROLES = ['CUSTOMER', 'SELLER', 'SHIPPER', 'ADMIN', 'TAX_ORG'];
const ROLE_LABELS = { CUSTOMER: 'Khách hàng', SELLER: 'Người bán', SHIPPER: 'Vận chuyển', ADMIN: 'Quản trị', TAX_ORG: 'Cơ quan thuế' };
const ROLE_COLORS = {
  CUSTOMER: { bg: '#e8f4fd', color: '#2980b9' },
  SELLER: { bg: '#e5f8f4', color: '#22BAA0' },
  SHIPPER: { bg: '#fef9e7', color: '#f39c12' },
  ADMIN: { bg: '#fde8f4', color: '#9b59b6' },
  TAX_ORG: { bg: '#fde8e8', color: '#e74c3c' },
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const LIMIT = 15;

  // Modal states
  const [modal, setModal] = useState(null); // null | 'create' | 'edit' | 'delete'
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({ email: '', password: '', firstname: '', lastname: '', phone: '', role: 'CUSTOMER' });
  const [formErr, setFormErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT, search, role: roleFilter });
      const res = await fetch(`${API}/v1/admin/users?${params}`, {
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Lỗi tải danh sách');
      setUsers(body.users || []);
      setTotal(body.total || 0);
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, roleFilter]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

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

  const openCreate = () => {
    setForm({ email: '', password: '', firstname: '', lastname: '', phone: '', role: 'CUSTOMER' });
    setFormErr('');
    setModal('create');
  };

  const openEdit = (u) => {
    setSelectedUser(u);
    setForm({ email: u.email, password: '', firstname: u.firstname || '', lastname: u.lastname || '', phone: u.phone || '', role: u.role || 'CUSTOMER' });
    setFormErr('');
    setModal('edit');
  };

  const openDelete = (u) => { setSelectedUser(u); setModal('delete'); };

  const handleCreate = async (e) => {
    e.preventDefault();
    setFormErr('');
    if (!form.email || !form.password) { setFormErr('Email và mật khẩu là bắt buộc'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/v1/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(form),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Tạo thất bại');
      showToast('success', `Đã tạo người dùng: ${form.email}`);
      setModal(null);
      fetchUsers();
    } catch (e) { setFormErr(e.message); }
    finally { setSubmitting(false); }
  };

  const handleEdit = async (e) => {
    e.preventDefault();
    setFormErr('');
    setSubmitting(true);
    try {
      const payload = { firstname: form.firstname, lastname: form.lastname, phone: form.phone, role: form.role };
      const res = await fetch(`${API}/v1/admin/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Cập nhật thất bại');
      showToast('success', 'Đã cập nhật người dùng');
      setModal(null);
      fetchUsers();
    } catch (e) { setFormErr(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/v1/admin/users/${selectedUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Xóa thất bại');
      showToast('success', body.message);
      setModal(null);
      fetchUsers();
    } catch (e) { showToast('error', e.message); }
    finally { setSubmitting(false); }
  };

  const handleToggle = async (u) => {
    try {
      const res = await fetch(`${API}/v1/admin/users/${u.id}/toggle`, {
        method: 'PATCH',
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Lỗi');
      showToast('success', body.message);
      fetchUsers();
    } catch (e) { showToast('error', e.message); }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <>
      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 9999,
          background: toast.type === 'success' ? '#22BAA0' : '#e74c3c',
          color: '#fff', padding: '12px 20px', borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,.15)', fontSize: '.9rem',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <i className={`las ${toast.type === 'success' ? 'la-check-circle' : 'la-exclamation-circle'}`}></i>
          {toast.msg}
        </div>
      )}

      <div style={{ padding: '24px 28px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Quản lý người dùng</h2>
            <small style={{ color: '#999' }}>Tổng cộng: <strong style={{ color: '#333' }}>{total}</strong> người dùng</small>
          </div>
          <button onClick={openCreate} style={btnPrimary}>
            <i className="las la-plus"></i> Thêm người dùng
          </button>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ position: 'relative', flex: '2', minWidth: 240 }}>
            <i className="las la-search" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }}></i>
            <input
              value={searchInput}
              onChange={e => setSearchInput(e.target.value)}
              placeholder="Tìm theo tên, email, SĐT..."
              style={{ ...inputStyle, paddingLeft: 36, width: '100%', boxSizing: 'border-box' }}
            />
          </div>
          <select
            value={roleFilter}
            onChange={e => { setRoleFilter(e.target.value); setPage(1); }}
            style={{ ...inputStyle, flex: '1', minWidth: 160, maxWidth: 200 }}
          >
            <option value="">Tất cả vai trò</option>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>

        {/* Table */}
        <div style={{ background: '#fff', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,.06)', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8f9fa', borderBottom: '2px solid #f0f0f0' }}>
                <th style={thStyle}>Người dùng</th>
                <th style={thStyle}>Email</th>
                <th style={thStyle}>Số điện thoại</th>
                <th style={thStyle}>Vai trò</th>
                <th style={thStyle}>Trạng thái</th>
                <th style={thStyle}>Ngày tạo</th>
                <th style={thStyle}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#22BAA0' }}>
                  <i className="las la-spinner" style={{ fontSize: '2rem' }}></i>
                </td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '3rem', color: '#999' }}>
                  <i className="las la-users" style={{ fontSize: '2.5rem', display: 'block', marginBottom: 8 }}></i>
                  Không tìm thấy người dùng nào
                </td></tr>
              ) : users.map(u => {
                const rc = ROLE_COLORS[u.role] || { bg: '#f0f0f0', color: '#666' };
                const name = `${u.firstname || ''} ${u.lastname || ''}`.trim() || '—';
                const initial = (u.firstname || u.email || '?').charAt(0).toUpperCase();
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f5f5f5', transition: 'background .15s' }}
                    onMouseEnter={e => e.currentTarget.style.background = '#fafafa'}
                    onMouseLeave={e => e.currentTarget.style.background = ''}
                  >
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          background: rc.bg, color: rc.color,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontWeight: 700, fontSize: '.9rem', flexShrink: 0,
                        }}>{initial}</div>
                        <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{name}</div>
                      </div>
                    </td>
                    <td style={{ ...tdStyle, color: '#555', fontSize: '.88rem' }}>{u.email}</td>
                    <td style={{ ...tdStyle, color: '#777', fontSize: '.85rem' }}>{u.phone || '—'}</td>
                    <td style={tdStyle}>
                      <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '.75rem', fontWeight: 600, background: rc.bg, color: rc.color }}>
                        {ROLE_LABELS[u.role] || u.role}
                      </span>
                    </td>
                    <td style={tdStyle}>
                      <span style={{
                        padding: '3px 10px', borderRadius: 20, fontSize: '.75rem', fontWeight: 600,
                        background: u.isactive ? '#e5f8f4' : '#fde8e8',
                        color: u.isactive ? '#22BAA0' : '#e74c3c',
                      }}>
                        {u.isactive ? 'Hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                    <td style={{ ...tdStyle, color: '#999', fontSize: '.8rem' }}>
                      {u.created_at ? new Date(u.created_at).toLocaleDateString('vi-VN') : '—'}
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => openEdit(u)} title="Sửa" style={btnIcon('#e8f4fd', '#2980b9')}>
                          <i className="las la-edit"></i>
                        </button>
                        <button onClick={() => handleToggle(u)} title={u.isactive ? 'Khóa' : 'Kích hoạt'}
                          style={btnIcon(u.isactive ? '#fde8e8' : '#e5f8f4', u.isactive ? '#e74c3c' : '#22BAA0')}>
                          <i className={`las ${u.isactive ? 'la-lock' : 'la-lock-open'}`}></i>
                        </button>
                        <button onClick={() => openDelete(u)} title="Xóa" style={btnIcon('#fde8e8', '#e74c3c')}>
                          <i className="las la-trash"></i>
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
          <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginTop: 20 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={btnPage(page === 1)}>
              <i className="las la-angle-left"></i>
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              const p = totalPages <= 7 ? i + 1 : page <= 4 ? i + 1 : page >= totalPages - 3 ? totalPages - 6 + i : page - 3 + i;
              return (
                <button key={p} onClick={() => setPage(p)} style={btnPage(false, p === page)}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} style={btnPage(page === totalPages)}>
              <i className="las la-angle-right"></i>
            </button>
          </div>
        )}
      </div>

      {/* Modal Create */}
      {modal === 'create' && (
        <Modal title="Thêm người dùng mới" icon="la-user-plus" onClose={() => setModal(null)}>
          <form onSubmit={handleCreate}>
            {formErr && <ErrorBox msg={formErr} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Họ *" value={form.firstname} onChange={v => setForm(f => ({ ...f, firstname: v }))} placeholder="Họ" />
              <Field label="Tên *" value={form.lastname} onChange={v => setForm(f => ({ ...f, lastname: v }))} placeholder="Tên" />
            </div>
            <Field label="Email *" type="email" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="user@email.com" />
            <Field label="Mật khẩu *" type="password" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} placeholder="Tối thiểu 6 ký tự" />
            <Field label="Số điện thoại" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="0900000000" />
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Vai trò</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputStyle}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <ModalFooter onCancel={() => setModal(null)} submitting={submitting} label="Tạo người dùng" />
          </form>
        </Modal>
      )}

      {/* Modal Edit */}
      {modal === 'edit' && selectedUser && (
        <Modal title={`Sửa: ${selectedUser.email}`} icon="la-user-edit" onClose={() => setModal(null)}>
          <form onSubmit={handleEdit}>
            {formErr && <ErrorBox msg={formErr} />}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Họ" value={form.firstname} onChange={v => setForm(f => ({ ...f, firstname: v }))} placeholder="Họ" />
              <Field label="Tên" value={form.lastname} onChange={v => setForm(f => ({ ...f, lastname: v }))} placeholder="Tên" />
            </div>
            <Field label="Số điện thoại" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="0900000000" />
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Vai trò</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} style={inputStyle}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>
            <ModalFooter onCancel={() => setModal(null)} submitting={submitting} label="Lưu thay đổi" />
          </form>
        </Modal>
      )}

      {/* Modal Delete */}
      {modal === 'delete' && selectedUser && (
        <Modal title="Xác nhận xóa" icon="la-trash" iconColor="#e74c3c" onClose={() => setModal(null)}>
          <p style={{ color: '#555', marginBottom: 6 }}>
            Bạn có chắc muốn xóa người dùng:
          </p>
          <div style={{ background: '#fde8e8', borderRadius: 8, padding: '10px 14px', marginBottom: 20 }}>
            <strong style={{ color: '#e74c3c' }}>{selectedUser.email}</strong>
            <span style={{ color: '#888', marginLeft: 8, fontSize: '.85rem' }}>
              ({`${selectedUser.firstname || ''} ${selectedUser.lastname || ''}`.trim() || 'Chưa có tên'})
            </span>
          </div>
          <p style={{ color: '#e74c3c', fontSize: '.85rem', marginBottom: 20 }}>
            Hành động này không thể hoàn tác. Tất cả dữ liệu liên quan sẽ bị xóa.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setModal(null)} style={{ flex: 1, ...btnSecondary }}>Hủy</button>
            <button onClick={handleDelete} disabled={submitting} style={{ flex: 1, ...btnDanger }}>
              {submitting ? 'Đang xóa...' : 'Xác nhận xóa'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

function Modal({ title, icon, iconColor = '#22BAA0', onClose, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 20px 60px rgba(0,0,0,.2)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700 }}>
            <i className={`las ${icon}`} style={{ marginRight: 8, color: iconColor }}></i>
            {title}
          </h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#999' }}>✕</button>
        </div>
        <div style={{ padding: '20px 24px' }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, type = 'text', value, onChange, placeholder }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <input type={type} value={value} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ ...inputStyle, display: 'block', width: '100%', boxSizing: 'border-box' }}
      />
    </div>
  );
}

function ErrorBox({ msg }) {
  return (
    <div style={{ background: '#fde8e8', color: '#e74c3c', padding: '10px 14px', borderRadius: 8, marginBottom: 14, fontSize: '.85rem' }}>
      <i className="las la-exclamation-circle" style={{ marginRight: 6 }}></i>{msg}
    </div>
  );
}

function ModalFooter({ onCancel, submitting, label }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
      <button type="button" onClick={onCancel} style={{ flex: 1, ...btnSecondary }}>Hủy</button>
      <button type="submit" disabled={submitting} style={{ flex: 2, ...btnPrimary }}>
        {submitting ? 'Đang xử lý...' : label}
      </button>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const thStyle = { padding: '12px 16px', textAlign: 'left', fontSize: '.8rem', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: '.5px' };
const tdStyle = { padding: '13px 16px', verticalAlign: 'middle' };
const labelStyle = { display: 'block', fontSize: '.82rem', fontWeight: 600, marginBottom: 5, color: '#444' };
const inputStyle = { padding: '9px 12px', borderRadius: 8, border: '1px solid #ddd', fontSize: '.9rem', outline: 'none', width: '100%' };
const btnPrimary = { background: '#22BAA0', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: '.9rem', display: 'inline-flex', alignItems: 'center', gap: 6 };
const btnSecondary = { padding: '10px', borderRadius: 8, border: '1px solid #ddd', background: '#f8f9fa', cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' };
const btnDanger = { padding: '10px', borderRadius: 8, border: 'none', background: '#e74c3c', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: '.9rem' };
const btnIcon = (bg, color) => ({ width: 30, height: 30, borderRadius: 6, border: 'none', background: bg, color, cursor: 'pointer', fontSize: '1rem', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' });
const btnPage = (disabled, active = false) => ({
  minWidth: 36, height: 36, borderRadius: 8, border: active ? 'none' : '1px solid #e0e0e0',
  background: active ? '#22BAA0' : disabled ? '#f5f5f5' : '#fff',
  color: active ? '#fff' : disabled ? '#ccc' : '#333',
  cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: active ? 700 : 400, fontSize: '.85rem',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
});
