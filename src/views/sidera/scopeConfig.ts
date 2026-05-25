/**
 * Scope configuration registry for the SIDERA suite-of-webapps.
 *
 * Each scope (PULSAR, CEPHEID, NEBULA, NOVA, MAGNETAR, QUASAR) declares what
 * its mobile chrome should show (header brand, bottom-nav voices, FAB action).
 * Read by ContextualMobileHeader / ContextualBottomNav / ContextualFab.
 *
 * Adding a new scope: append an entry, update detectScope() if the path prefix
 * isn't auto-derived. Vedi docs/ATLAS.md sez. 3 e 14.
 */

export type ScopeId = 'pulsar' | 'cepheid' | 'nebula' | 'nova' | 'magnetar' | 'quasar' | 'sidera'

export interface NavItem {
  path: string
  exact: boolean
  label: string
  icon: string
  /**
   * Quando true, l'entry è visibile solo agli utenti per cui
   * useCoreAdmins().isCoreAdmin === true. I consumer (SideraLayout sidebar,
   * ContextualBottomNav) filtrano prima del render.
   */
  requiresCoreAdmin?: boolean
}

/**
 * Feature flag NEBULA-DOCS (vedi docs/NEBULA-DOCS.md §12).
 * - true  = la feature esiste, ma in Fase 1 è gate'd da requiresCoreAdmin sulla
 *           voce nav e dal guard router (route /nebula/docs/* redirige fuori
 *           per non-CORE-admin).
 * - false = kill switch totale (route 404 per tutti).
 * In Fase 2 (rollout generale) togliere requiresCoreAdmin dalla voce Doc.
 */
export const ENABLE_NEBULA_DOCS = true

export interface FabConfig {
  icon: string
  /** Identifier of the action; consumed via provide/inject by the active scope view. */
  action: 'new-chat' | 'new-task' | 'new-project' | 'new-goal' | 'none'
  ariaLabel: string
}

export interface ScopeConfig {
  /** Display name in headers, e.g. 'PULSAR'. */
  name: string
  /** Letters used for the dotted wordmark P·U·L·S·A·R. */
  wordmark: string
  /** Single-vertex brand SVG identifier for ScopeBrandIcon. */
  brandSvg: ScopeId
  /** Bottom-nav voices (pill on mobile). */
  mobileNav: NavItem[]
  /** FAB on mobile. Omit for scopes without a primary action. */
  fab?: FabConfig
  /** True if the current path should show the mobile back button (not a top-level nav target). */
  isTopLevelPath: (path: string) => boolean
  /** Login redirect when unauthenticated (PWA login flow). */
  loginPath: string
  /** Scope where to register FCM tokens via useNotifications. */
  notificationScope: 'pulsar' | 'cepheid' | 'nebula' | 'sidera'
}

export const SCOPE_CONFIGS: Record<Exclude<ScopeId, 'sidera'>, ScopeConfig> = {
  pulsar: {
    name: 'PULSAR',
    wordmark: 'PULSAR',
    brandSvg: 'pulsar',
    mobileNav: [
      { path: '/pulsar',           exact: true,  label: 'Messaggi',  icon: 'forum' },
      { path: '/pulsar/sequentia', exact: false, label: 'Azioni',    icon: 'check_circle' },
      { path: '/pulsar/pending',   exact: false, label: 'Pendenze',  icon: 'notifications' },
      { path: '/pulsar/tags',      exact: false, label: 'Etichette', icon: 'sell' },
    ],
    fab: { icon: 'chat_add_on', action: 'new-chat', ariaLabel: 'Nuova conversazione' },
    isTopLevelPath: (p) =>
      ['/pulsar', '/pulsar/sequentia', '/pulsar/pending', '/pulsar/tags'].includes(p),
    loginPath: '/pulsar/login',
    notificationScope: 'pulsar',
  },
  cepheid: {
    name: 'CEPHEID',
    wordmark: 'CEPHEID',
    brandSvg: 'cepheid',
    mobileNav: [
      { path: '/cepheid',          exact: true,  label: 'Azioni',    icon: 'check_circle' },
      { path: '/cepheid/projects', exact: false, label: 'Progetti',  icon: 'folder' },
      { path: '/cepheid/goals',    exact: false, label: 'Obiettivi', icon: 'flag' },
      { path: '/cepheid/smistamento', exact: false, label: 'Smistamento', icon: 'move_to_inbox' },
    ],
    fab: { icon: 'add_circle', action: 'new-task', ariaLabel: 'Nuova azione' },
    isTopLevelPath: (p) =>
      ['/cepheid', '/cepheid/projects', '/cepheid/goals', '/cepheid/smistamento'].includes(p),
    loginPath: '/cepheid/login',
    notificationScope: 'cepheid',
  },
  nebula: {
    name: 'NEBULA',
    wordmark: 'NEBULA',
    brandSvg: 'nebula',
    mobileNav: [
      { path: '/nebula',      exact: true,  label: 'Team', icon: 'group' },
      { path: '/nebula/docs', exact: false, label: 'Doc',  icon: 'description', requiresCoreAdmin: true },
    ],
    isTopLevelPath: (p) => p === '/nebula' || p === '/nebula/docs',
    loginPath: '/nebula/login',
    notificationScope: 'nebula',
  },
  // Placeholder per moduli non ancora promossi a PWA standalone.
  // Quando NOVA/MAGNETAR/QUASAR avranno il loro layout mobile,
  // si popolano mobileNav, fab, isTopLevelPath, loginPath.
  nova: {
    name: 'NOVA',
    wordmark: 'NOVA',
    brandSvg: 'nova',
    mobileNav: [],
    isTopLevelPath: () => true,
    loginPath: '/nova/login',
    notificationScope: 'sidera',
  },
  magnetar: {
    name: 'MAGNETAR',
    wordmark: 'MAGNETAR',
    brandSvg: 'magnetar',
    mobileNav: [],
    isTopLevelPath: () => true,
    loginPath: '/magnetar/login',
    notificationScope: 'sidera',
  },
  quasar: {
    name: 'QUASAR',
    wordmark: 'QUASAR',
    brandSvg: 'quasar',
    mobileNav: [
      { path: '/quasar/cruscotto', exact: false, label: 'Cruscotto', icon: 'home' },
      { path: '/quasar/quadranti', exact: false, label: 'Quadranti', icon: 'grid_view' },
      { path: '/quasar/attivita',  exact: false, label: 'Attività',  icon: 'history' },
    ],
    isTopLevelPath: (p) => ['/quasar', '/quasar/cruscotto', '/quasar/quadranti', '/quasar/attivita'].includes(p),
    loginPath: '/quasar/login',
    notificationScope: 'sidera',
  },
}

/**
 * Map a route path to its scope. Falls back to 'sidera' for /sidera/* and
 * anything outside known scopes (the layout will then show the SIDERA hub
 * sidebar nav, not module-specific chrome).
 */
export function detectScope(path: string): ScopeId {
  if (path.startsWith('/pulsar')) return 'pulsar'
  if (path.startsWith('/cepheid')) return 'cepheid'
  if (path.startsWith('/nebula')) return 'nebula'
  if (path.startsWith('/nova')) return 'nova'
  if (path.startsWith('/magnetar')) return 'magnetar'
  if (path.startsWith('/quasar')) return 'quasar'
  return 'sidera'
}

/** Returns config for the active scope, or null when scope === 'sidera' (no module chrome). */
export function getScopeConfig(scope: ScopeId): ScopeConfig | null {
  if (scope === 'sidera') return null
  return SCOPE_CONFIGS[scope]
}
