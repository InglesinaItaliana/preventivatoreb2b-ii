# LYRA

> Registro espressivo e voce della suite — come "parla" il software all'utente.
> "Cosa dice e come lo dice" quando deve salutare, annotare, lasciar andare, restare in silenzio.

**Stato:** Adottato 2026-05-26 — fonte di verità per microcopy della suite.

Documenti correlati:
- **`ATLAS.md`** — come è costruita la suite (architettura, pattern, ricette)
- **`POLARIS.md`** — dove sta andando la suite (roadmap evolutiva)
- **`LYRA.md`** ← *sei qui* — come si esprime la suite (voce, vocabolario, microcopy)

---

## 0. Cos'è LYRA

LYRA è il **manuale della voce**. ATLAS dice **come si costruisce**, POLARIS dice **cosa si costruisce**, LYRA dice **come si comunica con chi la usa**.

Quando aggiungi una stringa visibile all'utente — un saluto, un placeholder, uno stato vuoto, un messaggio d'errore, una conferma — apri LYRA e usa il registro qui codificato. Niente da inventare ogni volta.

Il nome viene dalla costellazione della **Lira**, lo strumento del canto: la voce della suite passa attraverso di essa.

### Scope — cosa LYRA tocca, cosa lascia stare

LYRA si applica **esclusivamente a SIDERA e ai suoi sotto-moduli**:

- shell SIDERA (`/sidera/*`)
- moduli galattici: QUASAR, CEPHEID, PULSAR, NEBULA, NEBULA-DOCS, NOVA
- sezione CORE (admin, manutenzione, impostazioni)
- componenti shared **quando usati esclusivamente da SIDERA-side**

**POPS è fuori scope.** La webapp B2B + gestionale interno sotto `/` (incluse `AdminView`, `BuilderView`, `ClientDashboard`, `AdminSettings`, `ProductionDashboard`, `DeliveryView`, `LoginView`, `OnboardingView`, `CalcoliLavorazioni`, `TeaserView`) mantiene il proprio registro tecnico-neutro esistente. Nessuna sostituzione lessicale LYRA, nessun glifo `.lyra-star`, nessuna bonifica anti-pattern in nome di LYRA. Se POPS evolverà di registro lo farà su un manuale dedicato, non qui.

La primitiva CSS `.lyra-star` definita in `src/style.css` resta nel bundle globale ma è **dormante in POPS** — nessun template POPS la referenzia. Coerente con lo scope.

---

## 1. Persona — il custode dell'osservatorio

La suite non ha mascotte, non ha un nome di persona, non si firma. Ha però una **persona implicita** che chiunque scriva microcopy deve avere in testa:

> *Un custode di osservatorio astronomico. Discreto, preciso, contempla. Annota più di quanto esclami. Conosce il cielo e lo rispetta. Non festeggia mai, ma a volte si lascia scappare una nota di meraviglia.*

Non è un assistente entusiasta. Non è una macchina fredda. È **presente quando serve, silenziosa quando non serve**, leggermente più colta della media ma mai pretenziosa.

**Regola madre:** se togli la frase calda e l'azione resta chiara, hai dosato bene. Se la frase calda *sostituisce* l'informazione, hai esagerato.

---

## 2. Regole di registro

| Sì | No |
|---|---|
| Tu informale, sempre | Lei / voi |
| Presente indicativo | Futuro promissorio ("Sto per…") |
| Frasi brevi, ritmiche (3–10 parole) | Periodi lunghi, subordinate annidate |
| Sostantivi concreti del lessico astronomico | Metafore forzate ("hai galassizzato il task!") |
| Silenzio quando non c'è nulla da dire | Riempitivi: "Fatto!", "Ottimo!", "Perfetto!" |
| Verbi di custodia | Verbi tecnici crudi |
| Italiano vero, naturale | Traduzioni letterali dall'inglese |
| Punto fermo finale | Esclamativi multipli, puntini sospensivi decorativi |

**Lunghezza tipo.** Una stringa LYRA è una frase. Due frasi solo se la prima è informativa e la seconda è di contesto. Mai tre.

**Punteggiatura.** Punto fermo sempre. Esclamativo solo in casi rari di reale enfasi (mai più di uno consecutivo). Niente emoji.

**Tono nei momenti seri.** I dialog di conferma distruttivi (elimina progetto, elimina utente, reset dati), gli errori critici e i flussi di pagamento/fatturazione restano **tecnici e neutri**. Il tono caldo vive nei margini, non nei flussi critici. *Eliminare definitivamente?* va benissimo così.

---

## 3. Vocabolario di riferimento

Lessico interno condiviso. Da usare in modo coerente in tutta la suite.

| Termine LYRA | Significato | Uso tipico |
|---|---|---|
| **Stella** | Entità singola | task, azione, deliverable, preventivo |
| **Costellazione** | Gruppo coerente di stelle | progetto, fase, raccolta |
| **Asterismo** | Pattern emergente da più stelle | riepilogo, statistica, trend settimanale |
| **Rotta** | Percorso di navigazione | URL, link, vista non trovata |
| **Eclissi** | Indisponibilità temporanea | servizio offline, manutenzione |
| **Quiete / Silenzio** | Stato vuoto positivo | inbox a zero, scadenze chiuse |
| **Allineamento** | Momento opportuno | suggerimento di azione, condizione favorevole |
| **Archivio** | Storico di ciò che è stato custodito | progetti chiusi, task lasciati andare |
| **Osservatorio** | Il sistema stesso, come luogo | errori di connessione, stato server |

**Verbi della custodia** (preferire sempre questi):

| Da preferire | Al posto di |
|---|---|
| Annotare | Salvare |
| Custodire | Archiviare |
| Lasciar andare | Eliminare (nei contesti non distruttivi) |
| Raccogliere | Aggregare / collezionare |
| Tracciare | Definire / pianificare |
| Smistare | Categorizzare / triage |
| Spegnere | Chiudere / completare |

**Verbi vietati**: *cliccare* (è un'azione, non un significato), *eseguire*, *processare*, *settare*.

**Termini operativi neutri** (non astrologizzare): *risultato*, *comando*, *icona*, *versione*, *filtro*, *categoria*. In stati di tipo *filtro* o *errore camuffato* preferisci chiarezza pratica al lirismo — il custode è preciso prima che poetico. Esempi: "Nessun risultato", "Nessun comando trovato", "Nessuna icona trovata per X" restano così.

**Avverbi di negazione**: *nessun / nessuna* è la forma standard. *Niente* è ammesso come variante più asciutta nei contesti pulizia/atteso ("Niente in sospeso qui", "Niente da pianificare"). *Nulla* sconsigliato (suona arcaico).

---

## 4. Traduzioni 1:1

Mappa diretta per casi ricorrenti. Da estendere quando emergono pattern nuovi.

| Generico / inglese-tradotto | LYRA |
|---|---|
| Salvato con successo | Annotato |
| Eliminato | Lasciato andare |
| Caricamento... | Sto interrogando il cielo |
| Errore: connessione persa | L'osservatorio è offline |
| Pagina non trovata | Questa rotta non porta a nessuna stella conosciuta |
| Sessione scaduta | La notte è finita. Accedi di nuovo |
| Nessun risultato | (dipende dal contesto, vedi §5) |
| Ottimo! Hai completato il task | (silenzio: il task sparisce dalla lista) |
| Sei sicuro di voler eliminare? | Eliminare definitivamente? *(qui resti tecnico)* |
| Operazione completata | (silenzio, o "Annotato") |

**Saluti contestuali** (espansione del *Buongiorno* già presente in QUASAR / Cruscotto):

| Momento | Saluto |
|---|---|
| 05:00–11:59 | Buongiorno |
| 12:00–17:59 | Buon pomeriggio |
| 18:00–21:59 | Buonasera |
| 22:00–04:59 | Ancora qui? |
| Lunedì mattina | Bentornato. *(opzionale: "N stelle ti aspettano da venerdì")* |
| Venerdì pomeriggio | Buon weekend. |
| Primo accesso della settimana su un modulo dopo >5 giorni | Non passavi da [modulo] da [giorno]. |

---

## 5. Stati vuoti

Gli stati vuoti hanno **cinque tipi diversi**. Confonderli è il bug più comune del microcopy. Ogni tipo ha un tono dedicato.

| Tipo | Significato tecnico | Tono | Schema frase |
|---|---|---|---|
| **Primo uso** | Nessun dato è mai stato creato qui | Invitante, mostra la via | "[Verbo all'imperativo]. [Riga di contesto]." |
| **Pulizia** | Aveva dati, ora è a zero per merito utente | Celebrativo lieve | "[Sostantivo positivo]. [Riga di quiete]." |
| **Filtro** | I dati esistono ma il filtro corrente non li mostra | Neutro + suggerimento | "Nessun risultato con questi filtri. [Suggerimento]." |
| **Errore camuffato** | Vuoto perché query fallita | Trasparente, niente celebrazione | "Non riusciamo a leggere [risorsa] in questo momento." |
| **Atteso** | È normale sia vuoto qui per ora | Descrittivo | "[Cosa apparirà qui], [criterio]." |

**Regola tecnica importante.** Lo stato vuoto-celebrazione deve sapere *perché* è vuoto: `items.length === 0 && lastFetch.ok === true`. Se hai dubbio sulla query, mostri il messaggio del tipo "errore camuffato", **mai** una celebrazione falsa.

### Catalogo (audit 2026-05-26)

39 stati vuoti censiti nei moduli **SIDERA-side** (POPS escluso per scope §0). `🚫` marca le violazioni anti-pattern §7 da bonificare (emoji, esclamativi). Le righe senza proposta indicano che la stringa attuale è già coerente con LYRA.

| Modulo | Vista | File:line | Tipo | Stringa attuale | Proposta LYRA |
|---|---|---|---|---|---|
| CEPHEID | Obiettivi (vuoto) | CepheidGoalsView.vue:138 | primo-uso | Nessun obiettivo definito. / Gli obiettivi sono le 'destinazioni' dell'anno. I progetti li servono. | Nessun obiettivo. Le destinazioni dell'anno: i progetti le servono. |
| CEPHEID | Goal — progetti collegati | CepheidGoalDetail.vue:224 | atteso | Nessun progetto collegato a questo obiettivo. | — |
| CEPHEID | Goal — modal collega | CepheidGoalDetail.vue:257 | filtro | — (placeholder) | Nessun progetto disponibile. |
| CEPHEID | Progetti (vuoto totale) | CepheidProjectsView.vue:230 | primo-uso | Nessun progetto. | Nessuna costellazione tracciata. Traccia la prima. |
| CEPHEID | Progetti (filtro stato) | CepheidProjectsView.vue:258 | filtro | Nessun progetto attivo / completato. | Nessun progetto in questo stato. |
| CEPHEID | Scadenze 7gg | CepheidDueView.vue:162 | filtro | Nessuna scadenza nei prossimi 7 giorni | Nessuna stella si spegne nei prossimi 7 giorni. |
| CEPHEID | Scadenze vuote | CepheidDueView.vue:179 | atteso | (no microcopy) | Nessuna scadenza in vista. |
| CEPHEID | Azioni — completate | CepheidActionsView.vue:307 | atteso | Nessuna azione completata. | — |
| CEPHEID | Azioni — mie/tutte (clean) 🚫 | CepheidActionsView.vue:322 | pulizia | Tutto fatto / Nessuna azione assegnata da fare. 🎉 / Niente in sospeso qui. 🎉 | Niente in sospeso qui. *(rimuovere 🎉)* |
| CEPHEID | Azioni — in ritardo (nessuna) 🚫 | CepheidActionsView.vue:330 | pulizia | Nessuna azione in ritardo. 🎉 | Nessuna azione in ritardo. Stato sereno. *(rimuovere 🎉)* |
| CEPHEID | Milestones | CepheidProjectDetail.vue:372 | atteso | Nessuna milestone. / Una milestone è un checkpoint datato senza sotto-task... | — |
| CEPHEID | Deliverables | CepheidProjectDetail.vue:417 | atteso | Nessun deliverable. / Un deliverable è l'output tangibile... | — |
| CEPHEID | Task per deliverable | CepheidProjectDetail.vue:483 | atteso | Nessun task collegato | Nessun task collegato. |
| CEPHEID | Task lista | CepheidProjectDetail.vue:491 | atteso | Nessuna azione. / Le azioni create dal Kanban appaiono anche in lista... | — |
| CEPHEID | Inbox vuota 🚫 | CepheidInboxView.vue:64,91 | pulizia | Nessuna task da smistare / Tutto smistato. Niente da fare qui. 🎉 | Tutto smistato. Il cielo è sereno. *(rimuovere 🎉)* |
| QUASAR | Attività feed | QuasarAttivitaView.vue | atteso | Nessuna attività ancora — comparirà qui in tempo reale. | L'osservatorio è silenzioso. Le attività appariranno qui in tempo reale. |
| QUASAR | Cruscotto — scadenze oggi | QuasarCruscottoView.vue | atteso | Nessuna azione in scadenza oggi | Nessuna stella si spegne oggi. |
| QUASAR | Cruscotto — progetti | QuasarCruscottoView.vue | primo-uso | Nessun progetto attivo ancora. | Nessun progetto attivo. Traccia il primo. |
| QUASAR | Cruscotto — urgenze | QuasarCruscottoView.vue | pulizia | Nessuna urgenza al momento. | Nessuna urgenza. Stato sereno. |
| QUASAR | Cruscotto — attività recente | QuasarCruscottoView.vue | atteso | Nessuna attività recente. | — |
| QUASAR | Quadranti Q1 🚫 | QuasarQuadrantiView.vue | pulizia | Nessun incendio 🎉 | Nessuna urgenza importante. Stato raro, custodiscilo. *(rimuovere 🎉)* |
| QUASAR | Quadranti Q2 | QuasarQuadrantiView.vue | atteso | Niente da pianificare | Niente da pianificare. |
| QUASAR | Quadranti Q3 | QuasarQuadrantiView.vue | atteso | Niente da delegare | Niente da delegare. |
| QUASAR | Quadranti Q4 | QuasarQuadrantiView.vue | pulizia | Niente da valutare | Quadrante deserto. Così deve stare. |
| PULSAR | Messaggi conversazione 🚫 | PulsarMessageView.vue | primo-uso | Nessun messaggio ancora. Inizia la conversazione! | Nessun messaggio. Apri la conversazione. *(rimuovere !)* |
| PULSAR | Etichette | PulsarTagsView.vue | primo-uso | Nessuna etichetta ancora. | Nessuna etichetta. Crea la prima. |
| PULSAR | Sequentia — azioni mie | PulsarSequentia.vue | atteso | Nessuna azione assegnata. | — |
| PULSAR | Hashtag — messaggi | PulsarHashtagView.vue | filtro | Nessun messaggio con #{tag} ancora. | Nessun messaggio con #{tag}. |
| PULSAR | Pendenze 🚫 | PulsarPendingView.vue | pulizia | Nessuna pendenza. Tutto in ordine! | Nessuna pendenza. Tutto in ordine. *(rimuovere !)* |
| PULSAR | Chat — conversazioni | PulsarChatsView.vue | primo-uso | Nessuna conversazione ancora. Inizia dal tasto in basso a destra. | Nessuna conversazione. Apri la prima dal "+". |
| PULSAR | Chat — preview vuota | PulsarChatsView.vue | atteso | Nessun messaggio | Nessun messaggio. |
| NOVA | Spedizioni — categoria | NovaSpedizioniView.vue | filtro | Nessuna spedizione in questa categoria. | — |
| NEBULA | Team — attivi | NebulaTeamView.vue | atteso | Nessun membro attivo nel team. | — |
| NEBULA | Team — totale | NebulaTeamView.vue | primo-uso | Nessun membro nel team. | Nessun membro nel team. Aggiungi il primo. |
| NEBULA-DOCS | Documenti (vuoto) | NebulaDocsHomeView.vue:401 | primo-uso | Nessun documento. Crea il primo o aspetta che qualcuno te ne condivida uno. | Nessun documento. Crea il primo o aspetta una condivisione. |
| NEBULA-DOCS | Storia versioni | NebulaDocHistoryView.vue:208 | atteso | Nessuna versione in storia. | Nessuna versione in archivio. |
| NEBULA-DOCS | Suggester universale | UniversalSuggester.vue:128 | filtro | Nessun risultato | — |
| NEBULA-DOCS | Suggester task | TaskSuggester.vue:68 | filtro | Nessun task trovato | — |
| NEBULA-DOCS | Suggester progetto | ProjectSuggester.vue:62 | filtro | Nessun progetto trovato | — |
| NEBULA-DOCS | Slash menu | SlashMenu.vue:69 | filtro | Nessun comando trovato | — |
| NEBULA-DOCS | Icon picker — ricerca | IconPicker.vue:148 | filtro | Nessuna icona trovata per "X" | — |
| NEBULA-DOCS | Icon picker — selezione | IconPicker.vue:220 | atteso | Nessuna icona selezionata | — |
| NEBULA/INTEGRATIONS | API keys | NebulaIntegrationsView.vue | primo-uso | Nessuna chiave generata. | Nessuna chiave generata. Crea la prima. |

**Lettura dell'audit.**

- **Tipologia dominante** (SIDERA-side, 39 stati): *atteso* (~14) > *filtro* (~10) > *primo-uso* (~9) > *pulizia* (~6). Nessuno stato di tipo *errore camuffato* è renderizzato come empty state — i fallimenti di query passano dai toast (gestione robusta, allineata al §5 *Regola tecnica importante*).
- **Violazioni anti-pattern §7** (7 punti, marcati 🚫 nel catalogo): emoji 🎉 in CepheidActionsView (3 punti), CepheidInboxView, QuasarQuadrantiView (Q1), CepheidTimeline (componente, non in catalogo); esclamativi in PulsarPendingView e PulsarMessageView. **Bonificate 2026-05-26** — i marcatori 🚫 restano come traccia storica dell'audit.
- **Stati primo-uso** sono il punto di maggior valore identitario: la suite accoglie l'utente nuovo. Gli inviti pratici ("Crea la prima", "Inizia ora") restano allineati a LYRA — niente bisogno di astrologizzare.
- **Stati pulizia** sono i candidati naturali per micro-celebrazioni §6 (StarAvatar quieto, punto luminoso, glow).



### Componente shared (proposta)

Un componente `<StellarEmpty>` con prop `kind="first-use" | "cleared" | "filtered" | "error" | "expected"` che impone il tono giusto e impedisce di scrivere stati vuoti a mano. *Da valutare in ATLAS sez. componenti shared.*

---

## 6. Micro-celebrazioni

Una celebrazione vale solo se è **rara**, **meritata** e **discreta**. Tre filtri, tutti obbligatori. Se ne salti uno, scivoli in gamification cringe.

### Cosa merita celebrazione

| Categoria | Esempi | Frequenza attesa |
|---|---|---|
| **Chiusure grandi** | Fine progetto, fine fase CEPHEID, milestone POPS | Settimanale |
| **Stati ideali** | Inbox Smistamento a zero, Q4 vuoto per ≥7 giorni, fase con tutti i deliverable chiusi | Mensile |
| **Costanza** | Streak 5 giorni di chiusure entro fine giornata, 4 settimane di chiusure regolari | Mensile |
| **Anniversari** | 1 anno in azienda, 100ª azione chiusa, 1° progetto chiuso in CEPHEID | Rara |
| **Primi** | Primo task della prima settimana, prima nota in NEBULA | Una tantum |

**Cosa non celebrare mai:** login, salvataggio, singolo task chiuso, apertura vista, azioni di sistema.

### Forma: visiva e silenziosa

Il veicolo migliore è **visivo, non testuale**.

#### Glifo unificato — *stella osservata*

LYRA usa un **singolo glifo primitivo** per tutti i momenti stellari della suite: un punto luminoso oro CEPHEID + alone radiale + (opzionali) 4 spike di diffrazione in croce. È letteralmente come si fotografa una stella brillante al telescopio (Hubble, JWST). Sostituisce la 5-point star (Unicode `★` / Material `star`) che è un'icona scolastica, non un'osservazione astronomica.

Implementazione: classe CSS `.lyra-star` definita in `src/style.css` (sezione *LYRA — stella osservata*), con modificatori `--quiet` (sidebar inbox-zero, no spike, no anim), `--busy` (sidebar "c'è lavoro", spike sottili + pulse), `--celebration` (pannello "all clear", spike marcati + glow forte). I cluster (es. costellazione Timeline) usano la base senza modificatore: cinque stelle "a occhio nudo" che insieme fanno il coro — niente spike singoli, parla l'insieme.

Variabili CSS esposte (`--lyra-star-size`, `--lyra-star-glow-radius`, `--lyra-star-glow-color`, `--lyra-spike-length`, ...) per varianti future senza nuove classi.

#### Pattern in uso

- **Inbox zero (sidebar).** Voce "Smistamento": `.lyra-star--busy` (richiamo "c'è lavoro") → `.lyra-star--quiet` (quiete) quando triageCount torna a 0. *(✓ implementato 2026-05-26 — `a0b6540` + unificazione glifo, mobile + desktop)*
- **Inbox pulita / Tutto fatto (pannello).** Stati "all clear" in CepheidInbox + CepheidActions: `.lyra-star--celebration` al posto del trophy `emoji_events`. CepheidActions aggiunge un'**onda di luce singola** al mount (~900ms, ripple radiale mono-cromatico). Nessun confetto multicolor. *(✓ implementato 2026-05-26)*
- **Progetto completato (timeline).** CepheidTimeline finale: **5 `.lyra-star` senza modificatore** si compongono in costellazione Cassiopea-like W (~1.2s totali, dot oro che convergono dagli angoli con cascading delay 0/80/160/240/320ms e leggero overshoot, glow finale persistente). Sostituisce trophy + confetti. *(✓ implementato 2026-05-26)*
- **StarAvatar come trofeo vivo.** Streak 5 giorni → la StarAvatar nel topbar acquista un sottile alone (drop-shadow di 1 tono più chiaro). Sparisce a fine streak o dopo 7 giorni. *(da implementare — richiede tracking streak su Firestore)*
- **Chiusura progetto dalla lista.** Il nome del progetto fade-out (400ms) dall'elenco "in corso", poi appare per 1.5s come puntino luminoso nell'angolo prima di scomparire. Diverso dal "progetto completato (timeline)" qui sopra: questo è la transizione *lista in corso → archivio*. *(da implementare)*
- **Costellazione mensile dei progetti chiusi.** Mappa stellare cumulativa in CEPHEID dove ogni progetto chiuso è una stella posizionata per data. A fine mese è un artefatto, non una notifica. *(da implementare)*

### Cosa è vietato

- ❌ Toast verde "Ottimo lavoro!" → Duolingo
- ❌ Confetti animation → scaduto
- ❌ Suoni → mai, in nessun caso, è un ambiente di lavoro
- ❌ Punteggi, livelli, badge → trasforma colleghi in concorrenti
- ❌ Push notification per micro-celebrazioni → interrompi il flow per dire "bravo"

**Test di sobrietà.** Se un utente fa 30 task al giorno per 6 mesi, vede al massimo ~10 micro-celebrazioni in tutto. Se ne vede 100, è sbagliato il dosaggio.

---

## 7. Anti-pattern (cose che LYRA vieta)

| Anti-pattern | Esempio | Perché no |
|---|---|---|
| **Esclamazioni infantili** | "Fatto!", "Ottimo!", "Sì!" | Tono da app per bambini |
| **Scuse antropomorfe** | "Ops! Qualcosa è andato storto" | Vago e infantilizzante |
| **Encomi al merito utente** | "Sei un fenomeno!" | Paternalistico |
| **Metafore forzate** | "Hai galassizzato il task!" | Cringe |
| **Promesse al futuro** | "Sto per salvare…" | Suggerisce attesa inutile |
| **Riempitivi** | "Stiamo verificando…", "Un momento prego" | Rumore |
| **Tono diverso tra moduli** | POPS asciutto, CEPHEID barocco | Spezza l'identità di suite |
| **Emoji** | 🎉 ✨ 🚀 ovunque | Non in ambiente di lavoro |
| **Suoni di notifica/celebrazione** | Ding, chime, applausi | Mai |

---

## 8. Toggle utente

In **Impostazioni > Aspetto** (CORE) un toggle:

> ☑ Tono espressivo della suite
> *Saluti contestuali, stati vuoti narrati, piccole celebrazioni stellari. Disattivabile.*

L'utente serio vince sempre. Se qualcuno lo disattiva, gli stati vuoti diventano `Nessun risultato`, i saluti spariscono, le micro-celebrazioni restano solo come effetti visivi minimi (alone StarAvatar) — niente microcopy. Default: attivo.

---

## 9. Quando aggiornare LYRA

- Quando emerge una **nuova categoria di stringhe** non coperta (es. nuovo modulo, nuovo flusso di onboarding)
- Quando si introduce una **micro-celebrazione nuova** → aggiungere alla sez. 6
- Quando si fa **audit periodico** delle stringhe esistenti (proposta: ogni rilascio maggiore)
- Quando un termine del vocabolario sez. 3 si rivela ambiguo o disallineato all'uso reale

Aggiornare anche il PR description con un riferimento a LYRA quando si toccano stringhe visibili all'utente.

---

## 10. Riferimenti incrociati

- **ATLAS sez. componenti shared** → casa naturale di `<StellarEmpty>` quando verrà costruito
- **ATLAS sez. design tokens M3** → coerenza visiva delle celebrazioni (alone StarAvatar, glow stellari)
- **POLARIS** → eventuale azione futura per audit/cleanup microcopy esistente
- **StarAvatar** → veicolo principale delle celebrazioni silenziose
