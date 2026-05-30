# ANALISI MATURITÀ — Suite SIDERA

> Audit di coerenza, maturità e integrazioni trasversali dei moduli interni
> **PULSAR · NEBULA · CEPHEID · QUASAR** (+ shell SIDERA, NOVA).
> Questo è una **fotografia datata** — invecchia. Il *piano d'azione* derivato
> vive in `docs/POLARIS.md` (Azioni 10-15), che resta la fonte di verità del
> "cosa fare". Qui si risponde a: *sono coerenti? sono pronti per la consegna?*

**Data audit:** 2026-05-30
**Metodo:** lettura statica di views + composables + components + `functions/index.ts` + `firestore.rules` + `scopeConfig.ts` + router. Nessuna prova runtime.
**Verdetto sintetico:** coerenza architetturale alta (~85%); maturità media ~70% (sotto la soglia "80% consegnabile"); i gap principali sono **trasversali**, non per-modulo.

---

## 1. Coerenza tra i moduli — ~85% ✅

È il punto più forte del progetto. Non sono quattro app cucite insieme: condividono una spina dorsale reale.

- **Shell unica** (`src/views/sidera/SideraLayout.vue`) montata da tutti gli scope via route children, con login scoped (`ScopedLogin`), colore-brand per modulo, accordion sidebar e bottom-nav contestuale.
- **Registry dichiarativo** (`src/views/sidera/scopeConfig.ts`): un solo posto dove ogni modulo dichiara nav / FAB / scope notifiche. Aggiungere un modulo = appendere un'entry. Pattern eccellente.
- **Componenti condivisi** usati ovunque in modo consistente: `MdPageHeader`, `MIcon`, `StarAvatar`, `CepheidViewSwitcher` (riusato perfino in NEBULA e QUASAR), pattern card `surface + outline-variant + elevation-1`, `page-bg #EFE7D9` + dark mode coerente.
- **Material Design 3 + LYRA** (voce/microcopy) applicati uniformemente.
- **provide/inject tick** (`newChatTick`, `newTaskTick`, `newDocTick`…) per il trigger FAB cross-scope genitore→figli.

**Divergenze (minori, non bloccanti):**

| Divergenza | Dove | Note |
|---|---|---|
| `isMobileLayout()` duplicata | `router/index.ts:227` ↔ `SideraLayout.vue` | Commentata come scelta obbligata (il router gira prima del setup Vue). Accettabile. |
| 3 composabili mini quasi identici | `useTaskMini` / `useProjectMini` / `useUserMini` (NEBULA) | Da unificare in un pattern generico. |
| Modal "crea task" duplicato (~130 righe) | `PulsarMessageView.vue` ↔ `PulsarPendingView.vue` | Estrarre `components/pulsar/TaskCreationModal.vue`. |
| Form-modal CEPHEID ripetuti | 5 view CEPHEID | Stesso template field-label/field-input. |
| Logica risoluzione attore triplicata | `actorLabel`/`resolveMember`/`iconFor`/`toneFor` nelle 3 view QUASAR | Estrarre in composable condiviso. |
| Colori hardcoded nei componenti shared | `LinkedDocsPanel.vue:171` (`#C46030`) | Manca token accent dinamico per scope. |

---

## 2. Maturità per modulo — media ~70% ⚠️

> Soglia "consegnabile" indicata dall'utente: **80%**. Oggi non raggiunta.

| Modulo | Maturità | Verdetto |
|---|---|---|
| Shell condivisa (SideraLayout) | **72–85%** | Coerenza alta, maturità buona |
| CEPHEID | **72%** | Core solido (Obiettivi→Progetti→Azioni→Smistamento), manca rifinitura |
| PULSAR | **72%** | Chat solida; mancano allegati, offline, reazioni |
| QUASAR | **68%** | Logica sofisticata (Eisenhower, forecast), duplicazioni |
| NEBULA — Documentale | **72%** | Editor Notion-like maturo (autosave, LWW, presence, history, share, MCP) |
| **NEBULA — "HR/Anagrafiche"** | **35%** | ⚠️ Solo organigramma + edit ruolo. **Anagrafe / profili / HR non esistono** |
| Backend (Cloud Functions) | **68%** | 34 export, copertura buona |
| Security (Firestore rules) | **65%** | Due `update` troppo permissivi (vedi §3) |

### Dettaglio per modulo

**CEPHEID (72%)** — Nessun TODO/FIXME esplicito. Try/catch su tutte le azioni async, loading flags, empty states ovunque. Componenti ben riusati (`CepheidProjectCard`, `CepheidInboxCard`, `CepheidViewSwitcher`, `CepheidTimeline`). Debolezze: `confirm()` nativi non localizzati (`CepheidGoalsView.vue:117`, `CepheidProjectDetail.vue:177`), nessuna validazione input assignee, rischio timezone drift in `parseISO` (`useProjectTimeline.ts`), nessun toast errore.

**PULSAR (72%)** — Core chat completo: invio multilinea, `#hashtag`, `@mention` (autocomplete), presence (heartbeat 45s), unread (localStorage), reply quote, flag question/task, creazione task da messaggio, grouping bolle. **Mancano**: allegati/file, reazioni emoji, typing indicator, edit/delete messaggio, read receipts, offline queue, optimistic update. TODO esplicito: paginazione "carica altri" in `PulsarPendingView.vue:81` (cap a 100). Chat eliminate lasciano subcollection `messages` orfane (gestito però da Cloud Function `onChatDeleted`).

**QUASAR (68%)** — Matrice Eisenhower (`useQuadranti`), carico risorse (`useResourceLoad`), activity feed real-time (`useActivityLog`). Try/catch + loading + empty states presenti. Debolezze: duplicazione attore-resolution triplicata, nessun debounce sul cursor temporale (range slider → molte recompute), soglie urgenza/importanza hardcoded, nessun feedback su date scheduling fallito.

**NEBULA (Documentale 72% / Squadra 35%)** — Il Documentale è la vera NEBULA (≈90% del modulo): editor TipTap, autosave 1.5s, conflict LWW con dialog 3 opzioni, presence real-time (Yjs/CRDT, deployato 2026-05-29), mention poliglotta, share/ACL, history+restore, icon picker 250+, MCP server dual-auth. La **"Squadra" è uno stub**: solo organigramma + edit categoria/ruolo. **Il claim "HR · Anagrafiche · Documentale" è aspirazionale** — anagrafe, profili, gestione contratti/ore NON esistono. Residui: route `_dev/icons` da rimuovere; `TaskMentionNode.vue:14` apre CEPHEID in nuova tab invece che in modale (TODO); slash menu esteso (/task, /progetto) ancora da fare.

**Shell + Backend** — 34 Cloud Functions ben organizzate (team/auth sync, FiC integration, activity log, PULSAR chat, NEBULA docs+OAuth+MCP, maintenance scheduled). `SHOW_MOBILE_HEADER=false` (intenzionale). FCM scope raccolto a mount-time → non reattivo su switch desktop↔mobile.

---

## 3. Findings di sicurezza (Firestore rules) — verificati

> App interna a team fidato → rischio reale **basso**, ma per una "consegna 1.0" vanno chiusi.

| # | Severità | Finding | Riga |
|---|---|---|---|
| S1 | 🟠 Media | `tasks/{tid}` root: `allow update: if request.auth != null` → **qualunque utente loggato può modificare/completare/riassegnare task di chiunque** | `firestore.rules:115` |
| S2 | 🟠 Media | `obiettivi/{oid}`: `allow update: if request.auth != null` → idem su obiettivi altrui | `firestore.rules:161` |
| S3 | 🟡 Bassa | `preventivi/{id}` create senza validazione di stato (nessun vincolo `state == DRAFT`) | `firestore.rules:57` |
| S4 | 🟢 Info | Nessun rate-limiting server-side su create chat/task/doc (Firestore non lo offre nativamente) | — |
| S5 | 🟢 Info | `VAPID_KEY` hardcoded in sorgente (`useNotifications.ts:31`) → push FCM mai completate per moduli ≠ PULSAR | `useNotifications.ts:31` |

**Punti di forza rules:** `nebulaDocs` (ACL + mention + CORE-admin), `nebulaApiKeys`/`nebulaOauth*`/`config` (callable-only, Admin SDK), `activityLog` (scrittura solo backend → audit non falsificabile), `chats`/`messages` (member-gated). Pattern corretto.

> S1/S2 hanno forte overlap con **POLARIS Azione 9** (ruoli e permessi granulari).

---

## 4. Integrazioni trasversali proposte

Fondamenta cross-module **già esistenti**: `LinkedDocsPanel` (doc↔task/progetti), `activityLog` denormalizzato, `tasks` root condiviso PULSAR↔CEPHEID, `StarAvatar` unico, FCM scope-gated, triage counter CEPHEID in sidebar.

Proposte, in ordine di rapporto valore/sforzo (→ tradotte in POLARIS Azioni 10-15):

| Proposta | Valore | Sforzo | POLARIS |
|---|---|---|---|
| **`useToast` condiviso** (feedback errore visibile ovunque) | 🔴 Alto | Basso | Azione 10 |
| **Hardening rules** (S1/S2) | 🔴 Alto | Basso | Azione 11 (↔ Az.9) |
| **Push uniformi cross-modulo** (completa VAPID + assegnazione task/scadenze/mention) | 🟠 Alto | Medio | Azione 12 (↔ Az.1) |
| **@mention unificato** (PULSAR + CEPHEID, generalizzando `UniversalMention` NEBULA) | 🟠 Alto | Medio | Azione 13 |
| **Ricerca globale / Cmd-K** cross-modulo (doc + task + chat) | 🟡 Medio | Medio-alto | Azione 14 |
| **Stream attività consolidato** (sfrutta `activityLog` già scritto) | 🟡 Medio | Basso-medio | Azione 15 |

**Sinergie specifiche tra moduli:**
- PULSAR→CEPHEID esiste (crea task da messaggio): aggiungere link inverso (dal task → chat d'origine).
- NEBULA doc↔CEPHEID: `LinkedDocsPanel` c'è in un verso; completare `TaskMentionNode` per aprire il task in modale.
- QUASAR come tetto analitico: legge già `activityLog`; potrebbe aggregare KPI di tutta la suite (doc creati, throughput task, tempi risposta chat) → la "BI della suite".

---

## 5. Cosa manca per la "consegna 1.0"

**Bloccanti trasversali (i tre che tengono la suite sotto l'80%):**
1. **Zero feedback errore visibile all'utente** — ovunque `console.error`, mai un toast. Un `useToast` condiviso eleva la maturità percepita di tutti e 4 i moduli in un colpo solo.
2. **Rules permissive** S1/S2 (vincolare `update` a owner/assignee/admin).
3. **Niente offline/optimistic** (critico per PULSAR mobile).

**Da chiudere prima del go-live:**
- Rimuovere route `_dev/icons` (NEBULA).
- Decidere il destino di "Squadra/HR" NEBULA: declassare il claim a "Documentale + mini-Team" *oppure* pianificare l'anagrafe.
- Completare `VAPID_KEY` → push FCM (S5).
- Paginazione "carica altri" `PulsarPendingView`.

**Verdetto onesto:** consegnabili come **beta interna controllata** sì; come **prodotto "1.0 finito" no** — sei a ~70%, non 80%. Con ~2 settimane sui tre bloccanti trasversali (Azioni 10-12) la suite arriva all'80-85% reale tutta insieme.

---

## 6. Cronologia

- **2026-05-30** — Creazione documento. Audit statico completo dei 4 moduli + shell + backend + rules. Piano d'azione derivato inserito in POLARIS come Azioni 10-15.
