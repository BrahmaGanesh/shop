import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import { auth, db } from './firebase';
import { useApp } from './context';
import { useAdmin } from './admin/AdminShell';
import { Invoice } from './admin/Invoice';
import { buildDraftInvoice } from './billFromCart';
import { CartLine, Grid, Loading, Logo, Photo, PriceBlock, ProductCard, Qty, StockTag, Totals } from './components';
import { maxQty, searchProducts, stockInfo, unitPrice, money2 } from './lib';

const nameOf = (c, lang) => (lang === 'te' && c.nameTelugu ? c.nameTelugu : c.nameEnglish);

const speakTelugu = async (text) => {
  if (!Capacitor.isNativePlatform() && window.innerWidth > 800) return;
  try { await TextToSpeech.stop(); await TextToSpeech.speak({ text, lang: 'te-IN', rate: 0.9 }); } catch (e) {}
};

function CategoryCards() {
  const { categories, products, lang, t } = useApp();
  return (
    <div className="cats">
      {categories.map((c) => (
        <Link key={c.id} to={`/products?cat=${c.id}`} className="cat">
          {c.iconUrl ? <img className="cat-img" src={c.iconUrl} alt="" /> : <span className="cat-i">{c.icon || '⚙️'}</span>}
          <b>{nameOf(c, lang)}</b>
          <small>{lang === 'te' ? c.nameEnglish : c.nameTelugu}</small>
          <em>{products.filter((p) => p.category === c.id).length}</em>
        </Link>
      ))}
      <Link to="/products" className="cat all">
        <span className="cat-i">📦</span><b>{t('products')}</b><small>{lang === 'te' ? 'All Products' : 'అన్ని ఉత్పత్తులు'}</small><em>{products.length}</em>
      </Link>
    </div>
  );
}

export function Finder({ initial = '' }) {
  const { machines, t } = useApp();
  const nav = useNavigate();
  const start = machines.find((m) => m.id === initial);
  const [brand, setBrand] = useState(start?.brand || '');
  const [type, setType] = useState(start?.type || '');
  const [model, setModel] = useState(initial);
  const brands = [...new Set(machines.map((m) => m.brand))].sort();
  const ofBrand = machines.filter((m) => m.brand === brand);
  const types = [...new Set(ofBrand.map((m) => m.type).filter(Boolean))];
  const models = ofBrand.filter((m) => !type || m.type === type);
  if (!machines.length) return <p className="finder-empty">{t('noMachines')}</p>;
  return (
    <form className="finder-f" onSubmit={(e) => { e.preventDefault(); if (model) nav('/finder?m=' + model); }}>
      <label>{t('selBrand')}
        <select value={brand} onChange={(e) => { setBrand(e.target.value); setType(''); setModel(''); }}>
          <option value="">{t('choose')}</option>
          {brands.map((b) => <option key={b}>{b}</option>)}
        </select>
      </label>
      {types.length > 0 && (
        <label>{t('selType')}
          <select value={type} onChange={(e) => { setType(e.target.value); setModel(''); }}>
            <option value="">{t('choose')}</option>
            {types.map((x) => <option key={x}>{x}</option>)}
          </select>
        </label>
      )}
      <label>{t('selModel')}
        <select value={model} disabled={!brand} onChange={(e) => setModel(e.target.value)}>
          <option value="">{t('choose')}</option>
          {models.map((m) => <option key={m.id} value={m.id}>{m.model}</option>)}
        </select>
      </label>
      <button className="btn" disabled={!model}>{t('showParts')}</button>
    </form>
  );
}

export function Home() {
  const { products, machines, loaded, t } = useApp();
  const [selectedMachine, setSelectedMachine] = useState(null);
  const machineList = machines.filter(m => m.active !== false);

  const machineProducts = selectedMachine
    ? products.filter(p => p.compatibleMachines?.includes(selectedMachine.id))
    : [];

  return (
    <div className="wrap" style={{ paddingTop: 20 }}>
      <h2 className="sec">{t('finder')} (Machines)</h2>
      {!loaded ? <Loading /> : (
        <div className="cats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
          {machineList.map(m => (
            <button
              key={m.id}
              className="cat"
              onClick={() => setSelectedMachine(m)}
              style={{ border: selectedMachine?.id === m.id ? '3px solid #00337a' : '1.5px solid var(--line)', cursor: 'pointer', background: '#fff' }}
            >
              {m.imageUrl ? <img className="cat-img" src={m.imageUrl} alt="" style={{ width: 80, height: 80, objectFit: 'contain' }} /> : <span className="cat-i">🚜</span>}
              <b>{m.brand} {m.model}</b>
              <small>{m.type || 'Machine'}</small>
            </button>
          ))}
        </div>
      )}

      {selectedMachine && (
        <div style={{ marginTop: 30 }}>
          <h2 className="sec">Parts for {selectedMachine.brand} {selectedMachine.model}</h2>
          {machineProducts.length === 0 ? <p className="empty">{t('noParts')}</p> : <Grid list={machineProducts} />}
        </div>
      )}
    </div>
  );
}

export function CategoriesPage() {
  const { t } = useApp();
  return <div className="wrap"><h1>{t('categories')}</h1><CategoryCards /></div>;
}

export function ProductsPage() {
  const { products, categories, machines, loaded, lang, t } = useApp();
  const [sp, setSp] = useSearchParams();
  const g = (k) => sp.get(k) || '';
  const set = (k, v) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); n.delete('focus'); setSp(n, { replace: true }); };
  const inputRef = useRef(null);
  useEffect(() => { if (sp.get('focus')) inputRef.current?.focus(); }, [sp]);

  const brands = useMemo(() => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort(), [products]);
  const list = useMemo(() => {
    let l = g('q') ? searchProducts(products, categories, g('q')) : [...products];
    if (g('cat')) l = l.filter((p) => p.category === g('cat'));
    if (g('brand')) l = l.filter((p) => p.brand === g('brand'));
    if (g('sp')) { const s = g('sp').toLowerCase(); l = l.filter((p) => [p.size, p.productNumber, p.sku].join(' ').toLowerCase().includes(s)); }
    if (g('min') || g('max')) {
      const lo = g('min') ? +g('min') : 0, hi = g('max') ? +g('max') : Infinity;
      l = l.filter((p) => { const u = unitPrice(p); return u != null && u >= lo && u <= hi; });
    }
    if (g('stock')) l = l.filter((p) => stockInfo(p) !== 'out');
    if (g('machine')) l = l.filter((p) => p.compatibleMachines?.includes(g('machine')));
    const s = g('sort') || 'new';
    const price = (p, d) => unitPrice(p) ?? d;
    if (s === 'low') l.sort((a, b) => price(a, Infinity) - price(b, Infinity));
    else if (s === 'high') l.sort((a, b) => price(b, -1) - price(a, -1));
    else if (s === 'name') l.sort((a, b) => a.nameEnglish.localeCompare(b.nameEnglish));
    else l.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return l;
  }, [sp, products, categories]);

  const activeCat = categories.find((c) => c.id === g('cat'));
  return (
    <div className="wrap">
      <h1>{activeCat ? nameOf(activeCat, lang) : t('products')}</h1>
      <input ref={inputRef} className="bigsearch" value={g('q')} onChange={(e) => set('q', e.target.value)} placeholder={t('searchPh')} aria-label={t('search')} />
      <details className="filters" open={window.innerWidth > 800}>
        <summary>{t('filters')}</summary>
        <div className="fgrid">
          <label>{t('category')}<select value={g('cat')} onChange={(e) => set('cat', e.target.value)}>
            <option value="">{t('anyCat')}</option>{categories.map((c) => <option key={c.id} value={c.id}>{nameOf(c, lang)}</option>)}</select></label>
          <label>{t('brand')}<select value={g('brand')} onChange={(e) => set('brand', e.target.value)}>
            <option value="">{t('anyBrand')}</option>{brands.map((b) => <option key={b}>{b}</option>)}</select></label>
          <label>{t('sizeNo')}<input value={g('sp')} onChange={(e) => set('sp', e.target.value)} /></label>
          <label>{t('minP')}<input type="number" min="0" inputMode="numeric" value={g('min')} onChange={(e) => set('min', e.target.value)} /></label>
          <label>{t('maxP')}<input type="number" min="0" inputMode="numeric" value={g('max')} onChange={(e) => set('max', e.target.value)} /></label>
          <label>{t('finder')}<select value={g('machine')} onChange={(e) => set('machine', e.target.value)}>
            <option value="">{t('anyMachine')}</option>{machines.map((m) => <option key={m.id} value={m.id}>{m.brand} {m.model}</option>)}</select></label>
          <label>{t('sort')}<select value={g('sort') || 'new'} onChange={(e) => set('sort', e.target.value)}>
            <option value="new">{t('sortNew')}</option><option value="low">{t('sortLow')}</option>
            <option value="high">{t('sortHigh')}</option><option value="name">{t('sortName')}</option></select></label>
          <label className="chk"><input type="checkbox" checked={!!g('stock')} onChange={(e) => set('stock', e.target.checked ? '1' : '')} />{t('onlyStock')}</label>
          <button className="btn ghost" onClick={() => setSp({}, { replace: true })}>{t('reset')}</button>
        </div>
      </details>
      {!loaded ? <Loading /> : list.length ? <Grid list={list} /> : <p className="empty">{t('noResults')}</p>}
    </div>
  );
}

export function ProductPage() {
  const { id } = useParams();
  const { products, categories, machines, loaded, addToCart, lang, t } = useApp();
  const p = products.find((x) => x.id === id);
  const [qty, setQty] = useState(1);
  const [img, setImg] = useState(0);
  if (!loaded) return <div className="wrap"><Loading /></div>;
  if (!p) return <div className="wrap"><p className="empty">{t('notFound')}</p><p className="center"><Link to="/products" className="btn wide">{t('products')}</Link></p></div>;
  const cat = categories.find((c) => c.id === p.category);
  const fits = machines.filter((m) => p.compatibleMachines?.includes(m.id));
  const out = stockInfo(p) === 'out';
  const rows = [ [t('brand'), p.brand], [t('category'), cat && nameOf(cat, lang)], [t('size'), p.size], [t('number'), p.productNumber], ['SKU', p.sku] ].filter(([, v]) => v);

  return (
    <div className="wrap pd">
      <div className="pd-img">
        <div className="pd-main"><Photo p={p} index={img} /></div>
        {p.imageUrls?.length > 1 && (
          <div className="thumbs">{p.imageUrls.map((u, i) => (
            <button key={u} className={i === img ? 'on' : ''} onClick={() => setImg(i)}><img src={u} alt="" /></button>))}</div>
        )}
      </div>
      <div className="pd-b">
        <h1>{p.nameEnglish}</h1>
        <p className="te big">{p.nameTelugu}</p>

        {Capacitor.isNativePlatform() && (
          <button onClick={() => speakTelugu(`${p.nameEnglish}. ${p.nameTelugu}. Size ${p.size || p.productNumber}`)}
            style={{ background: '#f4b400', border: 'none', padding: '10px 16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '10px', color: '#1c2b36' }}>
            🔊 వినండి (Listen)
          </button>
        )}

        <PriceBlock p={p} big />
        <StockTag p={p} />
        <dl>{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
        {p.description && <><h3>{t('description')}</h3><p>{p.description}</p></>}
        {fits.length > 0 && <><h3>{t('compatible')}</h3><p>{fits.map((m) => `${m.brand} ${m.model}`).join(', ')}</p></>}
        <div className="buy">
          <Qty value={qty} onChange={setQty} max={maxQty(p)} />
          <button className="btn" disabled={out} onClick={() => addToCart(p, qty)}>{t('addToCart')}</button>
        </div>
      </div>
    </div>
  );
}

export function FinderPage() {
  const [sp] = useSearchParams();
  const m = sp.get('m') || '';
  const { products, machines, categories, loaded, lang, t } = useApp();
  const machine = machines.find((x) => x.id === m);
  const parts = machine ? products.filter((p) => p.compatibleMachines?.includes(machine.id)) : [];
  return (
    <div className="wrap">
      <section className="plate flat"><h1>{t('findTitle')}</h1>{loaded ? <Finder key={m} initial={m} /> : <Loading />}</section>
      {loaded && !machine && machines.length > 0 && <p className="empty">{t('pickMachine')}</p>}
      {machine && (
        <>
          <h2 className="sec">{t('partsFor')} {machine.brand} {machine.model}</h2>
          {parts.length === 0 && <p className="empty">{t('noParts')}</p>}
          {categories.map((c) => {
            const l = parts.filter((p) => p.category === c.id);
            return l.length ? <section key={c.id}><h3 className="sub">{c.icon} {nameOf(c, lang)}</h3><Grid list={l} /></section> : null;
          })}
        </>
      )}
    </div>
  );
}

// ---------------- CART + DRAFT BILL ----------------
const printPageStyle = (fmt) => {
  let el = document.getElementById('rs-page');
  if (!el) { el = document.createElement('style'); el.id = 'rs-page'; document.head.appendChild(el); }
  el.textContent =
    fmt === 'a4' ? '@page{size:A4;margin:6mm}'
    : fmt === 'a5' ? '@page{size:A5;margin:6mm}'
    : fmt === 'thermal110' ? '@page{size:110mm auto;margin:3mm}'
    : '@page{size:80mm auto;margin:2mm}';
};

export function CartPage() {
  const { lines, loaded, t, clearCart, flash } = useApp();
  const { settings } = useAdmin();
  const [view, setView] = useState('cart');
  const [printFmt, setPrintFmt] = useState('a4');
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const [draftLines, setDraftLines] = useState([]);
  const [dType, setDType] = useState('percent');
  const [dVal, setDVal] = useState('');

  // --- ZOOM POPUP STATE FOR PRICE EDIT ---
  const [zoomItem, setZoomItem] = useState(null);
  const [zoomValue, setZoomValue] = useState('');

  useEffect(() => {
    if (Capacitor.isNativePlatform() || window.innerWidth < 600) setPrintFmt('thermal');
  }, []);

  // --- SWIPE BACK HANDLING FOR BILL PREVIEW ---
  useEffect(() => {
    const handlePopState = () => { setView('cart'); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const openBillPreview = () => {
    setView('bill');
    window.history.pushState({ view: 'bill' }, '');
  };

  const closeBillPreview = () => {
    setView('cart');
    window.history.back();
  };
  // ---------------------------------------------

  useEffect(() => {
    if (view === 'bill') setDraftLines(JSON.parse(JSON.stringify(lines)));
  }, [view]);

  useEffect(() => {
    if (view === 'bill') {
      setDraft(buildDraftInvoice(draftLines, settings, { type: dType, value: Number(dVal) || 0 }));
    }
  }, [view, draftLines, settings, dType, dVal]);

  const updateDraftLine = (id, updates) => {
    setDraftLines(prev => prev.map(l => {
      if (l.product.id === id) {
        if ('customPrice' in updates) {
          const val = updates.customPrice;
          const num = val === '' ? 0 : Number(val);
          return { ...l, customPrice: val, amount: num * l.qty };
        }
        return { ...l, ...updates };
      }
      return l;
    }));
  };

  // --- ZOOM POPUP HANDLERS ---
  const openZoom = (item) => {
    setZoomItem(item);
    setZoomValue(item.unitPrice !== undefined && item.unitPrice !== '' ? String(item.unitPrice) : '');
  };

  const saveZoom = () => {
    if (zoomItem) {
      updateDraftLine(zoomItem.productId, { customPrice: zoomValue });
    }
    setZoomItem(null);
  };
  // ---------------------------

  const doPrint = () => {
    speakTelugu('ప్రింట్ చేస్తున్నాము');
    printPageStyle(printFmt);
    setTimeout(() => window.print(), 100);
  };

  // --- SAVE BILL TO FIREBASE (NO DUPLICATES, NO LARGE IMAGES) ---
  const saveBillToAdmin = async () => {
    if (saving || !draft) return;
    setSaving(true);
    speakTelugu('బిల్లు సేవ్ అవుతోంది');

    try {
      const cleanItems = draft.items.map(item => {
        const { billImageUrl, ...rest } = item;
        return rest;
      });

      const billRef = doc(db, 'invoices', draft.invoiceNo);
      const existing = await getDoc(billRef);
      const isUpdate = existing.exists();

      const payload = {
        ...draft,
        items: cleanItems,
        status: 'completed',
        createdAt: isUpdate ? existing.data().createdAt : serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(billRef, payload, { merge: true });

      if (isUpdate) {
        alert('Bill updated in Admin successfully!');
        speakTelugu('బిల్లు అప్‌డేట్ చేయబడింది');
      } else {
        alert('Bill saved to Admin successfully!');
        speakTelugu('బిల్లు విజయవంతంగా సేవ్ చేయబడింది');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to save bill: ' + err.message);
    }
    setSaving(false);
  };
  // ---------------------------------------------

  // --- NEW STABLE DOWNLOAD LOGIC ---
  const downloadFile = async (type) => {
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        if (type === 'pdf') {
          // NATIVE ANDROID PDF: Use the print dialog, user selects "Save as PDF"
          const { Printer } = await import('@capgo/capacitor-printer');
          await Printer.printWebView();
        } else {
          // NATIVE ANDROID IMAGE: Use FileSharer to save/share the image
          const { FileSharer } = await import('@capgo/capacitor-file-sharer');
          const [{ default: html2canvas }] = await Promise.all([import('html2canvas')]);
          const el = document.querySelector('.inv');
          if (!el) return;

          // Lower scale to prevent memory crash
          const canvas = await html2canvas(el, { scale: 0.8, backgroundColor: '#ffffff', useCORS: true });
          const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

          await FileSharer.share({
            filename: `${draft.invoiceNo}.jpg`,
            contentType: 'image/jpeg',
            base64Data: base64Data,
            title: 'Bill ' + draft.invoiceNo,
          });
        }
      } else {
        // WEB BROWSER FALLBACK
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
        const el = document.querySelector('.inv');
        if (!el) return;
        const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true });

        if (type === 'image') {
          const link = document.createElement('a');
          link.download = `${draft.invoiceNo}.jpg`;
          link.href = canvas.toDataURL('image/jpeg', 0.95);
          link.click();
        } else {
          const img = canvas.toDataURL('image/jpeg', 0.95);
          let doc, w;
          if (printFmt === 'a4') { w = 210; doc = new jsPDF({ unit: 'mm', format: 'a4' }); }
          else if (printFmt === 'a5') { w = 148; doc = new jsPDF({ unit: 'mm', format: 'a5' }); }
          else if (printFmt === 'thermal110') { w = 110; doc = new jsPDF({ unit: 'mm', format: [110, 200] }); }
          else { w = 80; doc = new jsPDF({ unit: 'mm', format: [80, 200] }); }

          const h = (canvas.height * w) / canvas.width;
          doc.addImage(img, 'JPEG', 0, 0, w, h);
          if (printFmt === 'a4') for (let off = 297; off < h; off += 297) { doc.addPage(); doc.addImage(img, 'JPEG', 0, -off, w, h); }
          if (printFmt === 'a5') for (let off = 210; off < h; off += 210) { doc.addPage(); doc.addImage(img, 'JPEG', 0, -off, w, h); }
          doc.save(`${draft.invoiceNo}-${printFmt}.pdf`);
        }
      }
    } catch (e) {
      console.error(e);
      alert('Could not download. Use the Print button and select "Save as PDF" instead.');
    }
    setBusy(false);
  };
  // ---------------------------------------------

  const sendWhatsApp = () => {
    speakTelugu('వాట్సాప్ తెరుస్తున్నాము');
    let phone = window.prompt("Enter customer's WhatsApp number:");
    if (!phone) return;

    let cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    if (cleanPhone.length < 10) return alert("Please enter a valid phone number.");

    let msg = `*${draft.shop.name}*\n${draft.shop.address || ''}\nPh: ${draft.shop.phone || ''}\n---------------------------------\n*Bill No:* ${draft.invoiceNo}\n*Date:* ${new Date().toLocaleDateString('en-IN')}\n---------------------------------\n\n`;

    draft.items.forEach((item, index) => {
      msg += `${index + 1}. *${item.nameEnglish}*${item.nameTelugu ? ` / ${item.nameTelugu}` : ''}\n`;
      msg += `   Qty: ${item.qty} x ₹${money2(item.unitPrice).replace('₹', '')} = *₹${money2(item.amount).replace('₹', '')}*\n\n`;
    });

    msg += `---------------------------------\nSubtotal: ₹${money2(draft.subtotal).replace('₹', '')}\n`;
    if (draft.discount > 0) msg += `Discount: -₹${money2(draft.discount).replace('₹', '')}\n`;
    msg += `*GRAND TOTAL: ₹${money2(draft.total).replace('₹', '')}*\n---------------------------------\n\nThank you!`;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  if (!loaded) return <div className="wrap narrow"><Loading /></div>;

  // -------- CART VIEW --------
  if (view === 'cart') {
    if (lines.length === 0) return (
      <div className="wrap narrow">
        <h1>{t('cart')}</h1>
        <p className="empty">{t('emptyCart')}</p>
        <p className="center"><Link to="/products" className="btn wide" onClick={() => speakTelugu('షాపింగ్ కొనసాగించండి')}>{t('continue')}</Link></p>
      </div>
    );
    return (
      <div className="wrap narrow">
        <div className="a-head">
          <h1>{t('cart')}</h1>
          {/* CLEAR CART BUTTON */}
          <button
            className="a-btn danger"
            onClick={() => {
              speakTelugu('కార్ట్ లోని అన్ని వస్తువులు తొలగించాలా?');
              setTimeout(() => {
                if (window.confirm("Are you sure you want to remove all items from the cart?")) {
                  speakTelugu('కార్ట్ లోని అన్ని వస్తువులు తొలగించబడ్డాయి');
                  clearCart();
                  flash('Cart cleared successfully!');
                }
              }, 500);
            }}
          >
            Clear Cart
          </button>
        </div>

        {lines.map((l) => <CartLine key={l.product.id} line={l} />)}

        <div className="cols" style={{ marginTop: 15 }}>
          <label>Discount
            <span className="row">
              <select value={dType} onChange={(e) => setDType(e.target.value)}>
                <option value="percent">%</option>
                <option value="amount">₹</option>
              </select>
              <input type="number" min="0" step="any" value={dVal} onChange={(e) => setDVal(e.target.value)} placeholder="0" />
            </span>
          </label>
        </div>

        <Totals />
        <p className="note">{t('cartNote')}</p>
        <div className="row" style={{ marginTop: 10 }}>
          <Link to="/products" className="btn ghost" onClick={() => speakTelugu('షాపింగ్ కొనసాగించండి')}>{t('continue')}</Link>
          <button
            className="btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => {
              speakTelugu('బిల్లు చూపిస్తున్నాము');
              setPrintFmt(Capacitor.isNativePlatform() || window.innerWidth < 600 ? 'thermal' : 'a5');
              openBillPreview();
            }}
          >
            VIEW BILL →
          </button>
        </div>
      </div>
    );
  }

  // -------- BILL PREVIEW VIEW --------
  if (!draft) return null;

  return (
    <div className="wrap">
      {/* ZOOM POPUP FOR PRICE EDITING */}
      {zoomItem && (
        <div className="zoom-overlay" onClick={() => setZoomItem(null)}>
          <div className="zoom-box" onClick={e => e.stopPropagation()}>
            <h2>Enter Price</h2>
            <p style={{ margin: 0, color: '#666' }}>{zoomItem.nameEnglish}</p>
            <input
              type="number"
              autoFocus
              value={zoomValue}
              onChange={(e) => setZoomValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && saveZoom()}
            />
            <button className="a-btn primary" onClick={saveZoom}>Save Price</button>
          </div>
        </div>
      )}

      <div className="no-print">
        <div className="a-head">
          <h1>Bill preview</h1>
          <button className="a-btn" onClick={() => { speakTelugu('వెనుకకు'); closeBillPreview(); }}>← Back to cart</button>
        </div>

        <div className="row" style={{ marginBottom: 8 }}>
          <div className="seg2">
            {[['a4', 'A4'], ['a5', 'A5'], ['thermal110', '110 mm'], ['thermal', '80 mm']].map(([f, l]) => (
              <button key={f} className={printFmt === f ? 'on' : ''} onClick={() => setPrintFmt(f)}>{l}</button>
            ))}
          </div>
          <button className="a-btn primary" onClick={doPrint}>🖨️ PRINT BILL</button>

          <button className="a-btn" disabled={saving} onClick={saveBillToAdmin} style={{ backgroundColor: '#00337a', color: '#fff', borderColor: '#00337a', fontWeight: 'bold' }}>
            {saving ? 'Saving...' : '💾 Save to Admin'}
          </button>

          <button className="a-btn" disabled={busy} onClick={() => downloadFile('pdf')}>{busy ? 'Wait…' : '⬇️ PDF'}</button>
          <button className="a-btn" disabled={busy} onClick={() => downloadFile('image')}>{busy ? 'Wait…' : '⬇️ Image'}</button>

          <button className="a-btn" style={{ backgroundColor: '#25D366', color: '#fff', borderColor: '#25D366', fontWeight: 'bold' }} onClick={sendWhatsApp}>Send WhatsApp</button>
          <button className="a-btn" onClick={() => { speakTelugu('మార్చండి'); closeBillPreview(); }}>Edit cart</button>
        </div>
      </div>

      <div className="inv-wrap">
        <Invoice
          inv={draft}
          format={printFmt}
          editable={true}
          onUpdateLine={updateDraftLine}
          onPriceClick={openZoom}
        />
      </div>
    </div>
  );
}

export function AdminLogin() {
  const { t, user, role } = useApp();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  if (user && role) return <Navigate to="/admin" replace />;
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true); setErr('');
    try { await signInWithEmailAndPassword(auth, email, pw); }
    catch { setErr('Wrong email or password.'); }
    setBusy(false);
  };
  return (
    <div className="login">
      <form onSubmit={submit}>
        <Logo size={48} /><h1>NEW SRI RAMA LATHE WORKS</h1><p>Admin sign in</p>
        <label>{t('email')}<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>{t('password')}<input type="password" required autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} /></label>
        {err && <p className="err" role="alert">{err}</p>}
        <button className="btn" disabled={busy}>{t('signIn')}</button>
      </form>
    </div>
  );
}

export function AdminGate({ children }) {
  const { user, role, authReady, logout, t } = useApp();
  if (!authReady) return <div className="login"><p>{t('loading')}</p></div>;
  if (!user) return <Navigate to="/admin/login" replace />;
  if (role !== 'owner' && role !== 'staff') {
    return <div className="login"><div><h1>{t('notAuth')}</h1><button className="btn" onClick={logout}>{t('signOut')}</button></div></div>;
  }
  return children;
}

export const NotFound = () => <div className="wrap"><p className="empty">Page not found.</p></div>;