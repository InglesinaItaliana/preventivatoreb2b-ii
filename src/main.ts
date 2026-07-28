import { createApp } from 'vue';
import { createPinia } from 'pinia';
import './style.css';
import App from './App.vue';
import router from './router/index'; 
import { auth } from './firebase'; // <--- Importiamo Auth
import { onAuthStateChanged } from 'firebase/auth'; // <--- Importiamo il listener
import { installaRecuperoChunk } from './lib/recuperoChunk';

// Dopo un deploy, una scheda rimasta aperta esegue il codice vecchio e alla
// prima rotta lazy chiede un chunk che non esiste più. Qui l'errore diventa un
// ricaricamento sulla destinazione richiesta, invece di un blocco da risolvere
// a mano con Cmd+Shift+R. Scatta SOLO durante una navigazione, mai mentre si
// sta lavorando in una schermata: un preventivo in composizione vive solo in
// memoria e un ricaricamento a sorpresa lo butterebbe via.
// Fuori da onAuthStateChanged: deve valere anche se l'app non arriva a montarsi.
installaRecuperoChunk(router);

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