import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { onAuthStateChanged, signOut } from 'firebase/auth';

import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';

import { auth, db } from './firebase';
import { STR } from './i18n';
import { maxQty, unitPrice } from './lib';

const Ctx = createContext(null);

export const useApp = () => useContext(Ctx);

// Cart is kept in this browser.
// An untouched cart expires after 30 days.
const CART_KEY = 'rs_cart_v1';
const CART_DAYS = 30;

const loadCart = () => {
  try {
    const c = JSON.parse(localStorage.getItem(CART_KEY));

    if (c && Date.now() - c.updatedAt < CART_DAYS * 864e5) {
      return c.items;
    }
  } catch {
    // Ignore invalid cart data.
  }

  return [];
};

const saveCart = (items) => {
  try {
    localStorage.setItem(
      CART_KEY,
      JSON.stringify({
        items,
        updatedAt: Date.now(),
      })
    );
  } catch {
    // Ignore storage errors.
  }
};

export function AppProvider({ children }) {

  // ---- LANGUAGE

  const [lang, setLang] = useState(
    () => localStorage.getItem('rs_lang') || 'en'
  );

  useEffect(() => {
    localStorage.setItem('rs_lang', lang);

    document.documentElement.lang =
      lang === 'te' ? 'te' : 'en';
  }, [lang]);

  const t = useCallback(
    (k) => STR[lang][k] ?? STR.en[k] ?? k,
    [lang]
  );


  // ---- LIVE CATALOGUE

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [machines, setMachines] = useState([]);

  const [ready, setReady] = useState({
    p: false,
    c: false,
    m: false,
  });

  const [error, setError] = useState(null);

  useEffect(() => {

    const fail = (e) => {
      console.error('CATALOGUE FIRESTORE ERROR:', e);
      setError(e.message);
    };

    const mark = (k) => {
      setReady((r) => ({
        ...r,
        [k]: true,
      }));
    };

    const u1 = onSnapshot(
      query(
        collection(db, 'products'),
        where('status', '==', 'active')
      ),
      (s) => {
        setProducts(
          s.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }))
        );

        mark('p');
      },
      fail
    );

    const u2 = onSnapshot(
      collection(db, 'categories'),
      (s) => {
        setCategories(
          s.docs
            .map((d) => ({
              id: d.id,
              ...d.data(),
            }))
            .filter((c) => c.active !== false)
            .sort(
              (a, b) =>
                (a.order ?? 99) - (b.order ?? 99)
            )
        );

        mark('c');
      },
      fail
    );

    const u3 = onSnapshot(
      collection(db, 'machines'),
      (s) => {
        setMachines(
          s.docs
            .map((d) => ({
              id: d.id,
              ...d.data(),
            }))
            .filter((m) => m.active !== false)
        );

        mark('m');
      },
      fail
    );

    return () => {
      u1();
      u2();
      u3();
    };

  }, []);

  const loaded = ready.p && ready.c && ready.m;


  // ---- CART

  const [items, setItems] = useState(loadCart);
  const [drawer, setDrawer] = useState(false);
  const [toast, setToast] = useState(null);

  const change = useCallback((fn) => {
    setItems((prev) => {
      const n = fn(prev);
      saveCart(n);
      return n;
    });
  }, []);

  const flash = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);

  const addToCart = useCallback(
    (p, qty = 1) => {
      const cap = maxQty(p);

      change((prev) => {
        const cur = prev.find((i) => i.id === p.id);

        const next = Math.min(
          cap,
          (cur?.qty || 0) + qty
        );

        if (cur) {
          return prev.map((i) =>
            i.id === p.id
              ? { ...i, qty: next }
              : i
          );
        }

        return [
          ...prev,
          {
            id: p.id,
            qty: next,
          },
        ];
      });

      flash(`✓ ${t('added')}`);
    },
    [change, flash, t]
  );

  const setQty = useCallback(
    (id, qty) =>
      change((prev) =>
        prev.map((i) =>
          i.id === id
            ? { ...i, qty: Math.max(1, qty) }
            : i
        )
      ),
    [change]
  );

  const removeItem = useCallback(
    (id) =>
      change((prev) =>
        prev.filter((i) => i.id !== id)
      ),
    [change]
  );

  // NEW: Clear the entire cart
  const clearCart = useCallback(() => {
    change(() => []);
  }, [change]);


  // Remove cart lines for products that no longer exist
  // or are hidden once the catalogue has loaded.

  useEffect(() => {
    if (
      loaded &&
      items.some(
        (i) => !products.find((p) => p.id === i.id)
      )
    ) {
      change((prev) =>
        prev.filter((i) =>
          products.find((p) => p.id === i.id)
        )
      );
    }
  }, [loaded, products, items, change]);

  const lines = useMemo(
    () =>
      items
        .map((i) => ({
          product: products.find((p) => p.id === i.id),
          qty: i.qty,
        }))
        .filter((l) => l.product),
    [items, products]
  );

  const totals = useMemo(() => {
    let qty = 0;
    let subtotal = 0;
    let unpriced = 0;

    for (const l of lines) {
      qty += l.qty;

      const u = unitPrice(l.product);

      if (u == null) {
        unpriced += 1;
      } else {
        subtotal += u * l.qty;
      }
    }

    return {
      qty,
      subtotal,
      unpriced,
    };
  }, [lines]);


  // ---- ADMIN AUTHENTICATION

  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {

    let requestId = 0;

    const unsubscribe = onAuthStateChanged(
      auth,
      async (u) => {

        const currentRequest = ++requestId;

        setAuthReady(false);
        setAuthError(null);

        let r = null;
        let roleError = null;

        if (u) {
          try {

            const userRef = doc(db, 'users', u.uid);
            const s = await getDoc(userRef);

            r = s.exists() ? s.data().role : null;

          } catch (error) {

            console.error(
              'FIRESTORE ROLE ERROR:',
              error
            );

            roleError =
              error?.message || 'Unable to read user role';

          }
        }

        // Ignore an outdated authentication request.
        if (currentRequest !== requestId) {
          return;
        }

        setRole(r);
        setUser(u);
        setAuthError(roleError);
        setAuthReady(true);
      }
    );

    return () => {
      requestId++;
      unsubscribe();
    };

  }, []);

  const logout = useCallback(() => {
    return signOut(auth);
  }, []);


  // ---- CONTEXT VALUE

  const value = {
    lang,
    setLang,
    t,

    products,
    categories,
    machines,
    loaded,
    error,

    items,
    lines,
    totals,
    addToCart,
    setQty,
    removeItem,
    clearCart, // <-- Added clearCart to the context
    drawer,
    setDrawer,
    toast,

    user,
    role,
    authReady,
    authError,
    logout,
  };

  return (
    <Ctx.Provider value={value}>
      {children}
    </Ctx.Provider>
  );
}