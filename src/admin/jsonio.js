// Pure logic for JSON export / validation / import planning. No Firebase imports, so it is easy to test.
export const SCHEMA_VERSION = 1;
const ID_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const TEXT = ['nameEnglish', 'nameTelugu', 'brand', 'size', 'productNumber', 'sku', 'description'];
const NUM = ['mrp', 'sellingPrice', 'discountPercent', 'taxRate'];
const INT = ['stockQuantity', 'lowStockThreshold'];
const BOOL = ['stockEnabled', 'active', 'archived', 'featured', 'popular'];
export const ORDER = ['id', 'nameEnglish', 'nameTelugu', 'brand', 'category', 'size', 'productNumber', 'sku', 'mrp', 'sellingPrice',
  'discountPercent', 'taxRate', 'stockEnabled', 'stockQuantity', 'lowStockThreshold', 'description', 'compatibleMachines', 'imageUrls',
  'active', 'archived', 'featured', 'popular'];
export const FIELD_GROUPS = [
  ['Names', ['nameEnglish', 'nameTelugu']], ['Company', ['brand']], ['Category', ['category']],
  ['Size and numbers', ['size', 'productNumber', 'sku']], ['Description', ['description']],
  ['Prices', ['mrp', 'sellingPrice', 'discountPercent', 'taxRate']],
  ['Stock (off by default so stock is never overwritten by accident)', ['stockEnabled', 'stockQuantity', 'lowStockThreshold']],
  ['Machine compatibility', ['compatibleMachines']], ['Photos (Base64 data URL or https link)', ['imageUrls']],
  ['Visibility', ['active', 'archived']], ['Display flags', ['featured', 'popular']],
];
export const STOCK_FIELDS = ['stockEnabled', 'stockQuantity', 'lowStockThreshold'];
export const DEFAULT_FIELDS = ORDER.filter((f) => f !== 'id' && !STOCK_FIELDS.includes(f));
const ALL = new Set(ORDER.filter((f) => f !== 'id'));

const DEFAULTS = {
  nameTelugu: '', brand: '', size: '', productNumber: '', sku: '', description: '', mrp: null, sellingPrice: null, discountPercent: null, taxRate: null,
  stockEnabled: false, stockQuantity: null, lowStockThreshold: null, compatibleMachines: [], imageUrls: [], imagePaths: [],
  status: 'active', featured: false, popular: false,
};

// ---------- image URL helpers (Base64 in Firestore, optional legacy https) ----------
// A product document must stay under Firestore's 1 MiB limit. Base64 image data
// lives inside `imageUrls`. We allow a generous per-image ceiling here so
// legitimate uploads round-trip, but reject absurd payloads that would blow up
// the document on import.
const IMAGE_URL_MAX_LEN = 400_000; // ~300 KB raw bytes per image after base64 expansion
const DATA_URL_RE = /^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/]+=*$/i;
const HTTPS_URL_RE = /^https:\/\/\S+$/i;
const isValidImageUrl = (u) =>
  typeof u === 'string' &&
  u.length > 0 &&
  u.length <= IMAGE_URL_MAX_LEN &&
  (DATA_URL_RE.test(u) || HTTPS_URL_RE.test(u));

// ---------- export
export function toExport(p, cats, machines) {
  const cat = cats.find((c) => c.id === p.category);
  return {
    id: p.id, nameEnglish: p.nameEnglish ?? '', nameTelugu: p.nameTelugu ?? '', brand: p.brand ?? '', category: cat ? cat.nameEnglish : p.category ?? '',
    size: p.size ?? '', productNumber: p.productNumber ?? '', sku: p.sku ?? '', mrp: p.mrp ?? null, sellingPrice: p.sellingPrice ?? null,
    discountPercent: p.discountPercent ?? null, taxRate: p.taxRate ?? null, stockEnabled: !!p.stockEnabled, stockQuantity: p.stockQuantity ?? null,
    lowStockThreshold: p.lowStockThreshold ?? null, description: p.description ?? '',
    compatibleMachines: (p.compatibleMachines || []).filter((id) => machines.some((m) => m.id === id)),
    imageUrls: p.imageUrls || [], active: p.status === 'active', archived: p.status === 'archived', featured: !!p.featured, popular: !!p.popular,
  };
}
const refs = (cats, machines) => ({
  _note: 'Reference lists only. Importing does not create categories or machines; create them in the Admin Panel first.',
  categories: cats.map((c) => c.nameEnglish),
  machines: machines.map((m) => ({ id: m.id, name: `${m.brand} ${m.model}` })),
});
export function buildExport(list, cats, machines) {
  return { schemaVersion: SCHEMA_VERSION, currency: 'INR', exportedAt: new Date().toISOString(),
    _imageNote: 'imageUrls contains the image bytes themselves as data:image/<type>;base64,… URLs (stored inside the product document in Firestore). Old https:// links from before the Base64 migration also pass through unchanged. Keep the strings as-is to keep the photos; edit them in the product editor otherwise.',
    reference: refs(cats, machines), products: list.map((p) => toExport(p, cats, machines)) };
}
export function buildTemplate(cats, machines) {
  return { schemaVersion: SCHEMA_VERSION, currency: 'INR',
    _readme: [
      'Fill in or edit products below, save the file, then use Admin > Data > Import.',
      'id: unique and stable. Existing products are matched by id, never by name. Use lowercase letters, numbers, dots, dashes, underscores.',
      'category: must match an existing category name. compatibleMachines: machine ids from the reference list.',
      'Prices are plain numbers (no currency symbol). Use null for "not set". Omit a field to leave it unchanged on existing products.',
      'active: true/false. archived: true hides the product but keeps it recoverable.',
      'imageUrls: a list of https:// links OR data:image/(jpeg|jpg|png|webp);base64,… strings. Each entry ≤ ~300 KB. Prefer editing photos in the product editor rather than pasting Base64 by hand.',
      'Delete the example product before importing.',
    ],
    reference: refs(cats, machines),
    products: [{ id: 'example-product-id', nameEnglish: 'Example Product', nameTelugu: '', brand: '', category: '', size: '', productNumber: '', sku: '',
      mrp: null, sellingPrice: null, discountPercent: null, taxRate: null, stockEnabled: false, stockQuantity: null, lowStockThreshold: null,
      description: '', compatibleMachines: [], imageUrls: [], active: true, archived: false, featured: false, popular: false }] };
}

// ---------- validation (file + each record)
const bad = (s) => /^[=@]/.test(s) || /<\s*script|javascript:/i.test(s);
function lookup(cats, machines) {
  const c = new Map(); const m = new Map();
  const put = (map, key, id) => { key = key.toLowerCase().trim(); if (!key) return; map.set(key, map.has(key) && map.get(key) !== id ? null : id); };
  cats.forEach((x) => { put(c, x.id, x.id); put(c, x.nameEnglish || '', x.id); put(c, x.nameTelugu || '', x.id); });
  machines.forEach((x) => { put(m, x.id, x.id); put(m, `${x.brand} ${x.model}`, x.id); });
  return { c, m };
}
export function validateFile(text, cats, machines) {
  const out = { fileErrors: [], fileWarnings: [], records: [] };
  let json;
  try { json = JSON.parse(text); } catch (e) { out.fileErrors.push(`This is not valid JSON: ${e.message}`); return out; }
  if (!json || typeof json !== 'object' || Array.isArray(json)) { out.fileErrors.push('The file must be a JSON object with a "products" list.'); return out; }
  if (json.schemaVersion !== SCHEMA_VERSION) out.fileErrors.push(`schemaVersion must be ${SCHEMA_VERSION} (this file has ${JSON.stringify(json.schemaVersion)}).`);
  if (!Array.isArray(json.products)) out.fileErrors.push('"products" must be a list.');
  if (json.currency && json.currency !== 'INR') out.fileWarnings.push(`Currency is ${json.currency}; prices are treated as INR.`);
  if (out.fileErrors.length) return out;
  const { c, m } = lookup(cats, machines);
  const seen = new Map();
  json.products.forEach((raw, i) => {
    const rec = { index: i + 1, id: '', values: {}, errors: [], warnings: [] };
    out.records.push(rec);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { rec.errors.push('Record is not an object.'); return; }
    const err = (s) => rec.errors.push(s), warn = (s) => rec.warnings.push(s);
    if (typeof raw.id !== 'string' || !ID_RE.test(raw.id)) err('id is missing or invalid (lowercase letters, numbers, . - _ only).');
    else { rec.id = raw.id; seen.set(raw.id, [...(seen.get(raw.id) || []), i + 1]); }
    Object.keys(raw).forEach((k) => { if (k !== 'id' && !k.startsWith('_') && !ALL.has(k)) warn(`Unknown field "${k}" ignored.`); });
    const v = rec.values;
    TEXT.forEach((k) => {
      if (!(k in raw)) return;
      const x = raw[k] == null ? '' : raw[k];
      if (typeof x !== 'string') return err(`${k} must be text.`);
      const t = x.trim();
      if (t.length > 2000) return err(`${k} is too long.`);
      if (bad(t)) return err(`${k} looks like a formula or script and was rejected.`);
      if (k === 'nameEnglish' && !t) return err('nameEnglish cannot be empty.');
      v[k] = t;
    });
    const number = (k, int) => {
      if (!(k in raw)) return;
      let x = raw[k];
      if (x === null || x === '') { v[k] = null; return; }
      if (typeof x === 'string' && /^\s*₹?\s*\d[\d,]*(\.\d+)?\s*$/.test(x)) { x = Number(x.replace(/[₹,\s]/g, '')); warn(`${k} was text; read as number ${x}.`); }
      if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) return err(`${k} must be a number, 0 or more (or null).`);
      if (int && !Number.isInteger(x)) return err(`${k} must be a whole number.`);
      v[k] = x;
    };
    NUM.forEach((k) => number(k, false)); INT.forEach((k) => number(k, true));
    BOOL.forEach((k) => {
      if (!(k in raw)) return;
      let x = raw[k];
      if (x === 'true' || x === 'false') { x = x === 'true'; warn(`${k} was text; read as ${x}.`); }
      if (typeof x !== 'boolean') return err(`${k} must be true or false.`);
      v[k] = x;
    });
    if ('category' in raw) {
      const key = typeof raw.category === 'string' ? raw.category.toLowerCase().trim() : '';
      if (!key) err('category is empty.');
      else if (!c.has(key)) err(`Category "${raw.category}" does not exist. Create it in Categories first.`);
      else if (c.get(key) === null) err(`Category "${raw.category}" matches more than one category.`);
      else v.category = c.get(key);
    }
    if ('compatibleMachines' in raw) {
      if (!Array.isArray(raw.compatibleMachines)) err('compatibleMachines must be a list.');
      else {
        const ids = [];
        raw.compatibleMachines.forEach((x) => {
          const key = typeof x === 'string' ? x.toLowerCase().trim() : '';
          if (!m.has(key) || m.get(key) === null) err(`Machine "${x}" was not found (use the machine id).`); else ids.push(m.get(key));
        });
        v.compatibleMachines = [...new Set(ids)];
      }
    }
    if ('imageUrls' in raw) {
      if (!Array.isArray(raw.imageUrls)) err('imageUrls must be a list.');
      else {
        const badEntries = raw.imageUrls.filter((u) => !isValidImageUrl(u));
        if (badEntries.length) {
          // Give a precise, actionable message rather than a one-size-fits-all line.
          const tooLong = raw.imageUrls.some((u) => typeof u === 'string' && u.length > IMAGE_URL_MAX_LEN);
          const notString = raw.imageUrls.some((u) => typeof u !== 'string');
          const badScheme = raw.imageUrls.some((u) => typeof u === 'string' && u.length <= IMAGE_URL_MAX_LEN && !(DATA_URL_RE.test(u) || HTTPS_URL_RE.test(u)));
          if (notString) err('imageUrls entries must be strings.');
          else if (tooLong) err(`One imageUrls entry is longer than ${IMAGE_URL_MAX_LEN} characters (about 300 KB). Compress the image first.`);
          else if (badScheme) err('imageUrls entries must be https:// links or data:image/(jpeg|jpg|png|webp);base64,… strings.');
          else err('imageUrls has invalid entries.');
        } else {
          v.imageUrls = [...new Set(raw.imageUrls)];
        }
      }
    }
    if (v.mrp != null && v.sellingPrice != null && v.sellingPrice > v.mrp) err('sellingPrice is higher than mrp.');
  });
  out.records.forEach((r) => { const rows = seen.get(r.id); if (rows && rows.length > 1) r.errors.push(`Duplicate id in file (rows ${rows.join(', ')}).`); });
  return out;
}

// ---------- planning
const norm = (v) => (v == null || v === '' || (Array.isArray(v) && !v.length) ? null : Array.isArray(v) ? JSON.stringify(v) : v);
function buildPatch(values, fields, existing) {
  const p = {}; const want = (f) => fields.has(f) && f in values;
  [...TEXT, ...NUM, ...INT, 'stockEnabled', 'featured', 'popular', 'category', 'compatibleMachines'].forEach((f) => { if (want(f)) p[f] = values[f]; });
  if (want('imageUrls')) {
    const old = new Map((existing?.imageUrls || []).map((u, i) => [u, existing.imagePaths?.[i] || '']));
    p.imageUrls = values.imageUrls; p.imagePaths = values.imageUrls.map((u) => old.get(u) || '');
  }
  const a = want('active') ? values.active : undefined, r = want('archived') ? values.archived : undefined;
  if (r === true) p.status = 'archived';
  else if (a === true) p.status = 'active';
  else if (a === false) p.status = 'inactive';
  else if (r === false && existing?.status === 'archived') p.status = 'inactive';
  return p;
}
export function classify(records, existingById, mode, fields) {
  const inFile = new Set(records.map((r) => r.id).filter(Boolean));
  const items = records.map((rec) => {
    if (rec.errors.length) return { rec, kind: 'error', problems: rec.errors };
    const ex = existingById.get(rec.id);
    if (!ex) {
      if (mode === 'update') return { rec, kind: 'skipped', note: 'Not in catalogue (mode: update existing only).' };
      const miss = [];
      if (!rec.values.nameEnglish) miss.push('nameEnglish is required for new products.');
      if (!rec.values.category) miss.push('category is required for new products.');
      if (miss.length) return { rec, kind: 'error', problems: miss };
      return { rec, kind: 'new', data: { ...DEFAULTS, ...buildPatch(rec.values, ALL, null) } };
    }
    if (mode === 'add') return { rec, kind: 'skipped', note: 'Already exists (mode: add new only).' };
    const patch = buildPatch(rec.values, fields, ex);
    const changes = [], keep = {};
    Object.entries(patch).forEach(([k, val]) => {
      if (k === 'imagePaths') return;
      const before = typeof val === 'boolean' ? !!ex[k] : norm(ex[k]);
      if (norm(val) !== before) { changes.push({ field: k, before: ex[k] ?? null, after: val }); keep[k] = val; if (k === 'imageUrls') keep.imagePaths = patch.imagePaths; }
    });
    return changes.length ? { rec, kind: 'update', patch: keep, changes } : { rec, kind: 'unchanged' };
  });
  const toArchive = mode === 'replace' ? [...existingById.values()].filter((p) => p.status !== 'archived' && !inFile.has(p.id)) : [];
  const counts = { total: records.length, new: 0, update: 0, unchanged: 0, error: 0, skipped: 0, archive: toArchive.length };
  items.forEach((i) => { counts[i.kind]++; });
  return { items, counts, toArchive };
}