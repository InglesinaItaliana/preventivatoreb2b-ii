// ============================================================================
// test-fase5-ddt.mjs — Fase 5: UN DDT MULTI-ORDINE (caso B4) sull'azienda definitiva.
// Replica creaDdtCumulativoCiC: prende 2-3 preventivi REALI dello STESSO cliente,
// assembla le righe MERCE (esclude EXTRA/consegne), crea il DDT col CicProvider
// (crea bozza → emette → numero), verifica numero + prodotti agganciati, poi CANCELLA.
//
// ⚠️ L'emissione CONSUMA UN NUMERO DDT FISCALE progressivo. La cancellazione di un
//    DDT emesso potrebbe non passare in prod → in tal caso va STORNATO a mano.
// SICUREZZA: default DRY-RUN. Esegui con:  node risorsexCiC/test-fase5-ddt.mjs --apply
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
const { createCicProvider } = require('./lib/lib_billing/cicProvider.js');
const cfg = (await db.collection('config').doc('cic').get()).data();
const CREDS = { secret: cfg.appSecretToken, agreement: cfg.agreementGrantToken, baseUrl: cfg.baseUrl };
const up = (s) => String(s ?? '').toUpperCase().trim();

async function reviso(method, p) {
  const r = await fetch(`${CREDS.baseUrl}${p}`, { method, headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' } });
  const t = await r.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, ok: r.ok, json: j };
}
async function resolveCicProductIds(codes) {
  const uniq = [...new Set(codes.filter(Boolean).map((c) => up(c)))];
  const map = new Map();
  await Promise.all(uniq.map(async (code) => { const s = await db.collection('products').doc(code).get(); const pid = s.exists ? s.data()?.cicProductId : undefined; if (pid != null) map.set(code, pid); }));
  return map;
}
function merceLines(elementi) {
  return (elementi || []).filter((it) => it.categoria !== 'EXTRA').map((item) => {
    let desc = item.descrizioneCompleta || 'Articolo Vetrata';
    if (item.base_mm > 0 || item.altezza_mm > 0) desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm`;
    return { code: item.codice ? up(item.codice) : '', description: desc, qty: item.quantita || 1, unitNetPrice: item.prezzo_unitario || 0, category: item.categoria };
  });
}

// ── 1) trova un cliente con ≥2 preventivi che hanno merce ────────────────────
const snap = await db.collection('preventivi').limit(500).get();
const byClient = new Map();
for (const doc of snap.docs) {
  const d = doc.data();
  if (!d.clienteUID || !Array.isArray(d.elementi)) continue;
  if (!d.elementi.some((e) => e.categoria !== 'EXTRA' && (e.prezzo_unitario || 0) > 0)) continue;
  if (!byClient.has(d.clienteUID)) byClient.set(d.clienteUID, []);
  byClient.get(d.clienteUID).push({ id: doc.id, d });
}
const multi = [...byClient.entries()].find(([, arr]) => arr.length >= 2);
if (!multi) { console.error('❌ Nessun cliente con ≥2 preventivi con merce.'); process.exit(1); }
const [clienteUID, prevs] = multi;
const chosen = prevs.slice(0, 3); // fino a 3 ordini nel DDT cumulativo
const u = (await db.collection('users').doc(clienteUID).get()).data() || {};

// assembla le righe merce dai preventivi scelti
let lines = [];
for (const p of chosen) lines.push(...merceLines(p.d.elementi));
const cicMap = await resolveCicProductIds(lines.map((l) => l.code));
for (const l of lines) if (l.code) l.cicProductId = cicMap.get(l.code);

console.log(APPLY ? '🔴 APPLY — creo, emetto e cancello UN DDT multi-ordine\n' : '🟢 DRY-RUN\n');
console.log(`Cliente: ${u.ragioneSociale || clienteUID} (P.IVA ${u.piva || '?'})`);
console.log(`DDT cumulativo da ${chosen.length} preventivi: ${chosen.map((c) => c.id.slice(0, 8)).join(', ')}`);
console.log(`Righe merce totali: ${lines.length}`);
lines.forEach((l, i) => console.log(`   riga${i + 1}: code=${l.code || '(vuoto)'} cicProductId=${l.cicProductId ?? '→VARIE'} qty=${l.qty} unit=${l.unitNetPrice} desc="${String(l.description).slice(0, 38)}"`));

if (!APPLY) { console.log('\n🟢 Dry-run. Rilancia con --apply per emettere il DDT (consuma 1 numero fiscale).'); process.exit(0); }

// ── 2) crea + emetti il DDT ───────────────────────────────────────────────────
const provider = await createCicProvider();
const customer = await provider.findOrCreateCustomer({ piva: u.piva, name: u.ragioneSociale || 'Cliente', email: u.email, taxCode: u.codiceFiscale, address: u.indirizzo, zip: u.cap, city: u.citta, province: u.provincia });
let ddtId = null;
try {
  console.log('\n⏳ Creo ed emetto il DDT…');
  const ddt = await provider.createDeliveryNote({
    customer,
    date: new Date().toISOString().split('T')[0],
    lines,
    shipping: { packages: 1, transportType: 'INTERNAL' },
    visibleSubject: 'TEST DDT multi-ordine (verrà cancellato)',
  });
  ddtId = ddt.id;
  console.log(`   ✅ DDT creato ed emesso → id=${ddt.id}  NUMERO=${ddt.number ?? '(non letto)'}  net=${ddt.netAmount} vat=${ddt.vatAmount} gross=${ddt.grossAmount}`);

  // rileggi per verificare prodotti agganciati
  const fresh = await reviso('GET', `/delivery-notes/sales/${ddt.id}`);
  const dlines = fresh.json?.productDetails?.productLines || fresh.json?.lines || [];
  const varie = dlines.filter((l) => String(l.product?.id ?? l.product?.productNumber) === 'VARIE').length;
  console.log(`   righe DDT: ${dlines.length}  ·  su prodotto VARIE: ${varie}  ·  stato: ${fresh.json?.deliveryNoteStatus ?? '?'}`);
  console.log(`   ${ddt.number != null ? '✅ numero assegnato dalla serie' : '⚠️ numero non letto'} · ${varie === 0 ? '✅ tutti i prodotti agganciati' : '⚠️ alcune righe su VARIE'}`);
} catch (e) {
  console.error('   ❌ ERRORE:', e?.message);
  if (e?.response?.data) console.error('   BODY:', JSON.stringify(e.response.data, null, 2));
} finally {
  if (ddtId != null) {
    console.log('\n🧹 Cancello il DDT di prova…');
    const del = await reviso('DELETE', `/delivery-notes/sales/${ddtId}`);
    console.log(del.ok ? `   ✅ DDT ${ddtId} cancellato (numero resta un buco nella serie)` : `   ⚠️ Cancellazione fallita (${del.status}) — DDT id=${ddtId} EMESSO da STORNARE a mano nel gestionale`);
  }
}
process.exit(0);
