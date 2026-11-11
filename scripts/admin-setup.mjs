
// Usage:
//   node scripts/admin-setup.mjs seed
//   node scripts/admin-setup.mjs owner you@example.com "a-strong-password"
//   node scripts/admin-setup.mjs staff counter@example.com "another-password"
//
// Authentication:
//   Uses Google Application Default Credentials (ADC).
//   First run: gcloud auth application-default login

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { categories, products } from './seedData.mjs';

// Firebase project configuration
initializeApp({
  credential: applicationDefault(),
  projectId: 'shop-items-36bb7',
});

const db = getFirestore();
const [cmd, email, password] = process.argv.slice(2);

// Seed categories and products
if (cmd === 'seed') {
  // Safe to re-run: existing documents are never overwritten.
  let added = 0;
  let skipped = 0;

  for (const [i, c] of categories.entries()) {
    const ref = db.doc(`categories/${c.id}`);

    if ((await ref.get()).exists) {
      skipped++;
      continue;
    }

    await ref.set({
      ...c,
      order: i + 1,
      active: true,
      createdAt: FieldValue.serverTimestamp(),
    });

    added++;
  }

  for (const p of products) {
    const ref = db.doc(`products/${p.id}`);

    if ((await ref.get()).exists) {
      skipped++;
      continue;
    }

    await ref.set({
      ...p,
      sku: '',
      description: '',
      sellingPrice: null,
      stockEnabled: false,
      stockQuantity: null,
      lowStockThreshold: null,
      compatibleMachines: [],
      imageUrls: [],
      status: 'active',
      featured: false,
      popular: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    added++;
  }

  console.log(`Seed done. Added ${added}, skipped ${skipped}.`);
}

// Create or update owner/staff account
else if ((cmd === 'owner' || cmd === 'staff') && email && password) {
  const auth = getAuth();

  let user;

  try {
    user = await auth.getUserByEmail(email);
  } catch (error) {
    if (error.code !== 'auth/user-not-found') {
      throw error;
    }

    user = await auth.createUser({
      email,
      password,
    });
  }

  await db.doc(`users/${user.uid}`).set({
    role: cmd,
    email,
  });

  console.log(
    `${email} is now ${cmd === 'owner' ? 'an owner' : 'a staff member'}.`
  );
}

// Invalid command
else {
  console.log(
    'Usage: seed | owner <email> <password> | staff <email> <password>'
  );
}
