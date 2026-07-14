# CLAUDE.md — Mappa del codebase

Un unico codebase Vue 3 + TypeScript + Vite + Firebase con due anime:

1. **POPS** — preventivatore B2B per inglesine (preventivi → ordini → produzione → DDT/consegne). **LIVE IN PRODUZIONE** su https://preventivatoreb2b-ii.web.app, usato quotidianamente dal team.
2. **Suite SIDERA** — PWA interne (QUASAR, CEPHEID, PULSAR, NEBULA, NOVA) sotto `/sidera`, `/pulsar/`, ecc. In uso reale solo da Gionata: rischio basso, ma condivide shell/router/functions con POPS.

*Mappa aggiornata al 2026-07-14 — se la struttura cambia in modo sostanziale, aggiornare questo file.*

## Regole operative

- POPS è live: **mai modificare codice senza autorizzazione esplicita**; lavorare sempre su feature branch.
- `src/functions/index.ts` (~4300 righe) contiene le funzioni di fatturazione live (FiC/CiC): solo blocchi additivi; `npm --prefix src/functions run build` (tsc) deve uscire 0 prima di ogni deploy functions.
- Prima del deploy hosting: `npm run build` REALE (vue-tsc può passare dove `vite build` fallisce; un build fallito fa caricare a firebase il `dist/` stantio).
- Account Firebase/gcloud: sempre `info@inglesinaitaliana.it`.
- Processo git/GitHub/deploy: `docs/WORKFLOW.md`. La CI deploya su push a `main`.

## Comandi

| Cosa | Comando |
|---|---|
| Dev server | `npm run dev` |
| Build produzione | `npm run build` (output in `dist/`) |
| Test frontend | `npm run test` (vitest, happy-dom) |
| Type-check frontend | `npx tsc --noEmit -p tsconfig.app.json` (nessuno script dedicato) |
| Build functions | `npm --prefix src/functions run build` (tsc → `src/functions/lib/`, che è output compilato: NON editarlo) |

Firebase: progetto `preventivatoreb2b-ii`, hosting single-site (`dist`, SPA rewrite), Firestore `eur3`, functions **v1** Node 20 regione **`europe-west1`**. Emulatori: auth 9099, functions 5001, firestore 8080.

## Struttura

```
src/
  main.ts, App.vue, firebase.ts     # bootstrap (mount dopo onAuthStateChanged); firebase.ts esporta auth/db/storage/functions
  router/index.ts                   # TUTTE le route (POPS + suite) + guard beforeEach in un solo file (~350 righe)
  router/permissions.ts             # gating puro TS: Role, allowedPathsByRole, ROLE_CAPABILITIES
  types.ts                          # modello dominio POPS (StatoPreventivo, PreventivoDocumento, ...) — ~330 righe, economico da leggere intero
  types/                            # bugs.ts, nebula-fleet.ts
  views/*.vue                       # view POPS (root level)
  views/{sidera,quasar,cepheid,pulsar,nebula,nova}/   # view suite
  components/                       # modali POPS root + sottocartelle per modulo + shared/
  composables/                      # per modulo; auth in composables/sidera/ (NON shared/)
  logic/                            # motore prezzi POPS + logic/griglie/ (geometria, puro TS, testato)
  Data/catalog.ts                   # store Pinia del listino
  lib/                              # billing client-side + PDF (billing.ts, billingTotals.ts, billingPdf.ts, billingPdfDraw.ts)
  functions/                        # Cloud Functions (codebase separato CommonJS): index.ts + lib_billing/ lib_listino/ lib_bugs/ lib_mcp/ lib_md/ lib_yjs/
docs/                               # documenti autoritativi (v. fondo)
public/                             # manifest PWA statici (*.webmanifest), icone, SW FCM per-scope
firestore.rules, firestore.indexes.json, firebase.json
```

# POPS (produzione)

## Route → view

| Route | View | Scopo |
|---|---|---|
| `/` | `views/LoginView.vue` | login |
| `/preventivatore` | `views/BuilderView.vue` | **il preventivatore** — creazione preventivo riga per riga, prezzi live, azioni ciclo di vita `salvaPreventivo(azione)` |
| `/admin` | `views/AdminView.vue` | gestione ordini admin (chiama `cancelOrder`, `creaDdtCumulativo`, `getFreshFicUrl`) |
| `/admin/settings` | `views/AdminSettings.vue` | listino (`manageListino`), team, import clienti CiC, config prezzi, sconto pagamento cliente (lucchetto → `manageCustomerDiscount`, scrive su CiC) |
| `/dashboard` | `views/ClientDashboard.vue` | area cliente (propri preventivi/ordini, PDF) |
| `/production` | `views/ProductionDashboard.vue` | reparto produzione (IN_PRODUZIONE/READY) |
| `/delivery` | `views/DeliveryView.vue` | logistica: DDT, viaggi, sessioni autista |
| `/griglie` | `views/GriglieConfiguratorView.vue` | configuratore geometrico griglie (taglio/nesting, consuma `logic/griglie/`) |
| `/calcoli`, `/stack`, `/onboarding` | CalcoliLavorazioni, StackVisualizer, OnboardingView | utilità |

Modali chiave in `src/components/`: `OrderModals.vue`, `DdtModal.vue`, `DeliveryModal.vue`, `ArchiveModal.vue`, `PriceBreakdownModal.vue`, `delivery/TripManageModal.vue`.

## Ciclo di vita ordine (il percorso caldo)

- **Una sola collezione `preventivi`**: lo stesso doc transita di stato. Enum `StatoPreventivo` in `src/types.ts`: `DRAFT → PENDING_VAL → QUOTE_READY → ORDER_REQ → WAITING_SIGN → SIGNED → IN_PRODUZIONE → READY → DELIVERY → SHIPPED → DELIVERED` (+`REJECTED`; `WAITING_FAST` ritirato ma ancora nell'enum e nel trigger). Bucket query: `ACTIVE_STATUSES` / `ARCHIVE_STATUSES`.
- **Emissione ordine**: trigger `generaOrdineFIC` (onWrite `preventivi/{docId}` in `functions/index.ts`) scatta quando `stato` entra in WAITING_SIGN/WAITING_FAST e non c'è ancora un order id → sceglie backend via `resolveBillingBackend()` → crea ordine su FiC (path legacy inline in index.ts) o CiC (`generaOrdineCiC` → `lib_billing/`), scrive `fic_order_id`/`cic_order_id`.
- **DDT**: callable `creaDdtCumulativo` (unificata, rifiuta mix FiC/CiC); righe DDT costruite da `lib_billing/ddtLines.ts` (pura); scrive `*_ddt_id/number/url`, porta gli ordini a SHIPPED/DELIVERY. `autoDeliveredAfter7Days` (scheduled) chiude a DELIVERED.
  ⚠️ **Su CiC la FATTURA NASCE DAL DDT** (fattura differita di fine mese), non dall'ordine: ciò che non finisce sulle righe del DDT non viene fatturato a nessuno, e ci si accorge dell'errore solo a fine mese. Regole in `ddtLines.ts`: merce + lavorazioni entrano tutte; le consegne si unificano in UNA sola (tariffa più alta, qty 1, rinominata "Spedizione"/L004 se corriere) e restano a **prezzo pieno** (il trasporto non prende lo sconto d'ordine); il prezzo unitario porta già lo sconto d'ORDINE, mentre il campo sconto di riga porta lo sconto di PAGAMENTO del cliente (`defaultDiscountPct`, letto al volo da CiC — mai duplicato in Firestore), che la fattura eredita. Dopo l'emissione il netto viene **riletto da Reviso** e confrontato con l'atteso POPS → `billingError` se diverge (non bloccante).
- **Metadati billing inline sul preventivo**: `billingBackend` ('fic'|'cic', congelato alla prima emissione), `billingError` (mismatch totali o fallimento DDT), `cic_*`/`fic_*` id e url, `colli/corriere/trackingCode`.

## Motore prezzi

- `logic/pricing.ts` — dispatcher `calculatePrice(input, activeList)`; `calculateLogic2026` è il default (perimetro/metri sviluppo, fasce S/M/L/XL, regimi INCROCIO/PARALLELE/SINGOLA, moltiplicatori solo-canalino). Listini legacy in `pricing2025.ts`/`pricing2025x.ts`.
- `Data/catalog.ts` — store Pinia: `listino_base` (48 prezzi base, source of truth) + `catalogo` (~389 righe struttura menu che ereditano prezzo da `listino_base[cod]`); sorgente selezionata da `settings/pricing.catalogSource==='firestore'`, altrimenti fallback CSV Google Sheet. Espone `listino` (albero menu) e `codiciMap` (cod→prezzo).
- `logic/priceBreakdown.ts` — `costruisciDettaglio()`: spiega/riconcilia il prezzo salvato senza mai ricalcolarlo come fonte di verità (`riconcilia:false` se non riproduce).
- `logic/customerConfig.ts` — contesto pricing per cliente (`price_list_mode`, tariffa consegna, detrazione).
- `logic/griglie/` — modello geometrico puro (nessun Vue/Firestore): `progetto.ts` (ConfigGriglia, stili LONDRA/MILANO/VENEZIA, barre/pezzi/foratura), `diagonale.ts`, `nesting.ts` (piano taglio), `finiture.ts`, `materiali.ts`. Test in `logic/__tests__/` e `logic/griglie/__tests__/`.
- Totali: `lib/billingTotals.ts` client e `functions/lib_billing/rounding.ts` server implementano la STESSA regola canonica (`round2` half-up con nudge 1e-9 stile Reviso), tenuta allineata da un test anti-drift. `computeTotals` accetta uno sconto **per riga** che sovrascrive quello globale: serve al **trasporto, che non prende mai lo sconto d'ordine** (`isRigaConsegna` → `discountPct: 0`) — stessa regola in BuilderView (cifra a video + `netCanonico`), PDF, ordine CiC e DDT, altrimenti il cliente firma una cifra e ne paga un'altra.

## Billing FiC ↔ CiC (functions)

- Astrazione: `functions/lib_billing/types.ts` → interfaccia **`BillingProvider`**; implementata solo da `cicProvider.ts` (Reviso REST, auth 2 header statici). Il path FiC resta inline in `index.ts` (OAuth token in `config/fic`, refresh via `getValidFicToken()`).
- **Kill-switch**: `config/billing.activeBackend` in Firestore — default `'fic'` se assente o in errore; `'cic'` solo se esplicito. Il routing legge il flag globale, non il campo client-writable.
- Config CiC: `cicConfig.ts` (doc `config/cic` + env `REVISO_APP_SECRET`/`REVISO_AGREEMENT_GRANT`; serie DDT 29, layout 9, IVA V022).
- Flusso DDT CiC: crea Draft → issue → rilegge numero; su fallimento issue cancella la bozza orfana (una bozza non emessa sulla serie condivisa blocca le successive).
- Anti-orfano: l'order id viene scritto subito dopo la creazione per bloccare il re-trigger; se l'errore avviene prima dell'id, sul doc non resta nulla (rischio ordine orfano silenzioso su 500 transitorio CiC — incidente noto).
- PDF client-side: `lib/billingPdf.ts` (jsPDF; `openOrderPdf/openQuotationPdf/openDdtPdf`; arricchisce con anagrafica da `users/{clienteUID}`) + `lib/billingPdfDraw.ts` (draw condiviso, costante `COMPANY`).
- Listino Fase 2: callable `manageListino` (CiC-first: `createProduct` → `products/` → `listino_base/` → `catalogo/`); generatore codici `lib_listino/codici.ts` (LETTERA categoria + 3 cifre posizionali, immutabili; INGLESINA=I, DUPLEX=D, MUNTIN=M, CANALINO=C).

# Modello dati Firestore

Regole d'accesso (`firestore.rules`): admin = custom claim `role=='ADMIN'` o email super-admin `info@inglesinaitaliana.it` (+fallback lettura doc `team` per lag claim); clienti isolati via `clienteUID`; collezioni backend-only (config, counters, nebulaApiKeys/Oauth*) negate al client; scritture sensibili (bugs, activityLog, nebulaDocs) solo via callable Admin SDK; catch-all deny.

| Collezione | Scopo | Note chiave |
|---|---|---|
| `preventivi` | Doc unico preventivo→ordine→DDT | `stato`, `clienteUID`, `elementi[]`, `totaleImponibile/totaleScontato/netCanonico`, `commessa`, billing `billingBackend/billingError/fic_*/cic_*`, spedizione `colli/corriere/trackingCode` |
| `users` | Clienti B2B (doc id = Auth UID) | anagrafica (`ragioneSociale`, `piva` → lookup cliente FiC/CiC, `citta`) + pricing (`price_list_mode`, `delivery_tariff_code`, `detraction_value`) |
| `team` | Staff interno (fonte dei custom claim) | `role` ADMIN/PRODUZIONE/COMMERCIALE/LOGISTICA, `fcmTokens[]`, `hueIndex`; chiavi = UID (re-key STELLA-GRAFO) |
| `listino_base` / `catalogo` | Prezzi base (48) / struttura menu (389) | v. Motore prezzi |
| `products` | Mappa cod POPS → id FiC + `cicProductId` | scritta da CF (sync) |
| `settings` | `settings/pricing` (catalogSource, delivery_tariffs), `general`, `integrations` | lettura client, scrittura admin |
| `config` | `config/billing` (kill-switch), `config/fic`, `config/cic` | **solo CF**, negata al client |
| `core` | `core/admins.emails[]` allowlist CORE | gating sezione CORE/bug tracker |
| `trips` | Viaggi consegna (board logistica) | |
| `funzioni`, `counters`, `bugs`, `activityLog` | mansioni→ruolo; contatori atomici (CF only); bug tracker (write CF only); audit feed QUASAR (write CF only) | |
| Suite: `projects` (+`/tasks`), `tasks`, `obiettivi`, `chats` (+`/messages`), `chatHashtags`, `nebulaDocs` (+history/presence/awareness/yupdates), `nebulaArchivio*`, `vehicles`, `vehicleDeadlines`, `nebulaApiKeys`, `nebulaOauth*` | CEPHEID/PULSAR/NEBULA/QUASAR | task: `assignees[]` = UID; chat: membri per email; nebulaDocs: ACL + Yjs CRDT |

# Cloud Functions (`src/functions/`)

`index.ts` ~4300 righe, ~56 export, tutto v1 `europe-west1`. **Critiche POPS**: `generaOrdineFIC` (trigger emissione ordine), `creaDdtCumulativo`, `cancelOrder`, `resetOrderState`, `getFreshFicUrl`, `manageListino`, `manageCustomerDiscount` (admin-only: legge/scrive lo sconto cliente su CiC per P.IVA, via `getCustomerDiscount/setCustomerDiscount` del provider), sync (`syncProductsWithFic`, `syncCicMappings`, `importClientsFromFiC/CiC`), `autoDeliveredAfter7Days`, `sendInvitesToClients`.

Il resto: team/claims (`syncTeamRoleToAuth`, `createTeamMember`, `changeTeamMemberEmail`, backfill vari), PULSAR push (`onNewPulsarMessage`), QUASAR activity+calendario (`logTaskActivity*`, `notifyOnAppointment`, `appointmentReminders`), NEBULA docs (`saveDoc`, `shareDoc`, `indexDocRefs`, `notifyOnMention`, Yjs `nebulaYjsMaintenance` + snapshot/restore/GC schedulati), MCP (`mcpSidera` canonico + alias `mcpNebula`, OAuth+PKCE in `lib_mcp/oauth.ts`, ~26 tool in `lib_mcp/server.ts`), bug tracker (`lib_bugs/`).

Segreti: env (`FIC_CLIENT_ID/SECRET`, `REVISO_*`, `GMAIL_*` via `.env` locale al deploy, non committato) + doc Firestore `config/*`. Nessun `defineSecret`/`functions.config()`.

# Suite SIDERA (mappa rapida)

Pattern architetturale: ogni PWA monta la STESSA shell `views/sidera/SideraLayout.vue` come route parent con `meta.<scope>Scope`; `views/sidera/scopeConfig.ts` è il registro degli scope (chrome mobile, loginPath, colori). Login riusabile `views/shared/ScopedLogin.vue`. Manifest statici in `public/*.webmanifest` iniettati da script inline in `index.html`; FCM con SW per-scope (`useNotifications.ts` in `composables/shared/`). **Auth composables in `composables/sidera/`** (non shared/): `useCurrentUser`, `useCoreAdmins` (`isCoreAdmin`), `useCan`, `useTeamMembers`.

| Modulo | Prefisso | View in | Scopo |
|---|---|---|---|
| SIDERA | `/sidera` | `views/sidera/` | vetrina suite + CORE (team, funzioni, bug, manutenzione, integrazioni) |
| QUASAR | `/quasar` | `views/quasar/` | cruscotto, quadranti Eisenhower, attività (audit), calendario |
| CEPHEID | `/cepheid` | `views/cepheid/` | progetti/obiettivi/milestone/azioni + inbox smistamento; data layer in `composables/sidera/` (useProjects/useProjectTasks/useObiettivi) |
| PULSAR | `/pulsar` | `views/pulsar/` | chat team + hashtag + task da chat |
| NEBULA | `/nebula` | `views/nebula/` (+`docs/`) | squadra, archivio file, mezzi + doc stile Notion (TipTap+Yjs, `composables/nebula/FirestoreYjsProvider.ts`) |
| NOVA | `/sidera/nova/spedizioni` | `views/nova/` | board spedizioni (legge `preventivi` per stato); NON ancora PWA autonoma |

# File costosi da leggere interi (~righe)

`BuilderView.vue` 2150 · `AdminSettings.vue` 1500 · `AdminView.vue` 1270 · `DeliveryView.vue` 1145 · `ClientDashboard.vue` 1040 · `GriglieConfiguratorView.vue` 820 · `functions/index.ts` 4300 · `style.css` ~55KB. Leggerli per sezioni mirate (Grep prima, Read con offset/limit poi).

# Documenti autoritativi in `docs/`

- `ATLAS.md` — manuale architetturale + ricette (come aggiungere PWA/moduli/componenti shared). Leggere prima di modifiche strutturali.
- `POLARIS.md` — roadmap strategica (Azioni 1–15, doc vivo).
- `WORKFLOW.md` — processo git/GitHub/Firebase/deploy.
- `STELLA-GRAFO.md` — identità/ruoli/permessi e re-key `/team` a UID. Leggere prima di toccare auth/team.
- `NEBULA-DOCS.md` — spec completa docs Notion-style. Leggere prima di toccare nebula/docs.
- `LYRA.md` — voce/microcopy (scope SOLO suite SIDERA: mai applicare il registro LYRA a POPS, che resta tecnico-neutro). `ANALISI-MATURITA.md` — audit maturità. `POPSnextstep.md` — roadmap consegne POPS. `blueprint.md` — blueprint POPS originale. `STELLA-GENESI.md` — visione grafo (concettuale).
