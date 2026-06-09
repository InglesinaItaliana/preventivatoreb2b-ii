# STELLA · Genesi del Grafo — visione, esperienza e validazione adversarial

> Documento di genesi del **modello a grafo "Stella"**: il primitivo unico che dissolve
> il dualismo documento/task, il modello dati a edge tipizzati, l'esperienza utente,
> e la **validazione critica** a cui la visione è stata sottoposta.
>
> ⚠️ **Da non confondere con `docs/STELLA-GRAFO.md`** (tutt'altro: identità agenti +
> re-key `/team` su UID). Qui si parla del primitivo ontologico *Stella*, non del team.
>
> **Stato:** 🔭 VISIONE + VALIDAZIONE. Approvato per il *ragionamento*, **non** per il build
> oltre la Fase 0. Le Fasi 1-3 sono backlog esplicito non finanziato (vedi §6).
> **Owner:** Gionata Pastorin · **Avvio:** 2026-06-01
> **Fonti correlate:** NEBULA "SIDERA · Stella — visione viva" (NEBULA doc `v2HC2ivgvrs24WO1lmsi`),
> [NEBULA-DOCS](NEBULA-DOCS.md), [ATLAS](ATLAS.md), [POLARIS](POLARIS.md), [ANALISI-MATURITA](ANALISI-MATURITA.md).

---

## TL;DR

- **La pietra angolare regge, ma NON è l'ontologia.** È la *Spina degli Edge* (un edge-log
  append-only tipizzato) + un *indice lessicale* full-text. Il primitivo unico, le manopole
  e la Mappa Stellare sono una **scommessa di prodotto** da giustificare a parte.
- **Verdetto del panel adversarial (43 agenti, 36 obiezioni, ~1.2M token):** *solido-con-modifiche*.
  Nessun blocco di **fattibilità tecnica**; ma **due nodi irriducibili** (uno tecnico, uno di mandato)
  e **~12 debolezze** che impongono di emendare la Costituzione *prima* di scrivere codice.
- **La paura fondante di Daniel** ("in quale doc parlavo di QUELLA cosa?") è per metà **full-text**
  (che il grafo NON fornisce) e per metà recall associativo (estrazione-AI, ortogonale al primitivo).
- **Piano:** approvare **Fase 0** (rifattore relazioni, basso rischio) + **Fase 0.5** (indice lessicale).
  Degradare **Fasi 1-3** a backlog che richiede un caso d'uso indipendente da Daniel.

---

## 1. La Visione (sintesi)

La distinzione *documento* vs *task* è un errore ereditato dai DB relazionali anni '70.
Una frase come *"Marco spedisce i campioni entro venerdì"* è simultaneamente descrizione,
registrazione e atto. **Stella è il primitivo unico**: un'unità di significato che si manifesta —
secondo le sue *manopole* e il contesto — come paragrafo di prosa, chip di task, riga di tabella,
sezione di progetto. È sempre la stessa stella; cambia il telescopio. Modifichi una manifestazione,
cambiano tutte: **non c'è sincronizzazione, c'è identità.**

**Le manopole (mai esposte all'utente):** struttura (prosa ↔ schema), verbosità, impegno
(nota ↔ intenzione ↔ promessa), tempo (atemporale ↔ scadenza), sguardo (come si renderizza).
I template non sono "tipi di pagina" ma *preset di manopole*. L'utente sceglie "nota" o "task";
sotto è sempre la stessa stella.

> Fonte primaria della visione narrativa: il doc NEBULA "SIDERA · Stella — visione viva".
> Questo file ne è la **trasposizione architetturale + la validazione critica**.

---

## 2. La Genesi del Grafo (il blueprint)

### 2.1 I quattro primitivi (e nient'altro)

| Primitivo | Cos'è | Regola di fondazione |
|---|---|---|
| **Stella** | unità di significato (nodo) | il tipo è *coordinate* (manopole), non etichetta |
| **Edge** | arco tipizzato, direzionale, datato | la **pietra angolare** |
| **Agent** | persona | classe a sé, attraversa tutti i moduli |
| **Horizon** | privato/professionale | *proprietà del dato*, non feature |

### 2.2 La Stella

- `body` — frammento rich-text (la prosa: mai distrutta = aura narrativa)
- `facets` — campi strutturati (owner/due/status) **attivati/spenti dalle manopole**
- `knobs` — posizione nello spazio-manopole (da cui si *deriva* il tipo mostrato)
- `horizon`, `createdBy`, `id`
- **Latente vs manifesta:** un paragrafo che non riceve né edge né manopola **non diventa nodo**.
  ⚠️ *Emendato dal panel:* il granulo di materializzazione è il **documento/entità**, NON il paragrafo
  (incompatibile con lo Yjs in prod — vedi §5).

### 2.3 L'Edge — grammatica costituzionale

```
edges/{id}: { from, to, type, dir, weight, horizon, source('human'|'ai'|'system'),
              createdAt, createdBy, validFrom, validTo }
```

- **Vocabolario CHIUSO** = API semantica dell'intera suite:
  `origin` · `about` · `blocks` · `part-of` · `assigned-to` · `derived-from` · `mentions` · `responds-to`.
  Feature nuova = *frase nuova in grammatica esistente*, mai grammatica nuova.
- **Append-only:** non si cancella, si mette `validTo`. (⚠️ ma "scrubber temporale gratis" è una bugia — §5.)
- **Weight + decadimento:** edge vecchi non rinforzati sfumano. (⚠️ decay = ranking, MAI esistenza — §5.)

### 2.4 Identità, privacy, scala

- **ULID globale unico**; agenti inclusi. `stelle/{id}` = la verità; le collezioni di modulo
  (`cepheid_tasks`, `projects`…) diventano **proiezioni/cache** di lettura.
- **Privacy:** `horizon` denormalizzato. ⚠️ *Emendato:* autorità **solo sul nodo**; sull'edge è un *hint
  fail-closed* che può solo **restringere** (§5, Legge 4 riscritta).
- **Scala OLTP/OLAP:** `edges/` = verità; adjacency cache per nodo (recompute-and-set, mai increment);
  `graphMetrics` batch (+ self-heal). **Il grafo non ha radice:** la home = vicinato + cicli aperti +
  ciò che pulsa, mai "tutti i documenti" → la lista infinita non può esistere per costruzione.

---

## 3. L'Esperienza — come si svela la "magia"

La magia si rivela in **tre gesti**, sempre gli stessi, e **senza mai esporre manopole o tipi-edge**:
**catturi senza archiviare → il sistema propone i legami, tu confermi con un tocco → il contesto torna da te.**

### Scena 1 — Browser, scrivo una task
Una barra di cattura. Scrivi *"Marco manda i campioni Inglesina entro venerdì"*, invio.
Il sistema legge verbo+persona+scadenza → **deriva** la forma-task (no form, no scelta di tipo/cartella),
propone *"collego a Inglesina? · #campioni"* (un tocco). La frase resta come `body` (aura narrativa).
Nascono 3 edge (`assigned-to`, `about`, `part-of`) mai nominati.

### Scena 2 — Telefono, nuovo progetto con milestone
Cattura/voce: *"Nuovo progetto: rilancio sito Inglesina. A luglio la home, agosto il catalogo, settembre online."*
Appare il progetto + 3 milestone derivate dalle date (`part-of`); il brief dettato È la prima sezione
del doc di progetto. Un paragrafo → progetto + milestone + legami + sezione.

### Scena 3 — Doc riunione soci *(qui la magia è davvero il grafo)*
Scrivi un verbale in prosa, **senza fermarti a creare task**. A fine riunione (o "Estrai" — l'AI *propone*,
mai in silenzio) compare: *"2 azioni, 1 decisione, 1 domanda aperta. Confermi?"*. Accetti.
Risultato: le azioni compaiono nei CEPHEID dei soci **con edge `origin`** verso il paragrafo
(il *perché* viaggia col *cosa*); la decisione diventa stella `#B2C`; la domanda aperta riemerge in
"cicli aperti". Mesi dopo: *"dove parlavo del magazzino di Treviso?"* → full-text (lessicale) + la
domanda taggata che torna da sola.

### Creazione diretta e documenti generici (chiarimenti chiave)
- **Puoi creare task/fasi direttamente.** La cattura naturale è *una* porta, non l'unica. "+", scegli
  "task", compili → come oggi in CEPHEID, senza AI. Il builder timeline strutturato resta. *Due porte,
  una stanza:* una task creata col form e una estratta da un verbale hanno gli **stessi poteri**.
- **Documenti di sola informazione** (listino, specifiche, normativa): **restano documenti.** Prosa che
  resta prosa (stella latente, mai forzata a diventare azione). Li ritrovi per **full-text** (porta
  principale), **tag/temi** (`about`), **link opzionali**. Mai una cartella. Per il reference *scollegato*
  il grafo aggiunge poco — ed è giusto così (degradazione graziosa, niente nagging "estrai task").

### Le quattro caselle, nessuna forzatura

|  | **Informazione** (niente da fare) | **Azione** (cose da fare) |
|---|---|---|
| **Deliberato** (form/builder) | scrivi doc + tag → trovato per ricerca+tema | "+" task / builder fasi → nodo strutturato subito |
| **Fluido** (prosa/voce) | appunti liberi → trovati per full-text | verbale → l'AI *propone* azioni, tu confermi |

---

## 4. La Validazione Adversarial (il dibattito)

**Metodo:** panel multi-agente — 6 lenti ostili indipendenti (architetto sistemi distribuiti · scala/costo
Firestore · sicurezza/privacy · prodotto "Daniel" · rischio migrazione · avvocato YAGNI) → un **difensore**
contrattacca ogni obiezione → un **giudice** tiene solo ciò che sopravvive. **43 agenti, 36 obiezioni
(36/36 sopravvissute in qualche grado), ~1.2M token.** I critici hanno **ispezionato il codice reale**
(`index.ts:1865` logActivity ingoia errori; `firestore.rules:166` activityLog read-globale;
`pmSchema.ts` senza id-paragrafo; `rules:208` bypass `isCoreAdminRead()`).

**Verdetto:** *solido-con-modifiche.*

### 4.1 I due nodi irriducibili (riscrivere, non emendare)

1. **Fatale di MANDATO (non tecnico):** il blueprint giustifica la riscrittura ontologica con la paura di
   Daniel, ma **4 dei 5 ribaltamenti girano già sul modello attuale** (`LinkedDocsPanel` = grafo di
   adiacenza inverso live; MCP = AI-propone; `body` ProseMirror = aura narrativa; facets = doc-come-processo).
   Il bisogno full-text di Daniel il grafo **non lo serve affatto**. Approvare "per Daniel" finanzierebbe
   Fase 1-3 senza un caso d'uso che le richieda.
2. **Privacy retroattiva vs storia immutabile-replayabile:** non puoi avere insieme *"edge storico leggibile
   per replay a validAt=X"* **e** *"privatizzo retroattivamente una stella"*. Conflitto di **invarianti**.
   → lo scrubber va riprogettato come **layer di autorizzazione sopra la storia** (visibilità rivalutata
   contro l'horizon *corrente* del nodo); "scrubber gratis" va ritirato.

### 4.2 Le ~12 debolezze sopravvissute → emendamenti alla Costituzione

| # | Debolezza | Sev | Fix |
|---|---|---|---|
| 1 | L'edge nasce da trigger post-commit (fragile, best-effort) | high | **Legge 8:** edge nello *stesso WriteBatch* della mutazione dal servizio-stella; trigger solo per la cache OLAP; vietato il pattern self-write-trigger stile `indexDocRefs`; reconciler periodico in Fase 0. |
| 2 | adjacency-cache senza idempotenza | medium | recompute-and-set per-nodo da "tutti gli edge attivi", mai increment/arrayUnion; `graphMetrics` esegue il self-heal; replay per-nodo (economico) ≠ replay globale (O(N), solo DR). |
| 3 | Contatori caldi (weight/pulsa) → ABORTED sui nodi-hub | medium | **Legge 7:** nessun contatore caldo; `effectiveWeight = rawCount·e^(−λΔt)` calcolato a read-time da `lastReinforcedAt` indicizzato; "ciò che pulsa" = output batch. |
| 4 | `horizon` sull'edge come gate fidato → leak/divergenza | high | **Legge 4 riscritta:** autorità solo sul nodo (1 get cached); horizon sull'edge = hint fail-closed che può solo restringere; "nessuna cache async è l'unico gate di autorizzazione"; eliminare `isCoreAdminRead()` dal path edges prima del rollout non-CORE. |
| 5 | Privacy retroattiva vs storia | **fatal** | scrubber = layer di auth sopra la storia (vedi §4.1.2); o scrubber omogeneo-per-horizon. |
| 6 | Paragrafo-come-stella incompatibile con Yjs | high | **Cancellare** "ogni paragrafo ha id latente". Granulo = doc/entità + mention-targets. Edge ancorati stella-a-stella, mai a offset di paragrafo. Sub-doc solo con block-id ULID + regola CRDT deterministica di split + GC dei delta privati. |
| 7 | Manca motore d'inferenza per contenuto greenfield + garanzia che manopole/tipi restino invisibili | medium | Fase 2: inferenza coordinate AI-propone-default al salvataggio; tipo-edge derivato dal target; manopole/tipi MAI UI primaria per il non-tecnico. |
| 8 | Il decay può seppellire il caso d'uso fondante | medium | **Legge 9:** decay = solo ranking/visivo, MAI esistenza/inclusione; edge `source:system/backfill` decay-immuni fino a reconcile verde; primitiva **pin**; ≥1 superficie di lettura interroga l'asse esistenza non-pesato; home ordinata per recency. |
| 9 | Manca oracolo di verifica edge-vs-array + policy promozione/rollback | high | drift-metric attiva dal giorno 1; promozione collezione→proiezione solo dopo 0 divergenze per N giorni di shadow-write; snapshot legacy immutabile; distinguere "ritrattato" da "tombstone-da-bug"; scrubber pieno solo da Fase 0 in poi. |
| 10 | "activityLog È lo stream di edge" è falso | medium | **Ritrattare.** `edges/` append-only nuovo, scritto atomicamente (verità); activityLog = proiezione best-effort a bassa entropia (solo metadati, mai body/horizon). |
| 11 | Body privato leakabile via graph-expansion | high | **n.7-bis:** l'aura narrativa è SEMPRE e SOLO il proprio body; nessuna lettura segue un edge per renderizzare il body all'altro capo; wrapper server-side che ri-gatta `canRead` sul nodo bersaglio (UI **e** MCP). |
| 12 | Scope-creep di mandato | high | separare nel doc **Fase 0 (rifattore giustificato)** da **Fase 1-3 (scommessa di prodotto)**; aggiungere **Fase 0.5 indice lessicale**; degradare manopole/registro-nodi/ribaltamenti a backlog non finanziato. |

---

## 5. La Costituzione (emendata dal panel)

1. **Una scrittura, molte proiezioni.** La stella è la verità; i moduli sono cache.
2. **Grammatica chiusa degli edge.** Feature nuova = frase nuova, mai grammatica nuova.
3. **Edge append-only.** Non si cancella, si chiude (`validTo`).
4. **Horizon autorevole solo sul nodo.** Sull'edge è hint fail-closed (restringe, mai apre). Nessuna cache
   async è l'unico gate di autorizzazione.
5. **L'AI propone, mai agisce in silenzio.** Degradazione graziosa senza AI.
6. **Il tipo si deriva dalle manopole** — mai esposte come UI primaria al non-tecnico.
7. **Nessun contatore caldo.** Aggregati derivati-in-lettura o partizionati; il decay non si scrive.
8. **Origine atomica dell'edge.** Stesso WriteBatch della mutazione-fonte; mai trigger post-commit.
9. **Decay = ranking, mai esistenza.** Non altera `validTo` né esclude da una superficie di navigazione.
   - **7-bis.** L'aura narrativa è solo il proprio body; nessun body cross-edge senza ri-gating server-side.

---

## 6. Il Piano Fasato (raccomandazione del giudice)

> **Fase 0 — Spina degli Edge** *(giustificata di per sé, basso rischio)*
> edge-log append-only tipizzato + **drift-metric attiva dal giorno 1** + reconciler.
> Giustificazione = costo attuale degli array denormalizzati + N Cloud Functions di sync + `indexDocRefs` fragile.
> È il delta reale (storia + decadimento che tag+search non danno).

> **Fase 0.5 — Indice lessicale** *(searchTokens/Typesense, ortogonale al grafo, consegnabile in giorni)*
> Chiude **subito** la metà full-text della paura di Daniel — il pezzo che il grafo non serve.

> **Fasi 1-3 — primitivo unico, manopole, materializzazione, ribaltamenti** → **backlog esplicito non
> finanziato** finché non emerge un caso d'uso *indipendente da Daniel* che le richieda.

---

## 7. Le 8 domande affilate per il giro cross-model (GPT/Gemini)

1. Esiste un design che concili replay-a-validAt-X **e** privatizzazione retroattiva senza redigere la
   storia né un secondo layer di auth a read-time? Se no, qual è il trade-off corretto (scrubber omogeneo
   vs rivalutazione-privacy a read amplification)?
2. `horizon` sull'edge declassato a hint fail-closed + autorità sul nodo: regge sotto la query massiva
   della Mappa (200+ vicini) dove le rules non possono fare 200 `get()` lineari? La proiezione
   `effectiveHorizon`-per-voce non sposta solo la cache-async-governante invece di eliminarla?
3. Il fix "edge nello stesso WriteBatch" presuppone un choke-point server-side, ma **23 file fanno write
   client dirette** (`allow write: if auth != null`). È realistico in Fase 1 senza big-bang sulle rules,
   o il dual-write da trigger best-effort resta l'unica opzione (e il buco di atomicità è incomprimibile)?
4. Su un'app **single-tenant a decine di utenti**: decay-pesi, `graphMetrics`, adjacency-cache producono
   valore netto, o sono costo a vuoto? A che soglia di edge (10k? 100k?) il beneficio supera l'overhead,
   e il blueprint dovrebbe gate-arli dietro quella soglia?
5. La paura di Daniel è metà recall lessicale (full-text, che il grafo non dà) e metà recall associativo
   (estrazione-AI di Fase 3). Dato che la prosa non-linkata resta fuori dal grafo per costruzione, il
   grafo cura la paura fondante, o la cura è interamente delegata a due meccanismi ortogonali al primitivo?
6. Se 4/5 ribaltamenti girano già sul modello attuale e solo "nota→task senza migrazione" richiede le
   manopole, esiste una giustificazione di prodotto **indipendente da Daniel** che renda il primitivo-unico
   + manopole un investimento positivo-NPV su un'app live, o è eleganza ontologica da degradare a esperimento?
7. Materializzazione sub-doc sotto Yjs: un block-id ULID con regola "sinistro-conserva/destro-conia" allo
   split è davvero CRDT-safe sotto edit concorrenti two-browser? O qualunque ancoraggio identità-semantica
   sopra Yjs è fragile, e il granulo DEVE restare il documento?
8. Il blueprint fonda invarianti di **sicurezza** (default-al-buio) e **durabilità** (no edge persi) su
   trigger Cloud Functions che questa codebase tratta come best-effort/fire-and-forget. È difendibile, o
   richiede outbox-pattern/dead-letter/transazioni che cambiano la natura del costo dichiarato "già fatto"?

---

## 8. Decisioni aperte

- [ ] Caso d'uso **indipendente da Daniel** che giustifichi (o meno) Fasi 1-3.
- [ ] Esito del giro cross-model esterno sulle 8 domande di §7.
- [ ] Schema concreto `edges/` (tipi, indici, rules) per Fase 0.
- [ ] Design dello scrubber temporale come layer di autorizzazione (nodo irriducibile #2).
- [ ] Tecnologia indice lessicale (searchTokens nativi vs Typesense/Algolia) per Fase 0.5.

---

## 9. Cronologia sessioni

- **2026-06-01** — Genesi. Trasposizione della "visione viva" in blueprint a grafo (4 primitivi, edge-log,
  Costituzione, migrazione strangler-fig). Esperienza utente (3 scene + creazione diretta + doc-informazione).
  **Validazione adversarial** (43 agenti, 36 obiezioni, difensore, giudice): verdetto *solido-con-modifiche*,
  2 nodi irriducibili, 12 debolezze → Costituzione emendata, piano rifasato (0 / 0.5 / backlog), 8 domande
  per il giro cross-model. Documento creato (non committato).
