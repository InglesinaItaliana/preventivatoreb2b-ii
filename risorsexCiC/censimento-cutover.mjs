// ============================================================================
// censimento-cutover.mjs — SCANDAGLIO read-only dei preventivi POPS per il cutover
// netto FiC→CiC. Categorizza ogni preventivo e conta i totali da ricalcolare.
//   • A_flip   = nessun ordine generato (no fic_order_id, no cic_order_id) → col flip va su CiC da solo
//   • B_migra  = ha fic_order_id ma NESSUN DDT → da migrare via batch (crea ordine CiC)
//   • GIA_CIC  = ha già cic_order_id
//   • CON_DDT  = ha già un DDT (fic/cic) → consegnato, resta com'è (fuori dal cutover)
//   • CHIUSO   = REJECTED/annullato → ignorato
// Inoltre: per A_flip+B_migra calcola se il totale salvato diverge da computeTotals (round2/riga).
//
// SOLA LETTURA. Uso: node risorsexCiC/censimento-cutover.mjs
// ============================================================================
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
const r2 = (n) => Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;

function computeNet(d) {
  const f = 1 - (Number(d.scontoPercentuale) || 0) / 100;
  let net = 0;
  for (const it of d.elementi || []) net += r2((it.quantita || 1) * (it.prezzo_unitario || 0) * f);
  return r2(net);
}
const savedNet = (d) => (typeof d.netCanonico === 'number') ? d.netCanonico : (typeof d.totaleScontato === 'number') ? d.totaleScontato : (d.totaleImponibile || 0);

const snap = await db.collection('preventivi').get();
const byStateCat = {}; // stato → {A,B,GIA_CIC,CON_DDT,CHIUSO}
const cat = { A_flip: 0, B_migra: 0, GIA_CIC: 0, CON_DDT: 0, CONSEGNATO: 0, CHIUSO: 0 };
let recalcA = 0, recalcB = 0;
const Bsample = [];

for (const doc of snap.docs) {
  const d = doc.data();
  const stato = d.stato || '(nessuno)';
  const hasFicOrder = !!d.fic_order_id, hasCicOrder = !!d.cic_order_id;
  const hasDdt = !!(d.fic_ddt_id || d.cic_ddt_id || d.fic_ddt_number || d.cic_ddt_number);
  let c;
  if (stato === 'REJECTED') c = 'CHIUSO';
  else if (stato === 'DELIVERED' || stato === 'SHIPPED') c = 'CONSEGNATO'; // già consegnato → fuori cutover
  else if (hasDdt) c = 'CON_DDT';
  else if (hasCicOrder) c = 'GIA_CIC';
  else if (hasFicOrder) c = 'B_migra';
  else c = 'A_flip';
  cat[c]++;
  (byStateCat[stato] ||= {}); byStateCat[stato][c] = (byStateCat[stato][c] || 0) + 1;

  if (c === 'A_flip' || c === 'B_migra') {
    const diff = Math.abs(computeNet(d) - savedNet(d));
    if (diff > 0.001) { if (c === 'A_flip') recalcA++; else recalcB++; }
    if (c === 'B_migra' && Bsample.length < 8) Bsample.push(`${doc.id.slice(0, 6)}(${stato}, fic=${d.fic_order_id}, net=${savedNet(d)}→${computeNet(d)})`);
  }
}

console.log('═══════════ CENSIMENTO CUTOVER (preventivi totali: ' + snap.size + ') ═══════════\n');
console.log('CATEGORIE:');
console.log(`   A_flip  (no ordine → col flip va su CiC):      ${cat.A_flip}`);
console.log(`   B_migra (ordine FiC senza DDT → batch CiC):    ${cat.B_migra}`);
console.log(`   GIA_CIC (già su CiC):                          ${cat.GIA_CIC}`);
console.log(`   CON_DDT (consegnato, resta com'è):             ${cat.CON_DDT}`);
console.log(`   CHIUSO  (REJECTED):                            ${cat.CHIUSO}`);
console.log(`\n   → da gestire al cutover: A=${cat.A_flip} (flip) + B=${cat.B_migra} (batch) = ${cat.A_flip + cat.B_migra}`);
console.log(`   → totali da RICALCOLARE: A=${recalcA}, B=${recalcB} (divergono da computeTotals round2/riga)`);

console.log('\nDETTAGLIO per stato:');
const states = Object.keys(byStateCat).sort();
console.log('   stato'.padEnd(20) + 'A_flip  B_migra  GIA_CIC  CON_DDT  CHIUSO');
for (const s of states) { const o = byStateCat[s]; console.log('   ' + s.padEnd(17) + String(o.A_flip || 0).padStart(6) + String(o.B_migra || 0).padStart(9) + String(o.GIA_CIC || 0).padStart(9) + String(o.CON_DDT || 0).padStart(9) + String(o.CHIUSO || 0).padStart(8)); }

if (Bsample.length) { console.log('\nEsempi categoria B (da migrare):'); Bsample.forEach((x) => console.log('   • ' + x)); }
process.exit(0);
