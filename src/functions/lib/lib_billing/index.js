"use strict";
// ============================================================================
// lib_billing — punto d'ingresso del layer di fatturazione (Fase 2 migrazione)
// Selettore del provider in base a config/billing.activeBackend.
// Il FicProvider verrà aggiunto estraendo il codice FiC da index.ts (prossimo
// step, su questo branch): fino ad allora il path FiC resta quello attuale.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DELIVERY_TARIFF_CODES = exports.isRigaConsegna = exports.isDeliveryTariff = exports.buildDdtLines = exports.CicClient = exports.createCicProvider = exports.CicProvider = exports.getActiveBackend = exports.getCicConfig = exports.computeTotals = exports.round2 = void 0;
exports.getBillingProvider = getBillingProvider;
const cicProvider_1 = require("./cicProvider");
const cicConfig_1 = require("./cicConfig");
__exportStar(require("./types"), exports);
var rounding_1 = require("./rounding");
Object.defineProperty(exports, "round2", { enumerable: true, get: function () { return rounding_1.round2; } });
Object.defineProperty(exports, "computeTotals", { enumerable: true, get: function () { return rounding_1.computeTotals; } });
var cicConfig_2 = require("./cicConfig");
Object.defineProperty(exports, "getCicConfig", { enumerable: true, get: function () { return cicConfig_2.getCicConfig; } });
Object.defineProperty(exports, "getActiveBackend", { enumerable: true, get: function () { return cicConfig_2.getActiveBackend; } });
var cicProvider_2 = require("./cicProvider");
Object.defineProperty(exports, "CicProvider", { enumerable: true, get: function () { return cicProvider_2.CicProvider; } });
Object.defineProperty(exports, "createCicProvider", { enumerable: true, get: function () { return cicProvider_2.createCicProvider; } });
var cicClient_1 = require("./cicClient");
Object.defineProperty(exports, "CicClient", { enumerable: true, get: function () { return cicClient_1.CicClient; } });
var ddtLines_1 = require("./ddtLines");
Object.defineProperty(exports, "buildDdtLines", { enumerable: true, get: function () { return ddtLines_1.buildDdtLines; } });
Object.defineProperty(exports, "isDeliveryTariff", { enumerable: true, get: function () { return ddtLines_1.isDeliveryTariff; } });
Object.defineProperty(exports, "isRigaConsegna", { enumerable: true, get: function () { return ddtLines_1.isRigaConsegna; } });
Object.defineProperty(exports, "DELIVERY_TARIFF_CODES", { enumerable: true, get: function () { return ddtLines_1.DELIVERY_TARIFF_CODES; } });
/**
 * Ritorna il provider per il backend richiesto (o quello attivo da config).
 * 'fic' non è ancora servito da qui: usare il path legacy in index.ts finché
 * non viene estratto il FicProvider.
 */
async function getBillingProvider(backend) {
    const b = backend || (await (0, cicConfig_1.getActiveBackend)());
    if (b === 'cic')
        return (0, cicProvider_1.createCicProvider)();
    throw new Error("FicProvider non ancora disponibile in lib_billing: usare il path FiC legacy in index.ts");
}
//# sourceMappingURL=index.js.map