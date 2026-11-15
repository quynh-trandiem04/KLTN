'use client';
// frontend-app/src/app/admin/customer-behavior/page.js

import { useState, useEffect, useCallback, useRef } from 'react';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';
import { embedDashboard } from '@superset-ui/embedded-sdk';

//  Thay bằng UUID thực của dashboard Customer Behavior trong Superset
// Tìm trong: Superset → Dashboard → URL: /superset/dashboard/<UUID>/
const CUSTOMER_BEHAVIOR_DASHBOARD_ID = 'a22b0ab2-5d6b-41f7-a330-71286743eec0';
const SUPERSET_URL = 'http://192.168.147.11:8088';

// ── Superset Embed Component ──────────────────────────────────────────────────
function CustomerBehaviorDashboard() {
  const containerRef = useRef(null);
  const [embedState, setEmbedState] = useState('idle');
  const [errorMsg, setErrorMsg]     = useState('');

  const fetchGuestToken = useCallback(async () => {
    const res = await axios.get('/v1/admin/superset/customer-behavior-token', {
      headers: { Authorization: getAuthHeader() }
    });
    return res.data.token;
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    setEmbedState('loading');

    (async () => {
      try {
        await embedDashboard({
          id: CUSTOMER_BEHAVIOR_DASHBOARD_ID,
          supersetDomain: SUPERSET_URL,
          mountPoint: containerRef.current,
          fetchGuestToken,
          dashboardUiConfig: {
            hideTitle: true,
            hideChartControls: false,
            hideTab: false,
            filters: { expanded: false },
          },
        });
        if (!cancelled) setEmbedState('ready');
      } catch (err) {
        if (!cancelled) {
          console.error('[Superset CustomerBehavior embed]', err);
          setErrorMsg(err?.message || 'Không thể tải dashboard Superset');
          setEmbedState('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fetchGuestToken]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 560 }}>
      {/* Loading */}
      {embedState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', borderRadius: 10
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: 'linear-gradient(135deg,#6366f1,#4338ca)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16, boxShadow: '0 8px 24px rgba(99,102,241,.35)',
            animation: 'spin 1.4s linear infinite'
          }}>
            <span className="las la-user-chart" style={{ color: '#fff', fontSize: '1.6rem' }}></span>
          </div>
          <p style={{ color: '#555', fontWeight: 600, fontSize: 15, margin: 0 }}>Đang tải Customer Behavior Dashboard…</p>
          <p style={{ color: '#aaa', fontSize: 13, marginTop: 6 }}>Đang lấy guest token & render biểu đồ</p>
        </div>
      )}

      {/* Error */}
      {embedState === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#fff5f5', borderRadius: 10, border: '1px solid #fecaca', padding: 24
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14,
            background: '#fef2f2', border: '2px solid #fecaca',
            display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16
          }}>
            <span className="las la-exclamation-triangle" style={{ color: '#ef4444', fontSize: '1.8rem' }}></span>
          </div>
          <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 15, margin: 0 }}>Không thể tải Superset Dashboard</p>
          <p style={{ color: '#999', fontSize: 13, marginTop: 8, maxWidth: 420, textAlign: 'center' }}>{errorMsg}</p>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setEmbedState('idle'); setTimeout(() => setEmbedState('loading'), 50); }}
              style={{
                padding: '8px 18px', borderRadius: 8,
                background: 'linear-gradient(135deg,#6366f1,#4338ca)',
                color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13
              }}
            >
              <span className="las la-redo" style={{ marginRight: 6 }}></span>Thử lại
            </button>
            <a
              href={`${SUPERSET_URL}/superset/dashboard/${CUSTOMER_BEHAVIOR_DASHBOARD_ID}/`}
              target="_blank" rel="noreferrer"
              style={{
                padding: '8px 18px', borderRadius: 8,
                background: '#f3f4f6', color: '#374151',
                border: '1px solid #d1d5db', textDecoration: 'none',
                fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6
              }}
            >
              <span className="las la-external-link-alt"></span>Mở Superset
            </a>
          </div>
        </div>
      )}

      {/* Mount point */}
      <div
        ref={containerRef}
        id="customer-behavior-embed-container"
        style={{
          width: '100%', minHeight: 560,
          opacity: embedState === 'ready' ? 1 : 0,
          transition: 'opacity 0.4s ease',
          borderRadius: 10, overflow: 'hidden'
        }}
      />

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        #customer-behavior-embed-container iframe {
          border: none !important;
          border-radius: 10px !important;
          width: 100% !important;
          min-height: 560px !important;
        }
      `}</style>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CustomerBehaviorPage() {
  return (
    <div style={{ padding: '28px 24px' }}>

      {/* Page Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 14,
            background: 'linear-gradient(135deg,#6366f1,#4338ca)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(99,102,241,.35)'
          }}>
            <span className="las la-users-cog" style={{ color: '#fff', fontSize: '1.5rem' }}></span>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: '#1a1a2e' }}>
              Customer Behavior Dashboard
            </h1>
            <p style={{ margin: 0, fontSize: 13, color: '#9ca3af', marginTop: 2 }}>
              Phân tích hành vi khách hàng — Powered by Apache Superset
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a
            href={`${SUPERSET_URL}/superset/dashboard/${CUSTOMER_BEHAVIOR_DASHBOARD_ID}/`}
            target="_blank" rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '9px 18px', borderRadius: 10,
              background: 'linear-gradient(135deg,#6366f1,#4338ca)',
              color: '#fff', textDecoration: 'none',
              fontSize: 13, fontWeight: 700,
              boxShadow: '0 4px 14px rgba(99,102,241,.35)',
              whiteSpace: 'nowrap'
            }}
          >
            <span className="las la-external-link-alt"></span>
            Mở toàn màn hình
          </a>
        </div>
      </div>



      {/* Superset Dashboard embed */}
      <div style={{
        background: '#fff', borderRadius: 16,
        boxShadow: '0 2px 12px rgba(0,0,0,.07)',
        overflow: 'hidden'
      }}>
        {/* Card Header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'linear-gradient(135deg,#6366f1,#4338ca)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 4px 10px rgba(99,102,241,.3)'
            }}>
              <span className="las la-chart-area" style={{ color: '#fff', fontSize: '1.1rem' }}></span>
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a2e' }}>Biểu đồ phân tích hành vi khách hàng</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 1 }}>
                Dashboard ID: <span style={{ fontFamily: 'monospace', color: '#6b7280' }}>{CUSTOMER_BEHAVIOR_DASHBOARD_ID}</span>
              </div>
            </div>
          </div>
          <div style={{
            display: 'flex', gap: 6, alignItems: 'center',
            background: '#f0fdf4', padding: '4px 10px', borderRadius: 20,
            border: '1px solid #bbf7d0', fontSize: 12, fontWeight: 600, color: '#16a34a'
          }}>
            <span className="las la-circle" style={{ fontSize: 8 }}></span>
            Live data
          </div>
        </div>

        {/* Embed area */}
        <div style={{ padding: '20px' }}>
          <CustomerBehaviorDashboard />
        </div>
      </div>
    </div>
  );
}
