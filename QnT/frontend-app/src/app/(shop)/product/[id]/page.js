// frontend-app\src\app\(shop)\product\[id]\page.js

'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import axios from '@/lib/axios';
import Head from 'next/head';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import { useWishlistStore } from '@/store/useWishlistStore';

const COLOR_MAP = {
  'đen': '#000000', 'trắng': '#FFFFFF', 'xám': '#808080', 'đỏ': '#E74C3C',
  'hồng': '#FF69B4', 'cam': '#FF8C00', 'vàng': '#FFD700', 'xanh lá': '#27AE60',
  'xanh dương': '#2980B9', 'xanh navy': '#1B2631', 'tím': '#8E44AD',
  'nâu': '#8B4513', 'kem': '#FFFDD0', 'bạc': '#C0C0C0', 'vàng đồng': '#DAA520',
  'black': '#000000', 'white': '#FFFFFF', 'grey': '#808080', 'gray': '#808080',
  'red': '#E74C3C', 'pink': '#FF69B4', 'orange': '#FF8C00', 'yellow': '#FFD700',
  'green': '#27AE60', 'blue': '#2980B9', 'navy': '#1B2631', 'purple': '#8E44AD',
  'brown': '#8B4513', 'silver': '#C0C0C0', 'gold': '#DAA520',
};

function getColorHex(name) {
  if (!name) return null;
  const n = name.toLowerCase().trim();
  if (COLOR_MAP[n]) return COLOR_MAP[n];
  if (/^#[0-9a-f]{6}$/i.test(n)) return n;
  return null;
}

function isColorOption(name) {
  const n = (name || '').toLowerCase().trim();
  return n === 'màu' || n === 'màu sắc' || n === 'color' || n === 'colour';
}

function formatPrice(p) {
  if (!p && p !== 0) return '';
  return Number(p).toLocaleString('vi-VN') + '₫';
}

function formatReviewDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function renderStars(rating = 0) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return [1, 2, 3, 4, 5].map((s) => {
    if (value >= s) return <i key={s} className="fas fa-star"></i>;
    if (value >= s - 0.5) return <i key={s} className="fas fa-star-half-alt"></i>;
    return <i key={s} className="far fa-star"></i>;
  });
}

export default function ProductDetail() {
  const router = useRouter();
  const params = useParams();
  const { user, clearUser } = useUserStore();
  const { addToCart, fetchCount, count: cartCount } = useCartStore();
  const { toggleWishlist, checkFavorited, isFavorited, loading: wishlistLoading, count: wishlistCount, fetchCount: fetchWishlistCount } = useWishlistStore();
  const [mounted, setMounted] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [togglingWishlist, setTogglingWishlist] = useState(false);
  const [product, setProduct] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('description');
  const [quantity, setQuantity] = useState(1);
  const [selectedOptions, setSelectedOptions] = useState({});
  const [selectedImage, setSelectedImage] = useState(0);
  const [isProductFavorited, setIsProductFavorited] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!params?.id) return;
    setLoading(true);
    console.log('Fetching product:', params.id);
    axios.get(`/v1/shop/products/${params.id}`)
      .then(res => {
        console.log('Product loaded:', res.data);
        setProduct(res.data.product);
      })
      .catch(err => {
        console.error('Product fetch error:', err.response?.data || err.message);
        setProduct(null);
      })
      .finally(() => setLoading(false));
  }, [params?.id]);

  // Fetch wishlist count khi user thay đổi
  useEffect(() => {
    if (user) {
      fetchWishlistCount();
    }
  }, [user, fetchWishlistCount]);

  // Check nếu product đã được favorite
  useEffect(() => {
    if (!user || !params?.id) {
      setIsProductFavorited(false);
      return;
    }
    checkFavorited(params.id)
      .then(result => setIsProductFavorited(result))
      .catch(() => setIsProductFavorited(false));
  }, [user, params?.id, checkFavorited]);

  const handleLogout = async () => {
    try { if (user?.id) await axios.post('/v1/auth/logout', { user_id: user.id }); } catch {}
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    clearUser();
    router.push('/login');
  };

  // Find matching variant based on selected options
  const getSelectedVariant = () => {
    if (!product?.variants?.length || !product?.options?.length) return null;
    const optionCount = product.options.length;
    const selectedCount = Object.keys(selectedOptions).length;
    if (selectedCount < optionCount) return null;
    return product.variants.find(v => {
      if (!v.option_values) return false;
      return v.option_values.every(ov =>
        selectedOptions[ov.option_name] === ov.value
      );
    });
  };

  const selectedVariant = product ? getSelectedVariant() : null;

  const displayPrice = () => {
    if (selectedVariant) {
      if (selectedVariant.promotional_price && Number(selectedVariant.promotional_price) < Number(selectedVariant.price))
        return { price: formatPrice(selectedVariant.promotional_price), original: formatPrice(selectedVariant.price) };
      return { price: formatPrice(selectedVariant.price), original: null };
    }
    if (product?.variants?.length) {
      const prices = product.variants.map(v => Number(v.price)).filter(Boolean);
      if (prices.length) {
        const min = Math.min(...prices), max = Math.max(...prices);
        return { price: min === max ? formatPrice(min) : `${formatPrice(min)} - ${formatPrice(max)}`, original: null };
      }
    }
    if (product?.promotionalprice && Number(product.promotionalprice) < Number(product.price))
      return { price: formatPrice(product.promotionalprice), original: formatPrice(product.price) };
    return { price: formatPrice(product?.price), original: null };
  };

  const currentStock = (selectedVariant?.stock ?? product?.stock ?? 0);
  const priceInfo = product ? displayPrice() : { price: '', original: null };
  const images = product?.images?.length ? product.images : (product?.image ? [{ url: product.image }] : []);

  // Reset quantity khi stock thay đổi hoặc khi chọn variant khác
  useEffect(() => {
    if (currentStock > 0) {
      setQuantity(prev => Math.min(prev, currentStock));
    } else {
      setQuantity(1);
    }
  }, [currentStock]);

  if (!mounted) return null;

  return (
    <>
      <Head>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css" />
      </Head>
      
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
                      {mounted && user ? (
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
                  <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                  <Link href="/profile?tab=wishlist" className="nav-right-link"><i className="fas fa-heart"></i>{wishlistCount > 0 && <span>{wishlistCount}</span>}</Link>
                  <Link href="/cart" className="nav-right-link"><i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}</Link>
                </div>
                <button className="navbar-toggler" type="button"><span></span><span></span><span></span></button>
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
                    <li><Link href="/profile?tab=wishlist" className="list-link"><i className="fas fa-heart"></i>{wishlistCount > 0 && <span>{wishlistCount}</span>}</Link></li>
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
              <h4 className="breadcrumb-title">Chi tiết sản phẩm</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="fas fa-home"></i> Home</Link></li>
                <li><Link href="/shop-search">Shop</Link></li>
                <li className="active">{product?.name || 'Sản phẩm'}</li>
              </ul>
            </div>
          </div>
        </div>

          <div className="shop-single py-90 mt-5">
          <div className="container">
            {loading && <div style={{ textAlign:'center', padding:60, color:'#999' }}>Đang tải sản phẩm...</div>}
            {!loading && !product && <div style={{ textAlign:'center', padding:60 }}><h4>Sản phẩm không tồn tại</h4><Link href="/shop-search" className="theme-btn mt-3">Quay lại Shop</Link></div>}
            {!loading && product && (
            <>
            <div className="row" style={{ paddingTop: '50px' }}>
              {/* Product Images */}
              <div className="col-md-9 col-lg-6 col-xxl-5">
                <div className="shop-single-gallery">
                  {images.length > 0 && (
                    <>
                      <div style={{ border:'1px solid #eee', borderRadius:8, overflow:'hidden', marginBottom:12 }}>
                        <img src={images[selectedImage]?.url || '/assets/img/product/01.png'} alt={product.name}
                          style={{ width:'100%', aspectRatio:'1/1', objectFit:'contain', background:'#f9f9f9' }} />
                      </div>
                      {images.length > 1 && (
                        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                          {images.map((img, i) => (
                            <div key={i} onClick={() => setSelectedImage(i)}
                              style={{ width:72, height:72, border: selectedImage === i ? '2px solid var(--theme-color)' : '1px solid #ddd', borderRadius:6, cursor:'pointer', overflow:'hidden' }}>
                              <img src={img.url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Product Info */}
              <div className="col-md-12 col-lg-6 col-xxl-6">
                <div className="shop-single-info">
                  <h4 className="shop-single-title">{product.name}</h4>
                  {(() => {
                    const reviews = Array.isArray(product.reviews) ? product.reviews : [];
                    const reviewCount = reviews.length;
                    const avgRating = reviewCount > 0
                      ? (reviews.reduce((sum, r) => sum + Number(r?.rating || 0), 0) / reviewCount)
                      : 0;
                    return (
                      <div className="shop-single-rating">
                        {[1,2,3,4,5].map(s => <i key={s} className={s <= Math.round(avgRating) ? 'fas fa-star' : 'far fa-star'}></i>)}
                        <span className="rating-count"> ({reviewCount} đánh giá - {avgRating.toFixed(1)}/5)</span>
                      </div>
                    );
                  })()}
                  <div className="shop-single-price">
                    {priceInfo.original && <del>{priceInfo.original}</del>}
                    <span className="amount">{priceInfo.price || 'Liên hệ'}</span>
                  </div>
                  {product.description && <p className="mb-3">{product.description}</p>}

                  <div className="shop-single-cs">
                    {/* Dynamic Options */}
                    {product.options?.map(opt => {
                      const colorMode = isColorOption(opt.option_name);
                      const values = opt.values?.filter(v => v.value) || [];
                      return (
                        <div key={opt.option_id} style={{ marginBottom: 16 }}>
                          <h6 style={{ marginBottom:8, fontWeight:600 }}>{opt.option_name}</h6>
                          {colorMode ? (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
                              {values.map(v => {
                                const hex = getColorHex(v.value);
                                const selected = selectedOptions[opt.option_name] === v.value;
                                return (
                                  <button key={v.id} onClick={() => setSelectedOptions(prev => ({...prev, [opt.option_name]: v.value}))}
                                    title={v.value}
                                    style={{
                                      width:40, height:40, borderRadius:'50%',
                                      background: hex || '#ccc',
                                      border: selected ? '3px solid var(--theme-color)' : (hex === '#FFFFFF' ? '2px solid #ccc' : '2px solid transparent'),
                                      cursor:'pointer', transition:'all 0.2s',
                                      boxShadow: selected ? '0 0 0 2px var(--theme-color)' : 'none',
                                      transform: selected ? 'scale(1.15)' : 'scale(1)',
                                    }}
                                  />
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ display:'flex', flexWrap:'wrap', gap:8 }}>
                              {values.map(v => {
                                const selected = selectedOptions[opt.option_name] === v.value;
                                return (
                                  <button key={v.id} onClick={() => setSelectedOptions(prev => ({...prev, [opt.option_name]: v.value}))}
                                    style={{
                                      padding:'8px 20px', borderRadius:6,
                                      border: selected ? '2px solid var(--theme-color)' : '1px solid #ddd',
                                      background: selected ? 'var(--theme-color)' : '#fff',
                                      color: selected ? '#fff' : '#333',
                                      cursor:'pointer', fontSize:14, fontWeight: selected ? 600 : 400,
                                      transition:'all 0.2s',
                                    }}>
                                    {v.value}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {selectedOptions[opt.option_name] && colorMode && (
                            <span style={{ fontSize:13, color:'#666', marginTop:4, display:'inline-block' }}>
                              Đã chọn: {selectedOptions[opt.option_name]}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Quantity */}
                    <div style={{ marginBottom:16 }}>
                      <h6 style={{ marginBottom:8, fontWeight:600 }}>Số lượng</h6>
                      <div style={{ display:'flex', alignItems:'center', gap:0 }}>
                        <button onClick={() => setQuantity(q => Math.max(1, q - 1))}
                          disabled={currentStock <= 0}
                          style={{ width:36, height:36, border:'1px solid #ddd', background: currentStock <= 0 ? '#f0f0f0' : '#f5f5f5', cursor: currentStock <= 0 ? 'not-allowed' : 'pointer', borderRadius:'6px 0 0 6px', fontSize:16, color: currentStock <= 0 ? '#ccc' : '#000' }}>−</button>
                        <input type="text" value={quantity} readOnly
                          style={{ width:50, height:36, textAlign:'center', border:'1px solid #ddd', borderLeft:'none', borderRight:'none', fontSize:14, background: currentStock <= 0 ? '#f9f9f9' : '#fff', color: currentStock <= 0 ? '#ccc' : '#000' }} />
                        <button onClick={() => setQuantity(q => Math.min(currentStock, q + 1))}
                          disabled={currentStock <= 0 || quantity >= currentStock}
                          style={{ width:36, height:36, border:'1px solid #ddd', background: (currentStock <= 0 || quantity >= currentStock) ? '#f0f0f0' : '#f5f5f5', cursor: (currentStock <= 0 || quantity >= currentStock) ? 'not-allowed' : 'pointer', borderRadius:'0 6px 6px 0', fontSize:16, color: (currentStock <= 0 || quantity >= currentStock) ? '#ccc' : '#000' }}>+</button>
                        <span style={{ marginLeft:12, color:'#999', fontSize:13 }}>{currentStock > 0 ? `${currentStock} sản phẩm có sẵn` : 'Hết hàng'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="shop-single-sortinfo">
                    <ul>
                      <li>Tình trạng: <span style={{ color: currentStock > 0 ? '#27AE60' : '#E74C3C' }}>{currentStock > 0 ? 'Còn hàng' : 'Hết hàng'}</span></li>
                      {product.category && <li>Danh mục: <span>{product.category}</span></li>}
                      {product.brand && <li>Thương hiệu: <span>{product.brand}</span></li>}
                      {product.shop_name && <li>Shop: <span>{product.shop_name}</span></li>}
                    </ul>
                  </div>

                  <div className="shop-single-action">
                    <div className="shop-single-btn">
                      <button
                        className="theme-btn"
                        disabled={addingToCart || currentStock <= 0}
                        style={{
                          opacity: (addingToCart || currentStock <= 0) ? 0.5 : 1,
                          cursor: (addingToCart || currentStock <= 0) ? 'not-allowed' : 'pointer',
                          backgroundColor: (addingToCart || currentStock <= 0) ? '#ccc' : '',
                          pointerEvents: (addingToCart || currentStock <= 0) ? 'none' : 'auto'
                        }}
                        onClick={async () => {
                          if (!user) { router.push('/login'); return; }
                          // Kiểm tra nếu có options thì phải chọn hết
                          if (product.options?.length > 0) {
                            const missing = product.options.find(o => !selectedOptions[o.option_name]);
                            if (missing) { alert(`Vui lòng chọn ${missing.option_name}`); return; }
                          }
                          setAddingToCart(true);
                          try {
                            const variant = getSelectedVariant();
                            await addToCart(product.id, variant?.id || null, quantity);
                            await fetchCount();
                            // alert('Đã thêm vào giỏ hàng!');
                          } catch (e) {
                            if (e.response?.status === 401) { router.push('/login'); return; }
                            alert(e.response?.data?.detail || 'Lỗi thêm giỏ hàng');
                          } finally { setAddingToCart(false); }
                        }}
                      >
                        <span className="far fa-shopping-bag"></span> {addingToCart ? 'Đang thêm...' : 'Thêm vào giỏ'}
                      </button>
                      <button
                        className="theme-btn theme-btn2"
                        title={isProductFavorited ? 'Bỏ yêu thích' : 'Yêu thích'}
                        disabled={togglingWishlist}
                        onClick={async () => {
                          if (!user) { router.push('/login'); return; }
                          setTogglingWishlist(true);
                          try {
                            const variant = getSelectedVariant();
                            await toggleWishlist(product.id, variant?.id || null);
                            await fetchWishlistCount(); // Update count in navbar
                            setIsProductFavorited(!isProductFavorited);
                          } catch (e) {
                            if (e.response?.status === 401) { router.push('/login'); return; }
                            alert(e.response?.data?.detail || 'Lỗi cập nhật danh sách yêu thích');
                          } finally { setTogglingWishlist(false); }
                        }}
                        style={{ opacity: togglingWishlist ? 0.6 : 1 }}
                      >
                        <span className={isProductFavorited ? 'fas fa-heart' : 'far fa-heart'}></span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tabs: Description, Attributes, Reviews */}
            <div className="shop-single-details mt-5">
              <nav>
                <div className="nav nav-tabs" role="tablist">
                  <button className={`nav-link ${activeTab === 'description' ? 'active' : ''}`} onClick={() => setActiveTab('description')} type="button">Description</button>
                  {product.attributes?.length > 0 && (
                    <button className={`nav-link ${activeTab === 'additional' ? 'active' : ''}`} onClick={() => setActiveTab('additional')} type="button">Additional Info</button>
                  )}
                  <button className={`nav-link ${activeTab === 'reviews' ? 'active' : ''}`} onClick={() => setActiveTab('reviews')} type="button">
                    Reviews ({product.reviews?.length || 0})
                  </button>
                </div>
              </nav>
              <div className="tab-content">
                {activeTab === 'description' && (
                  <div className="tab-pane fade show active">
                    <div className="shop-single-desc">
                      <p style={{ whiteSpace:'pre-wrap' }}>{product.description || 'Chưa có mô tả cho sản phẩm này.'}</p>
                    </div>
                  </div>
                )}
                {activeTab === 'additional' && product.attributes?.length > 0 && (
                  <div className="tab-pane fade show active">
                    <div className="shop-single-additional">
                      <table style={{ width:'100%', borderCollapse:'collapse' }}>
                        <tbody>
                          {product.attributes.map((attr, i) => (
                            <tr key={i} style={{ borderBottom:'1px solid #eee' }}>
                              <td style={{ padding:'10px 16px', fontWeight:600, width:'30%', color:'#555' }}>{attr.name}</td>
                              <td style={{ padding:'10px 16px' }}>{attr.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {activeTab === 'reviews' && (
                  <div className="tab-pane fade show active">
                    <div className="shop-single-review">
                      <div className="blog-comments">
                        <h5 style={{ marginBottom: 16 }}>Reviews ({product.reviews?.length || 0})</h5>
                        <div className="blog-comments-wrap">
                          {(product.reviews || []).length === 0 ? (
                            <div style={{ color: '#8a8a8a', padding: '14px 0' }}>Chưa có đánh giá nào cho sản phẩm này.</div>
                          ) : (
                            product.reviews.map((rv, idx) => (
                              <div key={rv.id || idx} className="blog-comments-item" style={{ marginTop: idx === 0 ? 0 : 18 }}>
                                <img
                                  src={rv.useravatar || '/assets/img/account/01.jpg'}
                                  alt="avatar"
                                  style={{ width: 70, height: 70, borderRadius: '50%', objectFit: 'cover' }}
                                />
                                <div className="blog-comments-content" style={{ flex: 1 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                    <h5 style={{ marginBottom: 4 }}>{rv.username || 'Khách hàng'}</h5>
                                    <div className="review-rating" style={{ color: '#5d88b8' }}>
                                      {renderStars(rv.rating)}
                                    </div>
                                  </div>
                                  <span><i className="far fa-clock"></i> {formatReviewDate(rv.createat)}</span>
                                  <p style={{ marginTop: 10 }}>{rv.content || '—'}</p>
                                  <a href="#" onClick={(e) => e.preventDefault()}><i className="far fa-reply"></i> Reply</a>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
            </>
            )}
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
                  <p className="mb-3">Nền tảng thương mại điện tử hiện đại với công nghệ blockchain</p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84123456789"><i className="fas fa-phone"></i>+84 123 456 789</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>Hà Nội, Việt Nam</li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Liên kết</h4>
                  <ul className="footer-list">
                    <li><Link href="/about">About Us</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                    <li><Link href="/blog">News</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Danh mục</h4>
                  <ul className="footer-list">
                    <li><Link href="/shop-search">Tất cả sản phẩm</Link></li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="copyright">
          <div className="container">
            <div className="copyright-wrap">
              <p className="copyright-text">&copy; 2026 <a href="/">E-Commerce</a> All Rights Reserved.</p>
            </div>
          </div>
        </div>
      </footer>

      <style jsx global>{`
        .shop-single {
          background: #fff;
        }
        .shop-single .container {
          max-width: 1240px;
        }
        .shop-single-gallery > div:first-child {
          border-radius: 14px !important;
          overflow: hidden;
          box-shadow: 0 8px 24px rgba(0,0,0,0.08);
          border: 1px solid #eee !important;
        }
        .shop-single-gallery img {
          transition: transform .25s ease;
        }
        .shop-single-gallery > div:first-child:hover img {
          transform: scale(1.02);
        }
        .shop-single-info {
          background: #fff;
          padding: 24px;
        }
        .shop-single-title {
          line-height: 1.35;
          margin-bottom: 8px;
        }
        .shop-single-price .amount {
          font-size: 30px;
          font-weight: 700;
        }
        .shop-single-price del {
          font-size: 18px;
        }
        .shop-single-sortinfo ul {
          margin: 0;
          padding-left: 0px;
          list-style-type: none;
        }
        .shop-single-sortinfo li {
          margin: 8px 0;
        }
        .shop-single-btn {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }
        .shop-single-btn .theme-btn {
          border-radius: 10px;
          font-weight: 600;
          min-height: 44px;
        }
        .shop-single-details {
          background: #fff;
          border-radius: 14px;
          padding: 8px 20px 20px;
        }
        .shop-single-details .nav-tabs {
          margin-bottom: 8px;
        }
        .shop-single-details .nav-link {
          font-weight: 600;
        }
        .blog-comments-item {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          border: 1px solid #ececec;
          border-radius: 8px;
          padding: 20px;
          background: #fff;
        }
        .blog-comments-content span {
          color: #7c8aa1;
          font-size: 13px;
        }
        .blog-comments-content p {
          color: #666;
          line-height: 1.75;
          margin-bottom: 10px;
        }
        .blog-comments-content a {
          color: #7c8aa1;
          font-size: 14px;
          text-decoration: none;
        }
        .blog-comments-content a:hover {
          color: var(--theme-color);
        }
        .review-rating i {
          margin-left: 4px;
        }
        @media (max-width: 991px) {
          .shop-single-info {
            margin-top: 20px;
            padding: 18px;
          }
          .shop-single-price .amount {
            font-size: 24px;
          }
        }
      `}</style>
    </>
  );
}
