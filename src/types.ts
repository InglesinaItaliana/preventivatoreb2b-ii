export type Categoria = 'INGLESINA' | 'DUPLEX' | 'MUNTIN' | 'CANALINO' | 'EXTRA';
export type Modello = 'VARSAVIA' | 'GERMANELLA' | 'ALLUMINIO' | 'BORDO_CALDO' | 'MANUALE';

import { PencilIcon, ArchiveBoxIcon, ShieldExclamationIcon, CheckCircleIcon, PaperAirplaneIcon, EyeIcon, ClockIcon, XCircleIcon, CogIcon, WrenchScrewdriverIcon, DocumentTextIcon, PlusIcon, CubeIcon } from '@heroicons/vue/24/solid';

// STATI DEL LIFECYCLE (Single Entity)
export type StatoPreventivo = 
  | 'DRAFT'             // Preventivo - Bozza
  | 'PENDING_VAL'       // Preventivo - In attesa di validazione (Tecnica)
  | 'QUOTE_READY'       // Preventivo - Pronto/Validato (Prezzo visibile)
  | 'ORDER_REQ'         // Ordine - Ordine Richiesto (Check Admin)
  | 'WAITING_FAST'      // Ordine - Attesa Accettazione Veloce (Checkbox) - NUOVO
  | 'WAITING_SIGN'      // Ordine - Attesa Firma (Upload)
  | 'SIGNED'            // Ordine - Firmato
  | 'IN_PRODUZIONE'     // Produzione - In Produzione
  | 'READY'             // Produzione - Ordine Pronto - NUOVO
  | 'REJECTED';         // Rifiutato

export interface Allegato {
  nome: string;
  url: string;
  tipo: string; // 'pdf', 'img', 'cad', etc.
  dataCaricamento: any;
}

export interface RiepilogoRiga {
  descrizione: string;
  canalino: string;
  quantitaTotale: number;
}

export interface RigaPreventivo {
  id: string;
  categoria: Categoria;
  modello: Modello;
  dimensione: string;
  finitura: string;
  base_mm: number;
  altezza_mm: number;
  righe: number;
  colonne: number;
  quantita: number;
  descrizioneCompleta: string;
  infoCanalino?: string;
  rawCanalino?: any;
  
  prezzo_unitario: number;
  prezzo_totale: number;
  
  nonEquidistanti?: boolean;
  curva: boolean;
  tacca: boolean;
}

// Struttura completa del documento su DB
export interface PreventivoDocumento {
  codice: string;
  cliente: string;
  commessa: string;
  
  elementi: RigaPreventivo[];
  
  // ECONOMICI
  totaleImponibile: number;
  scontoPercentuale: number; // Nuovo campo Admin
  totaleScontato: number;    // Totale finale

  // Riepilogo
  sommarioPreventivo?: RiepilogoRiga[];
  
  // GESTIONALI
  stato: StatoPreventivo;
  noteCliente: string;       // Nuovo campo
  noteAdmin?: string;
  
  // FILE
  allegati: Allegato[];      // Nuovo array
  
  dataCreazione: any;
  dataScadenza: any;
}
export interface DatiLegali {
  accettazioneTermini: boolean;   // Checkbox 1
  accettazioneClausole: boolean;  // Checkbox 2
  ipCliente: string;
  userAgent: string;
  dataFirma: any; // Timestamp
  firmatarioEmail: string;
  firmatarioUid: string;
}

export interface PreventivoDocumento {
  // ... campi esistenti ...
  datiLegali?: DatiLegali; // <--- NUOVO CAMPO OPZIONALE
}

// --- CONFIGURAZIONE CONDIVISA COLORI E TESTI ---
export const STATUS_DETAILS: Record<StatoPreventivo, { label: string, badge: string, iconBg: string, darkBadge: string, hoverBadge:string }> = {
  'DRAFT': { 
    label: 'BOZZA', 
    badge: 'bg-gray-100 text-gray-500 border-gray-200', 
    iconBg: 'bg-gray-100 text-gray-500', 
    darkBadge: 'bg-gray-500 text-gray-100',
    hoverBadge: 'hover:bg-gray-200'
  },
  'PENDING_VAL': { 
    label: 'PREVENTIVO IN ATTESA DI ACCETTAZIONE', 
    badge: 'bg-orange-100 text-orange-500 border-orange-200 hoover-orange-200', 
    iconBg: 'bg-orange-100 text-orange-500', 
    darkBadge: 'bg-orange-500 text-orange-100 hoover-orange-200',
    hoverBadge: 'hoover-orange-200'
  },
  'QUOTE_READY': { 
    label: 'PREVENTIVO VALIDATO', 
    badge: 'bg-green-100 text-green-700 border-green-200', 
    iconBg: 'bg-green-100 text-green-600', 
    darkBadge: 'bg-green-600 text-green-100'
  },
  'ORDER_REQ': { 
    label: 'ORDINE IN ATTESA DI ACCETTAZIONE', 
    badge: 'bg-cyan-100 text-cyan-700 border-cyan-200', 
    iconBg: 'bg-cyan-100 text-cyan-600', 
    darkBadge: 'bg-cyan-600 text-cyan-100'
  },
  'WAITING_FAST': { 
    label: 'ORDINE IN ATTESA FIRMA DEL CLIENTE', 
    badge: 'bg-cyan-100 text-cyan-700 border-cyan-200', 
    iconBg: 'bg-cyan-100 text-cyan-600', 
    darkBadge: 'bg-cyan-600 text-cyan-100'
  },
  'WAITING_SIGN': { 
    label: 'ORDINE IN ATTESA FIRMA DEL CLIENTE', 
    badge: 'bg-cyan-100 text-cyan-700 border-cyan-200', 
    iconBg: 'bg-cyan-100 text-cyan-600', 
    darkBadge: 'bg-cyan-600 text-cyan-100'
  },
  'SIGNED': { 
    label: 'ORDINE DA METTERE IN PRODUZIONE', 
    badge: 'bg-amber-100 text-amber-900 border-amber-200', 
    iconBg: 'bg-amber-100 text-amber-800', 
    darkBadge: 'bg-amber-800 text-amber-100'
  },
  'IN_PRODUZIONE': { 
    label: 'ORDINE IN PRODUZIONE', 
    badge: 'bg-amber-100 text-amber-900 border-amber-200', 
    iconBg: 'bg-amber-100 text-amber-800', 
    darkBadge: 'bg-amber-800 text-amber-100'
  },
  'READY': { 
    label: 'ORDINE PRONTO', 
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200', 
    iconBg: 'bg-emerald-100 text-emerald-700', 
    darkBadge: 'bg-emerald-700 text-emerald-100'
  },
  'REJECTED': { 
    label: 'ORDINE ANNULLATO', 
    badge: 'bg-red-100 text-red-700 border-red-200', 
    iconBg: 'bg-red-100 text-red-600', 
    darkBadge: 'bg-red-700 text-white' 
  }
};