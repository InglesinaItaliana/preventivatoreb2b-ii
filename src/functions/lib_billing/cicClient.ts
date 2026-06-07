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

  async get(path: string): Promise<any> {
    const res = await axios.get(`${this.cfg.baseUrl}${path}`, { headers: this.headers() });
    return res.data;
  }

  async post(path: string, body: unknown): Promise<any> {
    const res = await axios.post(`${this.cfg.baseUrl}${path}`, body, { headers: this.headers() });
    return res.data;
  }

  async put(path: string, body: unknown): Promise<any> {
    const res = await axios.put(`${this.cfg.baseUrl}${path}`, body, { headers: this.headers() });
    return res.data;
  }

  async del(path: string): Promise<void> {
    await axios.delete(`${this.cfg.baseUrl}${path}`, { headers: this.headers() });
  }
}
