import { initializeApp } from 'firebase/app';
// 1. Aggiornati import per la nuova gestione della cache
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';
import { getFunctions } from "firebase/functions";

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

export { db, auth, storage, functions, app };