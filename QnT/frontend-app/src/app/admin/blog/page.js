'use client';

import { useEffect, useState } from 'react';

const EMPTY_FORM = {
  title: '',
  description: '',
  content: '',
  imageurl: '/assets/img/blog/01.jpg'
};

export default function AdminBlogPage() {
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadBlogs = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/internal-api/v1/blog');
      const data = await res.json();
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setBlogs(list);
    } catch {
      setError('Không tải được danh sách blog.');
      setBlogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlogs();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim() || !form.content.trim()) {
      setError('Vui lòng nhập tiêu đề và nội dung.');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');

    try {
      const res = await fetch('/api/v1/blog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.message || 'Không thể tạo blog.');
        return;
      }

      setMessage('Thêm blog thành công.');
      setForm(EMPTY_FORM);
      setShowCreateModal(false);
      await loadBlogs();
    } catch {
      setError('Lỗi kết nối khi tạo blog.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: '24px 28px' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: '1.3rem', fontWeight: 700 }}>Quản lý Blog</h2>
          <small style={{ color: '#999' }}>Trang chủ / Quản lý Blog</small>
        </div>

        <button
          onClick={() => {
            setError('');
            setMessage('');
            setShowCreateModal(true);
          }}
          style={{
            background: '#22BAA0',
            color: '#fff',
            border: 'none',
            padding: '10px 16px',
            cursor: 'pointer',
            fontWeight: 600
          }}
        >
          + Thêm bài viết
        </button>
      </div>

      {message && <div style={{ color: '#22BAA0', marginBottom: 12 }}>{message}</div>}
      {error && !showCreateModal && <div style={{ color: '#e53935', marginBottom: 12 }}>{error}</div>}

      <div style={{ background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.06)', padding: 16 }}>
        <h3 style={{ marginTop: 0 }}>Danh sách blog</h3>

        {loading ? (
          <div>Đang tải...</div>
        ) : blogs.length === 0 ? (
          <div>Chưa có bài blog nào.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #eee' }}>ID</th>
                  <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #eee' }}>Tiêu đề</th>
                  <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #eee' }}>Mô tả</th>
                  <th style={{ textAlign: 'left', padding: '10px', borderBottom: '1px solid #eee' }}>Ngày tạo</th>
                </tr>
              </thead>
              <tbody>
                {blogs.map((b) => (
                  <tr key={b.id}>
                    <td style={{ padding: '10px', borderBottom: '1px solid #f1f1f1' }}>{b.id}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #f1f1f1', fontWeight: 600 }}>{b.title}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #f1f1f1', color: '#555' }}>{b.description || 'Không có mô tả'}</td>
                    <td style={{ padding: '10px', borderBottom: '1px solid #f1f1f1', color: '#777' }}>
                      {b.createdat ? new Date(b.createdat).toLocaleString('vi-VN') : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showCreateModal && (
        <div
          onClick={() => setShowCreateModal(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.35)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 1000
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 92vw)',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#fff',
              padding: 20,
              boxShadow: '0 6px 30px rgba(0,0,0,.15)'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Thêm bài blog mới</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Tiêu đề *</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  style={{ width: '100%', padding: 10, border: '1px solid #ddd', marginTop: 4 }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Mô tả ngắn</label>
                <input
                  value={form.description}
                  onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                  style={{ width: '100%', padding: 10, border: '1px solid #ddd', marginTop: 4 }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Ảnh (URL)</label>
                <input
                  value={form.imageurl}
                  onChange={(e) => setForm((p) => ({ ...p, imageurl: e.target.value }))}
                  style={{ width: '100%', padding: 10, border: '1px solid #ddd', marginTop: 4 }}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <label style={{ fontSize: 13, fontWeight: 600 }}>Nội dung *</label>
                <textarea
                  rows={10}
                  value={form.content}
                  onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))}
                  style={{ width: '100%', padding: 10, border: '1px solid #ddd', marginTop: 4 }}
                />
              </div>

              {error && <div style={{ color: '#e53935', marginBottom: 10 }}>{error}</div>}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  style={{ background: '#e5e7eb', color: '#111', border: 'none', padding: '10px 16px', cursor: 'pointer' }}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  style={{ background: '#22BAA0', color: '#fff', border: 'none', padding: '10px 18px', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.8 : 1 }}
                >
                  {saving ? 'Đang lưu...' : 'Đăng bài'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
