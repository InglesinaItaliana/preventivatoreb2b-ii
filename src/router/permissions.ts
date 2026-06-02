/**
 * Permessi di routing centralizzati — POLARIS Azione 6/9.
 *
 * PURO TypeScript: NESSUN import Vue/Firebase. È importato dal router guard, che
 * gira prima del setup dell'app. Le Firestore rules restano il confine di
 * sicurezza autoritativo; questo file governa solo routing/gating lato client.
 */

export type Role = 'ADMIN' | 'PRODUZIONE' | 'COMMERCIALE' | 'LOGISTICA' | ''

/** Path consentiti per i ruoli operativi (estratti verbatim dal guard storico). */
export const allowedPathsByRole: Partial<Record<Role, string[]>> = {
  PRODUZIONE: ['/production', '/delivery', '/pulsar', '/cepheid', '/nebula'],
  LOGISTICA:  ['/delivery', '/nebula'],
}

/** Dove rimbalza un ruolo operativo che naviga fuori dai suoi path consentiti. */
export const roleFallbackPath: Partial<Record<Role, string>> = {
  PRODUZIONE: '/production',
  LOGISTICA:  '/delivery',
}

/** Path amministrativi vietati ai clienti (redirect a /dashboard). */
export const forbiddenClientPaths = ['/admin', '/production', '/delivery', '/stack', '/calcoli']

/** Matcher identico al guard storico: match esatto o prefisso di segmento. */
function matchPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(prefix + '/')
}

/** True se il ruolo può navigare `path`. Ruoli senza restrizioni (ADMIN/COMMERCIALE/'') → sempre true. */
export function isPathAllowedForRole(role: Role, path: string): boolean {
  const allowed = allowedPathsByRole[role]
  if (!allowed) return true
  return allowed.some(p => matchPath(path, p))
}

/** True se `path` è una pagina amministrativa vietata ai clienti. */
export function isForbiddenClientPath(path: string): boolean {
  return forbiddenClientPaths.some(p => path.startsWith(p))
}

/**
 * Destinazione post-login per ruolo. Usato da guard E LoginView (prima duplicati).
 * NB (POLARIS B1): PRODUZIONE → /production (coerente col fallback del guard;
 * cambia il comportamento storico di LoginView che mandava PRODUZIONE → /delivery).
 */
export function postLoginRoute(role: Role): string {
  if (role === 'PRODUZIONE') return '/production'
  if (role === 'LOGISTICA') return '/delivery'
  return '/admin' // ADMIN, COMMERCIALE, altri
}

/**
 * Capability dichiarative per ruolo (POLARIS Az.9) — gating UI lato client.
 * NON è il confine di sicurezza (quello sono le Firestore rules); serve a
 * centralizzare i vari `isAdmin` sparsi nei componenti. CORE-admin resta
 * ortogonale (allowlist core/admins, vedi useCoreAdmins), NON entra qui.
 */
export interface Capabilities {
  canEditProjects: boolean    // CepheidProjectsView: crea/edit/elimina progetti
  canManageTeamMeta: boolean  // NebulaTeamView: edit posizione/categoria organigramma
}

const EMPTY_CAPS: Capabilities = { canEditProjects: false, canManageTeamMeta: false }

export const ROLE_CAPABILITIES: Record<Role, Capabilities> = {
  ADMIN:       { canEditProjects: true,  canManageTeamMeta: true },
  PRODUZIONE:  { ...EMPTY_CAPS },
  COMMERCIALE: { ...EMPTY_CAPS },
  LOGISTICA:   { ...EMPTY_CAPS },
  '':          { ...EMPTY_CAPS },
}

export function capabilitiesFor(role: Role): Capabilities {
  return ROLE_CAPABILITIES[role] ?? EMPTY_CAPS
}
