// ============================================================================
// backfill-cic-order-date.mjs — i 19 ordini migrati (migra-ordini-cic.mjs) hanno
// cic_order_number ma NON cic_order_date. Imposta cic_order_date='2026-06-25'
// (la data usata nella migrazione) sui preventivi con cic_order_id e senza data.
// SOLO i migrati: non tocca chi ha già cic_order_date (nuovi ordini post-flip).
// SICUREZZA: default DRY-RUN. Esegui con:  node risorsexCiC/backfill-cic-order-date.mjs --apply
// ============================================================================
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
const DATE = '2026-06-25';
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

console.log(APPLY ? `🔴 APPLY — imposto cic_order_date=${DATE}\n` : '🟢 DRY-RUN\n');
const snap = await db.collection('preventivi').get();
let n = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  if (!d.cic_order_id) continue;
  if (d.cic_order_date) continue; // già impostata (nuovi ordini)
  n++;
  console.log(`   ${doc.id.slice(0, 8)} cic n.${d.cic_order_number ?? '?'} → cic_order_date=${DATE}`);
  if (APPLY) await doc.ref.update({ cic_order_date: DATE });
}
console.log(`\n${APPLY ? '✅' : '🟢'} ${n} preventivi ${APPLY ? 'aggiornati' : 'da aggiornare'}.`);
if (!APPLY) console.log('Rilancia con --apply.');
process.exit(0);
