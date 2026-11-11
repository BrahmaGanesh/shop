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
 * `lines`   : [{ product, qty, customPrice }] from useApp()
 * `settings`: settings object from useAdmin() (already merged with DEFAULT_SETTINGS)
 * `discount`: { type: 'percent' | 'amount', value: Number } from the cart
 */
export function buildDraftInvoice(lines, settings = DEFAULT_SETTINGS, discount = { type: 'amount', value: 0 }, customer = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const safeLines = lines.filter((l) => l.product && l.qty > 0);
  if (!safeLines.length) return null;

  // If a custom price was set for this cart line, use it. Otherwise fallback to the default price.
  const price = (l) => (l.customPrice !== undefined && l.customPrice !== '') ? Number(l.customPrice) : (unitPrice(l.product) ?? 0);
  
  const items = safeLines.map((l) => {
    const p = l.product;
    const up = price(l);
    return {
      productId: p.id,
      nameEnglish: p.nameEnglish || '',
      nameTelugu: p.nameTelugu || '',
      brand: p.brand || '',
      size: p.size || '',
      productNumber: p.productNumber || '',
      qty: l.qty,
      unitPrice: up,
      mrp: p.mrp ?? null,
      amount: +(up * l.qty).toFixed(2),
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
    lines: safeLines.map((l) => ({ qty: l.qty, unitPrice: price(l), taxRate: l.product.taxRate ?? undefined })),
    discount: discount, // PASS THE CUSTOM DISCOUNT HERE
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
    discountInput: discount, // Show the discount label on the bill
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