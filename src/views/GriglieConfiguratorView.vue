<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue';
import { Cog6ToothIcon, XMarkIcon, ExclamationTriangleIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/vue/24/solid';
import { useCatalogStore } from '../Data/catalog';
import GrigliaPreview from '../components/griglie/GrigliaPreview.vue';
import SchedaPezzo from '../components/griglie/SchedaPezzo.vue';
import CommessaBar from '../components/griglie/CommessaBar.vue';
import PianoTaglioPassi from '../components/griglie/PianoTaglioPassi.vue';
import { materialiDiTaglio, type MaterialeTaglio } from '../lib/griglie/schedaProduzionePdf';
import { usePianiTaglio } from '../composables/griglie/usePianiTaglio';
import { calcolaProgetto, calcolaImballaggio, PEZZO, type ConfigGriglia, type Stile, type Distribuzione } from '../logic/griglie/progetto';
import { appartiene, coloreFinitura, eBiancoDiSerie, type FamigliaFinitura } from '../logic/griglie/finiture';
import { configDa, indiceDaCodice, pesoInglesinaKgM as kgMInglesina, type InputPannello, type ParametriOfficina, type CommessaGriglie } from '../logic/griglie/commessa';
import {
  PROFILO_U, BARRA, CANALE_INTERNO, PROFONDITA_CANALE, INGLESINA_26, MINUTERIA_PREMIUM,
  DEFAULT_GIOCO, DEFAULT_KERF, DEFAULT_INTESTATURA, DEFAULT_MARGINE_MINIMO, DEFAULT_LUNGHEZZA_MINIMA,
} from '../logic/griglie/materiali';

const catalog = useCatalogStore();
onMounted(() => catalog.fetchCatalog());

// --- Ingresso: l'utente ragiona in CENTIMETRI, il calcolo in MILLIMETRI -------
const stile = ref<Stile>('LONDRA');
const larghezzaCm = ref(100);
const altezzaCm = ref(180);
const passoOrizzontaleCm = ref(10);
const passoVerticaleCm = ref(10);
const quantita = ref(1);
const conBordo = ref(true);
const distribuzione = ref<Distribuzione>('PASSO_FISSO');

// Lo strato a vista non si sceglie: su LONDRA davanti stanno sempre le verticali,
// sui rombi la scelta non cambia nulla (v. configDa in commessa.ts).

// In SPAZI_UGUALI il cursore è un desiderata: il numero di barre lo sceglie il
// calcolo. Questi override esistono per ritoccarlo a mano (+/−); muovere il
// cursore li azzera, così la fonte di verità resta una sola.
const nVertOverride = ref<number | null>(null);
const nOrizOverride = ref<number | null>(null);
const ritocca = (asse: 'v' | 'o', delta: number) => {
  const p = progetto.value;
  if (!p) return;
  const attuale = asse === 'v' ? p.assiVerticali.length : p.assiOrizzontali.length;
  const target = Math.max(1, attuale + delta);
  if (asse === 'v') nVertOverride.value = target;
  else nOrizOverride.value = target;
};
const azzeraRitocchi = () => { nVertOverride.value = null; nOrizOverride.value = null; };

// PREMIUM: la griglia si comanda in uno di due modi, e l'altra grandezza segue.
//   PASSO  — si sceglie l'interasse (uguale nei due versi, o libero); il numero di
//            elementi è quello che ci va più vicino a luci uguali.
//   NUMERO — si sceglie quanti verticali e orizzontali; l'interasse è la conseguenza.
// Cambiando modo si parte da come è il pannello adesso, così non salta.
type ModoPremium = 'PASSO' | 'NUMERO';
const modoPremium = ref<ModoPremium>('PASSO');
const passiUguali = ref(true);
const nVertPremium = ref(1);
const nOrizPremium = ref(3);
// mm → cm al mezzo centimetro, dentro la corsa del cursore (4–60 cm)
const mezzoCm = (mm: number) => Math.min(60, Math.max(4, Math.round(mm / 5) / 2));

function scegliModoPremium(modo: ModoPremium) {
  const p = progetto.value;
  if (p && modo !== modoPremium.value) {
    if (modo === 'NUMERO') {
      nVertPremium.value = Math.max(1, p.assiVerticali.length);
      nOrizPremium.value = Math.max(1, p.assiOrizzontali.length);
    } else {
      passoOrizzontaleCm.value = mezzoCm(p.passoEffettivoX);
      passoVerticaleCm.value = passiUguali.value ? passoOrizzontaleCm.value : mezzoCm(p.passoEffettivoY);
    }
  }
  modoPremium.value = modo;
}
function scegliPassiUguali(uguali: boolean) {
  // Sbloccando, il passo verticale parte da quello comune: niente salto.
  if (!uguali) passoVerticaleCm.value = passoOrizzontaleCm.value;
  passiUguali.value = uguali;
}
const cambiaNumero = (asse: 'v' | 'o', delta: number) => {
  const r = asse === 'v' ? nVertPremium : nOrizPremium;
  r.value = Math.max(1, Math.round((r.value || 1) + delta));
};

const tipoFinitura = ref<FamigliaFinitura>('VERNICIATO');
const finitura = ref('');

// Parametri d'officina: si tarano sul campo, quindi stanno in un popup a parte (icona ingranaggio).
const parametriAperti = ref(false);
const gioco = ref(DEFAULT_GIOCO);
const kerf = ref(DEFAULT_KERF);
const intestatura = ref(DEFAULT_INTESTATURA);
const margineMinimo = ref(DEFAULT_MARGINE_MINIMO);
const lunghezzaMinima = ref(DEFAULT_LUNGHEZZA_MINIMA);
const pesoBarraKgM = ref<number | null>(BARRA.pesoKgM);
// Inglesina da 26 (PREMIUM): di serie barre da 3 m da 304 g. Il peso si inserisce
// PER BARRA, come lo si legge in magazzino; il calcolo lo porta al metro.
// Svuotando un campo, il dato che ne dipende non viene calcolato invece di essere inventato.
const steccaInglesina = ref<number | null>(INGLESINA_26.stecca);
const pesoSteccaInglesinaG = ref<number | null>(INGLESINA_26.pesoSteccaKg * 1000);
// v-model.number su un campo svuotato dà '' e non null: i calcoli leggono i valori
// normalizzati, così un campo vuoto non diventa uno 0 (pesi inventati, barre negative).
const misura = (v: unknown, min: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(min, v) : min);
const intero = (v: unknown, min: number) => Math.round(misura(v, min));
const facoltativo = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const parametri = computed<ParametriOfficina>(() => ({
  gioco: misura(gioco.value, 0),
  kerf: misura(kerf.value, 0),
  intestatura: misura(intestatura.value, 0),
  margineMinimo: misura(margineMinimo.value, 0),
  lunghezzaMinima: misura(lunghezzaMinima.value, 0),
  pesoBarraKgM: facoltativo(pesoBarraKgM.value),
  steccaInglesina: facoltativo(steccaInglesina.value),
  pesoSteccaInglesinaG: facoltativo(pesoSteccaInglesinaG.value),
}));
const pesoInglesinaKgM = computed(() => kgMInglesina(parametri.value));

// Su una griglia a rombi le barre non corrono parallele al bordo: il "vuoto
// contro il bordo" non esiste come grandezza, e i vuoti uguali non hanno senso.
const aRombi = computed(() => stile.value === 'MILANO' || stile.value === 'VENEZIA');

// PREMIUM: inglesina da 26, cornice della stessa inglesina, luci SEMPRE uguali
// (i suoi controlli sono a parte: `vuotiUguali` serve solo agli altri stili).
const isPremium = computed(() => stile.value === 'PREMIUM');
const vuotiUguali = computed(() => distribuzione.value === 'SPAZI_UGUALI');

// MILANO impone rombi quadrati, VENEZIA l'asse verticale doppio: in quegli stili
// il secondo cursore non è libero, è una conseguenza. LONDRA è l'unico con due
// passi indipendenti.
const passoVerticaleBloccato = computed(() => aRombi.value);
const passoVerticaleEffettivo = computed(() => {
  if (stile.value === 'MILANO') return passoOrizzontaleCm.value;
  if (stile.value === 'VENEZIA') return passoOrizzontaleCm.value * 2;
  return passoVerticaleCm.value;
});

// --- Il pannello a video: i controlli come dato unico -------------------------
// Si salva così in una commessa, e da qui si ricarica. La configurazione di
// calcolo esce da configDa(): la STESSA strada dei pannelli salvati.
const inputCorrente = computed<InputPannello>(() => ({
  stile: stile.value,
  larghezzaCm: misura(larghezzaCm.value, 10),
  altezzaCm: misura(altezzaCm.value, 10),
  passoOrizzontaleCm: passoOrizzontaleCm.value,
  passoVerticaleCm: passoVerticaleCm.value,
  quantita: intero(quantita.value, 1),
  conBordo: conBordo.value,
  distribuzione: distribuzione.value,
  nVertOverride: nVertOverride.value,
  nOrizOverride: nOrizOverride.value,
  tipoFinitura: tipoFinitura.value,
  finitura: finitura.value,
  modoPremium: modoPremium.value,
  passiUguali: passiUguali.value,
  nVertPremium: intero(nVertPremium.value, 1),
  nOrizPremium: intero(nOrizPremium.value, 1),
}));
/** I telai a video, normalizzati (un campo vuoto vale 1, non 0). */
const telai = computed(() => inputCorrente.value.quantita);

function applicaInput(i: InputPannello) {
  stile.value = i.stile;
  larghezzaCm.value = i.larghezzaCm;
  altezzaCm.value = i.altezzaCm;
  passoOrizzontaleCm.value = i.passoOrizzontaleCm;
  passoVerticaleCm.value = i.passoVerticaleCm;
  quantita.value = i.quantita;
  conBordo.value = i.conBordo;
  distribuzione.value = i.distribuzione;
  nVertOverride.value = i.nVertOverride;
  nOrizOverride.value = i.nOrizOverride;
  tipoFinitura.value = i.tipoFinitura;
  finitura.value = i.finitura;
  modoPremium.value = i.modoPremium;
  passiUguali.value = i.passiUguali;
  nVertPremium.value = i.nVertPremium;
  nOrizPremium.value = i.nOrizPremium;
}

// La commessa aperta e il codice (P1…) del pannello a video, se è suo: li imposta la
// barra commesse. Dichiarati prima del progetto, che ne dipende.
const commessaAperta = ref<CommessaGriglie | null>(null);
const codiceAttivo = ref<string | null>(null);
// Commessa in produzione: il pannello si legge dalla FOTOGRAFIA (quote e parametri congelati)
const congelatoVista = computed(() => {
  const c = commessaAperta.value, i = indiceDaCodice(codiceAttivo.value);
  const progettoCongelato = c?.stato === 'IN_PRODUZIONE' ? c.congelata?.progetti[i] : undefined;
  return c?.congelata && progettoCongelato && c.pannelli[i]
    ? { progetto: progettoCongelato, parametri: c.congelata.parametri, il: c.congelata.il, input: c.pannelli[i]!.input }
    : null;
});
const parametriScheda = computed<ParametriOfficina>(() => congelatoVista.value?.parametri ?? parametri.value);
// In produzione la commessa è bloccata: i controlli non si toccano (si sblocca dalla
// barra commesse) e a video c'è la fotografia, la stessa del PDF.
const bloccata = computed(() => commessaAperta.value?.stato === 'IN_PRODUZIONE');
watch(congelatoVista, (f) => { if (f) applicaInput(JSON.parse(JSON.stringify(f.input))); });

const config = computed<ConfigGriglia>(() => configDa(inputCorrente.value, parametri.value));

const progetto = computed(() => {
  if (congelatoVista.value) return congelatoVista.value.progetto;
  try {
    return calcolaProgetto(config.value);
  } catch {
    return null; // stile non ancora implementato
  }
});

// --- Picking: la distinta moltiplicata per i telai, impacchettata nelle barre commerciali
// I piani si calcolano in background (worker), a dati fermi: la pagina resta libera
// mentre si disegna. Sono gli stessi che poi usa il PDF, che quindi non li ricalcola.
// Piano ottimizzato sullo scarto solo sul bianco di serie (v. materialiDiTaglio).
const pannelloVista = computed(() => {
  const f = congelatoVista.value;
  if (f) return { codice: codiceAttivo.value!, progetto: f.progetto, finitura: f.input.finitura, telai: f.input.quantita };
  return progetto.value
    ? { codice: codiceAttivo.value ?? 'P1', progetto: progetto.value, finitura: finitura.value, telai: telai.value }
    : null;
});
const parametriTaglio = computed(() => {
  const p = parametriScheda.value;
  return { kerf: p.kerf, intestatura: p.intestatura, steccaInglesina: p.steccaInglesina };
});
const materialiVista = computed(() => (pannelloVista.value ? materialiDiTaglio([pannelloVista.value], parametriTaglio.value) : []));
const { piani, pronto: pianiPronti } = usePianiTaglio(() => materialiVista.value.flatMap((m) => (m.richiesta ? [m.richiesta] : [])));
const pianoDi = (profilo: MaterialeTaglio['profilo']) => {
  const r = materialiVista.value.find((m) => m.profilo === profilo)?.richiesta;
  return r ? piani.value.get(r.chiave) ?? null : null;
};
const pianoU = computed(() => pianoDi('U'));
const pianoBarre = computed(() => pianoDi('BARRA'));
// PREMIUM: cornice e interni sono la stessa inglesina, quindi un piano solo.
const pianoInglesina = computed(() => pianoDi('INGLESINA'));
// I piani standard da mostrare: profilo a U (se c'è il telaio) e barra 18×8
const pianiStandard = computed(() =>
  [{ nome: 'Profilo a U', p: pianoU.value }, { nome: 'Barra 18×8', p: pianoBarre.value }]
    .filter((x): x is { nome: string; p: NonNullable<typeof x.p> } => !!x.p && (x.p.passi.length > 0 || x.p.nonRicavabili.length > 0)));

const imballaggio = computed(() =>
  progetto.value
    ? calcolaImballaggio(progetto.value, isPremium.value ? kgMInglesina(parametriScheda.value) : parametriScheda.value.pesoBarraKgM)
    : null
);

// --- Finiture: le prendiamo dal listino POPS, non le reinventiamo ------------
// Nel listino il tipo NON si chiama "VERNICIATO": i gruppi veri sono
// COLORE STANDARD / COLORE PERSONALIZZATO / RIVESTITA. La corrispondenza sta in
// finiture.ts, così se domani il listino cambia nomenclatura si tocca un punto solo.
const finitureDisponibili = computed(() => {
  const trovate = new Map<string, string>(); // finitura → gruppo
  const albero: any = catalog.listino || {};
  for (const cat of Object.values(albero)) {
    for (const mod of Object.values(cat as any)) {
      for (const dim of Object.values(mod as any)) {
        for (const [fin, v] of Object.entries(dim as any)) {
          const gruppo = String((v as any)?.group || '').trim().toUpperCase();
          if (gruppo) trovate.set(fin, gruppo);
        }
      }
    }
  }
  return [...trovate.entries()]
    .filter(([, g]) => appartiene(g, tipoFinitura.value))
    .map(([f]) => f)
    .sort();
});
// Il bianco di serie (RAL 9010) è il predefinito: si mette da solo appena il
// listino è carico, e ogni volta che si torna al verniciato senza un colore scelto.
watch(finitureDisponibili, (lista) => {
  if (finitura.value) return;
  const bianco = lista.find((f) => eBiancoDiSerie(f));
  if (bianco) finitura.value = bianco;
}, { immediate: true });

// −/+ accanto ai campi numerici: le variazioni di fino senza tastiera.
const campiNumerici = { larghezzaCm: { r: larghezzaCm, passo: 0.5, min: 10 }, altezzaCm: { r: altezzaCm, passo: 0.5, min: 10 }, quantita: { r: quantita, passo: 1, min: 1 } };
function incrementa(campo: keyof typeof campiNumerici, verso: 1 | -1) {
  const c = campiNumerici[campo];
  const v = misura(c.r.value, c.min) + verso * c.passo;
  c.r.value = Math.max(c.min, c.passo === 1 ? Math.round(v) : Math.round(v * 10) / 10);
}

// --- Fori: due letture dello stesso dato ------------------------------------
const foriEstesi = ref(false);

// --- Aggancio anteprima ↔ distinta -----------------------------------------
// Ogni barra disegnata porta con sé l'etichetta del suo tipo, quindi l'hover su
// una riga di distinta accende esattamente i pezzi di quella riga — su Londra
// come sui rombi, dove un tipo raccoglie barre di entrambe le famiglie.
const evidenzia = ref<string | null>(null);

// Clic su un pezzo (nell'anteprima o in distinta): resta SELEZIONATO, accende
// tutti i pezzi uguali e apre la sua scheda. L'hover, quando c'è, ha la precedenza.
const selezionato = ref<string | null>(null);
const evidenziaEffettiva = computed(() => evidenzia.value ?? selezionato.value);
const seleziona = (tipo: string | null) => {
  selezionato.value = tipo && tipo !== selezionato.value ? tipo : null;
};
// Se il pezzo selezionato sparisce (cambio stile, misure, numero di elementi), la scheda si chiude.
watch(progetto, (p) => {
  const tipi = p ? [...p.barre, ...p.bordi].map((b) => b.etichetta) : [];
  if (selezionato.value && !tipi.includes(selezionato.value)) selezionato.value = null;
});

// Anteprima a tutta finestra. Esc chiude prima il popup dei parametri, poi la scheda,
// poi lo schermo intero.
const schermoIntero = ref(false);
const suTasto = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return;
  if (parametriAperti.value) parametriAperti.value = false;
  else if (selezionato.value) selezionato.value = null;
  else schermoIntero.value = false;
};
onMounted(() => window.addEventListener('keydown', suTasto));
onBeforeUnmount(() => window.removeEventListener('keydown', suTasto));

// --- Formattazione ----------------------------------------------------------
const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mm = (v: number) => `${nf.format(v)} mm`;
const m = (v: number) => `${nf2.format(v / 1000)} m`;
const kg = (v: number) => `${nf2.format(v)} kg`;
</script>

<template>
  <div class="min-h-screen bg-gray-50/90 p-6 font-sans text-gray-700">
   <div class="max-w-7xl mx-auto">

    <!-- Testata: la stessa delle altre pagine POPS -->
    <div class="mb-8">
      <p class="text-lg font-medium text-gray-800 leading-none">Inglesina Italiana Srl</p>
      <div class="relative inline-block">
        <h1 class="relative z-10 text-6xl font-bold font-heading text-gray-900">Configuratore SUA</h1>
        <div class="absolute bottom-2 left-0 w-full h-8 bg-amber-400 rounded-sm -z-0 animate-marker"></div>
      </div>
    </div>

    <!-- Commessa: più pannelli diversi nello stesso ordine; il PDF di produzione si fa da qui -->
    <CommessaBar
      :input-corrente="inputCorrente" :parametri="parametri"
      @carica="applicaInput"
      @aperta="(c) => (commessaAperta = c)"
      @pannello="(c) => (codiceAttivo = c)"
    />

    <!-- Pannello e anteprima affiancati, alti uguali -->
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- ══════════ PANNELLO (a sinistra dell'anteprima) ══════════ -->
      <div class="lg:col-span-4 xl:col-span-3 bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
        <div class="flex justify-between items-center border-b pb-2 mb-4">
          <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800">Pannello</h2>
          <button
            @click="parametriAperti = true"
            class="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 transition-colors"
            title="Parametri d'officina"
          >
            <Cog6ToothIcon class="h-4 w-4" />
          </button>
        </div>

        <!-- In produzione i controlli sono bloccati: si sblocca dalla barra commesse -->
        <fieldset :disabled="bloccata" class="space-y-4 min-w-0" :class="{ 'opacity-60': bloccata }">

          <!-- Stile -->
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-2">Stile</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                v-for="s in (['LONDRA', 'MILANO', 'VENEZIA', 'PREMIUM'] as Stile[])" :key="s"
                @click="stile = s; azzeraRitocchi()"
                class="py-2 rounded-lg text-[11px] font-bold border transition-all"
                :class="stile === s
                  ? 'bg-amber-400 border-amber-400 text-amber-950 shadow-md'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-amber-300'"
              >{{ s }}</button>
            </div>
            <p class="text-[10px] text-gray-400 mt-1.5 italic leading-snug">
              <template v-if="stile === 'LONDRA'">Griglia ortogonale: celle quadrate o rettangolari.</template>
              <template v-else-if="stile === 'MILANO'">Rombi quadrati: barre a 45°.</template>
              <template v-else-if="stile === 'VENEZIA'">Rombi con l'asse verticale doppio: barre a circa 63°.</template>
              <template v-else>
                Solo inglesina da 26. Cornice della stessa inglesina a 45°, interni incastrati
                (sormonto) anche sulla cornice, luci sempre uguali.
              </template>
            </p>
          </div>

          <!-- Bordo perimetrale. Il PREMIUM ha sempre la cornice. -->
          <button v-if="!isPremium"
            type="button" role="switch" :aria-checked="conBordo"
            @click="conBordo = !conBordo"
            class="w-full flex items-center justify-between gap-3 text-left"
            :title="conBordo ? 'Profilo a U su tutti e quattro i lati; le barre entrano nel canale.' : 'Nessun telaio: le barre valgono l\'ingombro pieno e restano a vista.'"
          >
            <span class="text-[10px] font-bold text-gray-500 uppercase">
              Bordo perimetrale
              <span class="block font-normal normal-case text-gray-400 italic">{{ conBordo ? 'Con telaio (profilo a U)' : 'Griglia nuda' }}</span>
            </span>
            <span class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors" :class="conBordo ? 'bg-amber-400' : 'bg-gray-300'">
              <span class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform" :class="conBordo ? 'translate-x-5' : 'translate-x-0'"></span>
            </span>
          </button>

          <!-- Misure: ingombro esterno (cornice o telaio compresi), o della griglia nuda -->
          <div class="flex gap-3">
            <div v-for="c in ([{ k: 'larghezzaCm' as const, nome: 'Larghezza' }, { k: 'altezzaCm' as const, nome: 'Altezza' }])" :key="c.k">
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">{{ c.nome }} (cm)</label>
              <div class="flex items-center gap-1">
                <button @click="incrementa(c.k, -1)"
                  class="h-8 w-7 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold">−</button>
                <input v-if="c.k === 'larghezzaCm'" v-model.number="larghezzaCm" type="number" min="10" step="0.5"
                  class="w-16 p-1.5 border border-gray-200 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none" />
                <input v-else v-model.number="altezzaCm" type="number" min="10" step="0.5"
                  class="w-16 p-1.5 border border-gray-200 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none" />
                <button @click="incrementa(c.k, +1)"
                  class="h-8 w-7 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold">+</button>
              </div>
            </div>
          </div>

          <!-- Distribuzione: solo su LONDRA. Sui rombi le barre non corrono
               parallele al bordo, quindi il "vuoto contro il bordo" non esiste;
               il PREMIUM ha le luci sempre uguali. -->
          <div v-if="!aRombi && !isPremium">
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-2">Distribuzione</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                @click="distribuzione = 'PASSO_FISSO'; azzeraRitocchi()"
                class="py-2 rounded-lg text-[11px] font-bold border transition-all"
                :class="distribuzione === 'PASSO_FISSO'
                  ? 'bg-gray-900 border-gray-900 text-white shadow-md'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'"
              >PASSO FISSO</button>
              <button
                @click="distribuzione = 'SPAZI_UGUALI'; azzeraRitocchi()"
                class="py-2 rounded-lg text-[11px] font-bold border transition-all"
                :class="distribuzione === 'SPAZI_UGUALI'
                  ? 'bg-gray-900 border-gray-900 text-white shadow-md'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'"
              >SPAZI UGUALI</button>
            </div>
            <p class="text-[10px] text-gray-400 mt-1.5 italic leading-snug">
              <template v-if="distribuzione === 'PASSO_FISSO'">
                L'interasse è rispettato esattamente; il vuoto contro il bordo è quello che avanza.
                Per pannelli affiancati che devono continuarsi.
              </template>
              <template v-else>
                Tutti i vuoti identici, quello contro il bordo compreso. L'interasse diventa
                una conseguenza: il cursore è un valore desiderato.
              </template>
            </p>
          </div>

          <!-- PREMIUM: per passo o per numero, e l'altra grandezza si adatta -->
          <div v-if="isPremium && progetto" class="space-y-3">
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-2">Griglia</label>
              <div class="grid grid-cols-2 gap-2">
                <button
                  v-for="m in ([{ k: 'PASSO' as const, l: 'PER PASSO' }, { k: 'NUMERO' as const, l: 'PER NUMERO' }])" :key="m.k"
                  @click="scegliModoPremium(m.k)"
                  class="py-2 rounded-lg text-[11px] font-bold border transition-all"
                  :class="modoPremium === m.k
                    ? 'bg-gray-900 border-gray-900 text-white shadow-md'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'"
                >{{ m.l }}</button>
              </div>
            </div>

            <template v-if="modoPremium === 'PASSO'">
              <!-- Interruttore: acceso = un passo solo per i due versi -->
              <button
                type="button" role="switch" :aria-checked="passiUguali"
                @click="scegliPassiUguali(!passiUguali)"
                class="w-full flex items-center justify-between gap-3 text-left"
              >
                <span class="text-[10px] font-bold text-gray-500 uppercase">
                  Passo uguale nei due versi
                  <span class="block text-[10px] font-normal normal-case text-gray-400 italic">
                    {{ passiUguali ? 'Uguale: un solo passo per verticali e orizzontali.' : 'Libero: un passo per verso.' }}
                  </span>
                </span>
                <span
                  class="relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors"
                  :class="passiUguali ? 'bg-amber-400' : 'bg-gray-300'"
                >
                  <span
                    class="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                    :class="passiUguali ? 'translate-x-5' : 'translate-x-0'"
                  ></span>
                </span>
              </button>

              <div v-for="c in (passiUguali
                  ? [{ k: 'x', nome: 'Passo', modello: 'o' }]
                  : [{ k: 'x', nome: 'Passo fra i verticali', modello: 'o' }, { k: 'y', nome: 'Passo fra gli orizzontali', modello: 'v' }])"
                :key="c.k"
              >
                <div class="flex justify-between items-baseline mb-1">
                  <label class="text-[10px] font-bold text-gray-500 uppercase">
                    {{ c.nome }} <span class="text-gray-300 normal-case">(desiderato)</span>
                  </label>
                  <span class="text-sm font-bold text-amber-600 tabular-nums">
                    {{ nf.format(c.modello === 'o' ? passoOrizzontaleCm : passoVerticaleCm) }} cm
                  </span>
                </div>
                <input v-if="c.modello === 'o'" v-model.number="passoOrizzontaleCm" type="range" min="4" max="60" step="0.5" class="w-full accent-amber-400" />
                <input v-else v-model.number="passoVerticaleCm" type="range" min="4" max="60" step="0.5" class="w-full accent-amber-400" />
              </div>
            </template>

            <template v-else>
              <div class="grid grid-cols-2 gap-3">
                <div v-for="c in ([{ k: 'v' as const, nome: 'Verticali' }, { k: 'o' as const, nome: 'Orizzontali' }])" :key="c.k">
                  <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">{{ c.nome }}</label>
                  <div class="flex items-center gap-1">
                    <button @click="cambiaNumero(c.k, -1)"
                      class="h-9 w-8 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold">−</button>
                    <input v-if="c.k === 'v'" v-model.number="nVertPremium" type="number" min="1" step="1"
                      class="w-full min-w-0 p-2 border border-gray-200 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none" />
                    <input v-else v-model.number="nOrizPremium" type="number" min="1" step="1"
                      class="w-full min-w-0 p-2 border border-gray-200 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none" />
                    <button @click="cambiaNumero(c.k, +1)"
                      class="h-9 w-8 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold">+</button>
                  </div>
                </div>
              </div>
            </template>

            <!-- L'altra grandezza: sempre quella REALE del pannello -->
            <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
              <p class="text-[10px] font-bold uppercase text-gray-500">Risultato</p>
              <div v-for="r in [
                  { nome: 'Verticali', n: progetto.assiVerticali.length, chiesti: inputCorrente.nVertPremium, passo: progetto.passoEffettivoX, vuoto: progetto.vuotoX },
                  { nome: 'Orizzontali', n: progetto.assiOrizzontali.length, chiesti: inputCorrente.nOrizPremium, passo: progetto.passoEffettivoY, vuoto: progetto.vuotoY },
                ]" :key="r.nome"
                class="flex justify-between items-baseline text-[11px] gap-2"
              >
                <span class="text-gray-700 font-bold">
                  {{ r.n }} {{ r.nome.toLowerCase() }}
                  <span v-if="modoPremium === 'NUMERO' && r.n !== r.chiesti" class="text-amber-600 font-bold">
                    (massimo che entra)
                  </span>
                </span>
                <span class="text-gray-500 tabular-nums">
                  interasse {{ nf.format(r.passo / 10) }} cm · luce {{ nf.format(r.vuoto / 10) }} cm
                </span>
              </div>
              <p class="text-[10px] text-gray-400 italic pt-1 border-t border-gray-200">
                Luci sempre uguali: l'interasse esce raramente tondo.
                <template v-if="modoPremium === 'PASSO'">Il passo chiesto sceglie quanti elementi ci stanno più vicino.</template>
              </p>
            </div>
          </div>

          <!-- Passi -->
          <div v-if="!isPremium">
            <div class="flex justify-between items-baseline mb-1">
              <label class="text-[10px] font-bold text-gray-500 uppercase">
                {{ aRombi ? 'Larghezza del rombo' : 'Passo orizzontale' }}
                <span v-if="!aRombi && vuotiUguali" class="text-gray-300 normal-case">(desiderato)</span>
              </label>
              <span class="text-sm font-bold text-amber-600 tabular-nums">{{ nf.format(passoOrizzontaleCm) }} cm</span>
            </div>
            <input v-model.number="passoOrizzontaleCm" type="range" min="2" max="50" step="0.5"
              @input="azzeraRitocchi()" class="w-full accent-amber-400" />
            <p class="text-[10px] text-gray-400 italic">
              <template v-if="stile === 'MILANO'">Diagonale del rombo: essendo quadrato, vale in entrambi i versi.</template>
              <template v-else-if="stile === 'VENEZIA'">Diagonale orizzontale; quella verticale è il doppio.</template>
              <template v-else>Interasse fra le barre verticali.</template>
            </p>
          </div>

          <div v-if="!aRombi && !isPremium">
            <div class="flex justify-between items-baseline mb-1">
              <label class="text-[10px] font-bold text-gray-500 uppercase">
                Passo verticale
                <span v-if="vuotiUguali && !passoVerticaleBloccato" class="text-gray-300 normal-case">(desiderato)</span>
              </label>
              <span class="text-sm font-bold tabular-nums" :class="passoVerticaleBloccato ? 'text-gray-400' : 'text-amber-600'">
                {{ nf.format(passoVerticaleEffettivo) }} cm
              </span>
            </div>
            <input v-model.number="passoVerticaleCm" type="range" min="2" max="50" step="0.5"
              :disabled="passoVerticaleBloccato" @input="azzeraRitocchi()"
              class="w-full accent-amber-400 disabled:opacity-40" />
            <p class="text-[10px] text-gray-400 italic">
              <template v-if="passoVerticaleBloccato">Derivato dallo stile: non è libero.</template>
              <template v-else>Interasse fra le barre orizzontali.</template>
            </p>
          </div>

          <!-- Il risultato reale: in SPAZI_UGUALI non coincide col cursore -->
          <div v-if="progetto && !aRombi && !isPremium" class="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
            <p class="text-[10px] font-bold uppercase text-gray-500">Risultato</p>

            <div v-for="asse in ([
                { k: 'v' as const, nome: 'Barre verticali', n: progetto.assiVerticali.length, passo: progetto.passoEffettivoX, vuoto: progetto.vuotoX },
                { k: 'o' as const, nome: 'Barre orizzontali', n: progetto.assiOrizzontali.length, passo: progetto.passoEffettivoY, vuoto: progetto.vuotoY },
              ])" :key="asse.k"
              class="flex items-center justify-between gap-2"
            >
              <div class="min-w-0">
                <p class="text-[11px] font-bold text-gray-700">{{ asse.nome }}</p>
                <p class="text-[10px] text-gray-500 tabular-nums">
                  interasse {{ nf.format(asse.passo / 10) }} cm · vuoto {{ nf.format(asse.vuoto / 10) }} cm
                </p>
              </div>
              <div class="flex items-center gap-1 shrink-0">
                <button v-if="vuotiUguali" @click="ritocca(asse.k, -1)"
                  class="h-6 w-6 rounded border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold leading-none">−</button>
                <span class="w-7 text-center font-bold text-sm tabular-nums">{{ asse.n }}</span>
                <button v-if="vuotiUguali" @click="ritocca(asse.k, +1)"
                  class="h-6 w-6 rounded border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold leading-none">+</button>
              </div>
            </div>

            <p v-if="vuotiUguali" class="text-[10px] text-gray-400 italic pt-1 border-t border-gray-200">
              L'interasse non sarà quasi mai tondo: è il prezzo dei vuoti tutti uguali.
              I fori si tracciano al millimetro comunque.
            </p>
          </div>

          <!-- Finitura: famiglia e colore su una riga -->
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Finitura</label>
            <div class="flex items-center gap-2">
              <div class="flex shrink-0 rounded-lg border border-gray-200 overflow-hidden">
                <button
                  v-for="t in ([{ k: 'VERNICIATO' as const, l: 'VERN.' }, { k: 'RIVESTITO' as const, l: 'RIV.' }])" :key="t.k"
                  @click="if (tipoFinitura !== t.k) { tipoFinitura = t.k; finitura = ''; }"
                  :title="t.k === 'VERNICIATO' ? 'Verniciato: colore standard e personalizzato del listino' : 'Rivestito: effetto legno del listino'"
                  class="px-2 py-1.5 text-[10px] font-bold transition-colors"
                  :class="tipoFinitura === t.k ? 'bg-gray-900 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'"
                >{{ t.l }}</button>
              </div>
              <span
                class="h-8 w-8 shrink-0 rounded-lg border border-gray-300 shadow-inner"
                :style="{ backgroundColor: coloreFinitura(finitura) }"
                :title="finitura || 'Nessuna finitura'"
              ></span>
              <select v-model="finitura" :disabled="!finitureDisponibili.length"
                class="flex-1 min-w-0 p-1.5 border border-gray-200 rounded-lg bg-white text-sm disabled:opacity-50">
                <option value="" disabled>
                  {{ catalog.loading ? 'Caricamento listino…' : (finitureDisponibili.length ? 'Seleziona finitura' : 'Nessuna finitura disponibile') }}
                </option>
                <option v-for="f in finitureDisponibili" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>
            <p v-if="progetto?.premium" class="text-[10px] text-gray-400 mt-1 italic">
              Sormonto {{ progetto.premium.sormonto }} mm ({{ nf.format(progetto.premium.sormontoPerLato) }} per lato).
            </p>
          </div>

          <!-- Quantità: telai identici -->
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Quantità</label>
            <div class="flex items-center gap-1">
              <button @click="incrementa('quantita', -1)"
                class="h-8 w-7 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold">−</button>
              <input v-model.number="quantita" type="number" min="1" step="1"
                class="w-14 p-1.5 border border-gray-200 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none" />
              <button @click="incrementa('quantita', +1)"
                class="h-8 w-7 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold">+</button>
            </div>
          </div>
        </fieldset>
      </div>

      <!-- Parametri d'officina: popup dall'ingranaggio del pannello -->
      <Teleport to="body">
        <div v-if="parametriAperti" class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" @click.self="parametriAperti = false">
          <div class="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl shadow-2xl" role="dialog" aria-modal="true" aria-label="Parametri d'officina">
            <div class="sticky top-0 bg-white flex justify-between items-center px-5 py-4 border-b border-gray-100">
              <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800">Parametri d'officina</h2>
              <button @click="parametriAperti = false" class="p-1 rounded-lg text-gray-400 hover:text-gray-700" title="Chiudi (Esc)">
                <XMarkIcon class="h-5 w-5" />
              </button>
            </div>
            <fieldset :disabled="bloccata" class="p-5 space-y-4 min-w-0">
                <p v-if="bloccata" class="text-[11px] text-amber-700 font-bold">
                  Commessa in produzione: valgono i parametri fotografati al congelamento.
                </p>
                <div v-if="!isPremium">
                  <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Gioco d'infilaggio (mm/lato)</label>
                  <input v-model.number="gioco" type="number" min="0" step="0.5"
                    class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  <p class="text-[10px] text-gray-400 italic mt-0.5">Quanto la barra resta corta rispetto al fondo del canale.</p>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Spessore lama (mm)</label>
                  <input v-model.number="kerf" type="number" min="0" step="0.5"
                    class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  <p class="text-[10px] text-gray-400 italic mt-0.5">Ogni taglio se lo mangia: entra nel calcolo dello sfrido.</p>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Intestatura barra nuova (mm)</label>
                  <input v-model.number="intestatura" type="number" min="0" step="1"
                    class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  <p class="text-[10px] text-gray-400 italic mt-0.5">Rifilo in testa prima del primo pezzo. Gli spezzoni non lo rifanno.</p>
                </div>
                <div>
                  <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">{{ isPremium ? 'Luce minima (mm)' : 'Margine minimo dal telaio (mm)' }}</label>
                  <input v-model.number="margineMinimo" type="number" min="0" step="1"
                    class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                </div>
                <div v-if="aRombi">
                  <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Lunghezza minima barra (mm)</label>
                  <input v-model.number="lunghezzaMinima" type="number" min="0" step="10"
                    class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  <p class="text-[10px] text-gray-400 italic mt-0.5">
                    Sotto questa, le barrette d'angolo si omettono. Quelle senza nessun incrocio
                    vengono scartate comunque: non avrebbero nulla che le tenga.
                  </p>
                </div>
                <template v-if="isPremium">
                  <div>
                    <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Barra inglesina 26 (mm)</label>
                    <input v-model.number="steccaInglesina" type="number" min="0" step="100" placeholder="da definire"
                      class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                    <p class="text-[10px] text-gray-400 italic mt-0.5">Di serie {{ m(INGLESINA_26.stecca) }}. Serve al piano di taglio.</p>
                  </div>
                  <div>
                    <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Peso di una barra (g)</label>
                    <input v-model.number="pesoSteccaInglesinaG" type="number" min="0" step="1" placeholder="da definire"
                      class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                    <p class="text-[10px] text-gray-400 italic mt-0.5">
                      Di serie {{ nf.format(INGLESINA_26.pesoSteccaKg * 1000) }} g
                      <template v-if="pesoInglesinaKgM !== null">· {{ nf.format(pesoInglesinaKgM * 1000) }} g/m</template>
                    </p>
                  </div>
                </template>
                <div v-else>
                  <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Peso barra 18×8 (kg/m)</label>
                  <input v-model.number="pesoBarraKgM" type="number" min="0" step="0.001" placeholder="da definire"
                    class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
                  <p class="text-[10px] text-gray-400 italic mt-0.5">
                    Di serie {{ nf2.format(BARRA.pesoKgM) }} kg/m (profilo cavo). Svuotando il campo,
                    il peso totale non viene calcolato invece di essere inventato.
                  </p>
                </div>

                <div v-if="isPremium" class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] text-gray-500 space-y-0.5">
                  <p class="font-bold text-gray-700 uppercase text-[10px] mb-1">Materiali (fissi)</p>
                  <p>Inglesina {{ INGLESINA_26.larghezza }}×{{ INGLESINA_26.spessore }} per cornice e interni</p>
                  <p>Giunzione interna e a L {{ nf.format(MINUTERIA_PREMIUM.giunzionePesoKg * 1000) }} g · perno tondo {{ nf.format(MINUTERIA_PREMIUM.pernoPesoKg * 1000) }} g</p>
                  <p>Sormonto {{ INGLESINA_26.sormonto.VERNICIATO }} verniciata · {{ INGLESINA_26.sormonto.RIVESTITO }} rivestita</p>
                </div>
                <div v-else class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] text-gray-500 space-y-0.5">
                  <p class="font-bold text-gray-700 uppercase text-[10px] mb-1">Materiali (fissi)</p>
                  <p>Profilo a U {{ PROFILO_U.lato }}×{{ PROFILO_U.lato }}×{{ nf.format(PROFILO_U.spessore) }} · barre da {{ m(PROFILO_U.stecca) }} · {{ nf2.format(PROFILO_U.pesoKgM) }} kg/m</p>
                  <p>Barra {{ BARRA.larghezza }}×{{ BARRA.spessore }} · barre da {{ m(BARRA.stecca) }} · {{ nf2.format(BARRA.pesoKgM) }} kg/m</p>
                  <p>Canale interno {{ mm(CANALE_INTERNO) }} · profondità {{ mm(PROFONDITA_CANALE) }}</p>
                  <p class="italic pt-1">Due barre sovrapposte fanno {{ BARRA.spessore * 2 }} mm: il canale da {{ CANALE_INTERNO }} le riceve con 1 mm di gioco.</p>
                </div>
            </fieldset>
          </div>
        </div>
      </Teleport>

      <!-- ══════════ ANTEPRIMA ══════════ -->
      <div class="lg:col-span-8 xl:col-span-9">

        <!-- Anteprima -->
        <div
          class="p-5 flex flex-col"
          :class="schermoIntero
            ? 'fixed inset-0 z-50 bg-gray-50'
            : 'h-full bg-white/60 backdrop-blur-sm rounded-xl shadow-lg border border-white/80'"
        >
          <div class="flex justify-between items-center gap-3 mb-3">
            <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800">Anteprima</h2>
            <div class="flex items-center gap-3 min-w-0">
              <span v-if="progetto" class="text-[11px] text-gray-400 tabular-nums truncate">
                luce {{ mm(progetto.luceX) }} × {{ mm(progetto.luceY) }} ·
                margini {{ mm(progetto.margineX) }} / {{ mm(progetto.margineY) }}
              </span>
              <button
                @click="schermoIntero = !schermoIntero"
                class="p-1.5 shrink-0 rounded-lg border border-gray-200 bg-white text-gray-500 hover:text-amber-600 hover:border-amber-300 transition-colors"
                :title="schermoIntero ? 'Esci dallo schermo intero (Esc)' : 'Schermo intero'"
              >
                <ArrowsPointingInIcon v-if="schermoIntero" class="h-4 w-4" />
                <ArrowsPointingOutIcon v-else class="h-4 w-4" />
              </button>
            </div>
          </div>
          <!-- Il disegno prende l'altezza che resta (quella della card Pannello accanto):
               sta in assoluto, così non è lui a spingere l'altezza della card. -->
          <div class="relative flex-1" :class="schermoIntero ? 'min-h-0' : 'min-h-[30rem]'">
            <div class="absolute inset-0 flex items-center justify-center">
            <GrigliaPreview
              v-if="progetto" :progetto="progetto" :finitura="finitura" :evidenzia="evidenziaEffettiva"
              @seleziona="seleziona"
            />
            <!-- La scheda del pezzo selezionato, sopra il disegno -->
            <SchedaPezzo
              v-if="progetto && selezionato"
              :progetto="progetto" :tipo="selezionato" :telai="telai"
              class="absolute top-0 right-0 w-72 max-w-full max-h-full overflow-y-auto"
              @chiudi="selezionato = null"
            />
            </div>
          </div>
          <p v-if="progetto" class="text-[10px] text-gray-400 italic mt-2">
            Clic su un pezzo per la sua scheda: si accendono tutti i pezzi uguali.
          </p>
        </div>

      </div>
    </div>

    <!-- ══════════ DISTINTE ══════════ -->
    <div class="mt-6 pb-24 space-y-6">

      <!-- Avvisi: SOTTO l'anteprima, non sopra. Alcuni compaiono sempre (la nota
           sul taglio a 90°), e stando in testa spostavano il riquadro a ogni
           cambio di stile. -->
      <div v-if="progetto?.avvisi.length" class="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-1.5">
        <div v-for="a in progetto.avvisi" :key="a" class="flex gap-2.5 text-sm text-amber-900">
          <ExclamationTriangleIcon class="h-5 w-5 text-amber-500 shrink-0" />
          <span>{{ a }}</span>
        </div>
      </div>

      <div v-if="progetto" class="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <!-- Telaio -->
        <div v-if="progetto.bordi.length" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
          <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-3">
            Telaio
          </h2>
          <table class="w-full text-sm">
            <thead class="text-[10px] uppercase text-gray-400 font-bold">
              <tr>
                <th class="text-left pb-1.5">Pezzo</th>
                <th class="text-right pb-1.5">Lunghezza</th>
                <th class="text-center pb-1.5">Taglio</th>
                <th class="text-right pb-1.5">Q.tà</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <!-- Sul PREMIUM la cornice è fatta di pezzi veri: l'hover li accende
                   nell'anteprima come per gli interni. -->
              <tr
                v-for="b in progetto.bordi" :key="b.etichetta"
                @mouseenter="isPremium && (evidenzia = b.etichetta)"
                @mouseleave="evidenzia = null"
                @click="seleziona(b.etichetta)"
                class="cursor-pointer"
                :class="[
                  isPremium ? 'hover:bg-amber-50/60 transition-colors' : '',
                  selezionato === b.etichetta ? 'bg-amber-50' : '',
                ]"
              >
                <td class="py-2 text-gray-700 text-xs">{{ b.etichetta }}</td>
                <td class="py-2 text-right font-bold tabular-nums">{{ mm(b.lunghezza) }}</td>
                <td class="py-2 text-center text-[11px] text-gray-500">{{ b.taglio }}</td>
                <td class="py-2 text-right font-bold tabular-nums">
                  {{ b.quantitaPerTelaio * telai }}
                  <span v-if="telai > 1" class="text-[10px] text-gray-400 font-normal">({{ b.quantitaPerTelaio }}×{{ telai }})</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Barre -->
        <div class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
          <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-3">
            Griglia
          </h2>
          <table class="w-full text-sm">
            <thead class="text-[10px] uppercase text-gray-400 font-bold">
              <tr>
                <th class="text-left pb-1.5">Pezzo</th>
                <th class="text-right pb-1.5">Lunghezza</th>
                <th class="text-center pb-1.5">{{ isPremium ? 'Lavorazione' : 'Foratura' }}</th>
                <th class="text-right pb-1.5">Q.tà</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              <tr
                v-for="b in progetto.barre" :key="b.etichetta"
                @mouseenter="evidenzia = b.etichetta"
                @mouseleave="evidenzia = null"
                @click="seleziona(b.etichetta)"
                class="hover:bg-amber-50/60 transition-colors cursor-pointer"
                :class="{ 'bg-amber-50': selezionato === b.etichetta }"
              >
                <td class="py-2 text-gray-700 text-xs">{{ b.etichetta }}</td>
                <td class="py-2 text-right font-bold tabular-nums">{{ mm(b.lunghezza) }}</td>
                <td class="py-2 text-center">
                  <!-- I pezzi si tagliano identici: cambia solo come si forano.
                       Sui rombi la ripartizione è sempre esattamente a metà. -->
                  <div v-if="isPremium" class="flex gap-1 justify-center flex-wrap">
                    <span
                      v-if="b.etichetta === PEZZO.VERTICALE"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200"
                      title="Scasso alla pressetta: quote nella sezione Scasso"
                    >scasso</span>
                    <span
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-600 border-slate-200"
                      title="Fresatura dopo lo scasso, prima del montaggio: non cambia le misure"
                    >fresatura</span>
                  </div>
                  <div v-else class="flex gap-1 justify-center flex-wrap">
                    <span
                      v-if="b.quantitaCieca"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-purple-50 text-purple-700 border-purple-200"
                      title="Una parete sola, sul lato di contatto: la faccia esterna resta intera"
                    >{{ b.quantitaCieca * telai }} cieca</span>
                    <span
                      v-if="b.quantitaPassante"
                      class="px-1.5 py-0.5 rounded text-[10px] font-bold border bg-slate-100 text-slate-600 border-slate-200"
                      title="Due pareti: il rivetto la attraversa, e su di essa appoggia la testa"
                    >{{ b.quantitaPassante * telai }} passante</span>
                    <span v-if="!b.nFori" class="text-[10px] text-gray-300">nessun foro</span>
                  </div>
                </td>
                <td class="py-2 text-right font-bold tabular-nums">
                  {{ b.quantitaPerTelaio * telai }}
                  <span v-if="telai > 1" class="text-[10px] text-gray-400 font-normal">({{ b.quantitaPerTelaio }}×{{ telai }})</span>
                </td>
              </tr>
            </tbody>
          </table>
          <p v-if="!isPremium" class="text-[11px] text-gray-500 mt-3 leading-snug">
            I pezzi si <b>tagliano identici</b>: cambia solo la foratura.
            Quelli a <b>foro cieco</b> stanno nello strato a vista e vanno montati con la
            <b>faccia forata verso l'interno</b> — girati, il foro finisce a vista.
          </p>
        </div>
      </div>

      <!-- PREMIUM: scasso dei verticali e fori della cornice -->
      <div v-if="progetto?.premium && progetto.barre.length" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
        <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-4">Scasso e foratura cornice</h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            class="border border-gray-200 rounded-xl p-4 bg-white"
            @mouseenter="evidenzia = PEZZO.VERTICALE" @mouseleave="evidenzia = null"
          >
            <div class="flex justify-between items-baseline mb-3">
              <h3 class="font-bold text-sm text-gray-900">Scasso verticali</h3>
              <span class="text-[11px] text-gray-400 tabular-nums">{{ progetto.premium.scasso.nScassi }} scassi</span>
            </div>
            <p class="text-2xl font-bold font-heading text-gray-900 tabular-nums">{{ progetto.premium.scasso.etichetta }}</p>
            <div class="flex flex-wrap gap-1.5 mt-3">
              <span
                v-for="(a, i) in progetto.premium.scasso.assi" :key="i"
                class="px-2 py-1 rounded bg-gray-100 text-gray-500 text-[11px] font-bold tabular-nums"
                title="Asse dell'orizzontale, dalla testa del verticale: dove deve cadere lo scasso"
              >{{ nf.format(a) }}</span>
            </div>
          </div>

          <div class="border border-gray-200 rounded-xl p-4 bg-white">
            <h3 class="font-bold text-sm text-gray-900 mb-3">Fori cornice</h3>
            <dl class="text-sm space-y-2">
              <div
                v-for="b in progetto.bordi" :key="b.etichetta"
                @mouseenter="evidenzia = b.etichetta" @mouseleave="evidenzia = null"
              >
                <dt class="text-gray-500 text-xs">{{ b.etichetta }} · {{ mm(b.lunghezza) }}</dt>
                <dd class="flex flex-wrap gap-1.5 mt-1">
                  <span
                    v-for="(f, i) in b.fori" :key="i"
                    class="px-2 py-1 rounded bg-gray-100 text-gray-700 text-[11px] font-bold tabular-nums"
                  >{{ nf.format(f) }}</span>
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      <!-- Fori -->
      <div v-if="progetto?.barre.length && !isPremium" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
        <div class="flex justify-between items-center border-b pb-2 mb-4">
          <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800">Foratura</h2>
          <button
            @click="foriEstesi = !foriEstesi"
            class="text-[10px] font-bold uppercase px-3 py-1.5 rounded-full border transition-colors"
            :class="foriEstesi ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'"
          >
            {{ foriEstesi ? 'Tutte le posizioni' : 'Primo foro + interasse' }}
          </button>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            v-for="b in progetto.barre" :key="b.etichetta"
            @mouseenter="evidenzia = b.etichetta"
            @mouseleave="evidenzia = null"
            class="border border-gray-200 rounded-xl p-4 bg-white"
          >
            <div class="flex justify-between items-baseline mb-3">
              <h3 class="font-bold text-sm text-gray-900">{{ b.etichetta }}</h3>
              <span class="text-[11px] text-gray-400 tabular-nums">{{ mm(b.lunghezza) }} · {{ b.nFori }} fori</span>
            </div>

            <dl v-if="!foriEstesi" class="text-sm space-y-1.5">
              <div class="flex justify-between">
                <dt class="text-gray-500">Primo foro (dalla testa)</dt>
                <dd class="font-bold tabular-nums">{{ mm(b.primoForo) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">Interasse fra i fori</dt>
                <dd class="font-bold tabular-nums">{{ mm(b.interasse) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">Ultimo foro (dalla coda)</dt>
                <dd class="font-bold tabular-nums">{{ mm(b.codaForo) }}</dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">Numero di fori</dt>
                <dd class="font-bold tabular-nums">{{ b.nFori }}</dd>
              </div>
              <p v-if="Math.abs(b.primoForo - b.codaForo) < 0.05" class="text-[11px] text-gray-400 italic pt-1">
                Foratura simmetrica: la barra si può montare da entrambi i versi.
              </p>
              <p v-else class="text-[11px] text-amber-700 italic pt-1 font-medium">
                Foratura ASIMMETRICA: la testa è l'estremità in basso. Montarla al contrario
                sposta tutti i fori.
              </p>
            </dl>

            <div v-else class="flex flex-wrap gap-1.5">
              <span
                v-for="(pos, i) in b.posizioni" :key="i"
                class="px-2 py-1 rounded bg-gray-100 text-gray-700 text-[11px] font-bold tabular-nums"
              >{{ i + 1 }}: {{ nf.format(pos) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Picking PREMIUM: l'inglesina e la minuteria che va con lei -->
      <div v-if="isPremium && progetto" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
        <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-4">Picking</h2>
        <div v-if="progetto.premium" class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="border border-gray-200 rounded-xl p-4 bg-white">
            <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">
              Inglesina 26<template v-if="parametriScheda.steccaInglesina"> · barre da {{ m(parametriScheda.steccaInglesina) }}</template>
            </p>
            <p class="text-3xl font-bold font-heading text-gray-900 tabular-nums">{{ !parametriScheda.steccaInglesina ? '—' : pianoInglesina?.nStecche ?? '…' }}</p>
          </div>
          <div
            v-for="v in [
              { nome: 'Giunzioni interne', n: progetto.premium.minuteria.giunzioni },
              { nome: 'Perni tondi', n: progetto.premium.minuteria.perni },
              { nome: 'Giunzioni a L', n: progetto.premium.minuteria.giunzioniL },
            ]" :key="v.nome"
            class="border border-gray-200 rounded-xl p-4 bg-white"
          >
            <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">{{ v.nome }}</p>
            <p class="text-3xl font-bold font-heading text-gray-900 tabular-nums">{{ v.n * telai }}</p>
          </div>
        </div>
      </div>

      <!-- Piano di taglio PREMIUM: cornice e interni sono la stessa inglesina, un piano solo -->
      <div v-if="isPremium && progetto" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
        <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-4">
          Piano di taglio
          <span v-if="parametriScheda.steccaInglesina && !pianiPronti" class="text-[11px] text-amber-600 font-bold normal-case"> · calcolo del piano…</span>
        </h2>
        <p v-if="!parametriScheda.steccaInglesina" class="text-[11px] text-amber-600 font-bold">
          Inserisci la lunghezza della barra nei parametri d'officina per avere il piano di taglio.
        </p>
        <!-- Finché il calcolo non è pronto resta il piano di prima, sbiadito -->
        <PianoTaglioPassi v-else-if="pianoInglesina" :piano="pianoInglesina" :kerf="parametriScheda.kerf" class="transition-opacity" :class="{ 'opacity-40': !pianiPronti }" />
        <p v-else class="text-[11px] text-amber-600 font-bold">Calcolo del piano di taglio…</p>
      </div>

      <div v-if="progetto && !isPremium" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
        <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-4">Picking</h2>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div class="border border-gray-200 rounded-xl p-4 bg-white" :class="{ 'opacity-50': !conBordo }">
            <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">Profilo a U · barre da {{ m(PROFILO_U.stecca) }}</p>
            <p class="text-3xl font-bold font-heading text-gray-900 tabular-nums">{{ conBordo ? pianoU?.nStecche ?? '…' : 0 }}</p>
          </div>
          <div class="border border-gray-200 rounded-xl p-4 bg-white">
            <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">Barra 18×8 · barre da {{ m(BARRA.stecca) }}</p>
            <p class="text-3xl font-bold font-heading text-gray-900 tabular-nums">{{ pianoBarre?.nStecche ?? '…' }}</p>
          </div>
          <div class="border border-gray-200 rounded-xl p-4 bg-white">
            <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">Rivetti</p>
            <p class="text-3xl font-bold font-heading text-gray-900 tabular-nums">{{ progetto!.nRivetti * telai }}</p>
          </div>
        </div>
      </div>

      <!-- Piano di taglio: una misura alla volta, la battuta si imposta una volta sola -->
      <div v-if="progetto && !isPremium" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
        <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-4">
          Piano di taglio
          <span v-if="!pianiPronti" class="text-[11px] text-amber-600 font-bold normal-case"> · calcolo del piano…</span>
        </h2>
        <div class="space-y-5 transition-opacity" :class="{ 'opacity-40': !pianiPronti }">
          <!-- La legenda una volta sola, in fondo all'ultimo piano -->
          <PianoTaglioPassi v-for="(piano, i) in pianiStandard" :key="piano.nome" :piano="piano.p" :nome="piano.nome" :kerf="parametriScheda.kerf" :senza-legenda="i < pianiStandard.length - 1" />
        </div>
      </div>

      <!-- Imballaggio -->
      <div v-if="imballaggio" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
        <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-4">Imballaggio</h2>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
          <dl class="text-sm space-y-1.5">
            <div v-if="!isPremium" class="flex justify-between">
              <dt class="text-gray-500">Telaio (profilo a U)</dt>
              <dd class="font-medium tabular-nums">
                <template v-if="conBordo">{{ kg(imballaggio.pesoU) }}</template>
                <span v-else class="text-gray-300 text-xs">griglia nuda</span>
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-gray-500">{{ isPremium ? 'Inglesina 26 (cornice + interni)' : 'Barre della griglia' }}</dt>
              <dd class="font-medium tabular-nums">
                <template v-if="imballaggio.pesoBarre !== null">{{ kg(imballaggio.pesoBarre) }}</template>
                <span v-else class="text-amber-600 text-xs font-bold">peso al metro mancante</span>
              </dd>
            </div>
            <div v-if="isPremium" class="flex justify-between">
              <dt class="text-gray-500">Minuteria (giunzioni e perni)</dt>
              <dd class="font-medium tabular-nums">{{ kg(imballaggio.pesoMinuteria) }}</dd>
            </div>
            <div class="flex justify-between pt-2 border-t border-gray-100">
              <dt class="font-bold text-gray-900">Peso di un telaio</dt>
              <dd class="font-bold tabular-nums">
                <template v-if="imballaggio.pesoTelaio !== null">{{ kg(imballaggio.pesoTelaio) }}</template>
                <span v-else class="text-gray-300">—</span>
              </dd>
            </div>
            <div class="flex justify-between">
              <dt class="font-bold text-gray-900 uppercase text-xs tracking-wide self-center">Peso totale ({{ telai }})</dt>
              <dd class="font-bold text-xl font-heading tabular-nums">
                <template v-if="imballaggio.pesoTotale !== null">{{ kg(imballaggio.pesoTotale) }}</template>
                <span v-else class="text-gray-300">—</span>
              </dd>
            </div>
          </dl>

          <div class="border border-gray-200 rounded-xl p-4 bg-white">
            <p class="text-[10px] font-bold uppercase text-gray-400 mb-2">Ingombro del collo</p>
            <p class="text-2xl font-bold font-heading text-gray-900 tabular-nums">
              {{ nf.format(imballaggio.ingombro.larghezza / 10) }} ×
              {{ nf.format(imballaggio.ingombro.altezza / 10) }} ×
              {{ nf.format(imballaggio.ingombro.spessore / 10) }} cm
            </p>
            <p class="text-[11px] text-gray-500 mt-2">
              {{ telai }} pannello{{ telai > 1 ? 'i impilati' : '' }} da {{ mm(progetto!.spessorePannello) }} di spessore
              <template v-if="isPremium"> (incastri a filo: quanto il profilo)</template>
              <template v-else-if="!conBordo"> (due barre sovrapposte, senza telaio)</template>.
            </p>
            <p v-if="imballaggio.pesoBarre === null" class="text-[11px] text-amber-600 mt-2 font-bold">
              Inserisci il peso al metro della barra nei parametri d'officina per avere il peso.
            </p>
          </div>
        </div>
      </div>

    </div>
   </div>
  </div>
</template>
