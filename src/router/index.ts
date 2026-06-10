import { createRouter, createWebHistory } from 'vue-router';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { getTeamDoc } from '../composables/sidera/useTeamMembers';
import { ENABLE_NEBULA_DOCS, detectScope, getScopeConfig } from '../views/sidera/scopeConfig';
import { roleFallbackPath, isPathAllowedForRole, isForbiddenClientPath, type Role } from './permissions';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: () => import('../views/LoginView.vue')
    },
    {
      // CORREZIONE 1: Rinominato path da '/builder' a '/preventivatore' 
      // per corrispondere ai link del tuo FAB e del pulsante "Nuova Commessa"
      path: '/preventivatore',
      name: 'builder',
      component: () => import('../views/BuilderView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/production',    
      name: 'production',
      component: () => import('../views/ProductionDashboard.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin',    
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('../views/OnboardingView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/ClientDashboard.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/calcoli',
      name: 'calcoli',
      component: () => import('../views/CalcoliLavorazioni.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/delivery',
      name: 'delivery',
      component: () => import('../views/DeliveryView.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/stack',
      name: 'stack',
      component: () => import('../components/StackVisualizer.vue'),
      meta: { requiresAuth: true }
    },
    {
      path: '/admin/settings',
      name: 'admin-settings',
      component: () => import('../views/AdminSettings.vue'),
      meta: { requiresAuth: true }
    },
    // ── SIDERA ──────────────────────────────────────────────────────────────
    {
      path: '/sidera',
      component: () => import('../views/sidera/SideraLayout.vue'),
      meta: { requiresAuth: true },
      children: [
        { path: '',           name: 'sidera-home',    component: () => import('../views/sidera/HomeView.vue') },
        { path: 'hub',        redirect: '/sidera' },
        // Route legacy /sidera/{tasks,projects,projects/:id} eliminate 2026-05-20:
        // tutte redirect a /cepheid/* dopo che le feature SIDERA-specific sono state
        // portate dentro le viste CEPHEID (filter tabs estesi, edit modal, context menu,
        // archive toggle, etc).
        { path: 'tasks',        redirect: '/cepheid' },
        { path: 'projects',     redirect: '/cepheid/projects' },
        { path: 'projects/:id', redirect: (to) => `/cepheid/project/${to.params.id}` },
        { path: 'goals',      name: 'sidera-goals',   component: () => import('../views/cepheid/CepheidGoalsView.vue') },
        { path: 'goal/:id',   name: 'sidera-goal',    component: () => import('../views/cepheid/CepheidGoalDetail.vue') },
        { path: 'chat',       name: 'sidera-chat',    component: () => import('../views/sidera/ChatView.vue') },
        { path: 'nova/spedizioni', name: 'nova-spedizioni', component: () => import('../views/nova/NovaSpedizioniView.vue') },
        { path: 'admin/maintenance', name: 'sidera-admin-maintenance', component: () => import('../views/sidera/SideraAdminMaintenance.vue') },
        // CORE → Gestione team (docs/STELLA-GRAFO.md): identità agenti + accesso
        // Admin CORE unificati qui (ex pagina Impostazioni assorbita). Gated isCoreAdmin.
        { path: 'core/team', name: 'sidera-core-team', component: () => import('../views/sidera/CoreTeamView.vue') },
        // CORE → Funzioni: etichette mansione → categoria + ruolo-permessi (docs/STELLA-GRAFO.md).
        { path: 'core/funzioni', name: 'sidera-core-funzioni', component: () => import('../views/sidera/CoreFunzioniView.vue') },
        // CORE → Integrazioni: API key Claude/MCP (spostate da /nebula/docs/settings/integrations).
        // Componente invariato, cambia solo dove è montato in sidebar.
        { path: 'core/integrations', name: 'sidera-core-integrations', component: () => import('../views/nebula/docs/NebulaIntegrationsView.vue') },
        { path: 'core/bugs', name: 'sidera-core-bugs', component: () => import('../views/sidera/CoreBugsView.vue') },
        { path: 'core/bugs/:id', name: 'sidera-core-bug', component: () => import('../views/sidera/CoreBugDetail.vue') },
        { path: 'core/ricerca-fic', name: 'sidera-core-fic-search', component: () => import('../views/sidera/CoreFicSearchView.vue') },
      ]
    },
    // ── PULSAR (scope mobile, montato sotto SideraLayout adattivo) ──────────
    {
      path: '/pulsar/login',
      name: 'pulsar-login',
      component: () => import('../views/shared/ScopedLogin.vue'),
      props: {
        scope: 'pulsar',
        primaryColor: '#3AAF98',
        title: 'PULSAR',
        tagline: 'Chat · Comunicazione · Collaborazione',
        redirectPath: '/pulsar',
      },
      meta: { pulsarScope: true }
    },
    {
      path: '/pulsar',
      component: () => import('../views/sidera/SideraLayout.vue'),
      meta: { requiresAuth: true, pulsarScope: true },
      children: [
        { path: '',         name: 'pulsar-chats',   component: () => import('../views/pulsar/PulsarChatsView.vue') },
        { path: 'chat/:id', name: 'pulsar-chat',    component: () => import('../views/pulsar/PulsarMessageView.vue') },
        { path: 'tags',     name: 'pulsar-tags',    component: () => import('../views/pulsar/PulsarTagsView.vue') },
        { path: 'tag/:tag', name: 'pulsar-hashtag', component: () => import('../views/pulsar/PulsarHashtagView.vue') },
        { path: 'sequentia',name: 'pulsar-seq',     component: () => import('../views/pulsar/PulsarSequentia.vue') },
        { path: 'pending',  name: 'pulsar-pending', component: () => import('../views/pulsar/PulsarPendingView.vue') },
      ]
    },

    // ── NEBULA (PWA indipendente: HR · Anagrafiche · Documentale) ───────────
    {
      path: '/nebula/login',
      name: 'nebula-login',
      component: () => import('../views/shared/ScopedLogin.vue'),
      props: {
        scope: 'nebula',
        primaryColor: '#B85425',
        title: 'NEBULA',
        tagline: 'HR · Anagrafiche · Documentale',
        redirectPath: '/nebula',
      },
      meta: { nebulaScope: true }
    },
    {
      path: '/nebula',
      component: () => import('../views/sidera/SideraLayout.vue'),
      meta: { requiresAuth: true, nebulaScope: true },
      children: [
        { path: '',     name: 'nebula-team', component: () => import('../views/nebula/NebulaTeamView.vue') },
        // NEBULA-DOCS (Fase 1): visibile solo a CORE admin. Gate doppio:
        // - voce nav filtrata in SideraLayout/ContextualBottomNav via requiresCoreAdmin
        // - guard nella beforeEach controlla ENABLE_NEBULA_DOCS + isCoreAdmin
        // Stub view in Fase 1; editor reale in chunk 4 (vedi docs/NEBULA-DOCS.md §11).
        { path: 'docs', name: 'nebula-docs', component: () => import('../views/nebula/docs/NebulaDocsHomeView.vue') },
        // Editor singolo documento (chunk 4). Stesso gate /nebula/docs/*.
        { path: 'docs/:docId', name: 'nebula-doc', component: () => import('../views/nebula/docs/NebulaDocView.vue') },
        // History view (F3-C3): timeline snapshots + restore.
        { path: 'docs/:docId/history', name: 'nebula-doc-history', component: () => import('../views/nebula/docs/NebulaDocHistoryView.vue') },
        // Integrazioni (F4-C2): API key management per MCP server Claude.
        // Spostate in CORE → /sidera/core/integrations (2026-05-29) ma manteniamo
        // questa route come redirect per bookmark / link esterni esistenti.
        { path: 'docs/settings/integrations', name: 'nebula-docs-integrations', redirect: '/sidera/core/integrations' },
        // OAuth 2.0 consent page (F6): claude.ai redirige qui dopo /authorize
        // per chiedere all'utente "Vuoi autorizzare?". Richiede login Firebase
        // (gestito dal guard requiresAuth nel parent route).
        { path: 'docs/oauth/consent', name: 'nebula-docs-oauth-consent', component: () => import('../views/nebula/docs/NebulaOAuthConsentView.vue') },
        // Dev page per testare l'IconPicker isolato (chunk 2). Stesso gate del
        // parent /nebula/docs. Da rimuovere a Fase 1 conclusa.
        { path: 'docs/_dev/icons', name: 'nebula-docs-dev-icons', component: () => import('../views/nebula/docs/_dev/IconPickerDevView.vue') },
        { path: 'archivio', name: 'nebula-archivio', component: () => import('../views/nebula/NebulaArchivioView.vue') },
        { path: 'archivio/:fileId', name: 'nebula-archivio-file', component: () => import('../views/nebula/NebulaArchivioFileView.vue') },
        { path: 'mezzi', name: 'nebula-mezzi', component: () => import('../views/nebula/NebulaMezziView.vue') },
        { path: 'mezzi/:vehicleId', name: 'nebula-vehicle', component: () => import('../views/nebula/NebulaVehicleDetailView.vue') },
      ]
    },

    // ── CEPHEID (PWA indipendente: shell CepheidLayout) ─────────────────────
    {
      path: '/cepheid/login',
      name: 'cepheid-login',
      component: () => import('../views/shared/ScopedLogin.vue'),
      props: {
        scope: 'cepheid',
        primaryColor: '#D4A020',
        title: 'CEPHEID',
        tagline: 'Project Management · Workflow · Task',
        redirectPath: '/cepheid',
      },
      meta: { cepheidScope: true }
    },
    {
      path: '/cepheid',
      component: () => import('../views/sidera/SideraLayout.vue'),
      meta: { requiresAuth: true, cepheidScope: true },
      children: [
        { path: '',           name: 'cepheid-actions',  component: () => import('../views/cepheid/CepheidActionsView.vue') },
        { path: 'goals',      name: 'cepheid-goals',    component: () => import('../views/cepheid/CepheidGoalsView.vue') },
        { path: 'goal/:id',   name: 'cepheid-goal',     component: () => import('../views/cepheid/CepheidGoalDetail.vue') },
        { path: 'projects',   name: 'cepheid-projects', component: () => import('../views/cepheid/CepheidProjectsView.vue') },
        { path: 'project/:id',name: 'cepheid-project',  component: () => import('../views/cepheid/CepheidProjectDetail.vue') },
        { path: 'smistamento', name: 'cepheid-smistamento', component: () => import('../views/cepheid/CepheidInboxView.vue') },
      ]
    },

    // ── QUASAR (PWA indipendente: Analytics · KPI · BI) ─────────────────────
    {
      path: '/quasar/login',
      name: 'quasar-login',
      component: () => import('../views/shared/ScopedLogin.vue'),
      props: {
        scope: 'quasar',
        primaryColor: '#98C0D0',
        title: 'QUASAR',
        tagline: 'Analytics · KPI · Business Intelligence',
        redirectPath: '/quasar',
      },
      meta: { quasarScope: true }
    },
    {
      path: '/quasar',
      component: () => import('../views/sidera/SideraLayout.vue'),
      meta: { requiresAuth: true, quasarScope: true },
      children: [
        { path: '',          redirect: '/quasar/cruscotto' },
        { path: 'cruscotto', name: 'quasar-cruscotto', component: () => import('../views/quasar/QuasarCruscottoView.vue') },
        { path: 'quadranti', name: 'quasar-quadranti', component: () => import('../views/quasar/QuasarQuadrantiView.vue') },
        { path: 'attivita',  name: 'quasar-attivita',  component: () => import('../views/quasar/QuasarAttivitaView.vue') },
        { path: 'calendario', name: 'quasar-calendario', component: () => import('../views/quasar/QuasarCalendarView.vue') },
      ]
    }
  ]
});

// --- GUARD DI NAVIGAZIONE ---
// Util: rileva se siamo in PWA standalone o viewport ≤768px (mobile layout).
// Stessa logica di SideraLayout.vue isMobileLayout — duplicata qui perché il
// router non può importare componable Vue (esegue prima del setup).
function isMobileLayout(): boolean {
  if (typeof window === 'undefined') return false
  const standalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true
  const narrow = window.matchMedia('(max-width: 768px)').matches
  return standalone || narrow
}

router.beforeEach(async (to, from, next) => {
  // NEBULA: su mobile (PWA standalone OR viewport ≤768px) la landing /nebula
  // (Squadra) viene saltata a favore di /nebula/docs (Documenti) — la lista
  // doc è il punto di ingresso più utile per i lavori in mobilità.
  // IMPORTANTE: redirigi solo al primo accesso (da fuori dello scope NEBULA),
  // così se l'utente tocca la tab "Squadra" della bottom-nav venendo da
  // /nebula/docs il navigation funziona regolare. Senza questo check l'utente
  // resta intrappolato su /nebula/docs.
  // NB: lo start_url del manifest è "/nebula/" (con slash finale): includiamo
  // entrambe le forme, altrimenti al cold-launch della PWA il redirect non scatta
  // e si resta su Squadra.
  if (
    (to.path === '/nebula' || to.path === '/nebula/')
    && isMobileLayout()
    && !from.path.startsWith('/nebula')
  ) {
    next('/nebula/docs');
    return;
  }

  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const currentUser = auth.currentUser;

  // 1. Se la rotta non richiede auth, procedi (es. Login)
  if (!requiresAuth) {
    next();
    return;
  }

  // 2. Se richiede auth ma non c'è utente -> Login (scoped per PWA).
  // Scope unificato via detectScope (riusa scopeConfig, POLARIS Az.6):
  // pulsar/cepheid/nebula/quasar -> loro login; SIDERA/POPS -> '/'.
  if (!currentUser) {
    const scope = detectScope(to.path);
    next(getScopeConfig(scope)?.loginPath ?? '/');
    return;
  }

  // 3. CONTROLLI UTENTE LOGGATO
  
  // A. CORREZIONE 2: SUPER ADMIN (Bypass Totale per la tua email)
  // Questo ti garantisce accesso a TUTTO indipendentemente dal DB
  if (currentUser.email === 'info@inglesinaitaliana.it') {
    next();
    return;
  }

  // A-bis. NEBULA-DOCS kill switch (vedi docs/NEBULA-DOCS.md §12).
  // Post F3-C2.7: feature aperta a tutto il team. Per-doc gating gestito da
  // Firestore rules (readerOk(acl)). Resta solo il kill switch totale.
  if (to.path.startsWith('/nebula/docs') && !ENABLE_NEBULA_DOCS) {
    next('/nebula');
    return;
  }

  // B. CONTROLLO TEAM (Database)
  const emailKey = currentUser.email?.toLowerCase().trim();
  if (emailKey) {
    try {
      // /team è uid-keyed (docs/STELLA-GRAFO.md): lettura per UID.
      const teamSnap = await getTeamDoc(currentUser.uid);

      if (teamSnap?.exists()) {
        const role = (teamSnap.data().role ?? '') as Role;

        // Reindirizzamenti forzati per ruoli operativi (PRODUZIONE/LOGISTICA),
        // centralizzati in router/permissions.ts (POLARIS Az.6). Logica identica
        // al guard storico: solo i ruoli con fallback sono ristretti.
        const fallback = roleFallbackPath[role];
        if (fallback && !isPathAllowedForRole(role, to.path)) {
          next(fallback);
          return;
        }

        // ADMIN/COMMERCIALE/altri: passa
        next();
        return;
      }
    } catch(e) {
      console.error("Errore controllo permessi team:", e);
    }
  }

  // C. CLIENTE STANDARD
  // 1. Permetti sempre l'accesso al preventivatore
  if (to.path === '/preventivatore') {
    next();
    return;
  }

  // 2. Blocca le pagine amministrative (lista centralizzata in permissions.ts)
  if (isForbiddenClientPath(to.path)) {
    next('/dashboard');
    return;
  }

  next();
});

export default router;