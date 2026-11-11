# Rotavator Spares – Phases 1–5a (Customer Site, Admin, JSON/Backups, Billing and Stock)

## What works now
- Customer site: home, categories, all products with search/filters/sort, product page, machine finder, cart (drawer + full page), English/తెలుగు, mobile bottom navigation.
- Live data from Firestore: any change in the database shows on the site instantly.
- Cart saved in the browser; an untouched cart expires after 30 days.
- Admin login with owner/staff roles. `/admin` is protected by Firebase Auth and by Firestore rules.
- Security rules: the public can read only `status == "active"` products. Only an owner can write.
- Your 25 products and 11 categories are loaded by a seed script. Nothing is invented: unpriced items show "Price Not Added".

## Phase 3: Admin catalogue (owner login at /admin)
- **Products**: table with search, status and category filters, select-many with bulk Activate / Deactivate / Archive / Change category (with confirmation), and an Actions menu per row (Edit, Duplicate, Activate/Deactivate, Archive, Restore, Delete permanently).
- **Edit page** `/admin/products/<id>/edit`: every field from your specification, including private purchase price, multiple photos (camera or gallery, auto-resized), stock settings and machine compatibility. The Product ID can be set only when creating and never changes afterwards.
- **Soft delete**: DELETE PRODUCT archives (hidden but recoverable). Permanent deletion is possible only from the Archived list.
- **Categories**: add, edit English and Telugu names, emoji or uploaded icon, show/hide, reorder, delete (blocked while products use it).
- **Machines**: add, edit, photo, show/hide, delete, and assign spare parts to a machine (or assign machines on the product page). One part can fit many machines.
- **Activity log**: every create, edit, archive, delete and bulk change is written to the `activity` collection (who, what, when). A viewer screen comes with Phase 4/5.
- Staff accounts see only the dashboard; owner-only pages are blocked in the app and by the database rules.

## Phase 4: JSON import/export and backups (Admin → Data)
- **Export** with filters (active, archived, one category, products you pick). **Empty template** with every supported field.
- **Edit outside the site**: open the file in any text editor. Products are matched by `id`, never by name. `category` is the English category name; `compatibleMachines` uses machine ids (a reference list is in the file).
- **Import** in 5 screens: select file → validate → preview and options → confirm → result. Checks JSON syntax, schema version, ids, duplicates, categories, prices, stock numbers, image links and machine references. Formulas/scripts and embedded image data are rejected.
- **Modes**: add + update (default), add only, update only, full replace (archives products missing from the file; backup and typed confirmation required).
- **Field selection**: choose which fields to update. Stock fields are OFF by default (importing stock quantities does not write stock history). Fields missing from a record are never changed, and photos are kept unless `imageUrls` is supplied.
- **Safe commit**: a backup is saved first. Up to about 390 changes are written in one all-or-nothing batch. Larger imports run in several batches and are rolled back automatically if a later one fails.
- **Error report** (CSV) for rejected records. **History** tab shows every import, export, backup and restore with admin and time.
- **Backups**: full backup (products incl. private purchase prices, categories, machines) saved in the database and downloaded. Restore from a saved backup or a file, with a safety backup taken first.

## Phase 5a: Billing, invoices, stock, settings
- **New bill** (owner and staff): search or browse by category, tap to add, change quantity (and price where allowed), discount in % or ₹, optional customer name/phone, payment method and amount paid, balance due or change. Phone layout has Products / Bill tabs.
- **Backend billing**: the bill is created by the `createInvoice` Cloud Function. It re-reads prices and stock from the database, calculates totals, assigns the next invoice number and updates stock inside ONE transaction. A product price or discount the browser sends is checked against staff permissions. Pressing the button twice or retrying after a network drop cannot create two bills.
- **Stock**: when tracking is on, bills reduce stock and write a history entry; selling above stock is refused unless the owner uses the override. Tracking off = no limits and no changes. **Stock** page: low-stock list, owner-only Adjust (set or add/remove, reason required) and full history.
- **Invoices**: Print A4, Print 80 mm thermal receipt, Download PDF, New bill, and **Bills** (history with search and date filter; staff see only their own bills). Each invoice keeps its own copy of product names, prices and shop details, so later edits or deletions never change old bills.
- **Shop settings** (owner): shop name, address, phone, GSTIN, invoice prefix, footer, payment methods, tax (OFF by default: tax is added only if you tick it; exclusive or inclusive; a product's own tax % overrides the default), round-off, staff price-edit permission and staff discount limit.
- Stock quantity in the product editor is now read-only for existing products (use Stock → Adjust) so a stale form can never overwrite live stock.

### Deploying the backend (needed for billing and stock adjustment)
1. Upgrade the Firebase project to the **Blaze** (pay-as-you-go) plan. A small shop stays within the free allowance, but a card is required.
2. `cd functions && npm install && cd ..`
3. `firebase deploy --only functions,firestore:rules,storage`
4. Functions run in `asia-south1` (Mumbai). To change, edit `region` in `functions/index.js` and `VITE_FUNCTIONS_REGION` in `.env`/Netlify.
5. Create a staff login: `npm run make-staff -- counter@example.com "password"`.
6. In Admin → Shop settings, fill in your shop details before the first bill.

**Important:** rules changed in phases 3, 4 and 5a. Run `firebase deploy --only firestore:rules,storage` again.

## Not built yet (next phases)
dashboard sales figures, reports with CSV export, bulk price/stock update, user management screen, cancelling/returning a bill, recording later payment of balance due.

## Setup (about 20 minutes)
1. **Firebase project**: create one at console.firebase.google.com. Enable **Authentication → Email/Password**, **Firestore Database** (production mode) and **Storage**.
2. **Web app config**: Project settings → Your apps → add a Web app. Copy `.env.example` to `.env` and fill in the values.
3. `npm install`
4. **Deploy security rules** (do this before going public):
   `npm i -g firebase-tools && firebase login && firebase use --add && firebase deploy --only firestore:rules,storage`
5. **Service account key**: Project settings → Service accounts → Generate new private key. Save it as `serviceAccountKey.json` in this folder (never share or commit it).
6. `npm run seed` loads the categories and 25 products. It is safe to run again; it never overwrites existing records.
7. `npm run make-owner -- you@example.com "a-strong-password"` creates your owner login.
8. `npm run dev`, then open the printed address. Admin login is at `/admin/login`.
9. **Deploy**: push to GitHub, connect the repo in Netlify (settings are in `netlify.toml`), and add the same `VITE_FIREBASE_*` values under Netlify → Environment variables.

## Testing the machine finder
Sign in at `/admin/login`, open Machines, add a machine, tick the spare parts that fit it, then pick it in the shop's Machine Finder. No machines or compatibility are pre-filled.

## Data model
`products/{id}` – public fields incl. `status` (active | inactive | archived), `mrp`, `sellingPrice`, stock fields, `compatibleMachines` (machine IDs), `imageUrls`.
`productsPrivate/{id}` – owner-only (purchase price will live here, never in the public product).
`categories/{id}`, `machines/{id}`, `users/{uid}` (role: owner | staff).
