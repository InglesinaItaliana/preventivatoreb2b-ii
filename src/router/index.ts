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
      path: '/production',    
      name: 'production',
      component: () => import('../views/ProductionDashboard.vue')
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
    },
    {
      path: '/calcoli',
      name: 'calcoli',
      component: () => import('../views/CalcoliLavorazioni.vue')
    },
    {
      path: '/delivery',
      name: 'delivery',
      component: () => import('../views/DeliveryView.vue')
    },
    {
      path: '/stack',
      name: 'stack',
      component: () => import('../components/StackVisualizer.vue')
    },
    {
      path: '/Teaser',
      name: 'Teaser',
      component: () => import('../views/TeaserView.vue')
    }
  ]
});

export default router;
