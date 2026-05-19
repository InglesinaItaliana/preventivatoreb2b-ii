# POPS — Next Steps

> Documento di lavoro per riprendere la review della sezione consegne POPS.
> Salvato il 2026-05-18 su branch `fix/delivery`.

---

## 0. Contesto: cosa è stato già fatto

**Branch corrente:** `fix/delivery`

**Cron `autoDeliveredAfter7Days` deployata** (`src/functions/index.ts`, `firestore.indexes.json`).
- Trigger: ogni giorno 06:00 Europe/Rome, region `europe-west1`.
- Logica: `stato == 'SHIPPED'` AND `dataSpedizione <= now - 7gg` → `stato = 'DELIVERED'`, `autoDelivered: true`, `dataConsegnaEffettiva = dataSpedizione + 7gg`.
- Indice composito creato: `preventivi.stato + preventivi.dataSpedizione`.
- Primo run: convertiti solo 2 ordini (gli unici SHIPPED reali >7gg).

**Scoperta importante durante diagnosi:**
- Il badge SPEDIZIONI in AdminView mostra 122 (somma di `READY + DELIVERY + SHIPPED` via `getCountFromServer`).
- Verifica Firestore: la stragrande maggioranza dei 122 è in stato `DELIVERY`, non `SHIPPED`.
- Stimati ~86 ordini `DELIVERY` con `assignedToTrip == true` ma trip inesistente (la collection `trips` è scomparsa — Firestore garbage-collect quando vuota; nessun `deleteDoc` nel codice → cancellati a mano in passato).
- Questi 86 sono "orfani": invisibili al pool `DeliveryView` (filtrato da `!assignedToTrip`), invisibili nei trip attivi (non esistono), e fuori dai 50 doc caricati in lista admin (`AdminView.vue:274` ha `limit(50)` con `orderBy('dataCreazione','desc')`).

---

## 1. Analisi codice sezione consegne (DeliveryView.vue + DeliveryModal.vue + rules)

### 🔴 Critici (fonti di bug reali)

**1. `closeTrip` non verifica ordini non firmati** — `DeliveryView.vue:484-496`
Causa diretta degli 86 orfani. Imposta `status: 'CLOSED'` sul trip e basta. Gli ordini con `assignedToTrip: true` non firmati restano in DELIVERY per sempre.

**2. `createTrip` race condition** — `DeliveryView.vue:292-327`
Crea `addDoc('trips')` PRIMA del batch update degli ordini. Se il batch fallisce, trip senza ordini + ordini ri-pianificabili. Fix: `runTransaction` o batch unico.

**3. Memory leak / multiple subscriptions** — righe 165, 236, 343
`loadPool`, `loadAllActiveTrips`, `loadMyTrip` chiamano `onSnapshot()` senza salvare l'unsubscribe. `loadMyTrip` può essere richiamato da `watch(viewMode)` (riga 257-261) → subscription parallele alla stessa query.

**4. Trip cancellati lasciano ordini bloccati**
Se un admin cancella un trip dalla Console (come è successo per gli 86), gli ordini con `assignedToTrip: true` non vengono mai sbloccati. Niente trigger, niente cleanup.

**5. Firma su Storage orfana se batch fallisce** — `handleConfirmDelivery:443-460`
Upload firma → `getDownloadURL` → `batch.commit()`. Se il batch fallisce dopo l'upload, la PNG resta su Storage senza riferimenti.

**6. Firestore rules `trips` troppo permissive** — `firestore.rules:73-77`
```
allow read, write: if request.auth != null;
```
Qualunque utente loggato (anche clienti B2B) può leggere/modificare/cancellare qualunque trip. Bug di sicurezza.

### 🟠 Medi (fragilità non immediate)

**7. N round-trip Firestore per caricare gli stop di un trip** — `DeliveryView.vue:270-272, 352-354`
Per ogni stop una `getDocs(query(... where('__name__', '==', oid)))`. Meglio `getDoc(doc(db, 'preventivi', oid))` o `where(documentId(), 'in', chunks)` (30 per chunk).

**8. `checkRole` con email hardcoded** — riga 139-146
Due email cablate. Il resto di POPS usa Custom Claims (`syncTeamRoleToAuth` in `functions/index.ts:84`). Inconsistente.

**9. `loadMyTrip` assume 1 solo trip OPEN per driver** — `snap.docs[0]`
Se ce ne sono 2 (bug), il secondo è invisibile. Niente warning.

**10. `closeTrip` confirmModal non ha `onCancel`** — gestione chiusura modal non chiara.

**11. `fetchClientAddresses` assume `users.{uid}` = Firebase Auth UID** — riga 74-89
Fallback su email esiste, ma logica fragile.

**12. `groupedTripStops` mostra count ordini freezato** — riga 533-535
Se un ordine di un DDT viene cancellato dopo, lo stop continua a esistere senza warning.

### 🟢 Quality / piccoli

13. `alert()` per errori → incoerente col resto di POPS (modal/toast).
14. `console.log [DEBUG]` ancora in produzione → righe 166, 172.
15. Indentazione mista 2/4 spazi nello stesso file.
16. Commenti "AGGIUNGI QUESTO" → tracce di refactor stratificati, da ripulire.
17. `selectedOrderForDelivery` mai resettato dopo successo/errore.
18. Canvas firma: nessuna soglia minima → si può "confermare" con uno scarabocchio (1 pixel basta a settare `hasSignature: true`).

### ✅ Cose fatte bene

- Cascata fallback indirizzi (UID → email → campi vari).
- Raggruppamento DDT in `groupedTripStops` corretto, evita firme duplicate.
- Update locale immediato dopo conferma → UX reattiva.
- `getEventCoords` nel DeliveryModal gestisce mouse + touch.
- Pulsante "CONFERMA CONSEGNA" disabilitato se `!hasSignature`.
- Filtro client-side per `!assignedToTrip` per gestire campo undefined.

---

## 2. Priorità di intervento (ordine consigliato)

| # | Azione | Risolve | Branch consigliato |
|---|---|---|---|
| 1 | Fix `closeTrip` → bloccare chiusura con ordini non DELIVERED, o auto-DELIVERED con flag "no signature" | Sorgente degli orfani (preventivo) | `fix/delivery` |
| 2 | Fix rules `/trips/{tripId}` → restringere a `isAdmin()` per write, admin + driver per read | Sicurezza | `fix/delivery` |
| 3 | Fix subscription leaks → salvare unsubscribe, cleanup in `onUnmounted` | Letture Firestore raddoppiate, race UI | `fix/delivery` |
| 4 | Fix `createTrip` race → `runTransaction` o batch unico | Stati inconsistenti | `fix/delivery` |
| 5 | Estendere cron `autoDeliveredAfter7Days` per coprire `DELIVERY + assignedToTrip == true` con threshold (es. 14gg) | Pulizia 86 orfani esistenti | `fix/delivery` |
| 6 | Cleanup firma orfana → rules Storage + retry pattern o delete su batch fail | Spreco Storage | future |
| 7 | Punti 7-18 (refactor query, custom claims, alert→toast, ecc.) | Qualità codice | future |

---

## 3. Open follow-up (rimasti in sospeso nella sessione)

- **Badge SPEDIZIONI 122 vs 18 reali**: il fix scelto era inizialmente "cron SHIPPED→DELIVERED" (deployata) — ma il vero problema sono i DELIVERY orfani, non gli SHIPPED. Da decidere se:
  - estendere la cron al caso DELIVERY (azione #5 qui sopra), oppure
  - cambiare la query del badge in `AdminView.vue:389` per escludere `DELIVERY` con `assignedToTrip == true && tripId non esistente` (più chirurgico, ma costoso da implementare).

- **Indice "fantasma" in Firestore**: il deploy ha segnalato 1 indice in prod non presente in `firestore.indexes.json`. Da identificare e sincronizzare (NON `--force` delete prima di sapere quale query lo usa).

---

## 4. Riferimenti

- POLARIS roadmap: vedere `POLARIS.md` per il contesto strategico suite-of-webapps.
- File toccati nella sessione: `src/functions/index.ts` (additivo), `firestore.indexes.json` (additivo).
- File analizzati: `src/views/DeliveryView.vue` (960 righe), `src/components/DeliveryModal.vue`, `firestore.rules` (sezione trips).

---

## 5. Come riprendere

Quando vorrai riprendere, dimmi semplicemente "leggi POPSnextstep.md e ripartiamo da qui" e potremo:
1. Scegliere quale priorità affrontare (1-7 sopra).
2. Pianificare il fix in dettaglio.
3. Implementare su `fix/delivery` (o branch dedicato se preferisci).
4. Testare e poi decidere il deploy.
