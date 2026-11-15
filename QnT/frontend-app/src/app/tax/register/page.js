'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import './styles.css';

export default function TaxRegisterPage() {
  const [formData, setFormData] = useState({
    tax_code: '',
    business_name: '',
    business_name_en: '',
    business_address: '',
    legal_representative: '',
    phone: '',
    email: '',
    business_type: 'COMPANY',
    business_registration_number: '',
    license_issue_date: '',
    licensing_authority: ''
  });
  const [licenseFile, setLicenseFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
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

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(null);
    setLoading(true);

    try {
      const data = new FormData();
      Object.entries(formData).forEach(([key, val]) => {
        if (val) data.append(key, val);
      });
      if (licenseFile) {
        data.append('business_license_file', licenseFile);
      }
      const response = await axios.post('/v1/tax/register', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setSuccess(response.data);
      setFormData({
        tax_code: '', business_name: '', business_name_en: '',
        business_address: '', legal_representative: '',
        phone: '', email: '', business_type: 'COMPANY',
        business_registration_number: '', license_issue_date: '', licensing_authority: ''
      });
      setLicenseFile(null);
    } catch (err) {
      setError(err.response?.data?.detail || 'Đã xảy ra lỗi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
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
                <Link href="/tax">Trang chủ</Link>
                <Link href="/tax/audit">Tra cứu</Link>
                {!user && <Link href="/tax/register" className="active">Đăng ký MST</Link>}
                {user && <Link href="/tax/registrations">Hồ sơ đăng ký</Link>}
              </nav>
            </div>
          </div>
        </div>
      </header>

      <main className="tax-main">
        <div className="tax-breadcrumb">
          <div className="container">
            <h4 className="tax-breadcrumb-title">Đăng ký mã số thuế doanh nghiệp</h4>
            <ul className="tax-breadcrumb-menu">
              <li><Link href="/tax"><i className="fas fa-home"></i> Trang chủ</Link></li>
              <li className="active">Đăng ký MST</li>
            </ul>
          </div>
        </div>

        <div className="tax-register-area">
          <div className="container">
            <div className="tax-register-wrapper">

              {/* Success message */}
              {success && (
                <div className="tax-success-alert">
                  <i className="fas fa-check-circle"></i>
                  <div>
                    <strong>{success.message}</strong>
                    <p>Mã hồ sơ: #{success.application.id} | MST: {success.application.tax_code}</p>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="tax-error-alert">
                  <i className="fas fa-exclamation-circle"></i>
                  {error}
                </div>
              )}

              {/* Registration form */}
              <div className="tax-register-form">
                <div className="tax-register-header">
                  <div className="tax-login-icon">
                    <i className="fas fa-file-alt"></i>
                  </div>
                  <h3>Hồ sơ đăng ký mã số thuế</h3>
                  <p>Vui lòng điền đầy đủ thông tin doanh nghiệp</p>
                </div>

                <form onSubmit={handleSubmit}>
                  {/* === Section 1: Thông tin doanh nghiệp === */}
                  <div className="tax-form-section">
                    <div className="tax-form-section-title">
                      <i className="fas fa-building"></i> Thông tin doanh nghiệp
                    </div>

                    <div className="tax-form-row">
                      <div className="tax-form-group">
                        <label><i className="fas fa-barcode"></i> Mã số thuế <span className="required">*</span></label>
                        <input
                          type="text"
                          name="tax_code"
                          className="tax-form-control"
                          placeholder="VD: 0309532909"
                          value={formData.tax_code}
                          onChange={handleChange}
                          pattern="[0-9]{10,13}"
                          title="Mã số thuế gồm 10-13 chữ số"
                          required
                        />
                      </div>
                      <div className="tax-form-group">
                        <label><i className="fas fa-briefcase"></i> Loại hình doanh nghiệp <span className="required">*</span></label>
                        <select
                          name="business_type"
                          className="tax-form-control"
                          value={formData.business_type}
                          onChange={handleChange}
                        >
                          <option value="COMPANY">Công ty TNHH</option>
                          <option value="JSC">Công ty Cổ phần</option>
                          <option value="SOLE_PROP">Doanh nghiệp tư nhân</option>
                          <option value="PARTNERSHIP">Công ty Hợp danh</option>
                          <option value="BRANCH">Chi nhánh</option>
                          <option value="REPRESENTATIVE">Văn phòng đại diện</option>
                        </select>
                      </div>
                    </div>

                    <div className="tax-form-group">
                      <label><i className="fas fa-building"></i> Tên doanh nghiệp <span className="required">*</span></label>
                      <input
                        type="text"
                        name="business_name"
                        className="tax-form-control"
                        placeholder="VD: Công ty TNHH ABC Việt Nam"
                        value={formData.business_name}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    <div className="tax-form-group">
                      <label><i className="fas fa-globe"></i> Tên tiếng Anh</label>
                      <input
                        type="text"
                        name="business_name_en"
                        className="tax-form-control"
                        placeholder="VD: ABC Vietnam Co., Ltd"
                        value={formData.business_name_en}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  {/* === Section 2: Thông tin pháp lý === */}
                  <div className="tax-form-section">
                    <div className="tax-form-section-title">
                      <i className="fas fa-gavel"></i> Thông tin pháp lý
                    </div>

                    <div className="tax-form-group">
                      <label><i className="fas fa-user-tie"></i> Người đại diện pháp luật <span className="required">*</span></label>
                      <input
                        type="text"
                        name="legal_representative"
                        className="tax-form-control"
                        placeholder="VD: Nguyễn Văn A"
                        value={formData.legal_representative}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    <div className="tax-form-row">
                      <div className="tax-form-group">
                        <label><i className="fas fa-id-card"></i> Số đăng ký kinh doanh</label>
                        <input
                          type="text"
                          name="business_registration_number"
                          className="tax-form-control"
                          placeholder="VD: 0309532909"
                          value={formData.business_registration_number}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="tax-form-group">
                        <label><i className="fas fa-calendar-alt"></i> Ngày cấp giấy phép</label>
                        <input
                          type="date"
                          name="license_issue_date"
                          className="tax-form-control"
                          value={formData.license_issue_date}
                          onChange={handleChange}
                        />
                      </div>
                    </div>

                    <div className="tax-form-group">
                      <label><i className="fas fa-university"></i> Cơ quan cấp phép</label>
                      <input
                        type="text"
                        name="licensing_authority"
                        className="tax-form-control"
                        placeholder="VD: Sở Kế hoạch và Đầu tư TP. Hồ Chí Minh"
                        value={formData.licensing_authority}
                        onChange={handleChange}
                      />
                    </div>
                  </div>

                  {/* === Section 3: Thông tin liên hệ === */}
                  <div className="tax-form-section">
                    <div className="tax-form-section-title">
                      <i className="fas fa-address-book"></i> Thông tin liên hệ
                    </div>

                    <div className="tax-form-group">
                      <label><i className="fas fa-map-marker-alt"></i> Địa chỉ trụ sở <span className="required">*</span></label>
                      <input
                        type="text"
                        name="business_address"
                        className="tax-form-control"
                        placeholder="VD: 123 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP. Hồ Chí Minh"
                        value={formData.business_address}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    <div className="tax-form-row">
                      <div className="tax-form-group">
                        <label><i className="fas fa-phone"></i> Số điện thoại</label>
                        <input
                          type="text"
                          name="phone"
                          className="tax-form-control"
                          placeholder="VD: 028-1234-5678"
                          value={formData.phone}
                          onChange={handleChange}
                        />
                      </div>
                      <div className="tax-form-group">
                        <label><i className="fas fa-envelope"></i> Email liên hệ</label>
                        <input
                          type="email"
                          name="email"
                          className="tax-form-control"
                          placeholder="VD: info@abc.com.vn"
                          value={formData.email}
                          onChange={handleChange}
                        />
                      </div>
                    </div>
                  </div>

                  {/* === Section 4: Tài liệu === */}
                  <div className="tax-form-section">
                    <div className="tax-form-section-title">
                      <i className="fas fa-paperclip"></i> Tài liệu đính kèm
                    </div>

                    <div className="tax-form-group">
                      <label><i className="fas fa-file-upload"></i> Upload giấy phép kinh doanh</label>
                      <div className="tax-file-upload">
                        <input
                          type="file"
                          id="license-file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          onChange={(e) => setLicenseFile(e.target.files[0] || null)}
                          className="tax-file-input"
                        />
                        <label htmlFor="license-file" className="tax-file-label">
                          <i className="fas fa-cloud-upload-alt"></i>
                          <span>{licenseFile ? licenseFile.name : 'Chọn file PDF, JPG hoặc PNG (tối đa 5MB)'}</span>
                        </label>
                        {licenseFile && (
                          <button type="button" className="tax-file-remove" onClick={() => { setLicenseFile(null); document.getElementById('license-file').value = ''; }}>
                            <i className="fas fa-times"></i>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="tax-btn-submit"
                    disabled={loading}
                  >
                    <i className="fas fa-paper-plane"></i>
                    {loading ? 'Đang gửi hồ sơ...' : 'Nộp hồ sơ đăng ký'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      </main>

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
