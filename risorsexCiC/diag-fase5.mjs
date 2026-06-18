// diag-fase5.mjs — diagnostica il 400 su singoli preventivi (no cancellazione se fallisce).
// Uso: node risorsexCiC/diag-fase5.mjs 0d9mCopa... 1EOJR1i6...
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
const here = path.dirname(fileURLToPath(import.meta.url));
const fnDir = path.resolve(here, '..', 'src', 'functions') + path.sep;
const require = createRequire(fnDir);
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: 'preventivatoreb2b-ii' });
const db = admin.firestore();
const { createCicProvider } = require('./lib/lib_billing/cicProvider.js');
const up = (s) => String(s ?? '').toUpperCase().trim();

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

const ids = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const provider = await createCicProvider();
for (const partial of ids) {
  // match per prefisso id
  const all = await db.collection('preventivi').limit(500).get();
  const doc = all.docs.find((x) => x.id.startsWith(partial));
  if (!doc) { console.log(`\n${partial} → non trovato`); continue; }
  const d = doc.data();
  console.log(`\n══════ ${doc.id} ══════ righe=${d.elementi?.length} sconto=${d.scontoPercentuale || 0}%`);
  const u = (await db.collection('users').doc(d.clienteUID).get()).data() || {};
  const lines = buildLines(d.elementi);
  const cicMap = await resolveCicProductIds(lines.map((l) => l.code));
  for (const l of lines) if (l.code) l.cicProductId = cicMap.get(l.code);
  // mostra le righe e i prodotti risolti
  lines.forEach((l, i) => console.log(`   riga${i + 1}: code=${l.code || '(vuoto)'} cicProductId=${l.cicProductId ?? '→VARIE'} qty=${l.qty} unit=${l.unitNetPrice} cat=${l.category} desc="${String(l.description).slice(0, 40)}"`));
  try {
    const customer = await provider.findOrCreateCustomer({ piva: u.piva, name: u.ragioneSociale || d.cliente || 'Cliente', email: u.email, taxCode: u.codiceFiscale, address: u.indirizzo, zip: u.cap, city: u.citta, province: u.provincia });
    console.log(`   customer → #${customer?.id ?? customer?.customerNumber ?? JSON.stringify(customer)}`);
    const result = await provider.createOrder({ customer, date: d.dataConsegnaPrevista || new Date().toISOString().split('T')[0], lines, discountPercentage: Number(d.scontoPercentuale) || 0, visibleSubject: d.commessa || `Rif: ${d.codice}` });
    console.log(`   ✅ creato ord ${result.id} net=${result.netAmount} — cancello`);
    await fetch(`${provider.cfg?.baseUrl || 'https://rest.reviso.com'}/orders/${result.id}`, { method: 'DELETE', headers: { 'X-AppSecretToken': (await db.collection('config').doc('cic').get()).data().appSecretToken, 'X-AgreementGrantToken': (await db.collection('config').doc('cic').get()).data().agreementGrantToken } });
  } catch (e) {
    console.log(`   ❌ ERRORE: ${e?.message}`);
    if (e?.response?.data) console.log('   BODY:', JSON.stringify(e.response.data, null, 2));
  }
}
process.exit(0);
