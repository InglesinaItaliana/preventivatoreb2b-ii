// ============================================================================
// CicClient — thin wrapper REST su Reviso (rest.reviso.com)
// Autenticazione = due header statici (no OAuth). Vedi cicConfig.ts.
// ============================================================================

import axios from 'axios';
import { CicConfig } from './cicConfig';

export class CicClient {
  constructor(private readonly cfg: CicConfig) {}

  private headers(): Record<string, string> {
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
  private async request(method: 'get' | 'post' | 'put' | 'delete', path: string, body?: unknown): Promise<any> {
    try {
      const res = await axios.request({
        method,
        url: `${this.cfg.baseUrl}${path}`,
        headers: this.headers(),
        ...(body !== undefined ? { data: body } : {}),
      });
      return res.data;
    } catch (e: any) {
      const err = e;
      const data = err?.response?.data;
      if (data) {
        const detail = (data && (data.message || data.errorCode)) || JSON.stringify(data);
        const wrapped = new Error(`CiC ${err.response?.status}: ${detail}`);
        (wrapped as any).response = { status: err.response?.status, data };
        throw wrapped;
      }
      throw err;
    }
  }

  get(path: string): Promise<any> {
    return this.request('get', path);
  }

  post(path: string, body: unknown): Promise<any> {
    return this.request('post', path, body);
  }

  put(path: string, body: unknown): Promise<any> {
    return this.request('put', path, body);
  }

  async del(path: string): Promise<void> {
    await this.request('delete', path);
  }
}
