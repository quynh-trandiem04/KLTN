'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';

export default function BusinessConfigPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [adapterOnline, setAdapterOnline] = useState(null);

  const [holdPeriod, setHoldPeriod] = useState('');
  const [returnWindow, setReturnWindow] = useState('');
  const [holdPeriodInput, setHoldPeriodInput] = useState('');
  const [returnWindowInput, setReturnWindowInput] = useState('');

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
      const { business } = res.data;
      setAdapterOnline(true);
      if (business) {
        const h = String(business.holdPeriodMinutes ?? '');
        const r = String(business.returnWindowMinutes ?? '');
        setHoldPeriod(h);
        setReturnWindow(r);
        setHoldPeriodInput(h);
        setReturnWindowInput(r);
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
    const hold = Number(holdPeriodInput);
    const ret = Number(returnWindowInput);
    if (isNaN(hold) || hold < 0) { showToast('error', 'Hold Period phải là số không âm'); return; }
    if (isNaN(ret) || ret < 0) { showToast('error', 'Return Window phải là số không âm'); return; }
    setSaving(true);
    try {
      const res = await axios.post('/v1/admin/config/business',
        { holdPeriodMinutes: hold, returnWindowMinutes: ret },
        { headers: { Authorization: getAuthHeader() } }
      );
      setHoldPeriod(String(hold));
      setReturnWindow(String(ret));
      showToast('success', res.data.message || 'Đã cập nhật Business Rules');
    } catch (e) {
      showToast('error', e.response?.data?.detail || 'Lỗi khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  const dirty = holdPeriodInput !== holdPeriod || returnWindowInput !== returnWindow;

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
        <h1>Cài đặt vận hành</h1>
        <small><Link href="/admin/dashboard">Home</Link> / Cài đặt vận hành</small>
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
              <h3><span className="las la-sliders-h" style={{ marginRight: 6, color: '#22BAA0' }} />Cài đặt Business Rules</h3>
              {adapterOnline === true && (
                <button onClick={fetchConfig} style={{ background: 'none', border: '1px solid #d5d5d5', borderRadius: 6, padding: '4px 12px', fontSize: '.78rem', color: '#666', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
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

                {/* Hold Period */}
                <div style={{ marginBottom: '1.2rem' }}>
                  <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>
                    Hold Period (Phút) <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <p style={{ margin: '0 0 6px', fontSize: '.77rem', color: '#999', lineHeight: 1.5 }}>
                    Thời gian giữ tiền (phút) sau khi giao hàng trước khi Admin có thể Payout cho Shop.
                  </p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="number" min="0" step="1"
                      value={holdPeriodInput}
                      onChange={e => setHoldPeriodInput(e.target.value)}
                      placeholder="VD: 5"
                      style={{
                        flex: 1, height: 38, padding: '0 12px',
                        border: `1px solid ${holdPeriodInput !== holdPeriod ? '#22BAA0' : '#d5d5d5'}`,
                        borderRadius: 6, fontSize: '.9rem', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span style={{ fontWeight: 600, color: '#555', fontSize: '.85rem', minWidth: 30 }}>phút</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: '.77rem', color: '#999' }}>
                    Đang chạy: <strong style={{ color: '#444' }}>{holdPeriod ? `${holdPeriod} phút` : '—'}</strong>
                    {holdPeriodInput && !isNaN(Number(holdPeriodInput)) && Number(holdPeriodInput) > 0 && (
                      <span style={{ marginLeft: 10 }}>≈ {(Number(holdPeriodInput) / 60).toFixed(2)} giờ</span>
                    )}
                  </div>
                </div>

                {/* Return Window */}
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, color: '#555', marginBottom: 4 }}>
                    Return Window (Phút) <span style={{ color: '#e74c3c' }}>*</span>
                  </label>
                  <p style={{ margin: '0 0 6px', fontSize: '.77rem', color: '#999', lineHeight: 1.5 }}>
                    Hạn chót (phút) để khách hàng yêu cầu trả hàng kể từ khi đơn được giao thành công.
                  </p>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input
                      type="number" min="0" step="1"
                      value={returnWindowInput}
                      onChange={e => setReturnWindowInput(e.target.value)}
                      placeholder="VD: 5"
                      style={{
                        flex: 1, height: 38, padding: '0 12px',
                        border: `1px solid ${returnWindowInput !== returnWindow ? '#22BAA0' : '#d5d5d5'}`,
                        borderRadius: 6, fontSize: '.9rem', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <span style={{ fontWeight: 600, color: '#555', fontSize: '.85rem', minWidth: 30 }}>phút</span>
                  </div>
                  <div style={{ marginTop: 4, fontSize: '.77rem', color: '#999' }}>
                    Đang chạy: <strong style={{ color: '#444' }}>{returnWindow ? `${returnWindow} phút` : '—'}</strong>
                    {returnWindowInput && !isNaN(Number(returnWindowInput)) && Number(returnWindowInput) > 0 && (
                      <span style={{ marginLeft: 10 }}>≈ {(Number(returnWindowInput) / 60).toFixed(2)} giờ</span>
                    )}
                  </div>
                </div>

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
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Tham số</th>
                      <th>Giá trị hiện tại</th>
                      <th>Mô tả</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td><code style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 4, fontSize: '.8rem' }}>holdPeriodMinutes</code></td>
                      <td style={{ fontWeight: 700, color: '#333' }}>{holdPeriod ? `${holdPeriod} phút` : '—'}</td>
                      <td style={{ color: '#666', fontSize: '.82rem' }}>Chờ trước khi Payout cho Shop sau khi giao hàng</td>
                    </tr>
                    <tr>
                      <td><code style={{ background: '#f5f3ff', color: '#7c3aed', padding: '2px 8px', borderRadius: 4, fontSize: '.8rem' }}>returnWindowMinutes</code></td>
                      <td style={{ fontWeight: 700, color: '#333' }}>{returnWindow ? `${returnWindow} phút` : '—'}</td>
                      <td style={{ color: '#666', fontSize: '.82rem' }}>Cửa sổ thời gian để khách yêu cầu trả hàng</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="admin-table-footer">
                <span>Nguồn lưu trữ: <span className="admin-badge admin-badge-info" style={{ marginLeft: 4 }}>Smart Contract</span></span>
              </div>
            </div>
          )}

        </div>
      </div>
    </>
  );
}
