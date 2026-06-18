// ============================================================================
// probe-cic-ids.mjs — SONDA read-only degli ID di configurazione CiC della
// NUOVA azienda definitiva, per popolare config/cic (campi che oggi mancano e
// userebbero i DEFAULT del trial). Vedi cicConfig.ts.
//
// 100% SOLA LETTURA (solo GET a Reviso). Token letti da config/cic (secret/agreement).
// Uso:  node risorsexCiC/probe-cic-ids.mjs
// ============================================================================

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();

const TARGET_VAT_RATE = 22;

const d = (await db.collection('config').doc('cic').get()).data() || {};
const CREDS = {
  secret: process.env.REVISO_APP_SECRET || d.appSecretToken || d.secret,
  agreement: process.env.REVISO_AGREEMENT_GRANT || d.agreementGrantToken || d.agreement,
  baseUrl: d.baseUrl || 'https://rest.reviso.com',
};
if (!CREDS.secret || !CREDS.agreement) { console.error('❌ Credenziali CiC mancanti in config/cic'); process.exit(1); }

async function get(pathname) {
  const res = await fetch(`${CREDS.baseUrl}${pathname}`, {
    headers: { 'X-AppSecretToken': CREDS.secret, 'X-AgreementGrantToken': CREDS.agreement, 'Content-Type': 'application/json' },
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}
const hr = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 60 - t.length)));
const coll = (r) => (r.ok ? (r.json?.collection || r.json || []) : null);

(async () => {
  const self = await get('/self');
  console.log(`🏢 Azienda: "${self.json?.company?.name || '?'}"`);
  console.log('   (confermare che è la NUOVA azienda definitiva, non il trial)\n');
  console.log('Per ogni voce: 👉 = candidato da scrivere in config/cic\n');

  // 1) vatCode — codice IVA vendite 22%
  hr('vatCode  (IVA vendite ' + TARGET_VAT_RATE + '%)  → GET /vat-accounts');
  const va = coll(await get('/vat-accounts?pagesize=1000'));
  if (va) {
    for (const v of va) {
      const rate = v.ratePercentage ?? v.rate ?? '?';
      const sales = /sale|vendit/i.test(`${v.name} ${v.vatType || ''} ${v.accountingType || ''}`);
      const pick = Number(rate) === TARGET_VAT_RATE ? ' 👉' : '';
      console.log(`   vatCode=${v.vatCode}  rate=${rate}%  name="${v.name}"${sales ? ' [sales?]' : ''}${pick}`);
    }
  } else console.log('   ⚠️ non leggibile');

  // 2) vatZone domestica
  hr('domesticVatZone  → GET /vat-zones');
  const vz = coll(await get('/vat-zones?pagesize=1000'));
  if (vz) vz.forEach((z) => console.log(`   vatZoneNumber=${z.vatZoneNumber ?? z.number ?? z.id}  name="${z.name}"${/domestic|nazional|interno|italia/i.test(z.name || '') ? ' 👉' : ''}`));
  else console.log('   ⚠️ /vat-zones non disponibile (default trial = 1)');

  // 3) payment terms
  hr('defaultPaymentTermsNumber  → GET /payment-terms');
  const pt = coll(await get('/payment-terms?pagesize=1000'));
  if (pt) pt.forEach((p) => console.log(`   paymentTermsNumber=${p.paymentTermsNumber ?? p.number ?? p.id}  name="${p.name}"  days=${p.daysOfCredit ?? '?'}`));
  else console.log('   ⚠️ non leggibile');

  // 4) layout
  hr('layoutNumber  → GET /layouts');
  const ly = coll(await get('/layouts?pagesize=1000'));
  if (ly) ly.forEach((l) => console.log(`   layoutNumber=${l.layoutNumber ?? l.number ?? l.id}  name="${l.name}"`));
  else console.log('   ⚠️ non leggibile');

  // 5) customer group
  hr('customerGroupNumber  → GET /customer-groups');
  const cg = coll(await get('/customer-groups?pagesize=1000'));
  if (cg) cg.forEach((g) => console.log(`   customerGroupNumber=${g.customerGroupNumber ?? g.number ?? g.id}  name="${g.name}"`));
  else console.log('   ⚠️ non leggibile');

  // 6) number series — serie DDT vendite
  hr('ddtNumberSeries  → GET /number-series  (cerco prefix/nome DDT/consegna)');
  const ns = coll(await get('/number-series?pagesize=1000'));
  if (ns) {
    ns.forEach((s) => {
      const id = s.id ?? s.numberSeriesNumber ?? s.number;
      const label = `${s.name || ''} ${s.prefix || ''} ${s.type || ''}`;
      const pick = /ddt|deliver|consegn|trasport|bolla/i.test(label) ? ' 👉' : '';
      console.log(`   id=${id}  prefix="${s.prefix || ''}"  name="${s.name || ''}"  type="${s.type || ''}"${pick}`);
    });
  } else console.log('   ⚠️ non leggibile');

  // 7) prodotto generico "VARIE"
  hr('genericProductNumber  → GET /products name like VARIE');
  for (const term of ['VARIE', 'Varie', 'Spedizione', 'Extra']) {
    const pr = coll(await get('/products?filter=' + encodeURIComponent(`name$like:${term}`)));
    if (pr && pr.length) pr.slice(0, 5).forEach((p) => console.log(`   "${term}" → productNumber=${p.productNumber}  name="${p.name}"  barCode=${p.barCode || '(vuoto)'}`));
  }

  console.log('\n✅ Sonda completata (sola lettura). Scegliamo i valori 👉 e li scriviamo in config/cic.');
  process.exit(0);
})().catch((e) => { console.error('💥', e?.stack || e?.message || e); process.exit(1); });
