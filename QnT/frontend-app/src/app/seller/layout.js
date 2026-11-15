'use client';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import './dashboard/styles.css';

const NAV_ITEMS = [
  { href: '/seller/dashboard', icon: 'la-home',         label: 'Dashboard' },
  { href: '/seller/products',  icon: 'la-box-open',     label: 'Sản phẩm' },
  { href: '/seller/orders',    icon: 'la-shopping-bag', label: 'Đơn hàng' },
  { href: '/seller/coupons',   icon: 'la-ticket-alt',   label: 'Mã giảm giá' },
  { href: '/seller/finance',   icon: 'la-wallet',       label: 'Tài chính' },
];

const PUBLIC_PATHS = ['/seller/login', '/seller/register', '/seller/forgot-password'];

export default function SellerLayout({ children }) {
  const router   = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser]           = useState(null);
  const [ready, setReady]         = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Load Line Awesome once
    if (!document.getElementById('la-css')) {
      const link  = document.createElement('link');
      link.id     = 'la-css';
      link.rel    = 'stylesheet';
      link.href   = 'https://maxst.icons8.com/vue-static/landings/line-awesome/line-awesome/1.3.0/css/line-awesome.min.css';
      document.head.appendChild(link);
    }

    const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));
    if (isPublic) { setReady(true); return; }

    const token    = localStorage.getItem('token');
    const userType = localStorage.getItem('userType');
    const stored   = localStorage.getItem('user');

    if (!token || userType !== 'seller') {
      router.replace('/seller/login');
      return;
    }
    try { setUser(JSON.parse(stored)); } catch { setUser({}); }
    setReady(true);
  }, [pathname, router]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    router.push('/seller/login');
  };

  const isPublic = PUBLIC_PATHS.some(p => pathname.startsWith(p));

  if (!ready) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'#f1f4f9' }}>
        <div style={{ color:'#22BAA0', fontSize:'2rem' }}>
          <i className="las la-spinner la-spin"></i>
        </div>
      </div>
    );
  }

  if (isPublic) return <>{children}</>;

  const storeName = user?.storeName || user?.store_name || user?.email?.split('@')[0] || 'Shop';
  const initial   = storeName.charAt(0).toUpperCase();

  return (
    <div className="seller-wrap">
      {/* SIDEBAR */}
      <aside className={`seller-sidebar${collapsed ? ' collapsed' : ''}`}>
        <div className="seller-side-head">
          <h3><span>Shop</span>Manager</h3>
        </div>
        <div className="seller-side-body">
          <div className="seller-profile">
            <div className="seller-avatar">{initial}</div>
            {!collapsed && (
              <div className="seller-profile-info">
                <h4>{storeName}</h4>
                <small>Chủ gian hàng</small>
              </div>
            )}
          </div>
          <nav className="seller-nav">
            {NAV_ITEMS.map(item => (
              <div key={item.href} className="seller-nav-item">
                <Link href={item.href} className={pathname === item.href || pathname.startsWith(item.href + '/') ? 'active' : ''}>
                  <i className={`las ${item.icon} nav-icon`}></i>
                  <span className="nav-label">{item.label}</span>
                </Link>
              </div>
            ))}
          </nav>
        </div>
      </aside>

      {/* HEADER */}
      <header className={`seller-header${collapsed ? ' collapsed' : ''}`}>
        <span className="header-toggle" onClick={() => setCollapsed(c => !c)}>
          <i className={`las la-${collapsed ? 'indent' : 'outdent'}`}></i>
        </span>
        <div className="header-right">
          <div className="header-user">
            <div className="header-avatar">{initial}</div>
            <span>{storeName}</span>
          </div>
          <button className="header-logout" onClick={handleLogout} title="Đăng xuất">
            <i className="las la-power-off"></i>
          </button>
        </div>
      </header>

      {/* MAIN */}
      <main className={`seller-main${collapsed ? ' collapsed' : ''}`}>
        {children}
      </main>
    </div>
  );
}

