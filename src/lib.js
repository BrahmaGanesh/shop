export const money = (n) => '₹' + Number(n).toLocaleString('en-IN');
export const unitPrice = (p) => p.sellingPrice ?? p.mrp ?? null;
export const stockInfo = (p) => {
  if (!p.stockEnabled) return null;
  const q = p.stockQuantity ?? 0;
  if (q <= 0) return 'out';
  if (p.lowStockThreshold != null && q <= p.lowStockThreshold) return 'low';
  return 'in';
};
export const maxQty = (p) => (p.stockEnabled ? Math.max(0, p.stockQuantity ?? 0) : 999);

// Matches English/Telugu name, brand, size, part number, SKU and category. Every word must match.
export function searchProducts(list, cats, q) {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const catText = Object.fromEntries(cats.map((c) => [c.id, `${c.nameEnglish} ${c.nameTelugu}`]));
  return list.filter((p) => {
    const hay = [p.nameEnglish, p.nameTelugu, p.brand, p.size, p.productNumber, p.sku, catText[p.category]]
      .join(' ')
      .toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}
export const money2 = (n) => '₹' + Number(n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
