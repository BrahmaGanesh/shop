import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { DEFAULT_SETTINGS } from '../../functions/billing.js';
import { db } from '../firebase';
import { useApp } from '../context';
import { Logo } from '../components';
import ProductsAdmin from './ProductsAdmin';
import ProductForm from './ProductForm';
import CategoriesAdmin from './CategoriesAdmin';
import MachinesAdmin from './MachinesAdmin';
import DataManagement from './DataManagement';
import Billing from './Billing';
import BillsAdmin from './BillsAdmin';
import StockAdmin from './StockAdmin';
import SettingsAdmin from './SettingsAdmin';
import './admin.css';

const AdminCtx = createContext(null);
export const useAdmin = () => useContext(AdminCtx);

function Owner({ children }) {
  const { role } = useApp();
  return role === 'owner' ? children : <p className="a-empty">This section is for the owner only.</p>;
}

function Dashboard() {
  const { products, categories, machines } = useAdmin();
  const { role } = useApp();
  const live = products.filter((p) => p.status === 'active');
  const stats = [
    ['Active products', live.length, '/admin/products?status=active'],
    ['Inactive / archived', products.length - live.length, '/admin/products?status=all'],
    ['Categories', categories.length, '/admin/categories'],
    ['Machines', machines.length, '/admin/machines'],
    ['Active products without a price', live.filter((p) => p.mrp == null && p.sellingPrice == null).length, '/admin/products?status=active'],
    ['Active products without a photo', live.filter((p) => !p.imageUrls?.length).length, '/admin/products?status=active'],
    ['Active products not linked to any machine', live.filter((p) => !p.compatibleMachines?.length).length, '/admin/products?status=active'],
  ];
  return (
    <>
      <h1>Dashboard</h1>
      <div className="stats">
        {stats.map(([k, v, to]) => (role === 'owner'
          ? <Link key={k} to={to} className="stat"><b>{v}</b><span>{k}</span></Link>
          : <div key={k} className="stat"><b>{v}</b><span>{k}</span></div>))}
      </div>
      <p className="a-note">Sales totals, reports and low-stock alerts on this page arrive in the next step.</p>
    </>
  );
}

export default function AdminShell() {
  const { user, role, logout } = useApp();
  const [data, setData] = useState({ products: [], categories: [], machines: [] });
  const [loaded, setLoaded] = useState({});
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  useEffect(() => onSnapshot(doc(db, 'settings', 'shop'), (s) => setSettings({ ...DEFAULT_SETTINGS, ...(s.data() || {}) }), () => {}), []);
  useEffect(() => {
    const sub = (name, sort) => onSnapshot(collection(db, name), (s) => {
      setData((d) => ({ ...d, [name]: s.docs.map((x) => ({ id: x.id, ...x.data() })).sort(sort) }));
      setLoaded((l) => ({ ...l, [name]: true }));
    }, (e) => setError(e.message));
    const byOrder = (a, b) => (a.order ?? 99) - (b.order ?? 99);
    const byName = (a, b) => `${a.brand} ${a.model}`.localeCompare(`${b.brand} ${b.model}`);
    const off = [sub('products', (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)), sub('categories', byOrder), sub('machines', byName)];
    return () => off.forEach((f) => f());
  }, []);
  const value = useMemo(() => ({ ...data, settings, ready: loaded.products && loaded.categories && loaded.machines }), [data, loaded, settings]);
  const owner = role === 'owner';
  return (
    <AdminCtx.Provider value={value}>
      <div className="a-shell">
        <aside className="a-side">
          <Link to="/admin" className="a-brand"><Logo size={30} /><span>Admin</span></Link>
          <nav>
            <NavLink to="/admin" end>Dashboard</NavLink>
            <NavLink to="/admin/billing">New bill</NavLink><NavLink to="/admin/bills">Bills</NavLink>
            {owner && <><NavLink to="/admin/products">Products</NavLink><NavLink to="/admin/stock">Stock</NavLink><NavLink to="/admin/categories">Categories</NavLink><NavLink to="/admin/machines">Machines</NavLink><NavLink to="/admin/data">Data (JSON, backups)</NavLink><NavLink to="/admin/settings">Shop settings</NavLink></>}
          </nav>
          <div className="a-user">
            <small>{user.email} ({role})</small>
            <Link to="/" target="_blank">View shop</Link>
            <button onClick={logout}>Sign out</button>
          </div>
        </aside>
        <main className="a-main">
          {error && <p className="a-err">Could not load data: {error}</p>}
          {!value.ready && !error ? <p className="a-empty">Loading…</p> : (
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="billing" element={<Billing />} />
              <Route path="bills" element={<BillsAdmin />} />
              <Route path="stock" element={<Owner><StockAdmin /></Owner>} />
              <Route path="settings" element={<Owner><SettingsAdmin /></Owner>} />
              <Route path="products" element={<Owner><ProductsAdmin /></Owner>} />
              <Route path="products/new" element={<Owner><ProductForm /></Owner>} />
              <Route path="products/:id/edit" element={<Owner><ProductForm /></Owner>} />
              <Route path="categories" element={<Owner><CategoriesAdmin /></Owner>} />
              <Route path="machines" element={<Owner><MachinesAdmin /></Owner>} />
              <Route path="data" element={<Owner><DataManagement /></Owner>} />
              <Route path="*" element={<p className="a-empty">Page not found.</p>} />
            </Routes>
          )}
        </main>
      </div>
    </AdminCtx.Provider>
  );
}
export { AdminCtx };