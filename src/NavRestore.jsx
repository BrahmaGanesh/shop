import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function NavRestore() {
  const location = useLocation();
  const nav = useNavigate();

  // Save current location whenever it changes
  useEffect(() => {
    if (location.pathname !== '/' && location.pathname !== '/admin/login') {
      localStorage.setItem('lastVisitedRoute', location.pathname + location.search);
    }
  }, [location]);

  // On app launch, restore the last visited page (only once)
  useEffect(() => {
    const saved = localStorage.getItem('lastVisitedRoute');
    if (saved && location.pathname === '/') {
      // Clear it so it only redirects once
      localStorage.removeItem('lastVisitedRoute');
      // Navigate to the saved page
      nav(saved, { replace: true });
    }
  }, []); // Empty array = run only on mount

  return null; // This component does not render anything
}