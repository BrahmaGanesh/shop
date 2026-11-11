// src/billFromCart.js
import { calcBill, DEFAULT_SETTINGS } from '../functions/billing.js';
import { unitPrice } from './lib';

const draftNo = () => {
  // Local, human-readable draft id. NOT a real invoice number.
  const d = new Date();
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `DRAFT-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
};

/**
 * Build an invoice-shaped object from the current cart, using the shop settings
 * already loaded by the admin context. No writes, no Firestore, no Function call.
 *
 * `lines`   : [{ product, qty }] from useApp()
 * `settings`: settings object from useAdmin() (already merged with DEFAULT_SETTINGS)
 * `customer`: { name, phone } — optional; printed if provided
 */
export function buildDraftInvoice(lines, settings = DEFAULT_SETTINGS, customer = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const safeLines = lines.filter((l) => l.product && l.qty > 0);
  if (!safeLines.length) return null;

  const price = (p) => unitPrice(p) ?? 0;
  
  const items = safeLines.map(({ product: p, qty }) => {
    const up = price(p);
    return {
      productId: p.id,
      nameEnglish: p.nameEnglish || '',
      nameTelugu: p.nameTelugu || '',
      brand: p.brand || '',
      size: p.size || '',
      productNumber: p.productNumber || '',
      qty,
      unitPrice: up,
      mrp: p.mrp ?? null,
      amount: +(up * qty).toFixed(2),
      // No discount / tax is applied line-by-line here — calcBill below
      // distributes the whole-bill discount and tax across the lines.
      discount: 0,
      tax: 0,
      taxRate: 0,
      priceChanged: false,
      // bill-print image snapshot from the product (may be '')
      billImageUrl: p.billImageUrl || '',
    };
  });

  const calc = calcBill({
    lines: safeLines.map(({ product: p, qty }) => ({ qty, unitPrice: price(p), taxRate: p.taxRate ?? undefined })),
    discount: { type: 'amount', value: 0 },
    settings: s,
  });

  // Overwrite per-line discount / tax / amount with calcBill's authoritative values.
  items.forEach((it, i) => {
    const c = calc.lines[i];
    it.discount = c.discount;
    it.tax = c.tax;
    it.taxRate = c.taxRate;
    it.amount = c.amount;
  });

  const total = calc.total;
  return {
    invoiceNo: draftNo(),
    status: 'draft',
    createdAt: null,                                  // Invoice.jsx already handles null
    createdByEmail: '',
    shop: {
      name: s.shopName || 'NEW SRIRAMA ENGINEERING WORKS',
      address: s.address || 'Opp. Govt. Junior College, G.N.T. Road, Sullurpet - 524 121, Tirupati Dt. AP.',
      phone: s.phone || '9640254545',
      gstin: s.gstin || '',
      footerNote: s.footerNote || 'Thank you for your business!',
    },
    customer: { name: customer.name || '', phone: customer.phone || '' },
    items,
    subtotal: calc.subtotal,
    discount: calc.discount,
    discountInput: { type: 'amount', value: 0 },
    tax: calc.tax,
    taxMode: calc.taxMode,
    roundOff: calc.roundOff,
    total,
    paymentMethod: s.paymentMethods?.[0] || 'Cash',
    amountPaid: total,
    balanceDue: 0,
    change: 0,
    stockOverride: false,
  };
}