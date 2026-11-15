'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import { useWishlistStore } from '@/store/useWishlistStore';
import WishlistIcon from '@/components/WishlistIcon';
import api from '@/lib/axios';
import { getAuthHeader } from '@/lib/auth';
import './styles.css';

function formatPrice(p) {
  if (!p && p !== 0) return '';
  return Number(p).toLocaleString('vi-VN') + '₫';
}
function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function StatusBadge({ status }) {
  const map = {
    CREATED: ['badge-info', 'Chờ xử lý'],
    PENDING: ['badge-info', 'Chờ xử lý'],
    PAID: ['badge-primary', 'Đã thanh toán'],
    PROCESSING: ['badge-primary', 'Đang xử lý'],
    SHIPPED: ['badge-warning', 'Đang giao'],
    SHIPPING: ['badge-warning', 'Đang giao'],
    DELIVERED: ['badge-success', 'Đã giao hàng'],
    DELIVERED_COD_PENDING: ['badge-warning', 'Chờ thu COD'],
    COD_REMITTED: ['badge-success', 'Đã thu COD'],
    SETTLED: ['badge-success', 'Hoàn thành'],
    COMPLETED: ['badge-success', 'Hoàn thành'],
    CANCELLED: ['badge-danger', 'Đã hủy'],
    RETURN_REQUESTED: ['badge-danger', 'Yêu cầu hoàn'],
    RETURN_IN_TRANSIT: ['badge-danger', 'Đang hoàn hàng'],
    RETURNED: ['badge-secondary', 'Đã hoàn hàng'],
  };
  const [cls, label] = map[(status || '').toUpperCase()] || ['badge-secondary', status || ''];
  return <span className={`badge ${cls}`}>{label}</span>;
}

export default function ProfilePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, clearUser } = useUserStore();
  const { count: cartCount, fetchCount } = useCartStore();
  const { fetchWishlist, items: wishlistItems, loading: wishlistLoading, removeFromWishlist } = useWishlistStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [activeTab, setActiveTab] = useState('profile');
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState(null);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [selectedOrderItems, setSelectedOrderItems] = useState([]);
  const [uploadingProof, setUploadingProof] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewContent, setReviewContent] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewedOrderIds, setReviewedOrderIds] = useState([]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['dashboard', 'profile', 'orders', 'order-detail', 'wishlist'].includes(tab)) {
      setActiveTab(tab);
    }
    fetchCount();
  }, [searchParams]);

  const fetchOrders = async () => {
    setOrdersLoading(true);
    try {
      const res = await api.get('/v1/orders');
      const nextOrders = res.data.orders || [];
      setOrders(nextOrders);
      const reviewed = nextOrders
        .filter(o => o?.is_reviewed === true || o?.has_review === true || Number(o?.review_count || 0) > 0)
        .map(o => o.id);
      if (reviewed.length > 0) {
        setReviewedOrderIds(prev => Array.from(new Set([...(prev || []), ...reviewed])));
      }
    } catch (error) {
      setOrders([]);
    } finally {
      setOrdersLoading(false);
    }
  };

  // Fetch orders when switching to orders or dashboard tab
  useEffect(() => {
    if ((activeTab === 'orders' || activeTab === 'dashboard') && mounted) {
      fetchOrders();
    }
  }, [activeTab, mounted]);

  // Auto-refresh orders every 30 seconds when on orders or dashboard tab
  useEffect(() => {
    let interval;
    if ((activeTab === 'orders' || activeTab === 'dashboard') && mounted) {
      interval = setInterval(() => {
        fetchOrders();
      }, 30000); // 30 seconds
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, mounted]);

  // Fetch wishlist when switching to wishlist tab
  useEffect(() => {
    if (activeTab === 'wishlist' && mounted && user) {
      fetchWishlist();
    }
  }, [activeTab, mounted, user, fetchWishlist]);

  const handleViewOrderDetail = (orderId) => {
    setSelectedOrderId(orderId);
    setSelectedOrder(null);
    setSelectedOrderItems([]);
    setActiveTab('order-detail');
    api.get(`/v1/orders/${orderId}`)
      .then(res => {
        setSelectedOrder(res.data.order);
        setSelectedOrderItems(res.data.items || []);
      })
      .catch(() => { });
  };

  const handleRequestReturn = async (orderId) => {
    if (!confirm('Yêu cầu hoàn trả đơn hàng này? Thao tác này chỉ có thể thực hiện trong vòng 5 phút sau khi giao hàng.')) {
      return;
    }
    
    try {
      const response = await api.post(`/v1/orders/${orderId}/request-return`);
      setMessage({ type: 'success', text: response.data.message || 'Đã yêu cầu hoàn trả thành công' });
      fetchOrders(); // Refresh orders list
    } catch (error) {
      const msg = error.response?.data?.detail || error.message || 'Có lỗi xảy ra';
      setMessage({ type: 'error', text: msg });
    }
  };

  const canRequestReturn = (order) => {
    console.log('Check canRequestReturn:', {
      order: order,
      status: order?.status,
      updated_at: order?.updated_at,
      isDelivered: order?.status === 'DELIVERED'
    });
    
    if (!order || order.status !== 'DELIVERED') return false;
    
    // Temporary: Allow return without time limit for testing
    return true;
    
    // Check 5-minute window (uncomment for production)
    // const deliveredAt = new Date(order.updated_at);
    // const now = new Date();
    // const diffMs = now - deliveredAt;
    // return diffMs <= 5 * 60 * 1000; // Within 5 minutes
  };

  const handleCancelOrder = async (orderId) => {
    if (!window.confirm('Bạn có chắc muốn hủy đơn hàng này không?')) return;
    try {
      await api.post(`/v1/orders/${orderId}/cancel`);
      setMessage({ type: 'success', text: 'Đã hủy đơn hàng thành công!' });
      // Reload orders
      fetchOrders();
      // If we're on order-detail, update selected order
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(prev => prev ? { ...prev, status: 'CANCELLED' } : prev);
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.response?.data?.detail || 'Không thể hủy đơn hàng' });
    }
  };

  const handleUploadPaymentProof = async (orderId) => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Vui lòng chọn file ảnh chứng từ thanh toán' });
      return;
    }

    setUploadingProof(true);
    try {
      const formData = new FormData();
      formData.append('payment_proof', selectedFile);

      const response = await api.post(`/v1/orders/${orderId}/upload-payment-proof`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setMessage({ 
        type: 'success', 
        text: response.data.message || 'Upload chứng từ thành công! Vui lòng đợi admin xác nhận.' 
      });

      // Clear file selection
      setSelectedFile(null);
      const fileInput = document.getElementById(`file-input-${orderId}`);
      if (fileInput) fileInput.value = '';

      // Reload order data
      fetchOrders();

    } catch (err) {
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.detail || 'Không thể upload chứng từ thanh toán' 
      });
    } finally {
      setUploadingProof(false);
    }
  };

  const handleFileSelect = (e, orderId) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      setMessage({ type: 'error', text: 'Chỉ cho phép file ảnh (JPG, PNG, WEBP, GIF)' });
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'File quá lớn. Kích thước tối đa: 5MB' });
      return;
    }

    setSelectedFile(file);
  };

  const isOrderReviewed = (order) => {
    if (!order) return false;
    if (reviewedOrderIds.includes(order.id)) return true;
    if (order?.is_reviewed === true || order?.has_review === true) return true;
    if (Number(order?.review_count || 0) > 0) return true;
    return false;
  };

  const canReviewOrder = (order) => {
    if (!order) return false;
    const st = String(order.status || '').toUpperCase();
    const done = ['DELIVERED', 'SETTLED', 'COMPLETED'].includes(st);
    if (!done) return false;
    return !isOrderReviewed(order);
  };

  const openReviewModal = (order) => {
    if (!canReviewOrder(order)) {
      setMessage({ type: 'error', text: 'Đơn hàng này chưa đủ điều kiện hoặc đã được đánh giá.' });
      return;
    }
    setReviewTarget(order);
    setReviewRating(5);
    setReviewContent('');
    setReviewModalOpen(true);
  };

  const submitReview = async () => {
    if (!reviewTarget) return;
    if (!reviewContent.trim()) {
      setMessage({ type: 'error', text: 'Vui lòng nhập nội dung đánh giá' });
      return;
    }
    try {
      setSubmittingReview(true);
      await api.post(`/v1/orders/${reviewTarget.id}/reviews`, {
        rating: reviewRating,
        content: reviewContent.trim(),
      });
      setMessage({ type: 'success', text: 'Đánh giá thành công. Cảm ơn bạn!' });
      setReviewedOrderIds(prev => Array.from(new Set([...(prev || []), reviewTarget.id])));
      setReviewModalOpen(false);
      setReviewTarget(null);
      fetchOrders();
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.detail || 'Không thể gửi đánh giá' });
    } finally {
      setSubmittingReview(false);
    }
  };

  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: ''
  });

  const [passwordData, setPasswordData] = useState({
    oldPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    setMounted(true);
    if (user) {
      const nameParts = (user.full_name || '').split(' ');
      setProfileData({
        firstName: nameParts[0] || '',
        lastName: nameParts.slice(1).join(' ') || '',
        email: user.email || '',
        phone: user.phone || '',
        address: user.address || ''
      });
    }
  }, [user]);

  useEffect(() => {
    if (mounted && !user) {
      router.push('/login');
    }
  }, [mounted, user, router]);

  const handleLogout = async () => {
    try {
      if (user?.id) {
        await fetch('http://localhost:4000/api/v1/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id })
        });
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    clearUser();
    router.push('/login');
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const response = await fetch('http://localhost:4000/api/v1/users/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthHeader()
        },
        body: JSON.stringify({
          full_name: `${profileData.firstName} ${profileData.lastName}`.trim(),
          phone: profileData.phone,
          address: profileData.address
        })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Profile updated successfully!' });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.message || 'Failed to update profile' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while updating profile' });
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('http://localhost:4000/api/v1/users/change-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': getAuthHeader()
        },
        body: JSON.stringify({
          old_password: passwordData.oldPassword,
          new_password: passwordData.newPassword
        })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Password changed successfully!' });
        setPasswordData({ oldPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const data = await response.json();
        setMessage({ type: 'error', text: data.message || 'Failed to change password' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while changing password' });
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return null;
  }

  if (!user) {
    return null;
  }

  return (
    <>
      {/* Header Top */}
      <div className="header-top">
        <div className="container">
          <div className="header-top-wrapper">
            <div className="row">
              <div className="col-12 col-md-7 col-lg-7 col-xl-7">
                <div className="header-top-left">
                  <ul className="header-top-list">
                    <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i> info@example.com</a></li>
                    <li><a href="tel:+21236547898"><i className="fas fa-headset"></i> +2 123 654 7898</a></li>
                    <li><a href="#"><i className="fas fa-question-circle"></i> Need Help?</a></li>
                  </ul>
                </div>
              </div>
              <div className="col-12 col-md-5 col-lg-5 col-xl-5" style={{ marginLeft: 'auto', flex: 'none', width: 'auto', maxWidth: 'none', paddingRight: 0 }}>
                <div className="header-top-right">
                  <ul className="header-top-list">
                    <li><Link href="/profile"><i className="fas fa-user"></i> {user?.full_name || 'User'}</Link></li>
                    <li>
                      <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit' }}>
                        <i className="fas fa-sign-out-alt"></i> Logout
                      </button>
                    </li>
                    <li className="social">
                      <div className="header-top-social">
                        <span>Follow Us: </span>
                        <a href="#"><i className="fab fa-facebook"></i></a>
                        <a href="#"><i className="fab fa-x-twitter"></i></a>
                        <a href="#"><i className="fab fa-instagram"></i></a>
                        <a href="#"><i className="fab fa-linkedin"></i></a>
                      </div>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navbar */}
      <div className="main-navigation">
        <nav className="navbar navbar-expand-lg">
          <div className="container position-relative">
            <a className="navbar-brand" href="/">
              <img alt="logo" src="/assets/img/logo/logo.png" style={{ maxWidth: '120px', margin: '0 10px', transform: 'translateY(18px)' }} />
            </a>
            <div className="mobile-menu-right">
              <div className="mobile-menu-btn">
                <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                <WishlistIcon className="nav-right-link" />
                <a className="nav-right-link" href="/cart"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</a>
              </div>
              <button className="navbar-toggler" type="button"><span></span><span></span><span></span></button>
            </div>
            <div className="navbar-collapse">
              <ul className="navbar-nav">
                <li className="nav-item"><a className="nav-link" href="/">Home</a></li>
                <li className="nav-item"><a className="nav-link" href="/about">About</a></li>
                <li className="nav-item"><a className="nav-link" href="/shop-search">Shop</a></li>
                <li className="nav-item"><a className="nav-link" href="/blog">Blog</a></li>
                <li className="nav-item"><a className="nav-link" href="/contact">Contact</a></li>
              </ul>
              <div className="nav-right">
                <ul className="nav-right-list">
                  <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                  <li><WishlistIcon linkClass="list-link" /></li>
                  <li><a className="list-link" href="/cart"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</a></li>
                </ul>
              </div>
            </div>
          </div>
        </nav>
      </div>
      {/* Navbar end */}

      <main className="main">
        {/* breadcrumb */}
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{ background: 'url(/assets/img/breadcrumb/01.jpg)' }}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">{activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'orders' ? 'Orders List' : activeTab === 'order-detail' ? 'Order Details' : activeTab === 'wishlist' ? 'My Wishlist' : 'My Profile'}</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="far fa-home"></i> Home</Link></li>
                <li className="active">{activeTab === 'dashboard' ? 'Dashboard' : activeTab === 'orders' ? 'Orders List' : activeTab === 'order-detail' ? 'Order Details' : activeTab === 'wishlist' ? 'My Wishlist' : 'My Profile'}</li>
              </ul>
            </div>
          </div>
        </div>
        {/* breadcrumb end */}

        {/* user dashboard */}
        <div className="user-area bg pt-100 pb-80">
          <div className="container">
            <div className="row">
              <div className="col-lg-3">
                <div className="sidebar">
                  <div className="sidebar-top">
                    <div className="sidebar-profile-img">
                      <img src={user.avatar || '/assets/img/account/01.jpg'} alt="Profile" />
                      <button type="button" className="profile-img-btn"><i className="far fa-camera"></i></button>
                      <input type="file" className="profile-img-file" />
                    </div>
                    <h5>{user.full_name || 'User'}</h5>
                    <p>{user.email}</p>
                  </div>
                  <ul className="sidebar-list">
                    <li><a href="#" className={activeTab === 'dashboard' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('dashboard'); }}><i className="far fa-gauge-high"></i> Dashboard</a></li>
                    <li><a href="#" className={activeTab === 'profile' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('profile'); }}><i className="far fa-user"></i> My Profile</a></li>
                    <li><a href="#" className={activeTab === 'orders' || activeTab === 'order-detail' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('orders'); }}><i className="far fa-shopping-bag"></i> My Order List</a></li>
                    <li><a href="#" className={activeTab === 'wishlist' ? 'active' : ''} onClick={(e) => { e.preventDefault(); setActiveTab('wishlist'); }}><i className="far fa-heart"></i> My Wishlist</a></li>
                    <li><a href="#" onClick={(e) => { e.preventDefault(); handleLogout(); }}><i className="far fa-sign-out"></i> Logout</a></li>
                  </ul>
                </div>
              </div>
              <div className="col-lg-9">
                <div className="user-wrapper">
                  {message.text && (
                    <div className={`alert ${message.type === 'success' ? 'alert-success' : 'alert-danger'}`}>
                      {message.text}
                    </div>
                  )}

                  {/* Dashboard Tab */}
                  {activeTab === 'dashboard' && (
                    <>
                      <div className="user-card">
                        <h4 className="user-card-title">Summary</h4>
                        <div className="row">
                          <div className="col-md-6 col-lg-4">
                            <div className="dashboard-widget color-1">
                              <div className="dashboard-widget-info">
                                <h1>{orders.filter(o => ['CREATED', 'PENDING', 'PROCESSING', 'SHIPPED', 'SHIPPING'].includes((o.status || '').toUpperCase())).length}</h1>
                                <span>Đơn đang xử lý</span>
                              </div>
                              <div className="dashboard-widget-icon">
                                <i className="fal fa-list"></i>
                              </div>
                            </div>
                          </div>
                          <div className="col-md-6 col-lg-4">
                            <div className="dashboard-widget color-2">
                              <div className="dashboard-widget-info">
                                <h1>{orders.filter(o => ['COMPLETED', 'SETTLED', 'DELIVERED'].includes((o.status || '').toUpperCase())).length}</h1>
                                <span>Đơn hoàn thành</span>
                              </div>
                              <div className="dashboard-widget-icon">
                                <i className="fal fa-layer-group"></i>
                              </div>
                            </div>
                          </div>
                          <div className="col-md-6 col-lg-4">
                            <div className="dashboard-widget color-3">
                              <div className="dashboard-widget-info">
                                <h1>{orders.length}</h1>
                                <span>Tổng đơn hàng</span>
                              </div>
                              <div className="dashboard-widget-icon">
                                <i className="fal fa-wallet"></i>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="row">
                        <div className="col-lg-12">
                          <div className="user-card">
                            <div className="user-card-header">
                              <h4 className="user-card-title">Đơn hàng gần đây</h4>
                              <div className="user-card-header-right">
                                <a href="#" className="theme-btn" onClick={(e) => { e.preventDefault(); setActiveTab('orders'); }}>Xem tất cả</a>
                              </div>
                            </div>
                            {ordersLoading ? (
                              <div style={{ textAlign: 'center', padding: '30px 0' }}>
                                <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#5C86B8' }}></i>
                              </div>
                            ) : orders.length === 0 ? (
                              <div style={{ textAlign: 'center', padding: '30px 0', color: '#999' }}>
                                <i className="fas fa-box-open" style={{ fontSize: 36, marginBottom: 8 }}></i>
                                <p>Bạn chưa có đơn hàng nào.</p>
                              </div>
                            ) : (
                              <div className="table-responsive">
                                <table className="table table-borderless text-nowrap">
                                  <thead>
                                    <tr>
                                      <th>#Mã đơn hàng</th>
                                      <th>Shop</th>
                                      <th>Ngày đặt</th>
                                      <th>Tổng tiền</th>
                                      <th>Trạng thái</th>
                                      <th>Xem</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {orders.slice(0, 5).map(order => (
                                      <tr key={order.id}>
                                        <td><span className="table-list-code">{order.id}</span></td>
                                        <td>{order.storename || '—'}</td>
                                        <td>{formatDate(order.created_at)}</td>
                                        <td>{formatPrice(order.finalprice || order.total_amount)}</td>
                                        <td><StatusBadge status={order.status} /></td>
                                        <td><a href="#" onClick={(e) => { e.preventDefault(); handleViewOrderDetail(order.id); }} className="btn btn-outline-secondary btn-sm rounded-2"><i className="far fa-eye"></i></a></td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Orders List Tab */}
                  {activeTab === 'orders' && (
                    <div className="row">
                      <div className="col-lg-12">
                        <div className="user-card">
                          <div className="user-card-header">
                            <h4 className="user-card-title">Danh sách đơn hàng</h4>
                          </div>
                          {ordersLoading ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                              <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#5C86B8' }}></i>
                            </div>
                          ) : orders.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '40px 0', color: '#999' }}>
                              <i className="fas fa-box-open" style={{ fontSize: 40, marginBottom: 12 }}></i>
                              <p>Bạn chưa có đơn hàng nào.</p>
                            </div>
                          ) : (
                            <div className="table-responsive">
                              <table className="table table-borderless text-nowrap">
                                <thead>
                                  <tr>
                                    <th>#Mã ĐH</th>
                                    <th>Shop</th>
                                    <th>Ngày đặt</th>
                                    <th>Tổng tiền</th>
                                    <th>Trạng thái</th>
                                    <th>Xem</th>
                                    <th>Hủy</th>
                                    <th>Hoàn hàng</th>
                                    <th>Đánh giá</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {orders.map(order => (
                                    <tr
                                      key={order.id}
                                      onClick={() => handleViewOrderDetail(order.id)}
                                      style={{ cursor: 'pointer' }}
                                    >
                                      <td><span className="table-list-code">{order.id}</span></td>
                                      <td>
                                        <span style={{ fontWeight: 500, color: '#1a237e' }}>
                                          <i className="fas fa-store" style={{ marginRight: 4, fontSize: 12 }}></i>
                                          {order.storename || 'Cửa hàng'}
                                        </span>
                                      </td>
                                      <td>{formatDate(order.created_at)}</td>
                                      <td style={{ fontWeight: 600, color: '#e53935' }}>{formatPrice(order.finalprice || order.total_amount)}</td>
                                      <td><StatusBadge status={order.status} /></td>
                                      <td>
                                        <a href="#" onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleViewOrderDetail(order.id); }}
                                          className="btn btn-outline-secondary btn-sm rounded-2">
                                          <i className="far fa-eye"></i>
                                        </a>
                                      </td>
                                      <td>
                                        {['CREATED', 'PAID'].includes((order.status || '').toUpperCase()) && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleCancelOrder(order.id); }}
                                            className="btn btn-outline-danger btn-sm rounded-2"
                                            title="Hủy đơn">
                                            <i className="far fa-times"></i>
                                          </button>
                                        )}
                                      </td>
                                      <td>
                                        {canRequestReturn(order) && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleRequestReturn(order.id); }}
                                            className="btn btn-outline-warning btn-sm rounded-2"
                                            title="Yêu cầu hoàn trả">
                                            <i className="far fa-undo"></i>
                                          </button>
                                        )}
                                      </td>
                                      <td>
                                        {canReviewOrder(order) && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); openReviewModal(order); }}
                                            className="btn btn-outline-primary btn-sm rounded-2"
                                            title="Đánh giá đơn hàng">
                                            <i className="far fa-star"></i>
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Order Detail Tab */}
                  {activeTab === 'order-detail' && (
                    <div className="row">
                      <div className="col-lg-12">
                        <div className="user-card user-order-detail">
                          <div className="user-card-header">
                            <div>
                              <h4 className="user-card-title">
                                Chi tiết đơn hàng
                                {selectedOrder && <span style={{ fontSize: 13, fontWeight: 400, color: '#888', marginLeft: 8 }}>({selectedOrder.id})</span>}
                              </h4>
                              {selectedOrder && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                  <i className="fas fa-store" style={{ color: '#1a237e' }}></i>
                                  <span style={{ fontWeight: 600, color: '#1a237e' }}>{selectedOrder.storename || 'Cửa hàng'}</span>
                                  <StatusBadge status={selectedOrder.status} />
                                </div>
                              )}
                            </div>
                            <div className="user-card-header-right">
                              <a href="#" onClick={(e) => { e.preventDefault(); setActiveTab('orders'); }} className="theme-btn">
                                <span className="fas fa-arrow-left"></span> Danh sách đơn
                              </a>
                            </div>
                          </div>

                          {!selectedOrder ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                              <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#5C86B8' }}></i>
                            </div>
                          ) : (
                            <>
                              <div className="table-responsive">
                                <table className="table table-borderless text-nowrap">
                                  <thead>
                                    <tr>
                                      <th>Sản phẩm</th>
                                      <th>Biến thể</th>
                                      <th>Số lượng</th>
                                      <th>Đơn giá</th>
                                      <th>Thành tiền</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {selectedOrderItems.map((item, i) => {
                                      const unitPrice = item.promotional_price || item.price || 0;
                                      return (
                                        <tr key={i}>
                                          <td>
                                            <div className="table-list-info">
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                {item.image && (
                                                  <div className="table-list-img">
                                                    <img src={item.image} alt={item.product_name} style={{ width: 50, height: 50, objectFit: 'cover', borderRadius: 4 }} />
                                                  </div>
                                                )}
                                                <div className="table-list-content">
                                                  <h6 style={{ marginBottom: 2 }}>{item.product_name}</h6>
                                                  <span style={{ fontSize: 12, color: '#aaa' }}>ID: {item.product_id}</span>
                                                </div>
                                              </div>
                                            </div>
                                          </td>
                                          <td>{item.variant_name || '—'}</td>
                                          <td>{item.quantity}</td>
                                          <td>{formatPrice(unitPrice)}</td>
                                          <td style={{ fontWeight: 600, color: '#e53935' }}>{formatPrice(unitPrice * item.quantity)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                              <div className="row" style={{ marginTop: 16 }}>
                                <div className="col-lg-6">
                                  <div className="order-detail-content">
                                    <h5>Địa chỉ giao hàng</h5>
                                    <p>
                                      <i className="far fa-location-dot"></i>{' '}
                                      {[selectedOrder.shippingaddressline1, selectedOrder.shippingaddressline2, selectedOrder.shippingcity, selectedOrder.shippingdistrict]
                                        .filter(Boolean).join(', ') || 'Không có thông tin'}
                                    </p>
                                    {selectedOrder.shippingphone && (
                                      <p><i className="fas fa-phone"></i> {selectedOrder.shippingphone}</p>
                                    )}
                                  </div>
                                </div>
                                  <div className="col-lg-6">
                                    <div style={{ background: '#f8f9fa', padding: '24px', borderRadius: '12px' }}>
                                      <h5 style={{ fontWeight: 600, marginBottom: 20, fontSize: 16, color: '#222' }}>Tóm tắt đơn hàng</h5>
                                      <ul style={{ listStyle:'none', padding:0, margin:0 }}>
                                        <li style={{ display:'flex', justifyContent:'space-between', marginBottom:12, fontSize:15, color:'#444' }}>
                                          <span>Tạm tính:</span>
                                          <span style={{ fontWeight:600, color: '#222' }}>
                                            {formatPrice(selectedOrderItems.reduce((acc, item) => acc + (item.promotional_price || item.price || 0) * item.quantity, 0))}
                                          </span>
                                        </li>
                                        <li style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:15, color:'#444' }}>
                                          <span>Phí vận chuyển:</span>
                                          <span>
                                            {(() => {
                                              const finalBase = selectedOrder.base_shipping_fee || Math.max(0, (selectedOrder.deliveryprice || 0) - (selectedOrder.cod_surcharge || 0) - (selectedOrder.insurance_fee || 0) - (selectedOrder.fuel_surcharge || 0));
                                              return finalBase > 0 ? formatPrice(finalBase) : 'Miễn phí';
                                            })()}
                                          </span>
                                        </li>
                                        {(selectedOrder.fuel_surcharge > 0) && (
                                          <li style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'#ff9800' }}>
                                            <span>Phí nhiên liệu:</span>
                                            <span>+{formatPrice(selectedOrder.fuel_surcharge)}</span>
                                          </li>
                                        )}
                                        {(selectedOrder.cod_surcharge > 0) && (
                                          <li style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'#e53935' }}>
                                            <span>Phí COD:</span>
                                            <span>+{formatPrice(selectedOrder.cod_surcharge)}</span>
                                          </li>
                                        )}
                                        {(selectedOrder.insurance_fee > 0) && (
                                          <li style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:13, color:'#4caf50' }}>
                                            <span>Phí bảo hiểm:</span>
                                            <span>+{formatPrice(selectedOrder.insurance_fee)}</span>
                                          </li>
                                        )}
                                        
                                        {((Number(selectedOrder.shop_discount) || 0) > 0 || (Number(selectedOrder.platform_discount) || 0) > 0) && (
                                          <>
                                            <li><hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '12px 0' }} /></li>
                                            
                                            <li style={{ marginBottom: 12 }}>
                                              {Number(selectedOrder.shop_discount) > 0 && selectedOrder.shop_coupon_code && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: (Number(selectedOrder.platform_discount) > 0 && selectedOrder.platform_coupon_code) ? '1px dashed #eaeaea' : 'none' }}>
                                                  <span style={{ fontSize: 14, color: '#555' }}>Mã Shop</span>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 13, background: '#e3f2fd', color: '#1565c0', border: '1px dashed #1565c0', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>{selectedOrder.shop_coupon_code}</span>
                                                  </div>
                                                </div>
                                              )}
                                              {Number(selectedOrder.platform_discount) > 0 && selectedOrder.platform_coupon_code && (
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0' }}>
                                                  <span style={{ fontSize: 14, color: '#555' }}>Mã Sàn</span>
                                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <span style={{ fontSize: 13, background: '#fff0f0', color: '#e53935', border: '1px dashed #e53935', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>{selectedOrder.platform_coupon_code}</span>
                                                  </div>
                                                </div>
                                              )}
                                            </li>
                                          </>
                                        )}
                                        
                                        <li><hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '12px 0' }} /></li>
                                        
                                        {((Number(selectedOrder.shop_discount) || 0) + (Number(selectedOrder.platform_discount) || 0)) > 0 && (
                                          <li style={{ display:'flex', justifyContent:'space-between', marginBottom:12, fontSize:16, color:'#22BAA0', fontWeight:600 }}>
                                            <span>Giảm giá:</span>
                                            <span>-{formatPrice((Number(selectedOrder.shop_discount) || 0) + (Number(selectedOrder.platform_discount) || 0))}</span>
                                          </li>
                                        )}
                                        
                                        <li><hr style={{ border: 'none', borderTop: '1px solid #ccc', margin: '12px 0' }} /></li>
                                        
                                        <li style={{ display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:18, color:'#1a237e', alignItems: 'center' }}>
                                          <span>Tổng cộng:</span>
                                          <span style={{ color:'#e53935' }}>{formatPrice(selectedOrder.finalprice || selectedOrder.total_amount)}</span>
                                        </li>
                                      </ul>
                                    </div>
                                  {['CREATED', 'PAID'].includes((selectedOrder.status || '').toUpperCase()) && (
                                    <button
                                      onClick={() => handleCancelOrder(selectedOrder.id)}
                                      className="theme-btn"
                                      style={{ background: '#e53935', color: '#fff', border: 'none', marginTop: 12, cursor: 'pointer', width: '100%' }}>
                                      <i className="far fa-times"></i> Hủy đơn hàng
                                    </button>
                                  )}
                                  {canReviewOrder(selectedOrder) && (
                                    <button
                                      onClick={() => openReviewModal(selectedOrder)}
                                      className="theme-btn"
                                      style={{ background: '#2563eb', color: '#fff', border: 'none', marginTop: 12, cursor: 'pointer', width: '100%' }}>
                                      <i className="far fa-star"></i> Đánh giá đơn hàng
                                    </button>
                                  )}
                                  {isOrderReviewed(selectedOrder) && (
                                    <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: '#eefbf3', color: '#16a34a', fontWeight: 600, textAlign: 'center' }}>
                                      <i className="far fa-check-circle"></i> Đơn hàng này đã được đánh giá
                                    </div>
                                  )}
                                  {canRequestReturn(selectedOrder) && (
                                    <button
                                      onClick={() => handleRequestReturn(selectedOrder.id)}
                                      className="theme-btn"
                                      style={{ background: '#ff9800', color: '#fff', border: 'none', marginTop: 12, cursor: 'pointer', width: '100%' }}>
                                      <i className="far fa-undo"></i> Yêu cầu hoàn trả
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Wishlist Tab */}
                  {activeTab === 'wishlist' && (
                    <div className="row">
                      <div className="col-lg-12">
                        <div className="user-card">
                          <h4 className="user-card-title">My Wishlist ({wishlistItems?.length || 0})</h4>
                          {wishlistLoading ? (
                            <div style={{ textAlign: 'center', padding: '60px 0' }}>
                              <i className="fas fa-spinner fa-spin" style={{ fontSize: 28, color: '#5C86B8' }}></i>
                            </div>
                          ) : wishlistItems?.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 0', color: '#999' }}>
                              <i className="fas fa-heart" style={{ fontSize: 40, marginBottom: 12, opacity: 0.3 }}></i>
                              <p>Danh sách yêu thích trống</p>
                              <Link href="/shop-search" className="theme-btn mt-3">Khám phá sản phẩm</Link>
                            </div>
                          ) : (
                            <div className="row g-4 mt-20 item-2">
                              {wishlistItems?.map(item => (
                                <div key={item.id} className="col-md-6 col-lg-4">
                                  <div className="product-item">
                                    <div className="product-img">
                                      {item.in_stock ? (
                                        <span className="type new">Còn hàng</span>
                                      ) : (
                                        <span className="type oos">Hết hàng</span>
                                      )}
                                      <Link href={`/product/${item.product_id}`}>
                                        <img src={item.product_image || '/assets/img/product/01.png'} alt={item.product_name} />
                                      </Link>
                                      <div className="product-action-wrap">
                                        <div className="product-action">
                                          <Link href={`/product/${item.product_id}`} title="Xem chi tiết"><i className="far fa-eye"></i></Link>
                                          <a
                                            href="#"
                                            onClick={async (e) => {
                                              e.preventDefault();
                                              try {
                                                await removeFromWishlist(item.product_id);
                                                await fetchWishlist(); // Refresh wishlist
                                              } catch (err) {
                                                setMessage({ type: 'error', text: 'Lỗi xóa sản phẩm' });
                                              }
                                            }}
                                            title="Xóa khỏi wishlist"
                                          >
                                            <i className="far fa-xmark"></i>
                                          </a>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="product-content">
                                      <h3 className="product-title"><Link href={`/product/${item.product_id}`}>{item.product_name}</Link></h3>
                                      <div className="product-rate">
                                        {[1, 2, 3, 4, 5].map(s => <i key={s} className={s <= Math.round(item.product_rating || 0) ? 'fas fa-star' : 'far fa-star'}></i>)}
                                      </div>
                                      <div className="product-bottom">
                                        <div className="product-price">
                                          {item.product_promotional_price && Number(item.product_promotional_price) < Number(item.product_price) ? (
                                            <>
                                              <del>{formatPrice(item.product_price)}</del>
                                              <span>{formatPrice(item.product_promotional_price)}</span>
                                            </>
                                          ) : (
                                            <span>{formatPrice(item.product_price)}</span>
                                          )}
                                        </div>
                                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                                          <button
                                            onClick={async () => {
                                              if (!user) { router.push('/login'); return; }
                                              try {
                                                const qty = 1;
                                                await useCartStore.getState().addToCart(item.product_id, item.variant_id, qty);
                                                await useCartStore.getState().fetchCount();
                                                setMessage({ type: 'success', text: 'Đã thêm vào giỏ hàng' });
                                              } catch (e) {
                                                setMessage({ type: 'error', text: e.response?.data?.detail || 'Lỗi thêm giỏ hàng' });
                                              }
                                            }}
                                            disabled={!item.in_stock}
                                            className="product-cart-btn"
                                            title={item.in_stock ? "Thêm vào giỏ" : "Hết hàng"}>
                                            <i className="fas fa-bag-shopping"></i>
                                          </button>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Profile Tab */}
                  {activeTab === 'profile' && (
                    <div className="row">
                      <div className="col-lg-12">
                        <div className="user-card">
                          <h4 className="user-card-title">Profile Info</h4>
                          <div className="user-form">
                            <form onSubmit={handleProfileSubmit}>
                              <div className="row">
                                <div className="col-md-6">
                                  <div className="form-group">
                                    <label>First Name</label>
                                    <input
                                      type="text"
                                      className="form-control"
                                      value={profileData.firstName}
                                      onChange={(e) => setProfileData({ ...profileData, firstName: e.target.value })}
                                      placeholder="First Name"
                                    />
                                  </div>
                                </div>
                                <div className="col-md-6">
                                  <div className="form-group">
                                    <label>Last Name</label>
                                    <input
                                      type="text"
                                      className="form-control"
                                      value={profileData.lastName}
                                      onChange={(e) => setProfileData({ ...profileData, lastName: e.target.value })}
                                      placeholder="Last Name"
                                    />
                                  </div>
                                </div>
                                <div className="col-md-6">
                                  <div className="form-group">
                                    <label>Email</label>
                                    <input
                                      type="email"
                                      className="form-control"
                                      value={profileData.email}
                                      disabled
                                      placeholder="Email"
                                    />
                                  </div>
                                </div>
                                <div className="col-md-6">
                                  <div className="form-group">
                                    <label>Phone</label>
                                    <input
                                      type="text"
                                      className="form-control"
                                      value={profileData.phone}
                                      onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                                      placeholder="Phone"
                                    />
                                  </div>
                                </div>
                                <div className="col-md-12">
                                  <div className="form-group">
                                    <label>Address</label>
                                    <input
                                      type="text"
                                      className="form-control"
                                      value={profileData.address}
                                      onChange={(e) => setProfileData({ ...profileData, address: e.target.value })}
                                      placeholder="Address"
                                    />
                                  </div>
                                </div>
                              </div>
                              <button type="submit" className="theme-btn" disabled={loading}>
                                <span className="far fa-user"></span> {loading ? 'Saving...' : 'Save Changes'}
                              </button>
                            </form>
                          </div>
                        </div>
                      </div>
                      <div className="col-lg-12">
                        <div className="user-card">
                          <h4 className="user-card-title">Change Password</h4>
                          <div className="col-lg-12">
                            <div className="user-form">
                              <form onSubmit={handlePasswordSubmit}>
                                <div className="row">
                                  <div className="col-md-12">
                                    <div className="form-group">
                                      <label>Old Password</label>
                                      <input
                                        type="password"
                                        className="form-control"
                                        value={passwordData.oldPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, oldPassword: e.target.value })}
                                        placeholder="Old Password"
                                      />
                                    </div>
                                  </div>
                                  <div className="col-md-12">
                                    <div className="form-group">
                                      <label>New Password</label>
                                      <input
                                        type="password"
                                        className="form-control"
                                        value={passwordData.newPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                        placeholder="New Password"
                                      />
                                    </div>
                                  </div>
                                  <div className="col-md-12">
                                    <div className="form-group">
                                      <label>Re-Type Password</label>
                                      <input
                                        type="password"
                                        className="form-control"
                                        value={passwordData.confirmPassword}
                                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                        placeholder="Re-Type Password"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <button type="submit" className="theme-btn" disabled={loading}>
                                  <span className="far fa-key"></span> {loading ? 'Changing...' : 'Change Password'}
                                </button>
                              </form>
                            </div>
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
        {/* user dashboard end */}
      </main>

      {/* Footer */}
      <footer className="footer-area ft-bg">
        <div className="footer-widget">
          <div className="container">
            <div className="row footer-widget-wrapper pt-100 pb-40">
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box about-us">
                  <Link href="/" className="footer-logo">
                    <img src="/assets/img/logo/logo-light.png" alt="" />
                  </Link>
                  <p className="mb-3">
                    Modern e-commerce platform with blockchain technology
                  </p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84123456789"><i className="fas fa-phone"></i>+84 123 456 789</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hanoi, Vietnam</li>
                    <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i>info@example.com</a></li>
                    <li><i className="fas fa-clock"></i>Mon-Sat (9:00 - 18:00)</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Quick Links</h4>
                  <ul className="footer-list">
                    <li><Link href="/about">About Us</Link></li>
                    <li><Link href="/help">Help</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                    <li><Link href="/blog">News</Link></li>
                    <li><Link href="/terms">Terms</Link></li>
                    <li><Link href="/privacy">Privacy</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Categories</h4>
                  <ul className="footer-list">
                    <li><Link href="/shop-search">Furniture</Link></li>
                    <li><Link href="/shop-search">Electronics</Link></li>
                    <li><Link href="/shop-search">Fashion</Link></li>
                    <li><Link href="/shop-search">Beauty</Link></li>
                    <li><Link href="/shop-search">Sports</Link></li>
                    <li><Link href="/shop-search">Books</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Support</h4>
                  <ul className="footer-list">
                    <li><Link href="/faq">FAQ</Link></li>
                    <li><Link href="/help">Shopping Guide</Link></li>
                    <li><Link href="/track-order">Track Order</Link></li>
                    <li><Link href="/return">Return Policy</Link></li>
                    <li><Link href="/contact">Contact Us</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Payment</h4>
                  <div className="footer-payment mt-20">
                    <span>We accept:</span>
                    <img src="/assets/img/payment/visa.svg" alt="" />
                    <img src="/assets/img/payment/mastercard.svg" alt="" />
                    <img src="/assets/img/payment/momo.svg" alt="" />
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
                  <p className="copyright-text">
                    &copy; Copyright 2026 <a href="/"> E-Commerce </a> All Rights Reserved.
                  </p>
                </div>
                <div className="col-12 col-lg-6 align-self-center">
                  <div className="footer-social">
                    <span>Follow Us:</span>
                    <a href="#"><i className="fab fa-facebook-f"></i></a>
                    <a href="#"><i className="fab fa-x-twitter"></i></a>
                    <a href="#"><i className="fab fa-linkedin-in"></i></a>
                    <a href="#"><i className="fab fa-youtube"></i></a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {reviewModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(12, 18, 28, 0.55)',
            backdropFilter: 'blur(2px)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setReviewModalOpen(false); }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 560,
              background: '#fff',
              borderRadius: 16,
              border: '1px solid #eef0f6',
              boxShadow: '0 20px 60px rgba(15, 23, 42, 0.28)',
              overflow: 'hidden'
            }}
          >
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #f1f3f9', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h5 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#1f2937' }}>Đánh giá đơn hàng</h5>
                <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>Mã đơn: {reviewTarget?.id}</div>
              </div>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                style={{ border: 'none', background: '#f4f6fb', color: '#64748b', width: 32, height: 32, borderRadius: 8, cursor: 'pointer', fontSize: 16 }}
                aria-label="Đóng"
              >
                ×
              </button>
            </div>

            <div style={{ padding: '18px 20px 14px' }}>
              <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#334155' }}>Mức độ hài lòng</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 14 }}>
                {[1, 2, 3, 4, 5].map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setReviewRating(s)}
                    style={{
                      border: 'none',
                      background: 'none',
                      fontSize: 28,
                      color: s <= reviewRating ? '#f59e0b' : '#d1d5db',
                      cursor: 'pointer',
                      lineHeight: 1,
                      padding: '0 2px'
                    }}
                    title={`${s} sao`}
                  >
                    ★
                  </button>
                ))}
                <span style={{ marginLeft: 8, fontSize: 13, color: '#64748b' }}>{reviewRating}/5</span>
              </div>

              <div style={{ marginBottom: 8, fontSize: 13, fontWeight: 600, color: '#334155' }}>Nhận xét</div>
              <textarea
                rows={5}
                value={reviewContent}
                onChange={(e) => setReviewContent(e.target.value)}
                placeholder="Chia sẻ trải nghiệm của bạn về sản phẩm, giao hàng, đóng gói..."
                style={{
                  width: '100%',
                  border: '1px solid #dbe2ee',
                  borderRadius: 10,
                  padding: '12px 14px',
                  resize: 'vertical',
                  fontSize: 14,
                  color: '#1f2937',
                  outline: 'none',
                  background: '#fcfdff'
                }}
              />
            </div>

            <div style={{ padding: '14px 20px 18px', borderTop: '1px solid #f1f3f9', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                onClick={() => setReviewModalOpen(false)}
                style={{
                  border: '1px solid #d7deea',
                  background: '#fff',
                  color: '#475569',
                  borderRadius: 10,
                  padding: '9px 14px',
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={submitReview}
                disabled={submittingReview}
                style={{
                  border: 'none',
                  background: submittingReview ? '#93c5fd' : '#2563eb',
                  color: '#fff',
                  borderRadius: 10,
                  padding: '9px 16px',
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: submittingReview ? 'not-allowed' : 'pointer',
                  boxShadow: submittingReview ? 'none' : '0 6px 14px rgba(37,99,235,0.28)'
                }}
              >
                {submittingReview ? 'Đang gửi...' : 'Gửi đánh giá'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scroll to top */}
      <a href="#" id="scroll-top"><i className="fas fa-arrow-up"></i></a>
    </>
  );
}