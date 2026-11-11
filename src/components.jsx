import { useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useApp } from './context';
import { maxQty, money, searchProducts, stockInfo, unitPrice } from './lib';

import logoImg from './assets/logo.png';

export function Logo({ size = 34 }) {
  // If you want it to be a perfect circle, keep borderRadius: '50%'. 
  // If you want the original square/rectangle shape, remove borderRadius.
  return (
    <img 
      src={logoImg} 
      alt="Logo" 
      width={size} 
      height={size} 
      style={{ objectFit: 'contain', borderRadius: '8px' }} 
    />
  );
}

const CartIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="9" cy="20" r="1.5" /><circle cx="18" cy="20" r="1.5" /><path d="M2 3h3l2.5 11.5a1 1 0 0 0 1 .8h9.2a1 1 0 0 0 1-.8L21 7H6" />
  </svg>
);

function SearchBox() {
  const { products, categories, t } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const sugg = useMemo(() => (q.trim() ? searchProducts(products, categories, q).slice(0, 6) : []), [q, products, categories]);
  return (
    <form className="sb" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { nav('/products?q=' + encodeURIComponent(q.trim())); setOpen(false); } }}>
      <input value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={t('searchPh')} aria-label={t('search')} />
      <button type="submit" className="sb-go">{t('search')}</button>
      {open && sugg.length > 0 && (
        <ul className="sugg">
          {sugg.map((p) => (
            <li key={p.id}>
              <button type="button" onMouseDown={() => { nav('/product/' + p.id); setQ(''); setOpen(false); }}>
                <b>{p.nameEnglish}</b> <span className="te">{p.nameTelugu}</span>
                <small>{[p.brand, p.size || p.productNumber].filter(Boolean).join(' · ')}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

export function Header() {
  const { t, lang, setLang, totals, setDrawer } = useApp();
  return (
    <header className="hd">
      <div className="hd-in">
        <Link to="/" className="brand"><Logo /><span>NEW SRI RAMA LATHE WORKS</span></Link>
        <nav className="nav">
          <NavLink to="/" end>{t('home')}</NavLink>
          <NavLink to="/products">{t('products')}</NavLink>
          <NavLink to="/categories">{t('categories')}</NavLink>
          <NavLink to="/finder">{t('finder')}</NavLink>
          <NavLink to="/cart">{t('cart')}</NavLink>
        </nav>
        <div className="seg" role="group" aria-label="Language">
          <button className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          <button className={lang === 'te' ? 'on' : ''} onClick={() => setLang('te')}>తెలుగు</button>
        </div>
        <button className="cartbtn" onClick={() => setDrawer(true)} aria-label={`${t('cart')} (${totals.qty})`}>
          <CartIcon /><b>{totals.qty}</b>
        </button>
        <SearchBox />
      </div>
    </header>
  );
}

export function BottomNav() {
  const { t, totals, setDrawer } = useApp();
  return (
    <nav className="bn">
      <NavLink to="/" end><i>🏠</i>{t('home')}</NavLink>
      <NavLink to="/categories"><i>▦</i>{t('categories')}</NavLink>
      <NavLink to="/products?focus=1"><i>🔍</i>{t('search')}</NavLink>
      <button onClick={() => setDrawer(true)}><i>🛒{totals.qty > 0 && <em>{totals.qty}</em>}</i>{t('cart')}</button>
    </nav>
  );
}

export function Toast() {
  const { toast } = useApp();
  return toast ? <div className="toast" role="status">{toast}</div> : null;
}

export function Photo({ p, index = 0 }) {
  const { categories, t } = useApp();
  const url = p.imageUrls?.[index];
  if (url) return <img src={url} alt={p.nameEnglish} loading="lazy" />;
  const icon = categories.find((c) => c.id === p.category)?.icon || '⚙️';
  return <div className="ph"><span>{icon}</span><small>{t('noPhoto')}</small></div>;
}

export function PriceBlock({ p, big }) {
  const { t } = useApp();
  const sell = p.sellingPrice, mrp = p.mrp;
  if (sell == null && mrp == null) return <p className="price none">{t('notAdded')}</p>;
  if (sell != null && mrp != null && sell < mrp) {
    return (
      <p className={'price' + (big ? ' big' : '')}>
        <b>{t('price')}: {money(sell)}</b> <s>{t('mrp')}: {money(mrp)}</s>
      </p>
    );
  }
  return <p className={'price' + (big ? ' big' : '')}><b>{mrp != null ? `${t('mrp')}: ${money(mrp)}` : `${t('price')}: ${money(sell)}`}</b></p>;
}

export function StockTag({ p }) {
  const { t } = useApp();
  const s = stockInfo(p);
  if (!s) return null;
  const txt = s === 'out' ? t('outStock') : s === 'low' ? `${t('lowStock')} (${t('onlyLeft')} ${p.stockQuantity} ${t('left')})` : t('inStock');
  return <span className={'tag ' + s}>{txt}</span>;
}

export function ProductCard({ p }) {
  const { t, addToCart, items, setQty, removeItem } = useApp();
  const out = stockInfo(p) === 'out';
  const sizeText = [p.size, p.productNumber].filter(Boolean).join(' / ');
  
  // Check if this product is already in the cart
  const cartItem = items.find((i) => i.id === p.id);
  const cartQty = cartItem ? cartItem.qty : 0;

  return (
    <article className="card">
      <Link to={`/product/${p.id}`} className="card-img"><Photo p={p} /></Link>
      <div className="card-b">
        <h3><Link to={`/product/${p.id}`}>{p.nameEnglish}</Link></h3>
        <p className="te">{p.nameTelugu}</p>
        {p.brand && <p className="meta">{t('brand')}: {p.brand}</p>}
        {sizeText && <p className="meta">{t('size')}: {sizeText}</p>}
        <PriceBlock p={p} />
        <StockTag p={p} />
        
        {cartQty > 0 ? (
          <div className="qty" style={{ marginTop: 'auto', width: '100%', justifyContent: 'space-between' }}>
            <button 
              onClick={() => cartQty === 1 ? removeItem(p.id) : setQty(p.id, cartQty - 1)} 
              aria-label="−"
            >
              −
            </button>
            <span>{cartQty}</span>
            <button onClick={() => setQty(p.id, cartQty + 1)} disabled={cartQty >= maxQty(p)} aria-label="+">+</button>
          </div>
        ) : (
          <button className="btn" disabled={out} onClick={() => addToCart(p)}>{t('addToCart')}</button>
        )}
      </div>
    </article>
  );
}

export function Grid({ list }) {
  return <div className="grid">{list.map((p) => <ProductCard key={p.id} p={p} />)}</div>;
}

export function Qty({ value, onChange, max = 999 }) {
  return (
    <div className="qty">
      <button type="button" onClick={() => onChange(Math.max(1, value - 1))} aria-label="−">−</button>
      <span>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label="+">+</button>
    </div>
  );
}

export function CartLine({ line }) {
  const { t, setQty, removeItem } = useApp();
  const { product: p, qty, customPrice } = line;
  
  // Use the custom price if the user typed one, otherwise use the default
  const u = customPrice !== undefined && customPrice !== '' ? Number(customPrice) : unitPrice(p);

  return (
    <div className="line">
      <div className="line-img"><Photo p={p} /></div>
      <div className="line-b">
        <Link to={`/product/${p.id}`}><b>{p.nameEnglish}</b></Link>
        <span className="te">{p.nameTelugu}</span>
        <small>{[p.size, p.productNumber].filter(Boolean).join(' / ')}</small>
        <small>{u == null ? t('notAdded') : `${money(u)} × ${qty} = ${money(u * qty)}`}</small>
        <div className="line-act">
          <Qty value={qty} onChange={(n) => setQty(p.id, n)} max={maxQty(p)} />
          <button className="link" onClick={() => removeItem(p.id)}>{t('remove')}</button>
        </div>
      </div>
    </div>
  );
}

export function Totals() {
  const { t, totals } = useApp();
  return (
    <div className="totals">
      <p><span>{t('totalQty')}</span><b>{totals.qty}</b></p>
      <p><span>{t('subtotal')}</span><b>{money(totals.subtotal)}</b></p>
      <p className="gt"><span>{t('grand')}</span><b>{money(totals.subtotal)}</b></p>
      {totals.unpriced > 0 && <small>{t('unpricedNote')}</small>}
    </div>
  );
}

export function CartDrawer() {
  const { drawer, setDrawer, lines, t } = useApp();
  if (!drawer) return null;
  const close = () => setDrawer(false);
  return (
    <div className="overlay" onClick={close}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('cart')}>
        <div className="drawer-h"><h2>{t('cart')}</h2><button onClick={close} aria-label="Close">✕</button></div>
        <div className="drawer-b">
          {lines.length ? lines.map((l) => <CartLine key={l.product.id} line={l} />) : <p className="empty">{t('emptyCart')}</p>}
        </div>
        <div className="drawer-f">
          {lines.length > 0 && <Totals />}
          <Link to="/cart" className="btn" onClick={close}>{t('viewFullCart')}</Link>
          <button className="btn ghost" onClick={close}>{t('continue')}</button>
        </div>
      </aside>
    </div>
  );
}

export function Loading() {
  const { t, error } = useApp();
  return <p className="empty">{error ? t('loadErr') : t('loading')}</p>;
}