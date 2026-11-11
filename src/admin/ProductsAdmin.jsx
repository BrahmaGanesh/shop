import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { arrayRemove, deleteDoc, doc, updateDoc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAdmin } from './AdminShell';
import { commitOps, deleteImage, logActivity } from './adminlib';
import { money } from '../lib';

const LABEL = { active: 'Active', inactive: 'Inactive', archived: 'Archived' };

export default function ProductsAdmin() {
  const { products, categories } = useAdmin();
  const [sp, setSp] = useSearchParams();
  const [q, setQ] = useState('');
  const [limit, setLimit] = useState(100);
  const [sel, setSel] = useState(new Set());
  const [bulkCat, setBulkCat] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const status = sp.get('status') || 'live'; // live = active + inactive
  const cat = sp.get('cat') || '';
  const catName = (id) => categories.find((c) => c.id === id)?.nameEnglish || id || '—';

  const list = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      if (status === 'live' ? p.status === 'archived' : status !== 'all' && p.status !== status) return false;
      if (cat && p.category !== cat) return false;
      const hay = [p.nameEnglish, p.nameTelugu, p.brand, p.size, p.productNumber, p.sku, p.id].join(' ').toLowerCase();
      return words.every((w) => hay.includes(w));
    });
  }, [products, q, status, cat]);
  const shown = list.slice(0, limit);
  const setParam = (k, v) => { const n = new URLSearchParams(sp); v ? n.set(k, v) : n.delete(k); setSp(n, { replace: true }); setSel(new Set()); };
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allOn = shown.length > 0 && shown.every((p) => sel.has(p.id));

  const run = async (fn, okMsg) => {
    if (busy) return;
    setBusy(true); setMsg('');
    try { await fn(); setMsg(okMsg); } catch (e) { setMsg('Failed: ' + e.message); }
    setBusy(false);
  };
  const setStatus = (p, s) => run(async () => {
    const b = writeBatch(db);
    b.update(doc(db, 'products', p.id), { status: s, updatedAt: serverTimestamp() });
    logActivity(b, `product.${s}`, { id: p.id, name: p.nameEnglish });
    await b.commit();
  }, `${p.nameEnglish}: now ${LABEL[s].toLowerCase()}.`);
  const remove = (p) => {
    if (!window.confirm(`Permanently delete "${p.nameEnglish}"?\n\nThis cannot be undone. Past bills will keep their own copy of the product details.`)) return;
    run(async () => {
      await deleteDoc(doc(db, 'products', p.id));
      await deleteDoc(doc(db, 'productsPrivate', p.id)).catch(() => {});
      await Promise.all((p.imagePaths || []).map(deleteImage));
      const b = writeBatch(db); logActivity(b, 'product.delete', { id: p.id, name: p.nameEnglish }); await b.commit();
    }, `${p.nameEnglish} deleted.`);
  };
  const bulk = (label, patch) => {
    const ids = [...sel];
    if (!ids.length || !window.confirm(`${label} for ${ids.length} product(s)?`)) return;
    run(async () => {
      await commitOps([
        ...ids.map((id) => (b) => b.update(doc(db, 'products', id), { ...patch, updatedAt: serverTimestamp() })),
        (b) => logActivity(b, 'product.bulk', { label, patch, count: ids.length, ids: ids.slice(0, 50) }),
      ]);
      setSel(new Set());
    }, `${label}: ${ids.length} product(s) updated.`);
  };
  const duplicate = (p) => `/admin/products/new?from=${encodeURIComponent(p.id)}`;

  return (
    <>
      <div className="a-head">
        <h1>Products <small>({list.length})</small></h1>
        <Link className="a-btn primary" to="/admin/products/new">+ Add new product</Link>
      </div>
      <div className="a-filters">
        <input placeholder="Search name, brand, size, SKU, ID…" value={q} onChange={(e) => { setQ(e.target.value); setLimit(100); }} />
        <select value={status} onChange={(e) => setParam('status', e.target.value)} aria-label="Status">
          <option value="live">Active + inactive</option><option value="active">Active only</option>
          <option value="inactive">Inactive only</option><option value="archived">Archived</option><option value="all">Everything</option>
        </select>
        <select value={cat} onChange={(e) => setParam('cat', e.target.value)} aria-label="Category">
          <option value="">All categories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.nameEnglish}</option>)}
        </select>
      </div>
      {msg && <p className={msg.startsWith('Failed') ? 'a-err' : 'a-ok'} role="status">{msg}</p>}
      {sel.size > 0 && (
        <div className="a-bulk">
          <b>{sel.size} selected</b>
          <button className="a-btn" disabled={busy} onClick={() => bulk('Activate', { status: 'active' })}>Activate</button>
          <button className="a-btn" disabled={busy} onClick={() => bulk('Deactivate', { status: 'inactive' })}>Deactivate</button>
          <button className="a-btn" disabled={busy} onClick={() => bulk('Archive', { status: 'archived' })}>Archive</button>
          <select value={bulkCat} onChange={(e) => setBulkCat(e.target.value)} aria-label="New category">
            <option value="">Change category to…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.nameEnglish}</option>)}
          </select>
          <button className="a-btn" disabled={busy || !bulkCat} onClick={() => bulk(`Move to ${catName(bulkCat)}`, { category: bulkCat })}>Apply</button>
        </div>
      )}
      <table className="a-table">
        <thead><tr>
          <th><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((p) => p.id)))} aria-label="Select all" /></th>
          <th>Image</th><th>Product</th><th>Brand</th><th>Category</th><th>Size</th><th>MRP</th><th>Selling</th><th>Stock</th><th>Status</th><th>Actions</th>
        </tr></thead>
        <tbody>
          {shown.map((p) => (
            <tr key={p.id} className={sel.has(p.id) ? 'sel' : ''}>
              <td data-label=""><input type="checkbox" checked={sel.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.nameEnglish}`} /></td>
              <td data-label="Image">{p.imageUrls?.[0] ? <img className="thumb" src={p.imageUrls[0]} alt="" /> : <span className="thumb none">—</span>}</td>
              <td data-label="Product"><Link to={`/admin/products/${p.id}/edit`}><b>{p.nameEnglish}</b></Link><br /><span className="te">{p.nameTelugu}</span></td>
              <td data-label="Brand">{p.brand || '—'}</td>
              <td data-label="Category">{catName(p.category)}</td>
              <td data-label="Size">{p.size || p.productNumber || '—'}</td>
              <td data-label="MRP">{p.mrp != null ? money(p.mrp) : '—'}</td>
              <td data-label="Selling">{p.sellingPrice != null ? money(p.sellingPrice) : '—'}</td>
              <td data-label="Stock">{p.stockEnabled ? <span className={(p.stockQuantity ?? 0) <= (p.lowStockThreshold ?? 0) ? 'warn' : ''}>{p.stockQuantity ?? 0}</span> : 'Not tracked'}</td>
              <td data-label="Status"><span className={'pill ' + p.status}>{LABEL[p.status] || p.status}</span></td>
              <td data-label="Actions">
                <details className="menu"><summary>Actions ▾</summary>
                  <div>
                    <Link to={`/admin/products/${p.id}/edit`}>Edit</Link>
                    <Link to={duplicate(p)}>Duplicate</Link>
                    {p.status === 'active' && <button onClick={() => setStatus(p, 'inactive')}>Deactivate</button>}
                    {p.status === 'inactive' && <button onClick={() => setStatus(p, 'active')}>Activate</button>}
                    {p.status !== 'archived' && <button onClick={() => setStatus(p, 'archived')}>Archive</button>}
                    {p.status === 'archived' && <><button onClick={() => setStatus(p, 'inactive')}>Restore</button><button className="danger" onClick={() => remove(p)}>Delete permanently</button></>}
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {list.length === 0 && <p className="a-empty">No products match.</p>}
      {list.length > limit && <p className="center"><button className="a-btn" onClick={() => setLimit(limit + 100)}>Show more ({list.length - limit} left)</button></p>}
    </>
  );
}
