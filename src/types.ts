export type Categoria = 'INGLESINA' | 'DUPLEX' | 'MUNTIN' | 'CANALINO' | 'EXTRA';
export type Modello = 'VARSAVIA' | 'GERMANELLA' | 'ALLUMINIO' | 'BORDO_CALDO' | 'MANUALE';

// STATI DEL LIFECYCLE (Single Entity)
export type StatoPreventivo = 
  | 'DRAFT'             // Preventivo - Bozza
  | 'PENDING_VAL'       // Preventivo - In attesa di validazione (Tecnica)
  | 'QUOTE_READY'       // Preventivo - Pronto/Validato (Prezzo visibile)
  | 'ORDER_REQ'         // Ordine - Ordine Richiesto (Check Admin)
  | 'WAITING_FAST'      // Ordine - Attesa Accettazione Veloce (Checkbox) - RIMOSSO
  | 'WAITING_SIGN'      // Ordine - Attesa Firma (Upload)
  | 'SIGNED'            // Ordine - Firmato
  | 'IN_PRODUZIONE'     // Produzione - In Produzione
  | 'READY'             // Produzione - Ordine Pronto - NUOVO
  | 'DELIVERY'          // Spedizione - Spedizione programmata
  | 'DELIVERED'         // Consegna - Consegnato (Stato Finale)
  | 'REJECTED';         // Rifiutato

// --- COSTANTI PER QUERY FILTRATE ---
export const ACTIVE_STATUSES = [
  'DRAFT', 'PENDING_VAL', 'QUOTE_READY', 'ORDER_REQ',
  'WAITING_FAST', 'WAITING_SIGN', 'SIGNED', 
  'IN_PRODUZIONE', 'READY', 'DELIVERY'
];

export const ARCHIVE_STATUSES = ['DELIVERED', 'REJECTED'];

  // Aggiungi interfaccia per la Sessione di Consegna
export interface DeliverySession {
  id: string;
  driverUid: string;
  driverName: string;
  startTime: any; // Timestamp
  endTime: any | null; // Timestamp
  status: 'OPEN' | 'CLOSED';
  deliveredOrderIds: string[]; // Array di ID ordini consegnati in questo viaggio
}

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
  fuseruolo?: number | null;
  
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
    label: 'BOZZE', 
    badge: 'bg-gray-100 text-gray-500 border-gray-200', 
    iconBg: 'bg-gray-100 text-gray-500', 
    darkBadge: 'bg-gray-500 text-gray-100',
    hoverBadge: 'hover:bg-gray-200'
  },
  'PENDING_VAL': { 
    label: 'PREVENTIVI DA QUOTARE', 
    badge: 'bg-amber-400 text-amber-950 border-amber-500 hover:bg-amber-300', 
    iconBg: 'bg-amber-400 text-amber-950', 
    darkBadge: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
    hoverBadge: 'hover:bg-amber-300'
  },
  'QUOTE_READY': { 
    label: 'PREVENTIVI QUOTATI', 
    badge: 'bg-stone-200 text-stone-500 border-stone-200', 
    iconBg: 'bg-stone-200 text-stone-500', 
    darkBadge: 'bg-stone-500 text-stone-100',
    hoverBadge: 'hover:bg-stone-200'
  },
  'ORDER_REQ': { 
    label: 'ORDINI DA ACCETTARE', 
    badge: 'bg-amber-400 text-amber-950 border-amber-500 hover:bg-amber-300', 
    iconBg: 'bg-amber-400 text-amber-950', 
    darkBadge: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
    hoverBadge: 'hover:bg-amber-300'
  },
  'WAITING_FAST': { 
    label: 'ORDINI IN ATTESA FIRMA DEL CLIENTE', 
    badge: 'bg-stone-200 text-stone-500 border-stone-200', 
    iconBg: 'bg-stone-200 text-stone-500', 
    darkBadge: 'bg-stone-500 text-stone-100',
    hoverBadge: 'hover:bg-stone-200'
  },
  'WAITING_SIGN': { 
    label: 'ORDINI IN ATTESA FIRMA DEL CLIENTE', 
    badge: 'bg-stone-200 text-stone-500 border-stone-200', 
    iconBg: 'bg-stone-200 text-stone-500', 
    darkBadge: 'bg-stone-500 text-stone-100',
    hoverBadge: 'hover:bg-stone-200'
  },
  'SIGNED': { 
    label: 'ORDINI DA METTERE IN PRODUZIONE', 
    badge: 'bg-amber-400 text-amber-950 border-amber-500 hover:bg-amber-300', 
    iconBg: 'bg-amber-400 text-amber-950', 
    darkBadge: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
    hoverBadge: 'hover:bg-amber-300'
  },
  'IN_PRODUZIONE': { 
    label: 'ORDINI IN PRODUZIONE', 
    badge: 'bg-amber-400 text-amber-950 border-amber-500 hover:bg-amber-300', 
    iconBg: 'bg-amber-400 text-amber-950', 
    darkBadge: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
    hoverBadge: 'hover:bg-amber-300'
  },
  'READY': { 
    label: 'ORDINI PRONTI', 
    badge: 'bg-amber-400 text-amber-950 border-amber-500 hover:bg-amber-300', 
    iconBg: 'bg-amber-400 text-amber-950', 
    darkBadge: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
    hoverBadge: 'hover:bg-amber-300'
  },
  'DELIVERY': { 
    label: 'SPEDIZIONI PROGRAMMATE', 
    badge: 'bg-amber-400 text-amber-950 border-amber-500 hover:bg-amber-300', 
    iconBg: 'bg-amber-400 text-amber-950', 
    darkBadge: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
    hoverBadge: 'hover:bg-amber-300'
  },
  'DELIVERED': { 
    label: 'CONSEGNATI', 
    badge: 'bg-amber-400 text-amber-950 border-amber-500 hover:bg-amber-300', 
    iconBg: 'bg-amber-400 text-amber-950', 
    darkBadge: 'bg-amber-400 text-amber-950 hover:bg-amber-300',
    hoverBadge: 'hover:bg-amber-300'
  },
  'REJECTED': { 
    label: 'ANNULLATI', 
    badge: 'bg-red-100 text-red-700 border-red-200', 
    iconBg: 'bg-red-100 text-red-600', 
    darkBadge: 'bg-red-700 text-white',
    hoverBadge: 'hover:bg-red-200'
  }
};
// --- NUOVI TIPI PER GESTIONE LISTINI E CLIENTI ---

export interface CustomerPricingSettings {
  delivery_tariff_code: 'Consegna Diretta V1' | 'Consegna Diretta V2' | 'Consegna Diretta V3' | 'Spedizione';
  detraction_value: number; // Intero
  price_list_mode: 'default' | '2025-a' | '2025-x' | '2026-a';
}

export interface GlobalAdminSettings {
  delivery_tariffs: Record<string, number>; // es. { Consegna Diretta V1: 5, Consegna Diretta V2: 10 }
  active_global_default: string; // es. '2026-a'
}

// Estensione dell'interfaccia utente (se la usi globalmente, altrimenti la useremo localmente)
export interface ClientUserExtension extends CustomerPricingSettings {
  id: string;
  // ... altri campi user
}