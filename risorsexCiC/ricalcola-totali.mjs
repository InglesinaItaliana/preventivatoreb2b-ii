// ============================================================================
// ricalcola-totali.mjs — STEP 2 cutover. Allinea i totali dei preventivi aperti
// (A_flip + B_migra) alla regola canonica computeTotals (round2 per riga), così
// la cifra-cliente == documento CiC e sparisce il billingError di 1 cent.
// Scrive netCanonico / totaleScontato / totaleImponibile = computeNet.
//
// Tocca SOLO i preventivi divergenti (>0.001), aperti (no DDT/consegnato/rejected/
// già-CiC). Guardia: con sconto>0 lascia totaleImponibile se diverso da totaleScontato.
// SICUREZZA: default DRY-RUN. Esegui con:  node risorsexCiC/ricalcola-totali.mjs --apply
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
const r2 = (n) => Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
const computeNet = (d) => { const f = 1 - (Number(d.scontoPercentuale) || 0) / 100; let n = 0; for (const it of d.elementi || []) n += r2((it.quantita || 1) * (it.prezzo_unitario || 0) * f); return r2(n); };
const saved = (d) => (typeof d.netCanonico === 'number') ? d.netCanonico : (typeof d.totaleScontato === 'number') ? d.totaleScontato : (d.totaleImponibile || 0);

console.log(APPLY ? '🔴 APPLY — riscrivo i totali\n' : '🟢 DRY-RUN — nessuna scrittura (usa --apply)\n');
const snap = await db.collection('preventivi').get();
let count = 0, skipped = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  const st = d.stato;
  if (st === 'REJECTED' || st === 'DELIVERED' || st === 'SHIPPED') continue;
  if (d.fic_ddt_id || d.cic_ddt_id || d.fic_ddt_number || d.cic_ddt_number || d.cic_order_id) continue;
  const net = computeNet(d);
  if (Math.abs(net - saved(d)) <= 0.001) continue;
  count++;
  const sconto = Number(d.scontoPercentuale) || 0;
  const update = { netCanonico: net, totaleScontato: net };
  // totaleImponibile: allinea solo se era ≈ totaleScontato (stessa base). Con sconto e basi diverse → lascia.
  if (sconto === 0 || Math.abs((d.totaleImponibile ?? net) - (d.totaleScontato ?? net)) <= 0.001) update.totaleImponibile = net;
  else skipped++;
  console.log(`   ${doc.id.slice(0, 8)} ${st.padEnd(13)} ${saved(d)} → ${net}  ${update.totaleImponibile === undefined ? '(totaleImponibile lasciato: sconto+base diversa)' : ''}`);
  if (APPLY) await doc.ref.update(update);
}
console.log(`\n${APPLY ? '✅' : '🟢'} ${count} preventivi ${APPLY ? 'ricalcolati' : 'da ricalcolare'}${skipped ? ` (${skipped} con totaleImponibile non toccato)` : ''}.`);
if (!APPLY) console.log('Rilancia con --apply per scrivere.');
process.exit(0);
