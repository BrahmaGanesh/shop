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

export function Invoice({ inv, format, nodeRef, editable = false, onUpdateLine }) {
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
                  {editable && onUpdateLine ? (
                    <input 
                      type="number" 
                      min="0" 
                      step="any"
                      value={i.unitPrice} 
                      onChange={(e) => onUpdateLine(i.productId, { customPrice: e.target.value })}
                      style={{ width: '85%', textAlign: 'center', fontWeight: 'bold', padding: '4px', border: '1px solid #00337a', borderRadius: '4px' }}
                    />
                  ) : (
                    `₹${money2(i.unitPrice).replace('₹', '')}`
                  )}
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
              <div className="th-price">
                {editable && onUpdateLine ? (
                  <input 
                    type="number" 
                    min="0" 
                    step="any"
                    value={i.unitPrice} 
                    onChange={(e) => onUpdateLine(i.productId, { customPrice: e.target.value })}
                    style={{ width: '55px', textAlign: 'right', fontWeight: 'bold', padding: '2px', border: '1px solid #000', borderRadius: '2px' }}
                  />
                ) : (
                  `₹${money2(i.amount).replace('₹', '')}`
                )}
              </div>
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

export default function InvoiceView({ inv, onNew, onBack, editable = false, onUpdateLine }) {
  const [format, setFormat] = useState('a4');
  const [busy, setBusy] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState(inv.customer?.phone || '');
  const ref = useRef(null);

  const print = (f) => { setFormat(f); setTimeout(() => { pageStyle(f); window.print(); }, 200); };

  const handleWhatsApp = (e) => {
    e.preventDefault();
    let cleanPhone = waPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone; 
    if (cleanPhone.length < 10) return alert("Please enter a valid 10-digit number.");

    let msg = `*${inv.shop.name}*\n`;
    msg += `${inv.shop.address || ''}\n`;
    if (inv.shop.phone) msg += `Ph: ${inv.shop.phone}\n`;
    msg += `---------------------------------\n`;
    msg += `*Bill No:* ${inv.invoiceNo}\n`;
    msg += `*Date:* ${new Date().toLocaleDateString('en-IN')} ${new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}\n`;
    if (inv.customer?.name) msg += `*Customer:* ${inv.customer.name}\n`;
    msg += `---------------------------------\n\n`;
    
    inv.items.forEach((item, index) => {
      // Adds English Name AND Telugu Name to WhatsApp
      msg += `${index + 1}. *${item.nameEnglish}*`;
      if (item.nameTelugu) msg += ` / ${item.nameTelugu}`;
      msg += `\n`;
      
      const size = [item.size, item.productNumber].filter(Boolean).join(' / ');
      if (size) msg += `   Size: ${size}\n`;
      msg += `   Qty: ${item.qty} x ₹${money2(item.unitPrice).replace('₹', '')} = *₹${money2(item.amount).replace('₹', '')}*\n\n`;
    });

    msg += `---------------------------------\n`;
    msg += `Subtotal: ₹${money2(inv.subtotal).replace('₹', '')}\n`;
    if (inv.discount > 0) msg += `Discount: -₹${money2(inv.discount).replace('₹', '')}\n`;
    if (inv.tax > 0) msg += `Tax: ₹${money2(inv.tax).replace('₹', '')}\n`;
    msg += `*GRAND TOTAL: ₹${money2(inv.total).replace('₹', '')}*\n`;
    msg += `---------------------------------\n\n`;
    msg += `Thank you for your business!\nVisit Again.`;

    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setWaOpen(false);
  };

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
      
      {/* CUSTOM WHATSAPP MODAL */}
      {waOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onSubmit={handleWhatsApp} style={{ background: '#fff', padding: 24, borderRadius: 12, width: '100%', maxWidth: 360, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, color: '#00337a' }}>Send to WhatsApp</h3>
            <label style={{ display: 'grid', gap: 4, fontWeight: 'bold' }}>
              10-digit Mobile Number
              <input 
                type="tel" 
                value={waPhone} 
                onChange={(e) => setWaPhone(e.target.value)} 
                placeholder="e.g. 9640254545" 
                style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 16 }}
                autoFocus
              />
            </label>
            <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="a-btn" onClick={() => setWaOpen(false)}>Cancel</button>
              <button type="submit" className="a-btn" style={{ backgroundColor: '#25D366', color: '#fff', borderColor: '#25D366', fontWeight: 'bold' }}>
                Open WhatsApp
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="no-print">
        <div className="row">
          <button className="a-btn primary" onClick={() => print('a4')}>🖨️ Print A4</button>
          <button className="a-btn" onClick={() => print('a5')}>🖨️ Print A5</button>
          <button className="a-btn" onClick={() => print('thermal110')}>🧾 Thermal 110 mm</button>
          <button className="a-btn" onClick={() => print('thermal')}>🧾 Thermal 80 mm</button>
          <button className="a-btn" disabled={busy} onClick={pdf}>{busy ? 'Preparing…' : `⬇️ PDF (${format})`}</button>
          
          {/* WHATSAPP BUTTON */}
          <button 
            className="a-btn" 
            style={{ backgroundColor: '#25D366', color: '#fff', borderColor: '#25D366', fontWeight: 'bold' }} 
            onClick={() => setWaOpen(true)}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: 6 }}>
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Send WhatsApp
          </button>
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
      <div className="inv-wrap">
        <Invoice inv={inv} format={format} nodeRef={ref} editable={editable} onUpdateLine={onUpdateLine} />
      </div>
    </div>
  );
}