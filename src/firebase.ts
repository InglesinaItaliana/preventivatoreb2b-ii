import { initializeApp } from 'firebase/app';
// 1. Aggiornati import per la nuova gestione della cache
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, connectFirestoreEmulator } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator } from "firebase/functions";

const firebaseConfig = {
 apiKey: "AIzaSyA_OLy75pTT5XAzeyjh9e89ff1psPQAPFQ",
 authDomain: "preventivatoreb2b-ii.firebaseapp.com",
 projectId: "preventivatoreb2b-ii",
 storageBucket: "preventivatoreb2b-ii.firebasestorage.app",
 messagingSenderId: "574612046430",
 appId: "1:574612046430:web:e9fc63b07f76c8a43aeacf"
};

const app = initializeApp(firebaseConfig);

// 2. Nuova configurazione con localCache invece di enableIndexedDbPersistence
const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});
  
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west1');

// --- EMULATORI LOCALI (solo dev, gated da env) ---
// Inerte in produzione: la build prod non imposta VITE_USE_EMULATORS, quindi
// questo blocco non viene mai eseguito e il comportamento resta invariato.
// Avvio dev contro emulatori:  VITE_USE_EMULATORS=true npm run dev
if (import.meta.env.VITE_USE_EMULATORS === 'true') {
    connectFirestoreEmulator(db, 'localhost', 8080);
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFunctionsEmulator(functions, 'localhost', 5001);
    console.info('[firebase] Connesso agli emulatori locali (Firestore:8080, Auth:9099, Functions:5001)');
}

export { db, auth, storage, functions, app };

// NB: l'inizializzazione di `firebase/messaging` è stata spostata in
// `composables/shared/useNotifications.ts` con dynamic import per evitare che
// il chunk firebase-messaging venga preloaded anche su POPS (POLARIS azione 4).