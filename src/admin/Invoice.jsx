import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { money2 } from '../lib';

const pad = (n) => String(n).padStart(2, '0');

const liveNow = () => {
  const d = new Date();
  return {
    date: `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
};

const SHOP = {
  name: 'NEW SRIRAMA ENGINEERING WORKS',
  cell: '9640254545',
  addr1: 'Opp. Govt. Junior College, G.N.T. Road,',
  addr2: 'Sullurpet - 524 121, Tirupati Dt. AP.',
  upiId: 'YOUR_UPI_ID_HERE', // ⚠️ Change this to your real UPI ID
};

export function Invoice({ inv, format, nodeRef }) {
  const isThermal = format === 'thermal' || format === 'thermal110';
  const now = liveNow();
  const sizeNo = (i) => [i.size, i.productNumber].filter(Boolean).join(' / ');
  
  const upiLink = `upi://pay?pa=${SHOP.upiId}&pn=${encodeURIComponent(SHOP.name)}&am=${inv.total}&cu=INR&tn=${encodeURIComponent('Bill ' + inv.invoiceNo)}`;

  return (
    <div ref={nodeRef} className={'inv ' + format}>

      {/* ---------- Header ---------- */}
      <header className="inv-hd">
        <div className="inv-hd-top">
          <span className="inv-hd-billing"></span>
          <span className="inv-hd-phone">Cell : {SHOP.cell}</span>
        </div>
        <h1 className="inv-hd-name">{SHOP.name}</h1>
        <div className="inv-hd-addr">{SHOP.addr1}</div>
        <div className="inv-hd-addr">{SHOP.addr2}</div>
      </header>

      {/* ---------- Meta (Date & Bill No) ---------- */}
      <div className="inv-meta">
        <div className="inv-meta-no">
          <b>Bill No.:</b> {inv.invoiceNo}
        </div>
        <div className="inv-meta-date">
          <b>Date:</b> {now.date} {now.time && <span className="inv-meta-time">{now.time}</span>}
        </div>
        {(inv.customer?.name || inv.customer?.phone) && (
          <div className="inv-meta-cust">
            <b>Customer:</b> {[inv.customer.name, inv.customer.phone].filter(Boolean).join(' · ')}
          </div>
        )}
      </div>

      {/* ---------- Items ---------- */}
      {!isThermal ? (
        /* -------- A4 / A5 Table -------- */
        <table className="inv-tbl">
          <thead>
            <tr>
              <th style={{ width: '8%' }}>S.No.</th>
              <th style={{ width: '12%' }}>Image</th>
              <th style={{ width: '35%' }}>Product Name</th>
              <th style={{ width: '25%' }}>Size</th>
              <th style={{ width: '8%' }}>Qty.</th>
              <th style={{ width: '16%' }}>Price</th>
            </tr>
          </thead>
          <tbody>
            {inv.items.map((i, k) => (
              <tr key={k}>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{k + 1}</td>
                <td style={{ textAlign: 'center' }}>
                  {i.billImageUrl
                    ? <img className="inv-img" src={i.billImageUrl} alt="" />
                    : <span style={{ color: '#999' }}>—</span>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  <b>{i.nameEnglish}{i.nameTelugu ? ` / ${i.nameTelugu}` : ''}</b>
                </td>
                <td style={{ textAlign: 'center' }}>
                  <b>{sizeNo(i) || '—'}</b>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{i.qty}</td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                  ₹{money2(i.unitPrice).replace('₹', '')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        /* -------- Thermal Receipt (110mm / 80mm) GRID LAYOUT -------- */
        <div className="th-items">
          <div className="th-header-row">
            <span>#</span><span>Img</span><span>Product Name</span><span>Qty</span><span>Price</span>
          </div>
          {inv.items.map((i, k) => (
            <div key={k} className="th-row">
              <div className="th-sn">{k + 1}</div>
              <div className="th-img">
                {i.billImageUrl ? <img src={i.billImageUrl} alt="" /> : '—'}
              </div>
              <div className="th-name">
                <b>{i.nameEnglish}{i.nameTelugu ? ` / ${i.nameTelugu}` : ''}</b>
                {sizeNo(i) ? <div className="th-size">Size: <b>{sizeNo(i)}</b></div> : null}
              </div>
              <div className="th-qty">{i.qty}</div>
              <div className="th-price">₹{money2(i.amount).replace('₹', '')}</div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- Totals ---------- */}
      <div className="inv-tot">
        <div className="inv-tot-row"><span>Subtotal</span><span>₹{money2(inv.subtotal).replace('₹', '')}</span></div>
        {inv.discount > 0 && (
          <div className="inv-tot-row">
            <span>Discount{inv.discountInput?.type === 'percent' ? ` (${inv.discountInput.value}%)` : ''}</span>
            <span>− ₹{money2(inv.discount).replace('₹', '')}</span>
          </div>
        )}
        {inv.tax > 0 && (
          <div className="inv-tot-row">
            <span>Tax{inv.taxMode === 'inclusive' ? ' (included)' : ''}</span>
            <span>₹{money2(inv.tax).replace('₹', '')}</span>
          </div>
        )}
        {inv.roundOff !== 0 && (
          <div className="inv-tot-row"><span>Round off</span><span>₹{money2(inv.roundOff).replace('₹', '')}</span></div>
        )}
        <div className="inv-tot-row gt">
          <span>GRAND TOTAL</span>
          <span>₹{money2(inv.total).replace('₹', '')}</span>
        </div>
        {inv.paymentMethod && (
          <div className="inv-tot-row small">
            <span>Payment: {inv.paymentMethod}</span>
            <span>Paid ₹{money2(inv.amountPaid).replace('₹', '')}</span>
          </div>
        )}
        {inv.balanceDue > 0 && (
          <div className="inv-tot-row small due">
            <span>Balance due</span>
            <span>₹{money2(inv.balanceDue).replace('₹', '')}</span>
          </div>
        )}
        {inv.change > 0 && (
          <div className="inv-tot-row small">
            <span>Change</span>
            <span>₹{money2(inv.change).replace('₹', '')}</span>
          </div>
        )}
      </div>

      {/* ---------- Footer with UPI Payment QR ---------- */}
      <footer className="inv-ft-container">
        <div className="inv-ft-left">
          {inv.shop.footerNote && <div className="inv-ft-msg">{inv.shop.footerNote}</div>}
          <div className="inv-ft-thanks"><b>Thank You! Visit Again.</b></div>
          <div className="inv-ft-name">{SHOP.name}</div>
        </div>
        
        <div className="inv-ft-qr">
          <QRCodeSVG value={upiLink} size={isThermal ? 50 : 70} level="M" />
          <div className="inv-qr-text">Scan to Pay (UPI)</div>
        </div>
      </footer>
    </div>
  );
}

function pageStyle(format) {
  let el = document.getElementById('rs-page');
  if (!el) { el = document.createElement('style'); el.id = 'rs-page'; document.head.appendChild(el); }
  el.textContent =
    format === 'a4' ? '@page{size:A4;margin:10mm}'
    : format === 'a5' ? '@page{size:A5;margin:8mm}'
    : format === 'thermal110' ? '@page{size:110mm auto;margin:3mm}'
    : '@page{size:80mm auto;margin:2mm}';
}

export default function InvoiceView({ inv, onNew, onBack }) {
  const [format, setFormat] = useState('a4');
  const [busy, setBusy] = useState(false);
  const ref = useRef(null);

  const print = (f) => { setFormat(f); setTimeout(() => { pageStyle(f); window.print(); }, 200); };

  const pdf = async () => {
    setBusy(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
      const img = canvas.toDataURL('image/jpeg', 0.95);
      let doc, w;
      if (format === 'a4') { w = 210; doc = new jsPDF({ unit: 'mm', format: 'a4' }); }
      else if (format === 'a5') { w = 148; doc = new jsPDF({ unit: 'mm', format: 'a5' }); }
      else if (format === 'thermal110') { w = 110; doc = new jsPDF({ unit: 'mm', format: [110, 200] }); }
      else { w = 80; doc = new jsPDF({ unit: 'mm', format: [80, 200] }); }
      const h = (canvas.height * w) / canvas.width;
      doc.addImage(img, 'JPEG', 0, 0, w, h);
      if (format === 'a4') for (let off = 297; off < h; off += 297) { doc.addPage(); doc.addImage(img, 'JPEG', 0, -off, w, h); }
      if (format === 'a5') for (let off = 210; off < h; off += 210) { doc.addPage(); doc.addImage(img, 'JPEG', 0, -off, w, h); }
      doc.save(`${inv.invoiceNo}-${format}.pdf`);
    } catch (e) { alert('Could not create PDF: ' + e.message); }
    setBusy(false);
  };

  return (
    <div className="inv-page">
      <div className="no-print">
        <div className="row">
          <button className="a-btn primary" onClick={() => print('a4')}>🖨️ Print A4</button>
          <button className="a-btn" onClick={() => print('a5')}>🖨️ Print A5</button>
          <button className="a-btn" onClick={() => print('thermal110')}>🧾 Thermal 110 mm</button>
          <button className="a-btn" onClick={() => print('thermal')}>🧾 Thermal 80 mm</button>
          <button className="a-btn" disabled={busy} onClick={pdf}>{busy ? 'Preparing…' : `⬇️ PDF (${format})`}</button>
        </div>
        <div className="row">
          <div className="seg2">
            {[['a4', 'A4'], ['a5', 'A5'], ['thermal110', '110 mm'], ['thermal', '80 mm']].map(([f, l]) => (
              <button key={f} className={format === f ? 'on' : ''} onClick={() => setFormat(f)}>{l} preview</button>
            ))}
          </div>
          {onNew && <button className="a-btn" onClick={onNew}>+ New bill</button>}
          {onBack && <button className="a-btn" onClick={onBack}>← Back to list</button>}
          {onNew && <Link className="a-btn" to="/admin/bills">Billing history</Link>}
        </div>
      </div>
      <div className="inv-wrap"><Invoice inv={inv} format={format} nodeRef={ref} /></div>
    </div>
  );
}