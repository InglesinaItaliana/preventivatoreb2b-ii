// ============================================================================
// verify-listino.mjs — GATE non-regressione del modello "base + struttura".
//
// Verifica che, EREDITANDO il prezzo da listino_base[cod], ogni foglia del
// catalogo riproduca il prezzo già memorizzato nel catalogo — che al seed era
// stato provato IDENTICO alla scheda di output live (verify-catalogo.mjs, 0 diff).
//
// NB: NON usa più la CSV di output live come riferimento: quel tab ora serializza
// con header duplicati (si è rotto dopo la pubblicazione di CONFIG_PREZZI). Il
// riferimento affidabile è lo snapshot `catalogo` in Firestore. La catena:
//   listino_base == 48 codici catalogo  (gate-final, 0 diff)
//   catalogo     == output live al seed (verify-catalogo, 0 diff)
//   => derivato  == prezzi live.
//
// Sola lettura. Uso:  node risorsexCiC/verify-listino.mjs
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = createRequire(path.resolve(here, '..', 'src', 'functions') + path.sep)('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

const baseSnap = await db.collection('listino_base').get();
if (baseSnap.empty) { console.error('❌ listino_base VUOTA → seed-listino-base.mjs --apply'); process.exit(1); }
const baseMap = {};
baseSnap.docs.forEach((d) => { const r = d.data(); baseMap[r.cod] = r.prezzo; });

const catSnap = await db.collection('catalogo').orderBy('ord').get();
if (catSnap.empty) { console.error('❌ catalogo VUOTA → seed-catalogo.mjs --apply'); process.exit(1); }

// 1) Ogni riga catalogo: il prezzo EREDITATO da listino_base[cod] combacia con
//    il prezzo memorizzato (snapshot live)? Object.is così NaN==NaN (I132).
const priceDiffs = [];
const missingBase = [];
const codInCatalogo = {};
for (const d of catSnap.docs) {
  const r = d.data();
  codInCatalogo[r.cod] = r.prezzo;
  if (!(r.cod in baseMap)) { missingBase.push(`${r.cod} (${r.categoria}/${r.modello}/${r.finitura})`); continue; }
  if (!Object.is(baseMap[r.cod], r.prezzo)) priceDiffs.push(`  ${r.cod} ${r.categoria}/${r.modello}/${r.dimensione}/${r.finitura}: base=${baseMap[r.cod]} vs catalogo=${r.prezzo}`);
}

// 2) codiciMap: i 48 prezzi base coprono e combaciano con i codici usati dal catalogo?
const allCods = [...new Set([...Object.keys(baseMap), ...Object.keys(codInCatalogo)])].sort();
const mapDiffs = allCods.filter((c) => c in codInCatalogo && c in baseMap && !Object.is(baseMap[c], codInCatalogo[c]));
const baseUnused = Object.keys(baseMap).filter((c) => !(c in codInCatalogo)); // codici base non usati nel menu (es. EXTRA/CONSEGNA)

console.log('=== GATE listino derivato (listino_base + struttura catalogo) ===\n');
console.log(`listino_base: ${Object.keys(baseMap).length} prezzi base · catalogo: ${catSnap.size} righe · codici usati: ${Object.keys(codInCatalogo).length}`);
console.log('');
console.log(`Righe catalogo senza prezzo base (cadrebbero su fallback): ${missingBase.length}`);
missingBase.slice(0, 20).forEach((m) => console.log('   ' + m));
console.log(`Prezzi EREDITATI divergenti dallo snapshot: ${priceDiffs.length}`);
priceDiffs.slice(0, 30).forEach((d) => console.log(d));
console.log(`Divergenze codiciMap: ${mapDiffs.length}`);
console.log(`Codici base non usati nel menu (normale: EXTRA/CONSEGNA/SUPPLEMENTI): ${baseUnused.length} → ${baseUnused.join(', ')}`);

const ok = priceDiffs.length === 0 && missingBase.length === 0 && mapDiffs.length === 0;
console.log('\n' + (ok
  ? '✅ PARITÀ PERFETTA — ereditando da listino_base ogni prezzo del catalogo è identico allo snapshot live. Via libera al flip.'
  : '❌ DIVERGENZE — NON flippare finché non sono risolte.'));
process.exit(ok ? 0 : 1);
