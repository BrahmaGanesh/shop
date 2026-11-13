import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { Capacitor } from '@capacitor/core';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
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

const speakTelugu = async (text) => {
  if (!Capacitor.isNativePlatform() && window.innerWidth > 800) return;
  try {
    await TextToSpeech.stop();
    await TextToSpeech.speak({ text, lang: 'te-IN', rate: 0.9 });
  } catch (e) { /* ignore */ }
};

export function Invoice({ inv, format, nodeRef, editable = false, onUpdateLine, onPriceClick }) {
  const isThermal = format === 'thermal' || format === 'thermal110';
  const now = liveNow();
  const sizeNo = (i) => [i.size, i.productNumber].filter(Boolean).join(' / ');
  const voiceSize = (i) => i.size || '';

  const upiLink = `upi://pay?pa=${SHOP.upiId}&pn=${encodeURIComponent(SHOP.name)}&am=${inv.total}&cu=INR&tn=${encodeURIComponent('Bill ' + inv.invoiceNo)}`;

  const ITEMS_PER_PAGE = format === 'a4' ? 50 : format === 'a5' ? 28 : 9999;
  const pages = [];
  if (!isThermal) {
    for (let i = 0; i < inv.items.length; i += ITEMS_PER_PAGE) {
      pages.push(inv.items.slice(i, i + ITEMS_PER_PAGE));
    }
    if (pages.length === 0) pages.push([]);
  }

  return (
    <div ref={nodeRef} className={'inv ' + format}>
      {isThermal ? (
        <>
          <header className="inv-hd">
            <div className="inv-hd-top"><span className="inv-hd-phone">Cell : {SHOP.cell}</span></div>
            <h1 className="inv-hd-name">{SHOP.name}</h1>
            <div className="inv-hd-addr">{SHOP.addr1}</div>
            <div className="inv-hd-addr">{SHOP.addr2}</div>
          </header>
          <div className="inv-meta">
            <div className="inv-meta-no"><b>Bill No.:</b> {inv.invoiceNo}</div>
            <div className="inv-meta-date"><b>Date:</b> {now.date} {now.time}</div>
          </div>
          <div className="th-items">
            <div className="th-header-row"><span>#</span><span>Img</span><span>Product Name</span><span>Qty</span><span>Price</span></div>
            {inv.items.map((i, k) => (
              <div key={k} className="th-row">
                <div className="th-sn">{k + 1}</div>
                <div className="th-img">{i.billImageUrl ? <img src={i.billImageUrl} alt="" /> : '—'}</div>
                <div className="th-name">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                    <b>{i.nameEnglish}{i.nameTelugu ? ` / ${i.nameTelugu}` : ''}</b>
                    {/* FIXED: Added no-print class */}
                    {Capacitor.isNativePlatform() && (
                      <button
                        className="no-print"
                        onClick={() => speakTelugu(`${i.nameTelugu || i.nameEnglish}. Size ${voiceSize(i)}. Quantity ${i.qty}`)}
                        style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 }}
                      >
                        🔊
                      </button>
                    )}
                  </div>
                  {sizeNo(i) ? <div className="th-size">Size: <b>{sizeNo(i)}</b></div> : null}
                </div>
                <div className="th-qty">{i.qty}</div>
                <div className="th-price">
                  {editable && onUpdateLine ? (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                      <input type="number" min="0" step="any" value={i.unitPrice} onChange={(e) => onUpdateLine(i.productId, { customPrice: e.target.value })} className="price-input" style={{ width: '55px', textAlign: 'right', fontWeight: 'bold', padding: '2px' }} />
                      {/* FIXED: Added no-print class */}
                      {Capacitor.isNativePlatform() && (
                        <button className="no-print" onClick={() => speakTelugu(`ధర ${i.unitPrice}`)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: '1rem', padding: 0 }}>🔊</button>
                      )}
                    </div>
                  ) : (`₹${money2(i.amount).replace('₹', '')}`)}
                </div>
              </div>
            ))}
          </div>
          <div className="inv-tot">
            <div className="inv-tot-row"><span>Subtotal</span><span>₹{money2(inv.subtotal).replace('₹', '')}</span></div>
            {inv.discount > 0 && <div className="inv-tot-row"><span>Discount</span><span>− ₹{money2(inv.discount).replace('₹', '')}</span></div>}
            {inv.tax > 0 && <div className="inv-tot-row"><span>Tax</span><span>₹{money2(inv.tax).replace('₹', '')}</span></div>}
            <div className="inv-tot-row gt"><span>GRAND TOTAL</span><span>₹{money2(inv.total).replace('₹', '')}</span></div>
          </div>
          <footer className="inv-ft-container">
            <div className="inv-ft-left"><div className="inv-ft-thanks"><b>Thank You! Visit Again.</b></div></div>
            <div className="inv-ft-qr"><QRCodeSVG value={upiLink} size={50} level="M" /><div className="inv-qr-text">Scan to Pay (UPI)</div></div>
          </footer>
        </>
      ) : (
        pages.map((pageItems, pageIndex) => {
          const isLastPage = pageIndex === pages.length - 1;
          return (
            <div key={pageIndex} className="invoice-page-wrapper" style={{ pageBreakAfter: isLastPage ? 'auto' : 'always' }}>
              <header className="inv-hd">
                <div className="inv-hd-top"><span className="inv-hd-phone">Cell : {SHOP.cell}</span></div>
                <h1 className="inv-hd-name">{SHOP.name}</h1>
                <div className="inv-hd-addr">{SHOP.addr1}</div>
                <div className="inv-hd-addr">{SHOP.addr2}</div>
              </header>
              <div className="inv-meta">
                <div className="inv-meta-no"><b>Bill No.:</b> {inv.invoiceNo}</div>
                <div className="inv-meta-date"><b>Date:</b> {now.date} {now.time}</div>
              </div>
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
                  {pageItems.map((i, k) => (
                    <tr key={k}>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{pageIndex * ITEMS_PER_PAGE + k + 1}</td>
                      <td style={{ textAlign: 'center' }}>
                        {i.billImageUrl ? <img className="inv-img" src={i.billImageUrl} alt="" /> : <span style={{ color: '#999' }}>—</span>}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                          <b>{i.nameEnglish}{i.nameTelugu ? ` / ${i.nameTelugu}` : ''}</b>
                          {/* FIXED: Added no-print class */}
                          {Capacitor.isNativePlatform() && (
                            <button
                              className="no-print"
                              onClick={() => speakTelugu(`${i.nameTelugu || i.nameEnglish}. Size ${voiceSize(i)}. Quantity ${i.qty}`)}
                              style={{ background: '#f4b400', border: 'none', borderRadius: '50%', width: 24, height: 24, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                            >
                              🔊
                            </button>
                          )}
                        </div>
                      </td>
                      <td style={{ textAlign: 'center' }}><b>{sizeNo(i) || '—'}</b></td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{i.qty}</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>
                        {editable && onUpdateLine ? (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                            <input type="number" min="0" step="any" value={i.unitPrice} onChange={(e) => onUpdateLine(i.productId, { customPrice: e.target.value })} className="price-input" style={{ width: '70px', textAlign: 'center', fontWeight: 'bold', fontSize: '1.2rem', padding: '4px', border: '1px solid #ccc', borderRadius: '4px' }} />
                            {/* FIXED: Added no-print class */}
                            {Capacitor.isNativePlatform() && (
                              <button className="no-print" onClick={() => speakTelugu(`ధర ${i.unitPrice}`)} style={{ background: '#f4b400', border: 'none', borderRadius: '50%', width: 24, height: 24, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>🔊</button>
                            )}
                          </div>
                        ) : (`₹${money2(i.unitPrice).replace('₹', '')}`)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {isLastPage && (
                <>
                  <div className="inv-tot">
                    <div className="inv-tot-row"><span>Subtotal</span><span>₹{money2(inv.subtotal).replace('₹', '')}</span></div>
                    {inv.discount > 0 && <div className="inv-tot-row"><span>Discount</span><span>− ₹{money2(inv.discount).replace('₹', '')}</span></div>}
                    {inv.tax > 0 && <div className="inv-tot-row"><span>Tax</span><span>₹{money2(inv.tax).replace('₹', '')}</span></div>}
                    <div className="inv-tot-row gt"><span>GRAND TOTAL</span><span>₹{money2(inv.total).replace('₹', '')}</span></div>
                  </div>
                  <footer className="inv-ft-container">
                    <div className="inv-ft-left">
                      <div className="inv-ft-thanks"><b>Thank You! Visit Again.</b></div>
                      <div className="inv-ft-name">{SHOP.name}</div>
                    </div>
                    <div className="inv-ft-qr">
                      <QRCodeSVG value={upiLink} size={70} level="M" />
                      <div className="inv-qr-text">Scan to Pay (UPI)</div>
                    </div>
                  </footer>
                </>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}

function pageStyle(format) {
  let el = document.getElementById('rs-page');
  if (!el) { el = document.createElement('style'); el.id = 'rs-page'; document.head.appendChild(el); }
  el.textContent =
    format === 'a4' ? '@page{size:A4;margin:4mm}'
    : format === 'a5' ? '@page{size:A5;margin:4mm}'
    : format === 'thermal110' ? '@page{size:110mm auto;margin:3mm}'
    : '@page{size:80mm auto;margin:2mm}';
}

export default function InvoiceView({ inv, onNew, onBack, editable = false, onUpdateLine }) {
  const [format, setFormat] = useState('a4');
  const [busy, setBusy] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [waPhone, setWaPhone] = useState(inv.customer?.phone || '');
  const [zoomItem, setZoomItem] = useState(null);
  const [zoomValue, setZoomValue] = useState('');
  const ref = useRef(null);

  const print = async (f) => {
    setFormat(f);
    setTimeout(async () => {
      pageStyle(f);
      if (Capacitor.isNativePlatform()) {
        try {
          const { Printer } = await import('@capgo/capacitor-printer');
          await Printer.printWebView();
        } catch (error) { alert("Printer not connected."); }
      } else {
        window.print();
      }
    }, 200);
  };

  const handleWhatsApp = (e) => {
    e.preventDefault();
    let cleanPhone = waPhone.replace(/[^0-9]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;
    if (cleanPhone.length < 10) return alert("Please enter a valid 10-digit number.");
    let msg = `*${inv.shop.name}*\n${inv.shop.address || ''}\nPh: ${inv.shop.phone || ''}\n---------------------------------\n*Bill No:* ${inv.invoiceNo}\n*Date:* ${new Date().toLocaleDateString('en-IN')}\n---------------------------------\n\n`;
    inv.items.forEach((item, index) => {
      msg += `${index + 1}. *${item.nameEnglish}*${item.nameTelugu ? ` / ${item.nameTelugu}` : ''}\n`;
      msg += `   Qty: ${item.qty} x ₹${money2(item.unitPrice).replace('₹', '')} = *₹${money2(item.amount).replace('₹', '')}*\n\n`;
    });
    msg += `---------------------------------\nSubtotal: ₹${money2(inv.subtotal).replace('₹', '')}\n`;
    if (inv.discount > 0) msg += `Discount: -₹${money2(inv.discount).replace('₹', '')}\n`;
    msg += `*GRAND TOTAL: ₹${money2(inv.total).replace('₹', '')}*\n---------------------------------\n\nThank you! Visit Again.`;
    const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    setWaOpen(false);
  };

  const downloadFile = async (type) => {
    setBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        if (type === 'pdf') {
          const { Printer } = await import('@capgo/capacitor-printer');
          await Printer.printWebView();
        } else {
          const { FileSharer } = await import('@capgo/capacitor-file-sharer');
          const [{ default: html2canvas }] = await Promise.all([import('html2canvas')]);
          const canvas = await html2canvas(ref.current, { scale: 0.8, backgroundColor: '#ffffff', useCORS: true });
          const base64Data = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];

          await FileSharer.share({
            filename: `${inv.invoiceNo}.jpg`,
            contentType: 'image/jpeg',
            base64Data: base64Data,
            title: 'Bill ' + inv.invoiceNo,
          });
        }
      } else {
        const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
        const canvas = await html2canvas(ref.current, { scale: 1.5, backgroundColor: '#ffffff', useCORS: true });
        let dataUrl, fileName;
        if (type === 'image') {
          dataUrl = canvas.toDataURL('image/jpeg', 0.9);
          fileName = `${inv.invoiceNo}.jpg`;
        } else {
          const imgData = canvas.toDataURL('image/jpeg', 0.9);
          let doc, w;
          if (format === 'a4') { w = 210; doc = new jsPDF({ unit: 'mm', format: 'a4' }); }
          else if (format === 'a5') { w = 148; doc = new jsPDF({ unit: 'mm', format: 'a5' }); }
          else if (format === 'thermal110') { w = 110; doc = new jsPDF({ unit: 'mm', format: [110, 200] }); }
          else { w = 80; doc = new jsPDF({ unit: 'mm', format: [80, 200] }); }
          const h = (canvas.height * w) / canvas.width;
          doc.addImage(imgData, 'JPEG', 0, 0, w, h);
          if (format === 'a4') for (let off = 297; off < h; off += 297) { doc.addPage(); doc.addImage(imgData, 'JPEG', 0, -off, w, h); }
          if (format === 'a5') for (let off = 210; off < h; off += 210) { doc.addPage(); doc.addImage(imgData, 'JPEG', 0, -off, w, h); }
          dataUrl = doc.output('datauristring');
          fileName = `${inv.invoiceNo}-${format}.pdf`;
        }
        const link = document.createElement('a');
        link.download = fileName;
        link.href = dataUrl;
        link.click();
      }
    } catch (e) {
      console.error(e);
      alert('Could not download. Use Print button instead.');
    }
    setBusy(false);
  };

  const openZoom = (item) => { setZoomItem(item); setZoomValue(item.unitPrice); };
  const saveZoom = () => { if (onUpdateLine && zoomItem) onUpdateLine(zoomItem.productId, { customPrice: zoomValue }); setZoomItem(null); };

  return (
    <div className="inv-page">
      {zoomItem && (
        <div className="zoom-overlay" onClick={() => setZoomItem(null)}>
          <div className="zoom-box" onClick={e => e.stopPropagation()}>
            <h2>Enter Price</h2><p style={{ margin: 0, color: '#666' }}>{zoomItem.nameEnglish}</p>
            <input type="number" autoFocus value={zoomValue} onChange={(e) => setZoomValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && saveZoom()} />
            <button className="a-btn primary" onClick={saveZoom}>Save Price</button>
          </div>
        </div>
      )}

      {waOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <form onSubmit={handleWhatsApp} style={{ background: '#fff', padding: 24, borderRadius: 12, width: '100%', maxWidth: 360, display: 'grid', gap: 12 }}>
            <h3 style={{ margin: 0, color: '#00337a' }}>Send to WhatsApp</h3>
            <label style={{ display: 'grid', gap: 4, fontWeight: 'bold' }}>10-digit Mobile Number
              <input type="tel" value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="e.g. 9640254545" style={{ padding: 10, border: '1px solid #ccc', borderRadius: 6, fontSize: 16 }} autoFocus />
            </label>
            <div className="row" style={{ marginTop: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="a-btn" onClick={() => setWaOpen(false)}>Cancel</button>
              <button type="submit" className="a-btn" style={{ backgroundColor: '#25D366', color: '#fff', borderColor: '#25D366', fontWeight: 'bold' }}>Open WhatsApp</button>
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
          <button className="a-btn" disabled={busy} onClick={() => downloadFile('pdf')}>{busy ? 'Wait…' : '⬇️ PDF'}</button>
          <button className="a-btn" disabled={busy} onClick={() => downloadFile('image')}>{busy ? 'Wait…' : '⬇️ Image'}</button>
          <button className="a-btn" style={{ backgroundColor: '#25D366', color: '#fff', borderColor: '#25D366', fontWeight: 'bold' }} onClick={() => setWaOpen(true)}>Send WhatsApp</button>
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
        <Invoice inv={inv} format={format} nodeRef={ref} editable={editable} onUpdateLine={onUpdateLine} onPriceClick={openZoom} />
      </div>
    </div>
  );
}