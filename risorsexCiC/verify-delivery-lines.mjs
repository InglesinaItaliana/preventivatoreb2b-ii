// ============================================================================
// verify-delivery-lines.mjs — VERIFICA che le tariffe di consegna entrino in CiC
// col prezzo giusto e il prodotto corretto.
//
// Per ogni tariffa di settings/pricing.delivery_tariffs costruisce una riga
// (stessa logica del CicProvider: code → barCode match in CiC → productNumber,
// altrimenti fallback VARIE), crea UN ordine di prova in CiC sul cliente di test,
// rilegge il documento, confronta unitNetPrice/totalNet riga-per-riga col valore
// atteso, poi CANCELLA l'ordine (gli /orders non sono documenti fiscali emessi).
//
// SICUREZZA: default DRY-RUN (mostra cosa creerebbe, NON scrive).
//   Esegui davvero con:  node risorsexCiC/verify-delivery-lines.mjs --apply
//   Cliente di test override:  TEST_CUSTOMER=46 node ... (default 46 = Gionata Srl)
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const TEST_CUSTOMER = Number(process.env.TEST_CUSTOMER || 46);

// Replica della mappa nome-tariffa → codice POPS (src/views/BuilderView.vue:451)
const CODICI_SPEDIZIONE = {
  'Consegna Diretta V1': 'L001',
  'Consegna Diretta V2': 'L002',
  'Consegna Diretta V3': 'L003',
  'Spedizione': 'L004',
  'Consegna Diretta V4': 'L005',
  'Consegna Diretta V5': 'L006',
  'Consegna Diretta V6': 'L007',
  'Consegna Diretta V7': 'L008',
  'Consegna Diretta V8': 'L009',
  'Ritiro in sede': 'L010',
};

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
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

console.log(APPLY ? '🔴 APPLY — creo e poi cancello un ordine di prova\n' : '🟢 DRY-RUN — nessuna scrittura (usa --apply per eseguire il test reale)\n');

// 1) tariffe
const tariffs = (await db.collection('settings').doc('pricing').get()).data()?.delivery_tariffs || {};
const names = Object.keys(tariffs);

// 2) per ogni tariffa risolvi il prodotto CiC (come a regime: code → barCode CiC)
async function resolveProduct(name) {
  const code = CODICI_SPEDIZIONE[name];
  if (!code) return { code: null, productNumber: cfg.genericProductNumber, via: 'fallback VARIE' };
  const r = await reviso('GET', '/products?filter=' + encodeURIComponent(`barCode$eq:${code}`));
  const p = (r.json?.collection || [])[0];
  if (p) return { code, productNumber: p.productNumber, via: `barCode ${code} → "${p.name}"` };
  return { code, productNumber: cfg.genericProductNumber, via: `barCode ${code} non trovato → VARIE` };
}

const rows = [];
for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const price = Number(tariffs[name]) || 0;
  const prod = await resolveProduct(name);
  rows.push({ i, name, price, ...prod });
}

console.log('Righe che verranno create (1 per tariffa):');
rows.forEach((r) => console.log(`   • ${r.name.padEnd(22)} ${String(r.price + '€').padStart(7)}  prodotto=${r.productNumber}  [${r.via}]`));

if (!APPLY) { console.log('\n🟢 Dry-run completato. Rilancia con --apply per creare l\'ordine di prova, confrontare e cancellare.'); process.exit(0); }

// 3) crea l'ordine di prova (payload allineato a CicProvider.createSalesDoc)
const payload = {
  date: new Date().toISOString().split('T')[0],
  currency: 'EUR',
  paymentTerms: { paymentTermsNumber: cfg.defaultPaymentTermsNumber },
  customer: { customerNumber: TEST_CUSTOMER },
  recipient: { name: 'TEST verifica consegne', vatZone: { vatZoneNumber: cfg.domesticVatZone } },
  layout: { layoutNumber: cfg.layoutNumber },
  notes: { heading: '*** ORDINE DI PROVA — verifica tariffe consegna (verrà cancellato) ***' },
  lines: rows.map((r) => ({
    lineNumber: r.i + 1,
    description: r.name,
    quantity: 1,
    unitNetPrice: r.price,
    discountPercentage: 0,
    product: { productNumber: r.productNumber, self: `${cfg.baseUrl}/products/${encodeURIComponent(r.productNumber)}` },
    vatInfo: { vatAccount: { vatCode: cfg.vatCode } },
  })),
};

console.log('\n⏳ Creo ordine di prova…');
const created = await reviso('POST', '/orders', payload);
if (!created.ok || created.json?.id == null) { console.error('❌ creazione fallita:', created.status, JSON.stringify(created.json)); process.exit(1); }
const orderId = created.json.id;
console.log(`   creato order id=${orderId} number=${created.json.number ?? '?'}`);

// 4) rileggi e confronta
const fresh = await reviso('GET', `/orders/${orderId}`);
const lines = fresh.json?.lines || [];
console.log('\n────────────── CONFRONTO PREZZI (atteso vs CiC) ──────────────');
let allOk = true;
for (const r of rows) {
  const ln = lines.find((l) => l.lineNumber === r.i + 1) || lines[r.i];
  const cicUnit = ln?.unitNetPrice ?? ln?.unitNetPrice;
  const cicTot = ln?.totalNetAmount ?? ln?.netAmount;
  const prodOk = String(ln?.product?.productNumber) === String(r.productNumber);
  const priceOk = round2(cicUnit) === round2(r.price) && round2(cicTot) === round2(r.price);
  if (!priceOk || !prodOk) allOk = false;
  console.log(`   ${priceOk && prodOk ? '✅' : '❌'} ${r.name.padEnd(22)} atteso=${r.price}€  CiC unit=${cicUnit} tot=${cicTot}  prod=${ln?.product?.productNumber}${prodOk ? '' : ' (≠ ' + r.productNumber + ')'}`);
}
console.log(`\nTotale doc CiC: net=${fresh.json?.netAmount} vat=${fresh.json?.vatAmount} gross=${fresh.json?.grossAmount}`);

// 5) cancella l'ordine di prova
console.log('\n🧹 Cancello l\'ordine di prova…');
const del = await reviso('DELETE', `/orders/${orderId}`);
console.log(del.ok ? `   ✅ ordine ${orderId} cancellato` : `   ⚠️ cancellazione fallita (${del.status}) — cancellalo a mano: order id=${orderId}`);

console.log('\n' + (allOk ? '✅ TUTTE le tariffe entrano col prezzo e il prodotto corretti.' : '❌ Alcune righe NON tornano — vedi sopra.'));
process.exit(allOk ? 0 : 2);
