import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAdmin } from './AdminShell';
import ImagePicker from './ImagePicker';
import { deleteImage, logActivity, num, slug, str } from './adminlib';

const BLANK = {
  id: '', nameEnglish: '', nameTelugu: '', brand: '', category: '', size: '', productNumber: '', sku: '', description: '',
  mrp: '', sellingPrice: '', purchasePrice: '', discountPercent: '', taxRate: '',
  stockEnabled: false, stockQuantity: '', lowStockThreshold: '',
  status: 'active', featured: false, popular: false, compatibleMachines: [],
  billImageUrl: '', billImagePath: '',
};
const TEXT = ['nameEnglish', 'nameTelugu', 'brand', 'category', 'size', 'productNumber', 'sku', 'description'];
const NUMS = ['mrp', 'sellingPrice', 'discountPercent', 'taxRate', 'stockQuantity', 'lowStockThreshold'];

export default function ProductForm() {
  const { id: editId } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const { products, categories, machines } = useAdmin();
  const isNew = !editId;
  const original = products.find((p) => p.id === editId);
  const [f, setF] = useState(BLANK);
  const [images, setImages] = useState([]);
  const [billImg, setBillImg] = useState([]);            // [{url, path}] — one bill-print image
  const [idTouched, setIdTouched] = useState(false);
  const [errors, setErrors] = useState([]);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(isNew && !sp.get('from'));
  const added = useRef([]);      // uploaded in this session
  const removed = useRef([]);    // removed in this session
  const base = useRef(null);     // last saved values, for change log
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  // Load existing product (and its owner-only purchase price) or a copy source.
  useEffect(() => {
    const srcId = editId || sp.get('from');
    if (!srcId || ready) return;
    const src = products.find((p) => p.id === srcId);
    if (!src) return;
    (async () => {
      let purchase = '';
      try { const s = await getDoc(doc(db, 'productsPrivate', srcId)); purchase = str(s.data()?.purchasePrice); } catch { /* none */ }
      const next = { ...BLANK };
      TEXT.forEach((k) => { next[k] = str(src[k]); });
      NUMS.forEach((k) => { next[k] = str(src[k]); });
      Object.assign(next, {
        purchasePrice: purchase, stockEnabled: !!src.stockEnabled, status: src.status || 'active',
        featured: !!src.featured, popular: !!src.popular, compatibleMachines: src.compatibleMachines || [],
        id: editId ? src.id : '',
        billImageUrl: str(src.billImageUrl), billImagePath: str(src.billImagePath),
      });
      if (!editId) {
        next.nameEnglish = `${src.nameEnglish} (copy)`;
        next.id = slug(`${next.nameEnglish}-${next.size || next.productNumber}`);
      } else {
        setImages((src.imageUrls || []).map((url, i) => ({ url, path: src.imagePaths?.[i] || '' })));
        setBillImg(src.billImageUrl ? [{ url: src.billImageUrl, path: src.billImagePath || '' }] : []);
      }
      setF(next); base.current = next; setReady(true);
    })();
  }, [products, editId, sp, ready]);

  // Suggest a stable ID from the name and size until the owner types their own.
  useEffect(() => {
    if (isNew && !idTouched && !sp.get('from')) set('id', slug(`${f.nameEnglish}-${f.size || f.productNumber}`));
  }, [f.nameEnglish, f.size, f.productNumber]); // eslint-disable-line

  const byBrand = useMemo(() => machines.reduce((a, m) => ({ ...a, [m.brand]: [...(a[m.brand] || []), m] }), {}), [machines]);
  const toggleMachine = (id) => set('compatibleMachines', f.compatibleMachines.includes(id) ? f.compatibleMachines.filter((x) => x !== id) : [...f.compatibleMachines, id]);

  const validate = async () => {
    const e = [];
    if (!f.nameEnglish.trim()) e.push('English product name is required.');
    if (!f.category) e.push('Choose a category.');
    if (isNew) {
      if (!/^[a-z0-9][a-z0-9._-]*$/.test(f.id)) e.push('Product ID may use only lowercase letters, numbers, dots, dashes and underscores.');
      else if ((await getDoc(doc(db, 'products', f.id))).exists()) e.push(`Product ID "${f.id}" is already used.`);
    }
    NUMS.forEach((k) => { if (f[k] !== '' && (!Number.isFinite(Number(f[k])) || Number(f[k]) < 0)) e.push(`${k} must be a number, 0 or more.`); });
    if (f.purchasePrice !== '' && (!Number.isFinite(Number(f.purchasePrice)) || Number(f.purchasePrice) < 0)) e.push('Purchase price must be a number, 0 or more.');
    ['stockQuantity', 'lowStockThreshold'].forEach((k) => { if (f[k] !== '' && !Number.isInteger(Number(f[k]))) e.push(`${k} must be a whole number.`); });
    if (f.mrp !== '' && f.sellingPrice !== '' && Number(f.sellingPrice) > Number(f.mrp)) e.push('Selling price cannot be higher than MRP.');
    return e;
  };

  const save = async (ev) => {
    ev.preventDefault();
    if (saving) return;
    setSaving(true); setMsg('');
    try {
      const e = await validate();
      setErrors(e);
      if (e.length) { window.scrollTo(0, 0); setSaving(false); return; }
      const pid = isNew ? f.id : editId;
      const data = {
        nameEnglish: f.nameEnglish.trim(), nameTelugu: f.nameTelugu.trim(), brand: f.brand.trim(), category: f.category,
        size: f.size.trim(), productNumber: f.productNumber.trim(), sku: f.sku.trim(), description: f.description.trim(),
        mrp: num(f.mrp), sellingPrice: num(f.sellingPrice), discountPercent: num(f.discountPercent), taxRate: num(f.taxRate),
        stockEnabled: f.stockEnabled, stockQuantity: f.stockEnabled ? num(f.stockQuantity) ?? 0 : num(f.stockQuantity), lowStockThreshold: num(f.lowStockThreshold),
        imageUrls: images.map((i) => i.url), imagePaths: images.map((i) => i.path),
        billImageUrl: billImg[0]?.url || '', billImagePath: billImg[0]?.path || '',
        compatibleMachines: f.compatibleMachines, status: f.status, featured: f.featured, popular: f.popular,
        updatedAt: serverTimestamp(),
      };
      if (!isNew) { if (original.stockQuantity == null && data.stockEnabled) data.stockQuantity = 0; else delete data.stockQuantity; } // never overwrite live stock from a stale form
      const changes = {};
      if (base.current) {
        [...TEXT, ...NUMS, 'stockEnabled', 'status', 'featured', 'popular', 'purchasePrice', 'billImageUrl'].forEach((k) => {
          if (str(base.current[k]) !== str(f[k])) changes[k] = [str(base.current[k]).slice(0, 40), k === 'purchasePrice' ? '(changed)' : str(f[k]).slice(0, 40)];
        });
        if (base.current.compatibleMachines.join() !== f.compatibleMachines.join()) changes.compatibleMachines = [base.current.compatibleMachines.length, f.compatibleMachines.length];
        // bill image change is visible from the record itself (billImageUrl), so also note it here for the activity log
        if (str(base.current.billImageUrl) !== str(f.billImageUrl)) changes.billImageUrl = ['(changed)', '(changed)'];
      }
      const b = writeBatch(db);
      if (isNew) b.set(doc(db, 'products', pid), { ...data, createdAt: serverTimestamp() });
      else b.update(doc(db, 'products', pid), data); // ID, createdAt and everything not on this form are preserved
      b.set(doc(db, 'productsPrivate', pid), { purchasePrice: num(f.purchasePrice) }, { merge: true });
      logActivity(b, isNew ? 'product.create' : 'product.update', { id: pid, name: data.nameEnglish, changes });
      await b.commit();
      await Promise.all([...removed.current, ...added.current.filter((a) => !images.some((i) => i.path === a.path)).map((a) => a.path)].map(deleteImage));
      removed.current = []; added.current = []; base.current = { ...f };
      if (isNew) nav(`/admin/products/${pid}/edit`, { replace: true, state: { saved: true } });
      else setMsg('✓ Changes saved. The shop is already showing the update.');
    } catch (x) {
      setMsg('Could not save: ' + (x.code === 'permission-denied' ? 'you do not have permission.' : x.message));
    }
    setSaving(false);
  };

  const cancel = async () => { await Promise.all(added.current.map((i) => deleteImage(i.path))); nav('/admin/products'); };
  const archive = async () => {
    if (!window.confirm('Archive this product? It disappears from the shop but can be restored. Permanent deletion is done from the Archived list.')) return;
    const b = writeBatch(db);
    b.update(doc(db, 'products', editId), { status: 'archived', updatedAt: serverTimestamp() });
    logActivity(b, 'product.archived', { id: editId, name: f.nameEnglish });
    await b.commit(); nav('/admin/products');
  };
  const onImages = (list) => {
    removed.current.push(...images.filter((i) => !list.some((n) => n.url === i.url) && i.path && !added.current.some((a) => a.path === i.path)).map((i) => i.path));
    setImages(list);
  };

  if (!isNew && !original) return <p className="a-empty">Product not found. <Link to="/admin/products">Back to products</Link></p>;
  if (!ready) return <p className="a-empty">Loading…</p>;
  const T = (k, label, props = {}) => <label>{label}<input value={f[k]} onChange={(e) => set(k, e.target.value)} {...props} /></label>;
  const N = (k, label, props = {}) => T(k, label, { type: 'number', min: 0, inputMode: 'decimal', step: 'any', ...props });
  return (
    <form onSubmit={save} className="a-form">
      <div className="a-head"><h1>{isNew ? 'Add new product' : 'Edit product'}</h1>{!isNew && <small>ID: {editId}</small>}</div>
      {errors.length > 0 && <div className="a-err" role="alert"><b>Please fix:</b><ul>{errors.map((e) => <li key={e}>{e}</li>)}</ul></div>}
      {msg && <p className={msg.startsWith('✓') ? 'a-ok' : 'a-err'} role="status">{msg}</p>}

      <fieldset><legend>Basic details</legend>
        <div className="cols">
          {isNew && <label>Product ID (cannot be changed later)<input value={f.id} onChange={(e) => { setIdTouched(true); set('id', e.target.value.toLowerCase()); }} /></label>}
          {T('nameEnglish', 'English product name *')}
          {T('nameTelugu', 'Telugu product name', { lang: 'te' })}
          {T('brand', 'Company / brand')}
          <label>Category *<select value={f.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">Choose…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.nameEnglish} – {c.nameTelugu}</option>)}</select></label>
          {T('size', 'Size')}{T('productNumber', 'Product / model number')}{T('sku', 'SKU / internal part code')}
        </div>
        <label>Description<textarea rows="3" value={f.description} onChange={(e) => set('description', e.target.value)} /></label>
      </fieldset>

      <fieldset><legend>Pricing (₹)</legend>
        <div className="cols">
          {N('mrp', 'MRP')}{N('sellingPrice', 'Selling price')}
          {N('purchasePrice', 'Purchase price (private – never shown to customers)')}
          {N('discountPercent', 'Discount % (optional)')}{N('taxRate', 'Tax % (leave empty if none)')}
        </div>
        <small>Leave MRP and selling price empty to show “Price Not Added”. Customers see the selling price if set, otherwise the MRP.</small>
      </fieldset>

      <fieldset><legend>Photos (shop)</legend>
        <ImagePicker images={images} onChange={onImages} onAdded={(a) => added.current.push(...a)} folder="products" id={isNew ? f.id : editId} />
        <small>The first photo is the main one. Phone photos are resized automatically.</small>
      </fieldset>

      {/* NEW: bill-print image — separate from the shop photos above */}
      <fieldset><legend>Bill print image (only used on the printed bill)</legend>
        <ImagePicker multiple={false} images={billImg} onChange={setBillImg} folder="products-bill" id={isNew ? f.id : editId} />
        <small>Optional. Used only in bill preview and A4 / A5 / thermal output. It is never used on the shop product card, and the shop photo is never substituted here. Leave empty to print without an image.</small>
      </fieldset>

      <fieldset><legend>Stock</legend>
        <label className="chk"><input type="checkbox" checked={f.stockEnabled} onChange={(e) => set('stockEnabled', e.target.checked)} /> Track stock for this product</label>
        {f.stockEnabled && <div className="cols">{N('stockQuantity', isNew ? 'Opening stock quantity' : 'Current stock quantity (change it in Stock → Adjust)', { step: 1, disabled: !isNew })}{N('lowStockThreshold', 'Low-stock warning at', { step: 1 })}</div>}
        <small>Bills reduce stock automatically. To correct the quantity later, use Stock → Adjust, which keeps a history.</small>
      </fieldset>

      <fieldset><legend>Compatible rotavator machines</legend>
        {machines.length === 0 && <p>No machines yet. <Link to="/admin/machines">Add machines</Link></p>}
        {Object.entries(byBrand).map(([brand, list]) => (
          <div key={brand} className="mach"><b>{brand}</b>
            {list.map((m) => <label key={m.id} className="chk"><input type="checkbox" checked={f.compatibleMachines.includes(m.id)} onChange={() => toggleMachine(m.id)} /> {m.model}{m.type ? ` (${m.type})` : ''}</label>)}
          </div>
        ))}
      </fieldset>

      <fieldset><legend>Display</legend>
        <label>Status<select value={f.status} onChange={(e) => set('status', e.target.value)}>
          <option value="active">Active (visible in shop)</option><option value="inactive">Inactive (hidden)</option><option value="archived">Archived (hidden, recoverable)</option></select></label>
        <label className="chk"><input type="checkbox" checked={f.featured} onChange={(e) => set('featured', e.target.checked)} /> Featured (shown first on Home)</label>
        <label className="chk"><input type="checkbox" checked={f.popular} onChange={(e) => set('popular', e.target.checked)} /> Popular product</label>
      </fieldset>

      <div className="a-bar">
        <button className="a-btn primary" disabled={saving}>{saving ? 'Saving…' : 'SAVE CHANGES'}</button>
        <button type="button" className="a-btn" onClick={cancel} disabled={saving}>CANCEL</button>
        {!isNew && <button type="button" className="a-btn danger" onClick={archive} disabled={saving}>DELETE PRODUCT</button>}
      </div>
    </form>
  );
}