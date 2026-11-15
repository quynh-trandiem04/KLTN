'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import WishlistIcon from '@/components/WishlistIcon';
import './styles.css';

export default function ContactPage() {
  const router = useRouter();
  const { user, clearUser } = useUserStore();
  const { count: cartCount, fetchCount } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formMessage, setFormMessage] = useState({ type: '', text: '' });
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: ''
  });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setFormMessage({ type: '', text: '' });

    try {
      // Simulate form submission
      await new Promise(resolve => setTimeout(resolve, 1000));
      setFormMessage({ type: 'success', text: 'Your message has been sent successfully!' });
      setFormData({ name: '', email: '', subject: '', message: '' });
    } catch (err) {
      setFormMessage({ type: 'error', text: 'Failed to send message. Please try again.' });
    } finally {
      setLoading(false);
    }
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
                <li className="nav-item"><a className="nav-link" href="/about">About</a></li>
                <li className="nav-item"><a className="nav-link" href="/shop-search">Shop</a></li>
                <li className="nav-item"><a className="nav-link" href="/blog">Blog</a></li>
                <li className="nav-item"><a className="nav-link active" href="/contact">Contact</a></li>
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
              <h4 className="breadcrumb-title">Contact Us</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="far fa-home"></i> Home</Link></li>
                <li className="active">Contact Us</li>
              </ul>
            </div>
          </div>
        </div>
        {/* Breadcrumb end */}

        {/* Contact Area */}
        <div className="contact-area pt-100 pb-80">
          <div className="container">
            <div className="contact-wrapper">
              <div className="row">
                <div className="col-lg-5">
                  <div className="contact-content">
                    <div className="row">
                      <div className="col-md-6">
                        <div className="contact-info">
                          <div className="contact-info-icon">
                            <i className="fal fa-map-location-dot"></i>
                          </div>
                          <div className="contact-info-content">
                            <h5>Office Address</h5>
                            <p>25/B Milford Elm Drive Road, New York, USA</p>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="contact-info">
                          <div className="contact-info-icon">
                            <i className="fal fa-headset"></i>
                          </div>
                          <div className="contact-info-content">
                            <h5>Call Us</h5>
                            <p>+2 123 4565 788</p>
                            <p>+2 123 4565 789</p>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="contact-info">
                          <div className="contact-info-icon">
                            <i className="fal fa-envelopes"></i>
                          </div>
                          <div className="contact-info-content">
                            <h5>Email Us</h5>
                            <p><a href="mailto:info@example.com">info@example.com</a></p>
                            <p><a href="mailto:support@example.com">support@example.com</a></p>
                          </div>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="contact-info">
                          <div className="contact-info-icon">
                            <i className="fal fa-alarm-clock"></i>
                          </div>
                          <div className="contact-info-content">
                            <h5>Open Time</h5>
                            <p>Mon - Sat (10AM - 05PM)</p>
                            <p>Sunday - <span className="text-danger">Closed</span></p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="col-lg-7">
                  <div className="contact-form">
                    <div className="contact-form-header">
                      <h2>Get In Touch</h2>
                      <p>It is a long established fact that a reader will be distracted by the readable content of a page words which even slightly when looking at its layout.</p>
                    </div>
                    <form onSubmit={handleSubmit}>
                      <div className="row">
                        <div className="col-md-6">
                          <div className="form-group">
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Your Name"
                              value={formData.name}
                              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                        <div className="col-md-6">
                          <div className="form-group">
                            <input
                              type="email"
                              className="form-control"
                              placeholder="Your Email"
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              required
                            />
                          </div>
                        </div>
                      </div>
                      <div className="form-group">
                        <input
                          type="text"
                          className="form-control"
                          placeholder="Your Subject"
                          value={formData.subject}
                          onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <textarea
                          cols="30"
                          rows="4"
                          className="form-control"
                          placeholder="Write Your Message"
                          value={formData.message}
                          onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                        ></textarea>
                      </div>
                      <button type="submit" className="theme-btn" disabled={loading}>
                        {loading ? 'Sending...' : 'Send Message'} <i className="far fa-paper-plane"></i>
                      </button>
                      {formMessage.text && (
                        <div className={`form-messege mt-3 ${formMessage.type === 'success' ? 'text-success' : 'text-danger'}`}>
                          {formMessage.text}
                        </div>
                      )}
                    </form>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        {/* Contact Area end */}

        {/* Newsletter Area */}
        <div className="newsletter-area pb-100">
          <div className="container">
            <div className="newsletter-wrap">
              <div className="row">
                <div className="col-lg-6 mx-auto">
                  <div className="newsletter-content">
                    <h3>Get <span>20%</span> Off Discount Coupon</h3>
                    <p>By Subscribe Our Newsletter</p>
                    <div className="subscribe-form">
                      <form action="#">
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
        {/* Newsletter Area end */}

        {/* Map */}
        <div className="contact-map">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d96708.34194156103!2d-74.03927096447748!3d40.759040329405195!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x0%3A0x4a01c8df6fb3cb8!2sSolomon%20R.%20Guggenheim%20Museum!5e0!3m2!1sen!2sbd!4v1619410634508!5m2!1sen!2s"
            style={{border: 0, width: '100%', height: '500px'}}
            allowFullScreen=""
            loading="lazy"
          ></iframe>
        </div>
        {/* Map end */}
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
