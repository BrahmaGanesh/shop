import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

export default function ShareBillPage() {
  const { id } = useParams();
  const [billData, setBillData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchBill = async () => {
      try {
        const docRef = doc(db, 'sharedBills', id);
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          setBillData(snap.data());
        } else {
          setError('Bill not found or expired.');
        }
      } catch (err) {
        setError('Could not load the bill.');
      }
    };
    fetchBill();
  }, [id]);

  if (error) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}><h2>{error}</h2></div>;
  if (!billData) return <div style={{ padding: 40, textAlign: 'center', fontFamily: 'sans-serif' }}><h2>Loading bill...</h2></div>;

  return (
    <div style={{ background: '#eef1f2', minHeight: '100vh', padding: '20px 10px', display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'sans-serif' }}>
      <img 
        src={billData.imageUrl} 
        alt="Bill" 
        style={{ maxWidth: '100%', width: '600px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', borderRadius: '8px' }} 
      />
      <a 
        href={billData.imageUrl} 
        download={`Bill-${id}.jpg`} 
        style={{ marginTop: '20px', padding: '12px 24px', background: '#00337a', color: '#fff', textDecoration: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px' }}
      >
        ⬇️ Download Bill Image
      </a>
    </div>
  );
}