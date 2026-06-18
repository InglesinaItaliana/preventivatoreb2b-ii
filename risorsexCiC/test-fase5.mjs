// ============================================================================
// test-fase5.mjs — TEST PARALLELO (Fase 5): confronto cifra-per-cifra su molti
// preventivi REALI. Usa il CicProvider COMPILATO (codice di produzione), replica
// la costruzione righe/cliente di generaOrdineCiC, crea l'ordine in CiC, confronta
// netAmount col totale POPS (netCanonico ?? totaleScontato ?? totaleImponibile,
// tolleranza 0,01) e l'IVA, poi CANCELLA l'ordine.
//
// Campione diversificato: con sconto, con consegne, multi-riga, semplici.
// SICUREZZA: default DRY-RUN. Esegui il test reale con:  --apply
//   LIMIT=25 node risorsexCiC/test-fase5.mjs --apply
// ⚠️ Crea/cancella ordini reali sull'azienda definitiva → lascia gap nella
//    numerazione ORDINI (non fiscale). I documenti vengono cancellati.
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.env.LIMIT || 25);

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

// provider compilato (codice reale di produzione)
const { createCicProvider } = require('./lib/lib_billing/cicProvider.js');
const cfg = (await db.collection('config').doc('cic').get()).data();
const CREDS = { secret: cfg.appSecretToken, agreement: cfg.agreementGrantToken, baseUrl: cfg.baseUrl };
const up = (s) => String(s ?? '').toUpperCase().trim();
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function revisoDelete(id) {
  const r = await fetch(`${CREDS.baseUrl}/orders/${id}`, { method: 'DELETE', headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' } });
  return r.ok;
}
async function resolveCicProductIds(codes) {
  const uniq = [...new Set(codes.filter(Boolean).map((c) => up(c)))];
  const map = new Map();
  await Promise.all(uniq.map(async (code) => { const s = await db.collection('products').doc(code).get(); const pid = s.exists ? s.data()?.cicProductId : undefined; if (pid != null) map.set(code, pid); }));
  return map;
}
// replica fedele della costruzione lines di generaOrdineCiC
function buildLines(elementi) {
  return (elementi || []).map((item) => {
    let desc = item.descrizioneCompleta || 'Articolo Vetrata';
    if (item.categoria !== 'EXTRA' && (item.base_mm > 0 || item.altezza_mm > 0)) {
      desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`;
    }
    return { code: item.codice ? up(item.codice) : '', description: desc, qty: item.quantita || 1, unitNetPrice: item.prezzo_unitario || 0, category: item.categoria };
  });
}
const expectedNetOf = (d) => (typeof d.netCanonico === 'number') ? d.netCanonico : (typeof d.totaleScontato === 'number') ? d.totaleScontato : (d.totaleImponibile || 0);

// ── 1) raccogli candidati ─────────────────────────────────────────────────────
const snap = await db.collection('preventivi').limit(500).get();
const candidates = [];
for (const doc of snap.docs) {
  const d = doc.data();
  if (!Array.isArray(d.elementi) || d.elementi.length === 0) continue;
  if (!d.clienteUID) continue;
  const expectedNet = expectedNetOf(d);
  if (!(expectedNet > 0)) continue;
  const hasSconto = (Number(d.scontoPercentuale) || 0) > 0;
  const hasConsegna = d.elementi.some((e) => e.categoria === 'EXTRA' && /^L0\d\d$/i.test(String(e.codice || '')));
  candidates.push({ id: doc.id, d, expectedNet, hasSconto, hasConsegna, nLines: d.elementi.length });
}
// selezione diversificata: garantisci sconto + consegna + multi-riga
const pick = [];
const take = (pred, n) => { for (const c of candidates) { if (pick.length >= LIMIT) break; if (pred(c) && !pick.includes(c)) { pick.push(c); if (pick.filter(pred).length >= n) break; } } };
take((c) => c.hasSconto && c.hasConsegna, 6);
take((c) => c.hasSconto, 8);
take((c) => c.hasConsegna, 8);
take((c) => c.nLines >= 4, 6);
for (const c of candidates) { if (pick.length >= LIMIT) break; if (!pick.includes(c)) pick.push(c); }

console.log(APPLY ? '🔴 APPLY — creo e cancello ordini reali\n' : '🟢 DRY-RUN — nessuna scrittura (usa --apply)\n');
console.log(`Candidati validi: ${candidates.length} · selezionati: ${pick.length} (LIMIT=${LIMIT})`);
console.log(`Copertura: con sconto=${pick.filter((c) => c.hasSconto).length} · con consegna=${pick.filter((c) => c.hasConsegna).length} · multi-riga(≥4)=${pick.filter((c) => c.nLines >= 4).length}\n`);

if (!APPLY) {
  pick.forEach((c) => console.log(`   • ${c.id.slice(0, 8)}… righe=${c.nLines} sconto=${c.hasSconto ? (c.d.scontoPercentuale + '%') : 'no'} consegna=${c.hasConsegna ? 'sì' : 'no'} expectedNet=${c.expectedNet}€`));
  console.log('\n🟢 Dry-run. Rilancia con --apply per eseguire il confronto reale.');
  process.exit(0);
}

// ── 2) esegui il test reale ───────────────────────────────────────────────────
const provider = await createCicProvider();
const results = [];
for (const c of pick) {
  const d = c.d;
  try {
    const u = (await db.collection('users').doc(d.clienteUID).get()).data() || {};
    if (!u.piva) { results.push({ ...c, ok: false, note: 'cliente senza P.IVA' }); continue; }
    const customer = await provider.findOrCreateCustomer({ piva: u.piva, name: u.ragioneSociale || d.cliente || 'Cliente', email: u.email, taxCode: u.codiceFiscale, address: u.indirizzo, zip: u.cap, city: u.citta, province: u.provincia });
    const lines = buildLines(d.elementi);
    const cicMap = await resolveCicProductIds(lines.map((l) => l.code));
    for (const l of lines) if (l.code) l.cicProductId = cicMap.get(l.code);
    const result = await provider.createOrder({ customer, date: d.dataConsegnaPrevista || new Date().toISOString().split('T')[0], lines, discountPercentage: Number(d.scontoPercentuale) || 0, visibleSubject: d.commessa || `Rif: ${d.codice}` });
    const netDiff = round2((result.netAmount || 0) - c.expectedNet);
    const expVat = round2(c.expectedNet * 0.22);
    const vatDiff = round2((result.vatAmount || 0) - expVat);
    const ok = Math.abs(netDiff) <= 0.01 && Math.abs(vatDiff) <= 0.01;
    results.push({ ...c, ok, orderId: result.id, cicNet: result.netAmount, cicVat: result.vatAmount, netDiff, vatDiff });
    await revisoDelete(result.id);
  } catch (e) {
    results.push({ ...c, ok: false, note: (e?.message || String(e)).slice(0, 120) });
  }
}

// ── 3) report ─────────────────────────────────────────────────────────────────
const okN = results.filter((r) => r.ok).length;
console.log('────────────────────────── RISULTATI ──────────────────────────');
for (const r of results) {
  if (r.ok) console.log(`   ✅ ${r.id.slice(0, 8)}… net CiC=${r.cicNet} == POPS=${r.expectedNet}  (IVA ${r.cicVat})  [ord ${r.orderId} cancellato]`);
  else console.log(`   ❌ ${r.id.slice(0, 8)}… ${r.note ? r.note : `net CiC=${r.cicNet} vs POPS=${r.expectedNet} (Δnet=${r.netDiff}, Δiva=${r.vatDiff})`}`);
}
console.log(`\n${okN === results.length ? '✅' : '⚠️'} ${okN}/${results.length} documenti al centesimo. ` + (okN === results.length ? 'Cifra-cliente == documento CiC su tutto il campione.' : 'Vedi i KO sopra.'));
process.exit(okN === results.length ? 0 : 2);
