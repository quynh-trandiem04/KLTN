'use client';
// frontend-app/src/app/tax/analytics/page.js

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';
import { embedDashboard } from '@superset-ui/embedded-sdk';
import '../login/styles.css';

const TAX_DASHBOARD_ID = '9412d4f7-b66c-4885-959e-a82cad3839e0';
const SUPERSET_URL     = 'http://192.168.147.11:8088';

// ── Superset Embed Component ──────────────────────────────────────────────────
function TaxSupersetDashboard() {
  const containerRef = useRef(null);
  const [embedState, setEmbedState] = useState('idle');
  const [errorMsg, setErrorMsg]     = useState('');

  const fetchGuestToken = useCallback(async () => {
    const res = await axios.get('/v1/tax/superset/guest-token', {
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
          id: TAX_DASHBOARD_ID,
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
          console.error('[Superset Tax embed]', err);
          setErrorMsg(err?.message || 'Không thể tải dashboard Superset');
          setEmbedState('error');
        }
      }
    })();

    return () => { cancelled = true; };
  }, [fetchGuestToken]);

  return (
    <div style={{ position: 'relative', width: '100%', minHeight: 600 }}>
      {/* Loading */}
      {embedState === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#f8fafc', borderRadius: 8
        }}>
          <i className="fas fa-spinner fa-spin" style={{ fontSize: '2.5rem', color: '#C41E3A', marginBottom: 16 }}></i>
          <p style={{ color: '#374151', fontWeight: 600, fontSize: 15, margin: 0 }}>Đang tải Dashboard thuế…</p>
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 6 }}>Đang kết nối Apache Superset</p>
        </div>
      )}

      {/* Error */}
      {embedState === 'error' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: '#fff5f5', borderRadius: 8, border: '1px solid #fecaca', padding: 24
        }}>
          <i className="fas fa-exclamation-triangle" style={{ fontSize: '2.5rem', color: '#ef4444', marginBottom: 16 }}></i>
          <p style={{ color: '#dc2626', fontWeight: 700, fontSize: 16, margin: 0 }}>Không thể tải Superset Dashboard</p>
          <p style={{ color: '#9ca3af', fontSize: 13, marginTop: 8, maxWidth: 420, textAlign: 'center' }}>{errorMsg}</p>
          <div style={{ marginTop: 18, display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setEmbedState('idle'); setTimeout(() => setEmbedState('loading'), 50); }}
              style={{
                padding: '8px 20px', borderRadius: 8,
                background: 'linear-gradient(135deg,#C41E3A,#8B0000)',
                color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 13
              }}
            >
              <i className="fas fa-redo" style={{ marginRight: 6 }}></i>Thử lại
            </button>
            <a
              href={`${SUPERSET_URL}/superset/dashboard/${TAX_DASHBOARD_ID}/`}
              target="_blank" rel="noreferrer"
              style={{
                padding: '8px 20px', borderRadius: 8,
                background: '#f3f4f6', color: '#374151',
                border: '1px solid #d1d5db', textDecoration: 'none',
                fontWeight: 600, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6
              }}
            >
              <i className="fas fa-external-link-alt"></i>Mở Superset
            </a>
          </div>
        </div>
      )}

      {/* Mount point */}
      <div
        ref={containerRef}
        id="tax-superset-embed-container"
        style={{
          width: '100%', minHeight: 600,
          opacity: embedState === 'ready' ? 1 : 0,
          transition: 'opacity 0.4s ease',
        }}
      />

      <style>{`
        #tax-superset-embed-container iframe {
          border: none !important;
          width: 100% !important;
          min-height: 600px !important;
        }
      `}</style>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TaxAnalyticsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (!token || !stored) {
      router.push('/tax/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    router.push('/tax/login');
  };

  return (
    <>
      {/* ===== HEADER (giống registrations) ===== */}
      <header className="tax-header">
        <div className="tax-header-top">
          <div className="container">
            <div className="tax-header-top-wrapper">
              <div className="tax-header-top-left">
                <ul className="tax-header-top-list">
                  <li><a href="mailto:tax@gov.vn"><i className="fas fa-envelope"></i> tax@gov.vn</a></li>
                  <li><a href="tel:19006543"><i className="fas fa-headset"></i> 1900 6543</a></li>
                </ul>
              </div>
              <div className="tax-header-top-right">
                <ul className="tax-header-top-list">
                  {user && (
                    <li><span><i className="fas fa-user-shield"></i> {user.full_name || user.email}</span></li>
                  )}
                  <li>
                    <a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
                      <i className="fas fa-sign-out-alt"></i> Đăng xuất
                    </a>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <div className="tax-navbar">
          <div className="container">
            <div className="tax-navbar-inner">
              <Link href="/tax" className="tax-navbar-brand">
                <div className="tax-logo-group">
                  <i className="fas fa-landmark tax-logo-icon"></i>
                  <div>
                    <span className="tax-logo-title">TỔNG CỤC THUẾ</span>
                    <span className="tax-logo-sub">Hệ thống xác minh MST</span>
                  </div>
                </div>
              </Link>
              <nav className="tax-nav-links">
                <Link href="/tax">Trang chủ</Link>
                <Link href="/tax/audit">Tra cứu</Link>
                <Link href="/tax/registrations">Hồ sơ đăng ký</Link>
                <Link href="/tax/declarations">Khai báo thuế</Link>
                <Link href="/tax/analytics" className="active">
                  <i className="fas fa-chart-bar" style={{ marginRight: 5 }}></i>Phân tích dữ liệu
                </Link>
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* ===== BREADCRUMB ===== */}
      <main className="tax-main">
        <div className="tax-breadcrumb">
          <div className="container">
            <h4 className="tax-breadcrumb-title">Phân tích dữ liệu thuế</h4>
            <ul className="tax-breadcrumb-menu">
              <li><Link href="/tax"><i className="fas fa-home"></i> Trang chủ</Link></li>
              <li className="active">Phân tích dữ liệu</li>
            </ul>
          </div>
        </div>

        {/* ===== CONTENT ===== */}
        <div className="tax-dashboard-area">
          <div className="container">

            {/* Info bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '1.25rem', flexWrap: 'wrap', gap: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: 'linear-gradient(135deg,#C41E3A,#8B0000)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(196,30,58,.25)'
                }}>
                  <i className="fas fa-chart-pie" style={{ color: '#fff', fontSize: '1.1rem' }}></i>
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>Báo cáo phân tích thuế TMĐT</div>
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>
                    Powered by Apache Superset · Dashboard ID: <span style={{ fontFamily: 'monospace' }}>{TAX_DASHBOARD_ID}</span>
                  </div>
                </div>
              </div>
              <a
                href={`${SUPERSET_URL}/superset/dashboard/${TAX_DASHBOARD_ID}/`}
                target="_blank" rel="noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '7px 16px', borderRadius: 8,
                  background: 'linear-gradient(135deg,#C41E3A,#8B0000)',
                  color: '#fff', textDecoration: 'none',
                  fontSize: 13, fontWeight: 600,
                  boxShadow: '0 3px 10px rgba(196,30,58,.3)'
                }}
              >
                <i className="fas fa-external-link-alt"></i>
                Mở Superset đầy đủ
              </a>
            </div>

            {/* Superset embed card */}
            <div className="tax-table-card" style={{ padding: 0, overflow: 'hidden' }}>
              <TaxSupersetDashboard />
            </div>

          </div>
        </div>
      </main>

      {/* ===== FOOTER ===== */}
      <footer className="tax-footer">
        <div className="container">
          <div className="tax-footer-inner">
            <div className="tax-footer-left">
              <p>&copy; 2026 Tổng cục Thuế - Hệ thống xác minh mã số thuế</p>
            </div>
            <div className="tax-footer-right">
              <p>Hỗ trợ: <a href="tel:19006543">1900 6543</a> | <a href="mailto:tax@gov.vn">tax@gov.vn</a></p>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
