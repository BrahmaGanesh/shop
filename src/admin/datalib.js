import { collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';

const COLS = ['products', 'categories', 'machines', 'productsPrivate'];
const PART = 250000; // characters per backup part (safe under the 1 MB document limit even for Telugu text)
const me = () => ({ uid: auth.currentUser.uid, email: auth.currentUser.email });

const ser = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString()
  : Array.isArray(v) ? v.map(ser) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, ser(x)])) : v);
const revive = (d) => { const o = { ...d }; ['createdAt', 'updatedAt'].forEach((k) => { if (typeof o[k] === 'string') o[k] = Timestamp.fromDate(new Date(o[k])); }); return o; };

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

// ---- snapshots and backups
export async function snapshot() {
  const out = {};
  for (const c of COLS) out[c] = (await getDocs(collection(db, c))).docs.map((d) => ({ id: d.id, data: d.data() }));
  return out;
}
export const beforeMap = (snap) => new Map(COLS.flatMap((c) => snap[c].map((x) => [`${c}/${x.id}`, x.data])));
export const buildBackup = (snap) => ({
  schemaVersion: 1, kind: 'full-backup', createdAt: new Date().toISOString(),
  ...Object.fromEntries(COLS.map((c) => [c, snap[c].map((x) => ({ id: x.id, ...ser(x.data) }))])),
});
export async function saveBackup(kind, snap) {
  const data = buildBackup(snap), text = JSON.stringify(data);
  const ref = doc(collection(db, 'backups'));
  const n = Math.ceil(text.length / PART);
  for (let i = 0; i < n; i++) await setDoc(doc(db, 'backups', ref.id, 'parts', String(i).padStart(4, '0')), { i, data: text.slice(i * PART, (i + 1) * PART) });
  // Metadata is written last, so an interrupted backup never appears in the list.
  await setDoc(ref, { kind, at: serverTimestamp(), parts: n, bytes: text.length, ...me(),
    counts: { products: data.products.length, categories: data.categories.length, machines: data.machines.length } });
  return { id: ref.id, text, data };
}
export async function loadBackup(id) {
  const s = await getDocs(collection(db, 'backups', id, 'parts'));
  return JSON.parse(s.docs.map((d) => d.data()).sort((a, b) => a.i - b.i).map((x) => x.data).join(''));
}
export async function deleteBackup(id) {
  const s = await getDocs(collection(db, 'backups', id, 'parts'));
  await Promise.all(s.docs.map((d) => deleteDoc(d.ref)));
  await deleteDoc(doc(db, 'backups', id));
}

export function checkBackup(d) {
  const e = [];
  if (!d || d.kind !== 'full-backup' || d.schemaVersion !== 1) return ['This is not a backup file made by this admin panel.'];
  COLS.forEach((c) => { if (!Array.isArray(d[c])) e.push(`Backup is missing the "${c}" list.`); });
  if (e.length) return e;
  d.products.forEach((p, i) => {
    if (typeof p.id !== 'string' || !p.id) e.push(`Product #${i + 1} has no id.`);
    else if (typeof p.nameEnglish !== 'string' || !p.nameEnglish) e.push(`Product ${p.id} has no name.`);
    else if (!['active', 'inactive', 'archived'].includes(p.status)) e.push(`Product ${p.id} has an invalid status.`);
  });
  ['categories', 'machines', 'productsPrivate'].forEach((c) => d[c].forEach((x, i) => { if (typeof x.id !== 'string' || !x.id) e.push(`${c} #${i + 1} has no id.`); }));
  return e.slice(0, 20);
}
export function restoreSummary(d, snap) {
  const out = {};
  COLS.slice(0, 3).forEach((c) => {
    const now = new Set(snap[c].map((x) => x.id)), then = new Set(d[c].map((x) => x.id));
    out[c] = { add: [...then].filter((i) => !now.has(i)).length, overwrite: [...then].filter((i) => now.has(i)).length, remove: [...now].filter((i) => !then.has(i)).length };
  });
  return out;
}
export function restoreOps(d, snap) {
  const ops = [];
  for (const c of COLS) {
    const keep = new Set();
    d[c].forEach(({ id, ...rest }) => { keep.add(id); ops.push({ type: 'set', col: c, id, data: revive(rest) }); });
    snap[c].forEach((x) => { if (!keep.has(x.id)) ops.push({ type: 'delete', col: c, id: x.id }); });
  }
  return ops;
}

// ---- logging
export function addLog(batch, type, details) {
  batch.set(doc(collection(db, 'dataLogs')), { type, details, ...me(), at: serverTimestamp() });
  batch.set(doc(collection(db, 'activity')), { action: `data.${type}`, details, ...me(), at: serverTimestamp() });
}
export async function logData(type, details) { const b = writeBatch(db); addLog(b, type, details); await b.commit(); }

// ---- safe commit
// Operations run in batches (each batch is all-or-nothing). Up to ~390 changes fit in ONE batch, which is fully atomic.
// Larger jobs run as several batches; if a later batch fails, the earlier ones are rolled back from `before`.
const put = (b, o) => {
  const r = doc(db, o.col, o.id);
  if (o.type === 'delete') b.delete(r); else if (o.type === 'update') b.update(r, o.data); else b.set(r, o.data);
};
export async function runOps(ops, before, logType, logDetails) {
  const SIZE = 390, chunks = [];
  for (let i = 0; i < ops.length; i += SIZE) chunks.push(ops.slice(i, i + SIZE));
  if (!chunks.length) chunks.push([]);
  const done = [];
  try {
    for (const [k, ch] of chunks.entries()) {
      const b = writeBatch(db);
      ch.forEach((o) => put(b, o));
      if (k === chunks.length - 1) addLog(b, logType, logDetails);
      await b.commit(); done.push(ch);
    }
    return { ok: true };
  } catch (error) {
    let rolledBack = true;
    try {
      for (const ch of done) {
        const b = writeBatch(db);
        ch.forEach((o) => { const prev = before.get(`${o.col}/${o.id}`); put(b, prev ? { type: 'set', col: o.col, id: o.id, data: prev } : { type: 'delete', col: o.col, id: o.id }); });
        await b.commit();
      }
    } catch { rolledBack = false; }
    return { ok: false, error, rolledBack, batchesApplied: done.length };
  }
}
