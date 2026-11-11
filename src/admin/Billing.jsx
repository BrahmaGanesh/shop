import { useMemo, useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db, functions } from '../firebase';
import { useApp } from '../context';
import { useAdmin } from './AdminShell';
import { Qty, StockTag } from '../components';
import { calcBill } from '../../functions/billing.js';
import { money, money2, searchProducts, stockInfo } from '../lib';
import InvoiceView from './Invoice';

const newId = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g, '');
const defPrice = (p) => p.sellingPrice ?? p.mrp ?? null;

export default function Billing() {
  const { products, categories, settings } = useAdmin();
  const { role } = useApp();
  const owner = role === 'owner';
  const [lines, setLines] = useState([]); // { id, qty, price }
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [dType, setDType] = useState('percent');
  const [dVal, setDVal] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState(settings.paymentMethods[0]);
  const [paid, setPaid] = useState('');
  const [touched, setTouched] = useState(false);
  const [override, setOverride] = useState(false);
  const [tab, setTab] = useState('items');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const rid = useRef(newId()); // same id is reused on retry, so a bill can never be created twice

  const active = useMemo(() => products.filter((p) => p.status === 'active'), [products]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const results = useMemo(() => {
    let l = q.trim() ? searchProducts(active, categories, q) : active;
    if (cat) l = l.filter((p) => p.category === cat);
    return l.slice(0, 40);
  }, [active, categories, q, cat]);
  const cap = (p) => (p.stockEnabled && !(owner && override) ? Math.max(0, p.stockQuantity ?? 0) : 100000);

  const add = (p) => setLines((ls) => {
    const c = cap(p), ex = ls.find((l) => l.id === p.id);
    if (ex) return ls.map((l) => (l.id === p.id ? { ...l, qty: Math.min(c, l.qty + 1) } : l));
    if (c < 1) return ls;
    return [...ls, { id: p.id, qty: 1, price: defPrice(p) == null ? '' : String(defPrice(p)) }];
  });
  const patch = (id, v) => setLines((ls) => ls.map((l) => (l.id === id ? { ...l, ...v } : l)));

  const rows = lines.map((l) => ({ l, p: byId.get(l.id) })).filter((r) => r.p);
  const priceOk = (r) => r.l.price !== '' && Number.isFinite(Number(r.l.price)) && Number(r.l.price) >= 0;
  const calc = calcBill({
    lines: rows.map((r) => ({ qty: r.l.qty, unitPrice: priceOk(r) ? Number(r.l.price) : 0, taxRate: r.p.taxRate ?? undefined })),
    discount: { type: dType, value: Number(dVal) || 0 }, settings,
  });
  const isCredit = method.toLowerCase() === 'credit';
  const paidNum = touched ? Number(paid || 0) : isCredit ? 0 : calc.total;
  const balance = Math.max(0, +(calc.total - paidNum).toFixed(2)), change = Math.max(0, +(paidNum - calc.total).toFixed(2));
  const canEditPrice = (p) => owner || settings.staffCanEditPrice || defPrice(p) == null;
  const discPct = calc.subtotal > 0 ? (calc.discount / calc.subtotal) * 100 : 0;
  const itemCount = rows.reduce((n, r) => n + r.l.qty, 0);

  const reset = () => {
    setLines([]); setQ(''); setDVal(''); setName(''); setPhone(''); setPaid(''); setTouched(false); setOverride(false);
    setMethod(settings.paymentMethods[0]); setTab('items'); setErr(''); setDone(null); rid.current = newId();
  };

  const submit = async () => {
    if (busy) return;
    setErr('');
    if (!rows.length) return setErr('Add at least one product.');
    if (rows.some((r) => !priceOk(r))) return setErr('Enter a valid price for every item.');
    if (!Number.isFinite(paidNum) || paidNum < 0) return setErr('Amount paid is not valid.');
    if (balance > 0 && !name.trim()) return setErr('Enter the customer name when the full amount is not paid.');
    if (!owner && discPct > Number(settings.staffMaxDiscountPercent) + 1e-9) return setErr(`Staff can give at most ${settings.staffMaxDiscountPercent}% discount.`);
    setBusy(true);
    try {
      const res = await httpsCallable(functions, 'createInvoice')({
        requestId: rid.current,
        items: rows.map((r) => { const price = Number(r.l.price), d = defPrice(r.p); return { productId: r.p.id, qty: r.l.qty, unitPrice: d == null || price !== d ? price : undefined }; }),
        discount: { type: dType, value: Number(dVal) || 0 }, customer: { name: name.trim(), phone: phone.trim() },
        paymentMethod: method, amountPaid: paidNum, override: owner && override,
      });
      const snap = await getDoc(doc(db, 'invoices', res.data.invoiceId));
      setDone({ id: snap.id, ...snap.data() });
    } catch (e) {
      setErr(['functions/unavailable', 'functions/internal', 'functions/deadline-exceeded'].includes(e.code)
        ? 'Could not reach the server, so the bill may or may not have been saved. Check Bills first. Pressing COMPLETE BILL again is safe: it cannot create a duplicate.'
        : e.message);
    }
    setBusy(false);
  };

  if (done) return <InvoiceView inv={done} onNew={reset} />;
  return (
    <>
      <div className="a-head"><h1>New bill</h1></div>
      <div className="pos-tabs no-print">
        <button className={tab === 'items' ? 'on' : ''} onClick={() => setTab('items')}>1. Products</button>
        <button className={tab === 'bill' ? 'on' : ''} onClick={() => setTab('bill')}>2. Bill ({itemCount})</button>
      </div>
      <div className="pos">
        <section className={'pos-col ' + (tab === 'items' ? '' : 'hide-m')}>
          <input className="bigsearch" placeholder="Search name, brand, size, part no…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="chips">
            <button className={!cat ? 'on' : ''} onClick={() => setCat('')}>All</button>
            {categories.map((c) => <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.nameEnglish}</button>)}
          </div>
          <ul className="pick">
            {results.map((p) => {
              const out = stockInfo(p) === 'out' && !(owner && override);
              return (
                <li key={p.id}>
                  <div className="grow"><b>{p.nameEnglish}</b> <span className="te">{p.nameTelugu}</span><br />
                    <small>{[p.brand, p.size || p.productNumber].filter(Boolean).join(' · ')} · {defPrice(p) == null ? 'No price' : money(defPrice(p))}</small> <StockTag p={p} /></div>
                  <button className="a-btn primary" disabled={out} onClick={() => { add(p); }}>+ Add</button>
                </li>
              );
            })}
            {!results.length && <p className="a-empty">No products found.</p>}
          </ul>
        </section>

        <section className={'pos-col bill ' + (tab === 'bill' ? '' : 'hide-m')}>
          {rows.length === 0 && <p className="a-empty">No items yet. Add products from the list.</p>}
          {rows.map(({ l, p }) => (
            <div key={l.id} className="bline">
              <div className="grow"><b>{p.nameEnglish}</b><br /><small>{[p.size, p.productNumber].filter(Boolean).join(' / ')}{p.stockEnabled ? ` · stock ${p.stockQuantity ?? 0}` : ''}</small></div>
              <label className="rate">Rate ₹<input type="number" inputMode="decimal" min="0" step="any" value={l.price} disabled={!canEditPrice(p)}
                className={l.price === '' ? 'need' : ''} onChange={(e) => patch(l.id, { price: e.target.value })} /></label>
              <Qty value={l.qty} max={cap(p)} onChange={(n) => patch(l.id, { qty: n })} />
              <b className="amt">{money2((priceOk({ l, p }) ? Number(l.price) : 0) * l.qty)}</b>
              <button className="link" onClick={() => setLines((ls) => ls.filter((x) => x.id !== l.id))} aria-label="Remove">✕</button>
            </div>
          ))}
          <div className="cols">
            <label>Discount<span className="row"><select value={dType} onChange={(e) => setDType(e.target.value)}><option value="percent">%</option><option value="amount">₹</option></select>
              <input type="number" inputMode="decimal" min="0" step="any" value={dVal} onChange={(e) => setDVal(e.target.value)} /></span></label>
            <label>Payment method<select value={method} onChange={(e) => { setMethod(e.target.value); setTouched(false); }}>{settings.paymentMethods.map((m) => <option key={m}>{m}</option>)}</select></label>
            <label>Customer name (optional)<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Phone (optional)<input type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></label>
            <label>Amount paid ₹<input type="number" inputMode="decimal" min="0" step="any" value={touched ? paid : String(paidNum)} onChange={(e) => { setTouched(true); setPaid(e.target.value); }} /></label>
          </div>
          {!owner && <small>Staff discount limit: {settings.staffMaxDiscountPercent}%.</small>}
          {owner && <label className="chk"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Owner override: allow selling more than the stock available</label>}
          <div className="inv-tot live">
            <p><span>Subtotal</span><span>{money2(calc.subtotal)}</span></p>
            {calc.discount > 0 && <p><span>Discount</span><span>− {money2(calc.discount)}</span></p>}
            {calc.taxMode !== 'none' && <p><span>Tax{calc.taxMode === 'inclusive' ? ' (included)' : ''}</span><span>{money2(calc.tax)}</span></p>}
            {calc.roundOff !== 0 && <p><span>Round off</span><span>{money2(calc.roundOff)}</span></p>}
            <p className="gt"><span>Total payable</span><span>{money2(calc.total)}</span></p>
            {balance > 0 && <p className="due"><span>Balance due</span><span>{money2(balance)}</span></p>}
            {change > 0 && <p><span>Change to return</span><span>{money2(change)}</span></p>}
          </div>
          {err && <p className="a-err" role="alert">{err}</p>}
          <button className="a-btn primary big" disabled={busy || !rows.length} onClick={submit}>{busy ? 'Saving bill… please wait' : 'COMPLETE BILL'}</button>
        </section>
      </div>
      {tab === 'items' && rows.length > 0 && <div className="pos-bar no-print"><span>{itemCount} item(s) · <b>{money2(calc.total)}</b></span><button className="a-btn primary" onClick={() => setTab('bill')}>View bill →</button></div>}
    </>
  );
}
