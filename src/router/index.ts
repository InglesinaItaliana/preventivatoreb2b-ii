import { createRouter, createWebHistory } from 'vue-router';
import { auth, db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

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
        { path: 'hub',        name: 'sidera-hub',     component: () => import('../views/sidera/SideraHubView.vue') },
        { path: 'tasks',      name: 'sidera-tasks',   component: () => import('../views/sidera/TasksView.vue') },
        { path: 'projects',   name: 'sidera-projects',component: () => import('../views/sidera/ProjectsView.vue') },
        // Route legacy /sidera/projects/:id (ProjectBoard) eliminata 2026-05-20:
        // ora redirect a /cepheid/project/:id (CepheidProjectDetail con tab list/cal/notes assorbite).
        { path: 'projects/:id', redirect: (to) => `/cepheid/project/${to.params.id}` },
        { path: 'goals',      name: 'sidera-goals',   component: () => import('../views/cepheid/CepheidGoalsView.vue') },
        { path: 'goal/:id',   name: 'sidera-goal',    component: () => import('../views/cepheid/CepheidGoalDetail.vue') },
        { path: 'chat',       name: 'sidera-chat',    component: () => import('../views/sidera/ChatView.vue') },
        { path: 'nebula',     name: 'nebula-team',    component: () => import('../views/nebula/NebulaTeamView.vue') },
        { path: 'nova/spedizioni', name: 'nova-spedizioni', component: () => import('../views/nova/NovaSpedizioniView.vue') },
        { path: 'admin/maintenance', name: 'sidera-admin-maintenance', component: () => import('../views/sidera/SideraAdminMaintenance.vue') },
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
        { path: 'due',        name: 'cepheid-due',      component: () => import('../views/cepheid/CepheidDueView.vue') },
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
    next(isCepheidScope ? '/cepheid/login' : (isPulsarScope ? '/pulsar/login' : '/'));
    return;
  }

  // 3. CONTROLLI UTENTE LOGGATO
  
  // A. CORREZIONE 2: SUPER ADMIN (Bypass Totale per la tua email)
  // Questo ti garantisce accesso a TUTTO indipendentemente dal DB
  if (currentUser.email === 'info@inglesinaitaliana.it') {
    next();
    return;
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