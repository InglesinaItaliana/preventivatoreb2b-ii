"use strict";
// ============================================================================
// Costruzione delle righe di un DDT (CiC) a partire dagli ordini POPS.
// ----------------------------------------------------------------------------
// Funzione PURA (nessun I/O) → testabile: è la regola che decide cosa viene
// fatturato, perché su CiC la FATTURA NASCE DAL DDT. Ciò che non entra qui non
// viene mai fatturato a nessuno.
//
// Regole:
//  - MERCE e LAVORAZIONI (curvature/adattamenti): entrano tutte.
//  - CONSEGNE: se più ordini viaggiano insieme il trasporto si paga UNA volta
//    sola → ne sopravvive una, quella con la TARIFFA PIÙ ALTA, con quantità 1
//    (stessa regola del path FiC legacy in index.ts).
//  - SCONTI: una riga CiC ha un solo campo sconto e i due sconti si compongono
//    in cascata → lo sconto concordato sull'ORDINE finisce dentro `unitNetPrice`
//    (prezzo già netto), mentre il campo sconto di riga resta allo sconto di
//    PAGAMENTO del cliente (da CiC), che la fattura eredita così com'è.
//  - Una RIGA DESCRITTIVA apre le righe di ogni ordine quando il DDT è cumulativo
//    o quando l'ordine aveva uno sconto (in quel caso lo dichiara, perché i
//    prezzi unitari sono già netti).
// ============================================================================
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPEDIZIONE_CODE = exports.SPEDIZIONE_NAME = exports.DELIVERY_TARIFF_CODES = void 0;
exports.isDeliveryTariff = isDeliveryTariff;
exports.isRigaConsegna = isRigaConsegna;
exports.buildDdtLines = buildDdtLines;
/** Tariffe di consegna/spedizione: righe EXTRA "speciali", soggette all'unificazione. */
exports.DELIVERY_TARIFF_CODES = [
    'Consegna Diretta V1',
    'Consegna Diretta V2',
    'Consegna Diretta V3',
    'Consegna Diretta V4',
    'Consegna Diretta V5',
    'Consegna Diretta V6',
    'Consegna Diretta V7',
    'Consegna Diretta V8',
    'Ritiro in sede',
    'Spedizione',
];
function isDeliveryTariff(nome) {
    const n = String(nome !== null && nome !== void 0 ? nome : '').trim().toLowerCase();
    return exports.DELIVERY_TARIFF_CODES.some((t) => t.toLowerCase() === n);
}
/**
 * Riga di trasporto. UN SOLO predicato per tutti i punti che maneggiano soldi
 * (cifra a video, PDF, ordine, DDT): se ognuno decide a modo suo cos'è una
 * consegna, il totale firmato e quello fatturato divergono in silenzio.
 * Specchio di isRigaConsegna() in src/lib/billing.ts.
 */
function isRigaConsegna(item) {
    return (item === null || item === void 0 ? void 0 : item.categoria) === 'EXTRA' && isDeliveryTariff(item === null || item === void 0 ? void 0 : item.descrizioneCompleta);
}
/** Tariffa "spedizione a mezzo corriere" (codice POPS, vedi CODICI_SPEDIZIONE in BuilderView). */
exports.SPEDIZIONE_NAME = 'Spedizione';
exports.SPEDIZIONE_CODE = 'L004';
function buildDdtLines(orders, scontoPagamento = 0, transportType) {
    var _a, _b, _c;
    const pagamento = Number(scontoPagamento) || 0;
    const isCumulativo = orders.length > 1;
    const lines = [];
    const consegne = [];
    for (const o of orders) {
        const cicNum = (_c = (_b = (_a = o.cic_order_number) !== null && _a !== void 0 ? _a : o.cic_order_id) !== null && _b !== void 0 ? _b : o.codice) !== null && _c !== void 0 ? _c : '';
        const commessa = o.commessa ? ` - ${o.commessa}` : '';
        const scontoOrdine = Number(o.scontoPercentuale) || 0;
        const scontato = (prezzo) => (Number(prezzo) || 0) * (1 - scontoOrdine / 100);
        const orderItems = [];
        for (const item of (o.elementi || [])) {
            const nome = (item === null || item === void 0 ? void 0 : item.descrizioneCompleta) || '';
            const code = (item === null || item === void 0 ? void 0 : item.codice) ? String(item.codice).toUpperCase().trim() : '';
            // Le consegne si raccolgono a parte: ne sopravvive una sola per DDT.
            // ⚠️ La consegna NON prende lo sconto dell'ordine (regola commerciale): resta a
            // tariffa piena e accetta solo lo sconto di pagamento del cliente. Perciò la
            // tariffa con cui si sceglie il vincitore è anche quella che viene addebitata.
            if (isRigaConsegna(item)) {
                const tariffa = Number(item.prezzo_unitario) || 0;
                consegne.push({
                    code,
                    description: nome,
                    qty: 1,
                    tariffa,
                    unitNetPrice: tariffa, // prezzo PIENO: nessuno sconto d'ordine sul trasporto
                    category: 'EXTRA',
                    discountPercentage: pagamento,
                });
                continue;
            }
            let desc = nome || 'Articolo Vetrata';
            if ((item === null || item === void 0 ? void 0 : item.categoria) !== 'EXTRA' && ((item === null || item === void 0 ? void 0 : item.base_mm) > 0 || (item === null || item === void 0 ? void 0 : item.altezza_mm) > 0)) {
                desc += ` - Dim: ${item.base_mm}x${item.altezza_mm} mm`;
            }
            orderItems.push({
                code,
                description: desc,
                qty: Number(item === null || item === void 0 ? void 0 : item.quantita) || 1,
                unitNetPrice: scontato(item === null || item === void 0 ? void 0 : item.prezzo_unitario),
                category: item === null || item === void 0 ? void 0 : item.categoria,
                discountPercentage: pagamento,
            });
        }
        const notaSconto = scontoOrdine > 0
            ? ` - prezzi già scontati del ${scontoOrdine}% come da accordi`
            : '';
        if (orderItems.length > 0 && (isCumulativo || notaSconto)) {
            lines.push({
                code: '',
                description: `Ordine ${cicNum}${commessa}${notaSconto}`,
                qty: 0,
                unitNetPrice: 0,
                category: 'HEADER',
                isDescriptive: true,
            });
        }
        lines.push(...orderItems);
    }
    // Nessuna merce da spedire → nessun DDT (la consegna da sola non è un trasporto).
    if (lines.length === 0)
        return [];
    consegne.sort((a, b) => b.tariffa - a.tariffa);
    const migliore = consegne[0];
    if (migliore) {
        const { tariffa } = migliore, vincente = __rest(migliore, ["tariffa"]);
        void tariffa;
        // Trasporto a mezzo corriere: "Consegna Diretta" sarebbe una contraddizione stampata
        // sul documento. La riga diventa "Spedizione" (nome + prodotto a catalogo) ma CONSERVA
        // il prezzo pattuito sull'ordine: è quello che il cliente ha accettato di pagare.
        // La difformità fra tariffa d'ordine e trasporto reale è segnalata all'operatore
        // nella modale DDT (DdtModal.vue) — la decisione resta umana.
        if (transportType === 'COURIER' && vincente.description !== exports.SPEDIZIONE_NAME) {
            vincente.description = exports.SPEDIZIONE_NAME;
            vincente.code = exports.SPEDIZIONE_CODE;
        }
        lines.push(vincente);
    }
    return lines;
}
//# sourceMappingURL=ddtLines.js.map