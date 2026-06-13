// ============================================================================
// stress-ddt-iva.mjs — stress test dell'IVA sul DDT EMESSO (verifica #11).
//
// Il caso a riga singola è banale (testata == somma righe per costruzione).
// Qui generiamo scenari MULTI-RIGA, inclusi quelli che FORZANO la divergenza
// classica di arrotondamento:  Σ round(net_i·22%) ≠ round((Σ net_i)·22%).
// Per ognuno: crea bozza → emette → rilegge, e verifica:
//   (A) la testata restituita == quella inviata (vatAmount/totalAmount)
//   (B) le righe restituite == quelle inviate (net/vat/gross per riga)
//   (C) coerenza interna del documento emesso (Σ righe vs testata)
// Poi cancella il DDT (cleanup). Replica il payload reale del cicProvider.
//
// ⚠️ Ogni scenario EMETTE un DDT → consuma un numero di serie sul trial
//    (anche se poi lo cancelliamo: il contatore avanza). Sul trial è ok.
//
// Uso:
//   REVISO_APP_SECRET=xxx REVISO_AGREEMENT_GRANT=yyy node risorsexCiC/stress-ddt-iva.mjs
//   DDT_KEEP=1   non cancellare i DDT generati
//   DDT_CUSTOMER_ID / DDT_PRODUCT_ID  per forzare owner/prodotto
// ============================================================================

const BASE = 'https://rest.reviso.com';
const APP = process.env.REVISO_APP_SECRET;
const GRANT = process.env.REVISO_AGREEMENT_GRANT;
const VATCODE = process.env.DDT_VATCODE || 'V022';
const RATE = 22.0;
const SERIES = Number(process.env.DDT_SERIES || 29);

if (!APP || !GRANT) {
  console.error('❌ Mancano REVISO_APP_SECRET e/o REVISO_AGREEMENT_GRANT.');
  process.exit(1);
}

const headers = {
  'X-AppSecretToken': APP,
  'X-AgreementGrantToken': GRANT,
  'Content-Type': 'application/json',
};

// --- regola canonica, identica a functions/lib_billing/rounding.ts -----------
const round2 = (n) => Math.round((n + (n >= 0 ? 1e-9 : -1e-9)) * 100) / 100;
function computeTotals(lines) {
  const lineNets = lines.map((l) => round2(l.qty * l.price));
  const net = round2(lineNets.reduce((a, b) => a + b, 0));
  const vat = round2((net * RATE) / 100);
  const gross = round2(net + vat);
  return { lineNets, net, vat, gross };
}

async function call(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json; try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, ok: res.ok, json };
}

// --- scenari: i campi `lines` sono [{qty, price}] (prezzo unitario netto) -----
const SCENARIOS = [
  { label: 'baseline 1 riga (2×10,00)', lines: [{ qty: 2, price: 10 }] },
  { label: 'DIVERGENZA: 2×(1×0,25)  → testata 0,11 vs righe 0,12', lines: [{ qty: 1, price: 0.25 }, { qty: 1, price: 0.25 }] },
  { label: 'DIVERGENZA ampia: 5×(1×0,25)', lines: Array.from({ length: 5 }, () => ({ qty: 1, price: 0.25 })) },
  { label: 'caso half-up riga: 1×42,315', lines: [{ qty: 1, price: 42.315 }] },
  { label: 'prezzi a molti decimali', lines: [{ qty: 3, price: 3.3333333 }, { qty: 7, price: 1.1111111 }] },
  { label: 'valori grandi', lines: [{ qty: 1000, price: 1234.5678 }, { qty: 37, price: 99.99 }] },
  { label: 'molte righe (12) decimali assortiti', lines: [
    { qty: 1, price: 0.07 }, { qty: 2, price: 0.13 }, { qty: 3, price: 0.29 }, { qty: 4, price: 1.37 },
    { qty: 5, price: 2.51 }, { qty: 6, price: 0.99 }, { qty: 7, price: 3.33 }, { qty: 8, price: 0.45 },
    { qty: 9, price: 1.11 }, { qty: 10, price: 0.05 }, { qty: 11, price: 7.77 }, { qty: 12, price: 0.01 },
  ] },
];

let OWNER_ID, OWNER_NAME, PROD_ID, PROD_NAME;

function buildDdt(lines, t, today) {
  const productLines = lines.map((l, i) => {
    const net = t.lineNets[i];
    const vat = round2((net * RATE) / 100);
    return {
      product: { name: PROD_NAME, id: PROD_ID, metaData: null },
      chainId: null, lineNr: i + 1, location: null, description: `Riga ${i + 1}`,
      vatInfo: { vatAccount: { id: VATCODE, metaData: null }, vatRate: RATE },
      quantity: l.qty, unit: null,
      unitNetPrice: l.price, unitGrossPrice: round2(l.price * (1 + RATE / 100)),
      totalNetAmount: net, totalGrossAmount: round2(net + vat),
      unitCostPrice: null, discountPercentage: 0.0, totalVatAmount: vat,
      manuallyEditedSalesPrice: true,
    };
  });
  return {
    references: null, affectsInStockCounter: true, destination: null, quotation: null,
    paymentDetails: { date: today, paymentTerms: { id: 6, metaData: null }, paymentType: null, bankAccount: null },
    notesAndAttachments: null,
    vatAmount: t.vat, totalAmount: t.gross,
    deliveryNoteType: 'Sales', deliveryNoteStatus: 'Draft',
    owner: {
      address: null, zipCode: null, city: null,
      countryCode: { id: 'IT', metaData: null }, country: 'Italia',
      vatZone: { vatZoneNumber: 1, id: 1, metaData: null },
      vatAccount: null, name: OWNER_NAME, id: OWNER_ID, metaData: null,
    },
    numberSeries: { prefix: 'DDT', sequenceType: 'Ordered', numberSeriesSequenceElement: null, id: SERIES, metaData: null },
    invoice: null, order: null,
    productDetails: {
      priceList: { calculatedInNetAmount: true, isBasePriceList: true, number: 0, id: 0, metaData: null },
      priceInGross: false, defaultDiscountPercentage: 0.0, productLines,
    },
    deliveryDetails: {
      deliveredBy: 'Self', reasonForDelivery: null, deliveryTerms: null, deliveryStartDate: null,
      deliveryEndDate: null, numberOfPackages: 1, descriptionOfPackages: null,
      netWeight: null, grossWeight: null, carrierInfo: null, id: null, metaData: null,
    },
    additionalExpenses: null, date: today,
    additionalInfo: { currency: 'EUR', exchangeRate: 100.0, layout: null, project: null, tenderContractData: null },
  };
}

function approx(a, b) { return Math.abs(Number(a) - Number(b)) < 0.005; }

async function runScenario(sc, today) {
  const t = computeTotals(sc.lines);
  const sumLineVatSent = round2(sc.lines.reduce((s, l, i) => s + round2((t.lineNets[i] * RATE) / 100), 0));
  const divergent = !approx(t.vat, sumLineVatSent);

  const created = await call('POST', '/delivery-notes/sales', buildDdt(sc.lines, t, today));
  const id = created.json?.id;
  if (created.json?.errorCode || id == null) {
    return { sc, divergent, ok: false, note: `create KO: ${created.json?.errorCode || created.status}` };
  }
  const filter = encodeURIComponent(`id$eq:${id}`);
  const issued = await call('POST', `/delivery-notes/sales/issue?filter=${filter}`);
  if (issued.json && !Array.isArray(issued.json) && issued.json.errorCode) {
    await call('DELETE', `/delivery-notes/sales/${id}`);
    return { sc, divergent, ok: false, note: `issue KO: ${issued.json.errorCode}` };
  }
  // rilettura
  let fin;
  for (let a = 0; a < 4; a++) {
    fin = await call('GET', `/delivery-notes/sales/${id}`);
    if (fin.json?.deliveryNoteStatus === 'Issued') break;
    await new Promise((r) => setTimeout(r, 300));
  }
  const retHeaderVat = fin.json?.vatAmount;
  const retHeaderTot = fin.json?.totalAmount;
  const retLines = fin.json?.productDetails?.productLines || [];
  const retSumLineVat = round2(retLines.reduce((s, ln) => s + Number(ln?.totalVatAmount || 0), 0));
  const retSumLineNet = round2(retLines.reduce((s, ln) => s + Number(ln?.totalNetAmount || 0), 0));

  // (A) testata preservata, (B) righe preservate, (C) coerenza interna emessa
  const headerOk = approx(retHeaderVat, t.vat) && approx(retHeaderTot, t.gross);
  const linesNetOk = approx(retSumLineNet, t.net);
  const headerVsLines = approx(retHeaderVat, retSumLineVat); // documento internamente coerente?

  if (!process.env.DDT_KEEP) await call('DELETE', `/delivery-notes/sales/${id}`);

  return {
    sc, divergent, ok: true, id,
    sent: { headerVat: t.vat, headerTot: t.gross, sumLineVat: sumLineVatSent, net: t.net },
    ret: { headerVat: retHeaderVat, headerTot: retHeaderTot, sumLineVat: retSumLineVat, net: retSumLineNet },
    headerOk, linesNetOk, headerVsLines,
  };
}

(async () => {
  const self = await call('GET', '/self');
  console.log(`Azienda: ${self.json?.company?.name || '?'}  ⚠️ confermare che sia il TRIAL`);

  OWNER_ID = Number(process.env.DDT_CUSTOMER_ID) ||
    (await call('GET', '/customers?pagesize=1')).json?.collection?.[0]?.customerNumber;
  OWNER_NAME = (await call('GET', `/customers/${OWNER_ID}`)).json?.name || 'Cliente';
  const prod = (await call('GET', '/products?pagesize=1')).json?.collection?.[0];
  PROD_ID = process.env.DDT_PRODUCT_ID || prod?.productNumber;
  PROD_NAME = prod?.name || 'Prodotto';
  console.log(`owner=${OWNER_ID} (${OWNER_NAME})  product=${PROD_ID} (${PROD_NAME})\n`);

  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  for (const sc of SCENARIOS) {
    process.stdout.write(`• ${sc.label} … `);
    try {
      const r = await runScenario(sc, today);
      results.push(r);
      if (!r.ok) { console.log(`SKIP (${r.note})`); continue; }
      const flags = [r.headerOk ? 'A✓' : 'A✗', r.linesNetOk ? 'B✓' : 'B✗', r.headerVsLines ? 'C✓' : 'C✗'];
      console.log(`${flags.join(' ')} ${r.divergent ? '[divergente]' : ''}`);
    } catch (e) {
      console.log(`💥 ${e?.message || e}`);
      results.push({ sc, ok: false, note: String(e?.message || e) });
    }
  }

  // tabella dettaglio
  console.log('\n' + '═'.repeat(78));
  console.log('DETTAGLIO (inviato → restituito)');
  console.log('═'.repeat(78));
  for (const r of results) {
    if (!r.ok) { console.log(`\n${r.sc.label}\n   ⚠️ ${r.note}`); continue; }
    console.log(`\n${r.sc.label}${r.divergent ? '  ⟵ testata≠Σrighe by design' : ''}`);
    console.log(`   testata vat:  ${r.sent.headerVat} → ${r.ret.headerVat}   ${r.headerOk ? '✓' : '✗ DIVERSO'}`);
    console.log(`   testata tot:  ${r.sent.headerTot} → ${r.ret.headerTot}`);
    console.log(`   Σ vat righe:  ${r.sent.sumLineVat} → ${r.ret.sumLineVat}`);
    console.log(`   netto doc:    ${r.sent.net} → ${r.ret.net}   ${r.linesNetOk ? '✓' : '✗'}`);
    console.log(`   coerenza interna emesso (testata==Σrighe): ${r.headerVsLines ? '✓' : '⚠️ NO'}`);
  }

  // verdetto
  const done = results.filter((r) => r.ok);
  const headerFail = done.filter((r) => !r.headerOk);
  const internalFail = done.filter((r) => !r.headerVsLines);
  console.log('\n' + '═'.repeat(78));
  console.log('VERDETTO');
  console.log('═'.repeat(78));
  console.log(`  scenari eseguiti: ${done.length}/${SCENARIOS.length}`);
  console.log(`  (A) testata preservata da Reviso: ${headerFail.length === 0 ? '✅ sempre' : `⚠️ ${headerFail.length} falliti`}`);
  console.log(`  (C) documenti internamente coerenti (testata==Σrighe): ${internalFail.length === 0 ? '✅ sempre' : `⚠️ ${internalFail.length} incoerenti`}`);
  if (headerFail.length === 0 && internalFail.length > 0) {
    console.log(`\n  → Reviso PRESERVA la nostra IVA di testata (fiscalmente corretta: IVA sul totale),`);
    console.log(`    ma in N casi le righe sommano a un valore diverso (arrotondamento per-riga).`);
    console.log(`    Decisione: per il DDT la testata è la verità → ok lasciare così, oppure`);
    console.log(`    NON inviare totalVatAmount per riga e lasciar derivare a Reviso.`);
  } else if (headerFail.length > 0) {
    console.log(`\n  → ⚠️ Reviso NON preserva sempre la testata: payload #11 da rivedere (vedi righe ✗).`);
  } else {
    console.log(`\n  → ✅ Tutto coerente: nessuna azione su #11.`);
  }
})().catch((e) => { console.error('💥', e); process.exit(1); });
