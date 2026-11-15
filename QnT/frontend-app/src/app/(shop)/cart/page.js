// frontend-app\src\app\(shop)\cart\page.js

'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

function getItemPrice(item) {
  if (item.variant_id) {
    return Number(item.variant_promotional_price || item.variant_price || 0);
  }
  return Number(item.promotionalprice || item.product_price || 0);
}

function getItemImage(item) {
  if (item.variant_id && item.variant_image) return item.variant_image;
  return item.primary_image || item.product_image || '/assets/img/product/01.png';
}

export default function CartPage() {
  const router = useRouter();
  const { user, clearUser } = useUserStore();
  const { items, count: cartCount, fetchCart, updateQuantity, removeItem } = useCartStore();
  const { count: wishlistCount } = useWishlistStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState(null);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (mounted && !user) {
      router.push('/login');
      return;
    }
    if (mounted && user) {
      fetchCart().finally(() => setLoading(false));
    }
  }, [mounted, user]);

  const handleLogout = async () => {
    try {
      if (user?.id) await axios.post('/v1/auth/logout', { user_id: user.id });
    } catch (err) { console.error(err); }
    localStorage.removeItem('token');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    clearUser();
    router.push('/login');
  };

  const handleUpdateQty = async (id, newQty) => {
    if (newQty < 1) return;
    setUpdatingId(id);
    try { await updateQuantity(id, newQty); } catch (e) {
      if (e.response?.status === 401) { router.push('/login'); return; }
      console.error(e);
    }
    setUpdatingId(null);
  };

  const handleRemove = async (id) => {
    setUpdatingId(id);
    try { await removeItem(id); } catch (e) {
      if (e.response?.status === 401) { router.push('/login'); return; }
      console.error(e);
    }
    setUpdatingId(null);
  };

  const subTotal = items.reduce((s, item) => s + getItemPrice(item) * item.quantity, 0);

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
              <h4 className="breadcrumb-title">Shop Cart</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="far fa-home"></i> Home</Link></li>
                <li className="active">Shop Cart</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="shop-cart py-90">
          <div className="container">
            <div className="shop-cart-wrap">
              {loading ? (
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <i className="fas fa-spinner fa-spin" style={{ fontSize:32, color:'#5C86B8' }}></i>
                  <p style={{ marginTop:16, color:'#999' }}>Đang tải giỏ hàng...</p>
                </div>
              ) : items.length === 0 ? (
                <div style={{ textAlign:'center', padding:'60px 0' }}>
                  <i className="fas fa-shopping-cart" style={{ fontSize:64, color:'#ddd', marginBottom:20 }}></i>
                  <h3 style={{ color:'#999', marginBottom:16 }}>Giỏ hàng trống</h3>
                  <p style={{ color:'#aaa', marginBottom:24 }}>Bạn chưa thêm sản phẩm nào vào giỏ hàng</p>
                  <Link href="/shop-search" className="theme-btn">Mua sắm ngay <i className="fas fa-arrow-right"></i></Link>
                </div>
              ) : (
                <div className="row">
                  <div className="col-lg-8">
                    <div className="cart-table">
                      <div className="table-responsive">
                        <table className="table">
                          <thead>
                            <tr>
                              <th>Image</th>
                              <th>Product Name</th>
                              <th>Price</th>
                              <th>Quantity</th>
                              <th>Sub Total</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.id} style={{ opacity: updatingId === item.id ? 0.5 : 1 }}>
                                <td>
                                  <div className="shop-cart-img">
                                    <Link href={`/product/${item.product_id}`}>
                                      <img src={getItemImage(item)} alt={item.product_name} />
                                    </Link>
                                  </div>
                                </td>
                                <td>
                                  <div className="shop-cart-content">
                                    <h5 className="shop-cart-name"><Link href={`/product/${item.product_id}`}>{item.product_name}</Link></h5>
                                    {item.variant_options && (
                                      <div className="shop-cart-info">
                                        {item.variant_options.map((opt, i) => (
                                          <p key={i}><span>{opt.option_name}:</span>{opt.value}</p>
                                        ))}
                                      </div>
                                    )}
                                    {item.variant_sku && <div className="shop-cart-info"><p><span>SKU:</span>{item.variant_sku}</p></div>}
                                  </div>
                                </td>
                                <td>
                                  <div className="shop-cart-price">
                                    <span>{formatPrice(getItemPrice(item))}</span>
                                  </div>
                                </td>
                                <td>
                                  <div className="shop-cart-qty">
                                    <button className="minus-btn" onClick={() => handleUpdateQty(item.id, item.quantity - 1)} disabled={updatingId === item.id || item.quantity <= 1}>
                                      <i className="fal fa-minus"></i>
                                    </button>
                                    <input className="quantity" type="text" value={item.quantity} disabled />
                                    <button className="plus-btn" onClick={() => handleUpdateQty(item.id, item.quantity + 1)} disabled={updatingId === item.id}>
                                      <i className="fal fa-plus"></i>
                                    </button>
                                  </div>
                                </td>
                                <td>
                                  <div className="shop-cart-subtotal">
                                    <span>{formatPrice(getItemPrice(item) * item.quantity)}</span>
                                  </div>
                                </td>
                                <td>
                                  <button className="shop-cart-remove" onClick={() => handleRemove(item.id)} disabled={updatingId === item.id}>
                                    <i className="far fa-times"></i>
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="shop-cart-footer">
                      <div className="row">
                        <div className="col-md-7 col-lg-6">
                          <div className="shop-cart-coupon">
                            <div className="form-group">
                              <input type="text" className="form-control" placeholder="Your Coupon Code" />
                              <button className="theme-btn" type="submit">Apply Coupon</button>
                            </div>
                          </div>
                        </div>
                        <div className="col-md-5 col-lg-6">
                          <div className="shop-cart-btn text-md-end">
                            <Link href="/shop-search" className="theme-btn"><span className="fas fa-arrow-left"></span> Continue Shopping</Link>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="col-lg-4">
                    <div className="shop-cart-summary">
                      <h5>Cart Summary</h5>
                      <ul>
                        <li><strong>Sub Total:</strong> <span>{formatPrice(subTotal)}</span></li>
                        <li><strong>Discount:</strong> <span>0₫</span></li>
                        <li><strong>Shipping:</strong> <span>Free</span></li>
                        <li className="shop-cart-total"><strong>Total:</strong> <span>{formatPrice(subTotal)}</span></li>
                      </ul>
                      <div className="text-end mt-40">
                        <Link href="/checkout" className="theme-btn">Checkout Now<i className="fas fa-arrow-right"></i></Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
                  <p className="mb-3">Ná»n táº£ng thÆ°Æ¡ng máº¡i ₫iá»‡n tá»­ hiá»‡n ₫áº¡i vá»›i cÃ´ng nghá»‡ blockchain</p>
                  <ul className="footer-contact">
                    <li><a href="tel:+84123456789"><i className="fas fa-phone"></i>+84 123 456 789</a></li>
                    <li><i className="fas fa-map-marker-alt"></i>HÃ  Ná»™i, Viá»‡t Nam</li>
                    <li><a href="mailto:info@example.com"><i className="fas fa-envelope"></i>info@example.com</a></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">LiÃªn káº¿t</h4>
                  <ul className="footer-list">
                    <li><Link href="/about">About Us</Link></li>
                    <li><Link href="/contact">Contact</Link></li>
                    <li><Link href="/blog">News</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-2">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Danh má»¥c</h4>
                  <ul className="footer-list">
                    <li><Link href="/shop-search">Thá»i trang</Link></li>
                    <li><Link href="/shop-search">Äiá»‡n tá»­</Link></li>
                    <li><Link href="/shop-search">Ná»™i tháº¥t</Link></li>
                  </ul>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="footer-widget-box list">
                  <h4 className="footer-widget-title">Thanh toÃ¡n</h4>
                  <div className="footer-payment mt-20">
                    <span>ChÃºng tÃ´i cháº¥p nháº­n:</span>
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
                    <span>Theo dÃµi:</span>
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
