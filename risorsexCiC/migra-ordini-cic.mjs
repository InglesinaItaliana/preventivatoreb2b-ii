// ============================================================================
// migra-ordini-cic.mjs — STEP 3 cutover netto. Migra i preventivi categoria B
// (hanno fic_order_id, NESSUN DDT, stato aperto) creando l'ordine su CiC e
// scrivendo cic_order_id + billingBackend:'cic' sul preventivo (replica
// generaOrdineCiC). NON tocca lo stato POPS né il vecchio ordine FiC (cleanup dopo).
//
// Data ordini CiC = 2026-06-25 (scelta utente). Idempotente: salta i preventivi
// che hanno già cic_order_id. Anti-duplicato: scrive cic_order_id subito dopo la creazione.
// SICUREZZA: default DRY-RUN. Esegui con:  node risorsexCiC/migra-ordini-cic.mjs --apply
// ============================================================================
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
const ORDER_DATE = '2026-06-25';
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
const { createCicProvider } = require('./lib/lib_billing/cicProvider.js');
const cfg = (await db.collection('config').doc('cic').get()).data();
const up = (s) => String(s ?? '').toUpperCase().trim();
const r2 = (n) => Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
const computeNet = (d) => { const f = 1 - (Number(d.scontoPercentuale) || 0) / 100; let n = 0; for (const it of d.elementi || []) n += r2((it.quantita || 1) * (it.prezzo_unitario || 0) * f); return r2(n); };

async function resolveCicProductIds(codes) { const uniq = [...new Set(codes.filter(Boolean).map((c) => up(c)))]; const map = new Map(); await Promise.all(uniq.map(async (code) => { const s = await db.collection('products').doc(code).get(); const pid = s.exists ? s.data()?.cicProductId : undefined; if (pid != null) map.set(code, pid); })); return map; }
function buildLines(elementi) { return (elementi || []).map((item) => { let desc = item.descrizioneCompleta || 'Articolo Vetrata'; if (item.categoria !== 'EXTRA' && (item.base_mm > 0 || item.altezza_mm > 0)) desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm${item.infoCanalino ? ` - ${item.infoCanalino}` : ''}`; return { code: item.codice ? up(item.codice) : '', description: desc, qty: item.quantita || 1, unitNetPrice: item.prezzo_unitario || 0, category: item.categoria }; }); }

// seleziona i B: fic_order_id, no DDT, aperto, no cic_order_id
const snap = await db.collection('preventivi').get();
const Bs = [];
for (const doc of snap.docs) {
  const d = doc.data(); const st = d.stato;
  if (st === 'REJECTED' || st === 'DELIVERED' || st === 'SHIPPED') continue;
  if (d.fic_ddt_id || d.cic_ddt_id || d.fic_ddt_number || d.cic_ddt_number) continue;
  if (d.cic_order_id) continue;          // già migrato
  if (!d.fic_order_id) continue;         // categoria A (non serve migrare)
  Bs.push({ ref: doc.ref, id: doc.id, d });
}

console.log(APPLY ? `🔴 APPLY — migro ${Bs.length} ordini su CiC (data ${ORDER_DATE})\n` : `🟢 DRY-RUN — ${Bs.length} ordini B da migrare (data ${ORDER_DATE})\n`);

const provider = APPLY ? await createCicProvider() : null;
const res = { ok: 0, ko: 0, warn: [], fails: [] };
for (let i = 0; i < Bs.length; i++) {
  const { ref, id, d } = Bs[i];
  const u = (await db.collection('users').doc(d.clienteUID).get()).data() || {};
  const expectedNet = (typeof d.netCanonico === 'number') ? d.netCanonico : computeNet(d);
  if (!APPLY) { console.log(`   • ${id.slice(0, 8)} ${(d.stato || '?').padEnd(13)} ${(u.ragioneSociale || '?').slice(0, 26).padEnd(26)} fic=${d.fic_order_id} net=${expectedNet}`); continue; }
  try {
    const customer = await provider.findOrCreateCustomer({ piva: u.piva, name: u.ragioneSociale || d.cliente || 'Cliente', email: u.email, taxCode: u.codiceFiscale, address: u.indirizzo, zip: u.cap, city: u.citta, province: u.provincia });
    const lines = buildLines(d.elementi);
    const cicMap = await resolveCicProductIds(lines.map((l) => l.code));
    for (const l of lines) if (l.code) l.cicProductId = cicMap.get(l.code);
    const result = await provider.createOrder({ customer, date: ORDER_DATE, lines, discountPercentage: Number(d.scontoPercentuale) || 0, visibleSubject: d.commessa || `Rif: ${d.codice}` });
    // scrive SUBITO (anti-duplicato), come generaOrdineCiC. NON tocca stato né fic_order_id.
    await ref.update({ cic_order_id: result.id, cic_order_number: result.number ?? null, cic_order_url: result.url || null, billingBackend: 'cic', billingError: admin.firestore.FieldValue.delete() });
    const netOk = Math.abs((result.netAmount || 0) - expectedNet) <= 0.01;
    if (!netOk) res.warn.push(`${id.slice(0, 8)}: CiC ${result.netAmount} vs atteso ${expectedNet}`);
    res.ok++;
    console.log(`   ✅ ${id.slice(0, 8)} ${(u.ragioneSociale || '?').slice(0, 24).padEnd(24)} → ordine CiC n.${result.number} (net ${result.netAmount}) ${netOk ? '' : '⚠️Δtot'}`);
  } catch (e) {
    res.ko++; res.fails.push(`${id.slice(0, 8)}: ${(e?.message || e).slice(0, 90)}`);
    console.log(`   ❌ ${id.slice(0, 8)} ERRORE: ${(e?.message || e).slice(0, 90)}`);
  }
}

if (!APPLY) { console.log(`\n🟢 Dry-run. Rilancia con --apply per migrare.`); process.exit(0); }
console.log(`\n────────── MIGRAZIONE ──────────`);
console.log(`✅ migrati: ${res.ok}/${Bs.length}  ·  ❌ falliti: ${res.ko}`);
if (res.warn.length) console.log('⚠️ totali da controllare: ' + res.warn.join(' | '));
if (res.fails.length) console.log('errori: ' + res.fails.join(' | '));
process.exit(res.ko === 0 ? 0 : 2);
