'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import WishlistIcon from '@/components/WishlistIcon';
import api from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';
import { PROVINCES } from './provinces';
import './styles.css';

const PAYMENT_METHOD_LABELS = { credit: 'Thẻ tín dụng', momo: 'MoMo', banking: 'Chuyển khoản', cod: 'COD' };

function formatPrice(p) {
  if (!p && p !== 0) return '';
  return Number(p).toLocaleString('vi-VN') + '₫';
}

function getItemPrice(item) {
  if (item.variant_id) {
    return Number(item.variant_promotional_price || item.variant_price || 0);
  }
  return Number(item.promotionalprice || item.product_price || 0);
}

export default function CheckoutPage() {
  const router = useRouter();
  const { user, clearUser } = useUserStore();
  const { items, count: cartCount, fetchCart, clearLocal } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);

  // Carriers
  const [carriers, setCarriers] = useState([]);
  const [selectedCarrier, setSelectedCarrier] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [carrierFee, setCarrierFee] = useState(0);
  const [feeBreakdown, setFeeBreakdown] = useState(null);
  const [useInsurance, setUseInsurance] = useState(false);

  // Accordion state: 1, 2, or 3
  const [activeStep, setActiveStep] = useState(1);

  // Payment tab
  const [paymentTab, setPaymentTab] = useState('cod');

  // Form states
  const [billingForm, setBillingForm] = useState({
    firstName: '', lastName: '', email: '', phone: '',
    address1: '', address2: '', country: '', city: '',
    postCode: '', state: '', message: ''
  });

  const [shippingForm, setShippingForm] = useState({
    sameAsBilling: true,
    firstName: '', lastName: '', email: '', phone: '',
    address1: '', address2: '', country: '', city: '',
    postCode: '', state: ''
  });

  const [paymentForm, setPaymentForm] = useState({
    cardName: '', cardNumber: '', expireDate: '', cvv: '',
    paypalEmail: '', paypalPassword: '',
    payoneerEmail: '', payoneerPassword: '',
    codAccepted: false
  });

  const [error, setError] = useState('');
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddress, setSelectedAddress] = useState(null);
  
  // Address Book Modals
  const [showAddressModal, setShowAddressModal] = useState(false);
  const [showFormModal, setShowFormModal] = useState(false);
  const [addressFormData, setAddressFormData] = useState({ id: null, label: 'Nhà', full_name: '', phone: '', address_line1: '', address_line2: '', province: '', district: '', is_default: false });
  const [formError, setFormError] = useState('');

  // Coupons
  const [shopCouponCode, setShopCouponCode] = useState('');
  const [platformCouponCode, setPlatformCouponCode] = useState('');
  const [shopCoupon, setShopCoupon] = useState(null);
  const [platformCoupon, setPlatformCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  // Coupon picker modal
  const [showCouponModal, setShowCouponModal] = useState(false);
  const [couponModalTab, setCouponModalTab] = useState('shop'); // 'shop' | 'platform'
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [loadingCoupons, setLoadingCoupons] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [manualError, setManualError] = useState('');

  useEffect(() => { setMounted(true); }, []);

  // Fetch carriers on mount — auto-select cheapest (first) carrier
  useEffect(() => {
    fetch('http://localhost:4000/api/v1/shipping/carriers')
      .then(r => r.json())
      .then(d => {
        const list = d.carriers || [];
        setCarriers(list);
        if (list.length > 0) {
          // Chọn carrier đầu tiên (sau khi tính phí sẽ so sánh, tạm thời chọn carrier[0])
          setSelectedCarrier(list[0].user_id);
          const firstSvc = list[0].services?.[0];
          if (firstSvc) setSelectedService(firstSvc.id);
        }
      })
      .catch(() => {});
  }, []);

  const loadAddresses = async () => {
    try {
      const r = await fetch('http://localhost:4000/api/v1/orders/addresses', { headers: { Authorization: getAuthHeader() } });
      const d = await r.json();
      const list = d.addresses || [];
      setSavedAddresses(list);
      // Auto-select default if none selected
      if (!selectedAddress && list.length > 0) {
          setSelectedAddress(list.find(a => a.is_default) || list[0]);
      } else if (selectedAddress) {
          // Update selected address if it was modified
          const stillExists = list.find(a => a.id === selectedAddress.id);
          setSelectedAddress(stillExists || (list.find(a => a.is_default) || list[0]));
      }
    } catch(e) {}
  };

  useEffect(() => {
    if (mounted && !user) {
      router.push('/login');
      return;
    }
    if (mounted && user) {
      // Pre-fill from user data
      setBillingForm(prev => ({
        ...prev,
        email: user.email || '',
        firstName: user.full_name?.split(' ')[0] || '',
        lastName: user.full_name?.split(' ').slice(1).join(' ') || '',
        phone: user.phone || ''
      }));
      fetchCart().finally(() => setLoading(false));
      loadAddresses();
    }
  }, [mounted, user]);

  const handleLogout = () => { clearUser(); router.push('/login'); };

  const handleSaveAddrSubmit = async () => {
    if (!addressFormData.full_name || !addressFormData.phone || !addressFormData.address_line1 || !addressFormData.province) {
      setFormError('Vui lòng điền đầy đủ các mục bắt buộc (*)');
      return;
    }
    setFormError('');
    try {
      const isEdit = !!addressFormData.id;
      const url = isEdit ? `http://localhost:4000/api/v1/orders/addresses/${addressFormData.id}` : 'http://localhost:4000/api/v1/orders/addresses';
      const method = isEdit ? 'PUT' : 'POST';
      
      const r = await fetch(url, {
        method,
        headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(addressFormData),
      });
      const d = await r.json();
      if (!r.ok) {
        setFormError(d.detail || 'Lỗi lưu địa chỉ');
        return;
      }
      await loadAddresses();
      setShowFormModal(false);
    } catch(e) { setFormError('Không thể kết nối máy chủ'); }
  };

  const handleDeleteAddress = async (id) => {
    if (!confirm('Bạn có chắc chắn muốn xóa địa chỉ này?')) return;
    try {
      await fetch(`http://localhost:4000/api/v1/orders/addresses/${id}`, {
        method: 'DELETE',
        headers: { Authorization: getAuthHeader() }
      });
      // Nếu địa chỉ bị xóa là địa chỉ đang chọn
      if (selectedAddress?.id === id) {
        setSelectedAddress(null);
      }
      await loadAddresses();
    } catch(e) {}
  };


  // Nhóm sản phẩm theo shop
  const shopGroups = useMemo(() => {
    const groups = {};
    for (const item of items) {
      const key = item.store_id != null ? String(item.store_id) : 'unknown';
      if (!groups[key]) {
        groups[key] = { store_id: item.store_id, store_name: item.store_name || 'Cửa hàng', items: [] };
      }
      groups[key].items.push(item);
    }
    return Object.values(groups);
  }, [items]);

  const shippingFee = carrierFee;
  const subTotal = items.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0);
  const totalDiscount = (shopCoupon?.discount || 0) + (platformCoupon?.discount || 0);
  const total = Math.max(0, subTotal + shippingFee - totalDiscount);

  // Recalculate shipping fee when carrier/service/destination/payment/insurance changes
  useEffect(() => {
    if (!selectedCarrier) { setCarrierFee(0); setFeeBreakdown(null); return; }
    const city = selectedAddress?.province || billingForm.city;
    const totalWeight = items.reduce((sum, item) => sum + (item.product_weight || 0.5) * item.quantity, 0);
    const isCOD = paymentTab === 'cod';
    const params = new URLSearchParams({
      carrier_id: selectedCarrier,
      weight: totalWeight,
      dest_province: city || '',
      order_value: subTotal,
      payment: isCOD ? 'COD' : 'PREPAID',
      use_insurance: useInsurance,
    });
    if (selectedService) params.set('service_id', selectedService);
    fetch(`http://localhost:4000/api/v1/shipping/calculate?${params}`)
      .then(r => r.json())
      .then(d => { setCarrierFee(d.total_fee || d.fee || 0); setFeeBreakdown(d); })
      .catch(() => { setCarrierFee(0); setFeeBreakdown(null); });
  }, [selectedCarrier, selectedService, selectedAddress, billingForm.city, items, paymentTab, useInsurance, subTotal]);

  const validateCoupon = async (code, isplatform) => {
    if (!code.trim()) return;
    setCouponError('');
    try {
      const storeId = shopGroups.length === 1 ? shopGroups[0].store_id : undefined;
      const r = await fetch('http://localhost:4000/api/v1/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ code: code.trim(), orderValue: subTotal, storeId: isplatform ? undefined : storeId })
      });
      const d = await r.json();
      if (!r.ok) { setCouponError(d.detail || 'Mã không hợp lệ'); return; }
      if (isplatform) setPlatformCoupon(d);
      else setShopCoupon(d);
    } catch { setCouponError('Không thể xác minh mã'); }
  };

  const fetchAvailableCoupons = async () => {
    setLoadingCoupons(true);
    try {
      const storeId = shopGroups.length === 1 ? shopGroups[0].store_id : undefined;
      const qs = storeId ? `?storeId=${storeId}` : '';
      const r = await fetch(`http://localhost:4000/api/v1/coupons${qs}`, {
        headers: { Authorization: getAuthHeader() }
      });
      const list = await r.json();
      // Calculate discount for each coupon based on current subTotal
      const withDiscount = (Array.isArray(list) ? list : []).map(c => {
        let discount = 0;
        if (c.isactive && new Date(c.startdate) <= new Date() && new Date(c.enddate) >= new Date()) {
          if (!c.minordervalue || subTotal >= Number(c.minordervalue)) {
            if (c.discounttype === 'PERCENTAGE') {
              discount = subTotal * Number(c.discountvalue) / 100;
              if (c.maxdiscount) discount = Math.min(discount, Number(c.maxdiscount));
            } else {
              discount = Math.min(Number(c.discountvalue), subTotal);
            }
          }
        }
        return { ...c, calcDiscount: Math.round(discount) };
      });
      setAvailableCoupons(withDiscount);
    } catch { setAvailableCoupons([]); }
    setLoadingCoupons(false);
  };

  const openCouponModal = (tab = 'shop') => {
    setCouponModalTab(tab);
    setManualCode('');
    setManualError('');
    setShowCouponModal(true);
    fetchAvailableCoupons();
  };

  const selectCoupon = (c, isplatform) => {
    const obj = { coupon: c, discount: c.calcDiscount };
    if (isplatform) { setPlatformCoupon(obj); setPlatformCouponCode(c.code); }
    else { setShopCoupon(obj); setShopCouponCode(c.code); }
    setShowCouponModal(false);
  };

  const applyManualCode = async () => {
    if (!manualCode.trim()) return;
    setManualError('');
    try {
      const isplatform = couponModalTab === 'platform';
      const storeId = shopGroups.length === 1 ? shopGroups[0].store_id : undefined;
      const r = await fetch('http://localhost:4000/api/v1/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify({ code: manualCode.trim().toUpperCase(), orderValue: subTotal, storeId: isplatform ? undefined : storeId })
      });
      const d = await r.json();
      if (!r.ok) { setManualError(d.detail || 'Mã không hợp lệ'); return; }
      if (isplatform) { setPlatformCoupon(d); setPlatformCouponCode(d.coupon.code); }
      else { setShopCoupon(d); setShopCouponCode(d.coupon.code); }
      setShowCouponModal(false);
    } catch { setManualError('Không thể xác minh mã'); }
  };



  const handlePlaceOrder = async () => {
    setError('');
    const addrLine1 = selectedAddress?.address_line1 || billingForm.address1;
    const addrLine2 = selectedAddress?.address_line2 || billingForm.address2;
    const city = selectedAddress?.province || billingForm.city;
    const district = selectedAddress?.district || billingForm.state;
    const phone = selectedAddress?.phone || billingForm.phone;
    if (!addrLine1) { setError('Vui lòng chọn hoặc nhập địa chỉ giao hàng.'); setActiveStep(1); return; }
    if (!selectedCarrier) { setError('Vui lòng chọn đơn vị vận chuyển.'); setActiveStep(2); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/v1/orders', {
        shippingAddressLine1: addrLine1,
        shippingAddressLine2: addrLine2,
        shippingCity: city,
        shippingDistrict: district,
        phone,
        paymentMethod: paymentTab === 'cod' ? 'COD' : 'PREPAID',
        carrierId: selectedCarrier || undefined,
        serviceId: selectedService || undefined,
        useInsurance,
        destinationProvince: city || undefined,
        note: billingForm.message,
        shopCouponId: shopCoupon?.coupon?.id || undefined,
        platformCouponId: platformCoupon?.coupon?.id || undefined,
      });
      clearLocal();
      setOrderSuccess(res.data.orders || []);
    } catch (e) {
      setError(e.response?.data?.detail || 'Đặt hàng thất bại, vui lòng thử lại.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleStep = (step) => {
    setActiveStep(activeStep === step ? 0 : step);
  };

  if (!mounted) return null;

  // Success screen
  if (orderSuccess) {
    return (
      <>
        <header className="header">
          <div className="header-top">
            <div className="container">
              <div className="header-top-wrapper">
                <div className="row">
                  <div className="col-12 col-md-6 col-lg-6 col-xl-5">
                    <div className="header-top-left">
                      <ul className="header-top-list">
                        <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i> info@example.com</a></li>
                        <li><a href="tel:+21236547898"><i className="fas fa-headset"></i> +2 123 654 7898</a></li>
                      </ul>
                    </div>
                  </div>
                  <div className="col-12 col-md-6 col-lg-6 col-xl-7">
                    <div className="header-top-right">
                      <ul className="header-top-list">
                        {user ? (
                          <>
                            <li><Link href="/profile"><i className="fas fa-user"></i> {user.full_name || user.email}</Link></li>
                            <li><button onClick={handleLogout} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', fontSize:'inherit' }}><i className="fas fa-sign-out-alt"></i> Logout</button></li>
                          </>
                        ) : (
                          <>
                            <li><Link href="/login"><i className="fas fa-sign-in-alt"></i> Login</Link></li>
                            <li><Link href="/register"><i className="fas fa-user-plus"></i> Register</Link></li>
                          </>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="main-navigation">
            <nav className="navbar navbar-expand-lg">
              <div className="container position-relative">
                <Link href="/" className="navbar-brand">
                  <img src="/assets/img/logo/logo.png" alt="logo" style={{ maxWidth:'120px', margin:'0 10px', transform:'translateY(18px)' }} />
                </Link>
                <div className="mobile-menu-right">
                  <div className="mobile-menu-btn">
                    <Link href="/cart" className="nav-right-link"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</Link>
                  </div>
                </div>
                <div className="navbar-collapse">
                  <ul className="navbar-nav">
                    <li className="nav-item"><Link className="nav-link" href="/">Home</Link></li>
                    <li className="nav-item"><Link className="nav-link" href="/about">About</Link></li>
                    <li className="nav-item"><Link className="nav-link" href="/shop-search">Shop</Link></li>
                    <li className="nav-item"><Link className="nav-link" href="/contact">Contact</Link></li>
                  </ul>
                  <div className="nav-right">
                    <ul className="nav-right-list">
                      <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                      <li><Link href="/profile?tab=wishlist" className="list-link"><i className="fas fa-heart"></i></Link></li>
                      <li><Link href="/cart" className="list-link"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</Link></li>
                    </ul>
                  </div>
                </div>
              </div>
            </nav>
          </div>
        </header>

        <main className="main">
          <div className="site-breadcrumb">
            <div className="site-breadcrumb-bg" style={{background: 'url(/assets/img/breadcrumb/01.jpg)'}}></div>
            <div className="container">
              <div className="site-breadcrumb-wrap">
                <h4 className="breadcrumb-title">Đặt Hàng Thành Công</h4>
                <ul className="breadcrumb-menu">
                  <li><Link href="/"><i className="far fa-home"></i> Home</Link></li>
                  <li className="active">Checkout Complete</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="shop-checkout-complete py-100">
            <div className="container w-100">
              <div className="row justify-content-center">
                <div className="col-md-10 col-lg-8 col-xl-6 mx-auto">
                  <div className="checkout-complete-wrap" style={{animation: 'dropIn 0.5s ease both', animationFillMode: 'both'}}>
                    {/* Success Icon */}
                    <div className="checkout-complete-icon-wrap">
                      <i className="fas fa-check"></i>
                    </div>

                    <h2>Đặt hàng thành công!</h2>
                    <p>
                      {orderSuccess.length > 1
                        ? `Đã tạo ${orderSuccess.length} đơn hàng từ ${orderSuccess.length} shop khác nhau.`
                        : 'Đơn hàng của bạn đã được ghi nhận.'}
                    </p>

                    {/* Order Cards */}
                    <div>
                      {orderSuccess.map((order) => (
                        <div key={order.id} className="checkout-complete-order-card">
                          <div>
                            <div className="checkout-complete-store-name">
                              <i className="fas fa-store"></i>{order.storename || 'Cửa hàng'}
                            </div>
                            <div className="checkout-complete-order-id">
                              Mã đơn hàng: <span>{order.id}</span>
                            </div>
                          </div>
                          <div className="checkout-complete-price">
                            {formatPrice(order.finalprice || order.total_amount)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Total if multiple orders */}
                    {orderSuccess.length > 1 && (
                      <div className="checkout-complete-total">
                        <span><i className="fas fa-receipt" style={{ marginRight: 8 }}></i>Tổng cộng</span>
                        <span className="total-value">
                          {formatPrice(orderSuccess.reduce((sum, o) => sum + Number(o.finalprice || o.total_amount || 0), 0))}
                        </span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="checkout-complete-actions">
                      <Link href="/profile?tab=orders" className="theme-btn">
                        <i className="fas fa-list-alt" style={{ marginRight: 8 }}></i>Xem đơn hàng
                      </Link>
                      <Link href="/shop-search" className="theme-btn theme-btn2">
                        <i className="fas fa-shopping-bag" style={{ marginRight: 8 }}></i>Tiếp tục mua sắm
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        <footer className="footer-area ft-bg">
          <div className="footer-widget">
            <div className="container">
              <div className="row footer-widget-wrapper pt-100 pb-40">
                <div className="col-md-6 col-lg-3">
                  <div className="footer-widget-box about-us">
                    <Link href="/" className="footer-logo">
                      <img src="/assets/img/logo/logo-light.png" alt="" />
                    </Link>
                    <p className="mb-3">{'Nền tảng thương mại điện tử hiện đại với công nghệ blockchain'}</p>
                    <ul className="footer-contact">
                      <li><a href="tel:+84123456789"><i className="fas fa-phone"></i>+84 123 456 789</a></li>
                      <li><i className="fas fa-map-marker-alt"></i>{'Hà Nội, Việt Nam'}</li>
                      <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i>info@example.com</a></li>
                    </ul>
                  </div>
                </div>
                <div className="col-md-6 col-lg-2">
                  <div className="footer-widget-box list">
                    <h4 className="footer-widget-title">{'Liên kết'}</h4>
                    <ul className="footer-list">
                      <li><Link href="/about">About Us</Link></li>
                      <li><Link href="/contact">Contact</Link></li>
                      <li><Link href="/blog">News</Link></li>
                    </ul>
                  </div>
                </div>
                <div className="col-md-6 col-lg-2">
                  <div className="footer-widget-box list">
                    <h4 className="footer-widget-title">{'Danh mục'}</h4>
                    <ul className="footer-list">
                      <li><Link href="/shop-search">{'Thời trang'}</Link></li>
                      <li><Link href="/shop-search">{'Điện tử'}</Link></li>
                      <li><Link href="/shop-search">{'Nội thất'}</Link></li>
                    </ul>
                  </div>
                </div>
                <div className="col-md-6 col-lg-3">
                  <div className="footer-widget-box list">
                    <h4 className="footer-widget-title">{'Thanh toán'}</h4>
                    <div className="footer-payment mt-20">
                      <span>{'Chúng tôi chấp nhận:'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="copyright">
            <div className="container">
              <div className="copyright-wrap">
                <div className="row">
                  <div className="col-12 col-lg-6 align-self-center">
                    <p className="copyright-text">&copy; Copyright 2026 <a href="/"> E-Commerce </a> All Rights Reserved.</p>
                  </div>
                  <div className="col-12 col-lg-6 align-self-center">
                    <div className="footer-social">
                      <span>{'Theo dõi:'}</span>
                      <a href="#"><i className="fab fa-facebook-f"></i></a>
                      <a href="#"><i className="fab fa-x-twitter"></i></a>
                      <a href="#"><i className="fab fa-youtube"></i></a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </footer>
        <a href="#" id="scroll-top"><i className="fas fa-arrow-up"></i></a>
      </>
    );
  }

  return (
    <>
      <header className="header">
        <div className="header-top">
          <div className="container">
            <div className="header-top-wrapper">
              <div className="row">
                <div className="col-12 col-md-6 col-lg-6 col-xl-5">
                  <div className="header-top-left">
                    <ul className="header-top-list">
                      <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i> info@example.com</a></li>
                      <li><a href="tel:+21236547898"><i className="fas fa-headset"></i> +2 123 654 7898</a></li>
                    </ul>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-6 col-xl-7">
                  <div className="header-top-right">
                    <ul className="header-top-list">
                      {user ? (
                        <>
                          <li><Link href="/profile"><i className="fas fa-user"></i> {user.full_name || user.email}</Link></li>
                          <li><button onClick={handleLogout} style={{ background:'none', border:'none', color:'inherit', cursor:'pointer', fontSize:'inherit' }}><i className="fas fa-sign-out-alt"></i> Logout</button></li>
                        </>
                      ) : (
                        <>
                          <li><Link href="/login"><i className="fas fa-sign-in-alt"></i> Login</Link></li>
                          <li><Link href="/register"><i className="fas fa-user-plus"></i> Register</Link></li>
                        </>
                      )}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="main-navigation">
          <nav className="navbar navbar-expand-lg">
            <div className="container position-relative">
              <Link href="/" className="navbar-brand">
                <img src="/assets/img/logo/logo.png" alt="logo" style={{ maxWidth:'120px', margin:'0 10px', transform:'translateY(18px)' }} />
              </Link>
              <div className="mobile-menu-right">
                <div className="mobile-menu-btn">
                  <Link href="/cart" className="nav-right-link"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</Link>
                </div>
              </div>
              <div className="navbar-collapse">
                <ul className="navbar-nav">
                  <li className="nav-item"><Link className="nav-link" href="/">Home</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/about">About</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/shop-search">Shop</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/contact">Contact</Link></li>
                </ul>
                <div className="nav-right">
                  <ul className="nav-right-list">
                    <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                    <li><WishlistIcon linkClass="list-link" /></li>
                    <li><Link href="/cart" className="list-link"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</Link></li>
                  </ul>
                </div>
              </div>
            </div>
          </nav>
        </div>
      </header>

      <main className="main">
        {/* Breadcrumb */}
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{background: 'url(/assets/img/breadcrumb/01.jpg)'}}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">Thanh Toán</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="far fa-home"></i> Home</Link></li>
                <li className="active">Checkout</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Checkout */}
        <div className="shop-checkout py-90">
          <div className="container">
            {loading ? (
              <div style={{ textAlign:'center', padding:'60px 0' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize:32, color:'#5C86B8' }}></i>
                <p style={{ marginTop:16, color:'#999' }}>{'Đang tải...'}</p>
              </div>
            ) : items.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 0' }}>
                <i className="fas fa-shopping-cart" style={{ fontSize:64, color:'#ddd', marginBottom:20 }}></i>
                <h3 style={{ color:'#999', marginBottom:16 }}>{'Giỏ hàng trống'}</h3>
                <p style={{ color:'#aaa', marginBottom:24 }}>{'Vui lòng thêm sản phẩm trước khi thanh toán'}</p>
                <Link href="/shop-search" className="theme-btn">{'Mua sắm ngay'} <i className="fas fa-arrow-right"></i></Link>
              </div>
            ) : (
              <div className="shop-checkout-wrap">
                <div className="row">
                  <div className="col-lg-8">
                    <div className="shop-checkout-step">
                      <div className="accordion" id="shopCheckout">
                        {/* Step 1: Billing Address */}
                        <div className="accordion-item">
                          <h2 className="accordion-header">
                            <button
                              className={`accordion-button${activeStep !== 1 ? ' collapsed' : ''}`}
                              type="button"
                              onClick={() => toggleStep(1)}
                            >
                              {'Thông tin giao hàng'}
                            </button>
                          </h2>
                          <div className={`accordion-collapse${activeStep === 1 ? ' show' : ''}`}>
                            <div className="accordion-body">
                              <div className="shop-checkout-form">
                                {error && <div className="error-alert">{error}</div>}
                                
                                <div className="shop-checkout-address-box" style={{border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, background: '#fff', position: 'relative', overflow: 'hidden', marginBottom: 16}}>
                                  <div style={{position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'repeating-linear-gradient(45deg, #6fa6d6, #6fa6d6 33px, transparent 0, transparent 41px, #f18d9b 0, #f18d9b 74px, transparent 0, transparent 82px)'}}></div>
                                  <div style={{display: 'flex', alignItems: 'center', marginBottom: 12}}>
                                    <i className="fas fa-map-marker-alt" style={{color: 'var(--theme-color)', fontSize: 18, marginRight: 8}}></i>
                                    <h6 style={{margin: 0, fontSize: 16, color: '#222'}}>Địa Chỉ Nhận Hàng</h6>
                                  </div>
                                  
                                  {selectedAddress ? (
                                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                      <div>
                                        <div style={{fontWeight: 700, color: '#333', fontSize: 14, marginBottom: 4}}>
                                          {selectedAddress.full_name} <span style={{fontWeight: 400, color: '#666', margin: '0 8px'}}>|</span> {selectedAddress.phone}
                                        </div>
                                        <div style={{color: '#555', fontSize: 13}}>
                                          {selectedAddress.address_line1} {selectedAddress.address_line2 ? `, ${selectedAddress.address_line2}` : ''}
                                        </div>
                                        <div style={{color: '#555', fontSize: 13}}>
                                          {selectedAddress.district ? `${selectedAddress.district}, ` : ''}{selectedAddress.province}
                                        </div>
                                        {selectedAddress.is_default && (
                                          <span style={{display: 'inline-block', border: '1px solid var(--theme-color)', color: 'var(--theme-color)', fontSize: 10, padding: '2px 4px', borderRadius: 2, marginTop: 6, fontWeight: 500}}>Mặc định</span>
                                        )}
                                      </div>
                                      <button type="button" onClick={() => setShowAddressModal(true)} style={{background: 'none', border: 'none', color: 'var(--theme-color)', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '8px 16px'}}>
                                        THAY ĐỔI
                                      </button>
                                    </div>
                                  ) : (
                                    <div style={{textAlign: 'center', padding: '20px 0'}}>
                                      <p style={{color: '#666', marginBottom: 16}}>Bạn chưa có địa chỉ giao hàng nào.</p>
                                      <button type="button" className="theme-btn" onClick={() => { setAddressFormData({ id: null, label: 'Nhà', full_name: user?.full_name || '', phone: user?.phone || '', address_line1: '', address_line2: '', province: '', district: '', is_default: true }); setShowFormModal(true); setFormError(''); }}>
                                        <i className="fas fa-plus"></i> Thêm Địa Chỉ Mới
                                      </button>
                                    </div>
                                  )}
                                </div>

                                <div className="row">
                                  <div className="col-lg-12">
                                    <div className="form-group">
                                      <label>{'Ghi chú đơn hàng'}</label>
                                      <textarea cols="30" rows="3" className="form-control" placeholder={'Ghi chú của bạn...'}
                                        style={{resize:'none'}}
                                        value={billingForm.message}
                                        onChange={e => setBillingForm({...billingForm, message: e.target.value})} />
                                    </div>
                                  </div>

                                  <div className="col-lg-12" style={{display:'flex',justifyContent:'space-between',marginTop:8}}>
                                    <button type="button" className="theme-btn theme-btn2" onClick={() => router.push('/cart')}>
                                      <span className="fas fa-arrow-left"></span>{'Quay lại giỏ hàng'}
                                    </button>
                                    <button type="button" className="theme-btn" onClick={() => setActiveStep(2)}>
                                      {'Tiếp theo'}<i className="fas fa-arrow-right"></i>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Step 2: Shipping Address */}
                        <div className="accordion-item">
                          <h2 className="accordion-header">
                            <button
                              className={`accordion-button${activeStep !== 2 ? ' collapsed' : ''}`}
                              type="button"
                              onClick={() => toggleStep(2)}
                            >
                              {'Đơn vị vận chuyển'}
                            </button>
                          </h2>
                          <div className={`accordion-collapse${activeStep === 2 ? ' show' : ''}`}>
                            <div className="accordion-body">
                              <div className="row">
                                <div className="col-lg-12">
                                  <div className="shop-shipping-method">
                                      {carriers.length === 0 ? (
                                        <p style={{color:'#999',fontSize:14,margin:'8px 0'}}>Chưa có đơn vị vận chuyển nào</p>
                                      ) : (
                                        <div style={{display:'flex',flexDirection:'column',gap:8}}>
                                          {carriers.map((carrier, ci) => {
                                            const isSel = selectedCarrier === carrier.user_id;
                                            const svcList = carrier.services || [];
                                            return (
                                              <div key={ci} className={`shop-payment-item${isSel?' active':''}`}
                                                style={{border:`1.5px solid ${isSel?'var(--theme-color)':'var(--color-gray)'}`,borderRadius:8,overflow:'hidden',background:'#fff'}}>
                                                {/* Carrier header */}
                                                <div onClick={()=>{ setSelectedCarrier(carrier.user_id); setSelectedService(carrier.services?.[0]?.id||null); }}
                                                  style={{padding:'10px 14px',cursor:'pointer',display:'flex',alignItems:'center',gap:12,background:isSel?'var(--theme-color-light)':'#fff'}}>
                                                  <div style={{width:36,height:36,borderRadius:6,background:'#f0f4fa',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                                    {carrier.logo_url
                                                      ? <img src={carrier.logo_url} alt="" style={{width:32,height:32,objectFit:'contain'}}/>
                                                      : <i className="fas fa-truck" style={{fontSize:16,color:'var(--theme-color)'}}></i>}
                                                  </div>
                                                  <div style={{flex:1}}>
                                                    <div style={{fontWeight:600,fontSize:14,color:'var(--color-dark)'}}>{carrier.display_name}</div>
                                                    {carrier.description && <div style={{fontSize:12,color:'var(--body-text-color)'}}>{carrier.description}</div>}
                                                  </div>
                                                  <div style={{width:20,height:20,borderRadius:'50%',border:`2px solid ${isSel?'var(--theme-color)':'#ccc'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                                    {isSel && <div style={{width:10,height:10,borderRadius:'50%',background:'var(--theme-color)'}}></div>}
                                                  </div>
                                                </div>
                                                {/* Services */}
                                                {isSel && svcList.length > 0 && (
                                                  <div style={{borderTop:'1px solid var(--color-gray)',padding:'8px 14px',display:'flex',flexDirection:'column',gap:6}}>
                                                    {svcList.map((svc, si) => {
                                                      const isSvcSel = selectedService === svc.id;
                                                      return (
                                                        <label key={si} onClick={()=>setSelectedService(svc.id)}
                                                          style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 10px',borderRadius:6,cursor:'pointer',background:isSvcSel?'var(--theme-color-light)':'#fafafa',border:`1px solid ${isSvcSel?'var(--theme-color)':'transparent'}`}}>
                                                          <div style={{display:'flex',alignItems:'center',gap:8}}>
                                                            <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${isSvcSel?'var(--theme-color)':'#bbb'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                                                              {isSvcSel && <div style={{width:8,height:8,borderRadius:'50%',background:'var(--theme-color)'}}></div>}
                                                            </div>
                                                            <div>
                                                              <div style={{fontWeight:600,fontSize:13,color:isSvcSel?'var(--theme-color)':'var(--color-dark)'}}>{svc.service_name}</div>
                                                              <div style={{fontSize:11,color:'var(--body-text-color)'}}>{svc.estimated_days_lien_tinh} ngày</div>
                                                            </div>
                                                          </div>
                                                          {isSvcSel && feeBreakdown && (
                                                            <span style={{fontWeight:700,fontSize:13,color:'var(--color-red)'}}>
                                                              {feeBreakdown.total_fee === 0 ? 'Miễn phí' : formatPrice(feeBreakdown.total_fee)}
                                                            </span>
                                                          )}
                                                        </label>
                                                      );
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                      {selectedCarrier && (
                                        <div style={{marginTop:12, marginBottom:12, display:'flex', alignItems:'center', gap:8}}>
                                          <input type="checkbox" id="insurance-check"
                                            checked={useInsurance} onChange={e=>setUseInsurance(e.target.checked)}
                                            style={{width:16, height:16, cursor:'pointer', flexShrink:0}} />
                                          <label htmlFor="insurance-check" style={{cursor:'pointer', margin:0, fontSize:13}}>
                                            Mua bảo hiểm hàng hóa
                                            {feeBreakdown?.insurance_fee > 0 && <span style={{marginLeft:6,color:'var(--color-red)',fontWeight:600}}>+{formatPrice(feeBreakdown.insurance_fee)}</span>}
                                          </label>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="col-lg-12">
                                    <button type="button" className="theme-btn theme-btn2" onClick={() => setActiveStep(1)}>
                                      <span className="fas fa-arrow-left"></span>{'Quay lại'}
                                    </button>
                                    <button type="button" className="theme-btn" onClick={() => setActiveStep(3)} style={{marginLeft:8}}>
                                      {'Tiếp theo'}<i className="fas fa-arrow-right"></i>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                        {/* Step 3: Payment */}
                        <div className="accordion-item">
                          <h2 className="accordion-header">
                            <button
                              className={`accordion-button${activeStep !== 3 ? ' collapsed' : ''}`}
                              type="button"
                              onClick={() => toggleStep(3)}
                            >
                              {'Phương thức thanh toán'}
                            </button>
                          </h2>
                          <div className={`accordion-collapse${activeStep === 3 ? ' show' : ''}`}>
                            <div className="accordion-body">
                              <div className="shop-checkout-payment">
                                <ul className="nav-pills">
                                  <li className="nav-item">
                                    <a className={`nav-link${paymentTab === 'banking' ? ' active' : ''}`}
                                      onClick={() => setPaymentTab('banking')} style={{cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                                      <div className="checkout-payment-img" style={{display:'flex', alignItems:'center', justifyContent:'center', height: 40}}>
                                        <i className="fas fa-university" style={{fontSize: 40, color: paymentTab === 'banking' ? 'var(--theme-color)' : '#999'}}></i>
                                      </div>
                                      <span style={{marginTop: 8}}>{'Chuyển khoản'}</span>
                                    </a>
                                  </li>
                                  <li className="nav-item">
                                    <a className={`nav-link${paymentTab === 'cod' ? ' active' : ''}`}
                                      onClick={() => setPaymentTab('cod')} style={{cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
                                      <div className="checkout-payment-img cod" style={{display:'flex', alignItems:'center', justifyContent:'center', height: 40}}>
                                        <i className="fas fa-truck" style={{fontSize: 40, color: paymentTab === 'cod' ? 'var(--theme-color)' : '#999'}}></i>
                                      </div>
                                      <span style={{marginTop: 8}}>{'Thanh toán khi nhận hàng'}</span>
                                    </a>
                                  </li>
                                </ul>

                                <div className="tab-content">
                                  {/* Banking */}
                                  {paymentTab === 'banking' && (
                                    <div className="tab-pane active">
                                      <div className="shop-checkout-form">
                                        <div className="row">
                                          <div className="col-lg-12">
                                            <p style={{color:'#666', fontSize:14}}>Vui lòng chuyển khoản theo thông tin được gửi qua email và bấm xác nhận.</p>
                                          </div>
                                          <div className="col-lg-12">
                                            <button type="button" className="theme-btn theme-btn2" onClick={() => setActiveStep(2)}>
                                              <span className="fas fa-arrow-left"></span> Quay lại
                                            </button>
                                            <button type="button" className="theme-btn" onClick={handlePlaceOrder} disabled={submitting} style={{ marginLeft:8 }}>
                                              {submitting ? 'Đang xử lý...' : <>Xác nhận đặt hàng <i className="fas fa-check"></i></>}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* COD */}
                                  {paymentTab === 'cod' && (
                                    <div className="tab-pane active">
                                      <div className="shop-checkout-form cod">
                                        <div className="row">
                                          <div className="col-lg-12">
                                            <div className="form-check mb-20">
                                              <input className="form-check-input" type="checkbox"
                                                checked={paymentForm.codAccepted}
                                                onChange={e => setPaymentForm({...paymentForm, codAccepted: e.target.checked})} />
                                              <label className="form-check-label">
                                                Thanh toán khi nhận hàng
                                                <span>Vui lòng đọc <a href="#">Điều khoản và Điều kiện</a> về COD.</span>
                                              </label>
                                            </div>
                                          </div>
                                          <div className="col-lg-12">
                                            <button type="button" className="theme-btn theme-btn2" onClick={() => setActiveStep(2)}>
                                              <span className="fas fa-arrow-left"></span> Quay lại
                                            </button>
                                            <button type="button" className="theme-btn" onClick={handlePlaceOrder} disabled={submitting} style={{ marginLeft:8 }}>
                                              {submitting ? 'Đang xử lý...' : <>Đặt hàng <i className="fas fa-check"></i></>}
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Order Summary Sidebar */}
                  <div className="col-lg-4">
                    <div className="shop-cart-summary mt-0">
                      <h5 style={{ fontWeight:600, marginBottom:16 }}>Tóm tắt đơn hàng</h5>

                      {/* Nhóm sản phẩm theo shop */}
                      {shopGroups.map((group, gi) => (
                        <div key={gi} style={{ marginBottom:14, borderBottom:'1px solid #eee', paddingBottom:10 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, fontWeight:600, color:'#1a237e', fontSize:13 }}>
                            <i className="fas fa-store"></i> {group.store_name}
                          </div>
                          {group.items.map((item, ii) => {
                            const img = item.variant_image || item.primary_image || item.product_image;
                            const price = getItemPrice(item);
                            const opts = item.variant_options;
                            return (
                              <div key={ii} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'flex-start' }}>
                                {img && <img src={img} alt={item.product_name} style={{ width:38, height:38, objectFit:'cover', borderRadius:4, flexShrink:0 }} />}
                                <div style={{ flex:1, minWidth:0 }}>
                                  <div style={{ fontSize:12, fontWeight:500, color:'#222', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.product_name}</div>
                                  {opts && opts.length > 0 && (
                                    <div style={{ fontSize:11, color:'#888' }}>{opts.map(o => `${o.option_name}: ${o.value}`).join(', ')}</div>
                                  )}
                                  <div style={{ fontSize:11, color:'#999' }}>x{item.quantity}</div>
                                </div>
                                <div style={{ fontSize:12, fontWeight:600, color:'#e53935', flexShrink:0 }}>{formatPrice(price * item.quantity)}</div>
                              </div>
                            );
                          })}
                        </div>
                      ))}

                      <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                        <li style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                          <span>Tạm tính:</span>
                          <span style={{ fontWeight:500 }}>{formatPrice(subTotal)}</span>
                        </li>
                        {feeBreakdown ? (
                          <>
                            <li style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                              <span>Phí vận chuyển:</span>
                              <span>{feeBreakdown.base_shipping_fee === 0 ? 'Miễn phí' : formatPrice(feeBreakdown.base_shipping_fee)}</span>
                            </li>
                            {feeBreakdown.fuel_surcharge > 0 && (
                              <li style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12, color:'#ff9800' }}>
                                <span>Phí nhiên liệu:</span>
                                <span>+{formatPrice(feeBreakdown.fuel_surcharge)}</span>
                              </li>
                            )}
                            {feeBreakdown.cod_surcharge > 0 && (
                              <li style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12, color:'#e53935' }}>
                                <span>Phí COD:</span>
                                <span>+{formatPrice(feeBreakdown.cod_surcharge)}</span>
                              </li>
                            )}
                            {feeBreakdown.insurance_fee > 0 && (
                              <li style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12, color:'#8e44ad' }}>
                                <span>Phí bảo hiểm:</span>
                                <span>+{formatPrice(feeBreakdown.insurance_fee)}</span>
                              </li>
                            )}
                          </>
                        ) : (
                          <li style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                            <span>Phí vận chuyển:</span>
                            <span>{shippingFee === 0 ? 'Miễn phí' : formatPrice(shippingFee)}</span>
                          </li>
                        )}
                        <li><hr style={{ margin:'10px 0', borderColor:'#eee' }}/></li>

                        {/* Shopee-like coupon selector */}
                        <li style={{ marginBottom: 4 }}>
                          {/* Shop coupon row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px dashed #eee' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555' }}>
                              <span>Mã Shop</span>
                            </div>
                            {shopCoupon ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, background: '#fff0f0', color: '#e53935', border: '1px dashed #e53935', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>{shopCoupon.coupon.code}</span>
                                <span style={{ fontSize: 12, color: '#22BAA0', fontWeight: 700 }}>-{formatPrice(shopCoupon.discount)}</span>
                                <button type="button" onClick={() => { setShopCoupon(null); setShopCouponCode(''); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => openCouponModal('shop')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-color)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                Chọn mã <i className="fas fa-chevron-right" style={{ fontSize: 10 }}></i>
                              </button>
                            )}
                          </div>
                          {/* Platform coupon row */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#555' }}>
                              <span>Mã Sàn</span>
                            </div>
                            {platformCoupon ? (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: 12, background: '#fff0f0', color: '#e53935', border: '1px dashed #e53935', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>{platformCoupon.coupon.code}</span>
                                <span style={{ fontSize: 12, color: '#22BAA0', fontWeight: 700 }}>-{formatPrice(platformCoupon.discount)}</span>
                                <button type="button" onClick={() => { setPlatformCoupon(null); setPlatformCouponCode(''); }}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                              </div>
                            ) : (
                              <button type="button" onClick={() => openCouponModal('platform')}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--theme-color)', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                                Chọn mã <i className="fas fa-chevron-right" style={{ fontSize: 10 }}></i>
                              </button>
                            )}
                          </div>
                        </li>
                        <li><hr style={{ margin:'6px 0', borderColor:'#eee' }}/></li>
                        {totalDiscount > 0 && (
                          <li style={{ display:'flex', justifyContent:'space-between', marginBottom:4, color:'#22BAA0', fontWeight:600 }}>
                            <span>Giảm giá:</span>
                            <span>-{formatPrice(totalDiscount)}</span>
                          </li>
                        )}

                        <li><hr style={{ margin:'10px 0', borderColor:'#eee' }}/></li>
                        <li style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:17, color:'#1a237e' }}>
                          <span>Tổng cộng:</span>
                          <span style={{ color:'#e53935' }}>{formatPrice(total)}</span>
                        </li>
                      </ul>
                      {error && <div className="error-alert" style={{ marginTop:10 }}>{error}</div>}
                      <div style={{ marginTop:16 }}>
                        <button type="button" className="theme-btn" style={{ width:'100%' }}
                          onClick={handlePlaceOrder} disabled={submitting}>
                          {submitting ? 'Đang xử lý...' : <>Đặt hàng ngay <i className="fas fa-check"></i></>}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Address Book Modal */}
      {showAddressModal && (
      <div className="modal-backdrop" style={{background:'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div className="modal-dialog" style={{width: '100%', maxWidth: 500, margin: '0 15px', background: '#fff', borderRadius: 8}}>
          <div className="modal-content" style={{borderRadius: 8, border: 'none'}}>
            <div className="modal-header" style={{borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', padding: '16px 20px'}}>
              <h5 className="modal-title" style={{fontSize: 16, fontWeight: 600, margin: 0}}>Địa Chỉ Của Tôi</h5>
              <button type="button" className="btn-close" onClick={() => setShowAddressModal(false)} style={{background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1}}>&times;</button>
            </div>
            <div className="modal-body" style={{maxHeight: 400, overflowY: 'auto', padding: 0}}>
              {savedAddresses.length === 0 ? (
                 <div style={{textAlign: 'center', padding: 30}}>Không có địa chỉ nào.</div>
              ) : (
                savedAddresses.map(addr => (
                  <div key={addr.id} style={{padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', gap: 12}}>
                     <div style={{width: 24, paddingTop: 2}}>
                        <input type="radio" name="addressSelect" style={{width: 18, height: 18, accentColor: 'var(--theme-color)', cursor: 'pointer'}}
                          checked={selectedAddress?.id === addr.id}
                          onChange={() => setSelectedAddress(addr)} />
                     </div>
                     <div style={{flex: 1}}>
                        <div style={{display: 'flex', justifyContent: 'space-between', marginBottom: 4}}>
                           <div style={{fontWeight: 600, color: '#333', fontSize: 14}}>{addr.full_name} <span style={{fontWeight: 400, color: '#999', margin: '0 8px'}}>|</span> {addr.phone}</div>
                           <div style={{cursor: 'pointer', color: '#0055aa', fontSize: 13, fontWeight: 500}} onClick={() => { setAddressFormData(addr); setShowFormModal(true); setFormError(''); setShowAddressModal(false); }}>Cập nhật</div>
                        </div>
                        <div style={{color: '#666', fontSize: 13}}>{addr.address_line1} {addr.address_line2 ? `, ${addr.address_line2}` : ''}</div>
                        <div style={{color: '#666', fontSize: 13}}>{addr.district ? `${addr.district}, ` : ''}{addr.province}</div>
                        {addr.is_default && <span style={{display: 'inline-block', border: '1px solid var(--theme-color)', color: 'var(--theme-color)', fontSize: 10, padding: '2px 4px', borderRadius: 2, marginTop: 6, fontWeight: 500}}>Mặc định</span>}
                     </div>
                  </div>
                ))
              )}
            </div>
            <div className="modal-footer" style={{borderTop: 'none', padding: '16px 20px', display: 'flex', justifyContent: 'space-between'}}>
               <button type="button" className="theme-btn theme-btn2" onClick={() => { setAddressFormData({ id: null, label: 'Nhà', full_name: user?.full_name || '', phone: user?.phone || '', address_line1: '', address_line2: '', province: '', district: '', is_default: savedAddresses.length === 0 }); setShowFormModal(true); setFormError(''); setShowAddressModal(false); }} style={{padding: '8px 16px', background: 'transparent', color: '#666', border: '1px solid #ccc', boxShadow: 'none'}}><i className="fas fa-plus"></i> Thêm Địa Chỉ</button>
               <div style={{display: 'flex'}}>
                 <button type="button" className="theme-btn theme-btn2" onClick={() => setShowAddressModal(false)} style={{padding: '8px 16px', marginRight: 8, background: '#f5f5f5', color: '#333', border: '1px solid #ccc', boxShadow: 'none'}}>Hủy</button>
                 <button type="button" className="theme-btn" onClick={() => setShowAddressModal(false)} style={{padding: '8px 16px'}}>Xác nhận</button>
               </div>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* Address Edit/Add Modal */}
      {showFormModal && (
      <div className="modal-backdrop" style={{background:'rgba(0,0,0,0.5)', position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', zIndex: 1060, display: 'flex', alignItems: 'center', justifyContent: 'center'}}>
        <div className="modal-dialog" style={{width: '100%', maxWidth: 500, margin: '0 15px', background: '#fff', borderRadius: 8}}>
          <div className="modal-content" style={{borderRadius: 8, border: 'none'}}>
            <div className="modal-header" style={{borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', padding: '16px 20px'}}>
              <h5 className="modal-title" style={{fontSize: 16, fontWeight: 600, margin: 0}}>{addressFormData.id ? 'Cập nhật địa chỉ' : 'Địa chỉ mới'}</h5>
              <button type="button" className="btn-close" onClick={() => { setShowFormModal(false); setShowAddressModal(true); }} style={{background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', lineHeight: 1}}>&times;</button>
            </div>
            <div className="modal-body" style={{padding: 20, maxHeight: 'calc(100vh - 150px)', overflowY: 'auto'}}>
              {formError && <div className="alert alert-danger" style={{padding: '8px 12px', fontSize: 13, marginBottom: 16, color: 'red'}}>{formError}</div>}
              <div className="row" style={{marginBottom: 0}}>
                 <div className="col-12 col-md-6 mb-3">
                    <input type="text" className="form-control" placeholder="Họ và tên (*)" value={addressFormData.full_name} onChange={e => setAddressFormData({...addressFormData, full_name: e.target.value})} style={{background: '#fff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', height: 'auto', width: '100%'}} />
                 </div>
                 <div className="col-12 col-md-6 mb-3">
                    <input type="text" className="form-control" placeholder="Số điện thoại (*)" value={addressFormData.phone} onChange={e => setAddressFormData({...addressFormData, phone: e.target.value})} style={{background: '#fff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', height: 'auto', width: '100%'}} />
                 </div>
                 <div className="col-12 col-md-6 mb-3">
                    <select className="form-control" value={addressFormData.province} onChange={e => setAddressFormData({...addressFormData, province: e.target.value})} style={{background: '#fff', cursor: 'pointer', appearance: 'auto', padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', height: 'auto', width: '100%'}}>
                      <option value="">Tỉnh/Thành phố (*)</option>
                      {PROVINCES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                 </div>
                 <div className="col-12 col-md-6 mb-3">
                    <input type="text" className="form-control" placeholder="Quận/Huyện" value={addressFormData.district} onChange={e => setAddressFormData({...addressFormData, district: e.target.value})} style={{background: '#fff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', height: 'auto', width: '100%'}} />
                 </div>
                 <div className="col-12 mb-3">
                    <input type="text" className="form-control" placeholder="Địa chỉ cụ thể (Số nhà, đường...) (*)" value={addressFormData.address_line1} onChange={e => setAddressFormData({...addressFormData, address_line1: e.target.value})} style={{background: '#fff', padding: '10px 14px', borderRadius: '6px', border: '1px solid #ccc', fontSize: '14px', height: 'auto', width: '100%'}} />
                 </div>
                 <div className="col-12">
                    <label style={{display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14, color: '#333', margin: 0}}>
                       <input type="checkbox" style={{width: 16, height: 16, accentColor: 'var(--theme-color)'}} checked={addressFormData.is_default} onChange={e => setAddressFormData({...addressFormData, is_default: e.target.checked})} />
                       Đặt làm địa chỉ mặc định
                    </label>
                 </div>
              </div>
            </div>
            <div className="modal-footer" style={{borderTop: '1px solid #eee', padding: '16px 20px', display: 'flex', justifyContent: 'space-between'}}>
               <div>
                  {addressFormData.id && (
                     <button type="button" className="theme-btn theme-btn2" onClick={() => { handleDeleteAddress(addressFormData.id); setShowFormModal(false); setShowAddressModal(true); }} style={{padding: '8px 16px', background: 'transparent', color: '#e53935', border: '1px solid #e53935', boxShadow: 'none'}}>Xóa</button>
                  )}
               </div>
               <div style={{display: 'flex'}}>
                 <button type="button" className="theme-btn theme-btn2" onClick={() => { setShowFormModal(false); setShowAddressModal(true); }} style={{padding: '8px 16px', marginRight: 8, background: '#f5f5f5', color: '#333', border: '1px solid #ccc', boxShadow: 'none'}}>Trở lại</button>
                 <button type="button" className="theme-btn" onClick={handleSaveAddrSubmit} style={{padding: '8px 16px'}}>Hoàn thành</button>
               </div>
            </div>
          </div>
        </div>
      </div>
      )}

      <footer className="footer-area ft-bg">
        <div className="footer-widget">
          <div className="container">
            <div className="row footer-widget-wrapper pt-100 pb-40">
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box about-us">
                  <Link href="/" className="footer-logo">
                    <img src="/assets/img/logo/logo-light.png" alt="" />
                  </Link>
                  <p className="mb-3">{'Nền tảng thương mại điện tử hiện đại với công nghệ blockchain'}</p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84123456789"><i className="fas fa-phone"></i>+84 123 456 789</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>{'Hà Nội, Việt Nam'}</li>
                    <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i>info@example.com</a></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">{'Liên kết'}</h4>
                  <ul className="footer-list">
                    <li><Link href="/about">About Us</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                    <li><Link href="/blog">News</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">{'Danh mục'}</h4>
                  <ul className="footer-list">
                    <li><Link href="/shop-search">{'Thời trang'}</Link></li>
                    <li><Link href="/shop-search">{'Điện tử'}</Link></li>
                    <li><Link href="/shop-search">{'Nội thất'}</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">{'Thanh toán'}</h4>
                  <div className="footer-payment mt-20">
                    <span>{'Chúng tôi chấp nhận:'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="copyright">
          <div className="container">
            <div className="copyright-wrap">
              <div className="row">
                <div className="col-12 col-lg-6 align-self-center">
                  <p className="copyright-text">&copy; Copyright 2026 <a href="/"> E-Commerce </a> All Rights Reserved.</p>
                </div>
                <div className="col-12 col-lg-6 align-self-center">
                  <div className="footer-social">
                    <span>{'Theo dõi:'}</span>
                    <a href="#"><i className="fab fa-facebook-f"></i></a>
                    <a href="#"><i className="fab fa-x-twitter"></i></a>
                    <a href="#"><i className="fab fa-youtube"></i></a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>
      <a href="#" id="scroll-top"><i className="fas fa-arrow-up"></i></a>

      {/* Coupon Picker Modal */}
      {showCouponModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowCouponModal(false); }}>
          <div style={{ background: '#fff', width: '92%', maxWidth: 520, borderRadius: 16, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,.2)' }}>
            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h6 style={{ margin: 0, fontWeight: 700, fontSize: '1rem' }}>Chọn mã giảm giá</h6>
              <button onClick={() => setShowCouponModal(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#aaa', lineHeight: 1 }}>×</button>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', borderBottom: '1px solid #f0f0f0' }}>
              {[{ key: 'shop', label: 'Mã Shop', icon: 'fas fa-store' }, { key: 'platform', label: 'Mã Sàn', icon: 'fas fa-tag' }].map(t => (
                <button key={t.key} onClick={() => setCouponModalTab(t.key)}
                  style={{ flex: 1, padding: '12px 0', border: 'none', background: 'none', cursor: 'pointer', fontWeight: couponModalTab === t.key ? 700 : 400, fontSize: 13, color: couponModalTab === t.key ? 'var(--theme-color)' : '#666', borderBottom: couponModalTab === t.key ? '2px solid var(--theme-color)' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <i className={t.icon} style={{ fontSize: 12 }}></i> {t.label}
                </button>
              ))}
            </div>

            {/* Manual input */}
            <div style={{ padding: '12px 20px', borderBottom: '1px solid #f0f0f0' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={manualCode} onChange={e => { setManualCode(e.target.value.toUpperCase()); setManualError(''); }}
                  placeholder="Nhập mã giảm giá" onKeyDown={e => e.key === 'Enter' && applyManualCode()}
                  style={{ flex: 1, padding: '8px 12px', border: '1px solid #ddd', borderRadius: 8, fontSize: 13 }} />
                <button type="button" onClick={applyManualCode}
                  style={{ padding: '8px 16px', background: 'var(--theme-color)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>
                  Áp dụng
                </button>
              </div>
              {manualError && <div style={{ color: '#e53935', fontSize: 12, marginTop: 6 }}>{manualError}</div>}
            </div>

            {/* Coupon list */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '8px 20px 20px' }}>
              {loadingCoupons ? (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#aaa' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize: 24 }}></i>
                  <div style={{ marginTop: 8, fontSize: 13 }}>Đang tải mã giảm giá...</div>
                </div>
              ) : (() => {
                const filtered = availableCoupons.filter(c => couponModalTab === 'platform' ? !c.storeid : !!c.storeid);
                if (!filtered.length) return (
                  <div style={{ textAlign: 'center', padding: '2rem', color: '#aaa' }}>
                    <i className="fas fa-ticket-alt" style={{ fontSize: 28, display: 'block', marginBottom: 8 }}></i>
                    <div style={{ fontSize: 13 }}>Không có mã nào khả dụng</div>
                  </div>
                );
                return filtered.map(c => {
                  const isSelected = couponModalTab === 'platform' ? platformCoupon?.coupon?.id === c.id : shopCoupon?.coupon?.id === c.id;
                  const canUse = c.calcDiscount > 0;
                  return (
                    <div key={c.id} onClick={() => canUse && selectCoupon(c, couponModalTab === 'platform')}
                      style={{ display: 'flex', gap: 0, marginTop: 12, border: isSelected ? '1.5px solid var(--theme-color)' : '1px solid #e8e8e8', borderRadius: 10, overflow: 'hidden', cursor: canUse ? 'pointer' : 'default', opacity: canUse ? 1 : 0.5, background: isSelected ? 'var(--theme-color-light, #fff5f5)' : '#fff' }}>
                      {/* Left color bar */}
                      <div style={{ width: 8, background: canUse ? (couponModalTab === 'platform' ? '#e53935' : 'var(--theme-color)') : '#ccc', flexShrink: 0 }}></div>
                      {/* Content */}
                      <div style={{ flex: 1, padding: '12px 14px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div>
                            <span style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: 14, letterSpacing: 1, color: canUse ? '#e53935' : '#aaa' }}>{c.code}</span>
                            {c.description && <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{c.description}</div>}
                            <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                              {c.discounttype === 'PERCENTAGE' ? `Giảm ${c.discountvalue}%` : `Giảm ${Number(c.discountvalue).toLocaleString('vi-VN')}₫`}
                              {c.maxdiscount ? ` (tối đa ${Number(c.maxdiscount).toLocaleString('vi-VN')}₫)` : ''}
                              {c.minordervalue ? ` · Đơn từ ${Number(c.minordervalue).toLocaleString('vi-VN')}₫` : ''}
                            </div>
                            <div style={{ fontSize: 10, color: '#bbb', marginTop: 2 }}>HSD: {new Date(c.enddate).toLocaleDateString('vi-VN')}</div>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                            {canUse ? (
                              <>
                                <div style={{ fontSize: 11, color: '#888' }}>Tiết kiệm</div>
                                <div style={{ fontWeight: 700, fontSize: 15, color: '#22BAA0' }}>-{Number(c.calcDiscount).toLocaleString('vi-VN')}₫</div>
                              </>
                            ) : (
                              <div style={{ fontSize: 11, color: '#aaa' }}>Không đủ điều kiện</div>
                            )}
                            {isSelected && <div style={{ fontSize: 11, color: 'var(--theme-color)', fontWeight: 600, marginTop: 4 }}>Đang dùng</div>}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
