<script setup lang="ts">
  import { ref } from 'vue';
  import { useRouter } from 'vue-router';
  import { doc, getDoc } from 'firebase/firestore';
  import { auth, db } from '../firebase';
  import { signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from 'firebase/auth';

  const router = useRouter();
  const username = ref('');
  const password = ref('');
  const loading = ref(false);
  const errorMsg = ref('');
  const infoMsg = ref('');

  const handleForgotPassword = async () => {
  if (!username.value) {
    errorMsg.value = "Inserisci la tua email nel campo sopra per resettare la password.";
    return;
  }

  loading.value = true;
  errorMsg.value = '';
  infoMsg.value = '';

  try {
    await sendPasswordResetEmail(auth, username.value);
    infoMsg.value = "Email di reset inviata! Controlla la tua posta.";
  } catch (error: any) {
    console.error("Errore Reset Password:", error);
    if (error.code === 'auth/user-not-found') {
      errorMsg.value = "Email non trovata.";
    } else if (error.code === 'auth/invalid-email') {
      errorMsg.value = "Formato email non valido.";
    } else {
      errorMsg.value = "Impossibile inviare la mail. Riprova.";
    }
  } finally {
    loading.value = false;
  }
};

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
  
      // 2. Controllo Super Admin (Accesso di emergenza)
      if (user.email === 'info@inglesinaitaliana.it') {
        router.push('/admin');
        return;
      }

      // --- NUOVO: 3. Controllo TEAM (Database) ---
      // Verifichiamo se l'utente esiste nella collezione 'team'
      const emailKey = user.email?.toLowerCase().trim();
      if (emailKey) {
        const teamDocRef = doc(db, 'team', emailKey);
        const teamDoc = await getDoc(teamDocRef);

        if (teamDoc.exists()) {
          const role = teamDoc.data().role; // 'ADMIN', 'PRODUZIONE', 'LOGISTICA'
          
          // Reindirizzamento in base al ruolo
          if (role === 'PRODUZIONE') {
            router.push('/production');
          } else if (role === 'LOGISTICA') {
            router.push('/delivery');
          } else {
            // ADMIN, COMMERCIALE o altri
            router.push('/admin');
          }
          return; // Login completato per il team
        }
      }
  
      // 4. Controllo CLIENTE Standard (Users)
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);
  
      if (userDoc.exists()) {
        const userData = userDoc.data();
        
        // Controllo: Cambio Password Obbligatorio
        if (userData.mustChangePassword) {
          localStorage.setItem('tempClientName', userData.ragioneSociale || 'Cliente');
          router.push('/onboarding');
          return;
        }
  
        // Accesso consentito -> Dashboard Cliente
        localStorage.setItem('clientName', userData.ragioneSociale || user.email || 'Cliente');
        localStorage.setItem('clientEmail', user.email || '');
        router.push('/dashboard');
  
      } else {
        // Profilo Non Esiste né in Team né in Users -> BLOCCO
        await signOut(auth);
        errorMsg.value = "Utenza non configurata. Contattaci su info@inglesinaitaliana.it";
      }
  
    } catch (error: any) {
      console.error("Errore Login:", error);
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
          <div class="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-yellow-500/50 rounded-full blur-3xl animate-blob"></div>
          <div class="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-blue-500/20 rounded-full blur-3xl animate-blob animation-delay-2000"></div>
        </div>
  
        <div class="relative z-10">
          <div class="inline-block px-3 py-1 border border-yellow-500/50 rounded-full text-yellow-400 text-[10px] font-bold tracking-widest uppercase mb-6">
            Portale Partner B2B
          </div>
          <h2 class="text-4xl font-heading font-bold leading-tight">
            Inglesina italiana.<br>
            <span class="text-yellow-400">Stile </span><span class="text-white">senza tempo</span>.
          </h2>
        </div>
  
        <div class="relative z-10 space-y-6 max-w-md">
          <p class="text-gray-300 text-lg leading-relaxed font-light">
            Scrivici a info@inglesinaitaliana.it se vuoi ottenere l'accesso.
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
            <div v-if="infoMsg" class="p-3 rounded-md bg-green-50 border border-green-100 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-green-500" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
            </svg>
            <span class="text-sm text-green-700 font-medium">{{ infoMsg }}</span>
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
            <button 
              type="button" 
              @click="handleForgotPassword" 
              class="text-sm font-medium text-gray-400 hover:text-yellow-600 transition-colors underline decoration-transparent hover:decoration-yellow-600 underline-offset-2"
            >
              Hai dimenticato la password?
            </button>
          </div>
  
          </form>
        </div>
      </div>
    </div>
  </template>
  
  <style scoped>
  .animate-fade-in-up { 
    animation: fadeInUp 0.6s ease-out; 
  }
  
  @keyframes fadeInUp { 
    from { 
      opacity: 0; 
      transform: translateY(20px); 
    } 
    to { 
      opacity: 1; 
      transform: translateY(0); 
    } 
  }
  </style>