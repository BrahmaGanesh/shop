import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from './firebase';
import { useApp } from './context';
import { useAdmin } from './admin/AdminShell';
import { Invoice } from './admin/Invoice';
import { buildDraftInvoice } from './billFromCart';
import { CartLine, Grid, Loading, Logo, Photo, PriceBlock, ProductCard, Qty, StockTag, Totals } from './components';
import { maxQty, searchProducts, stockInfo, unitPrice } from './lib';

const nameOf = (c, lang) => (lang === 'te' && c.nameTelugu ? c.nameTelugu : c.nameEnglish);

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
  const { products, loaded, t } = useApp();
  const shown = useMemo(
    () => [...products].sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 15),
    [products],
  );
  return (
    <>
      <section className="hero">
        <div className="wrap hero-in">
          <div className="hero-t"><Logo size={56} /><h1>NEW SRI RAMA LATHE WORKS</h1></div>
          <div className="plate">
            <h2>{t('findTitle')}</h2>
            {loaded ? <Finder /> : <p>{t('loading')}</p>}
          </div>
        </div>
      </section>
      <div className="wrap">
        <h2 className="sec">{t('categories')}</h2>
        <CategoryCards />
        <h2 className="sec">{t('latest')}</h2>
        {loaded ? (shown.length ? <Grid list={shown} /> : <p className="empty">{t('noResults')}</p>) : <Loading />}
        <p className="center"><Link to="/products" className="btn wide">{t('viewAll')}</Link></p>
      </div>
    </>
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
  }, [sp, products, categories]); // eslint-disable-line

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
  const rows = [
    [t('brand'), p.brand], [t('category'), cat && nameOf(cat, lang)], [t('size'), p.size], [t('number'), p.productNumber], ['SKU', p.sku],
  ].filter(([, v]) => v);
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
    fmt === 'a4' ? '@page{size:A4;margin:8mm}' :
    fmt === 'a5' ? '@page{size:A5;margin:6mm}' :
    fmt === 'thermal110' ? '@page{size:110mm auto;margin:3mm}' :
    '@page{size:80mm auto;margin:2mm}';
};

export function CartPage() {
  const { lines, loaded, t } = useApp();
  const { settings } = useAdmin();              // provided by SettingsBridge in App.jsx
  const [view, setView] = useState('cart');     // 'cart' | 'bill'
  const [printFmt, setPrintFmt] = useState('a5');
  const [draft, setDraft] = useState(null);

  // Rebuild the draft whenever the cart or settings change while previewing,
  // so the totals on screen are always exactly the live cart total.
  useEffect(() => {
    if (view !== 'bill') return;
    setDraft(buildDraftInvoice(lines, settings));
  }, [view, lines, settings]);

  // Leaving the preview back to the cart clears the draft.
  useEffect(() => {
    if (view === 'cart') setDraft(null);
  }, [view]);

  const doPrint = () => { printPageStyle(printFmt); setTimeout(() => window.print(), 100); };

  if (!loaded) return <div className="wrap narrow"><Loading /></div>;

  // -------- CART --------
  if (view === 'cart') {
    if (lines.length === 0) return (
      <div className="wrap narrow">
        <h1>{t('cart')}</h1>
        <p className="empty">{t('emptyCart')}</p>
        <p className="center"><Link to="/products" className="btn wide">{t('continue')}</Link></p>
      </div>
    );
    return (
      <div className="wrap narrow">
        <h1>{t('cart')}</h1>
        {lines.map((l) => <CartLine key={l.product.id} line={l} />)}
        <Totals />
        <p className="note">{t('cartNote')}</p>
        <div className="row" style={{ marginTop: 10 }}>
          <Link to="/products" className="btn ghost">{t('continue')}</Link>
          <button
            className="btn"
            style={{ marginLeft: 'auto' }}
            onClick={() => { setPrintFmt('a5'); setView('bill'); window.scrollTo(0, 0); }}
          >
            VIEW BILL →
          </button>
        </div>
      </div>
    );
  }

  // -------- BILL PREVIEW --------
  if (!draft) {
    return (
      <div className="wrap narrow">
        <p className="empty">{t('emptyCart')}</p>
        <p className="center"><button className="btn ghost" onClick={() => setView('cart')}>← Back to cart</button></p>
      </div>
    );
  }

  return (
    <div className="wrap">
      <div className="no-print">
        <div className="a-head">
          <h1>Bill preview</h1>
          <button className="a-btn" onClick={() => setView('cart')}>← Back to cart</button>
        </div>
        <p className="note">
          This is a <b>draft bill</b> for checking. Show it at the counter — the shop will issue the final invoice with the official bill number when you pay.
        </p>
        <div className="row" style={{ marginBottom: 8 }}>
          <div className="seg2">
            {[['a4', 'A4'], ['a5', 'A5'], ['thermal110', '110 mm'], ['thermal', '80 mm']].map(([f, l]) => (
              <button key={f} className={printFmt === f ? 'on' : ''} onClick={() => setPrintFmt(f)}>{l}</button>
            ))}
          </div>
          <button className="a-btn primary" onClick={doPrint}>🖨️ PRINT BILL</button>
          <button className="a-btn" onClick={() => setView('cart')}>Edit cart</button>
        </div>
      </div>

      <div className="inv-wrap">
        <Invoice inv={draft} format={printFmt} />
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