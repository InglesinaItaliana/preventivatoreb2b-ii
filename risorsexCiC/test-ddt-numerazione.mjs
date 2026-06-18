// ============================================================================
// test-ddt-numerazione.mjs — verifica il COMPORTAMENTO della numerazione DDT:
// emette 3 DDT (osserva i numeri assegnati), li cancella, poi ne emette 1 di
// VERIFICA per capire se il contatore della serie si è LIBERATO (riparte da 1)
// o è avanzato (4). Risponde a: "cancellare i DDT di test brucia numeri?".
//
// Cleanup garantito in finally. DELETE via rest.reviso.com/delivery-notes/sales/{id}
// (funziona per i DDT creati ora; gli spike vecchi stanno sul microservizio Azure).
// SICUREZZA: default DRY-RUN. Esegui con:  node risorsexCiC/test-ddt-numerazione.mjs --apply
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

async function reviso(method, p) { const r = await fetch(`${CREDS.baseUrl}${p}`, { method, headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' } }); const t = await r.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; } return { status: r.status, ok: r.ok, json: j }; }
async function resolveCicProductIds(codes) { const uniq = [...new Set(codes.filter(Boolean).map((c) => up(c)))]; const map = new Map(); await Promise.all(uniq.map(async (code) => { const s = await db.collection('products').doc(code).get(); const pid = s.exists ? s.data()?.cicProductId : undefined; if (pid != null) map.set(code, pid); })); return map; }
function merceLines(elementi) { return (elementi || []).filter((it) => it.categoria !== 'EXTRA').map((item) => { let desc = item.descrizioneCompleta || 'Articolo Vetrata'; if (item.base_mm > 0 || item.altezza_mm > 0) desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm`; return { code: item.codice ? up(item.codice) : '', description: desc, qty: item.quantita || 1, unitNetPrice: item.prezzo_unitario || 0, category: item.categoria }; }); }

// 3 preventivi con merce, clienti diversi
const snap = await db.collection('preventivi').limit(500).get();
const seen = new Set(); const picks = [];
for (const doc of snap.docs) { const d = doc.data(); if (!d.clienteUID || seen.has(d.clienteUID)) continue; if (!Array.isArray(d.elementi) || !d.elementi.some((e) => e.categoria !== 'EXTRA' && (e.prezzo_unitario || 0) > 0)) continue; seen.add(d.clienteUID); picks.push({ id: doc.id, d }); if (picks.length >= 3) break; }

console.log(APPLY ? '🔴 APPLY — emetto 3 DDT, li cancello, poi 1 di verifica\n' : '🟢 DRY-RUN\n');
console.log(`Preventivi scelti (clienti diversi): ${picks.map((p) => p.id.slice(0, 8)).join(', ')}`);
if (!APPLY) { console.log('\n🟢 Dry-run. Rilancia con --apply.'); process.exit(0); }

const provider = await createCicProvider();
const issued = []; // {id, number}
const del = async (id) => (await reviso('DELETE', `/delivery-notes/sales/${id}`)).status;

async function emit(p, label) {
  const u = (await db.collection('users').doc(p.d.clienteUID).get()).data() || {};
  const customer = await provider.findOrCreateCustomer({ piva: u.piva, name: u.ragioneSociale || 'Cliente', email: u.email, taxCode: u.codiceFiscale, address: u.indirizzo, zip: u.cap, city: u.citta, province: u.provincia });
  const lines = merceLines(p.d.elementi);
  const cicMap = await resolveCicProductIds(lines.map((l) => l.code));
  for (const l of lines) if (l.code) l.cicProductId = cicMap.get(l.code);
  const ddt = await provider.createDeliveryNote({ customer, date: new Date().toISOString().split('T')[0], lines, shipping: { packages: 1, transportType: 'INTERNAL' }, visibleSubject: `TEST numerazione ${label}` });
  console.log(`   ${label}: id=${ddt.id}  NUMERO=${ddt.number}  (${u.ragioneSociale || '?'})`);
  return { id: ddt.id, number: ddt.number };
}

try {
  console.log('① Emetto 3 DDT:');
  for (let i = 0; i < picks.length; i++) issued.push(await emit(picks[i], `DDT#${i + 1}`));
  const nums = issued.map((x) => x.number);
  console.log(`   → numeri assegnati: ${nums.join(', ')}`);

  console.log('\n② Cancello i 3 DDT (ordine inverso)…');
  for (const x of [...issued].reverse()) { const s = await del(x.id); console.log(`   DELETE id=${x.id} (num ${x.number}) → ${s}`); }
  issued.length = 0;

  console.log('\n③ Emetto 1 DDT di VERIFICA per leggere il prossimo numero…');
  const v = await emit(picks[0], 'VERIFICA');
  console.log(`\n🔎 RISULTATO: il DDT di verifica ha preso il numero ${v.number}.`);
  console.log(v.number === nums[0] ? '   ✅ La numerazione SI LIBERA cancellando: i test NON bruciano numeri (riparte dal primo).' : `   ⚠️ La numerazione AVANZA: cancellare NON libera il numero (verifica=${v.number}, primo emesso=${nums[0]}). Ogni DDT di test brucia un numero.`);
  console.log('   Cancello anche il DDT di verifica…');
  const s = await del(v.id); console.log(`   DELETE id=${v.id} → ${s}`);
} catch (e) {
  console.error('   ❌ ERRORE:', e?.message);
  if (e?.response?.data) console.error('   BODY:', JSON.stringify(e.response.data));
} finally {
  if (issued.length) { console.log('\n🧹 Cleanup residui…'); for (const x of issued) { const s = await del(x.id); console.log(`   DELETE id=${x.id} → ${s}`); } }
}
process.exit(0);
