'use client';
import { useState, useEffect, useCallback } from 'react';
import { getAuthHeader } from '@/lib/auth';

const API = 'http://localhost:4000/api';

function fmtVnd(n) {
  if (!n && n !== 0) return '—';
  return Number(n).toLocaleString('vi-VN') + '₫';
}

const STATUS_OPTS = ['ACTIVE', 'INACTIVE'];
const STATUS_BADGE = {
  ACTIVE:   { cls: 'badge-success', text: 'Đang bán' },
  INACTIVE: { cls: 'badge-grey',    text: 'Tạm ẩn'   },
  DELETED:  { cls: 'badge-danger',  text: 'Đã xóa'   },
};


const COLOR_PALETTE = [
  { name: 'Đen',       hex: '#000000' },
  { name: 'Trắng',     hex: '#FFFFFF' },
  { name: 'Xám',       hex: '#808080' },
  { name: 'Đỏ',       hex: '#E74C3C' },
  { name: 'Hồng',      hex: '#FF69B4' },
  { name: 'Cam',       hex: '#FF8C00' },
  { name: 'Vàng',      hex: '#FFD700' },
  { name: 'Xanh lá',   hex: '#27AE60' },
  { name: 'Xanh dương', hex: '#2980B9' },
  { name: 'Xanh navy', hex: '#1B2631' },
  { name: 'Tím',       hex: '#8E44AD' },
  { name: 'Nâu',       hex: '#8B4513' },
  { name: 'Kem',       hex: '#FFFDD0' },
  { name: 'Bạc',       hex: '#C0C0C0' },
  { name: 'Vàng đồng', hex: '#DAA520' },
];

function isColorOption(name) {
  const n = (name || '').toLowerCase().trim();
  return n === 'màu' || n === 'màu sắc' || n === 'color' || n === 'colour' || n === 'colors' || n === 'colours';
}

function getColorHex(colorName) {
  const found = COLOR_PALETTE.find(c => c.name.toLowerCase() === colorName.toLowerCase());
  return found ? found.hex : null;
}

const EMPTY_FORM = {
  name: '', price: '', stock: '', category: '', description: '',
  image: '', brand: '', promotionalprice: '', status: 'ACTIVE',
};

const EMPTY_META = { categories: [], brands: [] };

/* ============================================================
   Helper: generate all variant combinations from options
   ============================================================ */
function generateVariants(options, existingVariants = []) {
  if (!options.length || options.some(o => !o.values.length)) return [];
  const combos = options.reduce((acc, opt) => {
    if (acc.length === 0) return opt.values.map(v => [{ option_name: opt.name, value: v }]);
    const next = [];
    for (const prev of acc) {
      for (const v of opt.values) {
        next.push([...prev, { option_name: opt.name, value: v }]);
      }
    }
    return next;
  }, []);
  return combos.map(combo => {
    const label = combo.map(c => c.value).join(' / ');
    const existing = existingVariants.find(ev =>
      ev.label === label || (ev.option_values && ev.option_values.length === combo.length &&
        combo.every(c => ev.option_values.some(eov => eov.option_name === c.option_name && eov.value === c.value)))
    );
    return {
      label,
      option_values: combo,
      sku: existing?.sku || '',
      price: existing?.price || '',
      promotional_price: existing?.promotional_price || '',
      stock: existing?.stock || '',
      image_url: existing?.image_url || '',
    };
  });
}

export default function SellerProductsPage() {
  const [products, setProducts] = useState([]);
  const [total,    setTotal]    = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [toast,    setToast]    = useState(null);

  // filters
  const [search,  setSearch]  = useState('');
  const [status,  setStatus]  = useState('');
  const [page,    setPage]    = useState(1);
  const LIMIT = 10;

  // modals
  const [addOpen,  setAddOpen]  = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [delItem,  setDelItem]  = useState(null);

  // form
  const [form,       setForm]       = useState(EMPTY_FORM);
  const [formImages, setFormImages] = useState([]);        // [{url, alt_text}]
  const [formOptions, setFormOptions] = useState([]);      // [{name, values: [string]}]
  const [formVariants, setFormVariants] = useState([]);    // [{label, option_values, sku, price, stock, ...}]
  const [formAttrs,   setFormAttrs]   = useState([]);      // [{name, value}]
  const [saving,     setSaving]     = useState(false);
  const [formTab,    setFormTab]    = useState('basic');
  const [meta, setMeta] = useState(EMPTY_META);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page, limit: LIMIT });
      if (search) params.append('search', search);
      if (status) params.append('status', status);
      const res  = await fetch(`${API}/v1/seller/products?${params}`, {
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi tải sản phẩm');
      setProducts(body.products || []);
      setTotal(body.total || 0);
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useEffect(() => {
    const fetchMeta = async () => {
      try {
        const res = await fetch(`${API}/v1/seller/products/meta`, {
          headers: { Authorization: getAuthHeader() },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi tải danh mục/thương hiệu');
        setMeta({
          categories: Array.isArray(body.categories) ? body.categories : [],
          brands: Array.isArray(body.brands) ? body.brands : [],
        });
      } catch (e) {
        showToast('error', e.message);
      }
    };

    fetchMeta();
  }, []);

  /* -------- Reset form helpers -------- */
  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormImages([]);
    setFormOptions([]);
    setFormVariants([]);
    setFormAttrs([]);
    setFormTab('basic');
  };

  /* -------- Options logic -------- */
  const addOption = () => setFormOptions(o => [...o, { name: '', values: [], inputText: '' }]);
  const removeOption = (idx) => {
    const next = formOptions.filter((_, i) => i !== idx);
    setFormOptions(next);
    setFormVariants(generateVariants(next, formVariants));
  };
  const setOptionName = (idx, name) => {
    const next = formOptions.map((o, i) => i === idx ? { ...o, name } : o);
    setFormOptions(next);
  };
  const addOptionValue = (idx, val) => {
    const trimmed = val.trim();
    if (!trimmed) return;
    const opt = formOptions[idx];
    if (opt.values.includes(trimmed)) return;
    const next = formOptions.map((o, i) => i === idx ? { ...o, values: [...o.values, trimmed], inputText: '' } : o);
    setFormOptions(next);
    setFormVariants(generateVariants(next, formVariants));
  };
  const removeOptionValue = (optIdx, valIdx) => {
    const next = formOptions.map((o, i) => i === optIdx ? { ...o, values: o.values.filter((_, vi) => vi !== valIdx) } : o);
    setFormOptions(next);
    setFormVariants(generateVariants(next, formVariants));
  };
  const setOptionInputText = (idx, text) => {
    setFormOptions(o => o.map((opt, i) => i === idx ? { ...opt, inputText: text } : opt));
  };
  const handleOptionKeyDown = (idx, e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addOptionValue(idx, formOptions[idx].inputText);
    } else if (e.key === 'Backspace' && !formOptions[idx].inputText && formOptions[idx].values.length > 0) {
      removeOptionValue(idx, formOptions[idx].values.length - 1);
    }
  };

  /* -------- Variant field update -------- */
  const updateVariant = (idx, field, value) => {
    setFormVariants(vs => vs.map((v, i) => i === idx ? { ...v, [field]: value } : v));
  };

  /* -------- Images logic -------- */
  const addImage = () => setFormImages(imgs => [...imgs, { url: '', alt_text: '' }]);
  const removeImage = (idx) => setFormImages(imgs => imgs.filter((_, i) => i !== idx));
  const updateImage = (idx, field, value) => {
    setFormImages(imgs => imgs.map((img, i) => i === idx ? { ...img, [field]: value } : img));
  };

  /* -------- Attributes logic -------- */
  const addAttr = () => setFormAttrs(a => [...a, { name: '', value: '' }]);
  const removeAttr = (idx) => setFormAttrs(a => a.filter((_, i) => i !== idx));
  const updateAttr = (idx, field, value) => {
    setFormAttrs(a => a.map((attr, i) => i === idx ? { ...attr, [field]: value } : attr));
  };

  /* ---------- PAYLOAD ---------- */
  const buildPayload = () => ({
    name: form.name,
    price: Number(form.price),
    stock: Number(form.stock) || 0,
    category: form.category || null,
    description: form.description,
    image_url: formImages.length > 0 ? formImages[0].url : form.image,
    brand: form.brand || null,
    promotionalprice: form.promotionalprice ? Number(form.promotionalprice) : null,
    status: form.status,
    images: formImages.filter(img => img.url),
    options: formOptions.filter(o => o.name && o.values.length > 0).map(o => ({
      name: o.name,
      values: o.values.map(v => ({ value: v })),
    })),
    variants: formVariants.filter(v => v.price).map(v => ({
      sku: v.sku,
      price: Number(v.price),
      promotional_price: v.promotional_price ? Number(v.promotional_price) : null,
      stock: Number(v.stock) || 0,
      image_url: v.image_url || null,
      option_values: v.option_values,
    })),
    attributes: formAttrs.filter(a => a.name && a.value),
  });

  /* ---------- ADD ---------- */
  const openAdd = () => { resetForm(); setAddOpen(true); };

  const handleAdd = async () => {
    if (!form.name) return showToast('error', 'Vui lòng nhập tên sản phẩm');
    const hasVariants = formVariants.some(v => v.price);
    if (!form.price && !hasVariants) return showToast('error', 'Vui lòng nhập giá hoặc tạo biến thể có giá');
    setSaving(true);
    try {
      const res  = await fetch(`${API}/v1/seller/products`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(buildPayload()),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi thêm sản phẩm');
      showToast('success', 'Thêm sản phẩm thành công!');
      setAddOpen(false);
      fetchProducts();
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- EDIT ---------- */
  const openEdit = async (p) => {
    // Fetch full product with variants/options/images/attrs
    try {
      const res = await fetch(`${API}/v1/seller/products/${p.id}`, {
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || 'Lỗi tải sản phẩm');
      const full = body.product;
      setForm({
        name: full.name || '', price: full.price || '', stock: full.stock || '',
        category: full.category || '', description: full.description || '',
        image: full.image || '', brand: full.brand || '',
        promotionalprice: full.promotionalprice || '', status: full.status || 'ACTIVE',
      });
      setFormImages((full.images || []).map(i => ({ url: i.url, alt_text: i.alt_text || '' })));
      setFormOptions((full.options || []).map(o => {
        const values = (o.values || []).filter(v => v.value).map(v => v.value);
        return { name: o.option_name, values, inputText: '' };
      }));
      setFormVariants((full.variants || []).map(v => ({
        label: (v.option_values || []).filter(ov => ov.value).map(ov => ov.value).join(' / '),
        option_values: (v.option_values || []).filter(ov => ov.value),
        sku: v.sku || '', price: v.price || '', promotional_price: v.promotional_price || '',
        stock: v.stock || '', image_url: v.image_url || '',
      })));
      setFormAttrs((full.attributes || []).map(a => ({ name: a.name, value: a.value })));
      setEditItem(full);
    } catch (e) {
      showToast('error', e.message);
    }
  };

  const handleEdit = async () => {
    if (!form.name) return showToast('error', 'Vui lòng nhập tên sản phẩm');
    const hasVariants = formVariants.some(v => v.price);
    if (!form.price && !hasVariants) return showToast('error', 'Vui lòng nhập giá hoặc tạo biến thể có giá');
    setSaving(true);
    try {
      const res  = await fetch(`${API}/v1/seller/products/${editItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: getAuthHeader() },
        body: JSON.stringify(buildPayload()),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi cập nhật');
      showToast('success', 'Cập nhật thành công!');
      setEditItem(null);
      fetchProducts();
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ---------- DELETE ---------- */
  const handleDelete = async () => {
    setSaving(true);
    try {
      const res  = await fetch(`${API}/v1/seller/products/${delItem.id}`, {
        method: 'DELETE',
        headers: { Authorization: getAuthHeader() },
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail || body.message || 'Lỗi xóa sản phẩm');
      showToast('success', 'Đã xóa sản phẩm!');
      setDelItem(null);
      fetchProducts();
    } catch (e) {
      showToast('error', e.message);
    } finally {
      setSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <>
      <div className="s-page-header">
        <h1>Quản lý sản phẩm</h1>
        <small><a href="/seller/dashboard">Trang chủ</a> / Sản phẩm</small>
      </div>

      <div className="s-page-content">
        {toast && (
          <div className={`s-toast ${toast.type}`}>
            <i className={`las la-${toast.type === 'success' ? 'check-circle' : 'exclamation-circle'}`}></i>
            {toast.msg}
          </div>
        )}

        <div className="s-records">
          <div className="s-record-header">
            <h3><i className="las la-box-open" style={{ marginRight:6 }}></i>Danh sách sản phẩm ({total})</h3>
            <div className="s-record-actions">
              <input type="search" placeholder="Tìm sản phẩm…" value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }} />
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
                <option value="">Tất cả trạng thái</option>
                <option value="ACTIVE">Đang bán</option>
                <option value="INACTIVE">Tạm ẩn</option>
              </select>
              <button className="btn-primary" onClick={openAdd}>
                <i className="las la-plus"></i> Thêm sản phẩm
              </button>
            </div>
          </div>

          <div className="s-table-wrap">
            <table className="s-table">
              <thead>
                <tr>
                  <th style={{ width:50 }}>Ảnh</th>
                  <th>Tên sản phẩm</th>
                  <th>Giá</th>
                  <th>KM</th>
                  <th>Tồn kho</th>
                  <th>Biến thể</th>
                  <th>Trạng thái</th>
                  <th style={{ width:100 }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign:'center', padding:'2.5rem', color:'#22BAA0' }}>
                    <i className="las la-spinner la-spin" style={{ fontSize:'2rem' }}></i>
                  </td></tr>
                ) : products.length === 0 ? (
                  <tr><td colSpan={8} className="s-empty">
                    <i className="las la-box"></i> Chưa có sản phẩm nào
                  </td></tr>
                ) : products.map(p => {
                  const { cls, text } = STATUS_BADGE[p.status] || { cls:'badge-grey', text: p.status };
                  const displayImg = p.primary_image || p.image;
                  return (
                    <tr key={p.id}>
                      <td>
                        {displayImg ? (
                          <img src={displayImg} alt={p.name} className="s-prod-img"
                            onError={e => { e.target.style.display='none'; }} />
                        ) : (
                          <div className="s-prod-img"><i className="las la-image"></i></div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight:500, color:'#333' }}>{p.name}</div>
                      </td>
                      <td style={{ fontWeight:600, color:'#22BAA0' }}>
                        {parseInt(p.variant_count) > 0
                          ? (p.variant_price_min === p.variant_price_max
                              ? fmtVnd(p.variant_price_min)
                              : `${fmtVnd(p.variant_price_min)} - ${fmtVnd(p.variant_price_max)}`)
                          : fmtVnd(p.price)}
                      </td>
                      <td style={{ color: p.promotionalprice ? '#e74c3c' : '#ccc' }}>
                        {p.promotionalprice ? fmtVnd(p.promotionalprice) : '—'}
                      </td>
                      <td>{parseInt(p.variant_count) > 0 ? p.variant_stock_sum : (p.stock ?? '—')}</td>
                      <td>
                        {parseInt(p.variant_count) > 0 ? (
                          <span style={{ background:'#e8f8f5', color:'#22BAA0', borderRadius:10, padding:'2px 8px', fontSize:12, fontWeight:600 }}>
                            {p.variant_count} biến thể
                          </span>
                        ) : '—'}
                      </td>
                      <td><span className={`s-badge ${cls}`}>{text}</span></td>
                      <td>
                        <div className="s-actions">
                          <span className="s-action-btn" title="Chỉnh sửa" onClick={() => openEdit(p)}>
                            <i className="las la-edit"></i>
                          </span>
                          <span className="s-action-btn danger" title="Xóa" onClick={() => setDelItem(p)}>
                            <i className="las la-trash"></i>
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="s-table-foot">
            <span>Hiển thị {Math.min((page-1)*LIMIT+1, total)}–{Math.min(page*LIMIT, total)} / {total} sản phẩm</span>
            <div style={{ display:'flex', gap:6 }}>
              <button disabled={page <= 1} onClick={() => setPage(p => p-1)}
                style={{ padding:'3px 10px', border:'1px solid #ddd', borderRadius:5, cursor: page<=1?'not-allowed':'pointer', background:'#fff', color:'#555' }}>
                ‹ Trước
              </button>
              <span style={{ padding:'3px 10px', background:'#22BAA0', color:'#fff', borderRadius:5 }}>{page}</span>
              <button disabled={page >= totalPages} onClick={() => setPage(p => p+1)}
                style={{ padding:'3px 10px', border:'1px solid #ddd', borderRadius:5, cursor: page>=totalPages?'not-allowed':'pointer', background:'#fff', color:'#555' }}>
                Sau ›
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ADD MODAL */}
      {addOpen && (
        <ProductForm title="Thêm sản phẩm mới" onSave={handleAdd} onClose={() => setAddOpen(false)}
          form={form} setForm={setForm} formTab={formTab} setFormTab={setFormTab}
          formImages={formImages} formOptions={formOptions} formVariants={formVariants} formAttrs={formAttrs}
          saving={saving} addImage={addImage} removeImage={removeImage} updateImage={updateImage}
          setOptionName={setOptionName} addOptionValue={addOptionValue} removeOptionValue={removeOptionValue}
          setOptionInputText={setOptionInputText} handleOptionKeyDown={handleOptionKeyDown}
          addOption={addOption} removeOption={removeOption}
          updateVariant={updateVariant} addAttr={addAttr} removeAttr={removeAttr} updateAttr={updateAttr}
          categories={meta.categories} brands={meta.brands} />
      )}

      {/* EDIT MODAL */}
      {editItem && (
        <ProductForm title={`Chỉnh sửa: ${editItem.name}`} onSave={handleEdit} onClose={() => setEditItem(null)}
          form={form} setForm={setForm} formTab={formTab} setFormTab={setFormTab}
          formImages={formImages} formOptions={formOptions} formVariants={formVariants} formAttrs={formAttrs}
          saving={saving} addImage={addImage} removeImage={removeImage} updateImage={updateImage}
          setOptionName={setOptionName} addOptionValue={addOptionValue} removeOptionValue={removeOptionValue}
          setOptionInputText={setOptionInputText} handleOptionKeyDown={handleOptionKeyDown}
          addOption={addOption} removeOption={removeOption}
          updateVariant={updateVariant} addAttr={addAttr} removeAttr={removeAttr} updateAttr={updateAttr}
          categories={meta.categories} brands={meta.brands} />
      )}

      {/* DELETE CONFIRM */}
      {delItem && (
        <div className="s-modal-overlay" onClick={e => e.target === e.currentTarget && setDelItem(null)}>
          <div className="s-modal" style={{ maxWidth:420 }}>
            <div className="s-modal-head">
              <h3 style={{ color:'#e74c3c' }}><i className="las la-exclamation-triangle" style={{ marginRight:6 }}></i>Xác nhận xóa</h3>
              <button className="s-modal-close" onClick={() => setDelItem(null)}>✕</button>
            </div>
            <div className="s-modal-body">
              <p style={{ color:'#555', lineHeight:1.7 }}>
                Bạn có chắc muốn xóa sản phẩm <strong>&quot;{delItem.name}&quot;</strong>?<br />
                <small style={{ color:'#999' }}>Sản phẩm sẽ bị ẩn (không thể khôi phục từ giao diện).</small>
              </p>
            </div>
            <div className="s-modal-foot">
              <button className="btn-primary" style={{ background:'#eee', color:'#555' }} onClick={() => setDelItem(null)}>Hủy</button>
              <button className="btn-primary" style={{ background:'#e74c3c' }} onClick={handleDelete} disabled={saving}>
                {saving ? <><i className="las la-spinner la-spin"></i> Đang xóa…</> : <><i className="las la-trash"></i> Xóa</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* Inline styles */
const lbl = { display:'block', fontWeight:500, marginBottom:4, fontSize:13, color:'#555' };
const inp = { width:'100%', padding:'7px 10px', border:'1px solid #ddd', borderRadius:6, fontSize:13, outline:'none' };
const btnDanger = { border:'none', background:'#ffeaea', color:'#e74c3c', borderRadius:6, padding:'5px 8px', cursor:'pointer', fontSize:14, lineHeight:1 };
const btnOutline = { border:'1px dashed #22BAA0', background:'transparent', color:'#22BAA0', borderRadius:6, padding:'6px 14px', cursor:'pointer', fontSize:13, fontWeight:500 };

const FORM_TABS = [
  { key: 'basic',    label: 'Cơ bản',      icon: 'la-info-circle' },
  { key: 'images',   label: 'Ảnh',          icon: 'la-images' },
  { key: 'options',  label: 'Phân loại',    icon: 'la-layer-group' },
  { key: 'attrs',    label: 'Thuộc tính',   icon: 'la-list-ul' },
];

function ProductForm({
  onSave, title, onClose,
  form, setForm, formTab, setFormTab,
  formImages, formOptions, formVariants, formAttrs,
  saving, addImage, removeImage, updateImage,
  setOptionName, addOptionValue, removeOptionValue,
  setOptionInputText, handleOptionKeyDown,
  addOption, removeOption,
  updateVariant, addAttr, removeAttr, updateAttr,
  categories, brands,
}) {
  return (
    <div className="s-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="s-modal" style={{ maxWidth: 820, width: '95vw' }}>
        <div className="s-modal-head">
          <h3><i className="las la-box-open" style={{ marginRight:6 }}></i>{title}</h3>
          <button className="s-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'2px solid #eee', padding:'0 1.2rem' }}>
          {FORM_TABS.map(t => (
            <button key={t.key} onClick={() => setFormTab(t.key)}
              style={{
                padding:'10px 18px', border:'none', background:'transparent', cursor:'pointer',
                fontWeight: formTab === t.key ? 600 : 400,
                color: formTab === t.key ? '#22BAA0' : '#888',
                borderBottom: formTab === t.key ? '2px solid #22BAA0' : '2px solid transparent',
                marginBottom: -2, fontSize: 14,
              }}>
              <i className={`las ${t.icon}`} style={{ marginRight:4 }}></i>{t.label}
              {t.key === 'options' && formVariants.length > 0 && (
                <span style={{ marginLeft:5, background:'#22BAA0', color:'#fff', borderRadius:10, padding:'1px 7px', fontSize:11 }}>{formVariants.length}</span>
              )}
            </button>
          ))}
        </div>

        <div className="s-modal-body" style={{ minHeight: 340, maxHeight: '60vh', overflowY: 'auto' }}>

          {/* ── TAB: Cơ bản ── */}
          {formTab === 'basic' && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px 16px' }}>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Tên sản phẩm *</label>
                <input style={inp} value={form.name} placeholder="Tên sản phẩm"
                  onChange={e => setForm(f => ({...f, name: e.target.value}))} />
              </div>
              <div>
                <label style={lbl}>Giá (VNĐ) {formVariants.length === 0 ? '*' : ''}</label>
                {formVariants.length > 0 ? (
                  <p style={{ color:'#22BAA0', fontSize:12, margin:0, padding:'7px 0' }}>
                    <i className="las la-info-circle"></i> Giá được quản lý ở tab <b>Phân loại</b>
                  </p>
                ) : (
                  <input style={inp} type="number" value={form.price} placeholder="0"
                    onChange={e => setForm(f => ({...f, price: e.target.value}))} />
                )}
              </div>
              <div>
                <label style={lbl}>Giá khuyến mãi</label>
                {formVariants.length > 0 ? (
                  <p style={{ color:'#22BAA0', fontSize:12, margin:0, padding:'7px 0' }}>
                    <i className="las la-info-circle"></i> Quản lý ở tab <b>Phân loại</b>
                  </p>
                ) : (
                  <input style={inp} type="number" value={form.promotionalprice} placeholder="0"
                    onChange={e => setForm(f => ({...f, promotionalprice: e.target.value}))} />
                )}
              </div>
              <div>
                <label style={lbl}>Tồn kho</label>
                {formVariants.length > 0 ? (
                  <p style={{ color:'#22BAA0', fontSize:12, margin:0, padding:'7px 0' }}>
                    <i className="las la-info-circle"></i> Quản lý ở tab <b>Phân loại</b>
                  </p>
                ) : (
                  <input style={inp} type="number" value={form.stock} placeholder="0"
                    onChange={e => setForm(f => ({...f, stock: e.target.value}))} />
                )}
              </div>
              <div>
                <label style={lbl}>Thương hiệu</label>
                <select style={inp} value={form.brand} onChange={e => setForm(f => ({...f, brand: e.target.value}))}>
                  <option value="">— Chọn thương hiệu —</option>
                  {brands.map((b, idx) => (
                    <option key={`${b.name}-${idx}`} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Danh mục</label>
                <select style={inp} value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))}>
                  <option value="">— Chọn danh mục —</option>
                  {categories.map((c, idx) => (
                    <option key={`${c.name}-${idx}`} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={lbl}>Trạng thái</label>
                <select style={inp} value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
                  {STATUS_OPTS.map(s => <option key={s} value={s}>{STATUS_BADGE[s]?.text || s}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'1/-1' }}>
                <label style={lbl}>Mô tả</label>
                <textarea style={{...inp, minHeight:80}} value={form.description} placeholder="Mô tả sản phẩm…"
                  onChange={e => setForm(f => ({...f, description: e.target.value}))} rows={3} />
              </div>
            </div>
          )}

          {/* ── TAB: Ảnh ── */}
          {formTab === 'images' && (
            <div>
              <p style={{ color:'#888', fontSize:13, marginBottom:10 }}>
                Ảnh đầu tiên sẽ là ảnh chính. Nhập URL trực tiếp.
              </p>
              {formImages.map((img, i) => (
                <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                  <span style={{ minWidth:28, color:'#999', fontSize:13, fontWeight:600 }}>#{i+1}</span>
                  <input style={{...inp, flex:1}} value={img.url} placeholder="URL ảnh"
                    onChange={e => updateImage(i, 'url', e.target.value)} />
                  <input style={{...inp, width:140}} value={img.alt_text} placeholder="Mô tả ảnh"
                    onChange={e => updateImage(i, 'alt_text', e.target.value)} />
                  {img.url && <img src={img.url} alt="" style={{ width:36, height:36, borderRadius:4, objectFit:'cover', border:'1px solid #eee' }} onError={e => { e.target.style.display='none'; }} />}
                  <button onClick={() => removeImage(i)} style={btnDanger} title="Xóa ảnh">
                    <i className="las la-times"></i>
                  </button>
                </div>
              ))}
              <button onClick={addImage} style={btnOutline}>
                <i className="las la-plus" style={{ marginRight:4 }}></i>Thêm ảnh
              </button>
            </div>
          )}

          {/* ── TAB: Phân loại (Options + Variants) ── */}
          {formTab === 'options' && (
            <div>
              <p style={{ color:'#888', fontSize:13, marginBottom:10 }}>
                Tạo phân loại (VD: Màu, Size). Gõ giá trị rồi nhấn <b>Enter</b> để thêm. Biến thể tự sinh.
              </p>

              {/* Options */}
              {formOptions.map((opt, oi) => {
                const colorMode = isColorOption(opt.name);
                return (
                <div key={oi} style={{ marginBottom:12, padding:12, background:'#fafbfc', borderRadius:8, border:'1px solid #eee' }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                    <input style={{...inp, width:160, fontWeight:500}} value={opt.name} placeholder="Tên phân loại (VD: Màu sắc)"
                      onChange={e => setOptionName(oi, e.target.value)} />
                    <div style={{ flex:1 }}></div>
                    <button onClick={() => removeOption(oi)} style={btnDanger} title="Xóa phân loại">
                      <i className="las la-trash"></i>
                    </button>
                  </div>

                  {/* Color palette */}
                  {colorMode && (
                    <div style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', flexWrap:'wrap', gap:6, alignItems:'center' }}>
                        {COLOR_PALETTE.filter(c => !opt.values.includes(c.name)).map(c => (
                          <button key={c.name} onClick={() => addOptionValue(oi, c.name)}
                            title={c.name}
                            style={{
                              width:32, height:32, borderRadius:'50%', border: c.hex === '#FFFFFF' ? '2px solid #ccc' : '2px solid transparent',
                              background: c.hex, cursor:'pointer', transition:'transform 0.15s',
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.2)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                          />
                        ))}
                        <label title="Chọn màu khác" style={{ position:'relative', width:32, height:32, borderRadius:'50%', border:'2px dashed #bbb', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', background:'#fff' }}>
                          <i className="las la-plus" style={{ fontSize:16, color:'#999' }}></i>
                          <input type="color" style={{ position:'absolute', opacity:0, width:0, height:0 }}
                            onChange={e => {
                              const hex = e.target.value;
                              const match = COLOR_PALETTE.find(c => c.hex.toLowerCase() === hex.toLowerCase());
                              const label = match ? match.name : hex;
                              addOptionValue(oi, label);
                            }} />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Tags */}
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6, alignItems:'center', padding:'6px 8px', background:'#fff', border:'1px solid #ddd', borderRadius:6, minHeight:36 }}>
                    {opt.values.map((val, vi) => {
                      const colorHex = colorMode ? getColorHex(val) : null;
                      return (
                        <span key={vi} style={{ display:'inline-flex', alignItems:'center', gap:4, background: colorHex ? '#f5f5f5' : '#22BAA0', color: colorHex ? '#333' : '#fff', borderRadius:20, padding:'3px 10px 3px 4px', fontSize:13, border: colorHex ? '1px solid #ddd' : 'none' }}>
                          {colorHex && (
                            <span style={{ width:20, height:20, borderRadius:'50%', background: colorHex, border: colorHex === '#FFFFFF' ? '1px solid #ccc' : 'none', display:'inline-block', flexShrink:0 }} />
                          )}
                          {val}
                          <button onClick={() => removeOptionValue(oi, vi)} style={{ background:'none', border:'none', color: colorHex ? '#999' : '#fff', cursor:'pointer', padding:0, fontSize:14, lineHeight:1, opacity:0.8, marginLeft:2 }}>&times;</button>
                        </span>
                      );
                    })}
                    {!colorMode && (
                      <input
                        style={{ border:'none', outline:'none', flex:1, minWidth:100, fontSize:13, background:'transparent', padding:'2px 4px' }}
                        value={opt.inputText}
                        placeholder={opt.values.length === 0 ? 'Gõ giá trị rồi nhấn Enter (VD: S, M, L)' : 'Thêm giá trị...'}
                        onChange={e => setOptionInputText(oi, e.target.value)}
                        onKeyDown={e => handleOptionKeyDown(oi, e)}
                        onBlur={() => { if (opt.inputText.trim()) addOptionValue(oi, opt.inputText); }}
                      />
                    )}
                  </div>
                </div>
              );
              })}
              <button onClick={addOption} style={{...btnOutline, marginBottom:16}}>
                <i className="las la-plus" style={{ marginRight:4 }}></i>Thêm phân loại
              </button>

              {/* Variants table */}
              {formVariants.length > 0 && (
                <>
                  <h4 style={{ marginBottom:8, fontWeight:600, color:'#333' }}>
                    <i className="las la-th-list" style={{ marginRight:4 }}></i>Biến thể ({formVariants.length})
                  </h4>
                  <div style={{ overflowX:'auto' }}>
                    <table className="s-table" style={{ fontSize:13 }}>
                      <thead>
                        <tr>
                          <th>Phân loại</th>
                          <th style={{ width:120 }}>SKU</th>
                          <th style={{ width:110 }}>Giá *</th>
                          <th style={{ width:110 }}>Giá KM</th>
                          <th style={{ width:80 }}>Tồn kho</th>
                        </tr>
                      </thead>
                      <tbody>
                        {formVariants.map((v, vi) => (
                          <tr key={vi}>
                            <td style={{ fontWeight:500 }}>{v.label}</td>
                            <td><input style={inp} value={v.sku} placeholder="SKU" onChange={e => updateVariant(vi, 'sku', e.target.value)} /></td>
                            <td><input style={inp} type="number" value={v.price} placeholder="Giá" onChange={e => updateVariant(vi, 'price', e.target.value)} /></td>
                            <td><input style={inp} type="number" value={v.promotional_price} placeholder="KM" onChange={e => updateVariant(vi, 'promotional_price', e.target.value)} /></td>
                            <td><input style={inp} type="number" value={v.stock} placeholder="0" onChange={e => updateVariant(vi, 'stock', e.target.value)} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── TAB: Thuộc tính ── */}
          {formTab === 'attrs' && (
            <div>
              <p style={{ color:'#888', fontSize:13, marginBottom:10 }}>
                Thêm thông tin bổ sung (VD: Chất liệu = Cotton, RAM = 8GB).
              </p>
              {formAttrs.map((attr, i) => (
                <div key={i} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'center' }}>
                  <input style={{...inp, width:180}} value={attr.name} placeholder="Tên thuộc tính"
                    onChange={e => updateAttr(i, 'name', e.target.value)} />
                  <input style={{...inp, flex:1}} value={attr.value} placeholder="Giá trị"
                    onChange={e => updateAttr(i, 'value', e.target.value)} />
                  <button onClick={() => removeAttr(i)} style={btnDanger} title="Xóa">
                    <i className="las la-times"></i>
                  </button>
                </div>
              ))}
              <button onClick={addAttr} style={btnOutline}>
                <i className="las la-plus" style={{ marginRight:4 }}></i>Thêm thuộc tính
              </button>
            </div>
          )}
        </div>

        <div className="s-modal-foot">
          <button className="btn-primary" style={{ background:'#eee', color:'#555' }} onClick={onClose}>Hủy</button>
          <button className="btn-primary" onClick={onSave} disabled={saving}>
            {saving ? <><i className="las la-spinner la-spin"></i> Đang lưu…</> : <><i className="las la-save"></i> Lưu</>}
          </button>
        </div>
      </div>
    </div>
  );
}
