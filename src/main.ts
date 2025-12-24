import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';
import router from './router/index'; 
import { auth } from './firebase'; // <--- Importiamo Auth
import { onAuthStateChanged } from 'firebase/auth'; // <--- Importiamo il listener

let app: any;

// "Ascolta" Firebase: appena decide se l'utente c'è o no, monta l'app.
// Questo succede SOLO la prima volta al caricamento/refresh.
onAuthStateChanged(auth, () => {
  if (!app) {
    const pinia = createPinia();
    app = createApp(App);

    app.use(pinia);
    app.use(router);
    
    app.mount('#app');
  }
});