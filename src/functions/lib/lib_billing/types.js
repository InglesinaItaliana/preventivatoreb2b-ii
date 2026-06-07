"use strict";
// ============================================================================
// BillingProvider — astrazione del backend di fatturazione (Fase 2 migrazione)
// ----------------------------------------------------------------------------
// Interfaccia comune ai due backend amministrativi di POPS:
//   - FiC  = Fatture in Cloud   (legacy, vecchia P.IVA)
//   - CiC  = Contabilità in Cloud / Reviso (nuova P.IVA, dal 20/6/2026)
// Il resto di POPS non deve sapere quale backend gira sotto: chiede al provider
// di creare/eliminare documenti e basta. La selezione avviene a runtime in base
// a config/billing.activeBackend e al campo billingBackend congelato sul
// preventivo. Vedi docs/risorsexCiC/piano-migrazione-cic.html.
// ============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
//# sourceMappingURL=types.js.map