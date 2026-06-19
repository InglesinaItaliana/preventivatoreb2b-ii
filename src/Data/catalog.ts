import { defineStore } from 'pinia';
import Papa from 'papaparse';
import { db } from '../firebase';
import { collection, doc, getDoc, getDocs, orderBy, query } from 'firebase/firestore';

const GOOGLE_SHEET_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQspWsxI0p5Rbvss1cZlGiLl8yrzPa23xPJ63x-uQunbnWgmVPC32RRB_qSwELeBYDYf3ZCR0IvYH_m/pub?gid=1843801803&single=true&output=csv';

// Riga normalizzata del listino (stessa forma sia da CSV sia da Firestore catalogo/).
interface CatalogRow {
  categoria: string;
  modello: string;
  dimensione: string;
  finitura: string;
  tipoFinitura: string;
  cod: string;
  prezzo: number;
}

export const useCatalogStore = defineStore('catalog', {
  state: () => ({
    listino: {} as any, // Serve per i menu a tendina (Gerarchico)
    codiciMap: {} as Record<string, number>, // <--- Indice veloce per Codice -> Prezzo
    loading: false,
    error: null as string | null,
    isLoaded: false,
    source: '' as string // 'firestore' | 'sheet' (diagnostica: da dove è stato caricato)
  }),

  actions: {
    // UNICO punto di costruzione di listino+codiciMap da una lista di righe
    // normalizzate. Logica IDENTICA per CSV e Firestore → impossibile divergere.
    _buildFromRows(rows: CatalogRow[]) {
      const tree: { [key: string]: any } = {};
      const map: Record<string, number> = {};
      rows.forEach((r) => {
        // 1. Albero (per i menu): solo se categoria e modello
        if (r.categoria && r.modello) {
          if (!tree[r.categoria]) tree[r.categoria] = {};
          if (!tree[r.categoria][r.modello]) tree[r.categoria][r.modello] = {};
          if (!tree[r.categoria][r.modello][r.dimensione]) tree[r.categoria][r.modello][r.dimensione] = {};
          tree[r.categoria][r.modello][r.dimensione][r.finitura] = { prezzo: r.prezzo, cod: r.cod, group: r.tipoFinitura };
        }
        // 2. Mappa codici (per i calcoli): solo se c'è un codice
        if (r.cod) map[r.cod] = r.prezzo;
      });
      this.listino = tree;
      this.codiciMap = map;
      this.isLoaded = true;
      this.loading = false;
    },

    // Normalizza una riga grezza del CSV → CatalogRow (stessa identica logica storica).
    _normalizeCsvRow(row: any): CatalogRow {
      const categoria = (row.CATEGORIA || row.INGLESINE || '').trim().toUpperCase();
      const modello = (row.TIPO || row.MODELLO || '').trim().toUpperCase();
      const dimensione = (row.DIMENSIONE || 'STD').trim().toUpperCase();
      const finitura = (row.FINITURA || 'STD').trim().toUpperCase();
      const tipoFinitura = (row.TIPO_FINITURA || 'Altro').trim();
      const cod = (row.CODICE || '').trim().toUpperCase();
      let rawPrice = row.PREZZO;
      if (typeof rawPrice === 'string') rawPrice = rawPrice.replace('€', '').replace(',', '.').trim();
      const prezzo = rawPrice ? parseFloat(rawPrice) : 0;
      return { categoria, modello, dimensione, finitura, tipoFinitura, cod, prezzo };
    },

    async fetchCatalog() {
      if (this.isLoaded) return;
      this.loading = true;
      this.error = null;

      // 1) Se il flag settings/pricing.catalogSource === 'firestore', carica dal
      //    listino interno. Su QUALSIASI problema (flag assente, errore, collezione
      //    vuota) si ricade sul Google Sheet → i preventivi non si fermano mai.
      try {
        const flagSnap = await getDoc(doc(db, 'settings', 'pricing'));
        const wantFirestore = flagSnap.exists() && flagSnap.data()?.catalogSource === 'firestore';
        if (wantFirestore) {
          // Modello "base + struttura": i PREZZI vivono in listino_base (48 codici,
          // = CONFIG_PREZZI); la STRUTTURA del menu (389 righe) vive in catalogo;
          // ogni foglia EREDITA il prezzo da listino_base[cod]. Così si modifica un
          // solo prezzo base e tutte le varianti figlie si aggiornano.
          const [baseSnap, catSnap] = await Promise.all([
            getDocs(collection(db, 'listino_base')),
            getDocs(query(collection(db, 'catalogo'), orderBy('ord'))),
          ]);
          if (!catSnap.empty && !baseSnap.empty) {
            const baseMap: Record<string, number> = {};
            baseSnap.docs.forEach((d) => { const r = d.data() as any; baseMap[r.cod] = r.prezzo; });
            const rows = catSnap.docs.map((d) => {
              const r = d.data() as any;
              return {
                categoria: r.categoria, modello: r.modello, dimensione: r.dimensione,
                finitura: r.finitura, tipoFinitura: r.tipoFinitura, cod: r.cod,
                // EREDITA dalla base; fallback difensivo al prezzo memorizzato se il codice manca
                prezzo: (r.cod in baseMap) ? baseMap[r.cod] : (r.prezzo ?? 0),
              } as CatalogRow;
            });
            this.source = 'firestore';
            this._buildFromRows(rows);
            // garantisce che TUTTI i codici base finiscano in codiciMap (anche eventuali non a menu)
            this.codiciMap = { ...baseMap, ...this.codiciMap };
            return;
          }
          console.warn('[catalog] flag=firestore ma listino_base/catalogo vuoti → fallback Google Sheet');
        }
      } catch (e: any) {
        console.warn('[catalog] lettura Firestore fallita → fallback Google Sheet:', e?.message || e);
      }

      // 2) Fallback / default storico: Google Sheet CSV.
      await this._fetchFromSheet();
    },

    async _fetchFromSheet() {
      try {
        const response = await fetch(GOOGLE_SHEET_CSV_URL);
        if (!response.ok) throw new Error('Errore connessione Google Sheet');
        const csvText = await response.text();

        await new Promise<void>((resolve) => {
          Papa.parse(csvText, {
            header: true,
            skipEmptyLines: true,
            transformHeader: (h) => h.trim().toUpperCase(),
            complete: (results) => {
              const rows = (results.data as any[]).map((r) => this._normalizeCsvRow(r));
              this.source = 'sheet';
              this._buildFromRows(rows);
              resolve();
            },
            error: (err: any) => {
              this.error = err.message;
              this.loading = false;
              resolve();
            }
          });
        });
      } catch (e: any) {
        this.error = e.message;
        this.loading = false;
      }
    }
  }
});
