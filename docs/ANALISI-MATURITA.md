# ANALISI MATURITÀ — Suite SIDERA

> Audit di coerenza, maturità e sicurezza dei moduli interni
> **PULSAR · NEBULA · CEPHEID · QUASAR** (+ shell SIDERA, backend, rules).
> È una **fotografia datata** — invecchia. Il *piano d'azione* derivato vive in
> `docs/POLARIS.md` (Azioni 10-15), fonte di verità del "cosa fare". Qui si
> risponde a: *sono coerenti? sono maturi? sono sicuri per la consegna?*

**Data audit:** 2026-05-30 · **Ri-audit completo del codice:** 2026-06-07
**Metodo:** lettura statica di views + composables + components + `src/functions/index.ts` + `firestore.rules` + `scopeConfig.ts` + router, con evidenza `file:line`. Nessuna prova runtime.
**Verdetto sintetico:** coerenza architetturale alta (~78%); maturità **molto disomogenea** — il Documentale NEBULA è enterprise-grade (~88%), ma la "Squadra/HR" è uno stub (35%) e il ri-audit ha scoperto **buchi di sicurezza HIGH nuovi** (vedi §3). Media suite ~70%, sotto la soglia "80% consegnabile". I gap restano in gran parte **trasversali**.

> **Cosa è cambiato dal 2026-06-07** rispetto alla versione precedente: (1) scoperti 2 finding HIGH nelle rules (`trips`, collectionGroup `messages`) prima non visti; (2) corretto: VAPID **è presente** e le push FCM sono **complete** (il vecchio S5 era errato); (3) NEBULA Documentale rivalutato 72%→**88%**; (4) backend 34→**47 functions**, ~80%; (5) `useToast` **ancora assente** → confermato bloccante #1.

---

## 1. Coerenza tra i moduli — ~78% ✅

È il punto più forte del progetto. Non sono quattro app cucite insieme: condividono una spina dorsale reale e verificata.

- **Shell unica** (`SideraLayout.vue`): unico layout, deriva tutto da `detectScope(route.path)` (`SideraLayout.vue:51-52`), applica classi/accent scope-aware (`:524-525`), monta sidebar desktop + chrome mobile per ogni scope.
- **Registry dichiarativo** (`scopeConfig.ts:68-149`): `SCOPE_CONFIGS` dichiara nav/FAB/login/notifiche per modulo; `detectScope`/`getScopeConfig` (`:156-170`) sono l'unica fonte path→scope. Gating capability/admin dichiarativo (`requiresCapability`/`requiresCoreAdmin`). Aggiungere un modulo = appendere un'entry. Pattern eccellente.
- **Componenti condivisi realmente riusati** (conteggio file importatori): `MIcon` ×43, `StarAvatar` ×24, `MdPageHeader` ×19, `ContextualFab` ×4, `LinkedDocsPanel` ×3. Non sono shim.
- **`ScopedLogin` unico** parametrizzato, montato da tutte e 4 le route di login (`router/index.ts:106,134,177,205`).
- **provide/inject tick FAB** (`newChatTick`/`newTaskTick`/`newDocTick`…) provide-ati dallo shell (`SideraLayout.vue:93-102`), dispatch context-aware in `onFabTrigger` (`:104-150`). Disaccoppiamento shell↔view corretto.
- **Material Design 3** diffuso: 64 file usano token/classi `md-sys-*`/`md-btn`.

**Divergenze (rifinitura/dedup, non strutturali):**

| Divergenza | Dove | Note |
|---|---|---|
| `isMobileLayout()` **triplicata** | `router/index.ts:234-241` + `SideraLayout.vue:50` (computed) + `:75-77` (inline in `pickFcmScope`) | 3 copie della soglia 768px. La prima è scelta obbligata (router pre-setup); le altre due no. |
| 4 mini-composabili NEBULA | `use{Task,Project,User,Obiettivo}Mini.ts` (313 righe) | `useTaskMini`/`useProjectMini` quasi identici (`useTaskMini.ts:32-95` ≡ `useProjectMini.ts:29-86`). → `useDocMini(ref, mapper)` generico. |
| Form-modal CEPHEID copiate | 6 view (`CepheidActions/Due/GoalDetail/Goals/Projects/ProjectDetail`) | 12 blocchi `@click.self`/`modal-slide-from-bottom` + CSS `.modal-*` duplicato, **nonostante** esista `CepheidCreateModal.vue`. |
| Logica attore-resolution **duplicata verbatim** | `QuasarAttivitaView.vue:24-46` ≡ `QuasarCruscottoView.vue:130-150` | `resolveMember`/`actorLabel`/`iconFor`/`toneFor` copia-incollate. → `useActivityActor`. |
| Mention PULSAR **re-implementata** | `PulsarMessageView.vue:225-302` | Non riusa `UniversalMention` di NEBULA: euristiche `@` riscritte a mano (commento `:245` "stesse euristiche"). Doppia manutenzione. |
| Colori esadecimali hardcoded in shared | `LinkedDocsPanel.vue:171,172,177,208,226` (`#C46030`), `StarAvatar.vue:23,68`, `useProjectMini.ts:63` (`#D4A020`) | Bypassano i token M3 / `--module-accent`. |

---

## 2. Maturità per modulo — media ~70% ⚠️

> Soglia "consegnabile" indicata dall'utente: **80%**. Oggi non raggiunta come media, ma con una distribuzione molto larga (35% → 88%).

| Modulo | Maturità | Verdetto |
|---|---|---|
| Shell condivisa (SideraLayout) | **~78%** | Coerenza alta, qualche debito di dedup |
| **NEBULA — Documentale** | **~88%** ↑ | Stack enterprise (CRDT+LWW+presence+ACL+history+MCP). Il fiore all'occhiello |
| Backend (Cloud Functions) | **~80%** ↑ | 47 export, 7 aree, OAuth/MCP/Yjs/maintenance |
| CEPHEID | **~78%** ↑ | Feature-complete, gerarchia + timeline; manca UX-errori |
| PULSAR | **~74%** | Chat solida + optimistic/offline; mancano feature + error-feedback |
| QUASAR | **~70%** | Logica sofisticata (Eisenhower, calendario), duplicazioni |
| Security (Firestore rules) | **~62%** | S1/S2 chiusi ma 2 buchi HIGH nuovi (vedi §3) |
| **NEBULA — "Squadra/HR"** | **~35%** | ⚠️ Solo organigramma read-only. **Anagrafe / profili / HR non esistono** |

### Dettaglio per modulo

**NEBULA — Documentale (~88%)** — Il vero cuore del modulo. Tutto verificato: editor TipTap completo (`NebulaDocPage.vue`, 1321 righe: StarterKit + Table + Link + TaskList checkbox); **doppia conflict-resolution** — Yjs/CRDT real-time (`FirestoreYjsProvider.ts` provider Firestore-native, echo-suppression, compaction `yupdates` append-only; `useCollabDoc.ts` con kill-switch `core/nebula.collabEnabled` + migrazione lazy `initYDoc`) **e** LWW autosave (`useSaveDoc.ts`, `baseRevision`→`failed-precondition`); presence live (`CollaborationCaret`/Awareness, `PresenceStack.vue`); 9 estensioni mention/embed + slash command; share/ACL (`useShareDoc.ts`, owner-only server-side); history/restore (`restoreDoc`); archive/soft-delete 90gg; MCP server + OAuth reale (`useApiKeys.ts`, `NebulaOAuthConsentView.vue`). **Residui:** (a) route dev `docs/_dev/icons` **ancora presente** (`router/index.ts:169`, commento "da rimuovere a Fase 1" — siamo a Fase 6); (b) i mention/embed aprono il target **in nuova tab** (`window.open(_blank)`) invece che in modale — pattern **sistemico** su tutti i 9 node (`TaskMentionNode.vue:46`, `ProjectMentionNode.vue:44`, …), TODO mai chiuso (`TaskMentionNode.vue:14,39`); (c) cestino/undelete senza UI — il `confirm()` promette "recuperabile 90gg" (`NebulaDocsHomeView.vue:267`) ma `unarchiveNebulaDoc` non è cablato ad alcuna schermata.

**CEPHEID (~78%)** — Gerarchia completa Obiettivi→Progetti→Azioni→Smistamento, in prod (PR #14). Data-layer condiviso (`useAllTasks`/`useProjects` in `composables/sidera/`, non duplicato), timeline sofisticata (`useProjectTimeline.ts`, fasi/milestone/deliverable), permessi server-side (`canEditTask`/`canCompleteTask`). Try/catch + loading + empty states ovunque. **Nessun TODO/FIXME.** Debolezze: 4 `confirm()` nativi (`CepheidGoalsView.vue:112`, `CepheidActionsView.vue:263`, `CepheidProjectsView.vue:95,177`); errori solo `console.error` (≈7 punti, es. `CepheidInboxView.vue:52,56`) → smistamento/delete possono fallire in silenzio; `CepheidProjectDetail.vue:191` `catch(_){/*ignore*/}` inghiotte l'errore; nessuna validazione "≥1 assegnatario".

**PULSAR (~74%)** — Core chat completo: real-time (`onSnapshot`), grouping bolle, reply-quote con scroll-to-message, flag question/task, hashtag, deep-link `?msg`/`?reply`, presence (heartbeat), unread aggregato, Pendenze (triage domande/proposte). **Optimistic send** ben fatto (`PulsarMessageView.vue:304-343`, ripristino testo on-catch) + offline implicito (coda Firestore). Debolezze: **zero error-feedback** (10× `console.error`); `useMessages.ts:49-52` carica **tutti** i messaggi senza `limit` (scala male su chat lunghe); `PulsarPendingView.vue:245-263` **duplica** la logica di invio invece di riusare `sendMessage` (e omette `refs`); mention re-implementata anziché riusata. **Mancano:** allegati, reazioni, edit/delete singolo messaggio, typing, read receipts, ricerca.

**QUASAR (~70%)** — Cruscotto KPI, Attività (audit-log real-time `useActivityLog`), Quadranti Eisenhower (`useQuadranti`, cursore a 4 step discreti — **niente debounce serve**), Calendario EPHEMERIS (CRUD appuntamenti). Try/catch + loading/empty ovunque, `canSubmit` con validazione. Debolezze: `QuasarAppointmentModal.vue:125` usa `confirm()` nativo (incoerente col pattern modal); attore-resolution duplicata (vedi §1); 6× `console.error` senza UI; `useAppointments.ts` espone CRUD "nudi" senza try/catch interno (error-handling delegato ai chiamanti).

**NEBULA — Squadra/HR (~35%)** — `NebulaTeamView.vue` (672 righe): **sola visualizzazione read-only**, 3 viste (Organigramma / Gerarchia da `managerUid` / Lista). La view destruttura solo `{ members, loading }` (`:21`); il composable espone `updatePosition`/`updateCategory` (`useNebulaTeam.ts:109-115`) ma **la view non li usa** → resta **CSS morto** per un editor mai cablato (`.nb-pos-trigger`/`.nb-popover`, `:348-672`). Il modello `NebulaMember` (`useNebulaTeam.ts:6-20`) ha solo email/nome/ruolo/telefono/position/category/managerUid: **zero contratti, ore, dati personali, presenze, documenti-persona**. **Il claim "HR · Anagrafiche · Documentale" è in gran parte aspirazionale**: solo "Documentale" (modulo separato) è reale; "HR/Anagrafiche" non esiste come funzionalità.

**Backend (~80%)** — **47 export** in `src/functions/index.ts`, 7 aree coerenti coi moduli: team/auth sync (6), FiC/ordini (9, con provider astratto `lib_billing`), activityLog (4), PULSAR chat+push (3), NEBULA docs/share/history (8), NEBULA Yjs/CRDT (5), NEBULA API-key/OAuth/MCP (8), notifiche/appuntamenti (3), maintenance scheduled. Punti forti: OAuth 2.0/DCR + MCP dual-auth, Yjs con compaction server-side, scheduled cleanup (`oauthCleanup`/`presenceCleanup`/`awarenessCleanup`/`historyPrune`/`appointmentReminders`). Detrazioni: **zero rate-limiting** (vedi §3-D); numerose funzioni one-shot di migrazione ancora esportate (`migrateAllTeamClaims`, `backfill*`, `audit*`) da ritirare; test solo in `lib_md` e `lib_yjs`.

---

## 3. Findings di sicurezza (Firestore rules + backend) — ri-verificati 2026-06-07

> App interna a team fidato → rischio reale moderato, **ma** `preventivi`/`trips`/`chats` sono toccati anche da utenti **CLIENTE** in POPS (parte live), quindi alcuni finding sono più seri di una pura app interna.

### Stato dei finding storici
| # | Severità | Finding | Riga attuale |
|---|---|---|---|
| S1 | ✅ Risolto | ~~`tasks` update aperto~~ → admin / assegnatario (`assignees`) / creatore | `firestore.rules:110-114, 133-137` |
| S2 | ✅ Risolto | ~~`obiettivi` update aperto~~ → admin / creatore | `firestore.rules:184-186` |
| S3 | 🟠 Media-alta | `preventivi/{id}` create senza validazione: nessun vincolo `state=='DRAFT'` **né** `clienteUID==self` → un cliente può creare preventivi con stato arbitrario o intestati ad altri | `firestore.rules:61` |
| S5 | ✅ Chiuso (era errato) | ~~VAPID mancante → push non completate~~ → **VAPID presente** (`useNotifications.ts:32`, chiave pubblica reale) e **push FCM complete** (3 punti di invio) | `useNotifications.ts:32` |

### Finding NUOVI scoperti nel ri-audit
| # | Severità | Finding | Riga |
|---|---|---|---|
| **N1** | 🔴 **Alta** | `trips/{tripId}`: `allow read, write: if request.auth != null` → qualunque loggato crea/modifica/cancella viaggi altrui | `firestore.rules:98` |
| **N2** | 🔴 **Alta** | collectionGroup `match /{path=**}/messages` read a qualunque loggato → **bypassa il member-gating di `chats`**: chiunque legge TUTTI i messaggi di TUTTE le chat | `firestore.rules:169-171` |
| **N3** | 🟠 Media | `chats` create senza vincolo `createdBy==self`/membro; `messages` create senza vincolo `from==self.email` né appartenenza → impersonazione mittente | `firestore.rules:145, 153` |
| **N4** | 🟠 Media | Nessun **rate-limiting** server-side: chat/doc/task in loop generano push/scritture; endpoint pubblici OAuth/MCP (`/token`, DCR `/register`, `consentOAuthRequest`) esposti a brute-force | `index.ts` (tutto) |
| **N5** | 🟢 Bassa | `chatHashtags/{tag}` write libera a qualunque loggato | `firestore.rules:175` |

**Punti di forza rules (confermati):** `nebulaDocs` (ACL + mention + CORE-admin, write `if false` → solo callable `saveDoc`), `yupdates` (append-only con `author==self`/`origin=='client'`/`keys().hasOnly`), `activityLog`/`config`/`nebulaApiKeys`/`nebulaOauth*` (`if false`, solo backend → audit non falsificabile), `team` update self limitato a `fcmTokens` via `affectedKeys().hasOnly`, catch-all `if false`. L'impalcatura è corretta; i buchi sono su collezioni "legacy" POPS (`trips`, `chats`, `preventivi`) non riviste nell'hardening Az.11.

---

## 4. Integrazioni trasversali & bloccanti

Fondamenta cross-module **già esistenti**: `LinkedDocsPanel` (doc↔task/progetti), `activityLog` denormalizzato, `tasks` root condiviso PULSAR↔CEPHEID, `StarAvatar` unico, FCM scope-gated (push complete), back-link PULSAR↔CEPHEID (`sourceChatId`/`sourceMessageId`).

| Proposta | Valore | Sforzo | POLARIS |
|---|---|---|---|
| **`useToast` condiviso** — **ANCORA INESISTENTE** (vedi sotto) | 🔴 Alto | Basso | Azione 10 |
| **Chiudere i nuovi buchi rules** N1/N2 (`trips`, collectionGroup `messages`) + S3 | 🔴 Alto | Basso | → estendere Az.11 |
| **@mention unificato** — fatto in PULSAR (ma re-implementato, non riusato); portarlo in CEPHEID + unificare l'euristica | 🟠 Alto | Medio | Azione 13 |
| **Push uniformi** — base completa (VAPID+3 trigger); resta lo scope FCM non reattivo su switch desktop↔mobile (`SideraLayout.vue:73-84`) | 🟠 Medio | Basso | Azione 12 |
| **Ricerca globale / Cmd-K** cross-modulo | 🟡 Medio | Medio-alto | Azione 14 |
| **Stream attività consolidato** (sfrutta `activityLog`) | 🟡 Medio | Basso-medio | Azione 15 |

**Sinergie tra moduli:**
- PULSAR↔CEPHEID **bidirezionale** (back-link task→chat presente). Follow-up: superficiare il link anche in CEPHEID con un task-detail.
- NEBULA doc↔CEPHEID: `LinkedDocsPanel` c'è in un verso; i mention aprono in nuova tab → completare l'apertura **in modale** (TODO `TaskMentionNode.vue:14`).
- QUASAR come "BI della suite": legge già `activityLog`, può aggregare KPI cross-modulo.

---

## 5. Cosa manca per la "consegna 1.0"

**Bloccanti trasversali:**
1. **🔴 Zero feedback errore visibile** — `useToast` **NON esiste** (verificato: nessun file `*toast*`/`*snackbar*` in `src/`; l'unico è privato in `AdminView.vue:42-51` di POPS). I moduli ripiegano su `console.error` (16× in PULSAR+QUASAR), `confirm()`/`alert()` nativi (CEPHEID, 3 view NEBULA), o 3 toast ad-hoc indipendenti in NEBULA (`ni-toast`/`ndh-toast`/`nh-toast`). Un `useToast` condiviso alza la maturità percepita di **tutti** i moduli in un colpo. **Resta il singolo intervento col miglior rapporto valore/sforzo.**
2. **🔴 Buchi rules nuovi** N1 (`trips`) + N2 (cross-chat `messages` read) — HIGH, su collezioni live POPS. Vanno chiusi prima di qualunque "1.0". (S1/S2 già chiusi; S3 ancora aperto.)
3. **🟠 Squadra/HR aspirazionale** — decidere: declassare il claim a "Documentale + organigramma" *oppure* pianificare davvero l'anagrafe. Oggi è CSS morto + write-API irraggiungibile.

**Da chiudere prima del go-live:**
- Rimuovere route `_dev/icons` (`router/index.ts:169`).
- Aprire i mention NEBULA **in modale** invece che in nuova tab; cablare il cestino/undelete.
- PULSAR: `limit` + paginazione in `useMessages`; riusare `sendMessage` in PendingView.
- QUASAR: estrarre `useActivityActor`; sostituire `confirm()` con modal.
- Backend: aggiungere rate-limit agli endpoint pubblici OAuth/MCP (N4); ritirare le functions di migrazione one-shot.

**Verdetto onesto:** consegnabili come **beta interna controllata** sì; come **prodotto "1.0 finito" no**. Il Documentale NEBULA è già da 1.0 (~88%); il resto è a ~70-78% con due buchi di sicurezza HIGH appena scoperti che vanno chiusi a prescindere. Priorità singola col miglior ritorno: **`useToast` condiviso** (Az.10), in parallelo alla chiusura di N1/N2 (estensione Az.11).

---

## 6. Cronologia

- **2026-05-30** — Creazione documento. Audit statico completo dei 4 moduli + shell + backend + rules. Piano d'azione derivato → POLARIS Azioni 10-15.
- **2026-06-03** — Aggiornamento PULSAR (PR #62 + #64): TaskCreationModal, optimistic/offline, paginazione Pendenze, back-link task→chat, mention `@` unificate. Verificato hardening rules S1/S2 in prod.
- **2026-06-07** — **Ri-audit completo del codice** (4 agenti paralleli, evidenza `file:line`). Esiti principali: (1) scoperti 2 finding HIGH nuovi nelle rules — `trips` (N1) e collectionGroup `messages` (N2) — più N3/N4/N5; (2) **corretto S5**: VAPID è presente e le push FCM sono complete; (3) NEBULA Documentale rivalutato 72%→**88%** (CRDT+LWW+presence+ACL+history+MCP tutti reali); (4) backend 34→**47 functions**, ~80%; (5) CEPHEID 72%→78%, QUASAR 68%→70%; (6) **`useToast` ancora assente** → confermato bloccante #1; (7) confermati: route `_dev/icons` presente, mention in nuova tab (sistemico), Squadra/HR read-only con CSS morto, coerenza ~78% con duplicazioni note (`isMobileLayout` ×3, mini-composabili, form-modal CEPHEID, attore-resolution QUASAR).
