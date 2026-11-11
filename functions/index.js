import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { DEFAULT_SETTINGS, calcBill } from './billing.js';

initializeApp();
const db = getFirestore();
const opts = { region: 'asia-south1', maxInstances: 5 };
const fail = (code, msg) => { throw new HttpsError(code, msg); };
const text = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const r2 = (n) => Math.round(n * 100) / 100;

async function caller(req, roles) {
  if (!req.auth) fail('unauthenticated', 'Please sign in.');
  const u = await db.doc(`users/${req.auth.uid}`).get();
  const role = u.exists ? u.data().role : null;
  if (!roles.includes(role)) fail('permission-denied', 'You do not have permission to do this.');
  return { uid: req.auth.uid, email: req.auth.token.email || '', role };
}

// Creates a bill. Prices, totals, invoice number and stock are all decided here, inside one transaction.
export const createInvoice = onCall(opts, async (req) => {
  const { uid, email, role } = await caller(req, ['owner', 'staff']);
  const d = req.data || {};
  const requestId = typeof d.requestId === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(d.requestId) ? d.requestId : fail('invalid-argument', 'Missing request id.');
  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > 200) fail('invalid-argument', 'A bill needs 1 to 200 items.');
  const ids = new Set();
  const items = d.items.map((i) => {
    const productId = text(i?.productId, 200);
    if (!productId || ids.has(productId)) fail('invalid-argument', 'Each product may appear only once on a bill.');
    ids.add(productId);
    if (!Number.isInteger(i.qty) || i.qty < 1 || i.qty > 100000) fail('invalid-argument', 'Quantity must be a whole number of 1 or more.');
    if (i.unitPrice != null && (typeof i.unitPrice !== 'number' || !Number.isFinite(i.unitPrice) || i.unitPrice < 0 || i.unitPrice > 10000000)) fail('invalid-argument', 'Invalid price.');
    return { productId, qty: i.qty, unitPrice: i.unitPrice == null ? null : r2(i.unitPrice) };
  });
  const disc = d.discount && Number(d.discount.value) > 0
    ? { type: d.discount.type === 'percent' ? 'percent' : 'amount', value: Number(d.discount.value) } : { type: 'amount', value: 0 };
  if (!Number.isFinite(disc.value) || disc.value < 0) fail('invalid-argument', 'Invalid discount.');
  const customer = { name: text(d.customer?.name, 100), phone: text(d.customer?.phone, 20) };
  if (customer.phone && !/^[0-9+\-\s]{5,20}$/.test(customer.phone)) fail('invalid-argument', 'Invalid phone number.');
  const paid = d.amountPaid == null ? null : Number(d.amountPaid);
  if (paid != null && (!Number.isFinite(paid) || paid < 0 || paid > 1e9)) fail('invalid-argument', 'Invalid amount paid.');
  const override = d.override === true && role === 'owner';

  return db.runTransaction(async (tx) => {
    const reqRef = db.doc(`idempotency/${requestId}`);
    const [done, setSnap, ctr, ...prods] = await Promise.all([
      tx.get(reqRef), tx.get(db.doc('settings/shop')), tx.get(db.doc('counters/invoice')),
      ...items.map((i) => tx.get(db.doc(`products/${i.productId}`))),
    ]);
    if (done.exists) return done.data().result; // same request sent twice (e.g. bad network): return the original bill
    const settings = { ...DEFAULT_SETTINGS, ...(setSnap.data() || {}) };
    const method = settings.paymentMethods.find((m) => m.toLowerCase() === text(d.paymentMethod, 40).toLowerCase());
    if (!method) fail('invalid-argument', 'Choose a valid payment method.');

    const lines = items.map((i, k) => {
      const ps = prods[k];
      if (!ps.exists || ps.data().status !== 'active') fail('failed-precondition', 'A product on this bill is no longer available. Refresh and try again.');
      const p = ps.data();
      const dbPrice = p.sellingPrice ?? p.mrp ?? null;
      let unit = dbPrice;
      if (dbPrice == null) { if (i.unitPrice == null) fail('invalid-argument', `Enter a price for ${p.nameEnglish}.`); unit = i.unitPrice; }
      else if (i.unitPrice != null && Math.abs(i.unitPrice - dbPrice) > 0.001) {
        if (role !== 'owner' && !settings.staffCanEditPrice) fail('permission-denied', `You cannot change the price of ${p.nameEnglish}.`);
        unit = i.unitPrice;
      }
      let short = false;
      if (p.stockEnabled) {
        const have = p.stockQuantity ?? 0;
        if (i.qty > have) { if (!override) fail('failed-precondition', `Only ${have} of ${p.nameEnglish} in stock.`); short = true; }
      }
      return { ref: ps.ref, p, qty: i.qty, unit, dbPrice, short };
    });

    const calc = calcBill({ lines: lines.map((l) => ({ qty: l.qty, unitPrice: l.unit, taxRate: l.p.taxRate ?? undefined })), discount: disc, settings });
    if (role !== 'owner' && calc.subtotal > 0 && (calc.discount / calc.subtotal) * 100 > Number(settings.staffMaxDiscountPercent) + 1e-9) {
      fail('permission-denied', `Staff can give at most ${settings.staffMaxDiscountPercent}% discount.`);
    }
    const amountPaid = r2(paid == null ? calc.total : paid);
    const balanceDue = r2(Math.max(0, calc.total - amountPaid)), change = r2(Math.max(0, amountPaid - calc.total));
    if (balanceDue > 0 && !customer.name) fail('invalid-argument', 'Customer name is required when the full amount is not paid.');

    const next = ctr.exists ? ctr.data().next : 1;
    const invoiceNo = `${settings.invoicePrefix}${String(next).padStart(6, '0')}`;
    const invRef = db.collection('invoices').doc();
    const day = new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10); // India date, for reports
    tx.set(invRef, {
      invoiceNo, status: 'completed', createdAt: FieldValue.serverTimestamp(), day, createdBy: uid, createdByEmail: email, createdByRole: role,
      shop: { name: settings.shopName, address: settings.address, phone: settings.phone, gstin: settings.gstin, footerNote: settings.footerNote },
      customer,
      items: lines.map((l, k) => ({
        productId: items[k].productId, nameEnglish: l.p.nameEnglish, nameTelugu: l.p.nameTelugu || '', brand: l.p.brand || '',
        size: l.p.size || '', productNumber: l.p.productNumber || '', qty: l.qty, unitPrice: l.unit, mrp: l.p.mrp ?? null,
        amount: calc.lines[k].amount, discount: calc.lines[k].discount, tax: calc.lines[k].tax, taxRate: calc.lines[k].taxRate,
        priceChanged: l.dbPrice != null && l.unit !== l.dbPrice,
        billImageUrl: l.p.billImageUrl || '',   // NEW — snapshot the bill-print image (Base64 string or '')
      })),
      subtotal: calc.subtotal, discount: calc.discount, discountInput: disc, tax: calc.tax, taxMode: calc.taxMode, roundOff: calc.roundOff, total: calc.total,
      paymentMethod: method, amountPaid, balanceDue, change, stockOverride: lines.some((l) => l.short),
    });
    tx.set(db.doc('counters/invoice'), { next: next + 1 });
    lines.forEach((l, k) => {
      if (!l.p.stockEnabled) return; // stock tracking off: no restrictions, no changes
      const prev = l.p.stockQuantity ?? 0, now = Math.max(0, prev - l.qty);
      tx.update(l.ref, { stockQuantity: now, updatedAt: FieldValue.serverTimestamp() });
      tx.set(db.collection('stockHistory').doc(), {
        productId: items[k].productId, productName: l.p.nameEnglish, type: 'sale', previous: prev, new: now, change: now - prev,
        reason: `Sale ${invoiceNo}${l.short ? ' (stock override)' : ''}`, invoiceId: invRef.id, uid, email, at: FieldValue.serverTimestamp(),
      });
    });
    const result = { invoiceId: invRef.id, invoiceNo };
    tx.set(reqRef, { result, at: FieldValue.serverTimestamp() });
    return result;
  });
});

// Owner-only manual stock correction, always recorded with a reason.
export const adjustStock = onCall(opts, async (req) => {
  const { uid, email } = await caller(req, ['owner']);
  const d = req.data || {};
  const productId = text(d.productId, 200), reason = text(d.reason, 200);
  if (!productId) fail('invalid-argument', 'Missing product.');
  if (reason.length < 3) fail('invalid-argument', 'Please give a reason.');
  if (!['set', 'change'].includes(d.mode) || !Number.isInteger(d.value)) fail('invalid-argument', 'Enter a whole number.');
  return db.runTransaction(async (tx) => {
    const ref = db.doc(`products/${productId}`), s = await tx.get(ref);
    if (!s.exists) fail('not-found', 'Product not found.');
    const p = s.data();
    if (!p.stockEnabled) fail('failed-precondition', 'Stock tracking is off for this product.');
    const prev = p.stockQuantity ?? 0, now = d.mode === 'set' ? d.value : prev + d.value;
    if (now < 0 || now > 1e9) fail('invalid-argument', 'Stock cannot go below 0.');
    tx.update(ref, { stockQuantity: now, updatedAt: FieldValue.serverTimestamp() });
    tx.set(db.collection('stockHistory').doc(), { productId, productName: p.nameEnglish, type: 'adjustment', previous: prev, new: now, change: now - prev, reason, uid, email, at: FieldValue.serverTimestamp() });
    return { previous: prev, new: now };
  });
});