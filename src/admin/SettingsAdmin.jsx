import { useEffect, useState } from 'react';
import { doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAdmin } from './AdminShell';
import { logActivity } from './adminlib';

export default function SettingsAdmin() {
  const { settings } = useAdmin();
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!f) setF({ ...settings, paymentMethods: settings.paymentMethods.join('\n'), taxRate: String(settings.taxRate ?? 0), staffMaxDiscountPercent: String(settings.staffMaxDiscountPercent) }); }, [settings, f]);
  if (!f) return null;
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const T = (k, label, props = {}) => <label>{label}<input value={f[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...props} /></label>;
  const C = (k, label) => <label className="chk"><input type="checkbox" checked={!!f[k]} onChange={(e) => set(k, e.target.checked)} /> {label}</label>;
  const save = async (e) => {
    e.preventDefault();
    if (busy) return;
    const methods = [...new Set(f.paymentMethods.split('\n').map((x) => x.trim()).filter(Boolean))];
    const rate = Number(f.taxRate), maxD = Number(f.staffMaxDiscountPercent);
    const errs = [];
    if (!f.shopName.trim()) errs.push('Shop name is required.');
    if (!methods.length) errs.push('Add at least one payment method.');
    if (!/^[A-Za-z0-9-]{0,10}$/.test(f.invoicePrefix)) errs.push('Invoice prefix: up to 10 letters, numbers or dashes.');
    if (f.gstin.trim() && !/^[0-9A-Za-z]{15}$/.test(f.gstin.trim())) errs.push('GSTIN should be 15 letters/numbers.');
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) errs.push('Tax rate must be 0 to 100.');
    if (!Number.isFinite(maxD) || maxD < 0 || maxD > 100) errs.push('Staff discount limit must be 0 to 100.');
    if (errs.length) return setMsg('Failed: ' + errs.join(' '));
    setBusy(true); setMsg('');
    try {
      const data = {
        shopName: f.shopName.trim(), address: f.address.trim(), phone: f.phone.trim(), gstin: f.gstin.trim().toUpperCase(), invoicePrefix: f.invoicePrefix.trim(),
        footerNote: f.footerNote.trim(), paymentMethods: methods, taxEnabled: !!f.taxEnabled, taxRate: rate, taxInclusive: !!f.taxInclusive, roundOff: !!f.roundOff,
        staffCanEditPrice: !!f.staffCanEditPrice, staffMaxDiscountPercent: maxD,
      };
      const b = writeBatch(db);
      b.set(doc(db, 'settings', 'shop'), data, { merge: true });
      logActivity(b, 'settings.update', { taxEnabled: data.taxEnabled, taxRate: data.taxRate });
      await b.commit();
      setMsg('✓ Settings saved.');
    } catch (x) { setMsg('Failed: ' + x.message); }
    setBusy(false);
  };
  return (
    <form className="a-form" onSubmit={save}>
      <div className="a-head"><h1>Shop settings</h1></div>
      {msg && <p className={msg.startsWith('Failed') ? 'a-err' : 'a-ok'} role="status">{msg}</p>}
      <fieldset><legend>Shop details (printed on invoices)</legend>
        <div className="cols">{T('shopName', 'Shop name *')}{T('phone', 'Contact number', { type: 'tel' })}{T('gstin', 'GSTIN (leave empty if none)')}{T('invoicePrefix', 'Invoice number prefix')}</div>
        <label>Address<textarea rows="3" value={f.address} onChange={(e) => set('address', e.target.value)} /></label>
        <label>Footer message<input value={f.footerNote} onChange={(e) => set('footerNote', e.target.value)} /></label>
      </fieldset>
      <fieldset><legend>Tax</legend>
        {C('taxEnabled', 'Add tax to bills (nothing is added unless this is ticked)')}
        {f.taxEnabled && <><div className="cols">{T('taxRate', 'Default tax rate %', { type: 'number', min: 0, max: 100, step: 'any' })}</div>
          {C('taxInclusive', 'Prices already include tax (tax is shown inside the total instead of added)')}
          <small>A product’s own tax % (product editor) overrides this default.</small></>}
        {C('roundOff', 'Round the final total to the nearest rupee')}
      </fieldset>
      <fieldset><legend>Payment methods (one per line)</legend>
        <textarea rows="5" value={f.paymentMethods} onChange={(e) => set('paymentMethods', e.target.value)} />
        <small>A method called “Credit” starts with ₹0 paid.</small>
      </fieldset>
      <fieldset><legend>Staff permissions</legend>
        {C('staffCanEditPrice', 'Staff may change the price of an item while billing')}
        <div className="cols">{T('staffMaxDiscountPercent', 'Maximum discount staff may give (%)', { type: 'number', min: 0, max: 100, step: 'any' })}</div>
      </fieldset>
      <div className="a-bar"><button className="a-btn primary" disabled={busy}>{busy ? 'Saving…' : 'SAVE SETTINGS'}</button></div>
    </form>
  );
}
