'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getAuthHeader } from '@/lib/auth';
import '../admin/dashboard/styles.css';

const publicPaths = ['/shipper/login', '/shipper/forgot-password'];

const menuItems = [
  { divider: 'Tổng quan' },
  { href: '/shipper/dashboard', icon: 'las la-home', label: 'Dashboard' },
  { divider: 'Đơn hàng' },
  { href: '/shipper', icon: 'las la-list', label: 'Tất cả đơn' },
  { divider: 'Cài đặt' },
  { href: '/shipper/fee-config', icon: 'las la-sliders-h', label: 'Cấu hình phí' },
];

export default function ShipperLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState(null);
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isPublic = publicPaths.some(p => pathname.startsWith(p));

  useEffect(() => {
    if (isPublic) return;
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    const userType = localStorage.getItem('userType');
    if (!token || !stored || userType !== 'shipper') {
      router.push('/shipper/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [isPublic, router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    router.push('/shipper/login');
  };

  if (isPublic) return <>{children}</>;

  const getInitial = () => {
    if (!user) return 'S';
    return (user.full_name || user.email || 'S').charAt(0).toUpperCase();
  };

  return (
    <>
      <link rel="stylesheet" href="https://maxst.icons8.com/vue-static/landings/line-awesome/line-awesome/1.3.0/css/line-awesome.min.css" />
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />

      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 99 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar — dùng admin-sidebar CSS classes */}
      <div className={`admin-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="admin-side-header">
          <h3><i className="las la-truck" style={{ marginRight: 6 }}></i><span>Shipper</span></h3>
        </div>

        <div className="admin-side-content">
          <div className="admin-profile">
            <div className="admin-profile-img">
              <i className="las la-truck"></i>
            </div>
            <h4>{user?.full_name || user?.email || 'Shipper'}</h4>
            <small>Đơn vị vận chuyển</small>
          </div>

          <div className="admin-side-menu">
            <ul>
              {menuItems.map((item, i) =>
                item.divider ? (
                  <li key={`d-${i}`} className="menu-divider">{item.divider}</li>
                ) : (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={pathname === item.href ? 'active' : ''}
                      onClick={() => setMobileOpen(false)}
                    >
                      <span className={`menu-icon ${item.icon}`}></span>
                      <span className="menu-text">{item.label}</span>
                    </Link>
                  </li>
                )
              )}
            </ul>
          </div>
        </div>

        {/* Logout cố định ở cuối sidebar */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          borderTop: '1px solid rgba(255,255,255,.1)', padding: '8px 0',
        }}>
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '10px 18px', background: 'none', border: 'none',
            color: 'rgba(255,255,255,.7)', cursor: 'pointer', fontSize: '.88rem',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }} title="Đăng xuất">
            <i className="las la-sign-out-alt" style={{ fontSize: '1.2rem', flexShrink: 0 }}></i>
            {!collapsed && <span>Đăng xuất</span>}
          </button>
        </div>

        <button
          className="admin-sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Mở rộng' : 'Thu gọn'}
        >
          <i className="las la-chevron-left"></i>
        </button>
      </div>

      {/* Main Content */}
      <div className="admin-main-content" style={{ marginLeft: collapsed ? 68 : 220 }}>
        <header className="admin-header">
          <div className="admin-header-left">
            <button className="toggle-btn" onClick={() => {
              if (typeof window !== 'undefined' && window.innerWidth <= 768) {
                setMobileOpen(!mobileOpen);
              } else {
                setCollapsed(!collapsed);
              }
            }}>
              <span className="las la-bars"></span>
            </button>
          </div>

          <div className="admin-header-right">
            <div className="admin-user-info">
              <div className="admin-user-avatar">{getInitial()}</div>
              <span className="admin-user-name">{user?.full_name || 'Shipper'}</span>
            </div>
          </div>
        </header>

        {children}
      </div>
    </>
  );
}

