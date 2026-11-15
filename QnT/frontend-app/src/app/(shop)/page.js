// frontend-app\src\app\(shop)\page.js

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import Head from 'next/head';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import WishlistIcon from '@/components/WishlistIcon';
import './styles.css';

export default function LoginPage() {
  const router = useRouter();
  const { user, clearUser } = useUserStore();
  const { count: cartCount, fetchCount } = useCartStore();
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [remember, setRemember] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const totalSlides = 3;
  
  // Deal slider state
  const [currentDeal, setCurrentDeal] = useState(0);
  const totalDeals = 3;

  // Categories state
  const [categories, setCategories] = useState([]);

  // Countdown state
  const [countdown, setCountdown] = useState({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch cart count
  useEffect(() => {
    if (user) fetchCount();
  }, [user]);

  // Fetch products from API
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const res = await axios.get('/v1/shop/products?limit=12');
        setProducts(res.data.products || []);
      } catch (err) {
        console.error('Fetch products error:', err);
      }
    };
    fetchProducts();
  }, []);

  // Fetch categories from API
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await axios.get('/v1/shop/categories');
        // Add icon mapping
        const categoriesWithIcons = res.data.categories || [];
        setCategories(categoriesWithIcons);
      } catch (err) {
        console.error('Fetch categories error:', err);
      }
    };
    fetchCategories();
  }, []);

  // Get category icon
  const getCategoryIcon = (categoryName) => {
    const iconMap = {
      'Nội Thất': 'fa-couch',
      'Nội thất': 'fa-couch',
      'Điện Tử': 'fa-tv',
      'Điện tử': 'fa-tv',
      'Thời Trang': 'fa-shirt',
      'Thời trang': 'fa-shirt',
      'Thời Trang Nữ': 'fa-person-dress',
      'Thời trang nữ': 'fa-person-dress',
      'Thời Trang Nam': 'fa-shirt',
      'Thời trang nam': 'fa-shirt',
      'Làm Đẹp': 'fa-sparkles',
      'Làm đẹp': 'fa-sparkles',
      'Thể Thao': 'fa-dumbbell',
      'Thể thao': 'fa-dumbbell',
      'Sách': 'fa-book',
      'Sách': 'fa-book',
      'Giày Dép': 'fa-shoe-prints',
      'Giày dép': 'fa-shoe-prints',
      'Đồ Gia Dụng': 'fa-blender',
      'Đồ gia dụng': 'fa-blender',
      'Đồ Điện': 'fa-lightbulb',
      'Đồ điện': 'fa-lightbulb',
      'Thực Phẩm': 'fa-apple-whole',
      'Thực phẩm': 'fa-apple-whole',
      'Đồ Chơi': 'fa-cube',
      'Đồ chơi': 'fa-cube',
      'Điện Thoại': 'fa-mobile',
      'Điện thoại': 'fa-mobile'
    };
    return iconMap[categoryName] || 'fa-box';
  };

  // Get category background color
  const getCategoryColor = (index) => {
    const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F'];
    return colors[index % colors.length];
  };

  const formatPrice = (price) => {
    if (!price && price !== 0) return '';
    return Number(price).toLocaleString('vi-VN') + 'đ';
  };

  const getDisplayPrice = (product) => {
    if (parseInt(product.variant_count) > 0 && product.variant_price_min) {
      const saleMin = Number(product.variant_promo_price_min || product.variant_price_min);
      const saleMax = Number(product.variant_promo_price_max || product.variant_price_max);
      if (saleMin === saleMax) return formatPrice(saleMin);
      return `${formatPrice(saleMin)} - ${formatPrice(saleMax)}`;
    }
    return formatPrice(product.promotionalprice || product.price);
  };

  const getOriginalPrice = (product) => {
    if (parseInt(product.variant_count) > 0) return null;
    if (product.promotionalprice && product.promotionalprice < product.price) return formatPrice(product.price);
    return null;
  };

  const handleLogout = async () => {
    try {
      if (user?.id) {
        await axios.post('/v1/auth/logout', { user_id: user.id });
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

  // Auto-play hero slider
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % totalSlides);
    }, 5000); // Chuyển slide mỗi 5 giây

    return () => clearInterval(timer);
  }, []);

  // Auto-play deal slider
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDeal((prev) => (prev + 1) % totalDeals);
    }, 6000); // Chuyển deal mỗi 6 giây

    return () => clearInterval(timer);
  }, []);

  // Countdown timer
  useEffect(() => {
    const targetDate = new Date('2025/12/30').getTime();

    const updateCountdown = () => {
      const now = new Date().getTime();
      const distance = targetDate - now;

      if (distance > 0) {
        setCountdown({
          days: Math.floor(distance / (1000 * 60 * 60 * 24)),
          hours: Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)),
          minutes: Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60)),
          seconds: Math.floor((distance % (1000 * 60)) / 1000)
        });
      }
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
  };

  const goToSlide = (index) => {
    setCurrentSlide(index);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await axios.post('/v1/auth/login', formData);
      
      // Save token
      localStorage.setItem('access_token', res.data.access_token);
      localStorage.setItem('user', JSON.stringify(res.data.user));
      localStorage.setItem('userType', 'customer');
      
      // Redirect based on role
      const roles = res.data.user.roles;
      if (roles.includes('ADMIN')) {
        router.push('/admin/tax-config');
      } else if (roles.includes('STORE_OWNER')) {
        router.push('/seller/orders');
      } else if (roles.includes('SHIPPER')) {
        router.push('/shipper/dashboard');
      } else {
        router.push('/');
      }
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <>
      <Head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </Head>
      
      <header className="header">
        {/* header top */}
        <div className="header-top">
          <div className="container">
            <div className="header-top-wrapper">
              <div className="row">
                <div className="col-12 col-md-6 col-lg-6 col-xl-5">
                  <div className="header-top-left">
                    <ul className="header-top-list">
                      <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i> info@example.com</a></li>
                      <li><a href="tel:+21236547898"><i className="fas fa-headset"></i> +2 123 654 7898</a></li>
                      <li><a href="#"><i className="fas fa-question-circle"></i> Need Help?</a></li>
                    </ul>
                  </div>
                </div>
                <div className="col-12 col-md-6 col-lg-6 col-xl-7">
                  <div className="header-top-right">
                    <ul className="header-top-list">
                      {mounted && user ? (
                        <>
                          <li>
                            <Link href="/profile">
                              <i className="fas fa-user"></i> {user.full_name || user.email}
                            </Link>
                          </li>
                          <li>
                            <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit' }}>
                              <i className="fas fa-sign-out-alt"></i> Logout
                            </button>
                          </li>
                        </>
                      ) : (
                        <>
                          <li><Link href="/login"><i className="fas fa-sign-in-alt"></i> Login</Link></li>
                          <li><Link href="/register"><i className="fas fa-user-plus"></i> Register</Link></li>
                        </>
                      )}
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
        {/* header top end */}

        {/* navbar */}
        <div className="main-navigation">
          <nav className="navbar navbar-expand-lg">
            <div className="container position-relative">
              <Link href="/" className="navbar-brand">
                <img src="/assets/img/logo/logo.png" alt="logo" style={{
                  maxWidth: '120px',
                  margin: '0 10px',
                  transform: 'translateY(18px)'
                }} />
              </Link>
              <div className="mobile-menu-right">
                <div className="mobile-menu-btn">
                  <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                  <WishlistIcon className="nav-right-link" />
                  <Link href="/cart" className="nav-right-link"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</Link>
                </div>
                <button className="navbar-toggler" type="button">
                  <span></span>
                  <span></span>
                  <span></span>
                </button>
              </div>
              <div className="navbar-collapse">
                <ul className="navbar-nav">
                  <li className="nav-item"><Link className="nav-link" href="/">Home</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/about">About</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/shop-search">Shop</Link></li>
                  <li className="nav-item"><Link className="nav-link" href="/blog">Blog</Link></li>
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
        {/* navbar end */}
      </header>

      {/* breadcrumb */}
      <main className="main">
        <div className="hero-section hs-1">
            <div className="container">
                <div className="hero-slider">
                    <div className="hero-single" style={{ 
                        display: currentSlide === 0 ? 'block' : 'none',
                        animation: currentSlide === 0 ? 'fadeIn 0.5s' : 'none'
                    }}>
                        <div className="container">
                            <div className="row align-items-center">
                                <div className="col-lg-6">
                                    <div className="hero-content">
                                        <h6 className="hero-sub-title" data-animation="fadeInUp" data-delay=".25s">Welcome to fameo!</h6>
                                        <h1 className="hero-title" data-animation="fadeInRight" data-delay=".50s">
                                            We offers modern <span>furniture</span> for you
                                        </h1>
                                        <p data-animation="fadeInLeft" data-delay=".75s">
                                            There are many variations of passages orem psum available but the majority
                                            have suffered alteration in some form by injected humour.
                                        </p>
                                        <div className="hero-btn" data-animation="fadeInUp" data-delay="1s">
                                            <Link href="/shop-search" className="theme-btn">Shop Now<i
                                                    className="fas fa-arrow-right"></i></Link>
                                            <Link href="/about" className="theme-btn theme-btn2">Learn More<i
                                                    className="fas fa-arrow-right"></i></Link>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-lg-6">
                                    <div className="hero-right" data-animation="fadeInRight" data-delay=".25s">
                                        <div className="hero-img">
                                            <div className="hero-img-item">
                                                <button type="button"><i className="far fa-plus"></i></button>
                                                <div className="hero-img-content">
                                                    <img src="assets/img/hero/01.png" alt="" />
                                                    <div className="hero-img-info">
                                                        <h6><a href="#">Modern Chair</a></h6>
                                                        <p>Price: <span>$230</span></p>
                                                        <a href="#" className="theme-btn">Buy Now<i
                                                                className="fas fa-arrow-right"></i></a>
                                                    </div>
                                                </div>
                                            </div>
                                            <img src="assets/img/hero/01.png" alt="" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="hero-single" style={{ 
                        display: currentSlide === 1 ? 'block' : 'none',
                        animation: currentSlide === 1 ? 'fadeIn 0.5s' : 'none'
                    }}>
                        <div className="container">
                            <div className="row align-items-center">
                                <div className="col-lg-6">
                                    <div className="hero-content">
                                        <h6 className="hero-sub-title" data-animation="fadeInUp" data-delay=".25s">Welcome to fameo!</h6>
                                        <h1 className="hero-title" data-animation="fadeInRight" data-delay=".50s">
                                            We offers modern <span>furniture</span> for you
                                        </h1>
                                        <p data-animation="fadeInLeft" data-delay=".75s">
                                            There are many variations of passages orem psum available but the majority
                                            have suffered alteration in some form by injected humour.
                                        </p>
                                        <div className="hero-btn" data-animation="fadeInUp" data-delay="1s">
                                            <Link href="/shop-search" className="theme-btn">Shop Now<i
                                                    className="fas fa-arrow-right"></i></Link>
                                            <Link href="/about" className="theme-btn theme-btn2">Learn More<i
                                                    className="fas fa-arrow-right"></i></Link>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-lg-6">
                                    <div className="hero-right" data-animation="fadeInRight" data-delay=".25s">
                                        <div className="hero-img">
                                            <div className="hero-img-item">
                                                <button type="button"><i className="far fa-plus"></i></button>
                                                <div className="hero-img-content">
                                                    <img src="assets/img/hero/02.png" alt="" />
                                                    <div className="hero-img-info">
                                                        <h6><a href="#">Modern Chair</a></h6>
                                                        <p>Price: <span>$230</span></p>
                                                        <a href="#" className="theme-btn">Buy Now<i
                                                                className="fas fa-arrow-right"></i></a>
                                                    </div>
                                                </div>
                                            </div>
                                            <img src="assets/img/hero/02.png" alt="" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div className="hero-single" style={{ 
                        display: currentSlide === 2 ? 'block' : 'none',
                        animation: currentSlide === 2 ? 'fadeIn 0.5s' : 'none'
                    }}>
                        <div className="container">
                            <div className="row align-items-center">
                                <div className="col-lg-6">
                                    <div className="hero-content">
                                        <h6 className="hero-sub-title" data-animation="fadeInUp" data-delay=".25s">Welcome to fameo!</h6>
                                        <h1 className="hero-title" data-animation="fadeInRight" data-delay=".50s">
                                            We offers modern <span>furniture</span> for you
                                        </h1>
                                        <p data-animation="fadeInLeft" data-delay=".75s">
                                            There are many variations of passages orem psum available but the majority
                                            have suffered alteration in some form by injected humour.
                                        </p>
                                        <div className="hero-btn" data-animation="fadeInUp" data-delay="1s">
                                            <Link href="/shop-search" className="theme-btn">Shop Now<i
                                                    className="fas fa-arrow-right"></i></Link>
                                            <Link href="/about" className="theme-btn theme-btn2">Learn More<i
                                                    className="fas fa-arrow-right"></i></Link>
                                        </div>
                                    </div>
                                </div>
                                <div className="col-lg-6">
                                    <div className="hero-right" data-animation="fadeInRight" data-delay=".25s">
                                        <div className="hero-img">
                                            <div className="hero-img-item">
                                                <button type="button"><i className="far fa-plus"></i></button>
                                                <div className="hero-img-content">
                                                    <img src="assets/img/hero/03.png" alt="" />
                                                    <div className="hero-img-info">
                                                        <h6><a href="#">Modern Chair</a></h6>
                                                        <p>Price: <span>$230</span></p>
                                                        <a href="#" className="theme-btn">Buy Now<i
                                                                className="fas fa-arrow-right"></i></a>
                                                    </div>
                                                </div>
                                            </div>
                                            <img src="assets/img/hero/03.png" alt="" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Navigation Arrows */}
                <button 
                    onClick={prevSlide}
                    className="hero-slider-arrow hero-slider-prev"
                    style={{
                        position: 'absolute',
                        left: '20px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        zIndex: 10,
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '50px',
                        height: '50px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '20px',
                        transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255, 216, 115, 0.8)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                >
                    <i className="fas fa-chevron-left"></i>
                </button>
                <button 
                    onClick={nextSlide}
                    className="hero-slider-arrow hero-slider-next"
                    style={{
                        position: 'absolute',
                        right: '20px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        zIndex: 10,
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '50%',
                        width: '50px',
                        height: '50px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '20px',
                        transition: 'all 0.3s'
                    }}
                    onMouseEnter={(e) => e.target.style.background = 'rgba(255, 216, 115, 0.8)'}
                    onMouseLeave={(e) => e.target.style.background = 'rgba(255, 255, 255, 0.2)'}
                >
                    <i className="fas fa-chevron-right"></i>
                </button>

                {/* Pagination Dots */}
                <div style={{
                    position: 'absolute',
                    bottom: '30px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    display: 'flex',
                    gap: '10px',
                    zIndex: 10
                }}>
                    {[0, 1, 2].map((index) => (
                        <button
                            key={index}
                            onClick={() => goToSlide(index)}
                            style={{
                                width: currentSlide === index ? '30px' : '10px',
                                height: '10px',
                                borderRadius: '5px',
                                border: 'none',
                                background: currentSlide === index ? '#FFD873' : 'rgba(255, 255, 255, 0.5)',
                                cursor: 'pointer',
                                transition: 'all 0.3s'
                            }}
                        />
                    ))}
                </div>
            </div>
        </div>

        {/* category area */}
        <div className="category-area pt-80 pb-100">
            <div className="container">
                <div className="row">
                    <div className="col-12 wow fadeInDown" data-wow-delay=".25s">
                        <div className="site-heading-inline">
                            <h2 className="site-title">Top Category</h2>
                            <Link href="/category">View More <i className="fas fa-angle-double-right"></i></Link>
                        </div>
                    </div>
                </div>
                <div className="category-slider owl-carousel owl-theme wow fadeInUp" data-wow-delay=".25s">
                    {categories.slice(0, 5).map((category, index) => (
                        <div className="category-item" key={index}>
                            <a href={`/shop-search?category=${encodeURIComponent(category.category)}`}>
                                <div className="category-info">
                                    <div className="icon" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minHeight: '80px',
                                        color: '#666',
                                        fontSize: '48px'
                                    }}>
                                        <i className={`fas ${getCategoryIcon(category.category)}`}></i>
                                    </div>
                                    <div className="content">
                                        <h4>{category.category}</h4>
                                        <p>{category.count} Items</p>
                                    </div>
                                </div>
                            </a>
                        </div>
                    ))}
                </div>
            </div>
        </div>
        {/* category area end */}
         {/* big banner */}
        <div className="big-banner">
            <div className="container wow fadeInUp" data-wow-delay=".25s">
                <div className="banner-wrap" style={{backgroundImage: "url(assets/img/banner/big-banner.jpg)"}}>
                    <div className="row">
                        <div className="col-lg-8 mx-auto">
                            <div className="banner-content">
                                <div className="banner-info">
                                    <h6>Mega Collections</h6>
                                    <h2>Huge Sale Up To <span>40%</span> Off</h2>
                                    <p>at our outlet stores</p>
                                </div>
                                <Link href="/shop-search" className="theme-btn">Shop Now<i className="fas fa-arrow-right"></i></Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        {/* trending item */}
        {products.length > 0 && (
        <div className="product-area pb-100">
            <div className="container">
                <div className="row">
                    <div className="col-12 wow fadeInDown" data-wow-delay=".25s">
                        <div className="site-heading-inline">
                            <h2 className="site-title">Sản phẩm nổi bật</h2>
                        </div>
                    </div>
                </div>
                <div className="row g-4">
                    {products.slice(0, 8).map((product) => (
                        <div key={product.id} className="col-6 col-md-4 col-lg-3">
                            <div className="product-item">
                                <div className="product-img">
                                    {product.promotionalprice && product.promotionalprice < product.price && parseInt(product.variant_count) === 0 && (
                                        <span className="type discount">
                                            -{Math.round((1 - product.promotionalprice / product.price) * 100)}%
                                        </span>
                                    )}
                                    <Link href={`/product/${product.id}`}>
                                        <img src={product.primary_image || product.image || '/assets/img/product/01.png'} alt={product.name}
                                             style={{ width: '100%', height: '250px', objectFit: 'cover' }} />
                                    </Link>
                                    <div className="product-action-wrap">
                                        <div className="product-action">
                                            <Link href={`/product/${product.id}`} data-tooltip="tooltip" title="Xem chi tiết">
                                                <i className="far fa-eye"></i>
                                            </Link>
                                            <a href="#" data-tooltip="tooltip" title="Yêu thích"><i className="far fa-heart"></i></a>
                                        </div>
                                    </div>
                                </div>
                                <div className="product-content">
                                    <h3 className="product-title">
                                        <Link href={`/product/${product.id}`}>{product.name}</Link>
                                    </h3>
                                    <div className="product-rate">
                                        {[1, 2, 3, 4, 5].map((star) => {
                                            const value = Math.max(0, Math.min(5, Number(product.rating) || 0));
                                            if (value >= star) return <i key={star} className="fas fa-star"></i>;
                                            if (value >= star - 0.5) return <i key={star} className="fas fa-star-half-alt"></i>;
                                            return <i key={star} className="far fa-star"></i>;
                                        })}
                                    </div>
                                    <div className="product-bottom">
                                        <div className="product-price">
                                            {getOriginalPrice(product) && <del>{getOriginalPrice(product)}</del>}
                                            <span>{getDisplayPrice(product)}</span>
                                        </div>
                                        <Link href={`/product/${product.id}`} className="product-cart-btn" data-bs-placement="left"
                                            data-tooltip="tooltip" title="Xem chi tiết">
                                            <i className="fas fa-shopping-bag"></i>
                                        </Link>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                {products.length > 8 && (
                    <div className="text-center mt-4" style={{ paddingTop: '10px' }}>
                        <Link href="/shop-search" className="theme-btn">Xem tất cả <i className="fas fa-arrow-right"></i></Link>
                    </div>
                )}
            </div>
        </div>
        )}
        <div className="feature-area py-100">
            <div className="container wow fadeInUp" data-wow-delay=".25s">
                <div className="feature-wrap">
                    <div className="row g-0">
                        <div className="col-12 col-md-6 col-lg-3">
                            <div className="feature-item">
                                <div className="feature-icon">
                                    <i className="fas fa-truck"></i>
                                </div>
                                <div className="feature-content">
                                    <h4>Free Delivery</h4>
                                    <p>Orders Over $120</p>
                                </div>
                            </div>
                        </div>
                        <div className="col-12 col-md-6 col-lg-3">
                            <div className="feature-item">
                                <div className="feature-icon">
                                    <i className="fas fa-sync-alt"></i>
                                </div>
                                <div className="feature-content">
                                    <h4>Get Refund</h4>
                                    <p>Within 30 Days Returns</p>
                                </div>
                            </div>
                        </div>
                        <div className="col-12 col-md-6 col-lg-3">
                            <div className="feature-item">
                                <div className="feature-icon">
                                    <i className="fas fa-wallet"></i>
                                </div>
                                <div className="feature-content">
                                    <h4>Safe Payment</h4>
                                    <p>100% Secure Payment</p>
                                </div>
                            </div>
                        </div>
                        <div className="col-12 col-md-6 col-lg-3">
                            <div className="feature-item">
                                <div className="feature-icon">
                                    <i className="fas fa-headset"></i>
                                </div>
                                <div className="feature-content">
                                    <h4>24/7 Support</h4>
                                    <p>Feel Free To Call Us</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        {/* deal area */}
        <div className="deal-area bg pt-50 pb-50">
            <div className="deal-text-shape">Deal</div>
            <div className="container">
                <div className="deal-wrap wow fadeInUp" data-wow-delay=".25s">
                    <div className="deal-slider">
                        {/* Deal Item 1 */}
                        <div className="deal-item" style={{ 
                            display: currentDeal === 0 ? 'block' : 'none',
                            animation: currentDeal === 0 ? 'fadeIn 0.5s' : 'none'
                        }}>
                            <div className="row align-items-center">
                                <div className="col-lg-6">
                                    <div className="deal-content">
                                        <div className="deal-info">
                                            <span>This Week Deal</span>
                                            <h1>Best Sofa Furniture Deal</h1>
                                            <p>There are many variations of passages available but the majority have
                                                suffered alteration in some form
                                                by injected humour, or randomised words which don't look even slightly
                                                believable.</p>
                                        </div>
                                        <div className="deal-countdown">
                                            <div className="row">
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.days).padStart(2, '0')}</h2>
                                                        <h5>Days</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.hours).padStart(2, '0')}</h2>
                                                        <h5>Hours</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.minutes).padStart(2, '0')}</h2>
                                                        <h5>Minutes</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.seconds).padStart(2, '0')}</h2>
                                                        <h5>Seconds</h5>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <Link href="/shop-search" className="theme-btn theme-btn2">Shop Now <i
                                                className="fas fa-arrow-right"></i></Link>
                                    </div>
                                </div>
                                <div className="col-lg-6">
                                    <div className="deal-img">
                                        <img src="assets/img/product/b7.png" alt="" />
                                        <div className="deal-discount">
                                            <span>45%</span>
                                            <span>off</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Deal Item 2 */}
                        <div className="deal-item" style={{ 
                            display: currentDeal === 1 ? 'block' : 'none',
                            animation: currentDeal === 1 ? 'fadeIn 0.5s' : 'none'
                        }}>
                            <div className="row align-items-center">
                                <div className="col-lg-6">
                                    <div className="deal-content">
                                        <div className="deal-info">
                                            <span>Get 45% Off</span>
                                            <h1>Best Sofa Furniture Deal</h1>
                                            <p>There are many variations of passages available but the majority have
                                                suffered alteration in some form
                                                by injected humour, or randomised words which don't look even slightly
                                                believable.</p>
                                        </div>
                                        <div className="deal-countdown">
                                            <div className="row">
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.days).padStart(2, '0')}</h2>
                                                        <h5>Days</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.hours).padStart(2, '0')}</h2>
                                                        <h5>Hours</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.minutes).padStart(2, '0')}</h2>
                                                        <h5>Minutes</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.seconds).padStart(2, '0')}</h2>
                                                        <h5>Seconds</h5>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <Link href="/shop-search" className="theme-btn theme-btn2">Shop Now <i
                                                className="fas fa-arrow-right"></i></Link>
                                    </div>
                                </div>
                                <div className="col-lg-6">
                                    <div className="deal-img">
                                        <img src="assets/img/product/b2.png" alt="" />
                                        <div className="deal-discount">
                                            <span>45%</span>
                                            <span>off</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        {/* Deal Item 3 */}
                        <div className="deal-item" style={{ 
                            display: currentDeal === 2 ? 'block' : 'none',
                            animation: currentDeal === 2 ? 'fadeIn 0.5s' : 'none'
                        }}>
                            <div className="row align-items-center">
                                <div className="col-lg-6">
                                    <div className="deal-content">
                                        <div className="deal-info">
                                            <span>Get 20% Off</span>
                                            <h1>Best Sofa Furniture Deal</h1>
                                            <p>There are many variations of passages available but the majority have
                                                suffered alteration in some form
                                                by injected humour, or randomised words which don't look even slightly
                                                believable.</p>
                                        </div>
                                        <div className="deal-countdown">
                                            <div className="row">
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.days).padStart(2, '0')}</h2>
                                                        <h5>Days</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.hours).padStart(2, '0')}</h2>
                                                        <h5>Hours</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.minutes).padStart(2, '0')}</h2>
                                                        <h5>Minutes</h5>
                                                    </div>
                                                </div>
                                                <div className="col-3">
                                                    <div className="countdown-item">
                                                        <h2>{String(countdown.seconds).padStart(2, '0')}</h2>
                                                        <h5>Seconds</h5>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        <Link href="/shop-search" className="theme-btn theme-btn2">Shop Now <i
                                                className="fas fa-arrow-right"></i></Link>
                                    </div>
                                </div>
                                <div className="col-lg-6">
                                    <div className="deal-img">
                                        <img src="assets/img/product/b10.png" alt="" />
                                        <div className="deal-discount">
                                            <span>45%</span>
                                            <span>off</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    {/* Deal Slider Navigation Dots */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '10px',
                        marginTop: '30px'
                    }}>
                        {[...Array(totalDeals)].map((_, index) => (
                            <button
                                key={index}
                                onClick={() => setCurrentDeal(index)}
                                style={{
                                    width: '12px',
                                    height: '12px',
                                    borderRadius: '50%',
                                    border: 'none',
                                    cursor: 'pointer',
                                    background: currentDeal === index ? '#6b8db8' : 'rgba(0, 0, 0, 0.2)',
                                    transition: 'all 0.3s ease'
                                }}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </div>
        {/* deal area end */}
        {/* product list */}
        {products.length > 0 && (
        <div className="product-list py-100">
            <div className="container wow fadeInUp" data-wow-delay=".25s">
                <div className="row g-4">
                    {/* Khuyến mãi */}
                    <div className="col-12 col-md-6 col-lg-4">
                        <div className="product-list-box">
                            <h2 className="product-list-title">Khuyến mãi</h2>
                            {products.filter(p => p.promotionalprice && p.promotionalprice < p.price).slice(0, 3).map((product) => (
                                <div key={product.id} className="product-list-item">
                                    <div className="product-list-img">
                                        <Link href={`/product/${product.id}`}>
                                            <img src={product.primary_image || product.image || '/assets/img/product/01.png'} alt={product.name} />
                                        </Link>
                                    </div>
                                    <div className="product-list-content">
                                        <h4><Link href={`/product/${product.id}`}>{product.name}</Link></h4>
                                        <div className="product-list-rate">
                                            {[1,2,3,4,5].map(s => <i key={s} className={s <= Math.round(product.rating||0) ? 'fas fa-star' : 'far fa-star'}></i>)}
                                        </div>
                                        <div className="product-list-price">
                                            <del>{formatPrice(product.price)}</del>
                                            <span>{formatPrice(product.promotionalprice)}</span>
                                        </div>
                                    </div>
                                    <Link href={`/product/${product.id}`} className="product-list-btn" data-bs-placement="left" data-tooltip="tooltip" title="Xem chi tiết">
                                        <i className="fas fa-shopping-bag"></i>
                                    </Link>
                                </div>
                            ))}
                            {products.filter(p => p.promotionalprice && p.promotionalprice < p.price).length === 0 && (
                                <p style={{ color: '#999', padding: '20px 0' }}>Chưa có sản phẩm khuyến mãi</p>
                            )}
                        </div>
                    </div>
                    {/* Bán chạy */}
                    <div className="col-12 col-md-6 col-lg-4">
                        <div className="product-list-box">
                            <h2 className="product-list-title">Bán chạy</h2>
                            {[...products].sort((a, b) => (b.sold || 0) - (a.sold || 0)).slice(0, 3).map((product) => (
                                <div key={product.id} className="product-list-item">
                                    <div className="product-list-img">
                                        <Link href={`/product/${product.id}`}>
                                            <img src={product.primary_image || product.image || '/assets/img/product/01.png'} alt={product.name} />
                                        </Link>
                                    </div>
                                    <div className="product-list-content">
                                        <h4><Link href={`/product/${product.id}`}>{product.name}</Link></h4>
                                        <div className="product-list-rate">
                                            {[1,2,3,4,5].map(s => <i key={s} className={s <= Math.round(product.rating||0) ? 'fas fa-star' : 'far fa-star'}></i>)}
                                        </div>
                                        <div className="product-list-price">
                                            {getOriginalPrice(product) && <del>{getOriginalPrice(product)}</del>}
                                            <span>{getDisplayPrice(product)}</span>
                                        </div>
                                    </div>
                                    <Link href={`/product/${product.id}`} className="product-list-btn" data-bs-placement="left" data-tooltip="tooltip" title="Xem chi tiết">
                                        <i className="fas fa-shopping-bag"></i>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                    {/* Mới nhất */}
                    <div className="col-12 col-md-6 col-lg-4">
                        <div className="product-list-box">
                            <h2 className="product-list-title">Mới nhất</h2>
                            {products.slice(0, 3).map((product) => (
                                <div key={product.id} className="product-list-item">
                                    <div className="product-list-img">
                                        <Link href={`/product/${product.id}`}>
                                            <img src={product.primary_image || product.image || '/assets/img/product/01.png'} alt={product.name} />
                                        </Link>
                                    </div>
                                    <div className="product-list-content">
                                        <h4><Link href={`/product/${product.id}`}>{product.name}</Link></h4>
                                        <div className="product-list-rate">
                                            {[1,2,3,4,5].map(s => <i key={s} className={s <= Math.round(product.rating||0) ? 'fas fa-star' : 'far fa-star'}></i>)}
                                        </div>
                                        <div className="product-list-price">
                                            {getOriginalPrice(product) && <del>{getOriginalPrice(product)}</del>}
                                            <span>{getDisplayPrice(product)}</span>
                                        </div>
                                    </div>
                                    <Link href={`/product/${product.id}`} className="product-list-btn" data-bs-placement="left" data-tooltip="tooltip" title="Xem chi tiết">
                                        <i className="fas fa-shopping-bag"></i>
                                    </Link>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
        )}
        {/* product list end */}
         {/* newsletter area */}
        <div className="newsletter-area pb-100">
            <div className="container wow fadeInUp" data-wow-delay=".25s">
                <div className="newsletter-wrap">
                    <div className="row">
                        <div className="col-lg-6 mx-auto">
                            <div className="newsletter-content">
                                <h3>Get <span>20%</span> Off Discount Coupon</h3>
                                <p>By Subscribe Our Newsletter</p>
                                <div className="subscribe-form">
                                    <form action="#" onSubmit={(e) => {
                                        e.preventDefault();
                                        router.push('/contact');
                                    }}>
                                        <input type="email" className="form-control" placeholder="Your Email Address" />
                                        <button className="theme-btn" type="submit">
                                            Subscribe <i className="far fa-paper-plane"></i>
                                        </button>
                                    </form>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        {/* newsletter area end */}
        
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
                    Nền tảng thương mại điện tử hiện đại với công nghệ blockchain
                  </p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84123456789"><i className="fas fa-phone"></i>+84 123 456 789</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hà Nội, Việt Nam</li>
                    <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i>info@example.com</a></li>
                    <li><i className="fas fa-clock"></i>Thứ 2-7 (9:00 - 18:00)</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Liên kết</h4>
                  <ul className="footer-list">
                    <li><Link href="/about">About Us</Link></li>
                    <li><Link href="/help">Support</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                    <li><Link href="/blog">News</Link></li>
                    <li><Link href="/terms">Terms</Link></li>
                    <li><Link href="/privacy">Privacy</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Danh mục</h4>
                  <ul className="footer-list">
                    <li><Link href="/shop">Nội thất</Link></li>
                    <li><Link href="/shop">Điện tử</Link></li>
                    <li><Link href="/shop">Thời trang</Link></li>
                    <li><Link href="/shop">Làm đẹp</Link></li>
                    <li><Link href="/shop">Thể thao</Link></li>
                    <li><Link href="/shop">Sách</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Support</h4>
                  <ul className="footer-list">
                    <li><Link href="/faq">FAQ</Link></li>
                    <li><Link href="/help">Shopping Guide</Link></li>
                    <li><Link href="/track">Track Order</Link></li>
                    <li><Link href="/return">Return Policy</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Thanh toán</h4>
                  <div className="footer-payment mt-20">
                    <span>Chúng tôi chấp nhận:</span>
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
                    <span>Theo dõi:</span>
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

      {/* Scroll to top */}
      <a href="#" id="scroll-top"><i className="fas fa-arrow-up"></i></a>
    </>
    
  );
}

