import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { Invoice } from './admin/Invoice';
import { Logo } from './components';

export default function BillScannerPage() {
  const { id } = useParams(); // This is the invoiceNo from the URL
  const [inv, setInv] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // We search by invoiceNo because the QR code uses the human-readable number
    const fetchBill = async () => {
      try {
        const q = query(collection(db, 'invoices'), where('invoiceNo', '==', id));
        const snap = await getDocs(q);
        
        if (snap.empty) {
          setError('Bill not found. Please check with the shop.');
        } else {
          // Load the first matching bill
          setInv({ id: snap.docs[0].id, ...snap.docs[0].data() });
        }
      } catch (err) {
        setError('Could not load the bill. Please check your internet.');
      }
      setLoading(false);
    };

    if (id) fetchBill();
  }, [id]);

  if (loading) return <div className="login"><p>Loading your bill...</p></div>;
  if (error) return <div className="login"><div><h1>Oops</h1><p>{error}</p></div></div>;

  return (
    <div className="scanner-page" style={{ padding: '16px', background: '#f3f5f4', minHeight: '100vh' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto', marginBottom: '16px', textAlign: 'center' }}>
        <Logo size={40} />
        <h2 style={{ margin: '8px 0' }}>Digital Bill</h2>
        <p style={{ color: '#666', fontSize: '0.9em' }}>Show this at the counter or keep it for your records.</p>
      </div>

      {/* Render the bill in A4 or A5 format so it fits the phone screen perfectly */}
      <div style={{ background: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', paddingBottom: '20px' }}>
        <Invoice inv={inv} format="a5" />
      </div>

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <Link to="/" className="btn ghost">Return to Shop</Link>
      </div>
    </div>
  );
}