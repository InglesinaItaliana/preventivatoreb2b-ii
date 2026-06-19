// ============================================================================
// verify-catalogo.mjs — GATE di non-regressione Fase 1 (sola lettura).
//
// Ricostruisce `listino` (albero) + `codiciMap` da DUE sorgenti:
//   (A) Google Sheet CSV  — la fonte attuale
//   (B) Firestore catalogo — la nuova sorgente (post seed-catalogo --apply)
// con LA STESSA logica di src/Data/catalog.ts, poi le confronta a fondo.
//
// Perché basta: calculatePrice (src/logic/pricing.ts) è funzione PURA di
// (input, listino, codiciMap). Se listino e codiciMap sono identici, ogni
// prezzo di ogni preventivo è identico per definizione. 0 differenze = via
// libera per flippare la sorgente.
//
// Sola lettura. Uso:  node risorsexCiC/verify-catalogo.mjs
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const rootDir = path.resolve(here, '..') + path.sep;
const admin = createRequire(fnDir)('firebase-admin');
const Papa = createRequire(rootDir)('papaparse');

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQspWsxI0p5Rbvss1cZlGiLl8yrzPa23xPJ63x-uQunbnWgmVPC32RRB_qSwELeBYDYf3ZCR0IvYH_m/pub?gid=1843801803&single=true&output=csv';

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

// Logica IDENTICA a catalog.ts: da una lista di righe normalizzate → {tree, map}.
// Una "riga normalizzata" = { categoria, modello, dimensione, finitura, tipoFinitura, cod, prezzo }.
function build(rows) {
  const tree = {};
  const map = {};
  for (const r of rows) {
    const { categoria: cat, modello: mod, dimensione: dim, finitura: fin, tipoFinitura: tipoFin, cod, prezzo: price } = r;
    if (cat && mod) {
      if (!tree[cat]) tree[cat] = {};
      if (!tree[cat][mod]) tree[cat][mod] = {};
      if (!tree[cat][mod][dim]) tree[cat][mod][dim] = {};
      tree[cat][mod][dim][fin] = { prezzo: price, cod, group: tipoFin };
    }
    if (cod) map[cod] = price;
  }
  return { tree, map };
}

// (A) righe dal CSV (stessa normalizzazione di catalog.ts e seed-catalogo)
const res = await fetch(GOOGLE_SHEET_CSV_URL);
if (!res.ok) { console.error('❌ CSV:', res.status); process.exit(1); }
const parsed = Papa.parse(await res.text(), { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toUpperCase() });
const rowsCSV = [];
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
  rowsCSV.push({ categoria, modello, dimensione, finitura, tipoFinitura, cod, prezzo });
}

// (B) righe da Firestore catalogo, ORDINATE per `ord` (preserva l'overwrite "ultimo vince")
const snap = await db.collection('catalogo').orderBy('ord').get();
if (snap.empty) { console.error('❌ Collezione catalogo VUOTA — esegui prima: node risorsexCiC/seed-catalogo.mjs --apply'); process.exit(1); }
const rowsFS = snap.docs.map((d) => d.data());

const A = build(rowsCSV);
const B = build(rowsFS);

// confronto deterministico: riordino ricorsivo delle chiavi
function canon(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(canon);
  const out = {};
  for (const k of Object.keys(v).sort()) out[k] = canon(v[k]);
  return out;
}
const eq = (x, y) => JSON.stringify(canon(x)) === JSON.stringify(canon(y));

// --- diff codiciMap ---
const codsA = Object.keys(A.map).sort();
const codsB = Object.keys(B.map).sort();
const mapDiffs = [];
const allCods = [...new Set([...codsA, ...codsB])].sort();
for (const c of allCods) {
  // Object.is così NaN==NaN (il foglio ha I132 con prezzo non numerico → NaN in entrambe le sorgenti)
  if (!Object.is(A.map[c], B.map[c])) mapDiffs.push(`  cod ${c}: CSV=${A.map[c]} vs FS=${B.map[c]}`);
}
const nanCods = allCods.filter((c) => Number.isNaN(A.map[c]));
if (nanCods.length) console.log(`ℹ️  Codici con prezzo NaN nel foglio (bug dati pre-esistente, riprodotto fedelmente): ${nanCods.join(', ')}\n`);

// --- diff albero (per foglia) ---
const treeDiffs = [];
function walk(a, b, pathStr) {
  const keys = [...new Set([...Object.keys(a || {}), ...Object.keys(b || {})])];
  for (const k of keys) {
    const av = a?.[k], bv = b?.[k];
    const isLeaf = av && typeof av === 'object' && 'prezzo' in av;
    if (isLeaf || (bv && typeof bv === 'object' && 'prezzo' in bv)) {
      if (!eq(av, bv)) treeDiffs.push(`  ${pathStr}/${k}: CSV=${JSON.stringify(av)} vs FS=${JSON.stringify(bv)}`);
    } else {
      walk(av || {}, bv || {}, `${pathStr}/${k}`);
    }
  }
}
walk(A.tree, B.tree, '');

console.log('=== VERIFICA PARITÀ catalogo (Google Sheet vs Firestore) ===\n');
console.log(`Righe CSV: ${rowsCSV.length}  ·  Doc Firestore: ${rowsFS.length}`);
console.log(`codiciMap: CSV ${codsA.length} codici · FS ${codsB.length} codici`);
console.log(`Foglie albero: CSV ${countLeaves(A.tree)} · FS ${countLeaves(B.tree)}`);
console.log('');
console.log(`Differenze codiciMap: ${mapDiffs.length}`);
mapDiffs.slice(0, 30).forEach((d) => console.log(d));
console.log(`Differenze albero (foglie): ${treeDiffs.length}`);
treeDiffs.slice(0, 30).forEach((d) => console.log(d));
console.log('');

const ok = mapDiffs.length === 0 && treeDiffs.length === 0;
console.log(ok
  ? '✅ PARITÀ PERFETTA — listino e codiciMap identici. Prezzi garantiti invariati: via libera al flip.'
  : '❌ DIVERGENZE TROVATE — NON flippare la sorgente finché non sono risolte.');

function countLeaves(tree) {
  let n = 0;
  for (const cat of Object.values(tree)) for (const mod of Object.values(cat)) for (const dim of Object.values(mod)) n += Object.keys(dim).length;
  return n;
}
process.exit(ok ? 0 : 1);
