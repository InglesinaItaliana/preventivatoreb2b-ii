// ============================================================================
// flip-catalog-source.mjs — interruttore della sorgente del listino.
//   settings/pricing.catalogSource = 'firestore'  → listino interno (listino_base)
//   settings/pricing.catalogSource = 'sheet'       → Google Sheet (rollback)
//
// È il KILL-SWITCH: per tornare al foglio basta rilanciare con 'sheet'.
//
// Uso:  node risorsexCiC/flip-catalog-source.mjs firestore --apply
//       node risorsexCiC/flip-catalog-source.mjs sheet --apply   (rollback)
// Senza --apply = dry-run (mostra solo lo stato attuale e quello che farebbe).
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = createRequire(path.resolve(here, '..', 'src', 'functions') + path.sep)('firebase-admin');

const target = (process.argv[2] || '').toLowerCase();
const APPLY = process.argv.includes('--apply');
if (!['firestore', 'sheet'].includes(target)) {
  console.error("Uso: node risorsexCiC/flip-catalog-source.mjs <firestore|sheet> [--apply]");
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

const ref = db.collection('settings').doc('pricing');
const cur = (await ref.get()).data()?.catalogSource ?? '(assente → sheet)';
console.log(`catalogSource attuale: ${cur}`);
console.log(`Target: ${target}`);

if (!APPLY) { console.log('\n🟢 DRY-RUN — niente scritture. Aggiungi --apply per eseguire.'); process.exit(0); }

await ref.set({ catalogSource: target }, { merge: true });
const now = (await ref.get()).data()?.catalogSource;
console.log(`\n✅ Fatto. catalogSource = ${now}`);
console.log(target === 'firestore'
  ? '   Il listino interno (listino_base) è LIVE. Rollback: rilancia con "sheet".'
  : '   Rollback eseguito: il preventivatore rilegge il Google Sheet.');
console.log('   NB: i client già aperti applicano il cambio al prossimo ricaricamento (lo store ha cache isLoaded + service worker).');
process.exit(0);
