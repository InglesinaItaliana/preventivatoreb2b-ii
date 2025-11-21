import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';

// FIX: Puntiamo esplicitamente al file index dentro la cartella router
import router from './router/index'; 

const pinia = createPinia();
const app = createApp(App);

app.use(pinia);
app.use(router);

// Abbiamo rimosso il console.log di debug che causava l'errore "implicit any"
// Ora che il router è configurato non serve più.

app.mount('#app');