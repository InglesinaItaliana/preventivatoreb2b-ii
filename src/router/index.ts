import { createRouter, createWebHistory } from 'vue-router';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { ENABLE_NEBULA_DOCS } from '../views/sidera/scopeConfig';

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
        { path: 'core/settings', name: 'sidera-core-settings', component: () => import('../views/sidera/SideraCoreSettings.vue') },
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
      ]
    }
  ]
});

// --- GUARD DI NAVIGAZIONE ---
router.beforeEach(async (to, _from, next) => {
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth);
  const currentUser = auth.currentUser;

  // 1. Se la rotta non richiede auth, procedi (es. Login)
  if (!requiresAuth) {
    next();
    return;
  }

  // 2. Se richiede auth ma non c'è utente -> Login (scoped per PWA)
  if (!currentUser) {
    const isPulsarScope = to.matched.some(r => r.meta.pulsarScope);
    const isCepheidScope = to.matched.some(r => r.meta.cepheidScope);
    const isNebulaScope = to.matched.some(r => r.meta.nebulaScope);
    const isQuasarScope = to.matched.some(r => r.meta.quasarScope);
    next(
      isCepheidScope ? '/cepheid/login' :
      isPulsarScope  ? '/pulsar/login'  :
      isNebulaScope  ? '/nebula/login'  :
      isQuasarScope  ? '/quasar/login'  :
      '/'
    );
    return;
  }

  // 3. CONTROLLI UTENTE LOGGATO
  
  // A. CORREZIONE 2: SUPER ADMIN (Bypass Totale per la tua email)
  // Questo ti garantisce accesso a TUTTO indipendentemente dal DB
  if (currentUser.email === 'info@inglesinaitaliana.it') {
    next();
    return;
  }

  // A-bis. NEBULA-DOCS Fase 1 gate (vedi docs/NEBULA-DOCS.md §11/12).
  // In Fase 1 la feature è visibile solo a CORE admin (super admin sopra è già
  // passato). Quando si rolla in generale (Fase 2), togliere questo blocco e
  // rimuovere requiresCoreAdmin dalla voce nav in scopeConfig.nebula.mobileNav.
  if (to.path.startsWith('/nebula/docs')) {
    if (!ENABLE_NEBULA_DOCS) {
      next('/nebula');
      return;
    }
    try {
      const adminsSnap = await getDoc(doc(db, 'core', 'admins'));
      const emails = (adminsSnap.exists() ? (adminsSnap.data().emails ?? []) : []) as unknown[];
      const userEmail = (currentUser.email ?? '').toLowerCase().trim();
      const isCoreAdmin = emails.some(e => typeof e === 'string' && e.toLowerCase().trim() === userEmail);
      if (!isCoreAdmin) {
        next('/nebula');
        return;
      }
    } catch (e) {
      console.error('[guard nebula-docs] core/admins read failed:', e);
      next('/nebula');
      return;
    }
  }

  // B. CONTROLLO TEAM (Database)
  const emailKey = currentUser.email?.toLowerCase().trim();
  if (emailKey) {
    try {
      const teamSnap = await getDoc(doc(db, 'team', emailKey));
      
      if (teamSnap.exists()) {
        const role = teamSnap.data().role; // 'ADMIN', 'PRODUZIONE', 'LOGISTICA'
        
        // Reindirizzamenti forzati per ruoli operativi
        if (role === 'PRODUZIONE') {
          const allowedPaths = ['/production', '/delivery', '/pulsar', '/cepheid'];
          if (!allowedPaths.some(p => to.path === p || to.path.startsWith(p + '/'))) {
             next('/production');
             return;
          }
       }
        if (role === 'LOGISTICA' && to.path !== '/delivery') {
           next('/delivery');
           return;
        }
        
        // Se è un ADMIN del team o altro ruolo, passa
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

  // 2. Blocca le pagine amministrative
  const forbiddenPaths = ['/admin', '/production', '/delivery', '/stack', '/calcoli'];
  if (forbiddenPaths.some(p => to.path.startsWith(p))) {
    next('/dashboard');
    return;
  }

  next();
});

export default router;