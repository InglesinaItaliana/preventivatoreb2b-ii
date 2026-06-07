"use strict";
// ============================================================================
// Configurazione CiC / Reviso — letta da Firestore (config/cic, config/billing)
// con fallback su variabili d'ambiente per i segreti.
// ----------------------------------------------------------------------------
// I due token (AppSecret + AgreementGrant) insieme = accesso completo alla
// contabilità → vanno come secret (firebase functions:secrets), MAI nel repo né
// lato client. Gli ID (vatCode, serie, layout...) sono quelli rilevati nello
// spike 2026-06-05 sul trial italiano e sono sovrascrivibili da config/cic.
// ============================================================================
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCicConfig = getCicConfig;
exports.getActiveBackend = getActiveBackend;
const admin = __importStar(require("firebase-admin"));
const DEFAULTS = {
    baseUrl: 'https://rest.reviso.com',
    vatCode: 'V022',
    vatRate: 22,
    layoutNumber: 9,
    ddtNumberSeries: 29,
    defaultPaymentTermsNumber: 6,
    domesticVatZone: 1,
    customerGroupNumber: 1,
    genericProductNumber: 'VARIE',
};
async function getCicConfig() {
    var _a, _b, _c, _d, _e, _f;
    const snap = await admin.firestore().collection('config').doc('cic').get();
    const d = (snap.exists ? snap.data() : {});
    const appSecretToken = process.env.REVISO_APP_SECRET || d.appSecretToken;
    const agreementGrantToken = process.env.REVISO_AGREEMENT_GRANT || d.agreementGrantToken;
    if (!appSecretToken || !agreementGrantToken) {
        throw new Error('Credenziali CiC mancanti (config/cic.appSecretToken/agreementGrantToken o env REVISO_*)');
    }
    return {
        appSecretToken,
        agreementGrantToken,
        baseUrl: d.baseUrl || DEFAULTS.baseUrl,
        vatCode: d.vatCode || DEFAULTS.vatCode,
        vatRate: (_a = d.vatRate) !== null && _a !== void 0 ? _a : DEFAULTS.vatRate,
        layoutNumber: (_b = d.layoutNumber) !== null && _b !== void 0 ? _b : DEFAULTS.layoutNumber,
        ddtNumberSeries: (_c = d.ddtNumberSeries) !== null && _c !== void 0 ? _c : DEFAULTS.ddtNumberSeries,
        defaultPaymentTermsNumber: (_d = d.defaultPaymentTermsNumber) !== null && _d !== void 0 ? _d : DEFAULTS.defaultPaymentTermsNumber,
        domesticVatZone: (_e = d.domesticVatZone) !== null && _e !== void 0 ? _e : DEFAULTS.domesticVatZone,
        customerGroupNumber: (_f = d.customerGroupNumber) !== null && _f !== void 0 ? _f : DEFAULTS.customerGroupNumber,
        genericProductNumber: d.genericProductNumber || DEFAULTS.genericProductNumber,
    };
}
/** Backend attivo per i NUOVI documenti. Default 'fic' finché non si flippa al cutover. */
async function getActiveBackend() {
    var _a;
    const snap = await admin.firestore().collection('config').doc('billing').get();
    const b = (_a = (snap.exists ? snap.data() : {})) === null || _a === void 0 ? void 0 : _a.activeBackend;
    return b === 'cic' ? 'cic' : 'fic';
}
//# sourceMappingURL=cicConfig.js.map