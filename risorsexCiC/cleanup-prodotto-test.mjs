// ============================================================================
// cleanup-prodotto-test.mjs — rimuove dal listino i prodotti di TEST creati
// durante le prove della Fase 2. Cancella da Firestore:
//   listino_base/{cod}, products/{cod}, e le righe catalogo con cod==.
//
// NB: NON cancella il prodotto su CiC/Reviso (i prodotti CiC in uso non sono
// cancellabili via API → eliminare l'eventuale orfano dal gestionale Reviso web).
//
// SICUREZZA: default DRY-RUN. Esegui con --apply:
//   node risorsexCiC/cleanup-prodotto-test.mjs I141 I142 --apply
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = createRequire(path.resolve(here, '..', 'src', 'functions') + path.sep)('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

const APPLY = process.argv.includes('--apply');
const codes = process.argv.slice(2).filter((a) => a !== '--apply').map((s) => s.trim().toUpperCase()).filter(Boolean);
if (!codes.length) { console.error('Uso: node risorsexCiC/cleanup-prodotto-test.mjs <COD> [COD...] [--apply]'); process.exit(1); }

console.log(APPLY ? '🔴 APPLY — cancello davvero\n' : '🟢 DRY-RUN — nessuna cancellazione (usa --apply)\n');

for (const cod of codes) {
  const catSnap = await db.collection('catalogo').where('cod', '==', cod).get();
  console.log(`${cod}: listino_base + products + ${catSnap.size} righe catalogo`);
  if (!APPLY) continue;
  await db.collection('listino_base').doc(cod).delete().catch(() => {});
  await db.collection('products').doc(cod).delete().catch(() => {});
  let batch = db.batch(); let n = 0;
  for (const d of catSnap.docs) { batch.delete(d.ref); if (++n >= 450) { await batch.commit(); batch = db.batch(); n = 0; } }
  if (n > 0) await batch.commit();
  console.log(`   ✅ rimosso (orfano CiC barCode=${cod} da eliminare a mano dal gestionale Reviso)`);
}
process.exit(0);
