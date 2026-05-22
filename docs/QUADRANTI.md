# QUADRANTI — Vista Eisenhower per QUASAR

> Piano di implementazione. Sorgente del prototipo: `risorseesterneperclaude/cepheid-actions_8.html`.
> Stato: **IMPLEMENTATO (v1)** sul branch `feature/cepheid-completamento-smistamento` — 2026-05-22.
> Route live: `/quasar/quadranti`. Type-check + build verdi. Non ancora testato a runtime in browser.

## Stato implementazione (v1)

File creati:
- `src/composables/quasar/useQuadranti.ts` — logica matrice (quadOf, cursore, forecast, conteggi)
- `src/composables/quasar/useResourceLoad.ts` — vista Risorse (carico per persona)
- `src/views/quasar/QuasarQuadrantiView.vue` — vista (matrice 2×2, cursore, toggle Task/Risorse, filtro, modal)

File toccati:
- `src/router/index.ts` — blocco `/quasar` + login `/quasar/login` + branch guard `quasarScope`
- `src/views/sidera/scopeConfig.ts` — `mobileNav` + `isTopLevelPath` quasar
- `src/views/sidera/SideraLayout.vue` — voce "Quadranti" nella sidebar QUASAR

Azioni per quadrante (tutte via `useAllTasks`, non distruttive):
- q1 Agisci → **Completa** (`completeTask`)
- q2 Pianifica → date picker inline → `updateTask({dueDate})`
- q3 Delega → modal compatto (assegnatari) → `updateTask({assignees})`
- q4 Valuta → modal compatto (rivaluta priorità/scadenza, NO delete)
- click sul titolo → stesso modal compatto

Follow-up noti: delega inline (popover avatar) al posto del modal per q3; versione mobile della matrice
(oggi stack verticale sotto 720px); eventuale FAB QUASAR; KPI aggregati (trend carico per quadrante).

---

## 1. Cosa è (in una riga)

Vista analitica QUASAR che dispone le **Azioni** (collection `tasks`) su una **matrice di Eisenhower 2×2**
(Urgenza × Importanza), con un **cursore temporale** che proietta lo stato "fra N giorni" facendo
emergere gli incendi futuri, più una seconda vista **Risorse** che mappa il carico per persona.

Nome modulo/scope: **QUASAR**. Nome vista/route: **`quadranti`** → `/quasar/quadranti`.

---

## 2. Il prototipo, decodificato

Il file HTML è un mock autonomo con dati finti. Funzioni chiave:

| Elemento prototipo | Comportamento |
|---|---|
| `quadOf(t,cur)` | `(due-cur) <= URG(3)` → urgente → `q1` se importante altrimenti `q3`; altrimenti `q2`/`q4` |
| Cursore `axRange` 0–14 | sposta `cursor` (giorni nel futuro); i task che superano la soglia urgenza mostrano chip **forecast** tratteggiato |
| Vista Task | 4 quadranti: **Agisci** (q1 urg·imp), **Pianifica** (q2 imp·non urg), **Delega** (q3 urg·non imp), **Valuta** (q4 né né) |
| Vista Risorse | 4 quadranti per carico persona: **Sovraccarico / In carico / Allerta / Disponibile** + barra urgenza |
| Filtro persona | chip avatar (GM/DA/EV/LU nel mock) |
| Azioni per quadrante | q1 **Avvia** (→doing), q2 **Pianifica** (date picker→reschedule), q3 **Delega** (assegna), q4 **Valuta** (rimuove) |
| Reconciler `axRender` | riusa le card DOM, aggiorna solo ciò che cambia (no blink globale) |
| Costanti | `URG=3` (giorni soglia urgenza), `MAXLOAD=4` (q1 overloaded), `LOAD_THRESH=3`, `PLOAD_URG=1` |

---

## 3. Mappatura prototipo → modello dati reale

Modello reale (`src/composables/sidera/useAllTasks.ts`, interface `Task`):

| Campo prototipo | Campo reale | Note di conversione |
|---|---|---|
| `n` | `title` | diretto |
| `due` (n° giorni) | `dueDate: Date \| null` | `due = Math.round((dueDate - oggi)/86400000)`; **`dueDate===null` → non urgente** |
| `imp` (bool) | `priority: 'alta'\|'media'\|'bassa'` | **DECISIONE A** (vedi §6) |
| `status` doing/review/todo | `status: 'todo'\|'done'` | **DECISIONE B**: il reale NON ha stato "in corso" |
| `a` (codici persona) | `assignees: string[]` (email) | usare `useTeamMembers()` per nome+avatar |

Primitive reali già disponibili (da riusare, **non** reimplementare):

- `useAllTasks()` → `tasks`, `updateTask(projectId, taskId, {priority, dueDate, assignees, ...})`,
  `completeTask`, `uncompleteTask`, `createTask`, `deleteTask`, `fileStandaloneTask`
- `useTeamMembers()` → `members`, helper `displayName(email, members)`, `starAvatarProps(email, members)`
- `useCurrentUser()` → `currentUser` (email, uid)
- `StarAvatar` component (`src/components/shared/StarAvatar.vue`)

> Nota architetturale: i task possono essere standalone (`tasks/`) o di progetto (`projects/{id}/tasks`).
> `updateTask` richiede `projectId` (o `null`). Il campo `projectId` è già su ogni `Task`.

---

## 4. Cosa è già pronto per QUASAR (non va creato)

| Elemento | Stato | File |
|---|---|---|
| Token colore `--s-quasar: #98C0D0` | ✅ | `src/style.css:93` |
| Tonal palette M3 quasar (15 toni) | ✅ | `src/style.css:263-279` |
| Scope CSS `.s-scope-quasar` | ✅ | `src/style.css:348-354` |
| Config scope (name, wordmark, loginPath) | ✅ | `src/views/sidera/scopeConfig.ts:112-120` |
| `detectScope()` riconosce `/quasar` | ✅ | `scopeConfig.ts:134` |
| QUASAR in `SUITE_PREFIXES` + Hub | ✅ | `App.vue:11` |

**Da completare in config**: `mobileNav` / `fab` / `isTopLevelPath` per quasar (oggi placeholder vuoti).

---

## 5. File da creare / toccare

```
src/views/quasar/
  QuasarQuadrantiView.vue      ← vista principale (matrice + cursore + toggle + filtro)
  components/
    QuadCard.vue               ← card azione singola (dot, nome, chip giorni, azione)
    ResourceCard.vue           ← card persona (avatar, stats, barra urgenza)

src/composables/quasar/
  useQuadranti.ts              ← logica: quadOf, cursore, conteggi, forecast (vista Task)
  useResourceLoad.ts           ← logica carico per persona (vista Risorse)

src/router/index.ts            ← + blocco /quasar con child 'quadranti' (requiresAuth)
src/views/sidera/scopeConfig.ts ← completare mobileNav/fab/isTopLevelPath quasar
```

CSS: nessuna nuova dipendenza. La matrice è una **CSS grid 2×2**; i colori usano i token M3
ereditati da `.s-scope-quasar` (primary = `#98C0D0`). Le icone: il prototipo usa Tabler via CDN —
verificare se in repo esiste già un set icone (es. heroicons già in dipendenze) e **riusare quello**
invece del CDN.

---

## 6. Decisioni (confermate 2026-05-22)

**A — Asse Importanza → ✅ A1.** `alta` = importante; `media`+`bassa` = non importante.
  Più selettivo: q1 "Agisci" resta riservato ai veri fuochi.

**B — Stato "in corso" → ✅ B1.** v1 **senza** stato intermedio. Il modello resta `todo`/`done`.
  q1 mostra solo il pallino; l'azione "Avvia" del prototipo diventa **Apri/Completa**.
  Nessuna modifica a Firestore, regole o viste CEPHEID esistenti.

**C — Azione q4 "Valuta" → ✅ C1.** Non distruttiva: apre il dettaglio / declassa priorità.
  **NON** si usa `deleteTask` in questa vista.

**D — Read-only vs azionabile → azionabile.** QUASAR diventa azionabile per le Azioni; ogni scrittura
  passa da `useAllTasks` (single source of truth), nessuna logica duplicata.

**E — View-switcher in testata.** La barra naviga **cross-scope** verso le viste CEPHEID esistenti
  (timeline/kanban/smistamento) + "Quadranti" come tab QUASAR. Wording UI da rifinire in fase 4.

---

## 7. Passi operativi

1. Branch `feature/quasar-quadranti`.
2. Route `/quasar/quadranti` + completare config scope quasar.
3. `useQuadranti.ts`: porta `quadOf`/forecast/conteggi sui dati reali (`useAllTasks`), con cursore reattivo.
4. `QuasarQuadrantiView.vue`: layout matrice 2×2 + cursore + toggle Task/Risorse + filtro persone (`useTeamMembers`).
5. `QuadCard.vue` / `ResourceCard.vue` con `StarAvatar` reale.
6. Cablare azioni per quadrante su `updateTask`/`completeTask` (secondo decisioni B/C/D).
7. `useResourceLoad.ts` per la vista Risorse (soglie come costanti tunabili).
8. Verifica: `npm run dev`, smoke test su dati reali (task con/ senza dueDate, multi-assignee, task di progetto vs standalone).
9. Aggiornare ATLAS/POLARIS se la vista introduce pattern condivisi.

---

## 8. Rischi / note

- **Task senza `dueDate`**: mai urgenti → finiscono in q2 (se importanti) o q4. Verificare che sia il
  comportamento voluto (alternativa: una colonna/sezione "senza scadenza").
- **Performance**: `useAllTasks` legge via `collectionGroup('tasks')` — la matrice filtra in locale, ok.
- **Mobile**: la matrice 2×2 su schermo stretto va ripensata (stack verticale dei quadranti).
  Definire `mobileNav` quasar prima del rilascio mobile.
- **Coerenza naming**: testata prototipo dice "QUASAR · AZIONI" ma la route è `quadranti` — confermare il
  wording UI (titolo "Azioni" con lente "Quadranti"?).
