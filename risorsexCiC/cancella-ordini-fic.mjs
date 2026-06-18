// ============================================================================
// cancella-ordini-fic.mjs — STEP 5 cutover: cancella i vecchi ordini FiC dei
// preventivi GIÀ MIGRATI su CiC (hanno cic_order_id + fic_order_id, aperti, no DDT).
// Cancella SOLO il documento su Fatture in Cloud (DELETE issued_documents); NON
// tocca il preventivo Firestore (fic_order_id resta come riferimento storico).
//
// GUARDIA: cancella un ordine FiC solo se il preventivo ha cic_order_id (migrato).
// ⚠️ IRREVERSIBILE: rimuove la rete di rollback FiC.
// SICUREZZA: default DRY-RUN. Esegui con:  node risorsexCiC/cancella-ordini-fic.mjs --apply
// ============================================================================
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');
const APPLY = process.argv.includes('--apply');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
const fic = (await db.collection('config').doc('fic').get()).data();
const BASE = 'https://api-v2.fattureincloud.it';
const COMPANY = fic.company_id;
const TOKEN = fic.access_token;

async function delFic(id) {
  const r = await fetch(`${BASE}/c/${COMPANY}/issued_documents/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' } });
  return r.status;
}

// seleziona i migrati: cic_order_id + fic_order_id, aperti, no DDT
const snap = await db.collection('preventivi').get();
const targets = [];
for (const doc of snap.docs) {
  const d = doc.data(); const st = d.stato;
  if (st === 'REJECTED' || st === 'DELIVERED' || st === 'SHIPPED') continue;
  if (d.fic_ddt_id || d.cic_ddt_id || d.fic_ddt_number || d.cic_ddt_number) continue;
  if (!d.cic_order_id) continue;   // GUARDIA: solo migrati
  if (!d.fic_order_id) continue;   // niente da cancellare
  targets.push({ id: doc.id, d });
}

console.log(APPLY ? `🔴 APPLY — cancello ${targets.length} ordini FiC\n` : `🟢 DRY-RUN — ${targets.length} ordini FiC da cancellare\n`);
const res = { ok: 0, ko: 0, fails: [] };
for (const { id, d } of targets) {
  if (!APPLY) { console.log(`   • ${id.slice(0, 8)} ${(d.stato || '?').padEnd(13)} ficOrder=${d.fic_order_id} (cic n.${d.cic_order_number ?? '?'} ✓)`); continue; }
  const s = await delFic(d.fic_order_id);
  if (s >= 200 && s < 300) { res.ok++; console.log(`   ✅ ${id.slice(0, 8)} ficOrder=${d.fic_order_id} → DELETE ${s}`); }
  else { res.ko++; res.fails.push(`${id.slice(0, 8)} fic=${d.fic_order_id} → ${s}`); console.log(`   ❌ ${id.slice(0, 8)} ficOrder=${d.fic_order_id} → DELETE ${s}`); }
}

if (!APPLY) { console.log('\n🟢 Dry-run. Rilancia con --apply per cancellare gli ordini FiC.'); process.exit(0); }
console.log(`\n────────── CLEANUP FiC ──────────`);
console.log(`✅ cancellati: ${res.ok}/${targets.length}  ·  ❌ falliti: ${res.ko}`);
if (res.fails.length) console.log('errori: ' + res.fails.join(' | '));
console.log('NB: fic_order_id resta sui preventivi come riferimento storico (i bottoni usano cic_order_id).');
process.exit(res.ko === 0 ? 0 : 2);
