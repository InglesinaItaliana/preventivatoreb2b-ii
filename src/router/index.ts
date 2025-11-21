import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../views/LoginView.vue';
import BuilderView from '../views/BuilderView.vue';
import AdminView from '../views/AdminView.vue'; 
import ClientDashboard from '../views/ClientDashboard.vue'; // Importa
import OnboardingView from '../views/OnboardingView.vue'; // <--- IMPORTA

console.log("CARICAMENTO ROUTER AGGIORNATO CON ADMIN..."); // <--- Questo deve apparire

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'login',
      component: LoginView
    },
    {
      path: '/preventivatore',
      name: 'builder',
      component: BuilderView
    },
    {
      path: '/admin',    
      name: 'admin',
      component: AdminView
    },
    {
      path: '/onboarding',
      name: 'onboarding',
      component: OnboardingView
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: ClientDashboard
    }
  ]
});

export default router;