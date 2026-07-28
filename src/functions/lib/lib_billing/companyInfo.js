"use strict";
// ============================================================================
// Anagrafica dell'azienda EMITTENTE — da Reviso (GET /self → .company).
// ----------------------------------------------------------------------------
// L'intestazione dei PDF POPS (preventivo/ordine/DDT) è una copia di cortesia
// dello stesso documento che esiste su Reviso: se i due blocchi divergono, al
// cliente arrivano due versioni dello stesso DDT con emittenti diversi. Per
// questo la fonte di verità è Reviso e NON una costante nel bundle: lì la si
// cambia una volta sola e POPS la rilegge (callable manuale + sync notturno,
// vedi syncCompanyInfo in index.ts), senza deploy.
//
// Reviso espone l'anagrafica su /self, insieme a utente e abbonamento: qui si
// tiene solo il blocco `company` e solo i campi che finiscono sul documento.
// La formattazione (telefono, abbreviazioni della via) NON si tocca: si stampa
// ciò che Reviso stampa. Se una cosa va scritta diversamente, si corregge in
// Reviso e da lì arriva in POPS.
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.mapSelfToCompany = mapSelfToCompany;
exports.fetchCompanyInfo = fetchCompanyInfo;
exports.diffCompany = diffCompany;
const cicClient_1 = require("./cicClient");
const cicConfig_1 = require("./cicConfig");
const str = (v) => (v == null ? '' : String(v).trim());
/**
 * Estrae CompanyInfo dalla risposta di GET /self. Pura → testabile senza rete.
 * Ogni campo assente diventa stringa vuota: chi disegna il PDF salta le righe
 * vuote invece di stampare "undefined".
 */
function mapSelfToCompany(self) {
    var _a;
    const c = (self === null || self === void 0 ? void 0 : self.company) || {};
    const via = [str(c.addressLine1), str(c.addressLine2)].filter(Boolean).join(' ');
    return {
        name: str(c.name),
        address: via,
        zip: str(c.zip),
        city: str(c.city),
        province: str((_a = c.province) === null || _a === void 0 ? void 0 : _a.provinceCode),
        country: str(c.countryCode),
        // vatNumber è la P.IVA; companyIdentificationNumber la ripete per le
        // società italiane, ma è il fallback semanticamente giusto se manca.
        piva: str(c.vatNumber) || str(c.companyIdentificationNumber),
        tel: str(c.phoneNumber),
        // contactEmail = referente; email/invoiceEmail sono i fallback.
        email: str(c.contactEmail) || str(c.email) || str(c.invoiceEmail),
    };
}
/** Legge l'anagrafica emittente da Reviso. */
async function fetchCompanyInfo(client) {
    const c = client || new cicClient_1.CicClient(await (0, cicConfig_1.getCicConfig)());
    const self = await c.get('/self');
    const info = mapSelfToCompany(self);
    if (!info.name || !info.piva) {
        throw new Error('Reviso /self non ha restituito ragione sociale o P.IVA');
    }
    return info;
}
/** Campi che il confronto considera: quelli stampati sul documento. */
const CAMPI = ['name', 'address', 'zip', 'city', 'province', 'country', 'piva', 'tel', 'email'];
/** Elenco dei campi cambiati fra due anagrafiche (per il log del sync). */
function diffCompany(prima, dopo) {
    if (!prima)
        return ['(primo sync)'];
    return CAMPI.filter((k) => str(prima[k]) !== str(dopo[k]));
}
//# sourceMappingURL=companyInfo.js.map