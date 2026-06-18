// ============================================================================
// check-import-cic.mjs — REPORT dry-run dell'import CiC (azienda definitiva).
// Replica in locale la logica di syncCicMappings({dryRun:true}) SENZA deploy:
//   • legge config/cic da Firestore (token Reviso reali)
//   • costruisce gli indici CiC: barCode(UPPER)→productNumber, vatNumber→customerNumber
//   • incrocia con le collezioni Firestore `products` (id=codice POPS) e `users` (piva)
//   • stampa il report match/missing per prodotti e clienti.
//
// 100% SOLA LETTURA: nessuna scrittura su Firestore, nessuna chiamata POST/PUT a Reviso.
//
// Prerequisiti:
//   gcloud auth application-default login   (account info@inglesinaitaliana.it)
// Uso:
//   node risorsexCiC/check-import-cic.mjs
// (i token Reviso si leggono da config/cic; in alternativa REVISO_APP_SECRET /
//  REVISO_AGREEMENT_GRANT come env var li sovrascrivono, come fa cicConfig.ts)
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

// firebase-admin è installato in src/functions/node_modules → risolvilo da lì.
const here = path.dirname(fileURLToPath(import.meta.url));            // .../risorsexCiC
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep; // .../src/functions/
const require = createRequire(fnDir);
const admin = require('firebase-admin');

const PROJECT_ID = 'preventivatoreb2b-ii';
const up = (s) => String(s ?? '').toUpperCase().trim();

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJECT_ID });
const db = admin.firestore();

// ── config/cic (token + baseUrl), con fallback env come cicConfig.ts ──────────
async function getCicCreds() {
  const snap = await db.collection('config').doc('cic').get();
  const d = snap.exists ? snap.data() : {};
  // NB: il doc reale usa i campi `secret`/`agreement`; cicConfig.ts (prod) cerca
  // `appSecretToken`/`agreementGrantToken`. Accettiamo entrambi per il report.
  const appSecretToken = process.env.REVISO_APP_SECRET || d.appSecretToken || d.secret;
  const agreementGrantToken = process.env.REVISO_AGREEMENT_GRANT || d.agreementGrantToken || d.agreement;
  const baseUrl = d.baseUrl || 'https://rest.reviso.com';
  if (!appSecretToken || !agreementGrantToken) {
    throw new Error('Credenziali CiC mancanti (config/cic.appSecretToken/agreementGrantToken o env REVISO_*)');
  }
  return { appSecretToken, agreementGrantToken, baseUrl };
}

let CREDS;
async function reviso(pathname) {
  const res = await fetch(`${CREDS.baseUrl}${pathname}`, {
    headers: {
      'X-AppSecretToken': CREDS.appSecretToken,
      'X-AgreementGrantToken': CREDS.agreementGrantToken,
      'Content-Type': 'application/json',
    },
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!res.ok) throw new Error(`Reviso ${pathname} → ${res.status}: ${typeof json === 'string' ? json : JSON.stringify(json)}`);
  return json;
}

// ── indici CiC (stessa paginazione di cicProvider.ts) ─────────────────────────
async function buildProductBarcodeIndex() {
  const map = new Map();
  for (let page = 0, hasMore = true; hasMore && page < 50; page++) {
    const data = await reviso(`/products?pagesize=1000&skippages=${page}`);
    const items = data?.collection || [];
    for (const p of items) {
      if (p.barCode && p.productNumber != null) map.set(up(p.barCode), p.productNumber);
    }
    hasMore = items.length >= 1000;
  }
  return map;
}
async function buildCustomerVatIndex() {
  const map = new Map();
  for (let page = 0, hasMore = true; hasMore && page < 50; page++) {
    const data = await reviso(`/customers?pagesize=1000&skippages=${page}`);
    const items = data?.collection || [];
    for (const c of items) {
      if (c.vatNumber && c.customerNumber != null) map.set(String(c.vatNumber).trim(), c.customerNumber);
    }
    hasMore = items.length >= 1000;
  }
  return map;
}

(async () => {
  CREDS = await getCicCreds();

  // chi siamo? (conferma che NON è il trial)
  try {
    const self = await reviso('/self');
    console.log(`🏢 Azienda CiC: "${self?.company?.name || '?'}"  (vatNumber=${self?.company?.vatNumber || '?'})`);
  } catch (e) { console.log(`⚠️  /self non leggibile: ${e.message}`); }

  console.log('\n⏳ Costruisco gli indici dal catalogo CiC…');
  const [prodIdx, custIdx] = await Promise.all([buildProductBarcodeIndex(), buildCustomerVatIndex()]);
  console.log(`   catalogo CiC → prodotti(barCode): ${prodIdx.size}  ·  clienti(vatNumber): ${custIdx.size}`);

  const report = {
    cicCatalog: { products: prodIdx.size, customers: custIdx.size },
    products: { total: 0, matched: 0, missing: [] },
    customers: { total: 0, matched: 0, missing: [] },
  };

  // PRODOTTI: products/{codicePOPS} → barCode CiC
  const prodSnap = await db.collection('products').get();
  for (const doc of prodSnap.docs) {
    report.products.total++;
    if (prodIdx.get(up(doc.id)) != null) report.products.matched++;
    else if (report.products.missing.length < 100) report.products.missing.push(doc.id);
  }

  // CLIENTI: users.piva → vatNumber CiC
  const userSnap = await db.collection('users').get();
  for (const doc of userSnap.docs) {
    const piva = String(doc.data()?.piva ?? '').trim();
    if (!piva) continue;
    report.customers.total++;
    if (custIdx.get(piva) != null) report.customers.matched++;
    else if (report.customers.missing.length < 100) report.customers.missing.push(piva);
  }

  const pct = (m, t) => (t ? Math.round((m / t) * 1000) / 10 : 0);
  console.log('\n────────────────────────── REPORT IMPORT CiC ──────────────────────────');
  console.log(`PRODOTTI  POPS: ${report.products.total}  ·  match in CiC: ${report.products.matched} (${pct(report.products.matched, report.products.total)}%)  ·  MISSING: ${report.products.total - report.products.matched}`);
  console.log(`CLIENTI   POPS(con P.IVA): ${report.customers.total}  ·  match in CiC: ${report.customers.matched} (${pct(report.customers.matched, report.customers.total)}%)  ·  MISSING: ${report.customers.total - report.customers.matched}`);

  if (report.products.missing.length) {
    console.log(`\n⚠️  Prodotti senza match (codice POPS non trovato come barCode in CiC) — primi ${report.products.missing.length}:`);
    console.log('   ' + report.products.missing.join(', '));
  }
  if (report.customers.missing.length) {
    console.log(`\n⚠️  Clienti senza match (P.IVA non trovata come vatNumber in CiC) — primi ${report.customers.missing.length}:`);
    console.log('   ' + report.customers.missing.join(', '));
  }
  if (!report.products.missing.length && !report.customers.missing.length) {
    console.log('\n✅ Nessun missing: import allineato. (Resta da fare il write reale con syncCicMappings({dryRun:false}).)');
  }
  console.log('\nNB: report SOLO-LETTURA. Per scrivere cicProductId/cicCustomerNumber serve syncCicMappings({dryRun:false}).');
  process.exit(0);
})().catch((e) => { console.error('💥', e?.stack || e?.message || e); process.exit(1); });
