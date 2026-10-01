// ============================================================================
// diag-technoform.mjs — DIAGNOSI in SOLA LETTURA dei documenti Technoform su CiC.
//
// Cliente: Technoform Glass Insulation Italia srl, P.IVA 07168990963.
// Trova il customerNumber su Reviso, scarica TUTTI i suoi ordini, DDT di vendita
// e fatture (booked/sent/drafts), il dettaglio dei prodotti usati sulle righe e
// l'anagrafica; salva il JSON grezzo in risorsexCiC/out/technoform-*.json e
// stampa un'analisi (decimali prezzo, totali di riga, riferimenti, confronto
// con gli ordini Technoform 26W0289/26W0306/26W0317).
//
// 100% SOLA LETTURA: solo GET verso Reviso (guardia nel wrapper), Firestore
// letto solo per config/cic se src/functions/.env non c'è. I token non vengono
// mai stampati.
//
// Prerequisiti: src/functions/.env con REVISO_APP_SECRET / REVISO_AGREEMENT_GRANT
//   oppure  gcloud auth application-default login  (info@inglesinaitaliana.it)
// Uso:  node risorsexCiC/diag-technoform.mjs
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const OUT = path.join(here, 'out');

const PIVA = '07168990963';
const TARGET_ORDERS = { '26W0289': 94.44, '26W0306': 563.42, '26W0317': 1296.72 };

// ── credenziali: .env → env var → config/cic (Firestore, sola lettura) ───────
function readDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
async function getCicCreds() {
  const env = { ...readDotEnv(path.join(fnDir, '.env')), ...process.env };
  let appSecretToken = env.REVISO_APP_SECRET;
  let agreementGrantToken = env.REVISO_AGREEMENT_GRANT;
  let baseUrl = 'https://rest.reviso.com';
  let source = 'env';
  if (!appSecretToken || !agreementGrantToken) {
    const require = createRequire(fnDir);
    const admin = require('firebase-admin');
    admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
    const d = (await admin.firestore().collection('config').doc('cic').get()).data() || {};
    appSecretToken = d.appSecretToken || d.secret;
    agreementGrantToken = d.agreementGrantToken || d.agreement;
    baseUrl = d.baseUrl || baseUrl;
    source = 'Firestore config/cic';
  }
  if (!appSecretToken || !agreementGrantToken) throw new Error('Credenziali CiC mancanti');
  return { appSecretToken, agreementGrantToken, baseUrl, source };
}

const CREDS = await getCicCreds();

// ── wrapper Reviso: SOLO GET ──────────────────────────────────────────────────
async function reviso(pathOrUrl, method = 'GET') {
  if (method !== 'GET') throw new Error(`BLOCCATO: metodo ${method} non ammesso (script sola lettura)`);
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${CREDS.baseUrl}${pathOrUrl}`;
  if (!url.startsWith(CREDS.baseUrl)) throw new Error(`BLOCCATO: host inatteso ${url}`);
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-AppSecretToken': CREDS.appSecretToken, 'X-AgreementGrantToken': CREDS.agreementGrantToken },
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}
// Scarica tutte le pagine (pagesize=1000, poi segue pagination.nextPage).
async function getAll(p) {
  const sep = p.includes('?') ? '&' : '?';
  let next = `${p}${sep}pagesize=1000`;
  const all = [];
  while (next) {
    const r = await reviso(next);
    if (!r.ok) return { ok: false, status: r.status, error: r.json, items: all };
    all.push(...(r.json?.collection || []));
    // nextPage a volte punta a un host interno (es. reviso-delivery-note-app.azurewebsites.net/api/...):
    // non lo seguiamo, ricostruiamo lo stesso path+query su rest.reviso.com.
    const np = r.json?.pagination?.nextPage;
    next = np ? (() => { const u = new URL(np); return u.pathname.replace(/^\/api(?=\/)/, '') + u.search; })() : null;
  }
  return { ok: true, items: all };
}

const hr = (t) => console.log('\n' + '═'.repeat(76) + '\n' + t + '\n' + '═'.repeat(76));
const save = (name, data) => {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `technoform-${name}.json`), JSON.stringify(data, null, 2));
};
const decimals = (n) => { const s = String(n); return s.includes('.') ? s.split('.')[1].length : 0; };
const round2 = (n) => Math.round((n + 1e-9) * 100) / 100; // half-up con nudge, come rounding.ts

// ── 0) azienda ────────────────────────────────────────────────────────────────
hr(`0) Azienda (credenziali da ${CREDS.source})`);
const self = await reviso('/self');
if (!self.ok) { console.error('❌ /self', self.status, self.json); process.exit(1); }
console.log(`   ${self.json?.company?.name} (agreement ${self.json?.agreementNumber})`);

// ── 1) cliente ────────────────────────────────────────────────────────────────
hr('1) Cliente Technoform');
const cust = await getAll('/customers');
const matches = cust.items.filter((c) => {
  const v = String(c.vatNumber || c.corporateIdentificationNumber || '').replace(/\s/g, '').toUpperCase();
  return v.endsWith(PIVA) || /technoform/i.test(c.name || '');
});
console.log(`   clienti totali: ${cust.items.length} · match: ${matches.length}`);
for (const m of matches) console.log(`   #${m.customerNumber} "${m.name}" vat=${m.vatNumber}`);
if (!matches.length) { console.error('❌ Technoform non trovato'); process.exit(1); }
const customers = [];
for (const m of matches) customers.push((await reviso(`/customers/${m.customerNumber}`)).json);
save('customer', customers);
const custNums = new Set(matches.map((m) => Number(m.customerNumber)));
for (const c of customers) {
  console.log(`   #${c.customerNumber}: paymentTerms=${JSON.stringify(c.paymentTerms?.name ?? c.paymentTerms?.paymentTermsNumber ?? c.paymentTerms)}`
    + ` · defaultDiscountPct=${c.defaultDiscountPct ?? '—'} · currency=${c.currency} · layout=${c.layout?.layoutNumber ?? c.layout?.id ?? '—'}`
    + ` · vatZone=${c.vatZone?.name ?? c.vatZone?.vatZoneNumber ?? '—'} · customerGroup=${c.customerGroup?.name ?? c.customerGroup?.customerGroupNumber ?? '—'}`);
}

// ── 2) documenti ──────────────────────────────────────────────────────────────
const custOf = (d) => Number(
  d?.customer?.customerNumber ?? d?.customer?.id ?? d?.owner?.id ?? d?.owner?.customerNumber ?? d?.recipient?.customer?.customerNumber ?? NaN,
);
// Le fatture booked si leggono per bookedInvoiceNumber (NON per `number`, che è un altro contatore).
const idOf = (d) => d.bookedInvoiceNumber ?? d.draftInvoiceNumber ?? d.id ?? d.number ?? d.orderNumber;

async function fetchDocs(label, listPath, detailPath) {
  const list = await getAll(listPath);
  if (!list.ok) { console.log(`   ${label}: ${listPath} → HTTP ${list.status} ${JSON.stringify(list.error)?.slice(0, 200)}`); return []; }
  const mine = list.items.filter((d) => custNums.has(custOf(d)));
  console.log(`   ${label}: ${list.items.length} totali, ${mine.length} Technoform`);
  const full = [];
  for (const d of mine) {
    const det = detailPath ? await reviso(`${detailPath}/${idOf(d)}`) : { ok: false };
    // difesa: il dettaglio deve essere dello stesso cliente, altrimenti tengo la riga di lista
    full.push(det.ok && custNums.has(custOf(det.json)) ? det.json : { ...d, _dettaglio: det.ok ? 'cliente diverso' : 'non letto' });
  }
  return full;
}

hr('2) Documenti');
const orders = await fetchDocs('ordini', '/orders', '/orders');
const ddts = await fetchDocs('DDT vendita', '/delivery-notes/sales', '/delivery-notes/sales');
const invBooked = await fetchDocs('fatture booked', '/v2/invoices/booked', '/v2/invoices/booked');
const invSent = await fetchDocs('fatture sent', '/v2/invoices/sent', '/v2/invoices/sent');
const invDrafts = await fetchDocs('fatture drafts', '/v2/invoices/drafts', '/v2/invoices/drafts');
save('orders', orders);
save('ddt', ddts);
save('invoices', { booked: invBooked, sent: invSent, drafts: invDrafts });

// ── 3) righe: decimali e totali ───────────────────────────────────────────────
hr('3) Righe: decimali prezzo unitario e totale di riga');
const docs = [
  ...orders.map((d) => ['ORD', d]), ...ddts.map((d) => ['DDT', d]),
  ...invBooked.map((d) => ['FAT-B', d]), ...invSent.map((d) => ['FAT-S', d]), ...invDrafts.map((d) => ['FAT-D', d]),
];
const products = new Map();
let over2 = 0, mism = 0, nLines = 0;
for (const [kind, d] of docs) {
  const lines = d.lines || d.productDetails?.productLines || [];
  const num = d.displayInvoiceNumber ?? d.number ?? d.id;
  console.log(`\n   [${kind} ${num}] data=${d.date} netto=${d.netAmount ?? d.totalNetAmount ?? round2(lines.reduce((a, l) => a + Number(l.totalNetAmount || 0), 0))} tot=${d.totalAmount ?? d.grossAmount ?? '?'} righe=${lines.length}`);
  for (const l of lines) {
    nLines++;
    const pn = l.product?.productNumber ?? l.product?.id;
    if (!pn && !Number(l.quantity)) { console.log(`     (riga testo) "${l.description}"`); continue; }
    if (pn) products.set(String(pn), l.product?.name ?? l.description);
    const qty = Number(l.quantity);
    const unit = Number(l.unitNetPrice);
    const disc = Number(l.discountPercentage ?? l.discount ?? 0) || 0;
    const tot = Number(l.totalNetAmount ?? l.netAmount ?? l.totalAmount);
    const atteso = round2(qty * unit * (1 - disc / 100));
    const d4 = decimals(l.unitNetPrice);
    if (d4 > 2) over2++;
    const ok = Number.isFinite(tot) && Math.abs(atteso - tot) < 0.005;
    if (!ok) mism++;
    console.log(`     ${String(pn).padEnd(8)} qty=${qty} ${l.unit?.name ?? ''} unit=${l.unitNetPrice} (${d4} dec) sc=${disc}% tot=${tot} atteso=${atteso} ${ok ? '✓' : '✗'}`
      + ` · "${String(l.description ?? '').replace(/\s+/g, ' ').slice(0, 90)}"`);
  }
}
console.log(`\n   righe: ${nLines} · prezzi >2 decimali: ${over2} · totali ≠ round2(qty×prezzo×(1-sc)): ${mism}`);

// ── 4) prodotti ───────────────────────────────────────────────────────────────
hr('4) Prodotti usati');
const prodDetails = [];
for (const [pn, name] of products) {
  const r = await reviso(`/products/${encodeURIComponent(pn)}`);
  prodDetails.push(r.ok ? r.json : { productNumber: pn, error: r.status });
  console.log(`   ${pn} "${name}" → ${r.ok ? `salesPrice=${r.json.salesPrice} unit=${r.json.unit?.name ?? '—'} barCode=${r.json.barCode ?? '—'} gruppo=${r.json.productGroup?.name ?? '—'}` : `HTTP ${r.status}`}`);
}
save('products', prodDetails);

// ── 5) riferimenti e confronto 26W ────────────────────────────────────────────
hr('5) Riferimenti e confronto con ordini Technoform');
for (const [kind, d] of docs) {
  const num = d.number ?? d.orderNumber ?? d.bookedInvoiceNumber ?? d.id;
  const blob = JSON.stringify({ references: d.references, notes: d.notes, notesAndAttachments: d.notesAndAttachments, heading: d.heading, otherReference: d.otherReference });
  console.log(`   [${kind} ${num}] ${blob.slice(0, 300)}`);
}
for (const [code, netto] of Object.entries(TARGET_ORDERS)) {
  const hits = docs.filter(([, d]) => JSON.stringify(d).includes(code));
  if (!hits.length) { console.log(`   ${code} (netto ${netto}) → nessun documento Reviso lo cita`); continue; }
  for (const [kind, d] of hits) {
    const net = d.netAmount ?? d.totalNetAmount ?? round2((d.productDetails?.productLines || []).reduce((a, l) => a + Number(l.totalNetAmount || 0), 0));
    const riga = (d.lines || d.productDetails?.productLines || []).find((l) => String(l.description).includes(code));
    console.log(`   ${code} (netto ${netto}) → ${kind} ${d.displayInvoiceNumber ?? d.number ?? d.id} riga=${riga?.totalNetAmount ?? '—'} (doc ${net})`
      + ` ${riga && Math.abs(Number(riga.totalNetAmount) - netto) < 0.005 ? '✓ riga coincide' : '✗'}`);
  }
}
console.log(`\nJSON grezzo in ${OUT}`);
