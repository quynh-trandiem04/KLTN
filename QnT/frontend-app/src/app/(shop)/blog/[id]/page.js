'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useUserStore } from '@/store/useUserStore';
import { useCartStore } from '@/store/useCartStore';
import WishlistIcon from '@/components/WishlistIcon';
import './styles.css';

export default function BlogSinglePage() {
  const router = useRouter();
  const params = useParams();
  const { user, clearUser } = useUserStore();
  const { count: cartCount, fetchCount } = useCartStore();
  const [mounted, setMounted] = useState(false);
  const [commentForm, setCommentForm] = useState({ name: '', email: '', comment: '' });
  const [commentLoading, setCommentLoading] = useState(false);
  const [commentMessage, setCommentMessage] = useState('');

  const [blog, setBlog] = useState(null);
  const [loadingBlog, setLoadingBlog] = useState(true);
  const [blogError, setBlogError] = useState('');

  useEffect(() => {
    setMounted(true);
    fetchCount();
  }, [fetchCount]);

  useEffect(() => {
    const fetchBlogById = async () => {
      if (!params?.id) return;

      setLoadingBlog(true);
      setBlogError('');

      const endpoints = [
        `/internal-api/v1/blog/${params.id}`,
        `/api/v1/blog/${params.id}`,
        `/api/v1/blogs/${params.id}`,
        `/api/blog/${params.id}`,
        `/api/blogs/${params.id}`
      ];

      for (const url of endpoints) {
        try {
          const res = await fetch(url);
          if (!res.ok) continue;

          const data = await res.json();
          const raw = data?.data || data?.blog || data;

          if (raw && typeof raw === 'object') {
            setBlog({
              id: raw.id,
              title: raw.title || 'Untitled',
              description: raw.description || '',
              content: raw.content || '',
              imageUrl: raw.imageurl || '/assets/img/blog/single.jpg',
              createdAt: raw.createdat || raw.created_at || ''
            });
            setLoadingBlog(false);
            return;
          }
        } catch (error) {
          console.error('Fetch blog detail error:', error);
        }
      }

      // Fallback: nếu endpoint chi tiết không có, lấy danh sách rồi lọc theo id
      try {
        const listRes = await fetch('/internal-api/v1/blog');
        if (listRes.ok) {
          const listData = await listRes.json();
          const list = Array.isArray(listData?.data) ? listData.data : [];
          const found = list.find((item) => String(item.id) === String(params.id));
          if (found) {
            setBlog({
              id: found.id,
              title: found.title || 'Untitled',
              description: found.description || '',
              content: found.content || '',
              imageUrl: found.imageurl || '/assets/img/blog/single.jpg',
              createdAt: found.createdat || found.created_at || ''
            });
            setLoadingBlog(false);
            return;
          }
        }
      } catch (e) {
        console.error('Fetch blog list fallback error:', e);
      }

      setBlogError('Không thể tải chi tiết blog.');
      setLoadingBlog(false);
    };

    fetchBlogById();
  }, [params?.id]);

  const handleLogout = async () => {
    try {
      if (user?.id) {
        await fetch('/api/v1/auth/logout', {
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

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!commentForm.name || !commentForm.email || !commentForm.comment) {
      setCommentMessage('Please fill in all fields.');
      return;
    }
    setCommentLoading(true);
    setTimeout(() => {
      setCommentLoading(false);
      setCommentMessage('Your comment has been posted successfully!');
      setCommentForm({ name: '', email: '', comment: '' });
    }, 1000);
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
                <li className="nav-item"><a className="nav-link active" href="/blog">Blog</a></li>
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

      <main className="main">
        <div className="site-breadcrumb">
          <div className="site-breadcrumb-bg" style={{ background: 'url(/assets/img/breadcrumb/01.jpg)' }}></div>
          <div className="container">
            <div className="site-breadcrumb-wrap">
              <h4 className="breadcrumb-title">Blog Single</h4>
              <ul className="breadcrumb-menu">
                <li><Link href="/"><i className="far fa-home"></i> Home</Link></li>
                <li><Link href="/blog">Blog</Link></li>
                <li className="active">Blog Single</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="blog-single-area py-90">
          <div className="container">
            {loadingBlog && <div className="text-center">Đang tải chi tiết blog...</div>}
            {!loadingBlog && blogError && <div className="text-center" style={{ color: 'red' }}>{blogError}</div>}

            {!loadingBlog && !blogError && blog && (
              <div className="row">
                <div className="col-lg-10 mx-auto">
                  <div className="blog-single-wrap">
                    <div className="blog-single-content">
                      <div className="blog-thumb-img">
                        <img src={blog.imageUrl} alt={blog.title} />
                      </div>
                      <div className="blog-info">
                        <div className="blog-meta">
                          <div className="blog-meta-left">
                            <ul>
                              <li><i className="far fa-user"></i><a href="#">Admin</a></li>
                              <li>
                                <i className="far fa-clock"></i>{' '}
                                {blog.createdAt ? new Date(blog.createdAt).toLocaleDateString('vi-VN') : 'N/A'}
                              </li>
                            </ul>
                          </div>
                        </div>
                        <div className="blog-details">
                          <h3 className="blog-details-title mb-20">{blog.title}</h3>
                          {blog.description && <p className="mb-10">{blog.description}</p>}
                          <p className="mb-20" style={{ whiteSpace: 'pre-line' }}>{blog.content || 'Nội dung đang cập nhật.'}</p>
                        </div>
                      </div>

                      <div className="blog-comments mb-0">
                        <h3>Leave A Comment</h3>
                        <div className="blog-comments-form">
                          <form onSubmit={handleCommentSubmit}>
                            <div className="row">
                              <div className="col-md-6">
                                <div className="form-group">
                                  <input
                                    type="text"
                                    className="form-control"
                                    placeholder="Your Name*"
                                    value={commentForm.name}
                                    onChange={(e) => setCommentForm({ ...commentForm, name: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="col-md-6">
                                <div className="form-group">
                                  <input
                                    type="email"
                                    className="form-control"
                                    placeholder="Your Email*"
                                    value={commentForm.email}
                                    onChange={(e) => setCommentForm({ ...commentForm, email: e.target.value })}
                                  />
                                </div>
                              </div>
                              <div className="col-md-12">
                                <div className="form-group">
                                  <textarea
                                    className="form-control"
                                    rows="5"
                                    placeholder="Your Comment*"
                                    value={commentForm.comment}
                                    onChange={(e) => setCommentForm({ ...commentForm, comment: e.target.value })}
                                  ></textarea>
                                </div>
                                {commentMessage && (
                                  <div style={{ marginBottom: '15px', color: commentMessage.includes('success') ? 'green' : 'red' }}>
                                    {commentMessage}
                                  </div>
                                )}
                                <button type="submit" className="theme-btn" disabled={commentLoading}>
                                  {commentLoading ? 'Posting...' : 'Post Comment'} <i className="fas fa-paper-plane"></i>
                                </button>
                              </div>
                            </div>
                          </form>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
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
