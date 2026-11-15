'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import WishlistIcon from '@/components/WishlistIcon';
import './styles.css';

export default function AboutPage() {
  const router = useRouter();
  const { user, clearUser } = useUserStore();
  const { count: cartCount, fetchCount } = useCartStore();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    fetchCount();
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

      {/* Navbar */}
      <div className="main-navigation">
        <nav className="navbar navbar-expand-lg">
          <div className="container position-relative">
            <a className="navbar-brand" href="/">
              <img alt="logo" src="/assets/img/logo/logo.png" style={{maxWidth: '120px', margin: '0 10px', transform: 'translateY(18px)'}} />
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
                <li className="nav-item"><a className="nav-link active" href="/about">About</a></li>
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
        {/* Breadcrumb */}
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{background: 'url(/assets/img/breadcrumb/01.jpg)'}}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">About Us</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/">Home</Link></li>
                <li className="active">About Us</li>
              </ul>
            </div>
          </div>
        </div>
        {/* Breadcrumb end */}

        {/* About Area */}
        <div className="about-area py-120">
          <div className="container">
            <div className="row align-items-center">
              <div className="col-lg-6">
                <div className="about-left">
                  <div className="about-img">
                    <div className="row g-4">
                      <div className="col-md-6">
                        <img className="img-1" src="/assets/img/about/01.jpg" alt="" />
                        <img className="img-2" src="/assets/img/about/02.jpg" alt="" />
                      </div>
                      <div className="col-md-6">
                        <img className="img-3" src="/assets/img/about/03.jpg" alt="" />
                      </div>
                    </div>
                  </div>
                  <div className="about-experience">
                    <h3>25+</h3>
                    <span>Years Of Experience</span>
                  </div>
                </div>
              </div>
              <div className="col-lg-6">
                <div className="about-right">
                  <div className="site-heading mb-3">
                    <span className="site-title-tagline">
                      <i className="fas fa-circle"></i> About Us
                    </span>
                    <h2 className="site-title">We Make Your Online Shopping Easy & Fun</h2>
                  </div>
                  <p className="about-text">
                    There are many variations of passages of Lorem Ipsum available, but the majority have
                    suffered alteration in some form, by injected humour, or randomised words which don&apos;t
                    look even slightly believable.
                  </p>
                  <div className="about-list-wrapper">
                    <ul className="about-list list-unstyled">
                      <li>
                        <div className="icon"><i className="fas fa-check-circle"></i></div>
                        <div className="text">
                          <h4>Free Home Delivery</h4>
                          <p>It is a long established fact that reader will distracted by the readable.</p>
                        </div>
                      </li>
                      <li>
                        <div className="icon"><i className="fas fa-check-circle"></i></div>
                        <div className="text">
                          <h4>Quality Products</h4>
                          <p>It is a long established fact that reader will distracted by the readable.</p>
                        </div>
                      </li>
                    </ul>
                  </div>
                  <Link href="/contact" className="theme-btn mt-30">
                    Discover More<i className="fas fa-arrow-right"></i>
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* About Area end */}

        {/* Counter Area */}
        <div className="counter-area pt-40 pb-40">
          <div className="container">
            <div className="row">
              <div className="col-lg-3 col-sm-6">
                <div className="counter-box">
                  <div className="icon">
                    <img src="/assets/img/icon/sale.svg" alt="" />
                  </div>
                  <div>
                    <span className="counter" data-count="50">50</span>
                    <span className="counter-suffix">k</span>
                  </div>
                  <h6 className="title">Total Sales</h6>
                </div>
              </div>
              <div className="col-lg-3 col-sm-6">
                <div className="counter-box">
                  <div className="icon">
                    <img src="/assets/img/icon/rate.svg" alt="" />
                  </div>
                  <div>
                    <span className="counter" data-count="90">90</span>
                    <span className="counter-suffix">k</span>
                  </div>
                  <h6 className="title">Happy Clients</h6>
                </div>
              </div>
              <div className="col-lg-3 col-sm-6">
                <div className="counter-box">
                  <div className="icon">
                    <img src="/assets/img/icon/employee.svg" alt="" />
                  </div>
                  <div>
                    <span className="counter" data-count="150">150</span>
                    <span className="counter-suffix">+</span>
                  </div>
                  <h6 className="title">Team Workers</h6>
                </div>
              </div>
              <div className="col-lg-3 col-sm-6">
                <div className="counter-box">
                  <div className="icon">
                    <img src="/assets/img/icon/award.svg" alt="" />
                  </div>
                  <div>
                    <span className="counter" data-count="30">30</span>
                    <span className="counter-suffix">+</span>
                  </div>
                  <h6 className="title">Win Awards</h6>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Counter Area end */}

        {/* Testimonial Area */}
        <div className="testimonial-area py-120">
          <div className="container">
            <div className="row">
              <div className="col-lg-6 mx-auto">
                <div className="site-heading text-center">
                  <span className="site-title-tagline">
                    <i className="fas fa-circle"></i> Testimonials
                  </span>
                  <h2 className="site-title">What Our Customers Say</h2>
                </div>
              </div>
            </div>
            <div className="row g-4 mt-4">
              <div className="col-lg-4 col-md-6">
                <div className="testimonial-single">
                  <div className="testimonial-quote">
                    <span className="testimonial-quote-icon"><i className="fas fa-quote-right"></i></span>
                    <div className="testimonial-rate">
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                    </div>
                  </div>
                  <p>
                    There are many variations of passages of Lorem Ipsum available, but the majority
                    have suffered alteration in some injected humour randomised words.
                  </p>
                  <div className="testimonial-content">
                    <div className="testimonial-author-img">
                      <img src="/assets/img/testimonial/01.jpg" alt="" />
                    </div>
                    <div className="testimonial-author-info">
                      <h4>Chad Smith</h4>
                      <p>Customer</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-lg-4 col-md-6">
                <div className="testimonial-single">
                  <div className="testimonial-quote">
                    <span className="testimonial-quote-icon"><i className="fas fa-quote-right"></i></span>
                    <div className="testimonial-rate">
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                    </div>
                  </div>
                  <p>
                    It is a long established fact that a reader will be distracted by the readable
                    content of a page when looking at its layout.
                  </p>
                  <div className="testimonial-content">
                    <div className="testimonial-author-img">
                      <img src="/assets/img/testimonial/02.jpg" alt="" />
                    </div>
                    <div className="testimonial-author-info">
                      <h4>Malissa Fie</h4>
                      <p>Customer</p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="col-lg-4 col-md-6">
                <div className="testimonial-single">
                  <div className="testimonial-quote">
                    <span className="testimonial-quote-icon"><i className="fas fa-quote-right"></i></span>
                    <div className="testimonial-rate">
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                      <i className="fas fa-star"></i>
                    </div>
                  </div>
                  <p>
                    Contrary to popular belief, Lorem Ipsum is not simply random text. It has roots in a
                    piece of classical Latin literature from 45 BC.
                  </p>
                  <div className="testimonial-content">
                    <div className="testimonial-author-img">
                      <img src="/assets/img/testimonial/03.jpg" alt="" />
                    </div>
                    <div className="testimonial-author-info">
                      <h4>Arron Rodri</h4>
                      <p>Customer</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Testimonial Area end */}

        {/* Video Area */}
        <div className="video-area pt-80 pb-80">
          <div className="container">
            <div className="video-content" style={{backgroundImage: 'url(/assets/img/video/01.jpg)'}}>
              <a className="play-btn popup-youtube" href="https://www.youtube.com/watch?v=EngW7tLk6R8" target="_blank" rel="noopener noreferrer">
                <i className="fas fa-play"></i>
              </a>
            </div>
          </div>
        </div>
        {/* Video Area end */}

        {/* Team Area */}
        <div className="team-area py-120">
          <div className="container">
            <div className="row">
              <div className="col-lg-6 mx-auto">
                <div className="site-heading text-center">
                  <span className="site-title-tagline">
                    <i className="fas fa-circle"></i> Our Team
                  </span>
                  <h2 className="site-title">Meet Our Expert Team</h2>
                </div>
              </div>
            </div>
            <div className="row mt-5">
              <div className="col-md-6 col-lg-3">
                <div className="team-item">
                  <div className="team-img">
                    <img src="/assets/img/team/01.jpg" alt="" />
                    <div className="team-social">
                      <a href="#"><i className="fab fa-facebook-f"></i></a>
                      <a href="#"><i className="fab fa-x-twitter"></i></a>
                      <a href="#"><i className="fab fa-linkedin-in"></i></a>
                      <a href="#"><i className="fab fa-instagram"></i></a>
                    </div>
                  </div>
                  <div className="team-content">
                    <h4><a href="#">Chad Smith</a></h4>
                    <span>CEO & Founder</span>
                  </div>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="team-item">
                  <div className="team-img">
                    <img src="/assets/img/team/02.jpg" alt="" />
                    <div className="team-social">
                      <a href="#"><i className="fab fa-facebook-f"></i></a>
                      <a href="#"><i className="fab fa-x-twitter"></i></a>
                      <a href="#"><i className="fab fa-linkedin-in"></i></a>
                      <a href="#"><i className="fab fa-instagram"></i></a>
                    </div>
                  </div>
                  <div className="team-content">
                    <h4><a href="#">Malissa Fie</a></h4>
                    <span>CTO</span>
                  </div>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="team-item">
                  <div className="team-img">
                    <img src="/assets/img/team/03.jpg" alt="" />
                    <div className="team-social">
                      <a href="#"><i className="fab fa-facebook-f"></i></a>
                      <a href="#"><i className="fab fa-x-twitter"></i></a>
                      <a href="#"><i className="fab fa-linkedin-in"></i></a>
                      <a href="#"><i className="fab fa-instagram"></i></a>
                    </div>
                  </div>
                  <div className="team-content">
                    <h4><a href="#">Arron Rodri</a></h4>
                    <span>Designer</span>
                  </div>
                </div>
              </div>
              <div className="col-md-6 col-lg-3">
                <div className="team-item">
                  <div className="team-img">
                    <img src="/assets/img/team/04.jpg" alt="" />
                    <div className="team-social">
                      <a href="#"><i className="fab fa-facebook-f"></i></a>
                      <a href="#"><i className="fab fa-x-twitter"></i></a>
                      <a href="#"><i className="fab fa-linkedin-in"></i></a>
                      <a href="#"><i className="fab fa-instagram"></i></a>
                    </div>
                  </div>
                  <div className="team-content">
                    <h4><a href="#">Tony Pinako</a></h4>
                    <span>Developer</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Team Area end */}

        {/* Feature Area */}
        <div className="feature-area">
          <div className="container-fluid">
            <div className="feature-wrap">
              <div className="row g-0">
                <div className="col-md-6 col-lg-3">
                  <div className="feature-item">
                    <div className="feature-icon">
                      <i className="fas fa-truck"></i>
                    </div>
                    <div className="feature-content">
                      <h4>Free Delivery</h4>
                      <p>Free shipping on orders over $100</p>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-3">
                  <div className="feature-item">
                    <div className="feature-icon">
                      <i className="fas fa-undo"></i>
                    </div>
                    <div className="feature-content">
                      <h4>Get Refund</h4>
                      <p>30 days money back guarantee</p>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-3">
                  <div className="feature-item">
                    <div className="feature-icon">
                      <i className="fas fa-credit-card"></i>
                    </div>
                    <div className="feature-content">
                      <h4>Safe Payment</h4>
                      <p>100% secure online payment</p>
                    </div>
                  </div>
                </div>
                <div className="col-md-6 col-lg-3">
                  <div className="feature-item">
                    <div className="feature-icon">
                      <i className="fas fa-headphones-alt"></i>
                    </div>
                    <div className="feature-content">
                      <h4>24/7 Support</h4>
                      <p>Contact us any time you need</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Feature Area end */}

        {/* Instagram Area */}
        <div className="instagram-area py-120">
          <div className="container">
            <div className="row">
              <div className="col-lg-6 mx-auto">
                <div className="site-heading text-center">
                  <span className="site-title-tagline">
                    <i className="fas fa-circle"></i> Instagram
                  </span>
                  <h2 className="site-title">Follow Us On Instagram</h2>
                </div>
              </div>
            </div>
            <div className="row g-3 mt-4">
              <div className="col-lg-2 col-md-3 col-sm-4 col-6">
                <div className="instagram-item">
                  <img src="/assets/img/instagram/01.jpg" alt="" />
                  <div className="instagram-overlay">
                    <a href="#"><i className="fab fa-instagram"></i></a>
                  </div>
                </div>
              </div>
              <div className="col-lg-2 col-md-3 col-sm-4 col-6">
                <div className="instagram-item">
                  <img src="/assets/img/instagram/02.jpg" alt="" />
                  <div className="instagram-overlay">
                    <a href="#"><i className="fab fa-instagram"></i></a>
                  </div>
                </div>
              </div>
              <div className="col-lg-2 col-md-3 col-sm-4 col-6">
                <div className="instagram-item">
                  <img src="/assets/img/instagram/03.jpg" alt="" />
                  <div className="instagram-overlay">
                    <a href="#"><i className="fab fa-instagram"></i></a>
                  </div>
                </div>
              </div>
              <div className="col-lg-2 col-md-3 col-sm-4 col-6">
                <div className="instagram-item">
                  <img src="/assets/img/instagram/04.jpg" alt="" />
                  <div className="instagram-overlay">
                    <a href="#"><i className="fab fa-instagram"></i></a>
                  </div>
                </div>
              </div>
              <div className="col-lg-2 col-md-3 col-sm-4 col-6">
                <div className="instagram-item">
                  <img src="/assets/img/instagram/05.jpg" alt="" />
                  <div className="instagram-overlay">
                    <a href="#"><i className="fab fa-instagram"></i></a>
                  </div>
                </div>
              </div>
              <div className="col-lg-2 col-md-3 col-sm-4 col-6">
                <div className="instagram-item">
                  <img src="/assets/img/instagram/06.jpg" alt="" />
                  <div className="instagram-overlay">
                    <a href="#"><i className="fab fa-instagram"></i></a>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Instagram Area end */}

        {/* Brand Area */}
        <div className="brand-area pb-120">
          <div className="container">
            <div className="row">
              <div className="col-lg-6 mx-auto">
                <div className="site-heading text-center">
                  <span className="site-title-tagline">
                    <i className="fas fa-circle"></i> Our Brands
                  </span>
                  <h2 className="site-title">Popular Brands</h2>
                </div>
              </div>
            </div>
            <div className="row g-4 mt-4 align-items-center justify-content-center">
              <div className="col-6 col-md-4 col-lg-2">
                <div className="brand-item">
                  <img src="/assets/img/brand/01.png" alt="" />
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="brand-item">
                  <img src="/assets/img/brand/02.png" alt="" />
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="brand-item">
                  <img src="/assets/img/brand/03.png" alt="" />
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="brand-item">
                  <img src="/assets/img/brand/04.png" alt="" />
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="brand-item">
                  <img src="/assets/img/brand/05.png" alt="" />
                </div>
              </div>
              <div className="col-6 col-md-4 col-lg-2">
                <div className="brand-item">
                  <img src="/assets/img/brand/06.png" alt="" />
                </div>
              </div>
            </div>
            <div className="text-center mt-5">
              <Link href="/shop-search" className="theme-btn">
                View All Brands<i className="fas fa-arrow-right"></i>
              </Link>
            </div>
          </div>
        </div>
        {/* Brand Area end */}
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

      {/* Scroll to top */}
      <a href="#" id="scroll-top"><i className="fas fa-arrow-up"></i></a>
    </>
  );
}
