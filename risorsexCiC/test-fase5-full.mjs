// ============================================================================
// test-fase5-full.mjs — Fase 5 ROBUSTA: ORDINI + PREVENTIVI sullo stesso campione
// di preventivi reali. Usa il CicProvider compilato, confronta netAmount/IVA col
// totale POPS (tolleranza 0,01) e CANCELLA ogni documento. Cleanup garantito in
// finally (traccia ogni id creato → nessun orfano anche su interruzione).
//
// I DDT NON sono qui: l'emissione consuma numeri fiscali progressivi (vedi test-fase5-ddt.mjs).
// SICUREZZA: default DRY-RUN. Esegui con:  LIMIT=60 node risorsexCiC/test-fase5-full.mjs --apply
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.env.LIMIT || 60);
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
const { createCicProvider } = require('./lib/lib_billing/cicProvider.js');
const cfg = (await db.collection('config').doc('cic').get()).data();
const CREDS = { secret: cfg.appSecretToken, agreement: cfg.agreementGrantToken, baseUrl: cfg.baseUrl };
const up = (s) => String(s ?? '').toUpperCase().trim();
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function del(kind, id) {
  const base = kind === 'order' ? '/orders/' : '/quotations/';
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 15000);
    const r = await fetch(`${CREDS.baseUrl}${base}${id}`, { method: 'DELETE', headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' }, signal: ctrl.signal });
    clearTimeout(t); return r.ok;
  } catch { return false; }
}
async function resolveCicProductIds(codes) {
  const uniq = [...new Set(codes.filter(Boolean).map((c) => up(c)))];
  const map = new Map();
  await Promise.all(uniq.map(async (code) => { const s = await db.collection('products').doc(code).get(); const pid = s.exists ? s.data()?.cicProductId : undefined; if (pid != null) map.set(code, pid); }));
  return map;
}
function buildLines(elementi) {
  return (elementi || []).map((item) => {
    let desc = item.descrizioneCompleta || 'Articolo Vetrata';
    if (item.categoria !== 'EXTRA' && (item.base_mm > 0 || item.altezza_mm > 0)) desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
    return { code: item.codice ? up(item.codice) : '', description: desc, qty: item.quantita || 1, unitNetPrice: item.prezzo_unitario || 0, category: item.categoria };
  });
}
const expectedNetOf = (d) => (typeof d.netCanonico === 'number') ? d.netCanonico : (typeof d.totaleScontato === 'number') ? d.totaleScontato : (d.totaleImponibile || 0);

// campione (stessa selezione diversificata di test-fase5.mjs)
const snap = await db.collection('preventivi').limit(500).get();
const candidates = [];
for (const doc of snap.docs) {
  const d = doc.data();
  if (!Array.isArray(d.elementi) || d.elementi.length === 0 || !d.clienteUID) continue;
  const expectedNet = expectedNetOf(d);
  if (!(expectedNet > 0)) continue;
  candidates.push({ id: doc.id, d, expectedNet, hasSconto: (Number(d.scontoPercentuale) || 0) > 0, hasConsegna: d.elementi.some((e) => e.categoria === 'EXTRA' && /^L0\d\d$/i.test(String(e.codice || ''))), nLines: d.elementi.length });
}
const pick = [];
const take = (pred, n) => { let c = 0; for (const x of candidates) { if (pick.length >= LIMIT) break; if (pred(x) && !pick.includes(x)) { pick.push(x); if (++c >= n) break; } } };
take((c) => c.hasSconto && c.hasConsegna, 8);
take((c) => c.hasSconto, 12);
take((c) => c.hasConsegna, 15);
take((c) => c.nLines >= 4, 10);
for (const c of candidates) { if (pick.length >= LIMIT) break; if (!pick.includes(c)) pick.push(c); }

console.log(APPLY ? '🔴 APPLY — ordini + preventivi (creati e cancellati)\n' : '🟢 DRY-RUN\n');
console.log(`Candidati: ${candidates.length} · selezionati: ${pick.length} · sconto=${pick.filter((c) => c.hasSconto).length} consegna=${pick.filter((c) => c.hasConsegna).length} multi-riga=${pick.filter((c) => c.nLines >= 4).length}\n`);
if (!APPLY) { console.log('🟢 Dry-run. Rilancia con --apply.'); process.exit(0); }

const provider = await createCicProvider();
const created = new Set(); // `${kind}:${id}`
const res = { order: { ok: 0, ko: 0, fails: [] }, quotation: { ok: 0, ko: 0, fails: [] } };

async function testDoc(kind, c, customer, lines) {
  const make = kind === 'order' ? provider.createOrder.bind(provider) : provider.createQuotation.bind(provider);
  const r = await make({ customer, date: c.d.dataConsegnaPrevista || new Date().toISOString().split('T')[0], lines, discountPercentage: Number(c.d.scontoPercentuale) || 0, visibleSubject: c.d.commessa || `Rif: ${c.d.codice}` });
  created.add(`${kind}:${r.id}`);
  const netDiff = round2((r.netAmount || 0) - c.expectedNet);
  const vatDiff = round2((r.vatAmount || 0) - round2(c.expectedNet * 0.22));
  const ok = Math.abs(netDiff) <= 0.01 && Math.abs(vatDiff) <= 0.01;
  if (ok) res[kind].ok++; else { res[kind].ko++; res[kind].fails.push(`${c.id.slice(0, 8)} net=${r.netAmount} vs ${c.expectedNet} Δ${netDiff}`); }
  if (await del(kind, r.id)) created.delete(`${kind}:${r.id}`);
}

try {
  let i = 0;
  for (const c of pick) {
    i++;
    try {
      const u = (await db.collection('users').doc(c.d.clienteUID).get()).data() || {};
      if (!u.piva) { res.order.ko++; res.order.fails.push(`${c.id.slice(0, 8)} no P.IVA`); continue; }
      const customer = await provider.findOrCreateCustomer({ piva: u.piva, name: u.ragioneSociale || c.d.cliente || 'Cliente', email: u.email, taxCode: u.codiceFiscale, address: u.indirizzo, zip: u.cap, city: u.citta, province: u.provincia });
      const lines = buildLines(c.d.elementi);
      const cicMap = await resolveCicProductIds(lines.map((l) => l.code));
      for (const l of lines) if (l.code) l.cicProductId = cicMap.get(l.code);
      await testDoc('order', c, customer, lines);
      await testDoc('quotation', c, customer, lines);
      if (i % 10 === 0) console.log(`   …${i}/${pick.length}`);
    } catch (e) {
      res.order.ko++; res.order.fails.push(`${c.id.slice(0, 8)} ERR ${(e?.message || e).slice(0, 80)}`);
    }
  }
} finally {
  // cleanup garantito di eventuali residui
  if (created.size) {
    console.log(`\n🧹 Cleanup ${created.size} residui…`);
    for (const key of [...created]) { const [kind, id] = key.split(':'); if (await del(kind, id)) created.delete(key); }
  }
}

console.log('\n────────────────────────── RISULTATI Fase 5 ──────────────────────────');
console.log(`ORDINI     ✅ ${res.order.ok}/${res.order.ok + res.order.ko} al centesimo`);
console.log(`PREVENTIVI ✅ ${res.quotation.ok}/${res.quotation.ok + res.quotation.ko} al centesimo`);
if (res.order.fails.length) console.log('  KO ordini: ' + res.order.fails.join(' | '));
if (res.quotation.fails.length) console.log('  KO preventivi: ' + res.quotation.fails.join(' | '));
console.log(created.size ? `\n⚠️ ${created.size} documenti NON cancellati: ${[...created].join(', ')}` : '\n🧹 Nessun orfano: tutti i documenti di prova cancellati.');
const allOk = res.order.ko === 0 && res.quotation.ko === 0 && created.size === 0;
console.log(allOk ? '\n✅ Ordini e preventivi: cifra-cliente == documento CiC su tutto il campione.' : '\n⚠️ Vedi sopra.');
process.exit(allOk ? 0 : 2);
