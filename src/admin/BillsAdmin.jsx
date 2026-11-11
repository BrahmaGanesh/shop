import { useEffect, useMemo, useState } from 'react';
import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useApp } from '../context';
import { money2 } from '../lib';
import InvoiceView from './Invoice';

const today = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

export default function BillsAdmin() {
  const { role, user } = useApp();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(null);
  const [day, setDay] = useState(today());
  const [q, setQ] = useState('');
  useEffect(() => {
    const col = collection(db, 'invoices');
    // Staff may read only their own bills (enforced by the database rules too).
    const qy = role === 'owner' ? query(col, orderBy('createdAt', 'desc'), limit(300)) : query(col, where('createdBy', '==', user.uid), limit(300));
    return onSnapshot(qy, (s) => setRows(s.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))), (e) => setErr(e.message));
  }, [role, user]);
  const list = useMemo(() => {
    const w = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => (!day || r.day === day) && w.every((x) => [r.invoiceNo, r.customer?.name, r.customer?.phone, r.paymentMethod].join(' ').toLowerCase().includes(x)));
  }, [rows, day, q]);
  if (open) return <InvoiceView inv={open} onBack={() => setOpen(null)} />;
  const total = list.reduce((a, r) => a + r.total, 0), due = list.reduce((a, r) => a + r.balanceDue, 0);
  return (
    <>
      <div className="a-head"><h1>Bills</h1></div>
      <div className="a-filters">
        <input placeholder="Search invoice no, customer, phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="Date" />
        <button className="a-btn" onClick={() => setDay('')}>All dates</button>
      </div>
      {err && <p className="a-err">{err}</p>}
      <p><b>{list.length}</b> bill(s) · total <b>{money2(total)}</b>{due > 0 && <> · unpaid <b className="warn">{money2(due)}</b></>}</p>
      <ul className="a-list">
        {list.map((r) => (
          <li key={r.id}>
            <span className="grow"><b>{r.invoiceNo}</b> · {r.createdAt?.toDate?.().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}<br />
              <small>{r.customer?.name || 'Walk-in'} · {r.paymentMethod}{role === 'owner' ? ` · ${r.createdByEmail}` : ''}{r.balanceDue > 0 ? ` · due ${money2(r.balanceDue)}` : ''}</small></span>
            <b>{money2(r.total)}</b><button className="a-btn sm" onClick={() => setOpen(r)}>Open / print</button>
          </li>
        ))}
      </ul>
      {!list.length && <p className="a-empty">No bills found.</p>}
      {rows.length >= 300 && <p className="a-note">Showing the latest 300 bills.</p>}
    </>
  );
}
