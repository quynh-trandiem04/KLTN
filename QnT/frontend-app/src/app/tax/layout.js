'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function TaxLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (pathname !== '/tax/login' && pathname !== '/tax/register') {
      const stored = localStorage.getItem('user');
      if (stored) setUser(JSON.parse(stored));
    }
  }, [pathname]);

  // These pages get their own full layout (no sidebar)
  if (pathname === '/tax' || pathname === '/tax/login' || pathname === '/tax/register' || pathname === '/tax/registrations' || pathname === '/tax/declarations' || pathname === '/tax/audit' || pathname === '/tax/analytics') {
    return <>{children}</>;
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    router.push('/tax/login');
  };

  const navItems = [
    { href: '/tax/registrations', icon: 'fas fa-file-alt', label: 'Hồ sơ đăng ký MST' },
    { href: '/tax/declarations', icon: 'fas fa-file-invoice-dollar', label: 'Khai báo thuế' },
    { href: '/tax/audit', icon: 'fas fa-search', label: 'Tra cứu Hash' },
    { href: '/tax/analytics', icon: 'fas fa-chart-bar', label: 'Phân tích dữ liệu' },
  ];

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-[260px] bg-gradient-to-b from-[#1a1a2e] to-[#16213e] text-white flex flex-col shadow-xl">
        {/* Logo */}
        <div className="px-5 py-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-[#C41E3A] to-[#8B0000] rounded-lg flex items-center justify-center shadow-lg">
              <i className="fas fa-landmark text-white text-lg"></i>
            </div>
            <div>
              <div className="font-bold text-sm tracking-wide">TỔNG CỤC THUẾ</div>
              <div className="text-[11px] text-gray-400">Hệ thống xác minh MST</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map(item => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  active
                    ? 'bg-[#C41E3A] text-white shadow-md shadow-red-900/30'
                    : 'text-gray-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <i className={`${item.icon} w-5 text-center ${active ? 'text-white' : 'text-gray-400'}`}></i>
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User info + Logout */}
        <div className="px-4 py-4 border-t border-white/10">
          {user && (
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-[#C41E3A]/20 flex items-center justify-center">
                <i className="fas fa-user-shield text-[#C41E3A] text-sm"></i>
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">{user.full_name || user.email}</div>
                <div className="text-[11px] text-gray-400 truncate">{user.email}</div>
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2 rounded-lg text-sm text-gray-400 hover:bg-white/10 hover:text-red-400 transition"
          >
            <i className="fas fa-sign-out-alt"></i>
            Đăng xuất
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
