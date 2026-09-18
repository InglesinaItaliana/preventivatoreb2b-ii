// ============================================================================
// probe-fic-prezzi.mjs — SONDA sul comportamento prezzi/arrotondamenti/sconti
// di Fatture in Cloud. Gemello dei probe fatti su Reviso a giugno.
//
// Risponde a quattro domande, in ordine di importanza:
//   D1. FiC accetta i totali che gli mandiamo, o li ricalcola sempre lui?
//   D2. Come arrotonda: per riga o sul totale documento?
//   D3. Onora uno sconto di riga nativo (campo `discount`)?
//   D4. Quante cifre decimali regge sul prezzo unitario?
//
// SICUREZZA
//   - default DRY-RUN: esegue SOLO letture e stampa i payload che *invierebbe*.
//   - con --apply crea DUE ordini di prova e li cancella subito (cleanup in
//     finally: anche se crasha, prova a rimuoverli e urla se non ci riesce).
//   - crea SOLO documenti type:'order'. Mai DDT, mai fatture. Guardia esplicita.
//   - NON crea anagrafiche: riusa l'entity di un ordine storico esistente.
//   - NON scrive su Firestore. Non rinnova il token se non glielo chiedi.
//
// PREREQUISITI
//   gcloud auth application-default login   (account info@inglesinaitaliana.it)
//   Node 20+ (usa fetch nativo); firebase-admin si risolve da src/functions/.
//   Solo per --refresh servono FIC_CLIENT_ID e FIC_CLIENT_SECRET nell'ambiente.
//
// USO
//   node risorsexCiC/probe-fic-prezzi.mjs              # sola lettura
//   node risorsexCiC/probe-fic-prezzi.mjs --apply      # crea + cancella
//   node risorsexCiC/probe-fic-prezzi.mjs --refresh    # rinnova il token OAuth
//                                                      # (SCRIVE su config/fic,
//                                                      #  ruota il refresh token)
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.resolve(here, '..', 'src', 'functions') + path.sep);
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const REFRESH = process.argv.includes('--refresh');
const BASE = process.env.FIC_API_URL || 'https://api-v2.fattureincloud.it';
const VAT = { id: 0, value: 22 };
const MARCA = 'PROVA TECNICA — NON VALIDO — CANCELLARE';

// --- regola canonica POPS, identica a functions/lib_billing/rounding.ts ------
const round2 = (n) => Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;

const eur = (n) => (n === null || n === undefined ? '—' : Number(n).toFixed(2));
const line = (c = '─') => console.log(c.repeat(78));
const creati = [];   // id degli ordini creati, per il cleanup

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

// ---------------------------------------------------------------------------
// Credenziali
// ---------------------------------------------------------------------------
const cfgRef = db.collection('config').doc('fic');
const cfgSnap = await cfgRef.get();
if (!cfgSnap.exists) { console.error('❌ config/fic non esiste.'); process.exit(1); }
const cfg = cfgSnap.data();

const COMPANY = process.env.FIC_COMPANY_ID || cfg.company_id;
if (!COMPANY) { console.error('❌ company_id assente (env FIC_COMPANY_ID o config/fic.company_id).'); process.exit(1); }

let TOKEN = cfg.access_token;
const scadenza = cfg.token_scadenza?.toDate?.() ?? null;
const scaduto = !scadenza || scadenza <= new Date();

line('═');
console.log('PROBE FiC — prezzi, arrotondamenti, sconti');
line('═');
console.log(`company_id .......... ${COMPANY}`);
console.log(`token scade ......... ${scadenza ? scadenza.toISOString() : '(campo assente)'} ${scaduto ? '⚠️  SCADUTO' : '✅'}`);
console.log(`modalità ............ ${APPLY ? '🔴 APPLY (crea e cancella)' : '🟢 DRY-RUN (sola lettura)'}`);
line();

if (scaduto && !REFRESH) {
  console.log('Il token risulta scaduto. Provo lo stesso: se FiC risponde 401,');
  console.log('rilancia con --refresh (rinnova e SCRIVE il nuovo token su config/fic).');
  line();
}

if (REFRESH) {
  const id = process.env.FIC_CLIENT_ID, secret = process.env.FIC_CLIENT_SECRET;
  if (!id || !secret) { console.error('❌ --refresh richiede FIC_CLIENT_ID e FIC_CLIENT_SECRET nell\'ambiente.'); process.exit(1); }
  const r = await fetch(`${BASE}/oauth/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: cfg.refresh_token, client_id: id, client_secret: secret }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) { console.error(`❌ Refresh fallito (${r.status}):`, JSON.stringify(j).slice(0, 400)); process.exit(1); }
  await cfgRef.update({
    access_token: j.access_token,
    refresh_token: j.refresh_token,
    token_scadenza: admin.firestore.Timestamp.fromDate(new Date(Date.now() + j.expires_in * 1000)),
  });
  TOKEN = j.access_token;
  console.log('✅ Token rinnovato e salvato su config/fic.');
  line();
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const H = () => ({ Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' });

async function api(method, url, body) {
  const r = await fetch(`${BASE}${url}`, { method, headers: H(), body: body ? JSON.stringify(body) : undefined });
  const txt = await r.text();
  let json = null; try { json = txt ? JSON.parse(txt) : null; } catch { /* non-JSON */ }
  return { status: r.status, ok: r.ok, json, txt };
}

// GUARDIA: da qui non esce niente che non sia un ordine.
async function creaOrdine(payload) {
  if (payload?.data?.type !== 'order') throw new Error(`GUARDIA: tentata creazione di type="${payload?.data?.type}". Solo "order" è ammesso.`);
  const res = await api('POST', `/c/${COMPANY}/issued_documents`, payload);
  const id = res.json?.data?.id;
  if (id) creati.push(id);
  return res;
}

// ===========================================================================
// S0 · il token funziona?
// ===========================================================================
console.log('S0 · Verifica accesso (sola lettura)');
const ping = await api('GET', `/c/${COMPANY}/issued_documents?type=order&per_page=1`);
if (!ping.ok) {
  console.error(`❌ FiC risponde ${ping.status}. ${ping.status === 401 ? 'Token non valido: rilancia con --refresh.' : ping.txt.slice(0, 300)}`);
  process.exit(1);
}
console.log(`✅ Accesso ok. Ordini visibili sull'account: ${ping.json?.data?.length ? 'sì' : 'nessuno in prima pagina'}`);
line();

// ===========================================================================
// S1 · calibrazione su un ordine STORICO (sola lettura, zero rischio)
//      Confronta ciò che POPS aveva salvato con ciò che FiC ha conservato.
// ===========================================================================
console.log('S1 · Calibrazione su ordini storici (sola lettura)');
const prevSnap = await db.collection('preventivi').get();
const storici = prevSnap.docs
  .map((d) => ({ id: d.id, ...d.data() }))
  .filter((d) => d.fic_order_id)
  .sort((a, b) => (b.dataCreazione?.toMillis?.() ?? 0) - (a.dataCreazione?.toMillis?.() ?? 0));

console.log(`Preventivi con un ordine FiC: ${storici.length}`);
if (!storici.length) { console.error('❌ Nessun ordine storico: senza entity riusabile non posso proseguire in sicurezza.'); process.exit(1); }

let entityRiusabile = null;
for (const p of storici.slice(0, 3)) {
  const doc = await api('GET', `/c/${COMPANY}/issued_documents/${p.fic_order_id}`);
  if (!doc.ok) { console.log(`  · ${p.codice ?? p.id}: FiC risponde ${doc.status} (documento rimosso?)`); continue; }
  const d = doc.json.data;
  if (!entityRiusabile && d.entity?.id) entityRiusabile = d.entity;

  const righe = d.items_list ?? [];
  const sommaRound2 = round2(righe.reduce((a, r) => a + round2((r.qty ?? 0) * (r.net_price ?? 0)), 0));
  const sommaGrezza = round2(righe.reduce((a, r) => a + (r.qty ?? 0) * (r.net_price ?? 0), 0));

  console.log(`\n  ${p.codice ?? p.id}  (FiC #${d.number ?? '?'}/${d.numeration ?? ''})`);
  console.log(`    righe: ${righe.length}${righe.some((r) => r.code === 'SCONTO') ? '  ← contiene la riga "Sconto Commerciale" negativa' : ''}`);
  console.log(`    sconto di riga usato: ${righe.some((r) => Number(r.discount) > 0) ? 'SÌ' : 'no (campo discount sempre 0/assente)'}`);
  console.log(`    netto secondo FiC ............. ${eur(d.amount_net)}`);
  console.log(`    netto ricostruito per-riga .... ${eur(sommaRound2)}  ${round2(sommaRound2) === round2(d.amount_net) ? '✅ combacia' : '❌ diverge'}`);
  console.log(`    netto ricostruito sul totale .. ${eur(sommaGrezza)}  ${round2(sommaGrezza) === round2(d.amount_net) ? '✅ combacia' : '❌ diverge'}`);
  console.log(`    POPS aveva salvato ............ ${eur(p.netCanonico ?? p.totaleScontato ?? null)}`);
  console.log(`    IVA FiC ${eur(d.amount_vat)} · lordo ${eur(d.amount_gross)}`);
}
line();

// ===========================================================================
// Payload delle due prove (stampati sempre, inviati solo con --apply)
// ===========================================================================

// P1 — righe costruite perché l'arrotondamento per-riga e quello sul totale
//      DIVERGANO di un centesimo, più prezzi a 10 decimali, più uno sconto
//      di riga nativo sull'ultima.
const righeProva = [
  { code: 'PROVA-A', name: 'Prova arrotondamento A', qty: 3, net_price: 10.005 },
  { code: 'PROVA-B', name: 'Prova arrotondamento B', qty: 1, net_price: 0.005 },
  { code: 'PROVA-C', name: 'Prova decimali (10 cifre)', qty: 7, net_price: 1.4285714286 },
  { code: 'PROVA-D', name: 'Prova sconto di riga 12,5%', qty: 2, net_price: 12.3456789012, discount: 12.5 },
].map((r) => ({ ...r, vat: VAT }));

const attesoPerRiga = righeProva.map((r) => round2(r.qty * r.net_price * (1 - (r.discount ?? 0) / 100)));
const attesoNettoPerRiga = round2(attesoPerRiga.reduce((a, b) => a + b, 0));
const attesoNettoGrezzo = round2(righeProva.reduce((a, r) => a + r.qty * r.net_price * (1 - (r.discount ?? 0) / 100), 0));

const payloadP1 = {
  data: {
    type: 'order',
    entity: entityRiusabile,
    date: new Date().toISOString().slice(0, 10),
    visible_subject: MARCA,
    items_list: righeProva,
    stock: false, show_payments: false, show_payment_method: false,
  },
};

// P2 — stesse righe, ma stavolta gli IMPONIAMO i totali. Se li conserva,
//      la garanzia "il cliente paga la cifra che ha firmato" si può ricostruire.
const payloadP2 = JSON.parse(JSON.stringify(payloadP1));
payloadP2.data.visible_subject = `${MARCA} (totali imposti)`;
payloadP2.data.amount_net = attesoNettoPerRiga;
payloadP2.data.amount_vat = round2((attesoNettoPerRiga * VAT.value) / 100);
payloadP2.data.amount_gross = round2(attesoNettoPerRiga + round2((attesoNettoPerRiga * VAT.value) / 100));

console.log('Attese secondo la regola canonica POPS');
console.log(`  netto sommando le righe arrotondate ... ${eur(attesoNettoPerRiga)}`);
console.log(`  netto arrotondando il totale grezzo ... ${eur(attesoNettoGrezzo)}`);
console.log(`  differenza fra i due metodi ........... ${eur(Math.abs(attesoNettoPerRiga - attesoNettoGrezzo))}  ← il discriminante`);
line();

if (APPLY && !entityRiusabile) {
  console.error('❌ Nessuna anagrafica riusabile letta da FiC: con --apply mi fermo.');
  console.error('   (Non creo clienti di prova: sporcherebbero il registro della vecchia società.)');
  process.exit(1);
}

if (!APPLY) {
  console.log('DRY-RUN: nessun documento creato. Payload che verrebbero inviati:\n');
  console.log('— P1 (totali calcolati da FiC) —');
  console.log(JSON.stringify(payloadP1, null, 2));
  console.log('\n— P2 (totali imposti da noi) —');
  console.log(JSON.stringify(payloadP2, null, 2));
  line('═');
  console.log('Per eseguirle davvero: aggiungi --apply');
  process.exit(0);
}

// ===========================================================================
// S2/S3 · esecuzione reale, con cleanup garantito
// ===========================================================================
try {
  for (const [nome, payload] of [['P1 · totali calcolati da FiC', payloadP1], ['P2 · totali imposti da noi', payloadP2]]) {
    console.log(`\n${nome}`);
    const res = await creaOrdine(payload);

    if (!res.ok) {
      console.log(`  ❌ rifiutato con ${res.status}`);
      console.log(`  ${JSON.stringify(res.json ?? res.txt).slice(0, 600)}`);
      if (res.json?.extra?.totals) console.log(`  ← FiC dichiara i suoi totali nell'errore: ${JSON.stringify(res.json.extra.totals)}`);
      continue;
    }

    const id = res.json.data.id;
    const back = await api('GET', `/c/${COMPANY}/issued_documents/${id}`);
    const d = back.json?.data ?? res.json.data;
    console.log(`  creato id ${id} (#${d.number ?? '?'})`);
    console.log(`    netto FiC ${eur(d.amount_net)} · atteso per-riga ${eur(attesoNettoPerRiga)} · atteso sul totale ${eur(attesoNettoGrezzo)}`);
    console.log(`    → arrotonda ${round2(d.amount_net) === attesoNettoPerRiga ? 'PER RIGA (come noi)' : round2(d.amount_net) === attesoNettoGrezzo ? 'SUL TOTALE (diverso da noi)' : 'in un terzo modo: ' + eur(d.amount_net)}`);
    if (payload.data.amount_net !== undefined) {
      console.log(`    → totali imposti: ${round2(d.amount_net) === round2(payload.data.amount_net) ? '✅ CONSERVATI' : '❌ SOVRASCRITTI da FiC'}`);
    }
    (d.items_list ?? []).forEach((r, i) => {
      const atteso = attesoPerRiga[i];
      console.log(`    riga ${r.code ?? i}: price ${r.net_price} · discount ${r.discount ?? 0} · netto riga ${eur(r.amount_net ?? r.net_price * r.qty)} · atteso ${eur(atteso)}`);
    });
  }
} finally {
  line();
  console.log('Cleanup');
  for (const id of creati) {
    const del = await api('DELETE', `/c/${COMPANY}/issued_documents/${id}`);
    const check = await api('GET', `/c/${COMPANY}/issued_documents/${id}`);
    const sparito = check.status === 404;
    console.log(`  ${sparito ? '✅' : '🚨'} ${id}: DELETE ${del.status}, rilettura ${check.status}${sparito ? '' : '  ← RIMASTO, CANCELLALO A MANO'}`);
  }
  line('═');
}
