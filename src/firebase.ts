import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
 apiKey: "AIzaSyA_OLy75pTT5XAzeyjh9e89ff1psPQAPFQ",
 authDomain: "preventivatoreb2b-ii.firebaseapp.com",
 projectId: "preventivatoreb2b-ii",
 storageBucket: "preventivatoreb2b-ii.firebasestorage.app",
 messagingSenderId: "574612046430",
 appId: "1:574612046430:web:e9fc63b07f76c8a43aeacf"
};


const app = initializeApp(firebaseConfig);


// Esporta Database e Storage
export const db = getFirestore(app);
export const storage = getStorage(app);
export const auth = getAuth(app);