# WORKFLOW — Guida pratica a Git, GitHub e Firebase

> Spiegazione operativa di come funziona il flusso di sviluppo per `preventivatoreb2b-ii`.
> Pensata per chi non fa lo sviluppatore di mestiere ma deve capire cosa succede quando si cambia il codice.

---

## 1. Le 4 "verità parallele" che devi tenere a mente

Quando lavori su questo progetto, esistono **4 luoghi diversi** dove vive il codice, e ognuno può essere a uno stato diverso degli altri. La maggior parte della confusione nasce dal non distinguerli.

| # | Dove | Cosa è | Quando cambia |
|---|---|---|---|
| 1 | **File sul tuo Mac** | Quello che modifichi nell'editor | Quando salvi un file |
| 2 | **Git locale** | La "fotografia" del codice nel tuo Mac, con storia di tutte le versioni | Quando fai `git commit` |
| 3 | **GitHub** (`github.com/InglesinaItaliana/...`) | Backup remoto della storia git, accessibile da web | Quando fai `git push` |
| 4 | **Firebase Hosting** (`preventivatoreb2b-ii.web.app`) | Cosa vedono i clienti e il team | Quando fai `firebase deploy --only hosting` |

**Punto chiave:** **modificare un file sul Mac non lo rende live**. Devi attraversare 3 cancelli (commit → push → deploy) per arrivare ai clienti. Ogni cancello è esplicito, nessuno succede da solo.

### Esempio concreto

Stamattina hai:
- ✏️ Modificato `ProjectBoard.vue` (Mac)
- 💾 Committato e pushato (Git locale + GitHub)
- 🌐 NON deployato (Firebase Hosting)

Risultato: il codice è al sicuro su GitHub, ma i clienti non vedono ancora nulla. Devi fare il deploy.

---

## 2. Concetti base di Git

### Branch

Un **branch** ("ramo") è una linea di sviluppo separata. Pensa al codice come a una pianta:
- Il **tronco principale** è `main` (= produzione)
- I **rami** sono le feature branch (es. `polaris/1-fcm-token-scope`)
- Ogni ramo può crescere indipendentemente
- Quando un ramo è pronto, **si innesta** (merge) nel tronco

```
main      ─●──●──●──●──●  ← produzione (= clienti)
                  │
polaris/1         └──●──●  ← branch isolato, lavori qui
```

### Commit

Un **commit** è una "fotografia salvata" del codice in un momento. Ogni commit ha:
- Un **hash** (es. `108f678`) — l'identità univoca
- Un **messaggio** — cosa è stato fatto e perché
- Un **parent** — il commit precedente
- Un **autore** + data

I commit sono **immutabili**: una volta fatti non cambiano. Per "annullare" un commit, ne fai un altro che disfa le modifiche (`git revert`).

### HEAD

`HEAD` è la "posizione corrente" — punta al commit più recente del branch attivo. Quando fai `git checkout <branch>`, sposti HEAD su un altro punto.

### Working tree, staging, commit

Tre stati intermedi delle tue modifiche:

```
   Modifichi file
        │
        ▼
   Working tree         ← modifiche non salvate in git
        │  git add
        ▼
   Staging area         ← modifiche "pronte" per il prossimo commit
        │  git commit
        ▼
   Commit nel branch    ← salvato in git (locale)
        │  git push
        ▼
   Branch su GitHub     ← backup remoto
```

---

## 3. Il branch `main` e i feature branch

### Regola d'oro

> **`main` = produzione.** Il codice in `main` deve essere sempre uguale (o un passo avanti) a quello che vedono i clienti.

Da questa regola derivano tutte le altre:
- ❌ **Mai committare direttamente su `main`.** Mai. Anche se è un fix piccolo.
- ✅ Per qualunque modifica, **crea un feature branch da `main`**, lavora lì, e quando OK lo unisci tramite PR.

### Naming dei branch

Convenzione semplice e leggibile:

| Tipo | Pattern | Esempio |
|---|---|---|
| Roadmap POLARIS | `polaris/<n>-<slug>` | `polaris/1-fcm-token-scope` |
| Feature nuova | `feature/<slug>` | `feature/notifiche-push` |
| Bug fix urgente | `fix/<slug>` | `fix/login-mobile-ios` |
| Esperimento | `exp/<slug>` | `exp/dark-mode` |
| Refactor | `refactor/<slug>` | `refactor/firebase-modular` |

Niente spazi, niente accenti, niente lettere maiuscole — solo `[a-z0-9-/]`.

### Ciclo di vita di un feature branch

1. **Nasce** da `main` (`git checkout -b polaris/1-fcm-token-scope main`)
2. **Cresce** con i commit
3. **Si pubblica** su GitHub (`git push -u origin polaris/1-fcm-token-scope`)
4. **Diventa una PR** verso `main`
5. **Si unisce** a `main` tramite merge della PR
6. **Muore** subito dopo il merge (`--delete-branch` automatico)

Un feature branch **non dovrebbe vivere più di qualche giorno**. Più resta isolato, più diventa difficile re-integrare i cambiamenti nel frattempo arrivati su `main`.

---

## 4. Workflow standard — GitHub Flow

Questo è il flusso che useremo da qui in poi. Ogni cambiamento di codice passa attraverso questi 6 step:

```
┌─────────────────────────────────────────────────────────────────┐
│  1. Branch da main                                              │
│     git checkout -b polaris/2-manifest-statici main             │
│                                                                 │
│  2. Lavora + commit                                             │
│     (modifica file, salva)                                      │
│     git add <file>                                              │
│     git commit -m "msg"                                         │
│                                                                 │
│  3. Push del branch su GitHub                                   │
│     git push -u origin polaris/2-manifest-statici               │
│                                                                 │
│  4. Crea PR su GitHub (web o gh CLI)                            │
│     gh pr create --base main                                    │
│                                                                 │
│  5. (Opzionale) Preview Channel per testare                     │
│     firebase hosting:channel:deploy polaris-2 --expires 7d      │
│                                                                 │
│  6. Merge PR + deploy produzione                                │
│     gh pr merge <numero> --squash --delete-branch               │
│     firebase deploy --only hosting                              │
└─────────────────────────────────────────────────────────────────┘
```

Tra step 4 e 6 c'è **review** (anche di te stesso) e **test**. Mai mergiare frettolosamente.

---

## 5. Pull Request (PR) — cosa, perché, come

### Cos'è

Una **Pull Request** è la richiesta formale di **unire un branch in un altro** (tipicamente: feature branch → main).

Quando crei una PR su GitHub:
- 📊 Vedi il **diff completo** (cosa è stato modificato, riga per riga)
- 💬 Puoi commentare riga per riga
- ✅ Puoi eseguire **check automatici** (test, build, lint) se configurati
- 📝 Resta come **documento storico** ("perché ho cambiato X?" → apri la PR)

### Perché usarla anche se sei solo

Anche senza colleghi che ti reviewano, la PR è utile:
- **Pausa-controllo**: ti forza a rivedere tutta la modifica prima di mergire. Spesso scopri errori
- **Documentazione automatica**: titolo + descrizione + commenti restano in archivio
- **Rollback chirurgico**: GitHub ti permette di fare "Revert PR" con un click → annulla tutta la PR con un singolo commit
- **Tracciabilità**: ogni PR ha un numero (`#1`, `#2`...) referenziabile da issue, da altri PR, da commit

### Tre stili di merge (cosa scegliere)

Quando mergi una PR, GitHub ti dà 3 opzioni:

| Stile | Cosa fa | Quando usarlo |
|---|---|---|
| **Squash and merge** (raccomandato per noi) | Collassa tutti i commit della PR in **un solo commit** nel main. Il messaggio del commit include il numero PR | Storia lineare, leggibile. Default. Sempre. |
| **Rebase and merge** | Riapplica i commit della PR uno per uno sopra a main | Se la PR ha più commit ben separati che hanno senso preservare singolarmente |
| **Create a merge commit** | Crea un commit di merge che mantiene la storia "ramificata" della PR | Mai per noi — rumore inutile in main |

**Per il nostro setup: sempre `squash`**. Storia di `main` lineare e pulita: 1 PR = 1 commit.

### Come si crea una PR

**Via web** (più comodo per leggere il diff):
1. Push del branch (`git push -u origin <branch>`)
2. Vai su `github.com/InglesinaItaliana/preventivatoreb2b-ii/pulls`
3. Click "New pull request"
4. Base: `main` — Compare: il tuo branch
5. Riempi titolo + descrizione

**Via CLI** (più rapido):
```bash
gh pr create --base main --head <branch> \
  --title "feat(...): titolo PR" \
  --body "## Summary\n- ...\n\n## Test plan\n- [ ] ..."
```

### Struttura di una buona PR

**Titolo**: stesso del commit principale, conciso (< 70 char), formato `<tipo>(<scope>): <descrizione>`
- `feat(polaris): azione 1 — FCM token-per-scope`
- `fix(sidera): correggi loop infinito in TasksView`

**Descrizione** (body): markdown, 2 sezioni minime
```markdown
## Summary
- Cosa è cambiato (bullet)
- Perché (1 riga)

## Test plan
- [ ] Cosa testare per dichiarare la PR OK
- [ ] ...
```

### Merge della PR — esempio completo

```bash
# 1. Verifica check superati (se ci sono)
gh pr checks <numero>

# 2. Merge con squash + cancellazione branch
gh pr merge <numero> --squash --delete-branch

# 3. Sync main locale
git checkout main
git pull origin main
```

---

## 6. Firebase Hosting — produzione e preview

### Cosa è "live"

**Firebase Hosting non sa nulla di git.** Serve i file che hai dato come ultimo deploy.

URL produzione: **`https://preventivatoreb2b-ii.web.app`** (e mirror `*.firebaseapp.com`)

Quello che gli utenti vedono lì è **l'ultima build deployata con** `firebase deploy --only hosting`. Punto.

### Preview Channels — la feature killer

Firebase ti permette di **deployare su URL temporanei** senza toccare la produzione. Si chiamano **preview channels**.

**Pattern di URL:**
```
https://preventivatoreb2b-ii--<channel-name>-<hash>.web.app
```

**Esempio reale:**
```
https://preventivatoreb2b-ii--polaris-1-7vbp3mtc.web.app
```

### Come creare un preview channel

```bash
npm run build                                              # build locale
firebase hosting:channel:deploy <nome> --expires 7d        # upload su preview channel
```

L'output ti dà l'URL temporaneo. Lo puoi condividere con chi vuoi testare.

### Caratteristiche dei preview channels

| | |
|---|---|
| **Quanti contemporaneamente** | Fino a 36 attivi (free tier Firebase) |
| **Scadenza** | Default 7 giorni, max 30 giorni (`--expires 30d`) |
| **Indicizzati su Google** | No (header `noindex`) |
| **Auth richiesta** | No — chiunque con l'URL accede (puoi richiedere auth da console se vuoi) |
| **Cloud Functions** | Restano quelle di **produzione** — preview channels supportano solo Hosting |
| **Service Worker / PWA** | Scope = URL del preview → è una PWA **separata** da quella in produzione |
| **Stesso Firestore** | Sì — scrivi/leggi dati VERI di produzione (occhio nei test distruttivi) |
| **Stesso Auth** | Sì — login con utenti reali del progetto |

### Comandi utili

```bash
# Lista preview channels attivi
firebase hosting:channel:list

# Rinnova scadenza
firebase hosting:channel:deploy <nome> --expires 14d

# Elimina manualmente un channel
firebase hosting:channel:delete <nome>

# Promuovi un preview a produzione (clone)
firebase hosting:clone preventivatoreb2b-ii:<canale> preventivatoreb2b-ii:live
```

L'ultima operazione (`clone`) è equivalente a "deploya esattamente quello che ho testato sul preview, direttamente in produzione" — utile quando vuoi go-live di una versione **già verificata** senza rifare il build.

### Cloud Functions sono diverse

`firebase deploy --only functions` non ha preview channels. Le Cloud Functions hanno solo "produzione". Per testare modifiche a Function:
- **Locale**: `firebase emulators:start --only functions` (gira sul tuo Mac)
- **Produzione**: deploy diretto

Questo è un limite di Firebase. Per il nostro caso (POLARIS azione 1) significa: il preview channel `polaris-1` ha il client nuovo ma la Function vecchia. Va bene perché la Function vecchia è retrocompatibile col client nuovo.

---

## 7. Deploy in produzione — ordine corretto

Quando una PR è mergiata in `main` e vuoi mandare in produzione:

```bash
# 1. Assicurati di essere su main aggiornato
git checkout main
git pull origin main

# 2. Build fresco
npm run build

# 3. Deploy Cloud Functions (se modificate)
firebase deploy --only functions

# 4. Deploy Hosting
firebase deploy --only hosting
```

### Ordine Functions → Hosting (regola)

**Sempre Functions prima, Hosting dopo**, quando una modifica tocca entrambi.

**Perché?** Il deploy non è istantaneo:
- Functions deploy: ~30-60 secondi, durante i quali la Function potrebbe essere brevemente non disponibile
- Hosting deploy: ~30 secondi, il bundle si propaga sui CDN

Se deployassi prima Hosting, ci sarebbe una finestra di pochi minuti in cui:
- I clienti hanno il **client nuovo**
- Le Function rispondono ancora con la **logica vecchia**

Se la modifica ha rotto la retrocompatibilità (client nuovo non capisce la Function vecchia), ci sono errori. Invertendo (Functions prima), entrambe le modifiche convivono pacificamente fino al deploy Hosting.

### Cosa fare se il deploy fallisce

| Sintomo | Causa probabile | Cosa fare |
|---|---|---|
| `Error: Failed to get Firebase project` | Auth scaduta | `firebase login --reauth` |
| `Quota exceeded` | Troppi deploy nello stesso giorno (free tier) | Aspetta o passa a piano Blaze |
| Build TypeScript fail | Errori di tipo | Fixa nel codice, rifai build |
| `Permission denied` | Account senza ruolo "Hosting Admin" | Aggiungi su Firebase Console |

---

## 8. Rollback — annullare modifiche

### Annullare una PR già mergiata

Su GitHub, vai sulla PR → bottone **"Revert"**. Crea automaticamente una nuova PR che annulla quella precedente. Mergiala normalmente.

Equivalente da CLI:
```bash
git revert <hash-del-commit-merge>
git push origin main
```

**Importante:** `revert` **non cancella** il commit dalla storia — crea un nuovo commit che annulla le modifiche. La storia git resta intatta e tracciabile.

### Tornare alla versione precedente in produzione

Se hai deployato qualcosa che ha rotto la produzione, hai 3 opzioni in ordine di velocità:

**Opzione 1 — Re-deploy precedente da git** (consigliato):
```bash
git checkout <hash-commit-precedente>
npm run build
firebase deploy --only hosting
git checkout main  # torna a main per non lavorare in detached HEAD
```

**Opzione 2 — Firebase Hosting rollback** (più rapido se l'errore è solo nel bundle):
- Firebase Console → Hosting → "Release history" → trova la versione precedente → "Rollback"
- Click → torna alla versione precedente in ~30s
- Non tocca git, ma il `main` ora NON corrisponde più al live → rifletti su `git revert` per riallineare

**Opzione 3 — Cloud Function rollback:**
```bash
# Re-deploy della versione precedente da git
git checkout <hash> -- src/functions/index.ts
firebase deploy --only functions:<nome-funzione>
git checkout main -- src/functions/index.ts  # torna alla versione corrente
```

### Recupero file cancellato per sbaglio

```bash
# Recupera da git (l'ultima versione tracciata)
git checkout HEAD -- path/del/file

# Se è stato cancellato qualche commit fa
git log -- path/del/file        # trova il commit che lo conteneva
git checkout <hash> -- path/del/file
```

**Se le modifiche non erano committate**: probabilmente sono perse. Ecco perché si committa spesso.

---

## 9. Best practices per Inglesina (specifiche)

### Sicurezza POPS

POPS è **live** e usato da clienti reali. Errori = email/chiamate.

Regole:
1. ❌ Nessuna modifica diretta a `main`. Sempre PR.
2. ❌ Nessuna modifica ai file condivisi (vedi POLARIS.md sezione 0) senza test su Preview Channel
3. ✅ Per qualunque deploy in produzione: prima testa su **preview channel** dal device del cliente tipico (mobile Chrome iPad? desktop Edge?)
4. ✅ Tieni un canale di comunicazione pronto (Slack? email?) per segnalare a clienti se deployi modifiche che potrebbero impattarli

### Branch e PR

1. **Una PR = una cosa.** Niente PR che mescolano fix bug + nuova feature + refactor
2. **Commit messages descrittivi** in italiano: `feat(sidera): aggiungi descrizione progetto`
3. **Branch corti**: max 3 giorni di vita. Più resta isolato, più diventa pericoloso da mergiare
4. **Naming**: `polaris/<n>-<slug>` per azioni POLARIS; `feature/`, `fix/`, `refactor/` per il resto

### Preview channels — strategia

| Quando | Cosa fare |
|---|---|
| PR aperta per nuova feature | Deploy preview channel `feature-<slug>` |
| Bug fix urgente | Preview channel `fix-<slug>` per testare prima |
| Roadmap POLARIS | Preview channel `polaris-<n>` |
| Test demo cliente | Preview channel `demo-<cliente>` con expires 30d |

### Deploy

1. **Mai venerdì sera** (regola del buon senso: se rompi, il weekend è rovinato)
2. **Sempre dal `main`** aggiornato (`git pull` prima)
3. **Functions prima di Hosting** quando entrambi cambiano
4. **Annota la versione** (almeno in POLARIS.md cronologia): "Deploy POLARIS azione 1: 2026-05-XX, commit abc1234"
5. **Verifica subito post-deploy** che il sito risponda (apri `/`, `/sidera`, `/pulsar`, `/cepheid` da incognito)

### Documentazione

- **POLARIS.md**: roadmap strategica, azioni con priorità
- **WORKFLOW.md**: questo file — il "come si lavora"
- **README.md**: panoramica progetto (per nuovi developer eventuali)
- **CLAUDE.md** (se esiste): istruzioni per agenti AI

Aggiorna i file ogni volta che cambia qualcosa di strutturale. Sono il tuo "promemoria del futuro".

---

## 10. Cheatsheet — comandi più usati

### Git base
```bash
git status                                  # cosa è modificato adesso
git diff                                    # cosa è cambiato (working tree)
git diff --staged                           # cosa è in staging
git log --oneline -10                       # ultimi 10 commit
git log --graph --oneline --all             # storia con grafo (tutti i branch)
git branch                                  # lista branch locali
git branch -r                               # lista branch remoti
```

### Workflow standard
```bash
# Inizia una feature
git checkout main
git pull origin main
git checkout -b feature/nome-feature

# Lavora + commit (ripeti N volte)
git add <file>
git commit -m "feat(scope): descrizione"

# Push + PR
git push -u origin feature/nome-feature
gh pr create --base main --title "..." --body "..."

# Dopo merge della PR
git checkout main
git pull origin main
git branch -d feature/nome-feature          # cancella branch locale
```

### Firebase
```bash
# Build
npm run build

# Preview channel
firebase hosting:channel:deploy <nome> --expires 7d
firebase hosting:channel:list
firebase hosting:channel:delete <nome>

# Deploy produzione
firebase deploy --only functions:<nome>     # singola function
firebase deploy --only functions            # tutte
firebase deploy --only hosting              # solo hosting
firebase deploy                             # TUTTO (rischioso, evitare)

# Promozione preview → produzione
firebase hosting:clone preventivatoreb2b-ii:<canale> preventivatoreb2b-ii:live
```

### GitHub CLI (`gh`)
```bash
gh pr list                                  # PR aperte
gh pr view <numero>                         # dettagli PR
gh pr checks <numero>                       # stato check CI
gh pr merge <numero> --squash --delete-branch
gh pr create --base main --title "..." --body "..."
```

### Recovery
```bash
git revert <hash>                           # annulla un commit con un nuovo commit
git checkout <hash> -- <file>               # recupera versione vecchia di un file
git reflog                                  # storia di tutti i movimenti di HEAD (rete di sicurezza)
git stash                                   # metti da parte modifiche non committate
git stash pop                               # riprendi modifiche messe da parte
```

---

## 11. Glossario rapido

| Termine | Significato |
|---|---|
| **Repository (repo)** | La cartella che contiene tutto il codice + storia git |
| **Branch** | Linea di sviluppo separata, parte da un commit di un altro branch |
| **Commit** | Snapshot del codice in un dato momento, con messaggio descrittivo |
| **Hash** | Identificativo unico del commit (es. `108f678`), 7 caratteri di solito mostrati |
| **HEAD** | Puntatore al commit corrente del branch attivo |
| **Working tree** | I file modificati non ancora committati |
| **Staging area** | Modifiche selezionate per il prossimo commit (`git add`) |
| **Remote** | Server git esterno (es. GitHub) dove pushare/pullare |
| **Origin** | Nome convenzionale del remote principale (GitHub in questo caso) |
| **PR (Pull Request)** | Richiesta di mergiare un branch in un altro |
| **Merge** | Unione di un branch dentro un altro |
| **Fast-forward** | Merge "lineare" senza commit di merge (quando il target è solo "indietro") |
| **Squash** | Collassare più commit in uno solo |
| **Rebase** | Spostare i commit di un branch sopra un altro punto |
| **Conflict** | Quando due branch modificano le stesse righe — git chiede di risolvere a mano |
| **Stash** | "Cassetto" temporaneo per mettere da parte modifiche non committate |
| **Tag** | Etichetta su un commit specifico (es. `v1.0.0`) |
| **CI/CD** | Continuous Integration / Continuous Deployment — automazioni che girano su push/PR |

---

## 12. Riferimenti incrociati

- **`POLARIS.md`** — roadmap strategica con le azioni pianificate
- **`README.md`** — panoramica progetto
- **`firebase.json`** — config Firebase Hosting + Functions
- **`.firebaserc`** — progetto Firebase associato
- **`package.json`** — script npm (`build`, `dev`)
- **`src/functions/package.json`** — script per le Cloud Functions

---

## 13. Quando hai un dubbio

Ordine di azioni:

1. **Non fare nulla di rischioso** (deploy, merge, force push, delete branch) finché non hai chiaro l'impatto
2. **Guarda `git status`** prima di ogni operazione
3. **Guarda `git log --oneline -5`** per capire dove sei
4. **Chiedi su un branch isolato**: tutto quello che non tocca `main` è quasi sempre reversibile
5. **`git reflog`** è la rete di sicurezza ultima: registra tutti i movimenti di HEAD anche dopo reset/checkout — quasi nessuna modifica si perde davvero

> **Principio di base**: se non sei sicuro, **fermati e chiedi**. Costa zero. Riparare un errore in produzione costa molto.
