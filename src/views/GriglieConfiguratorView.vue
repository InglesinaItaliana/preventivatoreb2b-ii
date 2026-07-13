<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronLeftIcon, ExclamationTriangleIcon, Squares2X2Icon } from '@heroicons/vue/24/solid';
import { useCatalogStore } from '../Data/catalog';
import GrigliaPreview from '../components/griglie/GrigliaPreview.vue';
import { calcolaProgetto, calcolaImballaggio, type ConfigGriglia, type Stile, type Distribuzione } from '../logic/griglie/progetto';
import { pianificaTaglio, type PezzoDaTagliare } from '../logic/griglie/nesting';
import { appartiene, coloreFinitura, type FamigliaFinitura } from '../logic/griglie/finiture';
import {
  PROFILO_U, BARRA, CANALE_INTERNO, PROFONDITA_CANALE,
  DEFAULT_GIOCO, DEFAULT_KERF, DEFAULT_MARGINE_MINIMO, DEFAULT_LUNGHEZZA_MINIMA,
} from '../logic/griglie/materiali';

const router = useRouter();
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

const tipoFinitura = ref<FamigliaFinitura>('VERNICIATO');
const finitura = ref('');

// Parametri d'officina: si tarano sul campo, quindi stanno in un pannello a parte.
const mostraAvanzate = ref(false);
const gioco = ref(DEFAULT_GIOCO);
const kerf = ref(DEFAULT_KERF);
const margineMinimo = ref(DEFAULT_MARGINE_MINIMO);
const lunghezzaMinima = ref(DEFAULT_LUNGHEZZA_MINIMA);
const pesoBarraKgM = ref<number | null>(BARRA.pesoKgM);

// Su una griglia a rombi le barre non corrono parallele al bordo: il "vuoto
// contro il bordo" non esiste come grandezza, e i vuoti uguali non hanno senso.
const aRombi = computed(() => stile.value !== 'LONDRA');

// MILANO impone rombi quadrati, VENEZIA l'asse verticale doppio: in quegli stili
// il secondo cursore non è libero, è una conseguenza. LONDRA è l'unico con due
// passi indipendenti.
const passoVerticaleBloccato = computed(() => stile.value !== 'LONDRA');
const passoVerticaleEffettivo = computed(() => {
  if (stile.value === 'MILANO') return passoOrizzontaleCm.value;
  if (stile.value === 'VENEZIA') return passoOrizzontaleCm.value * 2;
  return passoVerticaleCm.value;
});

const config = computed<ConfigGriglia>(() => ({
  stile: stile.value,
  // Sui rombi la distribuzione a vuoti uguali non è definita: si ricade sul passo.
  distribuzione: aRombi.value ? 'PASSO_FISSO' : distribuzione.value,
  lunghezzaMinima: lunghezzaMinima.value,
  nBarreVerticali: distribuzione.value === 'SPAZI_UGUALI' ? nVertOverride.value : null,
  nBarreOrizzontali: distribuzione.value === 'SPAZI_UGUALI' ? nOrizOverride.value : null,
  larghezza: larghezzaCm.value * 10,
  altezza: altezzaCm.value * 10,
  passoOrizzontale: passoOrizzontaleCm.value * 10,
  passoVerticale: passoVerticaleEffettivo.value * 10,
  quantita: quantita.value,
  gioco: gioco.value,
  margineMinimo: margineMinimo.value,
  conBordo: conBordo.value,
}));

const progetto = computed(() => {
  try {
    return calcolaProgetto(config.value);
  } catch {
    return null; // stile non ancora implementato
  }
});

// --- Picking: la distinta moltiplicata per i telai, impacchettata nelle barre commerciali
const pianoU = computed(() => {
  const p = progetto.value;
  if (!p) return null;
  const pezzi: PezzoDaTagliare[] = p.bordi.map((b) => ({
    etichetta: b.etichetta,
    lunghezza: b.lunghezza,
    quantita: b.quantitaPerTelaio * quantita.value,
  }));
  return pianificaTaglio(pezzi, PROFILO_U.stecca, kerf.value);
});

const pianoBarre = computed(() => {
  const p = progetto.value;
  if (!p) return null;
  const pezzi: PezzoDaTagliare[] = p.barre.map((b) => ({
    etichetta: b.etichetta,
    lunghezza: b.lunghezza,
    quantita: b.quantitaPerTelaio * quantita.value,
  }));
  return pianificaTaglio(pezzi, BARRA.stecca, kerf.value);
});

const imballaggio = computed(() =>
  progetto.value ? calcolaImballaggio(progetto.value, pesoBarraKgM.value) : null
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

// --- Fori: due letture dello stesso dato ------------------------------------
const foriEstesi = ref(false);

// --- Aggancio anteprima ↔ distinta -----------------------------------------
// Ogni barra disegnata porta con sé l'etichetta del suo tipo, quindi l'hover su
// una riga di distinta accende esattamente i pezzi di quella riga — su Londra
// come sui rombi, dove un tipo raccoglie barre di entrambe le famiglie.
const evidenzia = ref<string | null>(null);

// --- Formattazione ----------------------------------------------------------
const nf = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mm = (v: number) => `${nf.format(v)} mm`;
const m = (v: number) => `${nf2.format(v / 1000)} m`;
const kg = (v: number) => `${nf2.format(v)} kg`;
</script>

<template>
  <div class="min-h-screen bg-gradient-to-br from-amber-50/40 via-gray-50 to-gray-100 p-4 md:p-6">

    <!-- Testata -->
    <div class="flex items-center gap-3 mb-6">
      <button
        @click="router.back()"
        class="p-2 bg-white hover:bg-amber-50 text-gray-500 hover:text-amber-600 border border-gray-200 rounded-lg shadow-sm transition-colors"
        title="Indietro"
      >
        <ChevronLeftIcon class="h-5 w-5" />
      </button>
      <div>
        <h1 class="text-2xl font-bold font-heading text-gray-900 flex items-center gap-2">
          <Squares2X2Icon class="h-7 w-7 text-amber-500" />
          Configuratore Griglie
        </h1>
        <p class="text-xs text-gray-500 uppercase tracking-wider font-bold">
          Pannelli da giardino · distinta di taglio e foratura
        </p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">

      <!-- ══════════ CONTROLLI ══════════ -->
      <div class="lg:col-span-4 xl:col-span-3 space-y-6">

        <div class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80 space-y-5">
          <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2">Pannello</h2>

          <!-- Stile -->
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-2">Stile</label>
            <div class="grid grid-cols-3 gap-2">
              <button
                v-for="s in (['LONDRA', 'MILANO', 'VENEZIA'] as Stile[])" :key="s"
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
              <template v-else>Rombi con l'asse verticale doppio: barre a circa 63°.</template>
            </p>
          </div>

          <!-- Bordo perimetrale -->
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-2">Bordo perimetrale</label>
            <div class="grid grid-cols-2 gap-2">
              <button
                @click="conBordo = true"
                class="py-2 rounded-lg text-[11px] font-bold border transition-all"
                :class="conBordo
                  ? 'bg-gray-900 border-gray-900 text-white shadow-md'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'"
              >CON TELAIO</button>
              <button
                @click="conBordo = false"
                class="py-2 rounded-lg text-[11px] font-bold border transition-all"
                :class="!conBordo
                  ? 'bg-gray-900 border-gray-900 text-white shadow-md'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'"
              >GRIGLIA NUDA</button>
            </div>
            <p class="text-[10px] text-gray-400 mt-1.5 italic">
              <template v-if="conBordo">Profilo a U su tutti e quattro i lati; le barre entrano nel canale.</template>
              <template v-else>Nessun telaio: le barre valgono l'ingombro pieno e restano a vista.</template>
            </p>
          </div>

          <!-- Misure -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Larghezza (cm)</label>
              <input v-model.number="larghezzaCm" type="number" min="10" step="0.5"
                class="w-full p-2 border border-gray-200 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none" />
            </div>
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Altezza (cm)</label>
              <input v-model.number="altezzaCm" type="number" min="10" step="0.5"
                class="w-full p-2 border border-gray-200 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none" />
            </div>
          </div>
          <p class="text-[10px] text-gray-400 -mt-2 italic">
            {{ conBordo ? 'Ingombro esterno, telaio compreso.' : 'Ingombro della griglia nuda.' }}
          </p>

          <!-- Distribuzione: solo su LONDRA. Sui rombi le barre non corrono
               parallele al bordo, quindi il "vuoto contro il bordo" non esiste. -->
          <div v-if="!aRombi">
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

          <!-- Passi -->
          <div>
            <div class="flex justify-between items-baseline mb-1">
              <label class="text-[10px] font-bold text-gray-500 uppercase">
                {{ aRombi ? 'Larghezza del rombo' : 'Passo orizzontale' }}
                <span v-if="!aRombi && distribuzione === 'SPAZI_UGUALI'" class="text-gray-300 normal-case">(desiderato)</span>
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

          <div v-if="!aRombi">
            <div class="flex justify-between items-baseline mb-1">
              <label class="text-[10px] font-bold text-gray-500 uppercase">
                Passo verticale
                <span v-if="distribuzione === 'SPAZI_UGUALI' && !passoVerticaleBloccato" class="text-gray-300 normal-case">(desiderato)</span>
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

          <!-- Risultato: sui rombi le grandezze sono altre -->
          <div v-if="progetto && aRombi" class="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-1.5">
            <p class="text-[10px] font-bold uppercase text-gray-500">Risultato</p>
            <div class="flex justify-between text-[11px]">
              <span class="text-gray-500">Barre da tagliare</span>
              <span class="font-bold tabular-nums">{{ progetto.disegno.barre.length }}</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="text-gray-500">Tipi diversi</span>
              <span class="font-bold tabular-nums">{{ progetto.barre.length }}</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="text-gray-500">Distanza fra parallele</span>
              <span class="font-bold tabular-nums">{{ nf.format(progetto.passoEffettivoX / 10) }} cm</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="text-gray-500">Vuoto fra le barre</span>
              <span class="font-bold tabular-nums">{{ nf.format(progetto.vuotoX / 10) }} cm</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="text-gray-500">Rivetti</span>
              <span class="font-bold tabular-nums">{{ progetto.nRivetti }}</span>
            </div>
            <!-- Scartate: dato, non allarme. Ma non sparisce in silenzio. -->
            <div v-if="progetto.barreScartate > 0" class="flex justify-between text-[11px]">
              <span class="text-gray-400">Barrette d'angolo omesse</span>
              <span class="font-bold tabular-nums text-gray-400">{{ progetto.barreScartate }}</span>
            </div>
          </div>

          <!-- Il risultato reale: in SPAZI_UGUALI non coincide col cursore -->
          <div v-if="progetto && !aRombi" class="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2">
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
                <button v-if="distribuzione === 'SPAZI_UGUALI'" @click="ritocca(asse.k, -1)"
                  class="h-6 w-6 rounded border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold leading-none">−</button>
                <span class="w-7 text-center font-bold text-sm tabular-nums">{{ asse.n }}</span>
                <button v-if="distribuzione === 'SPAZI_UGUALI'" @click="ritocca(asse.k, +1)"
                  class="h-6 w-6 rounded border border-gray-200 bg-white text-gray-500 hover:border-amber-400 hover:text-amber-600 font-bold leading-none">+</button>
              </div>
            </div>

            <p v-if="distribuzione === 'SPAZI_UGUALI'" class="text-[10px] text-gray-400 italic pt-1 border-t border-gray-200">
              L'interasse non sarà quasi mai tondo: è il prezzo dei vuoti tutti uguali.
              I fori si tracciano al millimetro comunque.
            </p>
          </div>

          <!-- Finitura -->
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-2">Finitura</label>
            <div class="grid grid-cols-2 gap-2 mb-2">
              <button
                v-for="t in (['VERNICIATO', 'RIVESTITO'] as const)" :key="t"
                @click="tipoFinitura = t; finitura = ''"
                class="py-2 rounded-lg text-[11px] font-bold border transition-all"
                :class="tipoFinitura === t
                  ? 'bg-gray-900 border-gray-900 text-white shadow-md'
                  : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'"
              >{{ t }}</button>
            </div>
            <div class="flex items-center gap-2">
              <span
                class="h-9 w-9 shrink-0 rounded-lg border border-gray-300 shadow-inner"
                :style="{ backgroundColor: coloreFinitura(finitura) }"
                :title="finitura || 'Nessuna finitura'"
              ></span>
              <select v-model="finitura" :disabled="!finitureDisponibili.length"
                class="flex-1 min-w-0 p-2 border border-gray-200 rounded-lg bg-white text-sm disabled:opacity-50">
                <option value="" disabled>
                  {{ catalog.loading ? 'Caricamento listino…' : (finitureDisponibili.length ? 'Seleziona finitura' : 'Nessuna finitura disponibile') }}
                </option>
                <option v-for="f in finitureDisponibili" :key="f" :value="f">{{ f }}</option>
              </select>
            </div>
            <p class="text-[10px] text-gray-400 mt-1 italic">
              {{ tipoFinitura === 'VERNICIATO' ? 'Colore standard e personalizzato del listino.' : 'Effetto legno del listino.' }}
            </p>
          </div>

          <!-- Quantità -->
          <div>
            <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Telai identici</label>
            <input v-model.number="quantita" type="number" min="1" step="1"
              class="w-full p-2 border border-gray-200 rounded-lg text-center text-sm font-bold focus:ring-2 focus:ring-amber-400 outline-none" />
          </div>
        </div>

        <!-- Parametri d'officina -->
        <div class="bg-white/60 backdrop-blur-sm rounded-xl shadow-lg border border-white/80 overflow-hidden">
          <button @click="mostraAvanzate = !mostraAvanzate"
            class="w-full p-4 flex justify-between items-center text-left hover:bg-amber-50/50 transition-colors">
            <span class="font-bold text-sm uppercase tracking-wide text-gray-800">Parametri d'officina</span>
            <span class="text-[10px] font-bold uppercase" :class="mostraAvanzate ? 'text-amber-600' : 'text-gray-400'">
              {{ mostraAvanzate ? 'nascondi' : 'mostra' }}
            </span>
          </button>

          <div v-if="mostraAvanzate" class="px-5 pb-5 space-y-4 border-t border-gray-100 pt-4">
            <div>
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
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Margine minimo dal telaio (mm)</label>
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
            <div>
              <label class="block text-[10px] font-bold text-gray-500 uppercase mb-1">Peso barra 18×8 (kg/m)</label>
              <input v-model.number="pesoBarraKgM" type="number" min="0" step="0.001" placeholder="da definire"
                class="w-full p-2 border border-gray-200 rounded-lg text-sm" />
              <p class="text-[10px] text-gray-400 italic mt-0.5">
                Di serie {{ nf2.format(BARRA.pesoKgM) }} kg/m (profilo cavo). Svuotando il campo,
                il peso totale non viene calcolato invece di essere inventato.
              </p>
            </div>

            <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-[11px] text-gray-500 space-y-0.5">
              <p class="font-bold text-gray-700 uppercase text-[10px] mb-1">Materiali (fissi)</p>
              <p>Profilo a U {{ PROFILO_U.lato }}×{{ PROFILO_U.lato }}×{{ nf.format(PROFILO_U.spessore) }} · barre da {{ m(PROFILO_U.stecca) }} · {{ nf2.format(PROFILO_U.pesoKgM) }} kg/m</p>
              <p>Barra {{ BARRA.larghezza }}×{{ BARRA.spessore }} · barre da {{ m(BARRA.stecca) }} · {{ nf2.format(BARRA.pesoKgM) }} kg/m</p>
              <p>Canale interno {{ mm(CANALE_INTERNO) }} · profondità {{ mm(PROFONDITA_CANALE) }}</p>
              <p class="italic pt-1">Due barre sovrapposte fanno {{ BARRA.spessore * 2 }} mm: il canale da {{ CANALE_INTERNO }} le riceve con 1 mm di gioco.</p>
            </div>
          </div>
        </div>
      </div>

      <!-- ══════════ ANTEPRIMA + DISTINTE ══════════ -->
      <div class="lg:col-span-8 xl:col-span-9 space-y-6">

        <!-- Anteprima -->
        <div class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
          <div class="flex justify-between items-baseline mb-3">
            <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800">Anteprima</h2>
            <span v-if="progetto" class="text-[11px] text-gray-400 tabular-nums">
              luce {{ mm(progetto.luceX) }} × {{ mm(progetto.luceY) }} ·
              margini {{ mm(progetto.margineX) }} / {{ mm(progetto.margineY) }}
            </span>
          </div>
          <div class="h-[26rem] flex items-center justify-center">
            <GrigliaPreview v-if="progetto" :progetto="progetto" :finitura="finitura" :evidenzia="evidenzia" />
          </div>
        </div>

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
              Telaio · profilo a U
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
                <tr v-for="b in progetto.bordi" :key="b.etichetta">
                  <td class="py-2 text-gray-700 text-xs">{{ b.etichetta }}</td>
                  <td class="py-2 text-right font-bold tabular-nums">{{ mm(b.lunghezza) }}</td>
                  <td class="py-2 text-center text-[11px] text-gray-500">{{ b.taglio }}</td>
                  <td class="py-2 text-right font-bold tabular-nums">
                    {{ b.quantitaPerTelaio * quantita }}
                    <span v-if="quantita > 1" class="text-[10px] text-gray-400 font-normal">({{ b.quantitaPerTelaio }}×{{ quantita }})</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Barre -->
          <div class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
            <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-3">
              Barre della griglia · 18×8
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
                <tr
                  v-for="b in progetto.barre" :key="b.etichetta"
                  @mouseenter="evidenzia = b.etichetta"
                  @mouseleave="evidenzia = null"
                  class="hover:bg-amber-50/60 transition-colors cursor-default"
                >
                  <td class="py-2 text-gray-700 text-xs">{{ b.etichetta }}</td>
                  <td class="py-2 text-right font-bold tabular-nums">{{ mm(b.lunghezza) }}</td>
                  <td class="py-2 text-center text-[11px] text-gray-500">{{ b.taglio }}</td>
                  <td class="py-2 text-right font-bold tabular-nums">
                    {{ b.quantitaPerTelaio * quantita }}
                    <span v-if="quantita > 1" class="text-[10px] text-gray-400 font-normal">({{ b.quantitaPerTelaio }}×{{ quantita }})</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Fori -->
        <div v-if="progetto?.barre.length" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
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

        <!-- Picking -->
        <div v-if="pianoU && pianoBarre" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
          <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-4">
            Picking e sfrido <span class="text-gray-400 font-normal normal-case">· per {{ quantita }} telaio{{ quantita > 1 ? ' identici' : '' }}</span>
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="border border-gray-200 rounded-xl p-4 bg-white" :class="{ 'opacity-50': !conBordo }">
              <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">Profilo a U · barre da {{ m(PROFILO_U.stecca) }}</p>
              <p class="text-3xl font-bold font-heading text-gray-900 tabular-nums">{{ pianoU.nStecche }}</p>
              <p v-if="conBordo" class="text-[11px] text-gray-500 mt-1 tabular-nums">
                sfrido {{ m(pianoU.sfrido) }} ({{ nf.format(pianoU.sfridoPerc) }}%)
              </p>
              <p v-else class="text-[11px] text-gray-500 mt-1">griglia nuda: nessun telaio</p>
            </div>
            <div class="border border-gray-200 rounded-xl p-4 bg-white">
              <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">Barra 18×8 · barre da {{ m(BARRA.stecca) }}</p>
              <p class="text-3xl font-bold font-heading text-gray-900 tabular-nums">{{ pianoBarre.nStecche }}</p>
              <p class="text-[11px] text-gray-500 mt-1 tabular-nums">
                sfrido {{ m(pianoBarre.sfrido) }} ({{ nf.format(pianoBarre.sfridoPerc) }}%)
              </p>
            </div>
            <div class="border border-gray-200 rounded-xl p-4 bg-white">
              <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">Rivetti</p>
              <p class="text-3xl font-bold font-heading text-gray-900 tabular-nums">{{ progetto!.nRivetti * quantita }}</p>
              <p class="text-[11px] text-gray-500 mt-1">uno per incrocio</p>
            </div>
          </div>

          <!-- Piano di taglio: le barre commerciali con lo STESSO schema sono accorpate.
               Alla sega serve lo schema, non l'elenco di cento righe identiche. -->
          <div class="mt-5 space-y-4">
            <div v-for="piano in [{ nome: 'Profilo a U', p: pianoU }, { nome: 'Barra 18×8', p: pianoBarre }]" :key="piano.nome">
              <template v-if="piano.p!.gruppi.length">
                <p class="text-[10px] font-bold uppercase text-gray-500 mb-2">
                  Piano di taglio · {{ piano.nome }}
                  <span class="text-gray-400 font-normal normal-case">
                    — {{ piano.p!.gruppi.length }}
                    {{ piano.p!.gruppi.length > 1 ? 'schemi diversi' : 'schema' }}
                    su {{ piano.p!.nStecche }} {{ piano.p!.nStecche === 1 ? 'barra' : 'barre' }}
                  </span>
                </p>
                <div class="space-y-1.5">
                  <div
                    v-for="(g, i) in piano.p!.gruppi" :key="i"
                    class="flex items-center gap-2 text-[11px]"
                  >
                    <span class="w-12 shrink-0 font-bold tabular-nums px-1.5 py-0.5 rounded text-center"
                      :class="g.ripetizioni > 1 ? 'bg-gray-900 text-white' : 'text-gray-400'">
                      ×{{ g.ripetizioni }}
                    </span>
                    <div class="flex-1 flex gap-0.5 h-6 bg-gray-100 rounded overflow-hidden">
                      <div
                        v-for="(t, j) in g.tagli" :key="j"
                        class="bg-amber-400 flex items-center justify-center text-amber-950 font-bold overflow-hidden whitespace-nowrap"
                        :style="{ width: `${(t.lunghezza / piano.p!.lunghezzaStecca) * 100}%` }"
                        :title="`${t.etichetta} — ${nf.format(t.lunghezza)} mm`"
                      >{{ nf.format(t.lunghezza) }}</div>
                    </div>
                    <span class="w-24 shrink-0 text-right text-gray-400 tabular-nums">avanzo {{ nf.format(g.avanzo) }}</span>
                  </div>
                </div>
              </template>
            </div>
            <p class="text-[11px] text-gray-400 italic">
              Lo sfrido tiene conto della lama ({{ mm(kerf) }} a taglio): su una barra da cui ricavi dieci pezzi
              se ne vanno {{ mm(kerf * 9) }} in trucioli.
            </p>
          </div>
        </div>

        <!-- Imballaggio -->
        <div v-if="imballaggio" class="bg-white/60 backdrop-blur-sm p-5 rounded-xl shadow-lg border border-white/80">
          <h2 class="font-bold text-sm uppercase tracking-wide text-gray-800 border-b pb-2 mb-4">Imballaggio</h2>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <dl class="text-sm space-y-1.5">
              <div class="flex justify-between">
                <dt class="text-gray-500">Telaio (profilo a U)</dt>
                <dd class="font-medium tabular-nums">
                  <template v-if="conBordo">{{ kg(imballaggio.pesoU) }}</template>
                  <span v-else class="text-gray-300 text-xs">griglia nuda</span>
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="text-gray-500">Barre della griglia</dt>
                <dd class="font-medium tabular-nums">
                  <template v-if="imballaggio.pesoBarre !== null">{{ kg(imballaggio.pesoBarre) }}</template>
                  <span v-else class="text-amber-600 text-xs font-bold">peso al metro mancante</span>
                </dd>
              </div>
              <div class="flex justify-between pt-2 border-t border-gray-100">
                <dt class="font-bold text-gray-900">Peso di un telaio</dt>
                <dd class="font-bold tabular-nums">
                  <template v-if="imballaggio.pesoTelaio !== null">{{ kg(imballaggio.pesoTelaio) }}</template>
                  <span v-else class="text-gray-300">—</span>
                </dd>
              </div>
              <div class="flex justify-between">
                <dt class="font-bold text-gray-900 uppercase text-xs tracking-wide self-center">Peso totale ({{ quantita }})</dt>
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
                {{ quantita }} pannello{{ quantita > 1 ? 'i impilati' : '' }} da {{ mm(progetto!.spessorePannello) }} di spessore
                <template v-if="!conBordo"> (due barre sovrapposte, senza telaio)</template>.
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
