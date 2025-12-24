import { initializeApp } from 'firebase/app';
// 1. Aggiungi 'enableIndexedDbPersistence' agli import
import { initializeFirestore, enableIndexedDbPersistence } from 'firebase/firestore';
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

const db = initializeFirestore(app, {
    experimentalForceLongPolling: true,
});

// 2. ABILITA LA PERSISTENZA OFFLINE
// Questo va chiamato subito dopo aver inizializzato 'db'
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code == 'failed-precondition') {
        // Probabilmente più schede aperte insieme.
        // La persistenza funzionerà solo nella prima scheda.
        console.warn('Persistenza fallita: Più tab aperti.');
    } else if (err.code == 'unimplemented') {
        // Il browser non supporta la persistenza (es. certi browser in private mode)
        console.warn('Persistenza non supportata dal browser.');
    }
});
  
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west1');

export { db, auth, storage, functions, app };