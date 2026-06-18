// ============================================================================
// sync-cic-mappings.mjs — equivalente locale di syncCicMappings({dryRun:false}).
// Stessa logica della callable (src/functions/index.ts): costruisce gli indici
// CiC (barCode→productNumber, vatNumber→customerNumber) e scrive:
//   • products/{code}.cicProductId      (match per barCode == codice POPS upper)
//   • users/{uid}.cicCustomerNumber     (match per vatNumber == users.piva)
//
// SICUREZZA: default DRY-RUN (solo report). Scrive con:  --apply
//   node risorsexCiC/sync-cic-mappings.mjs --apply
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
const cfg = (await db.collection('config').doc('cic').get()).data();
const CREDS = { secret: cfg.appSecretToken, agreement: cfg.agreementGrantToken, baseUrl: cfg.baseUrl };
const up = (s) => String(s ?? '').toUpperCase().trim();

async function get(pathname) {
  const r = await fetch(`${CREDS.baseUrl}${pathname}`, { headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' } });
  const t = await r.text(); try { return JSON.parse(t); } catch { return t; }
}
async function buildIndex(coll, keyField, valField, transform = (x) => x) {
  const map = new Map();
  for (let page = 0, more = true; more && page < 50; page++) {
    const data = await get(`/${coll}?pagesize=1000&skippages=${page}`);
    const items = data?.collection || [];
    for (const it of items) if (it[keyField] && it[valField] != null) map.set(transform(String(it[keyField])), it[valField]);
    more = items.length >= 1000;
  }
  return map;
}

const [prodIdx, custIdx] = await Promise.all([
  buildIndex('products', 'barCode', 'productNumber', (s) => s.toUpperCase().trim()),
  buildIndex('customers', 'vatNumber', 'customerNumber', (s) => s.trim()),
]);

console.log(APPLY ? '🔴 APPLY — scrivo cicProductId / cicCustomerNumber\n' : '🟢 DRY-RUN — solo report (usa --apply per scrivere)\n');
console.log(`Catalogo CiC → prodotti(barCode): ${prodIdx.size}  ·  clienti(vatNumber): ${custIdx.size}\n`);

const report = { products: { total: 0, matched: 0, written: 0, missing: [] }, customers: { total: 0, matched: 0, written: 0, missing: [] } };
let batch = db.batch(), pending = 0;
const queue = async (ref, obj) => { batch.update(ref, obj); if (++pending >= 450) { if (APPLY) await batch.commit(); batch = db.batch(); pending = 0; } };

// PRODOTTI
for (const doc of (await db.collection('products').get()).docs) {
  report.products.total++;
  const pn = prodIdx.get(up(doc.id));
  if (pn != null) { report.products.matched++; if (APPLY) { await queue(doc.ref, { cicProductId: pn }); report.products.written++; } }
  else if (report.products.missing.length < 100) report.products.missing.push(doc.id);
}
// CLIENTI
for (const doc of (await db.collection('users').get()).docs) {
  const piva = String(doc.data()?.piva ?? '').trim();
  if (!piva) continue;
  report.customers.total++;
  const cn = custIdx.get(piva);
  if (cn != null) { report.customers.matched++; if (APPLY) { await queue(doc.ref, { cicCustomerNumber: cn }); report.customers.written++; } }
  else if (report.customers.missing.length < 100) report.customers.missing.push(piva);
}
if (APPLY && pending > 0) await batch.commit();

console.log(`PRODOTTI  totale POPS: ${report.products.total}  ·  match: ${report.products.matched}  ·  scritti: ${report.products.written}  ·  missing: ${report.products.total - report.products.matched}`);
console.log(`CLIENTI   totale(con P.IVA): ${report.customers.total}  ·  match: ${report.customers.matched}  ·  scritti: ${report.customers.written}  ·  missing: ${report.customers.total - report.customers.matched}`);
if (report.products.missing.length) console.log(`\n⚠️ prodotti senza match: ${report.products.missing.join(', ')}`);
if (report.customers.missing.length) console.log(`\n⚠️ clienti senza match (P.IVA): ${report.customers.missing.join(', ')}`);
console.log('\n' + (APPLY ? '✅ Sync completato (cicProductId/cicCustomerNumber scritti).' : '🟢 Dry-run completato. Rilancia con --apply.'));
process.exit(0);
