<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

const router = useRouter();
const azienda = ref('');
const piva = ref('');
const indirizzo = ref('');
const loading = ref(false);

const salvaProfilo = async () => {
  if (!azienda.value || !piva.value) return alert("Nome Azienda e P.IVA obbligatori.");
  
  const user = auth.currentUser;
  if (!user) return router.push('/');

  loading.value = true;
  try {
    // Creiamo la scheda cliente nel DB
    const userProfile = {
        email: user.email,
        ragioneSociale: azienda.value, // Es. "Vetreria Rossi Srl"
        piva: piva.value,
        indirizzo: indirizzo.value,
        dataRegistrazione: serverTimestamp(),
        
        // ✅ AGGIUNGI QUESTO CAMPO PER LA SINCRONIZZAZIONE FIC
        ficId: null, 
        
        uid: user.uid
    };

    // Salviamo nella collezione 'users' usando l'UID come chiave
    await setDoc(doc(db, 'users', user.uid), userProfile);
    
    // Salviamo il nome in locale per usarlo subito
    localStorage.setItem('clientName', azienda.value);
    
    alert("Profilo creato! Benvenuto.");
    router.push('/dashboard');

  } catch (e) {
    console.error(e);
    alert("Errore salvataggio profilo.");
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
    <div class="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-gray-200">
      <div class="text-center mb-8">
        <h1 class="text-2xl font-heading font-bold text-gray-900">Benvenuto!</h1>
        <p class="text-gray-500 text-sm mt-2">Completa il tuo profilo aziendale per iniziare.</p>
      </div>

      <div class="space-y-4">
        <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Ragione Sociale / Nome Vetreria</label>
            <input v-model="azienda" type="text" class="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Es. Vetreria Artistica Rossi">
        </div>
        
        <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Partita IVA</label>
            <input v-model="piva" type="text" class="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-yellow-400" placeholder="IT00000000000">
        </div>

        <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Indirizzo Sede (Opzionale)</label>
            <input v-model="indirizzo" type="text" class="w-full p-3 border rounded-lg bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-yellow-400" placeholder="Via Roma 1, Milano">
        </div>

        <button @click="salvaProfilo" :disabled="loading" class="w-full bg-yellow-400 hover:bg-yellow-500 text-black font-bold py-3 rounded-lg shadow-md transition-all mt-4">
            {{ loading ? 'SALVATAGGIO...' : 'INIZIA A LAVORARE' }}
        </button>
      </div>
    </div>
  </div>
</template>