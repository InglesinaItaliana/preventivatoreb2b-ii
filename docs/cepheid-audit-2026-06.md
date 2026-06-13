# CEPHEID — Audit & fix (giugno 2026)

Branch: `fix/cepheid-audit-2026-06`. Analisi approfondita del modulo CEPHEID
(7 view, 17 componenti, 3 composable + data layer condiviso). Sotto: tutti i
findings con stato. ✅ = sistemato in questo branch · ⏳ = decisione di prodotto
lasciata aperta (vedi note).

## 🔴 Bug — sistemati

| # | Stato | File | Cosa |
|---|-------|------|------|
| 1 | ✅ | `CepheidActionCard.vue` + Actions/Due views | `hideSoleSelfAssignee` confrontava UID (assignees) con email → l'avatar "io" non si nascondeva mai. Aggiunta prop `currentUserUid`, confronto su UID (con tolleranza email legacy). |
| 2 | ✅ | `useAllTasks.ts`, Actions/Due views | `createStandaloneTask` non scriveva `triaged` → azioni create dal modal completo finivano (o no) nello Smistamento in modo incoerente con `createTask`. Aggiunto param `triaged` (scritto solo se esplicito, per non toccare il flusso PULSAR); i modal passano `triaged:true`. |
| 3 | ✅ | `CepheidDueView.vue` | Bucket "Questa settimana" usava `< oggi+7` → la scadenza del 7° giorno spariva. Ora `< oggi+8` (include l'intera giornata). |
| 4 | ✅ | `CepheidInboxCard.vue` | `flyOut` senza guard → doppio tap/swipe poteva emettere `smista`/`delete` due volte. Aggiunto `if (leaving.value) return`. |
| 5 | ✅ | `CepheidProjectDetail.vue`, `CepheidGoalDetail.vue` | `pct` non clampato → con contatori driftati poteva superare 100%. `Math.min(100, Math.max(0, …))`. |
| 6 | ✅ | `CepheidProjectDetail.vue` | Task con `status` orfano (rimosso dalla config) sparivano dal Kanban. Ora dirottati sulla prima colonna (restano visibili, coerenti col `taskCount`). |
| 7 | ✅ | `CepheidProjectsView.vue` | `toISOString()` (UTC) nel modal edit → data sfasata di −1 giorno a ovest di UTC. Sostituito con formattazione locale `toDateInput`. |

## 🟠 Incongruenze — sistemate

| # | Stato | File | Cosa |
|---|-------|------|------|
| 8 | ✅ | `permissions.ts`, Actions/Due views | "Le mie azioni" definita in due modi diversi tra Azioni e Scadenze. Estratto helper canonico `isMyAction` (semantica *strict*: assegnata a me, o creata da me e non assegnata) usato in entrambe. |
| 9 | ✅ | `CepheidDueView.vue` | Scadenze non applicava i permessi: `doComplete`/modal create senza gate. Aggiunti `useCan` + `canCompleteTask` + gate `canCreate` (CTA nascosta se non abilitato). |
| 11 | ✅ | `CepheidGoalDetail.vue` | Filtro progetti collegati diverso da GoalsView (mancava `active !== false`) → conteggi/% divergenti. Allineato. |

## 🟡 Incompleto / robustezza — sistemati

| # | Stato | File | Cosa |
|---|-------|------|------|
| 13 | ✅ | `useProjectTimeline.ts` | Gating timeline era solo CSS (`pointer-events:none`), aggirabile. Aggiunte guard logiche in `toggleDone`/`toggleTimed`/`commitDrag`/`setPhaseDue`/`approve`. |
| 14 | ✅ | `useProjectTimeline.ts` | Campo `order` ("sequenza fase") mai usato: ordine derivato solo da `dueDate`. Aggiunto comparatore `byOrderThenDue` (rispetta `order` se presente, fallback a data). |
| 15 | ✅ | Actions/Due/ProjectDetail | `pendingDone` ottimistico mai ripulito + `await` senza catch → checkbox bloccata su errore, "riapri" che faceva sparire il task. Aggiunti rollback su errore e pulizia del set opposto. |
| 16 | ✅ | `CepheidProjectDetail.vue` | Note: `getDoc` fallita lasciava abilitato l'autosave → un draft vuoto poteva sovrascrivere le note. Ora l'autosave si abilita SOLO dopo una lettura riuscita. |
| 17 | ✅ | Projects/Goals views | `await` Firestore nudi (delete/link/unlink/changeStatus): aggiunti try/catch + feedback. `deleteGoal` reso **atomico** con `writeBatch` (niente `obiettivoId` dangling). |
| 19 | ✅ | `useAllTasks.ts`, `CepheidInboxView.vue` | Ri-smistando un task su un deliverable diverso restava agganciato anche al precedente. Aggiunto `detachFromDeliverable` + detach automatico nello smistamento. |

## 🔵 Pulizia / mobile / perf — sistemati

| # | Stato | File | Cosa |
|---|-------|------|------|
| 12 | ✅ | `CepheidAssigneePills.vue` | `:hover` non gate-ato → su iOS si "incollava" al tap, in conflitto col toggle. Spostato dentro `@media (hover: hover)`. |
| 18 | ✅ | `GoalProgressBar.vue`, `useObiettivi.ts`, `CepheidDueView.vue` | Rimossi orfani/codice morto: componente `GoalProgressBar` (mai importato), export `archiveObiettivo` (feature rimossa), blocco CSS `.task-row/.row-*` non più usato in Scadenze. |
| P1 | ✅ | `CepheidActionsView.vue` | `tasksInGroup` faceva 3 `.filter()` per gruppo ad ogni render. Pre-raggruppato una volta in un `computed`. |

## ⏳ Lasciati aperti (decisione di prodotto, NON modificati)

- **#10 — Metrica di progresso progetto incoerente.** La card lista mostra il
  progresso derivato dalla timeline (fasi/deliverable); il dettaglio usa
  `doneCount/taskCount`. Sono due definizioni diverse di "% completamento".
  Va deciso quale è la fonte di verità prima di unificarle (lato Obiettivi
  l'incoerenza è stata risolta rimuovendo l'orfano `GoalProgressBar` e
  allineando il filtro progetti). *Nessun cambiamento di comportamento fatto.*
- **Chevron** (`CepheidGoalCard`): segnalati dall'analisi come fuori linea
  guida, ma confermati OK dall'utente. Lasciati.

## Note di verifica
- `vue-tsc --noEmit`: exit 0. `vite build`: exit 0.
- Modulo non ancora in uso reale dal team (solo Gionata); POPS resta la parte
  live. Test manuale consigliato su iPhone per #4/#12 (touch) e #3 (bucket).
