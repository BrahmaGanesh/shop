import { useRef, useState } from 'react';
import { uploadImage } from './adminlib';

// images: [{url, path}]. Uploads immediately; the parent decides when the list is saved.
export default function ImagePicker({ images, onChange, onAdded, folder, id, multiple = true, disabled }) {
  const cam = useRef(null), file = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const pick = async (e) => {
    const files = [...e.target.files]; e.target.value = '';
    if (!files.length) return;
    if (!id) { setErr('Fill in the Product ID or name first.'); return; }
    setBusy(true); setErr('');
    try {
      const added = [];
      for (const f of files) added.push(await uploadImage(folder, id, f));
      onAdded?.(added);
      onChange(multiple ? [...images, ...added] : added.slice(0, 1));
    } catch (x) { setErr(x.message || 'Upload failed. Check your internet and try again.'); }
    setBusy(false);
  };
  const move = (i) => { const a = [...images]; [a[0], a[i]] = [a[i], a[0]]; onChange(a); };
  return (
    <div>
      <div className="imgs">
        {images.map((im, i) => (
          <figure key={im.path || im.url}>
            <img src={im.url} alt="" />
            {i === 0 && <figcaption>Main photo</figcaption>}
            <div>
              {i > 0 && <button type="button" onClick={() => move(i)}>Make main</button>}
              <button type="button" className="danger" onClick={() => onChange(images.filter((_, j) => j !== i))}>Remove</button>
            </div>
          </figure>
        ))}
      </div>
      <div className="row">
        <button type="button" className="a-btn" disabled={busy || disabled} onClick={() => cam.current.click()}>📷 Take photo</button>
        <button type="button" className="a-btn" disabled={busy || disabled} onClick={() => file.current.click()}>🖼️ {images.length && !multiple ? 'Replace' : 'Choose'} from gallery / computer</button>
        {busy && <span>Uploading…</span>}
      </div>
      <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
      <input ref={file} type="file" accept="image/*" multiple={multiple} hidden onChange={pick} />
      {err && <p className="a-err">{err}</p>}
    </div>
  );
}
