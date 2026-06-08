# NEBULA — Flotta (Mezzi) + Archivio file

> Anagrafica mezzi aziendali, scadenze compliance e deposito centralizzato di file binari.
> Owner: **NEBULA** (`/nebula/mezzi`, `/nebula/archivio`). NOVA e QUASAR sono consumer.

**Ultima revisione:** 2026-06-07

Documenti correlati: [ATLAS](ATLAS.md), [STELLA-GRAFO](STELLA-GRAFO.md), [LYRA](LYRA.md)

---

## 1. Pilastri NEBULA (aggiornato)

| Area | Path | Contenuto |
|---|---|---|
| Squadra | `/nebula` | Team, organigramma (sola lettura) |
| Documenti | `/nebula/docs` | Wiki Notion / TipTap (NEBULA-DOCS) |
| **Archivio** | `/nebula/archivio` | PDF, scansioni, allegati binari |
| **Mezzi** | `/nebula/mezzi` | Flotta furgoni/auto + scadenze |

**Archivio ≠ Documenti:** i wiki sono in `nebulaDocs`; i file binari vivono in `nebulaArchivio` + Firebase Storage `nebula-archivio/*`.

**Archivio NEBULA ≠ Archivio POPS:** in POPS "Archivio" = ordini consegnati (`ArchiveModal`); in NEBULA = file aziendali.

---

## 2. Modello dati

- `nebulaArchivio/{fileId}` — metadata file
- `nebulaArchivioFolders/{folderId}` — cartelle (MVP)
- `vehicles/{vehicleId}` — anagrafica mezzo (`assigneeUid` → `/team/{uid}`)
- `vehicleDeadlines/{deadlineId}` — scadenze flat (calendario QUASAR)

Collegamenti: `vehicles.archivioFileIds` ↔ `nebulaArchivio.linkedVehicleIds` via `linkArchivioToVehicle()`.

---

## 3. Permessi

| Azione | Chi |
|---|---|
| Leggere Archivio / Mezzi | Team interno autenticato |
| Upload / CRUD | Solo **ADMIN** (`isAdmin()` rules + `canManageArchivio` / `canManageFleet`) |

LOGISTICA ha già accesso a `/nebula` (routing) in sola lettura.

---

## 4. Integrazioni

- **QUASAR Calendario:** `useCalendarItems` proietta `vehicle_deadline` con `source: 'nebula'`
- **P.O.P.S. Delivery:** `NovaVehiclePicker` opzionale in `DeliveryView` alla creazione viaggio (accanto all'autista)

---

## 5. File principali

```
src/composables/shared/useNebulaArchivio.ts
src/composables/shared/useVehicles.ts
src/composables/nebula/useVehicleArchivioLinks.ts
src/views/nebula/NebulaArchivioView.vue
src/views/nebula/NebulaMezziView.vue
storage.rules
```
