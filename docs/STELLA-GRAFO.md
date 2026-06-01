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

## 6. Cronologia

- **2026-06-01** — Creazione documento. Decisione identità (UID canonico). Branch `feature/team-uid-rekey`. Fasi 0-1-2 implementate, deployate e collaudate; rollback provato → checkpoint pulito in prod. Scoperto il vincolo "lettori dedup-tolleranti prima del backfill" (doppioni visibili su POPS in coesistenza).
- **2026-06-01** — **RE-KEY COMPLETATO.** Fase 2a (lettori dedup-tolleranti) + Fase 3 (switch single-doc/scritture/functions/rules su uid, migration-tolerant) deployate (functions + rules + hosting). Backfill → verifica POPS (login staff + ruoli su uid-keyed, nessun doppione) → **Fase 5 cleanup**: 9 email-keyed rimossi, kill-switch spento, `fullyDone: true`. `/team` è ora interamente **uid-keyed**. Audit finale: 9 già uid-keyed, 0 problemi.

### Stato finale / strascichi (non urgenti)
- Il codice migration-tolerant (`getTeamDoc` uid→email fallback, `dedupeTeamDocs`) è ora end-state: il ramo email è dead-path innocuo. Si può semplificare in futuro.
- Le callable/bottoni di migrazione (`auditTeamUids`, `backfillTeamToUid`, `rollbackTeamBackfill`, `cleanupTeamEmailKeyed` + UI in `SideraCoreSettings`) sono dormienti e admin-gated: rimovibili in un cleanup successivo.
- TODO collegato: cambio-email via `admin.auth().updateUser` (preserva UID) — vedi memoria client-email-change.
