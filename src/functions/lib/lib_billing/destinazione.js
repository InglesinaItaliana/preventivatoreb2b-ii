"use strict";
// ============================================================================
// Destinazione merce — luogo di consegna diverso dall'indirizzo del cliente.
// ----------------------------------------------------------------------------
// Funzioni PURE (nessun I/O) → testabili: qui vive la regola che decide DOVE
// va la merce e come quel dato finisce sul DDT. Su CiC la fattura nasce dal
// DDT, quindi un errore qui non si vede fino a fine mese.
//
// Il layout Reviso stampa il blocco `destination` DEL DOCUMENTO in "LUOGO DI
// DESTINAZIONE" (verificato sul DDT #89, 2026-07). Quando è null il layout
// ricopia il destinatario: è il comportamento voluto per la consegna standard.
//
// ⚠️ Questo modulo ha uno SPECCHIO lato client in `src/lib/destinazione.ts`
// (il frontend non può importare da src/functions: è escluso da tsconfig.app).
// I due file DEVONO restare allineati — c'è un test anti-drift che li confronta
// (src/lib/__tests__/destinazione.test.ts). Se tocchi una regola qui, toccala lì.
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROVINCE_CIC = void 0;
exports.normalizzaProvincia = normalizzaProvincia;
exports.provinciaNumber = provinciaNumber;
exports.validaDestinazione = validaDestinazione;
exports.destinazioneKey = destinazioneKey;
exports.hasDestinazione = hasDestinazione;
exports.formatDestinazione = formatDestinazione;
exports.destinazioneComune = destinazioneComune;
exports.buildDestinationBlock = buildDestinationBlock;
/**
 * Sigla provincia → provinceNumber di Reviso. Tabella CONGELATA, letta da
 * `GET /provinces/IT?pagesize=1000` il 2026-07-29 (111 province + un record
 * fantasma senza sigla, numero 999, scartato).
 *
 * Perché congelata e non letta a runtime:
 *  - l'endpoint è paginato e di default torna 20 record su 112: una fetch
 *    distratta produce una mappa monca a metà alfabeto, in silenzio;
 *  - è un dato che non cambia; una chiamata di rete in più sul path del DDT
 *    è solo un modo aggiuntivo di fallire.
 * Il test anti-drift la riconfronta con Reviso quando serve.
 *
 * ⚠️ Contiene le 4 province ABOLITE nel 2016 (CI, VS, OG, OT) perché Reviso le
 * espone ancora, e NON contiene `SU`: per Reviso il Sud Sardegna è `SD` (111).
 */
exports.PROVINCE_CIC = Object.freeze({
    AG: 1, AL: 2, AN: 3, AO: 4, AP: 7, AQ: 5,
    AR: 6, AT: 8, AV: 9, BA: 10, BG: 14, BI: 15,
    BL: 12, BN: 13, BO: 16, BR: 19, BS: 18, BT: 11,
    BZ: 17, CA: 20, CB: 22, CE: 24, CH: 27, CI: 23,
    CL: 21, CN: 32, CO: 28, CR: 30, CS: 29, CT: 25,
    CZ: 26, EN: 33, FC: 38, FE: 35, FG: 37, FI: 36,
    FM: 34, FR: 39, GE: 40, GO: 41, GR: 42, IM: 43,
    IS: 44, KR: 31, LC: 48, LE: 47, LI: 49, LO: 50,
    LT: 46, LU: 51, MB: 60, MC: 52, ME: 57, MI: 58,
    MN: 53, MO: 59, MS: 54, MT: 55, NA: 61, NO: 62,
    NU: 63, OG: 64, OR: 66, OT: 65, PA: 68, PC: 74,
    PD: 67, PE: 73, PG: 71, PI: 75, PN: 77, PO: 79,
    PR: 69, PT: 76, PU: 72, PV: 70, PZ: 78, RA: 81,
    RC: 82, RE: 83, RG: 80, RI: 84, RM: 86, RN: 85,
    RO: 87, SA: 88, SD: 111, SI: 91, SO: 93, SP: 45,
    SR: 92, SS: 89, SV: 90, TA: 94, TE: 95, TN: 99,
    TO: 97, TP: 98, TR: 96, TS: 101, TV: 100, UD: 102,
    VA: 103, VB: 105, VC: 106, VE: 104, VI: 109, VR: 107,
    VS: 56, VT: 110, VV: 108,
});
/**
 * Sigle che esistono nel mondo reale ma non in Reviso.
 * `SU` è la sigla UFFICIALE del Sud Sardegna: chi la copia da un'anagrafica
 * corretta non troverebbe nulla, perché Reviso usa `SD`.
 */
const ALIAS_PROVINCE = Object.freeze({ SU: 'SD' });
/** Sigla canonica (quella che Reviso conosce), o undefined se non riconosciuta. */
function normalizzaProvincia(v) {
    const s = (v == null ? '' : String(v)).trim().toUpperCase();
    if (!s)
        return undefined;
    const canonica = ALIAS_PROVINCE[s] || s;
    return canonica in exports.PROVINCE_CIC ? canonica : undefined;
}
/** provinceNumber Reviso per una sigla, o undefined se la sigla non è valida. */
function provinciaNumber(v) {
    const sigla = normalizzaProvincia(v);
    return sigla ? exports.PROVINCE_CIC[sigla] : undefined;
}
const testo = (v) => (v == null ? '' : String(v)).trim();
/**
 * Errori bloccanti di una destinazione. Array vuoto = si può salvare.
 * Il telefono NON è obbligatorio (decisione 2026-07-29): senza numero il
 * corriere può non consegnare, ma è un rischio che sceglie il cliente.
 */
function validaDestinazione(d) {
    const errori = [];
    if (!d)
        return ['Destinazione mancante'];
    if (!testo(d.destinatario))
        errori.push('Manca il destinatario');
    if (!testo(d.indirizzo))
        errori.push("Manca l'indirizzo");
    if (!/^\d{5}$/.test(testo(d.cap)))
        errori.push('Il CAP deve essere di 5 cifre');
    if (!testo(d.citta))
        errori.push('Manca la città');
    if (testo(d.provincia) && !normalizzaProvincia(d.provincia)) {
        errori.push(`Provincia non riconosciuta: ${testo(d.provincia)}`);
    }
    return errori;
}
/**
 * Chiave di raggruppamento: due ordini con la STESSA chiave possono viaggiare
 * sullo stesso DDT, due chiavi diverse NO — un DDT ha un solo luogo di
 * destinazione, e ciò che finisce sul DDT è ciò che viene fatturato.
 *
 * Consegna standard (nessuna destinazione) → stringa vuota.
 * Telefono, referente e note NON entrano nella chiave: descrivono il contatto,
 * non il luogo, e due ordini per lo stesso posto devono poter viaggiare insieme
 * anche se uno porta un numero di telefono e l'altro no.
 */
function destinazioneKey(d) {
    if (!d)
        return '';
    const parti = [d.destinatario, d.indirizzo, d.cap, d.citta, normalizzaProvincia(d.provincia) || d.provincia]
        .map((p) => testo(p).toLowerCase().replace(/\s+/g, ' '));
    return parti.every((p) => !p) ? '' : parti.join('|');
}
/** True se l'ordine viaggia verso un luogo diverso dall'indirizzo del cliente. */
function hasDestinazione(d) {
    return destinazioneKey(d) !== '';
}
/**
 * Indirizzo su una riga: badge, navigatore, tooltip. Il navigatore riceve
 * questa stringa così com'è → niente etichette, solo il luogo.
 */
function formatDestinazione(d) {
    if (!d)
        return '';
    const prov = normalizzaProvincia(d.provincia) || testo(d.provincia);
    const comune = [testo(d.cap), testo(d.citta)].filter(Boolean).join(' ');
    return [testo(d.indirizzo), comune, prov ? `(${prov})` : '']
        .filter(Boolean).join(', ')
        .replace(', (', ' (');
}
/**
 * Decide se un gruppo di ordini può viaggiare su un unico DDT e con quale
 * luogo di destinazione. È LA regola critica del feature: un DDT ha una sola
 * destinazione e su CiC la fattura nasce dal DDT, quindi mescolare ordini
 * diretti in posti diversi manda merce e fattura all'indirizzo sbagliato — e
 * lo si scopre a fine mese.
 *
 * Serve identica ai due lati: il client la usa per non far nemmeno selezionare
 * ordini incompatibili, il server per rifiutarli comunque (il client si può
 * aggirare, la callable no).
 */
function destinazioneComune(destinazioni) {
    const chiavi = [...new Set(destinazioni.map((d) => destinazioneKey(d)))];
    if (chiavi.length > 1) {
        return {
            ok: false,
            errore: 'Gli ordini selezionati hanno luoghi di consegna diversi: serve un DDT per ciascuna destinazione.',
        };
    }
    const prima = destinazioni.find((d) => hasDestinazione(d));
    if (!prima)
        return { ok: true };
    const errori = validaDestinazione(prima);
    if (errori.length > 0)
        return { ok: false, errore: `Destinazione non valida: ${errori.join('; ')}` };
    return { ok: true, destinazione: prima };
}
/**
 * Blocco `destination` del DDT CiC → "LUOGO DI DESTINAZIONE" sul PDF.
 * Ritorna null quando non c'è destinazione alternativa: il layout ricopia il
 * destinatario, che è esattamente il comportamento della consegna standard.
 *
 * Forma dedotta dai documenti reali (DDT #89 + sonda del 2026-07-29):
 *  - la provincia sta DENTRO countryCode ed è un NUMERO, non la sigla;
 *  - `country` non dev'essere mai vuoto o il PDF stampa "undefined".
 * Le destinazioni alternative sono ITALIANE: chi consegna all'estero passa
 * dall'anagrafica cliente, non da qui.
 */
function buildDestinationBlock(d) {
    if (!hasDestinazione(d))
        return null;
    const num = provinciaNumber(d.provincia);
    return {
        companyName: testo(d.destinatario),
        address: testo(d.indirizzo),
        zipCode: testo(d.cap),
        city: testo(d.citta),
        country: 'Italia',
        countryCode: Object.assign(Object.assign({}, (num ? { province: { id: num, metaData: null } } : {})), { id: 'IT', metaData: null }),
        id: null,
        metaData: null,
    };
}
//# sourceMappingURL=destinazione.js.map