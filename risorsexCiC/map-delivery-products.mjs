// ============================================================================
// map-delivery-products.mjs — Parte A della mappatura "ogni consegna al suo prodotto".
//   • crea in CiC i 6 prodotti consegna mancanti (V4-V8 + Ritiro in sede), barCode L005-L010, gruppo 3 (IVA 22%)
//   • crea i doc Firestore products/{L005..L010} (categoria CONSEGNA) con cicProductId valorizzato
//   • popola cicProductId sui doc esistenti L001-L004 (→ 39805076..39805079)
//
// Idempotente: se il prodotto CiC (barCode) esiste già lo riusa; i doc Firestore usano set(merge).
// SICUREZZA: default DRY-RUN. Esegui con:  node risorsexCiC/map-delivery-products.mjs --apply
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

async function reviso(method, pathname, body) {
  const res = await fetch(`${CREDS.baseUrl}${pathname}`, {
    method,
    headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

// Nuovi prodotti consegna da creare (barCode = codice POPS)
const NEW = [
  { code: 'L005', name: 'Consegna Diretta V4', price: 400 },
  { code: 'L006', name: 'Consegna Diretta V5', price: 40 },
  { code: 'L007', name: 'Consegna Diretta V6', price: 65 },
  { code: 'L008', name: 'Consegna Diretta V7', price: 160 },
  { code: 'L009', name: 'Consegna Diretta V8', price: 110 },
  { code: 'L010', name: 'Ritiro in sede', price: 0 },
];
// Esistenti: solo popolare cicProductId
const EXISTING = [
  { code: 'L001', cicProductId: 39805076 },
  { code: 'L002', cicProductId: 39805077 },
  { code: 'L003', cicProductId: 39805078 },
  { code: 'L004', cicProductId: 39805079 },
];

console.log(APPLY ? '🔴 APPLY — scrivo davvero\n' : '🟢 DRY-RUN — nessuna scrittura (usa --apply)\n');

// ── A1) crea prodotti CiC mancanti + doc Firestore ───────────────────────────
console.log('① Prodotti consegna mancanti (CiC + Firestore products):');
for (const it of NEW) {
  // riusa se barCode già presente in CiC
  const found = await reviso('GET', '/products?filter=' + encodeURIComponent(`barCode$eq:${it.code}`));
  let productNumber = (found.json?.collection || [])[0]?.productNumber;
  if (productNumber != null) {
    console.log(`   • ${it.code} "${it.name}" → CiC già presente (productNumber=${productNumber})`);
  } else {
    const payload = { productNumber: it.code, name: it.name, barCode: it.code, productGroup: { productGroupNumber: 3 }, salesPrice: it.price };
    if (APPLY) {
      const r = await reviso('POST', '/products', payload);
      if (!r.ok || r.json?.productNumber == null) { console.error(`   ❌ ${it.code} creazione CiC fallita:`, r.status, JSON.stringify(r.json)); process.exit(1); }
      productNumber = r.json.productNumber;
      console.log(`   • ${it.code} "${it.name}" → CiC creato productNumber=${productNumber}`);
    } else {
      console.log(`   • ${it.code} "${it.name}" → CiC POST ${JSON.stringify(payload)} (dry-run)`);
      productNumber = '(auto)';
    }
  }
  // doc Firestore products/{code}
  const doc = {
    code: it.code, name: it.name, category: 'CONSEGNA',
    net_price: it.price, gross_price: 0, description: null, default_vat: null, uom: null,
    cicProductId: productNumber,
    raw_data: { code: it.code, name: it.name, net_price: it.price, category: 'CONSEGNA' },
  };
  if (APPLY) {
    await db.collection('products').doc(it.code).set({ ...doc, lastSync: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.log(`        Firestore products/${it.code} scritto (cicProductId=${productNumber})`);
  } else {
    console.log(`        Firestore products/${it.code} set(merge) cicProductId=${productNumber} (dry-run)`);
  }
}

// ── A2) popola cicProductId su L001-L004 ─────────────────────────────────────
console.log('\n② cicProductId sui prodotti consegna esistenti:');
for (const it of EXISTING) {
  if (APPLY) {
    await db.collection('products').doc(it.code).set({ cicProductId: it.cicProductId }, { merge: true });
    console.log(`   • products/${it.code}.cicProductId = ${it.cicProductId} ✅`);
  } else {
    console.log(`   • products/${it.code}.cicProductId = ${it.cicProductId} (dry-run)`);
  }
}

console.log('\n' + (APPLY ? '✅ Parte A completata.' : '🟢 Dry-run completato. Rilancia con --apply.'));
process.exit(0);
