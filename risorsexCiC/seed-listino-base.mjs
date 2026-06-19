// ============================================================================
// seed-listino-base.mjs — semina `listino_base` (i 48 prezzi base = CONFIG_PREZZI).
//
// CONFIG_PREZZI è la fonte di verità leggibile: una riga per CODICE, con il
// prezzo + le etichette (sezione/modello/dimensione/finitura). Le 389 righe del
// catalogo NE EREDITANO il prezzo (catalog.ts: codiciMap viene da qui).
//
// Modello doc `listino_base/{COD}`:
//   { cod, prezzo, sezione, modello, dimensione, finitura, unita, ord }
//   id = COD (univoco tra i 48) → re-seed idempotente.
//
// SICUREZZA: default DRY-RUN. Scrive con:  node risorsexCiC/seed-listino-base.mjs --apply
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const reqFn = createRequire(path.resolve(here, '..', 'src', 'functions') + path.sep);
const reqRoot = createRequire(path.resolve(here, '..') + path.sep);
const admin = reqFn('firebase-admin');
const Papa = reqRoot('papaparse');

const APPLY = process.argv.includes('--apply');
const CONFIG_PREZZI_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQspWsxI0p5Rbvss1cZlGiLl8yrzPa23xPJ63x-uQunbnWgmVPC32RRB_qSwELeBYDYf3ZCR0IvYH_m/pub?gid=1233260035&single=true&output=csv';

const SECTIONS = new Set(['GRIGLIA', 'DUPLEX', 'MUNTIN', 'CANALINO', 'SUPPLEMENTI', 'EXTRA', 'CONSEGNA', 'SPEDIZIONI', 'CONDIZIONI COMMECIALI', 'NOTE']);
const cleanPrice = (v) => { let p = v; if (typeof p === 'string') p = p.replace('€', '').replace(',', '.').trim(); return p ? parseFloat(p) : 0; };
const t = (v) => String(v ?? '').trim();

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
console.log(APPLY ? '🔴 APPLY — scrivo su listino_base/\n' : '🟢 DRY-RUN — nessuna scrittura (usa --apply)\n');

const csv = await (await fetch(CONFIG_PREZZI_CSV)).text();
const rows = Papa.parse(csv, { header: false }).data;

const base = [];
let sezione = '', lastModel = '', lastDim = '', ord = 0;
for (const row of rows) {
  const c0 = t(row[0]), c1 = t(row[1]), c2 = t(row[2]), c4 = t(row[4]);
  const cod = t(row[5]).toUpperCase();

  if (SECTIONS.has(c0.toUpperCase())) { sezione = c0.toUpperCase(); continue; } // riga di sezione
  if (!/^[A-Z]\d{2,}$/.test(cod)) continue; // header / note / riga senza codice → ignora

  // forward-fill: un nuovo modello (c0 valorizzato) resetta la dimensione; altrimenti eredita
  if (c0) { lastModel = c0; lastDim = c1; }
  else if (c1) { lastDim = c1; }

  base.push({
    cod,
    prezzo: cleanPrice(row[3]),
    sezione,
    modello: lastModel,
    dimensione: lastDim,
    finitura: c2,
    unita: c4,
    ord: ord++,
  });
}

// report raggruppato
const bySez = {};
for (const b of base) (bySez[b.sezione] ||= []).push(b);
console.log(`Codici base estratti: ${base.length}\n`);
for (const [sez, items] of Object.entries(bySez)) {
  console.log(`── ${sez} (${items.length}) ──`);
  for (const b of items) {
    const lbl = [b.modello, b.dimensione, b.finitura].filter((x) => x && x !== 'x' && x !== 'TUTTE').join(' · ');
    console.log(`   ${b.cod}  ${String(Number.isNaN(b.prezzo) ? 'a richiesta' : '€ ' + b.prezzo).padEnd(12)} ${lbl}`);
  }
}

// id univoci?
const ids = new Set(base.map((b) => b.cod));
if (ids.size !== base.length) { console.error(`\n❌ codici duplicati: ${base.length - ids.size}`); process.exit(1); }

if (!APPLY) { console.log('\n🟢 Dry-run completato. Rilancia con --apply.'); process.exit(0); }

let batch = db.batch(), n = 0, written = 0;
for (const b of base) {
  const { cod, ...data } = b;
  batch.set(db.collection('listino_base').doc(cod), { cod, ...data }, { merge: false });
  written++; n++;
  if (n >= 450) { await batch.commit(); batch = db.batch(); n = 0; }
}
if (n > 0) await batch.commit();
console.log(`\n✅ Scritti ${written} doc in listino_base/.`);
process.exit(0);
