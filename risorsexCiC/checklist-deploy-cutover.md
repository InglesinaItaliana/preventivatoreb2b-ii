# Checklist · Deploy & Cutover FiC → CiC

> Stato al 13/06/2026: lato tecnico **chiuso e in `main`** (DDT via `/issue`, FE-3b,
> sync mappature, Phase B), ma **non ancora deployato** e **dormiente**
> (`config/billing.activeBackend` assente → tutto gira FiC). Vedi
> `risorsexCiC/piano-migrazione-cic.html`.

Legenda: `[ ]` da fare · `[~]` parziale · `[x]` fatto.
Regola d'oro: **il path FiC non deve cambiare mai** finché il backlog non è chiuso.

---

## A · PRE-DEPLOY (tecnico — nessuna fretta, layer dormiente)

Deployare ora **non cambia nulla** per gli utenti (CiC spento, FiC invariato).
Serve solo a portare il codice nuovo in prod, pronto per quando si accenderà.

- [ ] `main` allineato a `origin/main` (`git status` pulito sui file di progetto)
- [ ] Build verdi:
  - [ ] `cd src/functions && npx tsc --noEmit` → exit 0
  - [ ] `npm run build` (frontend, vite) → ok
  - [ ] `npx vitest run` → tutti verdi (regola totali + anti-drift FE/BE)
- [ ] `firebase login --reauth` se le credenziali CLI sono scadute
- [ ] **Deploy**: `firebase deploy --only functions,hosting`
  - ⚠️ le functions sono un **bundle unico**: ridistribuisce *tutte* le funzioni POPS
  - ⚠️ pubblica **tutto lo stato attuale di `main`**, non solo le modifiche CiC
- [ ] Post-deploy — **smoke regressione FiC** (il layer è dormiente, deve filare tutto come prima):
  - [ ] creare un ordine reale → documento FiC generato, totali ok
  - [ ] aprire ordine/DDT, raggruppamento DDT, annulla/reset → ok
  - [ ] verificare che `syncCicMappings` risulti tra le functions deployate

---

## B · PRE-CUTOVER (operativo/fiscale — prima di accendere CiC)

### B1 · Accessi azienda DEFINITIVA (Fase 0/1)
- [ ] Developer agreement Reviso **attivato** (mail a `api@reviso.com`, entro 3 mesi)
- [ ] **Grant token dell'azienda definitiva** (nuova P.IVA) ottenuto — chi apre il grant link: tu o il commercialista
- [ ] `config/cic` popolato coi segreti REALI della nuova azienda:
  - [ ] `appSecretToken` + `agreementGrantToken` (come secret, mai nel repo/client)
  - [ ] ID rilevati nella nuova azienda: `vatCode` (V022 o equivalente), `ddtNumberSeries`, `layoutNumber`, `defaultPaymentTermsNumber`, `domesticVatZone`, `customerGroupNumber`
  - [ ] **`genericProductNumber` = productNumber CiC del prodotto "VARIE"** (il numero, NON la stringa) ← fallback righe senza mapping

### B2 · Dati & mappature (Fase 4)
- [ ] Import nativo **"Importa da Fatture in Cloud"** eseguito (clienti + prodotti + wizard mapping IVA)
- [ ] **NON** importate le fatture storiche nella nuova P.IVA (conferma commercialista)
- [ ] `syncCicMappings({ dryRun: true })` → leggere il **report di match**:
  - clienti per `vatNumber` (== `users.piva`), prodotti per `barCode` (== codice POPS)
  - [ ] risolvere i `missing`: prodotti senza `barCode` in CiC, clienti senza P.IVA
- [ ] `syncCicMappings({ dryRun: false })` → scrive `cicCustomerNumber` / `cicProductId`
- [ ] Riconciliazione conteggi e prezzi FiC vs CiC dopo l'import

### B3 · Documento cliente (#10)
- [ ] Dati reali azienda emittente in `COMPANY` (`src/lib/billingPdfDraw.ts`) — oggi segnaposto

### B4 · Validazione (Fase 5)
- [ ] Test su agreement definitivo: creare ordini/preventivi/DDT reali in CiC
- [ ] **Confronto cifra-per-cifra** col totale mostrato al cliente — validato dall'ufficio (≥10 doc)
- [ ] Casi limite: sconto globale, consegna diretta vs corriere, **DDT multi-ordine**, annullo, **emissione DDT (numero via `/issue`)**, IVA testata/righe
- [ ] Decisione **commercialista**: cutover netto (variante B) vs graduale; numerazione & layout fattura nuova azienda

### B5 · Sicurezza di rete
- [ ] **Kill-switch verificato**: rimettere `activeBackend='fic'` riporta i nuovi ordini su FiC
- [ ] Notifica/monitoraggio errori pronto (badge `billingError` in Admin e DeliveryView)

---

## C · CUTOVER (giorno X — target 20 giugno)

- [ ] Flip **`config/billing.activeBackend = 'cic'`** → i nuovi ordini nascono su CiC
- [ ] Verificare i primi ordini: `cic_order_id` popolato, totali == mostrato cliente, PDF ok
- [ ] Verificare che gli **ordini esistenti** restino `billingBackend:'fic'` (chiusura su FiC)
- [ ] Primo **DDT CiC** reale: numero assegnato (`/issue`), prodotto agganciato via `cicProductId`
- [ ] Monitoraggio attivo: nessun `billingError` impennato
- [ ] 🔴 **Rollback pronto**: se CiC va in crisi → `activeBackend='fic'` (finché la vecchia azienda può ancora emettere)

---

## D · POST-CUTOVER / DRAIN (Fase 7)

- [ ] Smaltire gli ordini FiC aperti (DDT/fatture della vecchia azienda)
- [ ] (Variante B, se scelta) script batch: ordini aperti **senza** `fic_ddt` → ricreati in CiC
- [ ] FiC in **sola lettura** quando backlog = 0 (mantenere lettura storico per sempre)
- [ ] Aggiornare `docs/ATLAS.md` con l'architettura billing finale
- [ ] Rimuovere il **path di scrittura** FiC dal layer (lasciando la sola lettura)

---

## Riferimenti rapidi
- Piano completo: `risorsexCiC/piano-migrazione-cic.html`
- Spike riusabili: `test-ddt.mjs` (crea→emetti) · `stress-ddt-iva.mjs` (IVA casi-limite) · `test-mapping.mjs` (chiavi barCode/vatNumber)
- Progetto Cepheid «FiC to CiC»: milestone Fase 0→7 + variante cutover netto
