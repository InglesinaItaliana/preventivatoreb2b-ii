# Accesso e gestione del team — ⚠️ superato (implementato)

> Questo era il documento di **piano** (2026-05-30) per centralizzare la gestione
> del team su SIDERA CORE. Il piano è stato **implementato e messo in produzione**
> il 2026-06-01. Il contenuto durevole (modello identità, principio "SIDERA possiede
> l'identità", convenzione campi core vs estensioni, due livelli di admin) vive ora
> in **`docs/STELLA-GRAFO.md`**, fonte di verità unica per identità e gestione agenti.

## Cosa è stato realizzato

- **§1** — UI di gestione team spostata in SIDERA CORE: route `/sidera/core/team`
  (`CoreTeamView.vue`), gated `isCoreAdmin`. Crea / ruolo / disabilita / email /
  Admin CORE in un'unica pagina. La gestione in POPS (`AdminSettings.vue`) è rimasta
  come accesso legacy (scelta esplicita).
- **§2** — `active` soft-disable: i disabilitati spariscono dalle liste selezionabili
  (`useTeamMembers` filtra `active === false`), lo storico resta.
- **§3** — convenzione campi core vs estensioni di modulo → in `STELLA-GRAFO.md §2`.
- **§4** — refresh token dopo cambio ruolo (`getIdToken(true)` sul proprio account).

→ **Per qualsiasi cosa su identità/gestione agenti, vedere `docs/STELLA-GRAFO.md`.**
Questo file può essere eliminato.
