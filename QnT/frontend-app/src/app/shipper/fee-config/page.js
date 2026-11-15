'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getAuthHeader } from '@/lib/auth';
import '../../admin/dashboard/styles.css';

const API = 'http://localhost:4000/api/v1';

const fmtVnd = (n) => n ? Number(n).toLocaleString('vi-VN') : '';

const ZONE_LABELS = {
  noi_thanh: { label: 'Nội thành', desc: 'Cùng thành phố lớn (HCM, HN, ĐN)', color: '#27ae60' },
  noi_tinh: { label: 'Nội tỉnh', desc: 'Cùng tỉnh/thành', color: '#2980b9' },
  lien_tinh: { label: 'Liên tỉnh', desc: 'Khác tỉnh/thành', color: '#8e44ad' },
};
const ZONES = ['noi_thanh', 'noi_tinh', 'lien_tinh'];

const PRESET_SERVICES = [
  { service_code: 'ECONOMY', service_name: 'Tiết kiệm', estimated_days_noi_thanh: '2-3', estimated_days_noi_tinh: '3-4', estimated_days_lien_tinh: '5-7' },
  { service_code: 'STANDARD', service_name: 'Tiêu chuẩn', estimated_days_noi_thanh: '1-2', estimated_days_noi_tinh: '2-3', estimated_days_lien_tinh: '3-5' },
  { service_code: 'EXPRESS', service_name: 'Hỏa tốc', estimated_days_noi_thanh: '2-4h', estimated_days_noi_tinh: '1', estimated_days_lien_tinh: '1-2' },
];

const emptyRate = (zone_type) => ({ zone_type, weight_from: 0, weight_to: '', base_fee: 0, per_kg_fee: 0 });

const newService = (preset = null) => ({
  _key: Date.now() + Math.random(),
  service_code: preset?.service_code || 'STANDARD',
  service_name: preset?.service_name || 'Dịch vụ mới',
  is_active: true,
  estimated_days_noi_thanh: preset?.estimated_days_noi_thanh || '1-2',
  estimated_days_noi_tinh: preset?.estimated_days_noi_tinh || '1-2',
  estimated_days_lien_tinh: preset?.estimated_days_lien_tinh || '3-5',
  rates: ZONES.flatMap(z => [emptyRate(z)]),
  _expandZone: 'lien_tinh',
});

const labelStyle = { display: 'block', fontSize: '.82rem', fontWeight: 600, marginBottom: 5, color: '#444' };
const inputStyle = { width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #ddd', fontSize: '.88rem', boxSizing: 'border-box' };
const sectionCard = { background: '#fff', borderRadius: 12, boxShadow: '0 1px 6px rgba(0,0,0,.07)', marginBottom: 24, overflow: 'hidden' };
const sectionHead = { padding: '16px 24px', borderBottom: '1px solid #f0f0f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const sectionBody = { padding: '20px 24px' };

export default function FeeConfigPage() {
  const [profile, setProfile] = useState({ display_name: '', description: '', origin_province: 'Hồ Chí Minh', estimated_days_local: '1-2', estimated_days_national: '3-5' });
  const [services, setServices] = useState([]);
  const [surcharges, setSurcharges] = useState({ cod_fee_percent: 1.0, cod_fee_min: 10000, cod_fee_max: 0, insurance_fee_percent: 0.5, remote_area_fee: 0, fuel_surcharge_percent: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, sRes, scRes] = await Promise.all([
        fetch(`${API}/shipper/profile`, { headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } }),
        fetch(`${API}/shipper/services`, { headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } }),
        fetch(`${API}/shipper/surcharges`, { headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } }),
      ]);
      if (pRes.ok) { const d = await pRes.json(); if (d.profile) setProfile({ display_name: d.profile.display_name||'', description: d.profile.description||'', origin_province: d.profile.origin_province||'Hồ Chí Minh', estimated_days_local: d.profile.estimated_days_local||'1-2', estimated_days_national: d.profile.estimated_days_national||'3-5' }); }
      if (sRes.ok) {
        const d = await sRes.json();
        setServices((d.services||[]).map(s => ({
          ...s,
          _key: s.id || Date.now() + Math.random(),
          rates: (s.rates||[]).map(r => ({ ...r, weight_to: r.weight_to ?? '' })),
          _expandZone: 'lien_tinh',
        })));
      }
      if (scRes.ok) { const d = await scRes.json(); if (d.surcharges) setSurcharges(d.surcharges); }
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleSave = async () => {
    setSaving(true); setMsg(null);
    try {
      const [pRes, sRes, scRes] = await Promise.all([
        fetch(`${API}/shipper/profile`, { method: 'PUT', headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(profile) }),
        fetch(`${API}/shipper/services`, { method: 'PUT', headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify({ services: services.map(s => ({
          service_code: s.service_code, service_name: s.service_name, is_active: s.is_active,
          estimated_days_noi_thanh: s.estimated_days_noi_thanh, estimated_days_noi_tinh: s.estimated_days_noi_tinh, estimated_days_lien_tinh: s.estimated_days_lien_tinh,
          rates: (s.rates||[]).map(r => ({ zone_type: r.zone_type, weight_from: Number(r.weight_from)||0, weight_to: r.weight_to===''||r.weight_to==null ? null : Number(r.weight_to), base_fee: Number(r.base_fee)||0, per_kg_fee: Number(r.per_kg_fee)||0 }))
        })) }) }),
        fetch(`${API}/shipper/surcharges`, { method: 'PUT', headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' }, body: JSON.stringify(surcharges) }),
      ]);
      if (pRes.ok && sRes.ok && scRes.ok) {
        setMsg({ type:'success', text:'Lưu cấu hình thành công!' });
        // Silent refresh: không setLoading để không làm mất trạng thái UI
        try {
          const [pR, sR, scR] = await Promise.all([
            fetch(`${API}/shipper/profile`, { headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } }),
            fetch(`${API}/shipper/services`, { headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } }),
            fetch(`${API}/shipper/surcharges`, { headers: { Authorization: getAuthHeader(), 'Content-Type': 'application/json' } }),
          ]);
          if (pR.ok) { const d = await pR.json(); if (d.profile) setProfile(p => ({ ...p, ...d.profile })); }
          if (sR.ok) {
            const d = await sR.json();
            setServices(prev => (d.services||[]).map(s => {
              const existing = prev.find(p => p._key === s.id || p.service_code === s.service_code);
              return { ...s, _key: s.id, rates: (s.rates||[]).map(r => ({ ...r, weight_to: r.weight_to ?? '' })), _expandZone: existing?._expandZone || 'lien_tinh' };
            }));
          }
          if (scR.ok) { const d = await scR.json(); if (d.surcharges) setSurcharges(d.surcharges); }
        } catch(e) { console.error(e); }
      } else {
        const err = await (pRes.ok ? (sRes.ok ? scRes : sRes) : pRes).json().catch(()=>({}));
        setMsg({ type:'error', text: err.detail || 'Lưu thất bại' });
      }
    } catch(e) { setMsg({ type:'error', text:'Lỗi kết nối server' }); }
    finally { setSaving(false); }
  };

  const addService = (preset) => {
    const svc = newService(preset);
    setServices(prev => [...prev, svc]);
  };
  const removeService = (key) => setServices(prev => prev.filter(s => s._key !== key));
  const updateService = (key, field, value) => setServices(prev => prev.map(s => s._key===key ? {...s, [field]: value} : s));
  const addRate = (key, zone) => setServices(prev => prev.map(s => s._key===key ? {...s, rates:[...s.rates, emptyRate(zone)]} : s));
  const removeRate = (key, idx) => setServices(prev => prev.map(s => s._key===key ? {...s, rates:s.rates.filter((_,i)=>i!==idx)} : s));
  const updateRate = (key, idx, field, value) => setServices(prev => prev.map(s => s._key===key ? {...s, rates: s.rates.map((r,i)=>i===idx?{...r,[field]:value}:r)} : s));

  const RateTable = ({ svcKey, zone }) => {
    const svc = services.find(s => s._key === svcKey);
    if (!svc) return null;
    const globalIdxMap = (svc.rates||[]).reduce((acc, r, gi) => { if (r.zone_type === zone) acc.push(gi); return acc; }, []);
    const zoneRates = globalIdxMap.map(gi => svc.rates[gi]);
    return (
      <div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:'.85rem' }}>
            <thead>
              <tr style={{ background:'#fafafa' }}>
                <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#555', borderBottom:'2px solid #eee' }}>Từ (kg)</th>
                <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#555', borderBottom:'2px solid #eee' }}>Đến (kg)</th>
                <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#555', borderBottom:'2px solid #eee' }}>Phí cơ bản (₫)</th>
                <th style={{ padding:'8px 10px', textAlign:'left', fontWeight:700, color:'#555', borderBottom:'2px solid #eee' }}>Phí thêm/kg (₫)</th>
                <th style={{ padding:'8px 10px', borderBottom:'2px solid #eee' }}></th>
              </tr>
            </thead>
            <tbody>
              {zoneRates.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign:'center', color:'#bbb', padding:'1rem', fontStyle:'italic' }}>Chưa có bậc giá</td></tr>
              )}
              {zoneRates.map((r, localIdx) => {
                const gi = globalIdxMap[localIdx];
                return (
                  <tr key={localIdx} style={{ borderBottom:'1px solid #f5f5f5' }}>
                    <td style={{ padding:'6px 8px' }}><input type="number" min="0" step="0.1" style={{ ...inputStyle, width:75 }} value={r.weight_from} onChange={e=>updateRate(svcKey,gi,'weight_from',e.target.value)} /></td>
                    <td style={{ padding:'6px 8px' }}><input type="number" min="0" step="0.1" style={{ ...inputStyle, width:75 }} value={r.weight_to} onChange={e=>updateRate(svcKey,gi,'weight_to',e.target.value)} placeholder="∞" /></td>
                    <td style={{ padding:'6px 8px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <input type="number" min="0" step="1000" style={{ ...inputStyle, width:110 }} value={r.base_fee} onChange={e=>updateRate(svcKey,gi,'base_fee',e.target.value)} />
                        {Number(r.base_fee)>0 && <span style={{ color:'#22BAA0', fontSize:'.75rem', whiteSpace:'nowrap' }}>{fmtVnd(r.base_fee)}₫</span>}
                      </div>
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                        <input type="number" min="0" step="1000" style={{ ...inputStyle, width:110 }} value={r.per_kg_fee} onChange={e=>updateRate(svcKey,gi,'per_kg_fee',e.target.value)} />
                        {Number(r.per_kg_fee)>0 && <span style={{ color:'#22BAA0', fontSize:'.75rem', whiteSpace:'nowrap' }}>{fmtVnd(r.per_kg_fee)}₫/kg</span>}
                      </div>
                    </td>
                    <td style={{ padding:'6px 8px' }}>
                      <button onClick={()=>removeRate(svcKey,gi)} style={{ padding:'4px 8px', borderRadius:5, border:'none', background:'#fde8e8', color:'#e74c3c', cursor:'pointer' }}>
                        <i className="las la-trash"></i>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <button onClick={()=>addRate(svcKey,zone)} style={{ marginTop:8, padding:'5px 14px', borderRadius:7, border:'1px dashed #22BAA0', background:'none', color:'#22BAA0', cursor:'pointer', fontSize:'.82rem' }}>
          <i className="las la-plus" style={{ marginRight:4 }}></i>Thêm bậc giá
        </button>
      </div>
    );
  };

  const SurchargeInput = ({ label, helpText, value, onChange, suffix='₫', step=1000 }) => (
    <div>
      <label style={labelStyle}>{label}</label>
      {helpText && <p style={{ fontSize:'.78rem', color:'#888', margin:'0 0 5px' }}>{helpText}</p>}
      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
        <input type="number" min="0" step={step} style={{ ...inputStyle, maxWidth:160 }} value={value} onChange={onChange} />
        <span style={{ color:'#666', fontSize:'.85rem' }}>{suffix}</span>
      </div>
    </div>
  );

  return (
    <>
      <div className="admin-page-header">
        <h1>Cấu hình phí vận chuyển</h1>
        <small><Link href="/shipper/dashboard">Trang chủ</Link> / Cấu hình phí</small>
      </div>
      <div className="admin-page-content">
        {msg && (
          <div style={{ padding:'10px 16px', borderRadius:8, marginBottom:20, background:msg.type==='success'?'#e9f7ef':'#fde8e8', color:msg.type==='success'?'#27ae60':'#e74c3c', fontWeight:500 }}>
            <i className={`las la-${msg.type==='success'?'check-circle':'exclamation-circle'}`} style={{ marginRight:6 }}></i>{msg.text}
          </div>
        )}

        {loading ? <div style={{ textAlign:'center', color:'#999', padding:'3rem' }}>Đang tải...</div> : (
          <>
            {/* 1. THÔNG TIN ĐVVC */}
            <div style={sectionCard}>
              <div style={sectionHead}>
                <h3 style={{ margin:0, fontSize:'1rem', color:'#1a237e' }}><i className="las la-id-card" style={{ marginRight:6 }}></i>Thông tin đơn vị vận chuyển</h3>
              </div>
              <div style={sectionBody}>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:16 }}>
                  <div>
                    <label style={labelStyle}>Tên hiển thị *</label>
                    <input style={inputStyle} value={profile.display_name} onChange={e=>setProfile(p=>({...p,display_name:e.target.value}))} placeholder="VD: Giao Hàng Nhanh" />
                  </div>
                  <div>
                    <label style={labelStyle}>Tỉnh/TP xuất phát (kho hàng)</label>
                    <input style={inputStyle} value={profile.origin_province} onChange={e=>setProfile(p=>({...p,origin_province:e.target.value}))} placeholder="VD: Hồ Chí Minh" />
                  </div>
                  <div style={{ gridColumn:'1/-1' }}>
                    <label style={labelStyle}>Mô tả dịch vụ</label>
                    <input style={inputStyle} value={profile.description||''} onChange={e=>setProfile(p=>({...p,description:e.target.value}))} placeholder="VD: Giao hàng nhanh, đảm bảo" />
                  </div>
                </div>
              </div>
            </div>

            {/* 2. DỊCH VỤ VẬN CHUYỂN */}
            <div style={sectionCard}>
              <div style={sectionHead}>
                <h3 style={{ margin:0, fontSize:'1rem', color:'#1a237e' }}><i className="las la-layer-group" style={{ marginRight:6 }}></i>Dịch vụ vận chuyển ({services.length})</h3>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  {PRESET_SERVICES.map(p => (
                    <button key={p.service_code} onClick={()=>addService(p)}
                      style={{ padding:'5px 12px', borderRadius:6, border:'1px solid #22BAA0', background:'none', color:'#22BAA0', cursor:'pointer', fontSize:'.82rem', fontWeight:600 }}>
                      + {p.service_name}
                    </button>
                  ))}
                  <button onClick={()=>addService(null)}
                    style={{ padding:'5px 12px', borderRadius:6, border:'1px dashed #aaa', background:'none', color:'#666', cursor:'pointer', fontSize:'.82rem' }}>
                    + Tùy chỉnh
                  </button>
                </div>
              </div>
              <div style={{ padding:'0 24px 20px' }}>
                {services.length === 0 && (
                  <div style={{ textAlign:'center', color:'#bbb', padding:'2rem', fontStyle:'italic' }}>
                    Chưa có dịch vụ nào. Nhấn nút trên để thêm dịch vụ.
                  </div>
                )}
                {services.map((svc) => (
                  <div key={svc._key} style={{ border:'1px solid #eee', borderRadius:10, marginTop:16, overflow:'hidden' }}>
                    {/* Service header */}
                    <div style={{ background:'#fafafa', padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', flex:1 }}>
                        <select style={{ ...inputStyle, width:'auto', minWidth:120 }} value={svc.service_code} onChange={e=>updateService(svc._key,'service_code',e.target.value)}>
                          <option value="ECONOMY">Tiết kiệm</option>
                          <option value="STANDARD">Tiêu chuẩn</option>
                          <option value="EXPRESS">Hỏa tốc</option>
                          <option value="CUSTOM">Tùy chỉnh</option>
                        </select>
                        <input style={{ ...inputStyle, width:200 }} value={svc.service_name} onChange={e=>updateService(svc._key,'service_name',e.target.value)} placeholder="Tên dịch vụ" />
                        <label style={{ display:'flex', alignItems:'center', gap:4, cursor:'pointer', fontSize:'.85rem' }}>
                          <input type="checkbox" checked={svc.is_active} onChange={e=>updateService(svc._key,'is_active',e.target.checked)} />
                          Kích hoạt
                        </label>
                      </div>
                      <button onClick={()=>removeService(svc._key)} style={{ padding:'5px 10px', borderRadius:6, border:'none', background:'#fde8e8', color:'#e74c3c', cursor:'pointer' }}>
                        <i className="las la-trash"></i>
                      </button>
                    </div>
                    {/* Estimated days */}
                    <div style={{ padding:'12px 16px', background:'#fff', borderBottom:'1px solid #f0f0f0', display:'flex', gap:12, flexWrap:'wrap' }}>
                      {ZONES.map(z => (
                        <div key={z} style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ fontSize:'.78rem', color:ZONE_LABELS[z].color, fontWeight:600, minWidth:70 }}>{ZONE_LABELS[z].label}</span>
                          <input type="text" style={{ ...inputStyle, width:70 }}
                            value={svc[`estimated_days_${z}`]||''}
                            onChange={e=>updateService(svc._key,`estimated_days_${z}`,e.target.value)}
                            placeholder="ngày" />
                          <span style={{ fontSize:'.76rem', color:'#999' }}>ngày</span>
                        </div>
                      ))}
                    </div>
                    {/* Zone tabs + rate table */}
                    <div style={{ padding:'12px 16px' }}>
                      <div style={{ display:'flex', gap:6, marginBottom:12 }}>
                        {ZONES.map(z => (
                          <button key={z} onClick={()=>updateService(svc._key,'_expandZone',z)}
                            style={{ padding:'5px 14px', borderRadius:20, border:'none', cursor:'pointer', fontSize:'.82rem', fontWeight:600,
                              background: svc._expandZone===z ? ZONE_LABELS[z].color : '#f0f0f0',
                              color: svc._expandZone===z ? '#fff' : '#555' }}>
                            {ZONE_LABELS[z].label}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize:'.78rem', color:'#888', marginBottom:8 }}>
                        {ZONE_LABELS[svc._expandZone||'lien_tinh'].desc} — Phí = Phí cơ bản + MAX(0, KL − Từ) × Phí/kg
                      </div>
                      <RateTable svcKey={svc._key} zone={svc._expandZone||'lien_tinh'} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 3. PHỤ PHÍ */}
            <div style={sectionCard}>
              <div style={sectionHead}>
                <h3 style={{ margin:0, fontSize:'1rem', color:'#1a237e' }}><i className="las la-percentage" style={{ marginRight:6 }}></i>Cấu hình phụ phí</h3>
              </div>
              <div style={sectionBody}>
                <div style={{ background:'#f9f7ff', padding:'10px 14px', borderRadius:8, marginBottom:18, fontSize:'.83rem', color:'#666' }}>
                  <i className="las la-info-circle" style={{ marginRight:4 }}></i>
                  Phí COD được cộng vào phí vận chuyển khi khách hàng chọn thanh toán khi nhận hàng. Phí bảo hiểm bảo vệ hàng hóa bị hỏng/mất.
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(220px,1fr))', gap:20 }}>
                  <div style={{ gridColumn:'1/-1' }}>
                    <h4 style={{ margin:'0 0 12px', color:'#333', fontSize:'.9rem', borderBottom:'1px solid #f0f0f0', paddingBottom:8 }}>Phí COD (Thu hộ)</h4>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                      <SurchargeInput label="Phần trăm (%)" helpText="% giá trị đơn hàng COD" suffix="%" step={0.1}
                        value={surcharges.cod_fee_percent} onChange={e=>setSurcharges(s=>({...s,cod_fee_percent:e.target.value}))} />
                      <SurchargeInput label="Phí tối thiểu (₫)" helpText="Áp dụng nếu tính % < mức này"
                        value={surcharges.cod_fee_min} onChange={e=>setSurcharges(s=>({...s,cod_fee_min:e.target.value}))} />
                      <SurchargeInput label="Phí tối đa (₫)" helpText="0 = không giới hạn"
                        value={surcharges.cod_fee_max} onChange={e=>setSurcharges(s=>({...s,cod_fee_max:e.target.value}))} />
                    </div>
                  </div>
                  <div>
                    <h4 style={{ margin:'0 0 12px', color:'#333', fontSize:'.9rem', borderBottom:'1px solid #f0f0f0', paddingBottom:8 }}>Bảo hiểm hàng hóa</h4>
                    <SurchargeInput label="Phí bảo hiểm (%)" helpText="% giá trị hàng hóa" suffix="%" step={0.1}
                      value={surcharges.insurance_fee_percent} onChange={e=>setSurcharges(s=>({...s,insurance_fee_percent:e.target.value}))} />
                  </div>
                  <div>
                    <h4 style={{ margin:'0 0 12px', color:'#333', fontSize:'.9rem', borderBottom:'1px solid #f0f0f0', paddingBottom:8 }}>Phụ phí khác</h4>
                    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                      <SurchargeInput label="Phụ phí vùng xa (₫)"
                        value={surcharges.remote_area_fee} onChange={e=>setSurcharges(s=>({...s,remote_area_fee:e.target.value}))} />
                      <SurchargeInput label="Phụ phí nhiên liệu (%)" suffix="%" step={0.1}
                        value={surcharges.fuel_surcharge_percent} onChange={e=>setSurcharges(s=>({...s,fuel_surcharge_percent:e.target.value}))} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Save button */}
            <div style={{ display:'flex', justifyContent:'flex-end', marginBottom:40 }}>
              <button onClick={handleSave} disabled={saving}
                style={{ padding:'11px 32px', borderRadius:8, border:'none', background:'#22BAA0', color:'#fff', fontWeight:700, cursor:saving?'not-allowed':'pointer', fontSize:'.95rem', opacity:saving?0.7:1 }}>
                {saving ? <><i className="las la-spinner la-spin" style={{ marginRight:6 }}></i>Đang lưu...</> : <><i className="las la-save" style={{ marginRight:6 }}></i>Lưu tất cả cấu hình</>}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

