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

import { CicClient } from './cicClient';
import { getCicConfig } from './cicConfig';

/** Dati emittente pubblicati su settings/company e stampati sui PDF. */
export interface CompanyInfo {
  name: string;      // ragione sociale
  address: string;   // via e civico (addressLine1 [+ addressLine2])
  zip: string;
  city: string;      // in Reviso può già contenere la provincia: "Sant'Angelo Lodigiano (LO)"
  province: string;  // sigla (LO)
  country: string;   // ISO2 (IT)
  piva: string;      // senza prefisso IT, come in Reviso
  tel: string;
  email: string;     // e-mail del referente (contactEmail)
}

const str = (v: unknown): string => (v == null ? '' : String(v).trim());

/**
 * Estrae CompanyInfo dalla risposta di GET /self. Pura → testabile senza rete.
 * Ogni campo assente diventa stringa vuota: chi disegna il PDF salta le righe
 * vuote invece di stampare "undefined".
 */
export function mapSelfToCompany(self: any): CompanyInfo {
  const c = self?.company || {};
  const via = [str(c.addressLine1), str(c.addressLine2)].filter(Boolean).join(' ');
  return {
    name: str(c.name),
    address: via,
    zip: str(c.zip),
    city: str(c.city),
    province: str(c.province?.provinceCode),
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
export async function fetchCompanyInfo(client?: CicClient): Promise<CompanyInfo> {
  const c = client || new CicClient(await getCicConfig());
  const self = await c.get('/self');
  const info = mapSelfToCompany(self);
  if (!info.name || !info.piva) {
    throw new Error('Reviso /self non ha restituito ragione sociale o P.IVA');
  }
  return info;
}

/** Campi che il confronto considera: quelli stampati sul documento. */
const CAMPI: (keyof CompanyInfo)[] = ['name', 'address', 'zip', 'city', 'province', 'country', 'piva', 'tel', 'email'];

/** Elenco dei campi cambiati fra due anagrafiche (per il log del sync). */
export function diffCompany(prima: Partial<CompanyInfo> | null | undefined, dopo: CompanyInfo): string[] {
  if (!prima) return ['(primo sync)'];
  return CAMPI.filter((k) => str(prima[k]) !== str(dopo[k]));
}
