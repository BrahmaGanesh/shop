import { useState } from 'react';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAdmin } from './AdminShell';
import ImagePicker from './ImagePicker';
import { commitOps, deleteImage, logActivity, slug } from './adminlib';

const BLANK = { id: '', nameEnglish: '', nameTelugu: '', icon: '', active: true };

export default function CategoriesAdmin() {
  const { categories, products } = useAdmin();
  const [edit, setEdit] = useState(null); // null | {isNew, f, img:[{url,path}]}
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const count = (id) => products.filter((p) => p.category === id && p.status !== 'archived').length;
  const run = async (fn, ok) => {
    if (busy) return; setBusy(true); setMsg('');
    try { await fn(); setMsg(ok); } catch (e) { setMsg('Failed: ' + e.message); }
    setBusy(false);
  };
  const open = (c) => setEdit(c
    ? { isNew: false, f: { ...BLANK, ...c }, img: c.iconUrl ? [{ url: c.iconUrl, path: c.iconPath || '' }] : [] }
    : { isNew: true, f: { ...BLANK }, img: [] });
  const setF = (k, v) => setEdit((e) => ({ ...e, f: { ...e.f, [k]: v } }));

  const save = (ev) => {
    ev.preventDefault();
    const { isNew, f, img } = edit;
    if (!f.nameEnglish.trim()) { setMsg('Failed: English name is required.'); return; }
    run(async () => {
      const id = isNew ? slug(f.nameEnglish) : f.id;
      if (!id) throw new Error('Use letters or numbers in the name.');
      if (isNew && (await getDoc(doc(db, 'categories', id))).exists()) throw new Error('A category with this name already exists.');
      const data = {
        nameEnglish: f.nameEnglish.trim(), nameTelugu: f.nameTelugu.trim(), icon: f.icon.trim(), active: f.active,
        iconUrl: img[0]?.url || '', iconPath: img[0]?.path || '',
      };
      await commitOps([
        (b) => b.set(doc(db, 'categories', id), isNew ? { ...data, order: categories.length + 1, createdAt: serverTimestamp() } : data, { merge: true }),
        (b) => logActivity(b, isNew ? 'category.create' : 'category.update', { id, name: data.nameEnglish }),
      ]);
      setEdit(null);
    }, 'Category saved.');
  };
  const move = (i, d) => {
    const a = [...categories]; const j = i + d; if (j < 0 || j >= a.length) return;
    [a[i], a[j]] = [a[j], a[i]];
    run(() => commitOps([...a.map((c, k) => (b) => b.update(doc(db, 'categories', c.id), { order: k + 1 })), (b) => logActivity(b, 'category.reorder', {})]), 'Order saved.');
  };
  const toggle = (c) => run(() => commitOps([(b) => b.update(doc(db, 'categories', c.id), { active: !c.active }), (b) => logActivity(b, 'category.toggle', { id: c.id, active: !c.active })]), `${c.nameEnglish} is now ${c.active ? 'hidden' : 'visible'}.`);
  const remove = (c) => {
    const n = products.filter((p) => p.category === c.id).length;
    if (n) { setMsg(`Failed: ${n} product(s) (including archived) still use "${c.nameEnglish}". Move them first, or hide the category instead.`); return; }
    if (!window.confirm(`Delete category "${c.nameEnglish}"?`)) return;
    run(async () => {
      await deleteImage(c.iconPath);
      await commitOps([(b) => b.delete(doc(db, 'categories', c.id)), (b) => logActivity(b, 'category.delete', { id: c.id, name: c.nameEnglish })]);
    }, 'Category deleted.');
  };

  return (
    <>
      <div className="a-head"><h1>Categories</h1><button className="a-btn primary" onClick={() => open(null)}>+ Add category</button></div>
      {msg && <p className={msg.startsWith('Failed') ? 'a-err' : 'a-ok'} role="status">{msg}</p>}
      {edit && (
        <form className="a-form a-panel" onSubmit={save}>
          <h2>{edit.isNew ? 'New category' : 'Edit category'}</h2>
          <div className="cols">
            <label>English name *<input value={edit.f.nameEnglish} onChange={(e) => setF('nameEnglish', e.target.value)} /></label>
            <label>Telugu name<input lang="te" value={edit.f.nameTelugu} onChange={(e) => setF('nameTelugu', e.target.value)} /></label>
            <label>Icon (an emoji, used when no icon image)<input value={edit.f.icon} onChange={(e) => setF('icon', e.target.value)} /></label>
          </div>
          <label className="chk"><input type="checkbox" checked={edit.f.active} onChange={(e) => setF('active', e.target.checked)} /> Visible in the shop</label>
          <b>Icon image (optional)</b>
          <ImagePicker multiple={false} images={edit.img} onChange={(l) => setEdit((e) => ({ ...e, img: l }))} folder="categories" id={edit.isNew ? slug(edit.f.nameEnglish) : edit.f.id} />
          <div className="a-bar inline"><button className="a-btn primary" disabled={busy}>SAVE</button><button type="button" className="a-btn" onClick={() => setEdit(null)}>CANCEL</button></div>
        </form>
      )}
      <ul className="a-list">
        {categories.map((c, i) => (
          <li key={c.id} className={c.active === false ? 'off' : ''}>
            <span className="ic">{c.iconUrl ? <img src={c.iconUrl} alt="" /> : c.icon || '⚙️'}</span>
            <span className="grow"><b>{c.nameEnglish}</b> <span className="te">{c.nameTelugu}</span><br /><small>{count(c.id)} products{c.active === false ? ' · hidden' : ''}</small></span>
            <button className="a-btn sm" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label="Move up">▲</button>
            <button className="a-btn sm" disabled={busy || i === categories.length - 1} onClick={() => move(i, 1)} aria-label="Move down">▼</button>
            <button className="a-btn sm" onClick={() => open(c)}>Edit</button>
            <button className="a-btn sm" disabled={busy} onClick={() => toggle(c)}>{c.active === false ? 'Show' : 'Hide'}</button>
            <button className="a-btn sm danger" disabled={busy} onClick={() => remove(c)}>Delete</button>
          </li>
        ))}
      </ul>
      <p className="a-note">“All Products” is always shown last in the shop automatically.</p>
    </>
  );
}
