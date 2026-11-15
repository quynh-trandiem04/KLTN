'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import WishlistIcon from '@/components/WishlistIcon';
import axios from '@/lib/axios';
import '../styles.css';
import './styles.css';

// Map tên category -> FontAwesome icon
const getCategoryIcon = (name = '') => {
  const n = name.toLowerCase();
  if (n.includes('điện thoại') || n.includes('phone')) return 'fa-mobile-screen';
  if (n.includes('laptop') || n.includes('máy tính')) return 'fa-laptop';
  if (n.includes('tablet') || n.includes('ipad')) return 'fa-tablet-screen-button';
  if (n.includes('tai nghe') || n.includes('headphone')) return 'fa-headphones';
  if (n.includes('tivi') || n.includes('tv') || n.includes('màn hình')) return 'fa-tv';
  if (n.includes('tủ lạnh') || n.includes('refrigerator')) return 'fa-temperature-low';
  if (n.includes('máy giặt') || n.includes('washing')) return 'fa-jug-detergent';
  if (n.includes('điều hòa') || n.includes('air')) return 'fa-wind';
  if (n.includes('máy ảnh') || n.includes('camera')) return 'fa-camera';
  if (n.includes('đồng hồ') || n.includes('watch')) return 'fa-clock';
  if (n.includes('giày') || n.includes('dép') || n.includes('shoe')) return 'fa-shoe-prints';
  if (n.includes('túi') || n.includes('ba lô') || n.includes('bag')) return 'fa-bag-shopping';
  if (n.includes('quần') || n.includes('áo') || n.includes('thời trang') || n.includes('fashion')) return 'fa-shirt';
  if (n.includes('váy') || n.includes('dress')) return 'fa-person-dress';
  if (n.includes('mỹ phẩm') || n.includes('son') || n.includes('beauty') || n.includes('làm đẹp')) return 'fa-spray-can-sparkles';
  if (n.includes('nước hoa') || n.includes('perfume')) return 'fa-bottle-droplet';
  if (n.includes('chăm sóc da') || n.includes('skincare')) return 'fa-hand-holding-droplet';
  if (n.includes('bàn chải') || n.includes('toothbrush')) return 'fa-tooth';
  if (n.includes('bông') || n.includes('tẩy trang') || n.includes('cotton')) return 'fa-circle';
  if (n.includes('sữa tắm') || n.includes('dầu gội') || n.includes('shampoo')) return 'fa-pump-soap';
  if (n.includes('thực phẩm') || n.includes('food') || n.includes('đồ ăn')) return 'fa-utensils';
  if (n.includes('sữa') || n.includes('milk')) return 'fa-bottle-water';
  if (n.includes('đồ uống') || n.includes('drink') || n.includes('nước')) return 'fa-mug-hot';
  if (n.includes('thể thao') || n.includes('sport') || n.includes('gym')) return 'fa-dumbbell';
  if (n.includes('xe đạp') || n.includes('bicycle')) return 'fa-bicycle';
  if (n.includes('sách') || n.includes('book')) return 'fa-book';
  if (n.includes('văn phòng') || n.includes('office')) return 'fa-briefcase';
  if (n.includes('đồ chơi') || n.includes('toy')) return 'fa-shapes';
  if (n.includes('trẻ em') || n.includes('baby') || n.includes('kids')) return 'fa-baby';
  if (n.includes('gia dụng') || n.includes('bếp') || n.includes('kitchen')) return 'fa-blender';
  if (n.includes('nội thất') || n.includes('furniture')) return 'fa-couch';
  if (n.includes('đèn') || n.includes('lighting') || n.includes('lamp')) return 'fa-lightbulb';
  if (n.includes('vật nuôi') || n.includes('pet')) return 'fa-paw';
  if (n.includes('ô tô') || n.includes('xe hơi') || n.includes('car')) return 'fa-car';
  if (n.includes('xe máy') || n.includes('motor')) return 'fa-motorcycle';
  if (n.includes('dụng cụ') || n.includes('tool')) return 'fa-screwdriver-wrench';
  return 'fa-tag';
};

export default function CategoryPage() {
  const router = useRouter();
  const { user, clearUser } = useUserStore();
  const { count: cartCount, fetchCount } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setMounted(true);
    fetchCount();
    // Fetch categories from API
    axios.get('/v1/shop/categories')
      .then(res => setCategories(res.data.categories || []))
      .catch(err => console.error('Fetch categories error:', err))
      .finally(() => setLoading(false));
  }, []);

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

  if (!mounted) return null;

  return (
    <>
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
                    {user ? (
                      <>
                        <li><Link href="/profile"><i className="fas fa-user"></i> {user.full_name || 'User'}</Link></li>
                        <li>
                          <button onClick={handleLogout} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 'inherit' }}>
                            <i className="fas fa-sign-out-alt"></i> Logout
                          </button>
                        </li>
                      </>
                    ) : (
                      <li><Link href="/login"><i className="fas fa-sign-in-alt"></i> Login</Link></li>
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

      <div className="main-navigation">
        <nav className="navbar navbar-expand-lg">
          <div className="container position-relative">
            <Link className="navbar-brand" href="/">
              <img alt="logo" src="/assets/img/logo/logo.png" style={{ maxWidth: '120px', margin: '0 10px', transform: 'translateY(18px)' }} />
            </Link>

            <div className="mobile-menu-right">
              <div className="mobile-menu-btn">
                <a href="#" className="nav-right-link search-box-outer"><i className="fas fa-search"></i></a>
                <WishlistIcon className="nav-right-link" />
                <Link className="nav-right-link" href="/cart">
                  <i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}
                </Link>
              </div>
              <button className="navbar-toggler" type="button"><span></span><span></span><span></span></button>
            </div>

            <div className="navbar-collapse">
              <ul className="navbar-nav">
                <li className="nav-item"><Link className="nav-link" href="/">Home</Link></li>
                <li className="nav-item"><Link className="nav-link" href="/about">About</Link></li>
                <li className="nav-item"><Link className="nav-link" href="/shop-search">Shop</Link></li>
                <li className="nav-item"><Link className="nav-link active" href="/category">Category</Link></li>
                <li className="nav-item"><Link className="nav-link" href="/blog">Blog</Link></li>
                <li className="nav-item"><Link className="nav-link" href="/contact">Contact</Link></li>
              </ul>

              <div className="nav-right">
                <ul className="nav-right-list">
                  <li><a href="#" className="list-link search-box-outer"><i className="fas fa-search"></i></a></li>
                  <li><WishlistIcon linkClass="list-link" /></li>
                  <li>
                    <Link className="list-link" href="/cart">
                      <i className="fas fa-shopping-bag"></i>{cartCount > 0 && <span>{cartCount}</span>}
                    </Link>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </nav>
      </div>

      <main className="main">
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{ background: 'url(/assets/img/breadcrumb/01.jpg)' }}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">Category</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="far fa-home"></i> Home</Link></li>
                <li className="active">Category</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="category-area2 py-120">
          <div className="container">
            <div className="row">
              <div className="col-lg-6 mx-auto">
                <div className="site-heading text-center">
                  <span className="site-title-tagline">Our Category</span>
                  <h2 className="site-title">Our Popular <span>Category</span></h2>
                </div>
              </div>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
                <i className="fas fa-spinner fa-spin" style={{ fontSize: '24px' }}></i>
                <p style={{ marginTop: '10px' }}>Đang tải danh mục...</p>
              </div>
            ) : (
            <div className="row">
              {categories.map((cat) => (
                <div className="col-6 col-md-4 col-lg-2" key={cat.category}>
                  <div className="category-item">
                    <Link href={`/shop-search?category=${encodeURIComponent(cat.category)}`}>
                      <div className="category-info">
                        <div className="icon">
                          <i className={`fas ${getCategoryIcon(cat.category)}`}></i>
                        </div>
                        <div className="content">
                          <h4>{cat.category}</h4>
                          <p>{cat.count} Sản phẩm</p>
                        </div>
                      </div>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
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
                  <p className="mb-3">Modern e-commerce platform with blockchain technology</p>
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
                    {categories.slice(0, 6).map((cat) => (
                      <li key={cat.category}>
                        <Link href={`/shop-search?category=${encodeURIComponent(cat.category)}`}>
                          {cat.category}
                        </Link>
                      </li>
                    ))}
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
                    &copy; Copyright 2026 <Link href="/"> E-Commerce </Link> All Rights Reserved.
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

      <a href="#" id="scroll-top"><i className="fas fa-arrow-up"></i></a>
    </>
  );
}