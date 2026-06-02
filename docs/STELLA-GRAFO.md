# STELLA-GRAFO — Identità degli agenti e re-key `/team` su UID

> Come si identifica un membro del team ("agente") nella suite, e come si migra
> la collezione `/team` da chiave-email a chiave-UID senza rompere POPS.
> Fonte di verità del *modello identità* e del *runbook di migrazione*.
> Avvio lavori: 2026-06-01. Branch: `feature/team-uid-rekey`.

## TL;DR

- **L'identità immutabile di un agente è il Firebase Auth UID.** L'email è un *attributo mutabile* (la credenziale di login). Il codice fiscale è un dato HR, **mai** una chiave.
- I **clienti POPS** (`/users/{uid}`) sono già uid-keyed → prova che il modello funziona. Il `/team` è "rimasto indietro" su email-keyed per ragioni storiche.
- La migrazione (Strada B) è **non distruttiva e reversibile**, ma la finestra di coesistenza è **visibile a chi legge l'intera collezione `/team`** → vincolo: rendere i lettori dedup-tolleranti **prima** del backfill.

---

## 1. Modello identità

> **L'agente È il suo Auth UID. Email e ruolo sono attributi.**

| Candidato a "ID" | Verdetto |
|---|---|
| **Email** | ❌ come chiave: è anche il login, cambia (refuso, dominio, ruolo). Resta come *campo* mutabile. |
| **Auth UID** | ✅ **canonico.** Immutabile per la vita dell'account, già generato, già nel campo `uid`. |
| Campo custom (`agentId`) | superfluo: l'UID *è già* l'id assegnato una volta. |
| Codice fiscale | ❌ chiave: PII/GDPR, assente per account di sistema, può mancare alla creazione. Solo campo HR opzionale. |

**Identità canonica admin:** `gionata.pastorin@proton.me` / UID `xs8Zb5Dur4YbyzUNV7OR1m9qJBI3` (ruolo ADMIN).

**Break-glass:** `info@inglesinaitaliana.it` è super-admin via fallback hardcoded in `isAdmin()` (`firestore.rules:9-11`) e account di sistema (`HIDDEN_TEAM_EMAILS`). I suoi poteri **non** dipendono dal doc `/team` → è la via di rientro durante la migrazione. **Il fallback non si tocca.**

**Cambio email (TODO collegato):** va fatto con `admin.auth().updateUser({ email })` che **preserva l'UID** — mai cancellando/ricreando l'account (vedi `docs/` e memoria client-email-change).

---

## 2. Principio di proprietà

> **SIDERA CORE possiede l'identità. I moduli possiedono le proiezioni.**

- CORE = ciclo di vita dell'agente (uid, email, ruolo, `active`, account Auth).
- Moduli = consumatori: leggono `/team`, scrivono solo i propri campi (NEBULA: `position`/`category`; PULSAR: `fcmTokens`).
- POPS = consumatore (staff che fa login, commerciali sui preventivi).

`STELLA-GRAFO` = la *proiezione* visuale del team come grafo (nodi `StarAvatar`, archi via campo `managerEmail`/`managerUid` — futuro). Oggi la "Squadra" è una lista; diventa grafo con l'aggiunta degli archi.

### Convenzione campi core vs estensioni di modulo (ex accesso-e-gestione §3)
Campi **core** (identità) vivono in `/team/{uid}`: `uid`, `email`, `firstName`,
`lastName`, `role`, `active`. Le **estensioni di modulo** restano lì finché poche
(`position`/`category` NEBULA, `hueIndex` avatar, `fcmTokens` PULSAR). Se un modulo
avrà config sua sul collaboratore (listino, provvigioni, sede), **non** entra in
`/team` → doc separato chiave-uid (es. `/team/{uid}/modules/pops` o `/popsTeamConfig/{uid}`).

### Due livelli di "admin" (distinti, gestiti insieme)
- **Ruolo** (`/team/{uid}.role`) = permessi operativi (rules `isAdmin()`, routing).
- **Admin CORE** (`core/admins.emails`, email-keyed) = accesso alla sezione CORE
  (Manutenzione/Integrazioni/Gestione team). Ortogonale al ruolo. `info@` è
  super-admin hardcoded (break-glass). Il cambio-email sincronizza `core/admins`.
Entrambi si gestiscono dall'unica pagina **`/sidera/core/team`** (CoreTeamView).

---

## 3. Migrazione `/team` email-keyed → uid-keyed (Strada B)

### Vincolo che governa tutto

La finestra di **coesistenza** (doc email-keyed + uid-keyed insieme) è **visibile a chi legge l'INTERA collezione** `/team`: vede doppioni. POPS live lo fa in `AdminSettings.vue` e `DeliveryView.vue` (nessun dedup). Perciò:

> I lettori-di-collezione vanno resi **dedup-tolleranti e deployati PRIMA** del backfill.

### Sequenza corretta (5 fasi + 1 prerequisito)

| Fase | Cosa | Distruttivo? | Deploy |
|---|---|---|---|
| **0** | Audit: ogni doc ha `uid` allineato all'Auth (`auditTeamUids`, read-only). Gate `readyForBackfill`. | No | functions |
| **1** | Trigger `syncTeamRoleToAuth` migration-safe (key-agnostic; delete non azzera claim se dup-check o flag). | No | functions |
| **2a** | **Lettori dedup-tolleranti** (`useTeamMembers`, `useNebulaTeam`, `AdminSettings`, `DeliveryView`): dedup per email preferendo uid-keyed; `email` dal *campo*; `HIDDEN_TEAM_EMAILS` su `data.email`. | No | **hosting** |
| **2b** | Backfill `backfillTeamToUid`: crea `team/{uid}` come copia, attiva `core/migration.teamRekey`. | No (additivo) | esecuzione |
| **3** | Switch letture single-doc + scritture su uid (vedi §4). | No (legge gli uid-keyed già presenti) | **hosting + functions** |
| **4** | Verifica ruoli POPS (Admin/Prod/Logistica/Cliente/info@) prima di cancellare. | — | — |
| **5** | Cleanup: cancella i doc email-keyed; poi `teamRekey=false`. | **Sì** (irreversibile) | esecuzione |

Rollback in qualsiasi momento prima della Fase 5: `rollbackTeamBackfill` (cancella gli uid-keyed, spegne il flag). Provato il 2026-06-01.

---

## 4. Mappa dei punti da cambiare (Fase 2a + 3)

**Lettori di collezione → dedup-tolleranti (Fase 2a):**
- `src/composables/sidera/useTeamMembers.ts` — `email: data.email` (non `d.id`); `uid: d.id`; filtro `isHiddenTeamEmail(data.email)`; dedup per email preferendo doc uid-keyed.
- `src/composables/nebula/useNebulaTeam.ts` — idem.
- `src/views/AdminSettings.vue:209` — dedup; `id` = uid quando presente.
- `src/views/DeliveryView.vue:149` — dedup autisti.

**Letture single-doc per email → per uid (Fase 3):**
- `src/composables/sidera/useCurrentUser.ts:28`
- `src/views/LoginView.vue:66` (POPS — routing login)
- `src/router/index.ts:299` (guard)
- `src/components/GlobalBugReporter.vue:55`

**Scritture per doc-id → uid (Fase 3):**
- `src/composables/shared/useNotifications.ts:89` (fcmTokens)
- `src/views/AdminSettings.vue:316` (update membro → doc-id = uid)
- `src/functions/index.ts` `createTeamMember:558` → `.doc(userRecord.uid)`

**Functions con risoluzione `email→uid` (Fase 3):**
- `src/functions/index.ts:1540, 3083` (target FCM) + `:1611, 3139` (cleanup token) → `where('email','in', batch)`.

**Rules (Fase 3):**
- `firestore.rules` `match /team/{memberId}`: self-update fcmTokens → `request.auth.uid == memberId`.

---

## 5. Strumentazione (deployata in prod)

Callable gated `REKEY_ADMINS` (`info@`, `proton.me`) in `src/functions/index.ts`; UI in `SideraCoreSettings.vue` (`/sidera/core/settings`), bottoni gated `isCoreAdmin`:
- `auditTeamUids` — read-only, report + `readyForBackfill`.
- `backfillTeamToUid` — dual-write non distruttivo + kill-switch ON.
- `rollbackTeamBackfill` — cancella uid-keyed + kill-switch OFF.
- `syncTeamRoleToAuth` — trigger migration-safe (doppio guard anti-lockout sui delete).

`core/migration.teamRekey` (bool) = kill-switch: quando ON il trigger non azzera i claim sui delete.

---

## 6. Modello permessi, ruoli e funzioni (POLARIS Az.6/9)

- **Scope unificato**: il guard rileva lo scope con `detectScope()` (riusa `scopeConfig`); login scoped da `getScopeConfig().loginPath`.
- **Routing centralizzato**: `src/router/permissions.ts` (**puro TS**, no Vue/Firebase) — `allowedPathsByRole`, `roleFallbackPath`, `forbiddenClientPaths`, `isPathAllowedForRole`, `postLoginRoute` (NB: PRODUZIONE→`/production`). Consumato da guard **e** LoginView (prima duplicati/disallineati).
- **Capabilities dichiarative**: `Capabilities` + `ROLE_CAPABILITIES` + `capabilitiesFor` in permissions.ts; composable `useCan()` (super-admin info@ + `isCoreAdmin` **ortogonale**). Le Firestore rules restano il confine di sicurezza; questo è gating UX.
- **UNA sola tassonomia gestita a mano: la categoria** (5: direzione, amministrazione, produzione, logistica, commerciale — `tecnico` rimosso). Il **ruolo-permessi (4)** si **DERIVA** via `CATEGORY_TO_ROLE`/`roleForCategory`. `direzione`+`amministrazione` → ADMIN, distinte per avatar + **scudo CORE** (toggle separato, mai derivato dalla categoria).
- **Funzioni gestibili**: collezione Firestore `funzioni/{id}` = `{ label, category, order }` (ruolo derivato). Composable `useFunzioni` (CRUD + `seedDefaults` + fallback ai default `FUNZIONI` in `useNebulaTeam`). UI: `/sidera/core/funzioni` (`CoreFunzioniView`, gated isCoreAdmin). Rule `funzioni` (read auth, write admin).
- **Agente funzione-first**: in CORE → Gestione team si sceglie la **FUNZIONE** (creazione + select per-riga, con conferma) → setta `position`+`category`+`role`. NEBULA → Squadra è **sola visualizzazione**.
- **Permessi granulari CEPHEID** (capabilities, CEPHEID non in uso reale): ADMIN tutto; COMMERCIALE ampio + crea progetti (no Obiettivi/team); PRODUZIONE crea task + solo le proprie (no Obiettivi/smistamento); LOGISTICA sola lettura+completa delle proprie (PULSAR completo). `canManageGoals`=solo ADMIN (Obiettivi); `canTriage`=ADMIN+COMMERCIALE (Smistamento). Agganci: `allowedPathsByRole`, NavItem `requiresCapability`, FAB `showFab`, view-guard (`CepheidGoalsView`/`CepheidInboxView` redirect), task-level `isOwnTask`/`canEditTask`/`canCompleteTask` in `CepheidActionsView`.
- **Fix login**: `getTeamDoc` riconferma da server su cache-miss (`getDocFromServer`) → niente più staff bloccato con "Utenza non configurata".
- **Hardening rules (S1/S2, Az.11)**: `tasks` (root + `projects/*/tasks`) e `obiettivi` — `update` non più "qualunque loggato" ma **own-or-admin** (assegnatario per email / creatore per uid; fix `assignee`→`assignees`). Confine grezzo nelle rules; granularità fine per-ruolo resta lato client. **S3 (preventivi/POPS) NON toccato** (più rischioso, separato).
- **STELLA-GRAFO vero (`managerUid`)**: campo `managerUid` su `/team` (da chi dipende). Si assegna in CORE → Gestione team (select "Responsabile" per agente + opz. in creazione, `createTeamMember`). Visualizzato in **NEBULA → Squadra → tab "Gerarchia"**: albero indentato da `managerUid` (radici = senza responsabile, anti-ciclo). NEBULA Squadra resta sola lettura (l'editing identità vive in CORE).

⚠️ **Trappola build**: `vue-tsc` passa ma `vite build` intercetta errori di sintassi nelle espressioni del template (es. `a ?? b || c` senza parentesi). **Verificare sempre l'esito di `npm run build`, non solo il type-check, prima del deploy.**

---

## 7. Cronologia

- **2026-06-01** — Creazione documento. Decisione identità (UID canonico). Branch `feature/team-uid-rekey`. Fasi 0-1-2 implementate, deployate e collaudate; rollback provato → checkpoint pulito in prod. Scoperto il vincolo "lettori dedup-tolleranti prima del backfill" (doppioni visibili su POPS in coesistenza).
- **2026-06-01** — **RE-KEY COMPLETATO.** Fase 2a (lettori dedup-tolleranti) + Fase 3 (switch single-doc/scritture/functions/rules su uid, migration-tolerant) deployate (functions + rules + hosting). Backfill → verifica POPS (login staff + ruoli su uid-keyed, nessun doppione) → **Fase 5 cleanup**: 9 email-keyed rimossi, kill-switch spento, `fullyDone: true`. `/team` è ora interamente **uid-keyed**. Audit finale: 9 già uid-keyed, 0 problemi.

- **2026-06-01** — **Gestione team in CORE + cleanup tooling.** Implementato accesso-e-gestione §1 (UI gestione team in SIDERA CORE, route `/sidera/core/team`), §2 (`active` soft-disable + filtro liste), §4 (refresh token post-ruolo); §3 (convenzione campi) assorbita qui sopra. CF `changeTeamMemberEmail` (cambio email preservando UID + sync `core/admins`). **Admin CORE unificato** nella gestione team (toggle scudo); pagina Impostazioni separata rimossa (assorbita). Rimosso il tooling di migrazione (4 callable + bottoni) e semplificato `getTeamDoc` (solo uid). `docs/accesso-e-gestione.md` → superato da questo doc.

- **2026-06-02** — **POLARIS Az.6 + Az.9 (funzione-first + permessi granulari).** Branch `feature/polaris-roles-funzione-first`. Scope unificato (`detectScope`), `permissions.ts` (routing + capabilities), `useCan`, fix cache-miss login. Creazione/gestione agente **funzione-first**; categoria→ruolo derivato (`tecnico` rimosso); collezione `funzioni` editabile (`/sidera/core/funzioni`). Permessi granulari CEPHEID (LOGISTICA/PRODUZIONE solo le proprie, COMMERCIALE crea progetti, Obiettivi solo-ADMIN, Smistamento ADMIN+COMMERCIALE). NEBULA Squadra sola lettura. Reset password agente. Tutto deployato a fasi con verifica POPS (login cliente/staff OK, PRODUZIONE→/production).

- **2026-06-02** — **Hardening rules + organigramma (`managerUid`).** Branch `feature/permessi-hardening-organigramma`. Rules `tasks`/`obiettivi` ristrette a own-or-admin (S1/S2 chiusi; S3 lasciato). `managerUid` + select Responsabile in CORE; tab "Gerarchia" (albero) in NEBULA Squadra. Pulizie: rimossa popover morta NebulaTeamView; bottone "Ripristina predefiniti" funzioni (pulisce `role` residuo). NEBULA Squadra sola lettura confermata.

### Stato finale / strascichi (non urgenti)
- **S3** (preventivi/POPS, create senza validazione stato) ancora aperto — hardening separato, più rischioso (POPS live).
- CSS morto residuo in `NebulaTeamView` (`.nb-pos-trigger`, `.nb-list-edit`, stili popover) — micro-cleanup.
- Organigramma "Gerarchia" è albero indentato v1; eventuale org-chart centrato con rami orizzontali = evoluzione UI futura.
- Il codice migration-tolerant (`getTeamDoc` uid→email fallback, `dedupeTeamDocs`) è ora end-state: il ramo email è dead-path innocuo. Si può semplificare in futuro.
- Le callable/bottoni di migrazione (`auditTeamUids`, `backfillTeamToUid`, `rollbackTeamBackfill`, `cleanupTeamEmailKeyed` + UI in `SideraCoreSettings`) sono dormienti e admin-gated: rimovibili in un cleanup successivo.
- TODO collegato: cambio-email via `admin.auth().updateUser` (preserva UID) — vedi memoria client-email-change.
