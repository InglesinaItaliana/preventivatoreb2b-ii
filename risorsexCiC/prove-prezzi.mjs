// ============================================================================
// prove-prezzi.mjs — PROVE SUI PREVENTIVI REALI (sola lettura).
//
// Ricalcola il prezzo di OGNI riga di OGNI preventivo reale con DUE cataloghi:
//   A = Google Sheet (sorgente legacy)
//   B = Firestore (listino_base + catalogo, prezzo ereditato dalla base)
// usando la STESSA formula del preventivatore (calculateLogic2026, copiata
// verbatim da src/logic/pricing.ts) applicata identica ad A e B.
//
// Se prezzo_A == prezzo_B per ogni riga → passare al listino interno NON
// cambia nessun prezzo. (Confronto anche con lo snapshot salvato, informativo:
// può differire per i preventivi vecchi fatti quando il foglio era diverso.)
//
// Uso:  node risorsexCiC/prove-prezzi.mjs
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const admin = createRequire(path.resolve(here, '..', 'src', 'functions') + path.sep)('firebase-admin');
const Papa = createRequire(path.resolve(here, '..') + path.sep)('papaparse');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

const OUTPUT_CSV = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQspWsxI0p5Rbvss1cZlGiLl8yrzPa23xPJ63x-uQunbnWgmVPC32RRB_qSwELeBYDYf3ZCR0IvYH_m/pub?gid=1843801803&single=true&output=csv';
const UP = (s) => String(s ?? '').trim().toUpperCase();

// --- formula 2026 VERBATIM da src/logic/pricing.ts ---
const MOLT_SOLO_CANALINO = { C111: 1.5, C112: 2.0, C211: 2.5, C311: 3.0 };
const getSupp = (cat, code) => { const p = cat.codiciMap?.[String(code).toUpperCase()]; return p !== undefined ? p : 0; };
function calc2026(input, catalog) {
  const base_round = Math.ceil(input.base_mm / 50) * 50;
  const altezza_round = Math.ceil(input.altezza_mm / 50) * 50;
  const metri_perimetro = ((base_round * 2) + (altezza_round * 2)) / 1000;
  if (input.isSoloCanalino) {
    let pu = 0;
    if (input.codice_canalino) { const m = MOLT_SOLO_CANALINO[input.codice_canalino.toUpperCase()]; if (m) pu = metri_perimetro * m; }
    return { prezzo_unitario: pu, prezzo_totale: pu * input.qty };
  }
  const metri_griglia = ((input.num_orizzontali * base_round) + (input.num_verticali * altezza_round)) / 1000;
  let taglia = 'XL';
  if (metri_perimetro < 2.5) taglia = 'S'; else if (metri_perimetro < 5.0) taglia = 'M'; else if (metri_perimetro < 7.5) taglia = 'L';
  let complessita = 0;
  if (input.num_verticali > 0 && input.num_orizzontali > 0) complessita = 1;
  else if ((input.num_verticali > 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali > 1)) complessita = 2;
  else if ((input.num_verticali === 1 && !input.num_orizzontali) || (!input.num_verticali && input.num_orizzontali === 1)) complessita = 3;
  const senzaCanalino = !input.tipo_canalino || input.tipo_canalino.toUpperCase() === 'NESSUNO';
  const soloOrizzontali = input.num_verticali === 0 && input.num_orizzontali >= 1;
  if (senzaCanalino && soloOrizzontali) complessita = 1;
  const costo_setup = metri_griglia < 2.0 ? getSupp(catalog, 'S001') : getSupp(catalog, 'S002');
  const perim = { ALLUMINIO: { S: 'S003', M: 'S004', L: 'S005', XL: 'S006' }, 'BORDO CALDO': { S: 'S007', M: 'S008', L: 'S009', XL: 'S010' }, FIBRA: { S: 'S011', M: 'S012', L: 'S013', XL: 'S014' } };
  const key = input.tipo_canalino ? input.tipo_canalino.toUpperCase() : '';
  let costo_perimetrale = 0;
  if (perim[key]) costo_perimetrale = getSupp(catalog, perim[key][taglia]);
  let pu = 0;
  if (complessita === 1) pu = metri_griglia * (input.prezzo_unitario_griglia + input.prezzo_unitario_canalino);
  else if (complessita === 2 || complessita === 3) pu = (metri_griglia * input.prezzo_unitario_griglia) + costo_perimetrale + costo_setup;
  return { prezzo_unitario: pu, prezzo_totale: pu * input.qty };
}

// --- costruzione cataloghi {listino, codiciMap} ---
function buildTreeMap(rows) {
  const tree = {}, map = {};
  for (const r of rows) {
    if (r.categoria && r.modello) { ((tree[r.categoria] ||= {})[r.modello] ||= {})[r.dimensione] ||= {}; tree[r.categoria][r.modello][r.dimensione][r.finitura] = { prezzo: r.prezzo, cod: r.cod, group: r.tipoFinitura }; }
    if (r.cod) map[r.cod] = r.prezzo;
  }
  return { listino: tree, codiciMap: map };
}
// A = "vecchio sistema" = snapshot fedele del foglio = catalogo.stored prezzo
//     (verify-catalogo al seed: catalogo == output sheet, 0 diff). NB: NON uso la
//     CSV live perché ora è rotta (header duplicati dopo la pubblicazione CONFIG_PREZZI).
const catDocs = (await db.collection('catalogo').orderBy('ord').get()).docs.map((d) => d.data());
const rowsA = catDocs.map((r) => ({ categoria: r.categoria, modello: r.modello, dimensione: r.dimensione, finitura: r.finitura, tipoFinitura: r.tipoFinitura, cod: r.cod, prezzo: r.prezzo }));
const catA = buildTreeMap(rowsA);
// B = "nuovo sistema" = struttura catalogo + prezzo EREDITATO da listino_base
const baseMap = {};
(await db.collection('listino_base').get()).docs.forEach((d) => { const r = d.data(); baseMap[r.cod] = r.prezzo; });
const rowsB = catDocs.map((r) => ({ categoria: r.categoria, modello: r.modello, dimensione: r.dimensione, finitura: r.finitura, tipoFinitura: r.tipoFinitura, cod: r.cod, prezzo: (r.cod in baseMap) ? baseMap[r.cod] : r.prezzo }));
const catB = buildTreeMap(rowsB);
catB.codiciMap = { ...baseMap, ...catB.codiciMap };

// --- replica BuilderView: da una riga salvata → input pricing per un dato catalogo ---
function lineToInput(line, cat) {
  const soloCanalino = UP(line.modello) === 'MANUALE';
  const rc = line.rawCanalino || {};
  const canalinoObj = cat.listino?.CANALINO?.[UP(rc.tipo)]?.[UP(rc.dim)]?.[UP(rc.fin)];
  const pCanalino = canalinoObj?.prezzo || 0;
  const codCanalino = canalinoObj?.cod || '';
  let basePriceGriglia = 0, codGriglia = '';
  if (!soloCanalino) {
    const g = cat.listino?.[UP(line.categoria)]?.[UP(line.modello)]?.[UP(line.dimensione)]?.[UP(line.finitura)];
    basePriceGriglia = g?.prezzo || 0;
    codGriglia = g?.cod || '';
    if (line.customVarPrice && Number(line.customVarPrice) > 0) basePriceGriglia = Number(line.customVarPrice);
  }
  return {
    base_mm: line.base_mm || 0, altezza_mm: line.altezza_mm || 0, qty: line.quantita || 1,
    num_orizzontali: line.colonne || 0, num_verticali: line.righe || 0,
    tipo_canalino: rc.tipo || '', codice_canalino: codCanalino, isSoloCanalino: soloCanalino,
    prezzo_unitario_griglia: basePriceGriglia, prezzo_unitario_canalino: pCanalino,
    _codGriglia: codGriglia,
  };
}

// --- loop sui preventivi reali ---
const snap = await db.collection('preventivi').get();
let quotes = 0, lines = 0, tested = 0, skipped = 0, nanLines = 0;
let abDiffs = 0, snapDiffs = 0;
const abExamples = [], snapExamples = [];
const r2 = (n) => Math.round(n * 100) / 100;

for (const doc of snap.docs) {
  const d = doc.data();
  const elems = d.elementi || [];
  if (!elems.length) continue;
  quotes++;
  for (const line of elems) {
    lines++;
    // salta righe non-prodotto (EXTRA/spedizione/manuali): nessuna misura o categoria non a catalogo
    if (!line.base_mm && UP(line.modello) !== 'MANUALE') { skipped++; continue; }
    const inA = lineToInput(line, catA);
    const inB = lineToInput(line, catB);
    const ra = calc2026(inA, catA);
    const rb = calc2026(inB, catB);
    if (Number.isNaN(ra.prezzo_unitario) || Number.isNaN(rb.prezzo_unitario)) { nanLines++; continue; }
    tested++;
    // A vs B (LA prova: deve essere 0)
    if (r2(ra.prezzo_unitario) !== r2(rb.prezzo_unitario)) {
      abDiffs++;
      if (abExamples.length < 15) abExamples.push(`${doc.id} · ${line.descrizioneCompleta || line.codice}: A=${r2(ra.prezzo_unitario)} vs B=${r2(rb.prezzo_unitario)}`);
    }
    // B vs snapshot salvato (informativo)
    const snapPu = Number(line.prezzo_unitario);
    if (!Number.isNaN(snapPu) && r2(rb.prezzo_unitario) !== r2(snapPu)) {
      snapDiffs++;
      if (snapExamples.length < 15) snapExamples.push(`${doc.id} · ${line.descrizioneCompleta || line.codice}: ricalcolo=${r2(rb.prezzo_unitario)} vs salvato=${r2(snapPu)}`);
    }
  }
}

console.log('=== PROVE PREZZI SU PREVENTIVI REALI ===\n');
console.log(`Preventivi con righe: ${quotes} · righe totali: ${lines}`);
console.log(`Righe prodotto testate: ${tested} · saltate (extra/spedizione/manuali): ${skipped} · NaN "a richiesta": ${nanLines}\n`);
console.log(`🎯 DIFFERENZE A(foglio) vs B(firestore): ${abDiffs}   ← deve essere 0`);
abExamples.forEach((e) => console.log('   ' + e));
console.log(ondMsg(abDiffs));
console.log(`\nℹ️  Ricalcolo(B) vs snapshot salvato: ${snapDiffs}/${tested} righe differenti (atteso >0: preventivi vecchi fatti con prezzi diversi nel foglio).`);
snapExamples.slice(0, 6).forEach((e) => console.log('   ' + e));
function ondMsg(n) { return n === 0 ? '\n✅ PROVA SUPERATA: ogni prezzo su ogni preventivo reale è IDENTICO tra foglio e listino interno.' : '\n❌ TROVATE DIFFERENZE — rollback consigliato (flip sheet) e indagine.'; }
process.exit(abDiffs === 0 ? 0 : 1);
