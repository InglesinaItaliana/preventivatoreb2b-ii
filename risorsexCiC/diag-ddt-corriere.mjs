// ============================================================================
// diag-ddt-corriere.mjs — diagnosi 400 sulla creazione DDT con CORRIERE.
//
// Riproduce ESATTAMENTE il payload di cicProvider.createDeliveryNote e prova 4
// varianti del blocco deliveryDetails per capire perché Reviso risponde 400 col
// corriere (deliveredBy:'Carrier'). A differenza del codice prod (axios che
// ingoia il body) qui usiamo fetch e STAMPIAMO il corpo completo dell'errore.
//
// SICUREZZA: crea SOLO la BOZZA (lo stadio dove avviene il 400) e NON emette mai
//   (nessun numero fiscale consumato). Ogni bozza creata viene CANCELLATA subito
//   → niente "tappi". Le varianti che danno 400 non creano nulla.
//
// Uso:  node risorsexCiC/diag-ddt-corriere.mjs
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

const cfg = (await db.collection('config').doc('cic').get()).data() || {};
const BASE = cfg.baseUrl || 'https://rest.reviso.com';
const SECRET = cfg.appSecretToken;
const GRANT = cfg.agreementGrantToken;
const VATCODE = cfg.vatCode || 'V022';
const VATRATE = cfg.vatRate ?? 22;
const SERIES = cfg.ddtNumberSeries ?? 29;
const PAYTERM = cfg.defaultPaymentTermsNumber ?? 11;
const VATZONE = cfg.domesticVatZone ?? 1;
const GENERIC = cfg.genericProductNumber || 'VARIE';

if (!SECRET || !GRANT) { console.error('❌ Token CiC mancanti in config/cic'); process.exit(1); }

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const headers = { 'X-AppSecretToken': SECRET, 'X-AgreementGrantToken': GRANT, 'Content-Type': 'application/json' };
async function reviso(method, p, body) {
  const r = await fetch(`${BASE}${p}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); let j; try { j = t ? JSON.parse(t) : null; } catch { j = t; }
  return { status: r.status, ok: r.ok, json: j };
}
const hr = (t) => console.log('\n' + '─'.repeat(72) + '\n' + t);

// 0) verifica AZIENDA (deve essere la produzione)
hr('0) GET /self — azienda che stiamo toccando');
const self = await reviso('GET', '/self');
if (!self.ok) { console.error('❌ /self', self.status, self.json); process.exit(1); }
console.log(`   Azienda: ${self.json?.company?.name || '?'}  (P.IVA ${self.json?.company?.vatNumber || '?'}, agreement ${self.json?.agreementNumber || '?'})`);

// 1) un cliente reale come owner
const cs = await reviso('GET', '/customers?pagesize=1');
const cust = (cs.json?.collection || [])[0];
if (!cust) { console.error('❌ Nessun cliente su CiC'); process.exit(1); }
console.log(`   owner: id=${cust.customerNumber}  "${cust.name}"`);
console.log(`   prodotto riga: ${GENERIC}  ·  serie DDT: ${SERIES}  ·  IVA: ${VATCODE}/${VATRATE}%`);

// 2) payload base (mirror di cicProvider.createDeliveryNote), una riga generica
const qty = 1, unit = 10.0;
const net = round2(qty * unit), vat = round2((net * VATRATE) / 100);
const today = new Date().toISOString().slice(0, 10);
function buildDdt(deliveryDetails) {
  return {
    references: null, affectsInStockCounter: true, destination: null, quotation: null,
    paymentDetails: { date: today, paymentTerms: { id: PAYTERM, metaData: null }, paymentType: null, bankAccount: null },
    notesAndAttachments: null, vatAmount: vat, totalAmount: round2(net + vat),
    deliveryNoteType: 'Sales', deliveryNoteStatus: 'Draft',
    owner: {
      address: null, zipCode: null, city: null,
      countryCode: { id: 'IT', metaData: null }, country: 'Italia',
      vatZone: { vatZoneNumber: VATZONE, id: VATZONE, metaData: null },
      vatAccount: null, name: cust.name, id: Number(cust.customerNumber), metaData: null,
    },
    numberSeries: { prefix: 'DDT', sequenceType: 'Ordered', numberSeriesSequenceElement: null, id: SERIES, metaData: null },
    invoice: null, order: null,
    productDetails: {
      priceList: { calculatedInNetAmount: true, isBasePriceList: true, number: 0, id: 0, metaData: null },
      priceInGross: false, defaultDiscountPercentage: 0.0,
      productLines: [{
        product: { name: 'Voce generica', id: GENERIC, metaData: null }, chainId: null, lineNr: 1, location: null,
        description: 'Voce generica', vatInfo: { vatAccount: { id: VATCODE, metaData: null }, vatRate: VATRATE },
        quantity: qty, unit: null, unitNetPrice: unit, unitGrossPrice: round2(unit * (1 + VATRATE / 100)),
        totalNetAmount: net, totalGrossAmount: round2(net + vat), unitCostPrice: null, discountPercentage: 0.0,
        totalVatAmount: vat, manuallyEditedSalesPrice: true,
      }],
    },
    deliveryDetails,
    additionalExpenses: null, date: today,
    additionalInfo: { currency: 'EUR', exchangeRate: 100.0, layout: null, project: null, tenderContractData: null },
  };
}

const baseDelivery = {
  reasonForDelivery: null, deliveryTerms: null, deliveryStartDate: null, deliveryEndDate: null,
  numberOfPackages: 1, descriptionOfPackages: null, netWeight: null, grossWeight: null, id: null, metaData: null,
};
const carrierInfoFull = {
  address: null, city: null, zipCode: null, country: null, phoneNumber: null, email: null,
  notes: null, name: 'Corriere Espresso', id: null, metaData: null, self: null,
};

const variants = [
  { key: 'V0', desc: "deliveredBy:'Self'  + carrierInfo:null   (controllo, = DDT interno)", dd: { deliveredBy: 'Self', carrierInfo: null, ...baseDelivery } },
  { key: 'V1', desc: "deliveredBy:'Carrier' + carrierInfo:null  (CODICE ATTUALE = il bug)", dd: { deliveredBy: 'Carrier', carrierInfo: null, ...baseDelivery } },
  { key: 'V2', desc: "deliveredBy:'Carrier' + carrierInfo:{name} (Carrier richiede carrierInfo?)", dd: { deliveredBy: 'Carrier', carrierInfo: carrierInfoFull, ...baseDelivery } },
  { key: 'V3', desc: "deliveredBy:'Self'  + carrierInfo:{name}  (pattern esempi ufficiali)", dd: { deliveredBy: 'Self', carrierInfo: carrierInfoFull, ...baseDelivery } },
];

const createdIds = [];
const summary = [];
for (const v of variants) {
  hr(`${v.key}) ${v.desc}`);
  const res = await reviso('POST', '/delivery-notes/sales', buildDdt(v.dd));
  console.log(`   HTTP ${res.status} ${res.ok ? '✓ bozza creata' : '✗ RIFIUTATO'}`);
  if (!res.ok) {
    // IL PUNTO: stampiamo il body completo che Reviso restituisce (axios lo nasconde in prod)
    console.log('   ── BODY ERRORE REVISO ──');
    console.log(JSON.stringify(res.json, null, 2));
    summary.push(`${v.key}: ${res.status} RIFIUTATO`);
  } else {
    const id = res.json?.id;
    console.log(`   → id=${id}  status=${res.json?.deliveryNoteStatus}`);
    if (id != null) createdIds.push(id);
    summary.push(`${v.key}: ${res.status} OK (creata, poi cancellata)`);
    // cancella SUBITO la bozza per non lasciare tappi
    const del = await reviso('DELETE', `/delivery-notes/sales/${id}`);
    console.log(`   🧹 DELETE bozza ${id}: ${del.ok ? '✓ cancellata' : `✗ (${del.status}) — DA CANCELLARE A MANO`}`);
    if (del.ok) createdIds.splice(createdIds.indexOf(id), 1);
  }
}

// cleanup di sicurezza: qualsiasi bozza non ancora cancellata
if (createdIds.length) {
  hr('CLEANUP di sicurezza — bozze residue');
  for (const id of createdIds) {
    const del = await reviso('DELETE', `/delivery-notes/sales/${id}`);
    console.log(`   DELETE ${id}: ${del.ok ? '✓' : `✗ (${del.status}) — DA CANCELLARE A MANO nel gestionale`}`);
  }
}

hr('ESITO');
summary.forEach((s) => console.log('   ' + s));
console.log('\nLeggi i BODY ERRORE sopra: diranno se "Carrier" è un valore non valido');
console.log('(probabile elenco dei valori ammessi) oppure se manca carrierInfo.');
process.exit(0);
