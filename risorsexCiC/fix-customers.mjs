// ============================================================================
// fix-customers.mjs — allinea i 3 clienti senza match tra POPS e CiC.
//   1. Gionata Srl   — POPS: rimuove il prefisso 'IT' dalla P.IVA (IT19223019902 → 19223019902)
//   2. Vetreria Romagna s.r.l. — crea il cliente in CiC (assente)
//   3. Gruppo Rivotti — CiC #54: corregge vatNumber 01843440346 → 03014750347 (POPS è la fonte giusta)
//
// SICUREZZA: default DRY-RUN. Esegui davvero con:  node risorsexCiC/fix-customers.mjs --apply
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
const d = (await db.collection('config').doc('cic').get()).data();
const CREDS = { secret: d.appSecretToken, agreement: d.agreementGrantToken, baseUrl: d.baseUrl };

async function reviso(method, pathname, body) {
  const res = await fetch(`${CREDS.baseUrl}${pathname}`, {
    method,
    headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

console.log(APPLY ? '🔴 MODALITÀ APPLY — scrivo davvero\n' : '🟢 DRY-RUN — nessuna scrittura (usa --apply per eseguire)\n');

// ── 1) Gionata Srl — togli IT in POPS ────────────────────────────────────────
console.log('① Gionata Srl — POPS users/nZmVnZJqAhOr445Gd5ghukpqWXq2: piva IT19223019902 → 19223019902');
const gRef = db.collection('users').doc('nZmVnZJqAhOr445Gd5ghukpqWXq2');
const gSnap = await gRef.get();
const gPiva = gSnap.data()?.piva;
if (gPiva !== 'IT19223019902') console.log(`   ⚠️ piva attuale inattesa: "${gPiva}" — salto per sicurezza`);
else if (APPLY) { await gRef.update({ piva: '19223019902' }); console.log('   ✅ aggiornato'); }
else console.log('   (dry-run) update { piva: "19223019902" }');

// ── 2) Vetreria Romagna — crea in CiC ────────────────────────────────────────
const VETRERIA = {
  name: 'Vetreria Romagna s.r.l.',
  vatNumber: '00202260246',
  currency: 'EUR',
  paymentTerms: { paymentTermsNumber: 11 },
  customerGroup: { customerGroupNumber: 1 },
  vatZone: { vatZoneNumber: 1 },
  address: 'Via Brandellero, 23',
  zip: '36034',
  city: 'Malo',
  country: 'Italia', // province omessa: CiC la vuole come ProvinceReference, non stringa; non serve al match

  email: 'amministrazione@vetreriaromagna.com',
};
console.log('\n② Vetreria Romagna s.r.l. — POST /customers (assente in CiC)');
const vExists = await reviso('GET', '/customers?filter=' + encodeURIComponent('vatNumber$eq:00202260246'));
if ((vExists.json?.collection || []).length) console.log('   ✓ esiste già → salto');
else {
  console.log('   payload:', JSON.stringify(VETRERIA));
  if (APPLY) {
    const r = await reviso('POST', '/customers', VETRERIA);
    if (r.ok && r.json?.customerNumber) console.log(`   ✅ creato: customerNumber=${r.json.customerNumber}`);
    else console.error('   ❌ creazione fallita:', r.status, JSON.stringify(r.json));
  } else console.log('   (dry-run: non creato)');
}

// ── 3) Gruppo Rivotti — correggi vatNumber su CiC #54 ────────────────────────
console.log('\n③ Gruppo Rivotti — CiC #54: vatNumber 01843440346 → 03014750347');
const full = await reviso('GET', '/customers/54');
if (!full.ok) console.error('   ❌ lettura #54 fallita:', full.status);
else if (full.json?.vatNumber === '03014750347') console.log('   ✓ già corretto → salto');
else {
  const updated = { ...full.json, vatNumber: '03014750347' };
  console.log(`   PUT /customers/54  (vatNumber: "${full.json.vatNumber}" → "03014750347", altri campi invariati)`);
  if (APPLY) {
    const r = await reviso('PUT', '/customers/54', updated);
    if (r.ok && r.json?.vatNumber === '03014750347') console.log('   ✅ aggiornato');
    else console.error('   ❌ update fallito:', r.status, JSON.stringify(r.json));
  } else console.log('   (dry-run: non scritto)');
}

console.log('\n' + (APPLY ? '✅ Fatto. (Il mapping vero verrà scritto da syncCicMappings({dryRun:false}) in Fase 4.)' : '🟢 Dry-run completato. Rilancia con --apply.'));
process.exit(0);
