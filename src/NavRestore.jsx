import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function NavRestore() {
  const location = useLocation();
  const nav = useNavigate();

  // Save current location whenever it changes
  useEffect(() => {
    const path = location.pathname;

    // Do NOT save these pages to history:
    // - Home page ('/')
    // - Categories list ('/categories')
    // - Admin pages ('/admin/...')
    // - Login ('/admin/login')
    // - Public bill routes ('/bill/...' or '/share/...')
    if (
      path !== '/' &&
      path !== '/categories' &&
      !path.startsWith('/admin') &&
      !path.startsWith('/bill') &&
      !path.startsWith('/share')
    ) {
      localStorage.setItem('lastVisitedRoute', path + location.search);
    } else if (path === '/' || path === '/categories') {
      // If user is on Home or Categories, clear the saved route
      // so they don't get restored to a deep page when they just wanted the home
      localStorage.removeItem('lastVisitedRoute');
    }
  }, [location]);

  // On app launch, restore the last visited page (only once)
  useEffect(() => {
    const saved = localStorage.getItem('lastVisitedRoute');

    // Only redirect if we are currently on the Home page on first mount
    if (saved && location.pathname === '/') {
      // Clear it so it only redirects once
      localStorage.removeItem('lastVisitedRoute');
      // Navigate to the saved page
      nav(saved, { replace: true });
    }
  }, []); // Empty array = run only on mount

  return null; // This component does not render anything
}