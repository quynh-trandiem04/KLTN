// frontend-app\src\app\(shop)\shop-search\page.js

'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import Head from 'next/head';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import { useWishlistStore } from '@/store/useWishlistStore';
import './styles.css';

function formatPrice(p) {
  if (!p && p !== 0) return '';
  return Number(p).toLocaleString('vi-VN') + '₫';
}

function ShopsearchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, clearUser } = useUserStore();
  const { count: cartCount, fetchCount } = useCartStore();
  const { toggleWishlist, isFavorited, fetchWishlist, count: wishlistCount } = useWishlistStore();
  const [mounted, setMounted] = useState(false);
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(20);
  const [search, setSearch] = useState(() => searchParams?.get('search') || '');
  const [searchInput, setSearchInput] = useState(() => searchParams?.get('search') || '');
  const [category, setCategory] = useState(() => searchParams?.get('category') || '');
  const [page, setPage] = useState(() => {
    const qp = parseInt(searchParams?.get('page') || '1', 10);
    return Number.isNaN(qp) || qp < 1 ? 1 : qp;
  });
  const [sort, setSort] = useState('');
  const [loading, setLoading] = useState(false);
  const [priceRange, setPriceRange] = useState([0, 5000000]);
  const [appliedPrice, setAppliedPrice] = useState([null, null]);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedBrands, setSelectedBrands] = useState([]);
  const [minRating, setMinRating] = useState(null);
  const [togglingWishlist, setTogglingWishlist] = useState({});

  const PRICE_MAX = 5000000;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (search) params.search = search;
      if (category) params.category = category;
      if (sort) params.sort = sort;
      if (selectedBrands.length > 0) params.brand = selectedBrands.join(',');
      if (appliedPrice[0] !== null && appliedPrice[0] > 0) params.price_min = appliedPrice[0];
      if (appliedPrice[1] !== null && appliedPrice[1] < PRICE_MAX) params.price_max = appliedPrice[1];
      if (minRating !== null) params.min_rating = minRating;
      const res = await axios.get('/v1/shop/products', { params });
      setProducts(res.data.products || []);
      setTotal(res.data.total || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [page, limit, search, category, sort, selectedBrands, appliedPrice, minRating]);

  useEffect(() => { setMounted(true); }, []);
  useEffect(() => { if (user) fetchCount(); }, [user]);
  useEffect(() => { fetchProducts(); }, [fetchProducts]);
  useEffect(() => {
    axios.get('/v1/shop/categories').then(res => setCategories(res.data.categories || [])).catch(() => {});
    axios.get('/v1/shop/brands').then(res => setBrands(res.data.brands || [])).catch(() => {});
  }, []);

  // Fetch wishlist when user changes
  useEffect(() => {
    if (user && mounted) {
      fetchWishlist();
    }
  }, [user, mounted, fetchWishlist]);

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

  const totalPages = Math.ceil(total / limit);

  const buildQuery = useCallback((overrides = {}) => {
    const nextPage = overrides.page ?? page;
    const nextSearch = overrides.search ?? search;
    const nextCategory = overrides.category ?? category;

    const params = new URLSearchParams();
    if (nextSearch) params.set('search', nextSearch);
    if (nextCategory) params.set('category', nextCategory);
    if (nextPage > 1) params.set('page', String(nextPage));

    return params.toString();
  }, [page, search, category]);

  const goToPage = useCallback((nextPage) => {
    const safePage = Math.max(1, Math.min(totalPages || 1, nextPage));
    setPage(safePage);
  }, [totalPages]);

  const getDisplayPrice = (p) => {
    const vc = parseInt(p.variant_count) || 0;
    if (vc > 0 && p.variant_price_min) {
      const saleMin = Number(p.variant_promo_price_min || p.variant_price_min);
      const saleMax = Number(p.variant_promo_price_max || p.variant_price_max);
      if (saleMin === saleMax) return formatPrice(saleMin);
      return `${formatPrice(saleMin)} - ${formatPrice(saleMax)}`;
    }
    return formatPrice(p.promotionalprice || p.price);
  };

  const getOriginalPrice = (p) => {
    const vc = parseInt(p.variant_count) || 0;
    if (vc > 0) return null;
    if (p.promotionalprice && Number(p.promotionalprice) < Number(p.price)) return formatPrice(p.price);
    return null;
  };

  return (
    <>
      <Head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
        <link rel="stylesheet" href="/assets/css/all-fontawesome.min.css" />
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
                            <a href="#" onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit' }}>
                              <i className="fas fa-sign-out-alt"></i> Logout
                            </a>
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
                  <Link href="/profile?tab=wishlist" className="nav-right-link"><i className="fas fa-heart"></i>{wishlistCount > 0 && <span>{wishlistCount}</span>}</Link>
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
                    <li><Link href="/profile?tab=wishlist" className="list-link"><i className="fas fa-heart"></i>{wishlistCount > 0 && <span>{wishlistCount}</span>}</Link></li>
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
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{background: 'url(/assets/img/breadcrumb/01.jpg)'}}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">Shop Search</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="fas fa-home"></i> Home</Link></li>
                <li className="active">Shop</li>
              </ul>
            </div>
          </div>
        </div>
        {/* breadcrumb end */}

        {/* shop-area */}
        <div className="shop-area bg py-90">
          <div className="container">
            <div className="row">
              <div className="col-lg-3">
                <div className="shop-sidebar">
                  <div className="shop-widget">
                    <div className="shop-search-form">
                      <h4 className="shop-widget-title">Search</h4>
                      <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); const qs = buildQuery({ search: searchInput, page: 1 }); router.push(`/shop-search${qs ? `?${qs}` : ''}`); }}>
                        <div className="form-group">
                          <input type="text" className="form-control" placeholder="Tìm kiếm sản phẩm..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
                          <button type="submit"><i className="fas fa-magnifying-glass"></i></button>
                        </div>
                      </form>
                    </div>
                  </div>
                  <div className="shop-widget">
                    <h4 className="shop-widget-title">Danh mục</h4>
                    <ul className="shop-category-list">
                      <li>
                        <button
                          className={`category-btn${category === '' ? ' active' : ''}`}
                          onClick={() => { setCategory(''); setPage(1); }}
                        >
                          Tất cả<span>({total})</span>
                        </button>
                      </li>
                      {categories.map(cat => (
                        <li key={cat.category}>
                          <button
                            className={`category-btn${category === cat.category ? ' active' : ''}`}
                            onClick={() => { setCategory(cat.category); setPage(1); }}
                          >
                            {cat.category}<span>({cat.count})</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="shop-widget">
                    <h4 className="shop-widget-title">Thương hiệu</h4>
                    <ul className="shop-checkbox-list">
                      {brands.length === 0 && (
                        <li style={{ color: '#aaa', fontSize: 14 }}>Không có thương hiệu</li>
                      )}
                      {brands.map((b, idx) => (
                        <li key={b.brand}>
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="checkbox"
                              id={`brand-${idx}`}
                              checked={selectedBrands.includes(b.brand)}
                              onChange={e => {
                                setSelectedBrands(prev =>
                                  e.target.checked
                                    ? [...prev, b.brand]
                                    : prev.filter(x => x !== b.brand)
                                );
                                setPage(1);
                              }}
                            />
                            <label className="form-check-label" htmlFor={`brand-${idx}`}>
                              {b.brand}<span>({b.count})</span>
                            </label>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="shop-widget">
                    <h4 className="shop-widget-title">Khoảng giá</h4>
                    <div className="price-range-box">
                      <div className="price-range-input">
                        <input
                          type="text"
                          id="price-amount"
                          value={`${Number(priceRange[0]).toLocaleString('vi-VN')}₫ - ${Number(priceRange[1]).toLocaleString('vi-VN')}₫`}
                          readOnly
                        />
                      </div>
                      <div className="price-range-slider">
                        <input
                          type="range"
                          min="0"
                          max={PRICE_MAX}
                          step="50000"
                          value={priceRange[0]}
                          onChange={e => {
                            const v = parseInt(e.target.value);
                            if (v < priceRange[1]) setPriceRange([v, priceRange[1]]);
                          }}
                          className="range-min"
                        />
                        <input
                          type="range"
                          min="0"
                          max={PRICE_MAX}
                          step="50000"
                          value={priceRange[1]}
                          onChange={e => {
                            const v = parseInt(e.target.value);
                            if (v > priceRange[0]) setPriceRange([priceRange[0], v]);
                          }}
                          className="range-max"
                        />
                      </div>
                      <button
                        className="theme-btn price-apply-btn"
                        onClick={() => { setAppliedPrice([priceRange[0], priceRange[1]]); setPage(1); }}
                      >
                        Áp dụng
                      </button>
                    </div>
                  </div>

                  <div className="shop-widget">
                    <h4 className="shop-widget-title">Đánh giá</h4>
                    <ul className="shop-checkbox-list rating">
                      {[5, 4, 3, 2, 1].map(star => (
                        <li key={star}>
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="radio"
                              name="rating-filter"
                              id={`rate-${star}`}
                              checked={minRating === star}
                              onChange={() => { setMinRating(minRating === star ? null : star); setPage(1); }}
                            />
                            <label className="form-check-label" htmlFor={`rate-${star}`}>
                              {Array.from({ length: 5 }, (_, i) => (
                                <i key={i} className={i < star ? 'fas fa-star' : 'fal fa-star'}></i>
                              ))}
                              {star < 5 && <span style={{ fontSize: 12, color: '#999', marginLeft: 4 }}>trở lên</span>}
                            </label>
                          </div>
                        </li>
                      ))}
                      {minRating !== null && (
                        <li>
                          <button
                            style={{ background: 'none', border: 'none', color: '#5b9dd9', fontSize: 13, cursor: 'pointer', padding: '2px 0' }}
                            onClick={() => { setMinRating(null); setPage(1); }}
                          >✕ Bỏ lọc đánh giá</button>
                        </li>
                      )}
                    </ul>
                  </div>

                  <div className="shop-widget-banner mt-30 mb-50">
                    <div className="banner-img" style={{backgroundImage: 'url(/assets/img/banner/shop-banner.jpg)'}}></div>
                    <div className="banner-content">
                      <h6>Get <span>35% Off</span></h6>
                      <h4>New Collection of Furnitures</h4>
                      <a href="#" className="theme-btn">Shop Now</a>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-lg-9">
                <div className="col-md-12">
                  <div className="shop-sort">
                    <div className="shop-sort-box">
                      <div className="shop-sorty-label">Sort By:</div>
                      <select className="select" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
                        <option value="">Mới nhất</option>
                        <option value="best_seller">Bán chạy nhất</option>
                        <option value="price_asc">Giá thấp → cao</option>
                        <option value="price_desc">Giá cao → thấp</option>
                      </select>
                      <div className="shop-sort-show">Hiển thị {products.length} / {total} sản phẩm</div>
                    </div>
                  </div>
                </div>
                <div className="shop-item-wrap item-3">
                  {loading && <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Đang tải...</div>}
                  {!loading && products.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Không có sản phẩm phù hợp</div>
                  )}
                  <div className="row g-4">
                    {products.map((p) => {
                      const imgSrc = p.primary_image || p.image || '/assets/img/product/01.png';
                      const discount = p.promotionalprice && Number(p.promotionalprice) < Number(p.price) ? Math.round((1 - Number(p.promotionalprice) / Number(p.price)) * 100) : 0;
                      return (
                      <div key={p.id} className="col-md-6 col-lg-4">
                        <div className="product-item">
                          <div className="product-img">
                            {discount > 0 && <span className="type discount">{discount}% Off</span>}
                            <Link href={`/product/${p.id}`}><img src={imgSrc} alt={p.name} style={{ objectFit:'cover', aspectRatio:'1/1' }} /></Link>
                            <div className="product-action-wrap">
                              <div className="product-action">
                                <Link href={`/product/${p.id}`} data-tooltip="tooltip" title="Xem chi tiết"><i className="far fa-eye"></i></Link>
                                <a href="#"
                                  onClick={async (e) => {
                                    e.preventDefault();
                                    if (!user) { router.push('/login'); return; }
                                    setTogglingWishlist(prev => ({ ...prev, [p.id]: true }));
                                    try {
                                      const res = await toggleWishlist(p.id);
                                      await fetchWishlist();
                                      // Navigate to wishlist if added
                                      if (res?.action === 'added') {
                                        router.push('/profile?tab=wishlist');
                                      }
                                    } catch (err) {
                                      console.error('Toggle wishlist error:', err);
                                    } finally {
                                      setTogglingWishlist(prev => ({ ...prev, [p.id]: false }));
                                    }
                                  }}
                                  data-tooltip="tooltip"
                                  title={isFavorited(p.id) ? 'Bỏ yêu thích' : 'Yêu thích'}
                                  >
                                  <i className={isFavorited(p.id) ? 'fas fa-heart' : 'far fa-heart'}></i>
                                </a>
                              </div>
                            </div>
                          </div>
                          <div className="product-content">
                            <h3 className="product-title"><Link href={`/product/${p.id}`}>{p.name}</Link></h3>
                            <div className="product-rate">
                              {[1,2,3,4,5].map(s => <i key={s} className={s <= Math.round(p.rating || 0) ? 'fas fa-star' : 'far fa-star'}></i>)}
                            </div>
                            <div className="product-bottom">
                              <div className="product-price">
                                {getOriginalPrice(p) && <del>{getOriginalPrice(p)}</del>}
                                <span>{getDisplayPrice(p)}</span>
                              </div>
                              <Link href={`/product/${p.id}`} className="product-cart-btn" data-tooltip="tooltip" title="Xem chi tiết">
                                <i className="fas fa-bag-shopping"></i>
                              </Link>
                            </div>
                          </div>
                        </div>
                      </div>
                    )})}
                  </div>
                </div>
                {/* pagination */}
                {totalPages > 1 && (
                <div className="pagination-area mt-50">
                  <div aria-label="Page navigation">
                    <ul className="pagination">
                      <li className={`page-item ${page <= 1 ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => goToPage(page - 1)}>
                          <i className="fas fa-arrow-left"></i>
                        </button>
                      </li>
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pn = i + 1;
                        if (totalPages > 5) {
                          const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                          pn = start + i;
                        }
                        return (
                          <li key={pn} className={`page-item ${page === pn ? 'active' : ''}`}>
                            <button className="page-link" onClick={() => goToPage(pn)}>{pn}</button>
                          </li>
                        );
                      })}
                      <li className={`page-item ${page >= totalPages ? 'disabled' : ''}`}>
                        <button className="page-link" onClick={() => goToPage(page + 1)}>
                          <i className="fas fa-arrow-right"></i>
                        </button>
                      </li>
                    </ul>
                  </div>
                </div>
                )}
                {/* pagination end */}
              </div>
            </div>
          </div>
        </div>
        {/* shop-area end */}
      </main>

      {/* Footer */}
      <footer className="footer-area ft-bg">
        <div className="footer-widget">
          <div className="container">
            <div className="row footer-widget-wrapper pt-100 pb-40">
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box about-us">
                  <Link href="/seller" className="footer-logo">
                    <img src="/assets/img/logo/logo-light.png" alt="" />
                  </Link>
                  <p className="mb-3">
                    Nền tảng bán hàng trực tuyến dành cho Seller
                  </p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84987654321"><i className="fas fa-phone"></i>+84 987 654 321</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hà Nội, Việt Nam</li>
                    <li><a href="mailto:seller@example.com"><i className="fas fa-envelope"></i>seller@example.com</a></li>
                    <li><i className="fas fa-clock"></i>Thứ 2-7 (8:00 - 20:00)</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Seller</h4>
                  <ul className="footer-list">
                    <li><Link href="/seller/about">Về Seller Hub</Link></li>
                    <li><Link href="/seller/help">Seller Support</Link></li>
                    <li><Link href="/seller/contact">Contact</Link></li>
                    <li><Link href="/seller/blog">Tin tức Seller</Link></li>
                    <li><Link href="/seller/terms">Điều khoản Seller</Link></li>
                    <li><Link href="/seller/privacy">Chính sách</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Quản lý</h4>
                  <ul className="footer-list">
                    <li><Link href="/seller/products">Sản phẩm</Link></li>
                    <li><Link href="/seller/orders">Đơn hàng</Link></li>
                    <li><Link href="/seller/customers">Customers</Link></li>
                    <li><Link href="/seller/analytics">Báo cáo</Link></li>
                    <li><Link href="/seller/promotion">Khuyến mãi</Link></li>
                    <li><Link href="/seller/settings">Cài đặt</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Support</h4>
                  <ul className="footer-list">
                    <li><Link href="/seller/faq">FAQ</Link></li>
                    <li><Link href="/seller/help">Hướng dẫn bán hàng</Link></li>
                    <li><Link href="/seller/training">Đào tạo</Link></li>
                    <li><Link href="/seller/policy">Chính sách</Link></li>
                    <li><Link href="/seller/contact">Contact Support</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Thanh toán</h4>
                  <div className="footer-payment mt-20">
                    <span>Phương thức thanh toán:</span>
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
                    &copy; Copyright 2026 <a href="/seller"> Seller Hub </a> All Rights Reserved.
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

export default function Shopsearch() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center' }}>Đang tải...</div>}>
      <ShopsearchInner />
    </Suspense>
  );
}
