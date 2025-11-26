import { createRouter, createWebHistory } from 'vue-router';

console.log("CARICAMENTO ROUTER AGGIORNATO CON ADMIN..."); // <--- Questo deve apparire

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: () => import('../views/LoginView.vue')
    },
    {
      path: '/preventivatore',
      name: 'builder',
      component: () => import('../views/BuilderView.vue')
    },
    {
      path: '/admin',    
      name: 'admin',
      component: () => import('../views/AdminView.vue')
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: () => import('../views/OnboardingView.vue')
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('../views/ClientDashboard.vue')
    }
  ]
});

export default router;
