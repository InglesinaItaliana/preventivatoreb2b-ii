<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const router = useRouter();
const username = ref('');
const password = ref('');
const loading = ref(false);
const errorMsg = ref('');

const handleLogin = async () => {
  if (!username.value || !password.value) {
    errorMsg.value = "Inserisci le credenziali per accedere.";
    return;
  }

  loading.value = true;
  errorMsg.value = '';

  try {
    // 1. Login con Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, username.value, password.value);
    const user = userCredential.user;

    // 2. Controllo Ruoli Speciali
    
    // ADMIN -> Vai diretto alla Dashboard Admin
    if (user.email === 'info@inglesinaitaliana.it') {
      router.push('/admin');
      return;
    }

    // PRODUZIONE -> Vai diretto alla Dashboard Produzione
    if (user.email === 'lavorazioni.inglesinaitaliana@gmail.com') {
      router.push('/production');
      return;
    }

    // 3. Controllo Cliente Standard
    // Cerchiamo se esiste un documento nella collezione 'users' con il suo ID
    const userDoc = await getDoc(doc(db, 'users', user.uid));

    if (userDoc.exists()) {
      // Profilo Esiste -> Salviamo info locali e andiamo alla Dashboard Cliente
      const userData = userDoc.data();
      // Salviamo il nome azienda per visualizzarlo nell'header
      localStorage.setItem('clientName', userData.ragioneSociale || user.email);
      localStorage.setItem('clientEmail', user.email || '');
      
      router.push('/dashboard');
    } else {
      // Profilo Non Esiste -> Mandiamo all'Onboarding
      router.push('/onboarding');
    }

  } catch (error: any) {
    console.error("Errore Login:", error);
    // Gestione Errori Firebase
    if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        errorMsg.value = "Email o password non validi.";
    } else if (error.code === 'auth/too-many-requests') {
        errorMsg.value = "Troppi tentativi. Riprova più tardi.";
    } else {
        errorMsg.value = "Errore di accesso. Riprova.";
    }
  } finally {
    loading.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen flex font-sans text-gray-800 bg-white overflow-hidden">
    
    <div class="hidden lg:flex w-5/12 bg-slate-900 relative flex-col justify-between p-12 text-white z-10">
      
      <div class="absolute inset-0 z-0 opacity-30">
        <div class="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-yellow-500/20 rounded-full blur-3xl animate-blob"></div>
        <div class="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/10 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
      </div>

      <div class="relative z-10">
        <div class="inline-block px-3 py-1 border border-yellow-500/50 rounded-full text-yellow-400 text-[10px] font-bold tracking-widest uppercase mb-6">
          Portale Partner B2B
        </div>
        <h2 class="text-4xl font-heading font-bold leading-tight">
          La sintesi perfetta di <br>
          <span class="text-yellow-400">Tradizione</span> e <span class="text-white">Modernità</span>.
        </h2>
      </div>

      <div class="relative z-10 space-y-6 max-w-md">
        <p class="text-gray-300 text-lg leading-relaxed font-light">
          Elementi di arredo unici, altamente personalizzabili e dalla indiscussa versatilità. 
          Le nostre Inglesine sono inserite all'interno del vetro camera.
        </p>
        
        <div class="pt-6 border-t border-white/10">
          <p class="text-xs text-gray-500 uppercase tracking-widest font-bold mb-2">Sede Operativa</p>
          <p class="text-sm text-gray-400">
            Via Cav. Angelo Manzoni, 18<br>
            26866 Sant'Angelo Lodigiano (LO)<br>
            Italia
          </p>
        </div>
      </div>

      <div class="relative z-10 text-xs text-gray-600">
        &copy; 2025 Inglesina Italiana. Tutti i diritti riservati.
      </div>
    </div>

    <div class="w-full lg:w-7/12 flex items-center justify-center p-8 bg-white relative">
      
      <div class="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-yellow-400 to-yellow-600 lg:hidden"></div>

      <div class="max-w-md w-full animate-fade-in-up">
        
        <div class="mb-10">
          <img src="/logo.svg" alt="Inglesina Italiana" class="h-16 w-auto mb-6" />
          
          <h2 class="text-xl font-bold text-gray-800">Benvenuto nell'Area Riservata</h2>
          <p class="text-gray-500 mt-2 text-sm">Inserisci le tue credenziali per gestire preventivi e ordini.</p>
        </div>

        <form @submit.prevent="handleLogin" class="space-y-5">
          
          <div class="group">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1 group-focus-within:text-yellow-600 transition-colors">Email</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 group-focus-within:text-yellow-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <input 
                v-model="username"
                type="email" 
                class="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all duration-200 sm:text-sm"
                placeholder="nome@azienda.it"
              />
            </div>
          </div>

          <div class="group">
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1.5 ml-1 group-focus-within:text-yellow-600 transition-colors">Password</label>
            <div class="relative">
              <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 group-focus-within:text-yellow-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <input 
                v-model="password"
                type="password" 
                class="block w-full pl-10 pr-3 py-3 border border-gray-200 rounded-lg leading-5 bg-gray-50 placeholder-gray-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-yellow-400 focus:border-transparent transition-all duration-200 sm:text-sm"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div v-if="errorMsg" class="p-3 rounded-md bg-red-50 border border-red-100 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-red-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
            <span class="text-sm text-red-600 font-medium">{{ errorMsg }}</span>
          </div>

          <button 
            type="submit" 
            class="w-full flex justify-center py-3.5 px-4 border border-transparent rounded-lg shadow-md text-sm font-bold text-white bg-gray-900 hover:bg-black focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 transition-all transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
            :disabled="loading"
          >
            <svg v-if="loading" class="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            {{ loading ? 'VERIFICA IN CORSO...' : 'ACCEDI' }}
          </button>
          
           <div class="text-center mt-6">
            <a href="#" class="text-sm font-medium text-gray-400 hover:text-yellow-600 transition-colors">
              Hai dimenticato la password?
            </a>
          </div>

        </form>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-blob { animation: blob 10s infinite; }
.animate-fade-in-up { animation: fadeInUp 0.6s ease-out; }
@keyframes blob { 
    0% { transform: translate(0px, 0px) scale(1); } 
    33% { transform: translate(30px, -30px) scale(1.1); } 
    66% { transform: translate(-20px, 20px) scale(0.9); } 
    100% { transform: translate(0px, 0px) scale(1); } 
}
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
</style>