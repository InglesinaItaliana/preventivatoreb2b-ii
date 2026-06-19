// ============================================================================
// seed-catalogo.mjs — semina la collezione Firestore `catalogo` dal Google Sheet
// attuale, 1:1. È il passo 1 della Fase 1 "listino interno a POPS".
//
// Usa LO STESSO papaparse e LA STESSA identica logica di parsing di
// src/Data/catalog.ts → la parità è garantita per costruzione. Ogni riga del
// foglio diventa un doc `catalogo/{id}` con i campi normalizzati; lo store poi
// ricostruisce `listino` (albero) + `codiciMap` con le stesse condizioni.
//
// Modello doc:
//   { categoria, modello, dimensione, finitura, tipoFinitura, cod, prezzo,
//     attivo:true, ord }
//   id deterministico = slug(categoria|modello|dimensione|finitura|cod) → re-seed idempotente.
//
// SICUREZZA: default DRY-RUN (solo report, niente scritture). Scrive con:
//   node risorsexCiC/seed-catalogo.mjs --apply
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const rootDir = path.resolve(here, '..') + path.sep;
const requireFn = createRequire(fnDir);    // firebase-admin (src/functions/node_modules)
const requireRoot = createRequire(rootDir); // papaparse (node_modules root)
const admin = requireFn('firebase-admin');
const Papa = requireRoot('papaparse');

const APPLY = process.argv.includes('--apply');

// Stessa URL di src/Data/catalog.ts (fonte di verità attuale)
const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQspWsxI0p5Rbvss1cZlGiLl8yrzPa23xPJ63x-uQunbnWgmVPC32RRB_qSwELeBYDYf3ZCR0IvYH_m/pub?gid=1843801803&single=true&output=csv';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

console.log(APPLY ? '🔴 MODALITÀ APPLY — scrivo davvero su catalogo/\n' : '🟢 DRY-RUN — nessuna scrittura (usa --apply per eseguire)\n');

// 1) scarica il CSV
const res = await fetch(GOOGLE_SHEET_CSV_URL);
if (!res.ok) { console.error('❌ Errore connessione Google Sheet:', res.status); process.exit(1); }
const csvText = await res.text();

// 2) parse IDENTICO a catalog.ts
const parsed = Papa.parse(csvText, {
  header: true,
  skipEmptyLines: true,
  transformHeader: (h) => h.trim().toUpperCase(),
});

// 3) normalizza ogni riga con la STESSA logica di catalog.ts
const slug = (s) => String(s ?? '').toUpperCase().trim().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'X';
const rows = [];
let inTree = 0, inMap = 0, ord = 0;
for (const row of parsed.data) {
  const categoria = (row.CATEGORIA || row.INGLESINE || '').trim().toUpperCase();
  const modello = (row.TIPO || row.MODELLO || '').trim().toUpperCase();
  const dimensione = (row.DIMENSIONE || 'STD').trim().toUpperCase();
  const finitura = (row.FINITURA || 'STD').trim().toUpperCase();
  const tipoFinitura = (row.TIPO_FINITURA || 'Altro').trim();
  const cod = (row.CODICE || '').trim().toUpperCase();

  let rawPrice = row.PREZZO;
  if (typeof rawPrice === 'string') rawPrice = rawPrice.replace('€', '').replace(',', '.').trim();
  const prezzo = rawPrice ? parseFloat(rawPrice) : 0;

  // condizioni catalog.ts: albero se cat && mod; mappa se cod
  const contribTree = !!(categoria && modello);
  const contribMap = !!cod;
  if (!contribTree && !contribMap) continue; // riga inutile (come lo store la ignora)
  if (contribTree) inTree++;
  if (contribMap) inMap++;

  const id = slug(`${categoria}|${modello}|${dimensione}|${finitura}|${cod}`);
  rows.push({ id, categoria, modello, dimensione, finitura, tipoFinitura, cod, prezzo, attivo: true, ord: ord++ });
}

// 4) report + rilevamento collisioni id
const byId = new Map();
const collisions = [];
for (const r of rows) {
  if (byId.has(r.id)) collisions.push({ id: r.id, a: byId.get(r.id), b: r });
  else byId.set(r.id, r);
}

console.log(`Righe CSV totali (post skipEmptyLines): ${parsed.data.length}`);
console.log(`Righe utili (contribuiscono ad albero o mappa): ${rows.length}`);
console.log(`  • contribuiscono all'ALBERO (listino): ${inTree}`);
console.log(`  • contribuiscono alla MAPPA (codiciMap): ${inMap}`);
console.log(`Doc id univoci: ${byId.size}`);
console.log(`⚠️  Collisioni id: ${collisions.length}`);
if (collisions.length) {
  for (const c of collisions.slice(0, 20)) {
    console.log(`   COLLISIONE ${c.id}: prezzo ${c.a.prezzo} (${c.a.categoria}/${c.a.modello}/${c.a.dimensione}/${c.a.finitura}/${c.a.cod}) vs ${c.b.prezzo}`);
  }
  console.log('   → se i prezzi divergono è un problema reale; se identici è una riga duplicata innocua.');
}
console.log('\nEsempi (primi 8):');
for (const r of rows.slice(0, 8)) console.log('  ', JSON.stringify(r));

if (!APPLY) { console.log('\n🟢 Dry-run completato. Rilancia con --apply per scrivere.'); process.exit(0); }

// 5) scrittura batch idempotente (set su id deterministico)
let written = 0;
let batch = db.batch();
let n = 0;
for (const r of byId.values()) {
  const { id, ...data } = r;
  batch.set(db.collection('catalogo').doc(id), data, { merge: false });
  written++; n++;
  if (n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
}
if (n > 0) await batch.commit();
console.log(`\n✅ Scritti ${written} doc in catalogo/.`);
process.exit(0);
