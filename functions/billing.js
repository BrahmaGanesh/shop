// Shared billing math. Used by the Cloud Function (authoritative) and the POS screen (live preview).
// All arithmetic is done in integer paise to avoid floating-point errors.
export const DEFAULT_SETTINGS = {
  shopName: 'NEW SRI RAMA LATHE WORKS',
  address: 'Sullurpet – 524121, Andhra Pradesh',
  phone: '', gstin: '', invoicePrefix: 'RS-',
  taxEnabled: false, taxRate: 0, taxInclusive: false, roundOff: false,
  paymentMethods: ['Cash', 'UPI', 'Card', 'Credit'], footerNote: 'Thank you for your business!',
  staffCanEditPrice: false, staffMaxDiscountPercent: 10,
};
export const toPaise = (n) => Math.round(Number(n) * 100);

// lines: [{ qty, unitPrice (rupees), taxRate? }]   discount: { type: 'percent' | 'amount', value }
// Tax is applied ONLY when settings.taxEnabled is true. A product's own taxRate overrides the shop rate.
export function calcBill({ lines, discount, settings }) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  const amounts = lines.map((l) => toPaise(l.unitPrice) * l.qty);
  const subtotal = amounts.reduce((a, b) => a + b, 0);
  const dv = Number(discount?.value) || 0;
  let disc = 0;
  if (subtotal > 0 && dv > 0) disc = discount.type === 'percent' ? Math.round((subtotal * Math.min(100, dv)) / 100) : Math.min(subtotal, toPaise(dv));
  // Spread the discount over the lines so tax is calculated on what is actually charged.
  let left = disc;
  const shares = amounts.map((a, i) => {
    const d = i === amounts.length - 1 ? left : Math.min(a, Math.round((disc * a) / (subtotal || 1)));
    left -= d;
    return Math.max(0, Math.min(a, d));
  });
  let tax = 0, net = 0;
  const out = lines.map((l, i) => {
    const n = amounts[i] - shares[i];
    const rate = s.taxEnabled ? Number(l.taxRate ?? s.taxRate) || 0 : 0;
    const t = rate ? (s.taxInclusive ? n - Math.round((n * 100) / (100 + rate)) : Math.round((n * rate) / 100)) : 0;
    tax += t; net += n;
    return { amount: amounts[i] / 100, discount: shares[i] / 100, tax: t / 100, taxRate: rate };
  });
  const pre = s.taxEnabled && !s.taxInclusive ? net + tax : net;
  const total = s.roundOff ? Math.round(pre / 100) * 100 : pre;
  return {
    lines: out, subtotal: subtotal / 100, discount: disc / 100, tax: tax / 100, roundOff: (total - pre) / 100, total: total / 100,
    taxMode: !s.taxEnabled ? 'none' : s.taxInclusive ? 'inclusive' : 'exclusive',
  };
}