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
  // LOGISTICA: PULSAR completo + CEPHEID (sola lettura/esegui delle proprie task,
  // gating fine lato CEPHEID via capabilities).
  LOGISTICA:  ['/delivery', '/nebula', '/pulsar', '/cepheid'],
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
  canCreateTasks: boolean     // CEPHEID: creare azioni/task
  canTriage: boolean          // CEPHEID: accesso a Smistamento (assegnare task)
  canSeeAllTasks: boolean     // CEPHEID: vede tutte le task (false = solo le proprie assegnate/create)
  canEditAnyTask: boolean     // CEPHEID: edit/elimina task di chiunque
  canEditOwnTask: boolean     // CEPHEID: edit le proprie task (assegnate/create)
}

const EMPTY_CAPS: Capabilities = {
  canEditProjects: false, canManageTeamMeta: false, canCreateTasks: false,
  canTriage: false, canSeeAllTasks: false, canEditAnyTask: false, canEditOwnTask: false,
}

export const ROLE_CAPABILITIES: Record<Role, Capabilities> = {
  // ADMIN: tutto.
  ADMIN:       { canEditProjects: true, canManageTeamMeta: true, canCreateTasks: true, canTriage: true, canSeeAllTasks: true, canEditAnyTask: true, canEditOwnTask: true },
  // COMMERCIALE: accesso ampio CEPHEID (come storicamente), ma niente edit progetti/team.
  COMMERCIALE: { canEditProjects: false, canManageTeamMeta: false, canCreateTasks: true, canTriage: true, canSeeAllTasks: true, canEditAnyTask: true, canEditOwnTask: true },
  // PRODUZIONE: crea task + vede/modifica SOLO le proprie. Niente smistamento.
  PRODUZIONE:  { canEditProjects: false, canManageTeamMeta: false, canCreateTasks: true, canTriage: false, canSeeAllTasks: false, canEditAnyTask: false, canEditOwnTask: true },
  // LOGISTICA: sola lettura delle proprie + completamento. Niente creazione/edit/smistamento.
  LOGISTICA:   { canEditProjects: false, canManageTeamMeta: false, canCreateTasks: false, canTriage: false, canSeeAllTasks: false, canEditAnyTask: false, canEditOwnTask: false },
  '':          { ...EMPTY_CAPS },
}

export function capabilitiesFor(role: Role): Capabilities {
  return ROLE_CAPABILITIES[role] ?? EMPTY_CAPS
}

// --- Predicati task-level (puri) per il gating CEPHEID ---
interface TaskLike { assignees?: string[]; createdBy?: string }

/** True se la task è "propria": assegnata a me (email) o creata da me (uid). */
export function isOwnTask(task: TaskLike, myEmail?: string | null, myUid?: string | null): boolean {
  const email = (myEmail ?? '').toLowerCase().trim()
  if (email && (task.assignees ?? []).some(a => (a ?? '').toLowerCase().trim() === email)) return true
  if (myUid && task.createdBy === myUid) return true
  return false
}

/** Può editare/eliminare i campi della task. */
export function canEditTask(caps: Capabilities, task: TaskLike, myEmail?: string | null, myUid?: string | null): boolean {
  if (caps.canEditAnyTask) return true
  if (caps.canEditOwnTask) return isOwnTask(task, myEmail, myUid)
  return false
}

/** Può segnare eseguita/completata la task (tutti possono sulle proprie). */
export function canCompleteTask(caps: Capabilities, task: TaskLike, myEmail?: string | null, myUid?: string | null): boolean {
  return caps.canEditAnyTask || isOwnTask(task, myEmail, myUid)
}
