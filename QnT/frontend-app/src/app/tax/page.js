'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import './home.css';

export default function TaxHomePage() {
  const router = useRouter();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const stored = localStorage.getItem('user');
    if (token && stored) {
      setUser(JSON.parse(stored));
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('userType');
    setUser(null);
    router.push('/tax');
  };

  return (
    <>
      {/* ===== HEADER ===== */}
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
                  {user ? (
                    <>
                      <li><span><i className="fas fa-user-shield"></i> {user.full_name || user.email}</span></li>
                      <li><a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}><i className="fas fa-sign-out-alt"></i> Đăng xuất</a></li>
                    </>
                  ) : (
                    <li><a href="/tax/login"><i className="fas fa-sign-in-alt"></i> Đăng nhập cán bộ</a></li>
                  )}
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
                <Link href="/tax" className="active">Trang chủ</Link>
                <Link href="/tax/audit">Tra cứu</Link>
                {!user && <Link href="/tax/register">Đăng ký MST</Link>}
                {user && <Link href="/tax/registrations">Hồ sơ đăng ký</Link>}
                {user && <Link href="/tax/declarations">Khai báo thuế</Link>}
                {user && (
                  <Link href="/tax/analytics">
                    <i className="fas fa-chart-bar" style={{ marginRight: 5 }}></i>Phân tích dữ liệu
                  </Link>
                )}
              </nav>
            </div>
          </div>
        </div>
      </header>

      {/* ===== HERO BANNER ===== */}
      <section className="tax-hero">
        <div className="tax-hero-overlay"></div>
        <div className="container">
          <div className="tax-hero-content">
            <h1>Hệ thống Quản lý Thuế<br/>Sàn Thương mại Điện tử</h1>
            <p>Nền tảng tích hợp của Cơ quan Thuế — đăng ký mã số thuế, khai báo doanh thu hàng tháng và xác minh nghĩa vụ thuế cho các doanh nghiệp kinh doanh trên sàn TMĐT, đảm bảo minh bạch và tuân thủ pháp luật.</p>
            <div className="tax-hero-actions">
              <Link href="/tax/register" className="tax-hero-btn tax-hero-btn-primary">
                <i className="fas fa-file-signature"></i> Đăng ký MST
              </Link>
              <Link href="/tax/audit" className="tax-hero-btn tax-hero-btn-outline">
                <i className="fas fa-search"></i> Tra cứu hồ sơ
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== SERVICES ===== */}
      <main className="tax-main">
        <section className="tax-home-services">
          <div className="container">
            <div className="tax-section-header">
              <h2>Dịch vụ công trực tuyến</h2>
              <p>Bộ công cụ toàn diện hỗ trợ doanh nghiệp và cơ quan thuế quản lý nghĩa vụ thuế TMĐT</p>
            </div>

            <div className="tax-services-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)' }}>
              <Link href="/tax/register" className="tax-service-card">
                <div className="tax-service-icon tax-service-icon-red">
                  <i className="fas fa-file-signature"></i>
                </div>
                <h3>Đăng ký MST mới</h3>
                <p>Doanh nghiệp nộp hồ sơ đăng ký mã số thuế trực tuyến. Cơ quan thuế xét duyệt và cấp MST vào sổ đăng ký quốc gia.</p>
                <span className="tax-service-link">Bắt đầu đăng ký <i className="fas fa-arrow-right"></i></span>
              </Link>

              <Link href="/tax/declarations" className="tax-service-card">
                <div className="tax-service-icon" style={{ background: 'linear-gradient(135deg,#f0fdf4,#dcfce7)', color: '#15803d' }}>
                  <i className="fas fa-file-invoice-dollar"></i>
                </div>
                <h3>Khai báo &amp; Nộp thuế</h3>
                <p>Seller khai báo doanh thu hàng tháng. Hệ thống tự động đối chiếu với dữ liệu hóa đơn thực tế và xác định nghĩa vụ thuế.</p>
                <span className="tax-service-link">Xem khai báo <i className="fas fa-arrow-right"></i></span>
              </Link>

              <Link href="/tax/audit" className="tax-service-card">
                <div className="tax-service-icon tax-service-icon-blue">
                  <i className="fas fa-shield-alt"></i>
                </div>
                <h3>Tra cứu &amp; Xác minh</h3>
                <p>Tra cứu tình trạng hồ sơ, xác minh MST và kiểm tra tính toàn vẹn dữ liệu trên Blockchain theo mã hash giao dịch.</p>
                <span className="tax-service-link">Tra cứu ngay <i className="fas fa-arrow-right"></i></span>
              </Link>

              <Link href="/tax/login" className="tax-service-card">
                <div className="tax-service-icon tax-service-icon-green">
                  <i className="fas fa-user-shield"></i>
                </div>
                <h3>Cổng cán bộ thuế</h3>
                <p>Đăng nhập hệ thống quản trị dành cho cán bộ cơ quan thuế: xét duyệt hồ sơ, kiểm tra khai báo và theo dõi nộp thuế.</p>
                <span className="tax-service-link">Đăng nhập <i className="fas fa-arrow-right"></i></span>
              </Link>
            </div>
          </div>
        </section>

        {/* ===== PROCESS FLOW ===== */}
        <section className="tax-home-process">
          <div className="container">
            <div className="tax-section-header">
              <h2>Quy trình quản lý thuế TMĐT</h2>
              <p>05 bước từ đăng ký mã số thuế đến hoàn thành nghĩa vụ nộp thuế hàng tháng</p>
            </div>

            <div className="tax-process-steps" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
              <div className="tax-process-step">
                <div className="tax-process-number">1</div>
                <div className="tax-process-line"></div>
                <h4>Đăng ký MST</h4>
                <p>Doanh nghiệp nộp hồ sơ đăng ký mã số thuế kèm giấy phép kinh doanh</p>
              </div>
              <div className="tax-process-step">
                <div className="tax-process-number">2</div>
                <div className="tax-process-line"></div>
                <h4>Xét duyệt &amp; Cấp MST</h4>
                <p>Cơ quan thuế kiểm tra hồ sơ, phê duyệt và ghi vào sổ đăng ký thuế</p>
              </div>
              <div className="tax-process-step">
                <div className="tax-process-number">3</div>
                <div className="tax-process-line"></div>
                <h4>Khai báo thuế</h4>
                <p>Hàng tháng seller khai báo doanh thu và số thuế phải nộp theo kỳ</p>
              </div>
              <div className="tax-process-step">
                <div className="tax-process-number">4</div>
                <div className="tax-process-line"></div>
                <h4>Đối chiếu &amp; Duyệt</h4>
                <p>Hệ thống tự động đối chiếu khai báo với dữ liệu hóa đơn thực tế</p>
              </div>
              <div className="tax-process-step">
                <div className="tax-process-number">5</div>
                <h4>Xác nhận nộp thuế</h4>
                <p>Ghi nhận thanh toán, cập nhật trạng thái và lưu vết trên Blockchain</p>
              </div>
            </div>
          </div>
        </section>

        {/* ===== STATS ===== */}
        <section className="tax-home-stats">
          <div className="container">
            <div className="tax-stats-row">
              <div className="tax-home-stat">
                <i className="fas fa-store"></i>
                <div className="tax-home-stat-value">Seller</div>
                <div className="tax-home-stat-label">Doanh nghiệp TMĐT</div>
              </div>
              <div className="tax-home-stat">
                <i className="fas fa-file-invoice-dollar"></i>
                <div className="tax-home-stat-value">Hàng tháng</div>
                <div className="tax-home-stat-label">Kỳ khai báo thuế</div>
              </div>
              <div className="tax-home-stat">
                <i className="fas fa-robot"></i>
                <div className="tax-home-stat-value">Tự động</div>
                <div className="tax-home-stat-label">Đối chiếu hóa đơn</div>
              </div>
              <div className="tax-home-stat">
                <i className="fas fa-cubes"></i>
                <div className="tax-home-stat-value">Blockchain</div>
                <div className="tax-home-stat-label">Xác thực dữ liệu</div>
              </div>
            </div>
          </div>
        </section>
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
