// ============================================================================
// test-mapping.mjs — SONDA diagnostica per il sync mappature (task Fase 4).
// Scopo: capire SU DATI VERI (import nel trial) qual è la "chiave naturale"
// con cui ritrovare in CiC un cliente (per P.IVA) e un prodotto (per codice POPS),
// dato che l'import nativo può NON mettere il codice in productNumber.
// NON scrive niente: solo letture.
//
// Uso:
//   REVISO_APP_SECRET=xxx REVISO_AGREEMENT_GRANT=yyy \
//   SAMPLE_PIVA='01234567890' SAMPLE_CODE='ABC123' node risorsexCiC/test-mapping.mjs
// ============================================================================

const BASE = 'https://rest.reviso.com';
const APP = process.env.REVISO_APP_SECRET;
const GRANT = process.env.REVISO_AGREEMENT_GRANT;
const PIVA = (process.env.SAMPLE_PIVA || '').trim();
const CODE = (process.env.SAMPLE_CODE || '').trim();

if (!APP || !GRANT) { console.error('❌ Mancano REVISO_APP_SECRET / REVISO_AGREEMENT_GRANT.'); process.exit(1); }
if (!PIVA || !CODE) { console.error('❌ Passa SAMPLE_PIVA e SAMPLE_CODE (una P.IVA e un codice presenti in POPS e nel trial).'); process.exit(1); }

const headers = { 'X-AppSecretToken': APP, 'X-AgreementGrantToken': GRANT, 'Content-Type': 'application/json' };
async function call(path) {
  const res = await fetch(`${BASE}${path}`, { headers });
  const t = await res.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: res.status, ok: res.ok, json: j };
}
const hr = (t) => console.log('\n' + '─'.repeat(70) + '\n' + t);
const up = (s) => String(s ?? '').toUpperCase().trim();

// cerca ricorsivamente in un oggetto i path delle stringhe il cui valore == target
function findFieldsWithValue(obj, target, prefix = '') {
  const hits = [];
  for (const [k, v] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') hits.push(...findFieldsWithValue(v, target, path));
    else if (up(v) === up(target)) hits.push({ path, value: v });
  }
  return hits;
}

(async () => {
  const self = await call('/self');
  console.log(`Azienda: ${self.json?.company?.name || '?'}  ⚠️ confermare trial`);

  // ── CLIENTI: match per P.IVA ───────────────────────────────────────────────
  hr(`CLIENTI — filtro vatNumber$eq:${PIVA}`);
  const cf = encodeURIComponent(`vatNumber$eq:${PIVA}`);
  const cust = await call(`/customers?filter=${cf}`);
  const clist = cust.json?.collection || [];
  if (clist.length) {
    const c = clist[0];
    console.log(`   ✅ TROVATO: customerNumber=${c.customerNumber}  name="${c.name}"  vatNumber=${c.vatNumber}`);
    console.log(`   → chiave naturale clienti = vatNumber  (matcho users.piva → customerNumber)`);
  } else {
    console.log(`   ⚠️ NESSUN cliente con vatNumber=${PIVA}. Controllo come sono memorizzate le P.IVA…`);
    const sample = await call('/customers?pagesize=3');
    (sample.json?.collection || []).forEach((c) =>
      console.log(`      es: customerNumber=${c.customerNumber} name="${c.name}" vatNumber=${c.vatNumber} corpId=${c.corporateIdentificationNumber}`));
  }

  // ── PRODOTTI: dove sta il codice POPS? ─────────────────────────────────────
  hr(`PRODOTTI — il codice "${CODE}" in che campo vive?`);
  const pf = encodeURIComponent(`productNumber$eq:${CODE}`);
  const byNum = await call(`/products?filter=${pf}`);
  const byNumList = byNum.json?.collection || [];
  if (byNumList.length) {
    console.log(`   ✅ productNumber == codice POPS → match diretto (productNumber$eq:${CODE})`);
    console.log(`      productNumber=${byNumList[0].productNumber} name="${byNumList[0].name}"`);
  } else {
    console.log(`   ✗ productNumber$eq:${CODE} → nessun risultato. Il codice sta altrove. Scansiono il catalogo…`);
    // scarico il catalogo e cerco in quale campo compare il codice
    let found = null, schemaPrinted = false;
    for (let page = 0; page < 20 && !found; page++) {
      const data = await call(`/products?pagesize=1000&skippages=${page}`);
      const items = data.json?.collection || [];
      if (!schemaPrinted && items[0]) {
        console.log(`   campi prodotto disponibili: ${Object.keys(items[0]).join(', ')}`);
        schemaPrinted = true;
      }
      for (const p of items) {
        const hits = findFieldsWithValue(p, CODE);
        if (hits.length) { found = { p, hits }; break; }
      }
      if (items.length < 1000) break;
    }
    if (found) {
      console.log(`   ✅ codice trovato nei campi: ${found.hits.map((h) => `${h.path}="${h.value}"`).join(', ')}`);
      console.log(`      → productNumber CiC di quel prodotto = ${found.p.productNumber} (name="${found.p.name}")`);
      console.log(`      → CHIAVE NATURALE prodotti = ${found.hits[0].path}  (matcho products/{code} su quel campo → productNumber)`);
    } else {
      console.log(`   ⚠️ codice "${CODE}" non trovato in NESSUN campo dei prodotti. Forse l'import non l'ha portato, o il codice POPS differisce. Da capire prima di scrivere il sync.`);
    }
  }

  hr('CONCLUSIONE');
  console.log('   Con la chiave naturale confermata (clienti: vatNumber; prodotti: il campo emerso sopra)');
  console.log('   scrivo la callable syncCicMappings con il matching giusto + dryRun report.');
})().catch((e) => { console.error('💥', e); process.exit(1); });
