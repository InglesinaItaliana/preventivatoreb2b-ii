// ============================================================================
// test-ddt.mjs — spike isolato: crea un DDT su Reviso e lo EMETTE per ottenere
// il numero definitivo. NON tocca le Cloud Functions / Firestore.
//
// Flusso testato (risposta supporto Reviso, giu 2026):
//   1. POST /delivery-notes/sales            → crea la BOZZA (no numero definitivo)
//   2. POST /delivery-notes/sales/issue?filter=id$eq:{id}  → EMETTE (assegna numero)
//   3. GET  /delivery-notes/sales/{id}       → rilegge il numero definitivo
//
// Uso:
//   REVISO_APP_SECRET=xxx REVISO_AGREEMENT_GRANT=yyy node risorsexCiC/test-ddt.mjs
//
// Opzioni env:
//   DDT_CUSTOMER_ID=4     forza l'owner (altrimenti pesca il primo cliente)
//   DDT_PRODUCT_ID=01     forza il prodotto (altrimenti pesca il primo prodotto)
//   DDT_VATCODE=V022      codice IVA (default V022)
//   DDT_SERIES=29         id serie DDT (default 29)
//   DDT_KEEP=1            non cancellare il DDT a fine test
//   DDT_STATUS=Draft      stato iniziale alla creazione (default Draft)
// ============================================================================

const BASE = 'https://rest.reviso.com';
const APP = process.env.REVISO_APP_SECRET;
const GRANT = process.env.REVISO_AGREEMENT_GRANT;
const VATCODE = process.env.DDT_VATCODE || 'V022';
const VATRATE = 22.0;
const SERIES = Number(process.env.DDT_SERIES || 29);
const CREATE_STATUS = process.env.DDT_STATUS || 'Draft';

if (!APP || !GRANT) {
  console.error('❌ Mancano REVISO_APP_SECRET e/o REVISO_AGREEMENT_GRANT nelle env.');
  process.exit(1);
}

const headers = {
  'X-AppSecretToken': APP,
  'X-AgreementGrantToken': GRANT,
  'Content-Type': 'application/json',
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

function hr(t) { console.log('\n' + '─'.repeat(70) + '\n' + t); }

(async () => {
  // 0) /self — verifica connessione e CHE AZIENDA stiamo toccando
  hr('0) GET /self — verifica azienda');
  const self = await call('GET', '/self');
  if (!self.ok) { console.error('❌ /self', self.status, self.json); process.exit(1); }
  const company = self.json?.company || {};
  console.log(`   Azienda: ${company.name || '?'}  (vat ${company.vatNumber || '?'})`);
  console.log(`   ⚠️  Confermare che sia il TRIAL e non la produzione.`);

  // 1) cliente owner
  hr('1) Cliente (owner)');
  let custId = process.env.DDT_CUSTOMER_ID;
  let custName = 'Cliente test';
  if (custId) {
    const c = await call('GET', `/customers/${custId}`);
    custName = c.json?.name || custName;
  } else {
    const cs = await call('GET', '/customers?pagesize=1');
    const c = (cs.json?.collection || [])[0];
    if (!c) { console.error('❌ Nessun cliente sul trial. Imposta DDT_CUSTOMER_ID o crea un cliente.'); process.exit(1); }
    custId = c.customerNumber;
    custName = c.name;
  }
  console.log(`   owner.id=${custId}  name="${custName}"`);

  // 2) prodotto
  hr('2) Prodotto riga');
  let prodId = process.env.DDT_PRODUCT_ID;
  let prodName = 'Prodotto test';
  if (prodId) {
    const p = await call('GET', `/products/${encodeURIComponent(prodId)}`);
    prodName = p.json?.name || prodName;
  } else {
    const ps = await call('GET', '/products?pagesize=1');
    const p = (ps.json?.collection || [])[0];
    if (!p) { console.error('❌ Nessun prodotto sul trial. Imposta DDT_PRODUCT_ID.'); process.exit(1); }
    prodId = p.productNumber;
    prodName = p.name;
  }
  console.log(`   product.id=${prodId}  name="${prodName}"`);

  // 3) costruzione DDT (1 riga, qty 2 × 10,00)
  const qty = 2, unit = 10.0;
  const net = round2(qty * unit);
  const vat = round2((net * VATRATE) / 100);
  const today = new Date().toISOString().slice(0, 10);

  const ddt = {
    references: null, affectsInStockCounter: true, destination: null, quotation: null,
    paymentDetails: { date: today, paymentTerms: { id: 6, metaData: null }, paymentType: null, bankAccount: null },
    notesAndAttachments: null,
    vatAmount: vat, totalAmount: round2(net + vat),
    deliveryNoteType: 'Sales',
    deliveryNoteStatus: CREATE_STATUS,           // ← prova "Draft" alla creazione
    owner: {
      address: null, zipCode: null, city: null,
      countryCode: { id: 'IT', metaData: null }, country: 'Italia',
      vatZone: { vatZoneNumber: 1, id: 1, metaData: null },
      vatAccount: null, name: custName, id: Number(custId), metaData: null,
    },
    numberSeries: {                              // ← NIENTE numero forzato: lo assegna /issue
      prefix: 'DDT', sequenceType: 'Ordered',
      numberSeriesSequenceElement: null,
      id: SERIES, metaData: null,
    },
    invoice: null, order: null,
    productDetails: {
      priceList: { calculatedInNetAmount: true, isBasePriceList: true, number: 0, id: 0, metaData: null },
      priceInGross: false, defaultDiscountPercentage: 0.0,
      productLines: [{
        product: { name: prodName, id: prodId, metaData: null },
        chainId: null, lineNr: 1, location: null, description: prodName,
        vatInfo: { vatAccount: { id: VATCODE, metaData: null }, vatRate: VATRATE },
        quantity: qty, unit: null,
        unitNetPrice: unit, unitGrossPrice: round2(unit * (1 + VATRATE / 100)),
        totalNetAmount: net, totalGrossAmount: round2(net + vat),
        unitCostPrice: null, discountPercentage: 0.0, totalVatAmount: vat,
        manuallyEditedSalesPrice: true,
      }],
    },
    deliveryDetails: {
      deliveredBy: 'Self', reasonForDelivery: null, deliveryTerms: null,
      deliveryStartDate: null, deliveryEndDate: null,
      numberOfPackages: 1, descriptionOfPackages: null,
      netWeight: null, grossWeight: null, carrierInfo: null, id: null, metaData: null,
    },
    additionalExpenses: null, date: today,
    additionalInfo: { currency: 'EUR', exchangeRate: 100.0, layout: null, project: null, tenderContractData: null },
  };

  hr(`3) POST /delivery-notes/sales — crea la bozza (status=${CREATE_STATUS})`);
  const created = await call('POST', '/delivery-notes/sales', ddt);
  console.log('   HTTP', created.status, created.ok ? '✓' : '✗');
  if (created.json?.errorCode || created.json?.errors) {
    console.log('   errorCode:', created.json.errorCode);
    console.log('   errors:', JSON.stringify(created.json.errors, null, 2));
  }
  const id = created.json?.id;
  const numAfterCreate = created.json?.numberSeries?.numberSeriesSequenceElement?.number ?? null;
  const statusAfterCreate = created.json?.deliveryNoteStatus ?? null;
  console.log(`   → id=${id}  status=${statusAfterCreate}  numero=${numAfterCreate ?? '(nessuno)'}`);
  if (id == null) { console.error('❌ Nessun id dalla creazione. Stop.'); console.log(JSON.stringify(created.json, null, 2).slice(0, 2000)); process.exit(1); }

  // 4) EMISSIONE
  hr(`4) POST /delivery-notes/sales/issue?filter=id$eq:${id} — emette`);
  const filter = encodeURIComponent(`id$eq:${id}`);
  const issued = await call('POST', `/delivery-notes/sales/issue?filter=${filter}`);
  console.log('   HTTP', issued.status, issued.ok ? '✓' : '✗');
  if (typeof issued.json === 'object' && issued.json) {
    console.log('   risposta:', JSON.stringify(issued.json, null, 2).slice(0, 1500));
  } else {
    console.log('   risposta:', issued.json);
  }

  // 5) rilettura
  hr(`5) GET /delivery-notes/sales/${id} — numero definitivo + IVA (verifica #11)`);
  const fin = await call('GET', `/delivery-notes/sales/${id}`);
  const finNum = fin.json?.numberSeries?.numberSeriesSequenceElement?.number ?? null;
  const finStatus = fin.json?.deliveryNoteStatus ?? null;
  console.log(`   status=${finStatus}  NUMERO=${finNum ?? '(ancora nessuno)'}`);

  // #11: IVA sul DDT EMESSO — confronto inviato vs restituito (testata e righe)
  console.log(`   ── IVA testata ──`);
  console.log(`      inviato:    vatAmount=${vat}  totalAmount=${round2(net + vat)}`);
  console.log(`      restituito: vatAmount=${fin.json?.vatAmount}  totalAmount=${fin.json?.totalAmount}`);
  const finLines = fin.json?.productDetails?.productLines || [];
  console.log(`   ── IVA righe (${finLines.length}) ──`);
  finLines.forEach((ln, i) => {
    console.log(`      riga ${i + 1}: vatRate=${ln?.vatInfo?.vatRate} vatAccount=${ln?.vatInfo?.vatAccount?.id} ` +
      `totalNet=${ln?.totalNetAmount} totalVat=${ln?.totalVatAmount} totalGross=${ln?.totalGrossAmount}`);
  });
  const vatOk = Number(fin.json?.vatAmount) === vat && Number(fin.json?.totalAmount) === round2(net + vat);
  console.log(`   → IVA testata coerente con l'inviato: ${vatOk ? '✅ sì' : '⚠️ NO (payload #11 da rivedere)'}`);

  hr('ESITO');
  if (finNum != null) {
    console.log(`   ✅ DDT emesso con numero ${finNum} (status ${finStatus}). Il flusso create→issue FUNZIONA.`);
  } else {
    console.log(`   ⚠️  Ancora nessun numero. Vedi risposte sopra per capire cosa chiede /issue.`);
  }

  // 6) cleanup
  if (!process.env.DDT_KEEP) {
    hr(`6) Cleanup — DELETE /delivery-notes/sales/${id}`);
    const del = await call('DELETE', `/delivery-notes/sales/${id}`);
    console.log('   HTTP', del.status, del.ok ? '✓ cancellato' : '✗ (un DDT emesso potrebbe non essere cancellabile)');
    if (!del.ok) console.log('   →', JSON.stringify(del.json));
  } else {
    console.log('\n(DDT_KEEP=1 → DDT lasciato sul trial)');
  }
})().catch((e) => { console.error('💥', e); process.exit(1); });
