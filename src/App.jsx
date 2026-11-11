import {
  BrowserRouter,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';

import { AppProvider } from './context';
import { db } from './firebase';
import { DEFAULT_SETTINGS } from '../functions/billing.js';
import ShareBillPage from './ShareBillPage';

import {
  BottomNav,
  CartDrawer,
  Header,
  Toast,
} from './components';

import AdminShell, { AdminCtx } from './admin/AdminShell';
import BillScannerPage from './BillScannerPage'; // NEW IMPORT for the QR scanner

import {
  AdminGate,
  AdminLogin,
  CartPage,
  CategoriesPage,
  FinderPage,
  Home,
  NotFound,
  ProductPage,
  ProductsPage,
} from './pages';

function Shop() {
  const { pathname } = useLocation();

  // Scroll to the top whenever the page changes
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return (
    <>
      <Header />

      <main>
        <Outlet />
      </main>

      <footer className="ft">NEW SRI RAMA LATHE WORKS</footer>

      <BottomNav />
      <CartDrawer />
      <Toast />
    </>
  );
}

// Storefront-only settings bridge.
// The admin panel nests its own AdminCtx.Provider inside AdminShell, so pages
// under /admin/* see the full admin context (products, categories, machines,
// settings, ready). The storefront only needs `settings` — for the cart →
// bill preview to print the real shop name, address and phone.
function SettingsBridge({ children }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  useEffect(
    () =>
      onSnapshot(
        doc(db, 'settings', 'shop'),
        (s) => setSettings({ ...DEFAULT_SETTINGS, ...(s.data() || {}) }),
        () => {}
      ),
    []
  );

  return <AdminCtx.Provider value={{ settings }}>{children}</AdminCtx.Provider>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <SettingsBridge>
          <Routes>
            {/* Admin login */}
            <Route
              path="/admin/login"
              element={<AdminLogin />}
            />

            {/* Admin dashboard */}
            <Route
              path="/admin/*"
              element={
                <AdminGate>
                  <AdminShell />
                </AdminGate>
              }
            />
<Route path="/share/:id" element={<ShareBillPage />} />
            {/* PUBLIC DIGITAL BILL ROUTE (Scanned via QR Code) */}
            <Route path="/bill/:id" element={<BillScannerPage />} />

            {/* Customer website */}
            <Route element={<Shop />}>
              <Route index element={<Home />} />

              <Route
                path="products"
                element={<ProductsPage />}
              />

              <Route
                path="product/:id"
                element={<ProductPage />}
              />

              <Route
                path="categories"
                element={<CategoriesPage />}
              />

              <Route
                path="finder"
                element={<FinderPage />}
              />

              <Route
                path="cart"
                element={<CartPage />}
              />

              <Route
                path="*"
                element={<NotFound />}
              />
            </Route>
          </Routes>
        </SettingsBridge>
      </AppProvider>
    </BrowserRouter>
  );
}