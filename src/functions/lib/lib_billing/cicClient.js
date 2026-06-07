"use strict";
// ============================================================================
// CicClient — thin wrapper REST su Reviso (rest.reviso.com)
// Autenticazione = due header statici (no OAuth). Vedi cicConfig.ts.
// ============================================================================
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CicClient = void 0;
const axios_1 = __importDefault(require("axios"));
class CicClient {
    constructor(cfg) {
        this.cfg = cfg;
    }
    headers() {
        return {
            'X-AppSecretToken': this.cfg.appSecretToken,
            'X-AgreementGrantToken': this.cfg.agreementGrantToken,
            'Content-Type': 'application/json',
        };
    }
    async get(path) {
        const res = await axios_1.default.get(`${this.cfg.baseUrl}${path}`, { headers: this.headers() });
        return res.data;
    }
    async post(path, body) {
        const res = await axios_1.default.post(`${this.cfg.baseUrl}${path}`, body, { headers: this.headers() });
        return res.data;
    }
    async put(path, body) {
        const res = await axios_1.default.put(`${this.cfg.baseUrl}${path}`, body, { headers: this.headers() });
        return res.data;
    }
    async del(path) {
        await axios_1.default.delete(`${this.cfg.baseUrl}${path}`, { headers: this.headers() });
    }
}
exports.CicClient = CicClient;
//# sourceMappingURL=cicClient.js.map