import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getFunctions } from 'firebase/functions';
// Firebase Storage is intentionally NOT initialised any more.
// Images are stored as Base64 data URLs inside Firestore documents.
// If you still need to read/delete old files uploaded before the migration,
// import { getStorage } from 'firebase/storage' and create it on demand
// in a one-off migration script — do not add it back to the app bundle.

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  // storageBucket may stay in env if you plan a one-off migration script; the app no longer uses it.
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const db = getFirestore(app);
export const auth = getAuth(app);
export const functions = getFunctions(app, import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south1');