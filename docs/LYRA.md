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

### Catalogo iniziale (da audit successivo)

| Modulo / vista | Tipo | Microcopy proposto |
|---|---|---|
| QUASAR / Quadranti — Q1 vuoto | Pulizia | Nessuna urgenza importante. Stato raro, custodiscilo. |
| QUASAR / Quadranti — Q4 vuoto | Pulizia | Quadrante deserto. Così deve stare. |
| QUASAR / Cruscotto — attività di oggi vuota | Atteso | L'osservatorio è silenzioso oggi. |
| CEPHEID / Inbox Smistamento vuota | Pulizia | Tutto smistato. Il cielo è sereno. |
| CEPHEID / Timeline nuovo progetto | Primo uso | Disegna la prima fase. La rotta è ancora da tracciare. |
| SIDERA / Scadenze di oggi vuote | Atteso | Nessuna stella si spegne oggi. |
| POPS / Lista filtrata vuota | Filtro | Nessun preventivo corrisponde. Allenta i filtri per vedere di più. |
| NEBULA / Doc senza contenuto | Primo uso | Pagina bianca. Inizia da una nota. |
| PULSAR / Chat nuova | Primo uso | Nessun messaggio. Apri la conversazione. |
| Qualsiasi / Notifiche vuote | Pulizia | Tutto calmo. |

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

Il veicolo migliore è **visivo, non testuale**:

- **StarAvatar come trofeo vivo.** Streak 5 giorni → la StarAvatar nel topbar acquista un sottile alone (drop-shadow di 1 tono più chiaro). Sparisce a fine streak o dopo 7 giorni.
- **Chiusura progetto = stella che si spegne.** Il nome del progetto fade-out (400ms) dall'elenco "in corso", poi appare per 1.5s come puntino luminoso nell'angolo prima di scomparire. Nessun modal.
- **Inbox zero.** Il pulsante "Smistamento" perde il badge numerico, mostra un *singolo punto luminoso* di accent. Per la giornata.
- **Costellazione mensile dei progetti chiusi.** In CEPHEID, una piccola mappa stellare dove ogni progetto chiuso è una stella posizionata per data. A fine mese è un artefatto, non una notifica.

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
