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

  // 2. Se richiede auth ma non c'è utente -> Login
  if (!currentUser) {
    next('/');
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
          const allowedPaths = ['/production', '/delivery'];
          if (!allowedPaths.includes(to.path)) {
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