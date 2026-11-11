import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useAdmin } from './AdminShell';

const isLow = (p) => (p.stockQuantity ?? 0) <= 0 || (p.lowStockThreshold != null && (p.stockQuantity ?? 0) <= p.lowStockThreshold);

export default function StockAdmin() {
  const { products } = useAdmin();
  const [q, setQ] = useState('');
  const [hist, setHist] = useState([]);
  const [open, setOpen] = useState(null); // { id, mode, value, reason }
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => onSnapshot(query(collection(db, 'stockHistory'), orderBy('at', 'desc'), limit(100)), (s) => setHist(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => setMsg('Failed: ' + e.message)), []);
  const tracked = useMemo(() => products.filter((p) => p.stockEnabled && p.status !== 'archived'), [products]);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return tracked.filter((p) => w.every((x) => [p.nameEnglish, p.brand, p.size, p.productNumber].join(' ').toLowerCase().includes(x)));
  }, [tracked, q]);
  const low = tracked.filter(isLow);

  const apply = async () => {
    if (busy) return;
    const v = Number(open.value);
    if (open.value === '' || !Number.isInteger(v)) return setMsg('Failed: enter a whole number.');
    if (open.reason.trim().length < 3) return setMsg('Failed: please give a reason.');
    setBusy(true); setMsg('');
    try {
      const r = (await httpsCallable(functions, 'adjustStock')({ productId: open.id, mode: open.mode, value: v, reason: open.reason.trim() })).data;
      setMsg(`✓ Stock changed from ${r.previous} to ${r.new}.`); setOpen(null);
    } catch (e) { setMsg('Failed: ' + e.message); }
    setBusy(false);
  };
  return (
    <>
      <div className="a-head"><h1>Stock</h1></div>
      {msg && <p className={msg.startsWith('Failed') ? 'a-err' : 'a-ok'} role="status">{msg}</p>}
      {low.length > 0 && <div className="a-err"><b>Low or out of stock ({low.length}):</b> {low.map((p) => `${p.nameEnglish}${p.size ? ' ' + p.size : ''} (${p.stockQuantity ?? 0})`).join(', ')}</div>}
      <p className="a-note">Only products with stock tracking switched on appear here. Turn tracking on in the product editor. Bills reduce stock automatically.</p>
      <input className="bigsearch" placeholder="Search tracked products…" value={q} onChange={(e) => setQ(e.target.value)} />
      <ul className="a-list">
        {list.map((p) => (
          <li key={p.id}>
            <span className="grow"><b>{p.nameEnglish}</b> <small>{[p.brand, p.size || p.productNumber].filter(Boolean).join(' · ')}</small><br />
              <span className={isLow(p) ? 'warn' : ''}>In stock: <b>{p.stockQuantity ?? 0}</b></span> <small>· warn at {p.lowStockThreshold ?? '—'}</small></span>
            <button className="a-btn sm" onClick={() => { setMsg(''); setOpen({ id: p.id, mode: 'change', value: '', reason: '' }); }}>Adjust</button>
            {open?.id === p.id && (
              <div className="adj">
                <label>How<select value={open.mode} onChange={(e) => setOpen({ ...open, mode: e.target.value })}><option value="change">Add / remove (use − to remove)</option><option value="set">Set exact quantity</option></select></label>
                <label>{open.mode === 'set' ? 'New quantity' : 'Change by'}<input type="number" step="1" inputMode="numeric" value={open.value} onChange={(e) => setOpen({ ...open, value: e.target.value })} /></label>
                <label>Reason<input list="reasons" value={open.reason} onChange={(e) => setOpen({ ...open, reason: e.target.value })} /></label>
                <datalist id="reasons"><option value="Stock received" /><option value="Damaged / lost" /><option value="Counting correction" /><option value="Customer return" /></datalist>
                <div className="row"><button className="a-btn primary" disabled={busy} onClick={apply}>Save</button><button className="a-btn" onClick={() => setOpen(null)}>Cancel</button></div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!list.length && <p className="a-empty">No tracked products.</p>}
      <h2>Stock history</h2>
      <ul className="a-list">
        {hist.map((h) => (
          <li key={h.id}><span className="grow"><b>{h.productName}</b> · {h.type}<br /><small>{h.at?.toDate?.().toLocaleString('en-IN')} · {h.email} · {h.reason}</small></span>
            <span>{h.previous} → <b>{h.new}</b> <small>({h.change > 0 ? '+' : ''}{h.change})</small></span></li>
        ))}
      </ul>
      {!hist.length && <p className="a-empty">No stock movements yet.</p>}
    </>
  );
}
