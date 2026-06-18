// ============================================================================
// trasforma-trivero.mjs — test END-TO-END VERO: prende un preventivo reale in
// WAITING_SIGN con commessa "TRIVERO" e genera l'ordine CiC col CicProvider,
// REPLICANDO generaOrdineCiC (index.ts). NON scrive su Firestore (niente
// cic_order_id sul preventivo), NON cancella l'ordine → resta in CiC per ispezione.
//
// SICUREZZA: default DRY-RUN (trova e mostra). Crea davvero con:  --apply
//   node risorsexCiC/trasforma-trivero.mjs --apply
// ============================================================================
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
const TERM = (process.env.COMMESSA || 'TRIVERO').toUpperCase();
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
const { createCicProvider } = require('./lib/lib_billing/cicProvider.js');
const up = (s) => String(s ?? '').toUpperCase().trim();

// cerca preventivi WAITING_SIGN con commessa contenente TERM
const snap = await db.collection('preventivi').where('stato', '==', 'WAITING_SIGN').get();
const matches = snap.docs.filter((d) => up(d.data()?.commessa).includes(TERM));
console.log(APPLY ? '🔴 APPLY — genero l\'ordine CiC (resta in CiC)\n' : '🟢 DRY-RUN — solo ricerca/anteprima\n');
console.log(`Preventivi WAITING_SIGN totali: ${snap.size} · con commessa "${TERM}": ${matches.length}`);
if (matches.length === 0) { console.log('❌ Nessun preventivo trovato. (prova COMMESSA=... per un altro termine)'); process.exit(1); }

const doc = matches[0];
const d = doc.data();
const u = (await db.collection('users').doc(d.clienteUID).get()).data() || {};
const expectedNet = (typeof d.netCanonico === 'number') ? d.netCanonico : (typeof d.totaleScontato === 'number') ? d.totaleScontato : (d.totaleImponibile || 0);
console.log(`\n📄 Preventivo ${doc.id}`);
console.log(`   commessa: ${d.commessa}  · codice: ${d.codice}  · sconto: ${d.scontoPercentuale || 0}%`);
console.log(`   cliente: ${u.ragioneSociale || d.cliente} (P.IVA ${u.piva || '?'})  · cicCustomerNumber: ${u.cicCustomerNumber ?? '(non mappato)'}`);
console.log(`   righe: ${(d.elementi || []).length}  · netCanonico atteso: ${expectedNet}€`);

// costruisci le righe come generaOrdineCiC (TUTTI gli elementi, incluse EXTRA/consegne)
const lines = (d.elementi || []).map((item) => {
  let desc = item.descrizioneCompleta || 'Articolo Vetrata';
  if (item.categoria !== 'EXTRA' && (item.base_mm > 0 || item.altezza_mm > 0)) desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
  return { code: item.codice ? up(item.codice) : '', description: desc, qty: item.quantita || 1, unitNetPrice: item.prezzo_unitario || 0, category: item.categoria };
});
const uniq = [...new Set(lines.map((l) => l.code).filter(Boolean))];
const cicMap = new Map();
await Promise.all(uniq.map(async (code) => { const s = await db.collection('products').doc(code).get(); const pid = s.exists ? s.data()?.cicProductId : undefined; if (pid != null) cicMap.set(code, pid); }));
for (const l of lines) if (l.code) l.cicProductId = cicMap.get(l.code);
lines.forEach((l, i) => console.log(`   riga${i + 1}: ${l.code || '(vuoto)'} → cicProductId=${l.cicProductId ?? '→VARIE'} qty=${l.qty} unit=${l.unitNetPrice} ${l.category === 'EXTRA' ? '[EXTRA]' : ''}`));

if (!APPLY) { console.log('\n🟢 Dry-run. Rilancia con --apply per generare l\'ordine CiC (resterà in CiC per ispezione).'); process.exit(0); }

const provider = await createCicProvider();
const customer = await provider.findOrCreateCustomer({ piva: u.piva, name: u.ragioneSociale || d.cliente || 'Cliente', email: u.email, taxCode: u.codiceFiscale, address: u.indirizzo, zip: u.cap, city: u.citta, province: u.provincia });
const result = await provider.createOrder({ customer, date: d.dataConsegnaPrevista || new Date().toISOString().split('T')[0], lines, discountPercentage: Number(d.scontoPercentuale) || 0, visibleSubject: d.commessa || `Rif: ${d.codice}` });

const netOk = Math.abs((result.netAmount || 0) - expectedNet) <= 0.01;
console.log('\n────────────────────────── ORDINE CiC CREATO ──────────────────────────');
console.log(`   id=${result.id}  NUMERO=${result.number}`);
console.log(`   net=${result.netAmount}  IVA=${result.vatAmount}  lordo=${result.grossAmount}`);
console.log(`   netCanonico POPS=${expectedNet}  →  ${netOk ? '✅ COMBACIA al centesimo' : '⚠️ DISCREPANZA (' + (result.netAmount - expectedNet).toFixed(4) + ')'}`);
console.log(`\n👉 Ordine n.${result.number} ora visibile nel gestionale Reviso (cliente ${u.ragioneSociale || ''}).`);
console.log('   NB: il preventivo Firestore NON è stato toccato (niente cic_order_id). L\'ordine NON è stato cancellato.');
process.exit(0);
