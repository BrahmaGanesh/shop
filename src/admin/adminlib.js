import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
// Firebase Storage is intentionally NOT used any more.
// Images are compressed to Base64 data URLs and stored inside the Firestore
// product / category / machine documents (imageUrls[], iconUrl, imageUrl).
import { auth, db } from '../firebase';

export const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const num = (v) => (v === '' || v == null ? null : Number(v));
export const str = (v) => (v == null ? '' : String(v));

// Append-only activity record: who did what, when.
export function logActivity(batch, action, details = {}) {
  const u = auth.currentUser;
  batch.set(doc(collection(db, 'activity')), { action, details, uid: u.uid, email: u.email, at: serverTimestamp() });
}

// Runs write operations in batches of 400 (Firestore limit is 500). Each op receives the batch.
export async function commitOps(ops) {
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach((op) => op(b));
    await b.commit();
  }
}

// ---------------------------------------------------------------------------
// Base64 image pipeline (no Firebase Storage)
// ---------------------------------------------------------------------------
// Firestore has a 1 MiB limit per document. Base64 is ~4/3 the size of the raw
// image bytes and `imageUrls[]` may hold several photos per product, so we aim
// well under the limit: resize to MAX_DIM on the longest side and re-encode at
// progressively lower JPEG quality until each image is under HARD_LIMIT_BYTES.
// The numbers below are the practical ceiling for "looks fine on screen and in
// an A4 / A5 / thermal bill". Lower them if products start hitting the document
// size limit (Firestore rejects writes with `invalid-argument`).
const MAX_DIM = 900;                 // longest side in pixels
const JPEG_QUALITY_START = 0.72;     // starting JPEG quality
const JPEG_QUALITY_MIN = 0.35;       // stop lowering below this
const HARD_LIMIT_BYTES = 180 * 1024; // ~180 KB per image after base64 encoding

const dataUrlBody = (dataUrl) => {
  const comma = dataUrl.indexOf(',');
  return comma >= 0 ? dataUrl.slice(comma + 1) : '';
};
const base64Bytes = (body) => {
  const pad = (body.match(/=*$/) || [''])[0].length;
  return Math.floor((body.length * 3) / 4) - pad;
};

/**
 * Compress a JPG / JPEG / PNG / WEBP file and return a `data:image/jpeg;base64,…`
 * string small enough to live safely in a Firestore document.
 * Transparent PNGs are flattened onto white so they print cleanly.
 */
async function compressToBase64(file) {
  if (!(file instanceof Blob)) throw new Error('Not an image file.');
  let bmp;
  try {
    bmp = await createImageBitmap(file);
  } catch {
    throw new Error('This file is not a supported image (JPG, JPEG, PNG or WEBP).');
  }

  const k = Math.min(1, MAX_DIM / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(bmp.width * k));
  c.height = Math.max(1, Math.round(bmp.height * k));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  if (typeof bmp.close === 'function') bmp.close();

  let quality = JPEG_QUALITY_START;
  let dataUrl = c.toDataURL('image/jpeg', quality);
  while (base64Bytes(dataUrlBody(dataUrl)) > HARD_LIMIT_BYTES && quality > JPEG_QUALITY_MIN) {
    quality -= 0.07;
    dataUrl = c.toDataURL('image/jpeg', quality);
  }
  // If still too big, halve dimensions once (0.7×) and retry.
  if (base64Bytes(dataUrlBody(dataUrl)) > HARD_LIMIT_BYTES) {
    const c2 = document.createElement('canvas');
    c2.width = Math.max(1, Math.round(c.width * 0.7));
    c2.height = Math.max(1, Math.round(c.height * 0.7));
    const cx = c2.getContext('2d');
    cx.fillStyle = '#ffffff';
    cx.fillRect(0, 0, c2.width, c2.height);
    cx.drawImage(c, 0, 0, c2.width, c2.height);
    dataUrl = c2.toDataURL('image/jpeg', 0.6);
  }
  if (base64Bytes(dataUrlBody(dataUrl)) > HARD_LIMIT_BYTES) {
    throw new Error('Image is still too large after compression. Try a smaller photo.');
  }
  return dataUrl;
}

/**
 * Drop-in replacement for the old Storage `uploadImage`.
 *
 * Returns `{ url, path }` where:
 *   - url  : a `data:image/jpeg;base64,…` string, ready for `<img src={url}>`.
 *            This is what gets written into `imageUrls[]` / `iconUrl` / `imageUrl`.
 *   - path : a stable local id (`img-<time>-<rand>`). NOT a Storage path.
 *            Used by ImagePicker as a React key and by ProductForm to track
 *            images added or removed in this session. Not used for lookup.
 *
 * `folder` and `id` are accepted for call-site compatibility and ignored —
 * the image lives inside the owning Firestore document, so no folder is needed.
 */
export async function uploadImage(folder, id, file) {
  const url = await compressToBase64(file);
  const path = `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  return { url, path };
}

/**
 * Old callers pass a Storage path and expect the object to be deleted.
 * With Base64-in-Firestore there is nothing to delete here: removing an entry
 * from `imageUrls` / `imagePaths` (which ProductForm, CategoriesAdmin and
 * MachinesAdmin already write to the document on Save) is what actually removes
 * the bytes. Kept as a resolved no-op so every existing caller is unchanged.
 */
export const deleteImage = (_path) => Promise.resolve();