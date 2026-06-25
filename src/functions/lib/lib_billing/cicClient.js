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
    /**
     * Esegue la chiamata REST e, su errore HTTP, propaga il CORPO di Reviso
     * (errorCode + message) invece del generico "Request failed with status code N"
     * di axios. Conserva `err.response.data` per chi vuole ispezionare il payload.
     */
    async request(method, path, body) {
        var _a, _b, _c;
        try {
            const res = await axios_1.default.request(Object.assign({ method, url: `${this.cfg.baseUrl}${path}`, headers: this.headers() }, (body !== undefined ? { data: body } : {})));
            return res.data;
        }
        catch (e) {
            const err = e;
            const data = (_a = err === null || err === void 0 ? void 0 : err.response) === null || _a === void 0 ? void 0 : _a.data;
            if (data) {
                const detail = (data && (data.message || data.errorCode)) || JSON.stringify(data);
                const wrapped = new Error(`CiC ${(_b = err.response) === null || _b === void 0 ? void 0 : _b.status}: ${detail}`);
                wrapped.response = { status: (_c = err.response) === null || _c === void 0 ? void 0 : _c.status, data };
                throw wrapped;
            }
            throw err;
        }
    }
    get(path) {
        return this.request('get', path);
    }
    post(path, body) {
        return this.request('post', path, body);
    }
    put(path, body) {
        return this.request('put', path, body);
    }
    async del(path) {
        await this.request('delete', path);
    }
}
exports.CicClient = CicClient;
//# sourceMappingURL=cicClient.js.map