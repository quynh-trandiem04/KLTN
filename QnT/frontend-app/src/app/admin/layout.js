'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import './dashboard/styles.css';

const publicPaths = ['/admin/login', '/admin/register'];

const menuItems = [
  { divider: 'Tổng quan' },
  { href: '/admin/dashboard', icon: 'las la-home', label: 'Dashboard' },
  { href: '/admin/customer-behavior', icon: 'las la-users-cog', label: 'Customer Behavior' },
  { divider: 'Quản lý' },
  { href: '/admin/users', icon: 'las la-users', label: 'Người dùng' },
  { href: '/admin/seller-applications', icon: 'las la-store', label: 'Duyệt Seller' },
  { href: '/admin/orders', icon: 'las la-shopping-cart', label: 'Đơn hàng' },
  { href: '/admin/shippers', icon: 'las la-truck', label: 'Đơn vị vận chuyển' },
  { divider: 'Tài chính' },
  { href: '/admin/payouts', icon: 'las la-money-bill-wave', label: 'Đối soát' },
  { href: '/admin/tax-config', icon: 'las la-percentage', label: 'Cấu hình thuế' },
  { href: '/admin/business-config', icon: 'las la-sliders-h', label: 'Cài đặt vận hành' },
  { href: '/admin/coupons', icon: 'las la-ticket-alt', label: 'Mã giảm giá' },
  { href: '/admin/blog', icon: 'las la-blog', label: 'Quản lý Blog' },
];

export default function AdminLayout({ children }) {
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
    if (!token || !stored || userType !== 'admin') {
      router.push('/admin/login');
      return;
    }
    setUser(JSON.parse(stored));
  }, [isPublic, router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    router.push('/admin/login');
  };

  // For public pages (login, register), render without sidebar
  if (isPublic) {
    return <>{children}</>;
  }

  const getInitial = () => {
    if (!user) return 'A';
    const name = user.full_name || user.email || '';
    return name.charAt(0).toUpperCase();
  };

  return (
    <>
      <link rel="stylesheet" href="https://maxst.icons8.com/vue-static/landings/line-awesome/line-awesome/1.3.0/css/line-awesome.min.css" />
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />

      {/* Sidebar overlay on mobile */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 99 }}
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`admin-sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="admin-side-header">
          <h3>Q<span>nT Admin</span></h3>
        </div>

        <div className="admin-side-content">
          <div className="admin-profile">
            <div className="admin-profile-img">
              <i className="las la-user-shield"></i>
            </div>
            <h4>{user?.full_name || user?.email || 'Admin'}</h4>
            <small>Administrator</small>
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
        {/* Header */}
        <header className="admin-header">
          <div className="admin-header-left">
            <button className="toggle-btn" onClick={() => {
              if (window.innerWidth <= 768) {
                setMobileOpen(!mobileOpen);
              } else {
                setCollapsed(!collapsed);
              }
            }}>
              <span className="las la-bars"></span>
            </button>
          </div>

          <div className="admin-header-right">
            <div className="admin-header-search" style={{ position: 'relative', marginRight: '15px' }}>
              <span className="las la-search" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#999', fontSize: '18px' }}></span>
              <input 
                type="text" 
                placeholder="Tìm kiếm trên trang này..." 
                onChange={(e) => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('adminGlobalSearch', { detail: e.target.value }));
                  }
                }}
                style={{ 
                  padding: '8px 15px 8px 35px', 
                  borderRadius: '20px', 
                  border: '1px solid #e2e8f0', 
                  outline: 'none', 
                  fontSize: '14px',
                  width: '250px',
                  backgroundColor: '#f8fafc'
                }}
              />
            </div>
            <div className="header-icon">
              <span className="las la-bell"></span>
              <span className="admin-notify-badge">3</span>
            </div>
            <div className="header-icon">
              <span className="las la-envelope"></span>
              <span className="admin-notify-badge">4</span>
            </div>

            <div className="admin-user-info">
              <div className="admin-user-avatar">{getInitial()}</div>
              <span className="admin-user-name">{user?.full_name || 'Admin'}</span>
            </div>

            <button className="admin-logout-btn" onClick={handleLogout} title="Đăng xuất">
              <span className="las la-power-off"></span>
            </button>
          </div>
        </header>

        {/* Page Content */}
        {children}
      </div>
    </>
  );
}
