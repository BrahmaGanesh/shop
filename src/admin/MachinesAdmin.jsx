import { useMemo, useState } from 'react';
import { arrayRemove, arrayUnion, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAdmin } from './AdminShell';
import ImagePicker from './ImagePicker';
import { commitOps, deleteImage, logActivity, slug } from './adminlib';

const BLANK = { id: '', brand: '', model: '', type: '', active: true };

export default function MachinesAdmin() {
  const { machines, products } = useAdmin();
  const [edit, setEdit] = useState(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const linked = (id) => products.filter((p) => p.compatibleMachines?.includes(id));
  const brands = [...new Set(machines.map((m) => m.brand))];
  const run = async (fn, ok) => {
    if (busy) return; setBusy(true); setMsg('');
    try { await fn(); setMsg(ok); } catch (e) { setMsg('Failed: ' + e.message); }
    setBusy(false);
  };
  const open = (m) => { setQ(''); setEdit(m
    ? { isNew: false, f: { ...BLANK, ...m }, img: m.imageUrl ? [{ url: m.imageUrl, path: m.imagePath || '' }] : [], parts: new Set(linked(m.id).map((p) => p.id)), before: new Set(linked(m.id).map((p) => p.id)) }
    : { isNew: true, f: { ...BLANK }, img: [], parts: new Set(), before: new Set() }); };
  const setF = (k, v) => setEdit((e) => ({ ...e, f: { ...e.f, [k]: v } }));
  const togglePart = (id) => setEdit((e) => { const s = new Set(e.parts); s.has(id) ? s.delete(id) : s.add(id); return { ...e, parts: s }; });

  const visible = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return products.filter((p) => p.status !== 'archived' && w.every((x) => [p.nameEnglish, p.nameTelugu, p.brand, p.size, p.productNumber].join(' ').toLowerCase().includes(x)));
  }, [products, q]);

  const save = (ev) => {
    ev.preventDefault();
    const { isNew, f, img, parts, before } = edit;
    if (!f.brand.trim() || !f.model.trim()) { setMsg('Failed: brand and model are required.'); return; }
    run(async () => {
      const id = isNew ? slug(`${f.brand}-${f.model}`) : f.id;
      if (!id) throw new Error('Use letters or numbers in brand and model.');
      if (isNew && (await getDoc(doc(db, 'machines', id))).exists()) throw new Error('This machine already exists.');
      const data = { brand: f.brand.trim(), model: f.model.trim(), type: f.type.trim(), active: f.active, imageUrl: img[0]?.url || '', imagePath: img[0]?.path || '' };
      const add = [...parts].filter((p) => !before.has(p)), rem = [...before].filter((p) => !parts.has(p));
      await commitOps([
        (b) => b.set(doc(db, 'machines', id), isNew ? { ...data, createdAt: serverTimestamp() } : data, { merge: true }),
        ...add.map((p) => (b) => b.update(doc(db, 'products', p), { compatibleMachines: arrayUnion(id), updatedAt: serverTimestamp() })),
        ...rem.map((p) => (b) => b.update(doc(db, 'products', p), { compatibleMachines: arrayRemove(id), updatedAt: serverTimestamp() })),
        (b) => logActivity(b, isNew ? 'machine.create' : 'machine.update', { id, name: `${data.brand} ${data.model}`, partsAdded: add.length, partsRemoved: rem.length }),
      ]);
      setEdit(null);
    }, 'Machine saved.');
  };
  const toggle = (m) => run(() => commitOps([(b) => b.update(doc(db, 'machines', m.id), { active: m.active === false }), (b) => logActivity(b, 'machine.toggle', { id: m.id })]), 'Updated.');
  const remove = (m) => {
    if (!window.confirm(`Delete ${m.brand} ${m.model}? It will also be unlinked from ${linked(m.id).length} product(s). (Hide it instead if you may need it again.)`)) return;
    run(async () => {
      await deleteImage(m.imagePath);
      await commitOps([
        (b) => b.delete(doc(db, 'machines', m.id)),
        ...linked(m.id).map((p) => (b) => b.update(doc(db, 'products', p.id), { compatibleMachines: arrayRemove(m.id) })),
        (b) => logActivity(b, 'machine.delete', { id: m.id, name: `${m.brand} ${m.model}` }),
      ]);
    }, 'Machine deleted.');
  };

  return (
    <>
      <div className="a-head"><h1>Machines</h1><button className="a-btn primary" onClick={() => open(null)}>+ Add machine</button></div>
      {msg && <p className={msg.startsWith('Failed') ? 'a-err' : 'a-ok'} role="status">{msg}</p>}
      {edit && (
        <form className="a-form a-panel" onSubmit={save}>
          <h2>{edit.isNew ? 'New machine' : `Edit ${edit.f.brand} ${edit.f.model}`}</h2>
          <div className="cols">
            <label>Brand *<input list="mbrands" value={edit.f.brand} onChange={(e) => setF('brand', e.target.value)} /></label>
            <label>Model *<input value={edit.f.model} onChange={(e) => setF('model', e.target.value)} /></label>
            <label>Type (optional)<input value={edit.f.type} onChange={(e) => setF('type', e.target.value)} /></label>
          </div>
          <datalist id="mbrands">{brands.map((b) => <option key={b} value={b} />)}</datalist>
          <label className="chk"><input type="checkbox" checked={edit.f.active} onChange={(e) => setF('active', e.target.checked)} /> Visible in the shop</label>
          <b>Machine photo (optional)</b>
          <ImagePicker multiple={false} images={edit.img} onChange={(l) => setEdit((e) => ({ ...e, img: l }))} folder="machines" id={edit.isNew ? slug(`${edit.f.brand}-${edit.f.model}`) : edit.f.id} />
          <b>Spare parts that fit this machine ({edit.parts.size} selected)</b>
          <input placeholder="Search parts…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="picklist">
            {visible.map((p) => (
              <label key={p.id} className="chk"><input type="checkbox" checked={edit.parts.has(p.id)} onChange={() => togglePart(p.id)} />
                {p.nameEnglish} <small>{[p.brand, p.size || p.productNumber].filter(Boolean).join(' · ')}</small></label>
            ))}
          </div>
          <div className="a-bar inline"><button className="a-btn primary" disabled={busy}>SAVE</button><button type="button" className="a-btn" onClick={() => setEdit(null)}>CANCEL</button></div>
        </form>
      )}
      {machines.length === 0 && !edit && <p className="a-empty">No machines yet. Add your first rotavator machine.</p>}
      <ul className="a-list">
        {machines.map((m) => (
          <li key={m.id} className={m.active === false ? 'off' : ''}>
            <span className="ic">{m.imageUrl ? <img src={m.imageUrl} alt="" /> : '🚜'}</span>
            <span className="grow"><b>{m.brand} {m.model}</b>{m.type ? ` · ${m.type}` : ''}<br /><small>{linked(m.id).length} spare parts{m.active === false ? ' · hidden' : ''}</small></span>
            <button className="a-btn sm" onClick={() => open(m)}>Edit</button>
            <button className="a-btn sm" disabled={busy} onClick={() => toggle(m)}>{m.active === false ? 'Show' : 'Hide'}</button>
            <button className="a-btn sm danger" disabled={busy} onClick={() => remove(m)}>Delete</button>
          </li>
        ))}
      </ul>
    </>
  );
}
