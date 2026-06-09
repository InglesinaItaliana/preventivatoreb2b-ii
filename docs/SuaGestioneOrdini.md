# SUA — Gestione Ordini B2C

> Documento di design architetturale. Come inserire la gestione degli ordini provenienti dai siti B2C **SUA Giardino** e **SUA Finestre** nella struttura esistente (SIDERA + POPS).
>
> Stato: **bozza di design** · nessun codice ancora scritto · da validare prima dell'implementazione.
>
> Fonti: doc Nebula strategici (`Strategia 2026`, `Libro delle Idee`, `Direzioni possibili`, `Progetto rami secchi`), `docs/ATLAS.md`, `docs/POLARIS.md`, `src/types.ts`, `firestore.rules`.

---

## 0. Contesto

**SUA** è il brand consumer ombrello, **esplicitamente separato da Inglesina Italiana B2B** (anche a livello di dominio: niente `.it` per il lancio francese; identità visiva propria — verde salvia / bronzo / crema, font Fraunces). Due linee sotto lo stesso ombrello:

- **SUA Finestre / QUADRO** — inglesine adesive fai-da-te, mercato Francia, lancio **settembre 2026** (priorità massima).
- **SUA Giardino / TELA** — pannelli decorativi da giardino, mercato Italia, lancio **marzo 2027**.

Caratteristiche rilevanti per l'architettura:

- E-commerce dedicato + **configuratore con engine condiviso** tra le due linee ("si costruisce una volta sola per entrambi").
- Ordini perlopiù **già pagati** al checkout, ma **SUA Giardino può anche richiedere preventivi per prodotti personalizzati** (vedi §5).
- Fulfilment B2C diverso dal B2B: flat-pack DIY, CAP checker, pick-up point/vivai, marketplace (ManoMano).
- Asset condivisi col mondo Inglesina: **DNA prodotto** (profilo Varsavia 18), **capacità produttiva** (macchinario di Daniel), **logica di taglio/configurazione**.

---

## 1. Il principio guida: una sola officina, due porte d'ingresso

"Separare SUA da POPS" **non significa due sistemi ordini paralleli da sorvegliare**. Va separato solo ciò che è davvero diverso:

- **L'ingresso commerciale** (come nasce l'ordine): qui B2B e B2C divergono — preventivo/firma/listino da un lato, checkout pagato dall'altro. **Due porte.**
- **L'officina** (produzione + spedizione): stesso Daniel, stesso macchinario, stesso profilo Varsavia 18. **Una coda sola.** Nessuna ragione di duplicare.

Quindi: **un unico backbone ordine "channel-aware"** (`canale: B2B | B2C` + `brand: GIARDINO | FINESTRE`) che attraversa una **linea di handoff**. Prima della linea ogni canale vive nella sua logica; dopo la linea confluiscono nella stessa coda di produzione e spedizione di POPS, taggati e filtrabili.

```
  PORTE D'INGRESSO (diverse)              ┊  OFFICINA (condivisa, POPS)
                                          ┊
  B2B → preventivatore POPS               ┊
        DRAFT→QUOTE→ORDER→FIRMA→SIGNED ───┼──▶ IN_PRODUZIONE → READY → SPEDIZIONE → DELIVERED
                                          ┊        ▲                        │
  B2C → storefront SUA / webhook          ┊        │ (stessa coda,          │ trip/DDT       (B2B)
        PAID → (triage) ──────────────────┼────────┘  badge canale+brand)   │ corriere/pickup (B2C)
                                          ┊
                                    linea di handoff
```

Chi sta in officina **non apre due app**: apre la coda produzione di POPS e vede tutto, con un badge "SUA Finestre / B2C" o "Inglesina / B2B" e un filtro. È lo stesso pattern con cui oggi `AdminView` mostra PREVENTIVI/ORDINI/PRODUZIONE/SPEDIZIONI come viste filtrate su un'unica collezione.

---

## 2. Le due superfici: pubblico vs interno

"Gestione ordini dal sito B2C" sono due superfici diverse, che vanno in posti diversi:

| Superficie | Cos'è | Dove |
|---|---|---|
| **Storefront pubblico SUA** (sito + configuratore + checkout + pagamento) | Consumer-facing, brand SUA, dominio proprio FR, identità Fraunces | **Fuori dalla suite** — prodotto/deploy separato |
| **Back-office ordini SUA** (lo staff vede, valida, manda in produzione e traccia) | Interno, per gestore e-commerce / produzione / logistica | **Dentro la suite**, sopra il backbone condiviso |

Il sito SUA è un brand consumer pubblico: **non appartiene a SIDERA né a POPS**. Butta dentro ordini via webhook e basta. È in pratica il trigger della differita Az.7 di POLARIS (separazione deploy), ma solo per la parte pubblica.

---

## 3. Dove sta "il modulo" interno

Non è un secondo gestionale. In ordine di invasività:

1. **POPS diventa channel-aware** (campi `canale`/`brand`, badge, filtri). È il cuore e **garantisce la coda unica**. Non opzionale.
2. **Cockpit B2C per l'intake** — può essere:
   - una **sezione dentro POPS** gated per il ruolo "sua" (zero seconda app da sorvegliare), oppure
   - un **mini-scope `/sua/`** separato se il gestore e-commerce è una persona dedicata con identità/permessi propri.

   La scelta dipende **solo da chi possiede l'intake commerciale**. Stesso team POPS → sezione interna. Persona/processo separato (probabile, vista la Francia) → mini-scope, ma **sopra lo stesso backbone**.
3. **Sito pubblico SUA** — l'unica cosa davvero separata (brand, dominio FR, deploy proprio).

### Perché NON dentro POPS (il modello commerciale), perché NON dentro la shell SIDERA

- POPS è marchiato Inglesina B2B (`users/clienteUID`, listini, sconti admin, firma contratto). Il B2C non ha questa macchina commerciale.
- SIDERA è hub/navigazione, non un layer transazionale.
- Ma il **backbone operativo** (produzione + spedizione) **sì**, va condiviso con POPS.

---

## 4. Flusso di lavoro per ruolo

| Ruolo | Dove lavora | Cosa vede |
|---|---|---|
| **Gestore e-commerce / SUA** | Cockpit B2C (intake) | Solo ordini SUA: nuovi dal sito/ManoMano, customer care, resi, note. *Non* tocca il B2B. |
| **Produzione (Daniel)** | **POPS, coda produzione unica** | Tutti i job da produrre, B2B + B2C insieme, filtrabili. Una lista sola. |
| **Logistica** | **POPS, spedizioni** | Una vista, **due modalità**: trip/DDT per il B2B, corriere/pick-up/CAP per il B2C. Filtro per canale. |

La frammentazione esiste **solo nella fase commerciale**, ed è voluta (il gestore e-commerce non deve vedere i preventivi delle vetrerie, e viceversa). **Dalla produzione in giù non c'è frammentazione**: superficie sola.

### Produzione e spedizione

- **Produzione: merge pieno.** Coda unica, riuso più ovvio.
- **Spedizione: backbone condiviso, ma due *modalità*.** Trip/DDT (B2B) e flat-pack DIY / CAP / pick-up / tracking corriere (B2C) restano sotto-flussi diversi, ma nella **stessa vista spedizioni** con un selettore di modalità — non in due app.

---

## 5. Il caso che convalida tutto: SUA Giardino custom (`PENDING_VAL`)

SUA Giardino a volte deve **quotare prodotti personalizzati**. Questo non rompe il modello: è la prova che serve **una macchina a stati sola**. Sta chiedendo esattamente il **ramo preventivo** che POPS ha già (`PENDING_VAL → QUOTE_READY`). Un DB ordini B2C separato dovrebbe re-implementarlo da zero; con il backbone unico lo **riusi**.

La differenza tra i percorsi non sono *gli stati*, ma **da quale porta entri** e **quale cancello attraversi**.

### Tre percorsi, gli stessi stati

```
ENTRATA                         RAMO PREVENTIVO (condiviso)      CANCELLO CLIENTE (per-canale)     OFFICINA (condivisa)

B2B (preventivatore) ─ custom? ─┬─▶ PENDING_VAL → QUOTE_READY ──▶ WAITING_SIGN    (firma)    ─┐
                                └─▶ (auto) QUOTE_READY ─────────▶ WAITING_SIGN    (firma)    ─┤
                                                                                             ├▶ IN_PRODUZIONE → READY → SPEDIZIONE
B2C Giardino CUSTOM ────────────▶  PENDING_VAL → QUOTE_READY ──▶ WAITING_PAYMENT  (paga)     ─┤
                                                                                             │
B2C standard (configuratore) ───────────────────────────────▶  PAID (già pagato)            ─┘
```

- **Il ramo preventivo (`PENDING_VAL → QUOTE_READY`) è identico** per B2B e per il custom B2C. Stessa coda "da quotare", stesso staff tecnico, una lista sola filtrabile per canale.
- **L'unica cosa davvero per-canale è il cancello finale** prima della produzione: B2B = **firma** (`WAITING_SIGN`), B2C = **pagamento** (`WAITING_PAYMENT`). Stesso punto logico ("conferma del cliente"), due risoluzioni.

### La regola generalizzata

> **Se il configuratore sa prezzare da solo → percorso diretto. Se no (richiesta custom, fuori-catalogo, centinato, misura oltre i limiti, note) → `PENDING_VAL` → quotazione umana → `QUOTE_READY`.**

Vale identico per il B2B con note e per il SUA Giardino custom. Stessa logica, non un caso speciale. (In POPS oggi il trigger è "ci sono note / serve validazione": è la stessa cosa, generalizzata a tutti i canali.)

### Flusso del custom SUA Giardino

1. Sul sito SUA Giardino, accanto al checkout standard, percorso **"richiedi preventivo"** → crea ordine `canale=B2C, brand=GIARDINO` in `PENDING_VAL`.
2. La richiesta atterra nella **stessa coda "da quotare" di POPS** usata per il B2B. Chi quota (tecnico/Daniel) la vede lì col badge SUA, mette il prezzo → `QUOTE_READY`.
3. Il cliente riceve il preventivo (link/email), accetta e **paga online** → `WAITING_PAYMENT` si chiude → entra nella **coda produzione condivisa**.

### Tabella delle transizioni di stato

Sequenza per percorso (gli stati tra parentesi quadre sono opzionali):

- **B2B** — `DRAFT` → `[PENDING_VAL] → QUOTE_READY` → `ORDER_REQ` → `WAITING_SIGN` → `SIGNED` → `IN_PRODUZIONE` → `READY` → `DELIVERY` → `SHIPPED` → `DELIVERED`
- **B2C standard** — `PAID` → `IN_PRODUZIONE` → `READY` → `DELIVERY` → `SHIPPED` → `DELIVERED`
- **B2C custom (Giardino)** — `PENDING_VAL` → `QUOTE_READY` → `WAITING_PAYMENT` → `PAID` → `IN_PRODUZIONE` → `READY` → `DELIVERY` → `SHIPPED` → `DELIVERED`

I tre percorsi convergono sui due stati "conferma cliente" — `SIGNED` (firma, B2B) e `PAID` (pagamento, B2C) — che aprono entrambi `IN_PRODUZIONE`. Da lì in poi l'officina è identica.

| Fase | Da → A | Trigger / evento | Attore | B2B | B2C std | B2C custom |
|---|---|---|---|:--:|:--:|:--:|
| Ingresso | — → `DRAFT` | bozza creata nel preventivatore | cliente B2B / admin | ✓ |  |  |
| Ingresso | — → `PAID` | checkout pagato sul sito | webhook |  | ✓ |  |
| Ingresso | — → `PENDING_VAL` | "richiedi preventivo" (custom) | webhook |  |  | ✓ |
| Preventivo | `DRAFT` → `PENDING_VAL` | note presenti / configuratore non sa prezzare | sistema | ✓ |  |  |
| Preventivo | `DRAFT` → `QUOTE_READY` | preventivo auto-quotabile | sistema | ✓ |  |  |
| Preventivo | `PENDING_VAL` → `QUOTE_READY` | validazione tecnica + prezzo | admin / tecnico | ✓ |  | ✓ |
| Cancello | `QUOTE_READY` → `ORDER_REQ` | cliente accetta il preventivo | cliente B2B | ✓ |  |  |
| Cancello | `ORDER_REQ` → `WAITING_SIGN` | invio contratto da firmare | sistema | ✓ |  |  |
| Cancello | `WAITING_SIGN` → `SIGNED` | firma digitale completata | cliente B2B | ✓ |  |  |
| Cancello | `QUOTE_READY` → `WAITING_PAYMENT` | cliente accetta → link pagamento | cliente / sistema |  |  | ✓ |
| Cancello | `WAITING_PAYMENT` → `PAID` | pagamento incassato | PSP / webhook |  |  | ✓ |
| Officina | `SIGNED` → `IN_PRODUZIONE` | avvio produzione | produzione | ✓ |  |  |
| Officina | `PAID` → `IN_PRODUZIONE` | job creato dall'ordine pagato | sistema |  | ✓ | ✓ |
| Officina | `IN_PRODUZIONE` → `READY` | produzione completata | produzione | ✓ | ✓ | ✓ |
| Officina | `READY` → `DELIVERY` | pianificazione (trip B2B / corriere B2C) | logistica | ✓ | ✓ | ✓ |
| Officina | `DELIVERY` → `SHIPPED` | affidato al corriere / partito | logistica | ✓ | ✓ | ✓ |
| Officina | `SHIPPED` → `DELIVERED` | consegna confermata | corriere / sistema | ✓ | ✓ | ✓ |
| Uscita | `*` → `REJECTED` | rifiuto, scadenza preventivo, mancato pagamento, annullo | cliente / admin / sistema | ✓ | ✓ | ✓ |

> **Lettura dei cancelli:** `SIGNED` e `PAID` sono lo stesso punto logico ("conferma del cliente") risolto in due modi. Il B2C standard *nasce* già a `PAID` (pagato al checkout); il B2C custom ci arriva dopo il preventivo, via `WAITING_PAYMENT`. Nessun percorso B2C passa da `ORDER_REQ`/`WAITING_SIGN`/`SIGNED`.

---

## 6. Modello dati (bozza)

Backbone unico, channel-aware. Estensione del modello `preventivi` esistente (non una collezione parallela), oppure collezione `orders` unificata — **decisione aperta (§9)**.

Campi nuovi sul documento ordine:

- `canale: 'B2B' | 'B2C'`
- `brand?: 'GIARDINO' | 'FINESTRE'` (valorizzato solo se `canale === 'B2C'`)
- `origine?: 'storefront' | 'manomano' | ...` (sorgente di ingestione B2C)
- `tipoConferma?: 'firma' | 'pagamento'` (come si apre il cancello cliente)
- Riferimenti pagamento/spedizione B2C (payment id, indirizzo, CAP, tracking) — opzionali, presenti solo sul B2C.

### Cancello cliente

Generalizzare il cancello implicito `WAITING_SIGN`:

- `WAITING_SIGN` (firma contratto) → B2B
- `WAITING_PAYMENT` (incasso online) → B2C

Entrambi confluiscono nello stesso `IN_PRODUZIONE`. **Preferenza: due stati espliciti** (più leggibili nelle viste e nei badge) che convergono, invece di un unico stato con flag.

### Ciclo di vita POPS esistente (riferimento)

`DRAFT → PENDING_VAL → QUOTE_READY → ORDER_REQ → WAITING_SIGN → SIGNED → IN_PRODUZIONE → READY → DELIVERY → SHIPPED → DELIVERED` · `REJECTED` come uscita. (`src/types.ts`)

---

## 7. Ingestione ordini (il pezzo tecnicamente nuovo)

**Cloud Function `https.onRequest` webhook** per ogni sorgente (storefront SUA FR, eventualmente ManoMano), firmata con HMAC, che normalizza il payload e crea il documento ordine SUA. Oggi l'unica integrazione esterna della suite è FattureInCloud **in uscita**: questo è il primo **ingresso** da terzi, ma è piccolo e isolato.

- Ordine standard pagato → entra a `PAID`.
- Richiesta preventivo (Giardino custom) → entra a `PENDING_VAL`.

---

## 8. Asset condivisi vs nuovi

| Asset | Strategia |
|---|---|
| **Configuratore / engine di taglio (Varsavia 18)** | Estrarre la logica da `BuilderView` in una **lib condivisa** (`src/lib/configurator`) usata da POPS B2B, dal configuratore pubblico SUA e dal back-office SUA. Extra B2C (RAL picker, calcolo peso/colli, contatore rivetti, cut-list IKEA, cattura email) restano specifici. |
| **Ramo preventivo** (`PENDING_VAL`/`QUOTE_READY`) | Riuso pieno, coda "da quotare" condivisa. |
| **Coda di produzione** | Condivisa, discriminante `canale`/`brand`, una vista filtrabile. |
| **Fatturazione FiC** | Riusabile, ma B2C Francia = regime IVA diverso (OSS), probabile entità/numerazione separata. |
| **Spedizione** | Backbone condiviso, ma filiera DIY/pick-up/CAP **nuova** (modalità B2C). |
| **Cancello pagamento online** | **Nuovo** (accanto al cancello firma esistente). |
| **Storefront pubblico** | **Nuovo, separato** (deploy/dominio/brand propri). |

---

## 9. Fasatura (deadline QUADRO settembre 2026)

Critical path = **sito pubblico + configuratore + checkout** (fuori suite). Il back-office parte minimale e cresce:

1. **Ora → estate 2026**: webhook di intake + backbone channel-aware (`canale`/`brand`) + cancello `WAITING_PAYMENT`. Gli ordini confermati generano un job/cut-list nella coda produzione condivisa. Estrarre l'engine configuratore in lib condivisa.
2. **Al lancio FR**: vista di **triage** back-office (gated ruolo "sua") per controllare/correggere gli ordini prima della produzione + tracciamento spedizione DIY. Percorso "richiedi preventivo" per il custom.
3. **Verso marzo 2027 (TELA/Giardino)**: eventuale promozione a **scope `/sua/` pieno** (manifest, ScopedLogin, sidebar) e attivazione `brand=GIARDINO` — engine già condiviso, si aggiungono solo varianti garden e filiera pick-up/vivai.

---

## 10. Decisioni aperte

- [ ] **Collezione unica `orders` channel-aware** vs **estensione di `preventivi`** vs **collezione B2C separata che proietta un job di produzione condiviso**. (Preferenza emersa: backbone unico per evitare "due posti da guardare".)
- [ ] **Cockpit intake B2C**: sezione dentro POPS vs mini-scope `/sua/`. Dipende da chi possiede l'intake.
- [ ] **Chi quota** le richieste custom SUA Giardino: stesso staff tecnico POPS o gestore e-commerce dedicato.
- [ ] Regime fiscale FiC per il B2C Francia (OSS, numerazione).
- [ ] Tecnologia storefront pubblico (Shopify/Woo + configuratore embed vs app Vue standalone su dominio FR).
- [x] Tabella completa delle transizioni di stato per i tre percorsi (B2B, B2C standard, B2C custom) con trigger e cancelli — **redatta, vedi §5**.

---

## Sintesi in una riga

Non si separano gli *ordini*, si separano solo le *porte d'ingresso*: backbone ordine unico e channel-aware, **produzione e spedizione condivise in POPS** (filtro per canale), riuso del ramo preventivo (`PENDING_VAL`/`QUOTE_READY`) anche per il custom SUA Giardino, aggiunta del solo cancello pagamento accanto a quello firma. Il B2C aggiunge un cockpit d'intake (sezione POPS o mini-scope `/sua/`) e il sito pubblico separato. Nessuno controlla due gestionali: una officina sola con un'etichetta in più.
