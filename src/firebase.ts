import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
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

// 1. Inizializza l'App
const app = initializeApp(firebaseConfig);

// 2. Inizializza i servizi (UNA SOLA VOLTA)
const db = getFirestore(app);
const auth = getAuth(app);
const storage = getStorage(app);
const functions = getFunctions(app, 'europe-west1'); // Importante la regione

// 3. Esporta tutto alla fine
export { db, auth, storage, functions, app };