'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';

export default function TaxConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [adapterOnline, setAdapterOnline] = useState(null);

  const [vatRate, setVatRate] = useState('');
  const [vatRateInput, setVatRateInput] = useState('');

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get('/v1/admin/config', {
        headers: { Authorization: getAuthHeader() },
      });
      const { tax } = res.data;
      setAdapterOnline(true);
      if (tax) {
        const v = String(tax.vatRate ?? '');
        setVatRate(v);
        setVatRateInput(v);
      }
    } catch (e) {
      setAdapterOnline(false);
      showToast('error', e.response?.data?.detail || 'Không kết nối được Blockchain Adapter');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleSave = async (e) => {
    e.preventDefault();
    const rate = Number(vatRateInput);
    if (isNaN(rate) || rate < 0 || rate > 100) {
      showToast('error', 'VAT Rate phải là số từ 0 đến 100');
      return;
    }
    setSaving(true);
    try {
      const res = await axios.post('/v1/admin/config/tax',
        { vatRate: rate },
        { headers: { Authorization: getAuthHeader() } }
      );
      setVatRate(String(rate));
      showToast('success', res.data.message || `Đã cập nhật VAT Rate: ${rate}%`);
    } catch (e) {
      showToast('error', e.response?.data?.detail || 'Lỗi khi lưu cấu hình thuế');
    } finally {
      setSaving(false);
    }
  };

  const dirty = vatRateInput !== vatRate;

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
          <button onClick={() => setToast(null)} style={{ marginLeft: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: '1rem', padding: 0, lineHeight: 1 }}>×</button>
        </div>
      )}

      <div className="admin-page-header">
        <h1>Cấu hình thuế</h1>
        <small><Link href="/admin/dashboard">Home</Link> / Cấu hình thuế</small>
      </div>

      <div className="admin-page-content">

        {/* Adapter status */}
        {adapterOnline === false && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 6, marginBottom: 16, background: '#fce8e8', border: '1px solid #f5c6c6', fontSize: '.83rem', color: '#e74c3c' }}>
            <span className="las la-exclamation-circle" />
            <span>Không kết nối được Blockchain Adapter tại <code>http://localhost:3000</code></span>
            <button onClick={fetchConfig} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #f5c6c6', borderRadius: 5, padding: '3px 10px', fontSize: '.78rem', color: '#e74c3c', cursor: 'pointer' }}>
              Thử lại
            </button>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '520px 1fr', gap: '1.5rem', alignItems: 'start' }}>

          {/* ── Form ── */}
          <div className="admin-records">
            <div className="admin-record-header">
              <h3><span className="las la-percentage" style={{ marginRight: 6, color: '#22BAA0' }} />Cài đặt VAT Rate</h3>
              {adapterOnline === true && (
                <button onClick={fetchConfig} className="admin-record-actions" style={{ background: 'none', border: '1px solid #d5d5d5', borderRadius: 6, padding: '4px 12px', fontSize: '.78rem', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="las la-sync-alt" /> Làm mới
                </button>
              )}
            </div>

            {loading ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>
                <span className="las la-spinner la-spin" style={{ fontSize: '1.8rem' }} />
                <p style={{ marginTop: 8, fontSize: '.85rem' }}>Đang tải từ Blockchain...</p>
              </div>
            ) : (
              <form onSubmit={handleSave} style={{ padding: '1.5rem' }}>

                <div style={{ marginBottom: '1.2rem' }}>
                  <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, color: '#555', marginBottom: 6 }}>
                    VAT Rate (%) <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="number"
                      min="0" max="100" step="0.1"
                      value={vatRateInput}
                      onChange={e => setVatRateInput(e.target.value)}
                      placeholder="Nhập giá trị, VD: 10"
                      style={{
                        flex: 1, height: 38, padding: '0 12px',
                        border: `1px solid ${dirty ? '#22BAA0' : '#d5d5d5'}`,
                        borderRadius: 6, fontSize: '.9rem', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span style={{ fontWeight: 600, color: '#555', fontSize: '.9rem', minWidth: 20 }}>%</span>
                  </div>
                  <div style={{ marginTop: 5, fontSize: '.77rem', color: '#999' }}>
                    Giá trị đang chạy trên Blockchain:{' '}
                    <strong style={{ color: '#444' }}>{vatRate !== '' ? `${vatRate}%` : '—'}</strong>
                  </div>
                </div>

                {/* Example calc */}
                {vatRateInput !== '' && !isNaN(Number(vatRateInput)) && (
                  <div style={{ background: '#f7f8fa', border: '1px solid #eee', borderRadius: 6, padding: '12px 14px', marginBottom: '1.2rem', fontSize: '.82rem', color: '#666' }}>
                    <div style={{ fontWeight: 600, color: '#444', marginBottom: 8 }}>Ví dụ với doanh thu 1.000.000 ₫:</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span>VAT ({vatRateInput}%):</span>
                      <span style={{ fontWeight: 600, color: '#e74c3c' }}>−{(1_000_000 * Number(vatRateInput) / 100).toLocaleString('vi-VN')} ₫</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid #eee' }}>
                      <span style={{ fontWeight: 600 }}>Seller nhận:</span>
                      <span style={{ fontWeight: 700, color: '#22BAA0' }}>{(1_000_000 * (1 - Number(vatRateInput) / 100)).toLocaleString('vi-VN')} ₫</span>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={saving || !dirty}
                  className="add-btn"
                  style={{
                    width: '100%', height: 38, justifyContent: 'center',
                    background: dirty ? '#22BAA0' : '#ccc',
                    cursor: dirty ? 'pointer' : 'not-allowed',
                    fontSize: '.85rem',
                  }}
                >
                  {saving ? <><span className="las la-spinner la-spin" /> Đang lưu...</> : <><span className="las la-save" /> Lưu cấu hình</>}
                </button>
              </form>
            )}
          </div>

          {/* ── Info panel ── */}
          {!loading && (
            <div className="admin-records">
              <div className="admin-record-header">
                <h3><span className="las la-info-circle" style={{ marginRight: 6, color: '#22BAA0' }} />Thông tin</h3>
              </div>
              <div style={{ padding: '1.5rem' }}>
                <table className="admin-table" style={{ marginTop: 0 }}>
                  <tbody>
                    <tr>
                      <td style={{ color: '#888', fontWeight: 400, width: 160 }}>Tham số</td>
                      <td><code style={{ background: '#f0fdf4', color: '#22BAA0', padding: '2px 8px', borderRadius: 4 }}>vatRate</code></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#888', fontWeight: 400 }}>Giá trị hiện tại</td>
                      <td style={{ fontWeight: 700, fontSize: '1.05rem', color: '#333' }}>{vatRate !== '' ? `${vatRate}%` : '—'}</td>
                    </tr>
                    <tr>
                      <td style={{ color: '#888', fontWeight: 400 }}>Nguồn lưu trữ</td>
                      <td><span className="admin-badge admin-badge-info">Smart Contract</span></td>
                    </tr>
                    <tr>
                      <td style={{ color: '#888', fontWeight: 400, verticalAlign: 'top', paddingTop: 12 }}>Tác động</td>
                      <td style={{ fontSize: '.82rem', color: '#666', lineHeight: 1.6 }}>
                        Trừ VAT từ doanh thu Shop khi Admin thực hiện Payout. Áp dụng ngay cho tất cả giao dịch sau khi lưu.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
