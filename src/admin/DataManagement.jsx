import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAdmin } from './AdminShell';
import { DEFAULT_FIELDS, FIELD_GROUPS, ORDER, buildExport, buildTemplate, classify, validateFile } from './jsonio';
import { checkBackup, deleteBackup, download, loadBackup, logData, restoreOps, restoreSummary, runOps, saveBackup, snapshot, beforeMap, stamp } from './datalib';

const fmtDate = (t) => (t?.toDate ? t.toDate().toLocaleString() : '…');
const show = (v) => (v == null || v === '' ? '(empty)' : Array.isArray(v) ? `${v.length} item(s)` : String(v).length > 40 ? String(v).slice(0, 40) + '…' : String(v));
const csvCell = (s) => `"${String(s ?? '').replace(/^[=+\-@]/, "'$&").replace(/"/g, '""')}"`;

function Picker({ items, sel, setSel }) {
  const [q, setQ] = useState('');
  const w = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = items.filter((p) => w.every((x) => [p.nameEnglish, p.brand, p.size, p.productNumber, p.id].join(' ').toLowerCase().includes(x)));
  return (
    <>
      <input placeholder="Search products…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="picklist">
        {list.map((p) => (
          <label key={p.id} className="chk"><input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} />
            {p.nameEnglish} <small>{[p.brand, p.size || p.productNumber].filter(Boolean).join(' · ')}</small></label>
        ))}
      </div>
    </>
  );
}

function ExportTab() {
  const { products, categories, machines } = useAdmin();
  const [scope, setScope] = useState('live');
  const [cat, setCat] = useState('');
  const [sel, setSel] = useState(new Set());
  const [msg, setMsg] = useState('');
  const list = useMemo(() => products.filter((p) => ({
    live: p.status !== 'archived', active: p.status === 'active', archived: p.status === 'archived', everything: true,
    category: p.category === cat && p.status !== 'archived', selected: sel.has(p.id),
  })[scope]), [products, scope, cat, sel]);
  const doExport = async () => {
    download(`rotavator-products-${stamp()}.json`, JSON.stringify(buildExport(list, categories, machines), null, 2));
    await logData('export', { scope, count: list.length }).catch(() => {});
    setMsg(`✓ Exported ${list.length} product(s).`);
  };
  return (
    <section className="a-panel">
      <h2>Export products to JSON</h2>
      <label>What to export
        <select value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="live">All products (active + inactive)</option><option value="active">Active products only</option>
          <option value="archived">Archived products only</option><option value="everything">Everything, including archived</option>
          <option value="category">One category</option><option value="selected">Products I choose</option>
        </select></label>
      {scope === 'category' && <label>Category<select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Choose…</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.nameEnglish}</option>)}</select></label>}
      {scope === 'selected' && <Picker items={products} sel={sel} setSel={setSel} />}
      <p><b>{list.length}</b> product(s) will be exported.</p>
      <div className="row">
        <button className="a-btn primary" disabled={!list.length} onClick={doExport}>EXPORT PRODUCTS JSON</button>
        <button className="a-btn" onClick={() => download('rotavator-products-template.json', JSON.stringify(buildTemplate(categories, machines), null, 2))}>DOWNLOAD EMPTY JSON TEMPLATE</button>
      </div>
      {msg && <p className="a-ok">{msg}</p>}
      <p className="a-note"><b>About photos:</b> the file contains photo <i>links</i> (imageUrls), not the photo files. Keep them as they are to keep the photos. Upload new photos in the product editor. Purchase prices are private and are not included in this file (they are in full backups).</p>
      <p className="a-note">Edit the file in any text editor, then import it on the Import tab.</p>
    </section>
  );
}

const MODES = [
  ['upsert', 'Add + update (recommended)', 'New products are added. Existing products are updated, matched by Product ID.'],
  ['add', 'Add new products only', 'Products whose ID already exists are left untouched.'],
  ['update', 'Update existing products only', 'Products not already in the shop are skipped.'],
  ['replace', 'Full catalogue replace (advanced)', 'Like add + update, and every product NOT in the file is archived (hidden, recoverable). Needs a backup and typed confirmation.'],
];

function ImportTab() {
  const { products, categories, machines } = useAdmin();
  const [step, setStep] = useState(1);
  const [file, setFile] = useState(null);
  const [parsed, setParsed] = useState(null);
  const [mode, setMode] = useState('upsert');
  const [fields, setFields] = useState(new Set(DEFAULT_FIELDS));
  const [backupFirst, setBackupFirst] = useState(true);
  const [tab, setTab] = useState('update');
  const [ack, setAck] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const existing = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const plan = useMemo(() => (parsed?.records.length ? classify(parsed.records, existing, mode, fields) : null), [parsed, existing, mode, fields]);

  const reset = () => { setStep(1); setFile(null); setParsed(null); setAck(false); setTyped(''); setResult(null); };
  const choose = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { setParsed({ fileErrors: ['File is larger than 10 MB.'], fileWarnings: [], records: [] }); setFile({ name: f.name }); setStep(2); return; }
    const text = await f.text();
    setFile({ name: f.name }); setParsed(validateFile(text, categories, machines)); setStep(2);
  };
  const errorReport = () => {
    const rows = plan.items.filter((i) => i.kind === 'error').map((i) => [i.rec.index, i.rec.id, i.problems.join(' | ')]);
    download(`import-errors-${stamp()}.csv`, ['Row,Product ID,Problems', ...rows.map((r) => r.map(csvCell).join(','))].join('\n'), 'text/csv');
  };
  const toggleField = (f) => setFields((s) => { const n = new Set(s); n.has(f) ? n.delete(f) : n.add(f); return n; });

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      let backupId = null;
      if (backupFirst || mode === 'replace') backupId = (await saveBackup('pre-import', await snapshot())).id;
      const ops = [], before = new Map();
      const strip = ({ id, ...r }) => r;
      const upd = (id, data) => { before.set(`products/${id}`, strip(existing.get(id))); ops.push({ type: 'update', col: 'products', id, data: { ...data, updatedAt: serverTimestamp() } }); };
      plan.items.forEach((it) => {
        if (it.kind === 'new') ops.push({ type: 'create', col: 'products', id: it.rec.id, data: { ...it.data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() } });
        if (it.kind === 'update') upd(it.rec.id, it.patch);
      });
      plan.toArchive.forEach((p) => upd(p.id, { status: 'archived' }));
      const c = plan.counts;
      const summary = { mode, file: file.name, added: c.new, updated: c.update, unchanged: c.unchanged, skipped: c.skipped, errors: c.error, archived: c.archive, backupId };
      const r = await runOps(ops, before, 'import', summary);
      setResult(r.ok ? { ok: true, ...summary }
        : { ok: false, rolledBack: r.rolledBack, msg: r.error?.code === 'permission-denied' ? 'The database refused the change (permission).' : r.error?.message });
    } catch (e) { setResult({ ok: false, rolledBack: true, msg: e.message }); }
    setBusy(false); setStep(5);
  };

  const Steps = () => <ol className="steps">{['Select file', 'Validate', 'Preview & options', 'Confirm', 'Result'].map((s, i) => <li key={s} className={step === i + 1 ? 'on' : step > i + 1 ? 'done' : ''}>{i + 1}. {s}</li>)}</ol>;

  if (step === 1) return (
    <section className="a-panel"><Steps /><h2>Import products from JSON</h2>
      <p>Choose a <b>.json</b> file exported from this panel (or the empty template) after editing it. Nothing changes until you confirm at step 4.</p>
      <label className="a-btn primary filebtn">IMPORT JSON FILE<input type="file" accept=".json,application/json" hidden onChange={choose} /></label>
    </section>
  );
  if (step === 2) {
    const errs = plan ? plan.items.filter((i) => i.kind === 'error') : [];
    const warns = parsed.records.reduce((n, r) => n + r.warnings.length, 0);
    return (
      <section className="a-panel"><Steps /><h2>Validation: {file.name}</h2>
        {parsed.fileErrors.length > 0 ? <div className="a-err"><b>This file cannot be imported:</b><ul>{parsed.fileErrors.map((e) => <li key={e}>{e}</li>)}</ul></div> : (
          <>
            <p><b>{parsed.records.length}</b> product record(s) read. <b>{parsed.records.length - parsed.records.filter((r) => r.errors.length).length}</b> passed the checks, <b>{parsed.records.filter((r) => r.errors.length).length}</b> have problems{warns ? `, ${warns} warning(s)` : ''}.</p>
            {parsed.fileWarnings.map((w) => <p key={w} className="a-note">{w}</p>)}
            {errs.length > 0 && <div className="a-err"><b>Problems (these products will be skipped):</b><ul>{errs.slice(0, 30).map((i) => <li key={i.rec.index}>Row {i.rec.index} {i.rec.id && `(${i.rec.id})`}: {i.problems.join(' ')}</li>)}</ul>{errs.length > 30 && <p>…and {errs.length - 30} more.</p>}</div>}
          </>
        )}
        <div className="row">
          <button className="a-btn" onClick={reset}>Choose another file</button>
          {errs.length > 0 && <button className="a-btn" onClick={errorReport}>Download error report</button>}
          {parsed.records.length > 0 && <button className="a-btn primary" onClick={() => setStep(3)}>Continue</button>}
        </div>
      </section>
    );
  }
  const c = plan.counts, todo = c.new + c.update + c.archive;
  if (step === 3) {
    const rows = plan.items.filter((i) => i.kind === tab).slice(0, 200);
    return (
      <section className="a-panel"><Steps /><h2>Preview and options</h2>
        <fieldset className="a-box"><legend>Import mode</legend>
          {MODES.map(([k, t, d]) => <label key={k} className="chk top"><input type="radio" name="mode" checked={mode === k} onChange={() => setMode(k)} /><span><b>{t}</b><br /><small>{d}</small></span></label>)}
        </fieldset>
        {mode !== 'add' && (
          <fieldset className="a-box"><legend>Fields to update on existing products</legend>
            <div className="row"><button type="button" className="a-btn sm" onClick={() => setFields(new Set(ORDER.filter((f) => f !== 'id')))}>All</button><button type="button" className="a-btn sm" onClick={() => setFields(new Set(DEFAULT_FIELDS))}>Recommended</button><button type="button" className="a-btn sm" onClick={() => setFields(new Set())}>None</button></div>
            {FIELD_GROUPS.map(([g, fs]) => <div key={g} className="fgroup"><b>{g}</b><div className="row">{fs.map((f) => <label key={f} className="chk"><input type="checkbox" checked={fields.has(f)} onChange={() => toggleField(f)} />{f}</label>)}</div></div>)}
            <small>Fields missing from a record are never changed. New products always get every field in the file.</small>
          </fieldset>
        )}
        <div className="counts">
          {[['total', 'In file'], ['new', 'New'], ['update', 'To update'], ['unchanged', 'Unchanged'], ['skipped', 'Skipped'], ['error', 'Errors'], ...(mode === 'replace' ? [['archive', 'To archive']] : [])].map(([k, l]) => (
            <button key={k} className={'cnt ' + k + (tab === k ? ' on' : '')} onClick={() => setTab(k === 'total' ? 'update' : k === 'archive' ? 'archive' : k)}><b>{c[k]}</b>{l}</button>))}
        </div>
        <div className="a-scroll">
          <table className="a-table plain"><tbody>
            {tab === 'archive' ? plan.toArchive.slice(0, 200).map((p) => <tr key={p.id}><td>{p.id}</td><td>{p.nameEnglish}</td><td>Will be archived (not in file)</td></tr>)
              : rows.map((i) => (
                <tr key={i.rec.index}><td>{i.rec.id}</td><td>{i.rec.values.nameEnglish || existing.get(i.rec.id)?.nameEnglish || ''}</td>
                  <td>{i.kind === 'update' ? i.changes.map((x) => <div key={x.field}><b>{x.field}</b>: {show(x.before)} → {show(x.after)}</div>)
                    : i.kind === 'error' ? i.problems.join(' ') : i.kind === 'skipped' ? i.note : i.kind === 'new' ? 'Will be added' : 'No changes'}</td></tr>))}
          </tbody></table>
          {!rows.length && tab !== 'archive' && <p className="a-empty">Nothing in this group.</p>}
        </div>
        {c.error > 0 && <div className="row"><button className="a-btn" onClick={errorReport}>Download error report</button></div>}
        <label className="chk"><input type="checkbox" checked={backupFirst || mode === 'replace'} disabled={mode === 'replace'} onChange={(e) => setBackupFirst(e.target.checked)} /> Save a full backup before importing (recommended)</label>
        <div className="row"><button className="a-btn" onClick={() => setStep(2)}>Back</button><button className="a-btn primary" disabled={!todo || (mode === 'replace' && c.error > 0)} onClick={() => { setAck(false); setTyped(''); setStep(4); }}>Continue</button></div>
        {mode === 'replace' && c.error > 0 && <p className="a-err">Full replace is blocked while any record has errors. Fix the file first.</p>}
        {!todo && <p className="a-note">Nothing to import with these settings.</p>}
      </section>
    );
  }
  if (step === 4) return (
    <section className="a-panel"><Steps /><h2>Confirm import</h2>
      <ul className="sum">
        <li><b>{c.new}</b> product(s) will be added</li><li><b>{c.update}</b> existing product(s) will be updated</li>
        {mode === 'replace' && <li className="danger"><b>{c.archive}</b> product(s) not in the file will be archived</li>}
        <li>{c.unchanged} unchanged, {c.skipped} skipped, {c.error} with errors (not imported)</li>
        <li>Backup first: <b>{backupFirst || mode === 'replace' ? 'yes' : 'no'}</b></li>
      </ul>
      <label className="chk"><input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} /> I have checked the preview and want to apply these changes.</label>
      {mode === 'replace' && <label>Type REPLACE to confirm<input value={typed} onChange={(e) => setTyped(e.target.value)} /></label>}
      <div className="row"><button className="a-btn" disabled={busy} onClick={() => setStep(3)}>Back</button>
        <button className="a-btn primary" disabled={busy || !ack || (mode === 'replace' && typed !== 'REPLACE')} onClick={run}>{busy ? 'Importing… please wait' : 'IMPORT NOW'}</button></div>
    </section>
  );
  return (
    <section className="a-panel"><Steps /><h2>Import result</h2>
      {result?.ok ? (
        <>
          <p className="a-ok">✓ Import finished. The shop is already showing the changes.</p>
          <ul className="sum"><li><b>{result.added}</b> added</li><li><b>{result.updated}</b> updated</li><li><b>{result.unchanged}</b> unchanged</li><li><b>{result.skipped}</b> skipped</li><li><b>{result.errors}</b> with errors (not imported)</li>{result.archived > 0 && <li><b>{result.archived}</b> archived</li>}</ul>
          {result.backupId && <p className="a-note">A backup was saved first (see Backups tab) if you need to undo.</p>}
        </>
      ) : (
        <div className="a-err"><b>The import did not complete.</b> {result?.msg}<br />{result?.rolledBack ? 'Nothing was changed: any partial changes were rolled back automatically.' : 'Some changes may have been applied and could not be rolled back. Restore the backup saved just before this import (Backups tab).'}</div>
      )}
      <div className="row">{c.error > 0 && <button className="a-btn" onClick={errorReport}>Download error report</button>}<button className="a-btn primary" onClick={reset}>Start another import</button></div>
    </section>
  );
}

function BackupTab() {
  const [list, setList] = useState([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [rs, setRs] = useState(null); // restore in progress
  const [typed, setTyped] = useState('');
  useEffect(() => onSnapshot(query(collection(db, 'backups'), orderBy('at', 'desc'), limit(30)), (s) => setList(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => setMsg('Failed: ' + e.message)), []);
  const guard = async (fn) => { if (busy) return; setBusy(true); setMsg(''); try { await fn(); } catch (e) { setMsg('Failed: ' + e.message); } setBusy(false); };
  const create = () => guard(async () => {
    const b = await saveBackup('manual', await snapshot());
    download(`rotavator-backup-${stamp()}.json`, b.text);
    await logData('backup', { id: b.id, products: b.data.products.length });
    setMsg('✓ Backup saved and downloaded.');
  });
  const prepare = (label, data) => guard(async () => {
    const errors = checkBackup(data);
    const snap = errors.length ? null : await snapshot();
    setRs({ label, data, errors, summary: snap ? restoreSummary(data, snap) : null }); setTyped('');
  });
  const fromFile = async (e) => { const f = e.target.files[0]; e.target.value = ''; if (!f) return; let d = null; try { d = JSON.parse(await f.text()); } catch { /* handled by checkBackup */ } prepare(f.name, d); };
  const fromServer = (b) => guard(async () => {
    const data = await loadBackup(b.id); const errors = checkBackup(data); const snap = errors.length ? null : await snapshot();
    setRs({ label: `${b.kind} backup, ${fmtDate(b.at)}`, data, errors, summary: snap ? restoreSummary(data, snap) : null }); setTyped('');
  });
  const downloadServer = (b) => guard(async () => download(`rotavator-backup-${stamp()}.json`, JSON.stringify(await loadBackup(b.id))));
  const restore = () => guard(async () => {
    const snap = await snapshot();
    await saveBackup('pre-restore', snap);
    const r = await runOps(restoreOps(rs.data, snap), beforeMap(snap), 'restore', { from: rs.label, products: rs.data.products.length });
    setMsg(r.ok ? '✓ Restore complete. A safety backup of the previous data was saved first.' : `Failed: ${r.error?.message}. ${r.rolledBack ? 'Changes were rolled back.' : 'Use the "pre-restore" backup to recover.'}`);
    if (r.ok) setRs(null);
  });
  const remove = (b) => window.confirm('Delete this backup permanently?') && guard(() => deleteBackup(b.id));
  return (
    <section className="a-panel">
      <h2>Backup and restore</h2>
      <div className="row"><button className="a-btn primary" disabled={busy} onClick={create}>Export full backup</button>
        <label className="a-btn filebtn">Restore from backup file<input type="file" accept=".json,application/json" hidden onChange={fromFile} /></label></div>
      <p className="a-note">A full backup holds products (including private purchase prices), categories and machines. It is saved here and downloaded to your device. Photo files are not part of a backup.</p>
      {msg && <p className={msg.startsWith('Failed') ? 'a-err' : 'a-ok'} role="status">{msg}</p>}
      {rs && (
        <div className="a-panel warnbox"><h3>Restore from {rs.label}</h3>
          {rs.errors.length ? <div className="a-err"><ul>{rs.errors.map((e) => <li key={e}>{e}</li>)}</ul></div> : (
            <>
              <p>Restoring makes your data match this backup exactly:</p>
              <ul className="sum">{Object.entries(rs.summary).map(([k, v]) => <li key={k}><b>{k}</b>: {v.add} added back, {v.overwrite} overwritten, <span className="danger">{v.remove} removed</span></li>)}</ul>
              <p className="a-note">A safety backup of the current data is saved first.</p>
              <label>Type RESTORE to confirm<input value={typed} onChange={(e) => setTyped(e.target.value)} /></label>
              <div className="row"><button className="a-btn danger" disabled={busy || typed !== 'RESTORE'} onClick={restore}>{busy ? 'Restoring…' : 'RESTORE NOW'}</button><button className="a-btn" onClick={() => setRs(null)}>Cancel</button></div>
            </>
          )}
          {rs.errors.length > 0 && <button className="a-btn" onClick={() => setRs(null)}>Close</button>}
        </div>
      )}
      <h3>Saved backups</h3>
      {list.length === 0 && <p className="a-empty">No backups yet.</p>}
      <ul className="a-list">{list.map((b) => (
        <li key={b.id}><span className="grow"><b>{fmtDate(b.at)}</b> · {b.kind}<br /><small>{b.counts?.products} products, {b.counts?.categories} categories, {b.counts?.machines} machines · by {b.email}</small></span>
          <button className="a-btn sm" disabled={busy} onClick={() => downloadServer(b)}>Download</button>
          <button className="a-btn sm" disabled={busy} onClick={() => fromServer(b)}>Restore</button>
          <button className="a-btn sm danger" disabled={busy} onClick={() => remove(b)}>Delete</button></li>))}</ul>
    </section>
  );
}

function HistoryTab() {
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  useEffect(() => onSnapshot(query(collection(db, 'dataLogs'), orderBy('at', 'desc'), limit(100)), (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() }))), (e) => setErr(e.message)), []);
  const text = (d = {}) => Object.entries(d).filter(([, v]) => v !== null && v !== undefined && v !== '').map(([k, v]) => `${k}: ${v}`).join(' · ');
  return (
    <section className="a-panel"><h2>Import, export and backup history</h2>
      {err && <p className="a-err">{err}</p>}
      {rows.length === 0 && <p className="a-empty">Nothing recorded yet.</p>}
      <ul className="a-list">{rows.map((r) => <li key={r.id}><span className="grow"><b>{r.type}</b> · {fmtDate(r.at)} · {r.email}<br /><small>{text(r.details)}</small></span></li>)}</ul>
    </section>
  );
}

export default function DataManagement() {
  const [tab, setTab] = useState('export');
  return (
    <>
      <div className="a-head"><h1>Data management</h1></div>
      <div className="tabs">{[['export', 'Export'], ['import', 'Import'], ['backup', 'Backups'], ['history', 'History']].map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      {tab === 'export' && <ExportTab />}{tab === 'import' && <ImportTab />}{tab === 'backup' && <BackupTab />}{tab === 'history' && <HistoryTab />}
    </>
  );
}
