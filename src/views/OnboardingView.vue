<script setup lang="ts">
  import { ref, onMounted } from 'vue';
  import { useRouter } from 'vue-router';
  import { updatePassword } from 'firebase/auth';
  import { doc, updateDoc } from 'firebase/firestore';
  import { auth, db } from '../firebase';
  import { ShieldCheckIcon, LockClosedIcon } from '@heroicons/vue/24/solid';
  
  const router = useRouter();
  const newPassword = ref('');
  const confirmPassword = ref('');
  const loading = ref(false);
  const clientName = ref('');
  
  onMounted(() => {
    // Recupera il nome salvato nel login per personalizzare il benvenuto
    clientName.value = localStorage.getItem('tempClientName') || 'Cliente';
  });
  
  const changePassword = async () => {
    if (newPassword.value.length < 6) return alert("La password deve essere di almeno 6 caratteri.");
    if (newPassword.value !== confirmPassword.value) return alert("Le password non coincidono.");
    
    const user = auth.currentUser;
    if (!user) return router.push('/');
  
    loading.value = true;
    try {
      // 1. Aggiorna Password Auth
      await updatePassword(user, newPassword.value);
  
      // 2. Aggiorna Flag Firestore
      await updateDoc(doc(db, 'users', user.uid), {
        mustChangePassword: false,
        status: 'ACTIVE' // Conferma che è attivo
      });
      
      // 3. Pulisci e vai
      localStorage.removeItem('tempClientName');
      // Imposta i dati per la dashboard
      localStorage.setItem('clientName', clientName.value);
      
      alert("Password aggiornata con successo!");
      router.push('/dashboard');
  
    } catch (e: any) {
      console.error(e);
      alert("Errore aggiornamento password: " + e.message);
    } finally {
      loading.value = false;
    }
  };
  </script>
  
  <template>
    <div class="min-h-screen flex items-center justify-center bg-[#f0f4f8] p-6 font-sans">
      
      <div class="max-w-md w-full bg-white rounded-[2.5rem] shadow-xl p-10 border border-white/60 relative overflow-hidden">
        
        <div class="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-amber-100 rounded-full blur-3xl opacity-50"></div>
        <div class="absolute bottom-0 left-0 -ml-16 -mb-16 w-40 h-40 bg-blue-100 rounded-full blur-3xl opacity-50"></div>
  
        <div class="relative z-10 text-center mb-8">
          <div class="mx-auto h-20 w-20 bg-green-100 rounded-full flex items-center justify-center mb-4 shadow-sm text-green-600">
            <ShieldCheckIcon class="h-10 w-10" />
          </div>
          <h1 class="text-3xl font-black text-slate-900 font-heading tracking-tight mb-2">Sicurezza Account</h1>
          <p class="text-slate-500 text-sm">
            Ciao <span class="font-bold text-slate-800">{{ clientName }}</span>!<br>
            Per accedere al portale, imposta la tua password personale.
          </p>
        </div>
  
        <div class="space-y-5 relative z-10">
          
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1.5 ml-1">Nuova Password</label>
            <div class="relative">
              <LockClosedIcon class="h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                v-model="newPassword" 
                type="password" 
                class="block w-full pl-10 pr-4 py-3.5 bg-slate-50 border-none rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-amber-300 placeholder-slate-300 transition-all"
                placeholder="Minimo 6 caratteri"
              >
            </div>
          </div>
  
          <div>
            <label class="block text-xs font-bold text-slate-400 uppercase mb-1.5 ml-1">Conferma Password</label>
            <div class="relative">
              <LockClosedIcon class="h-5 w-5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                v-model="confirmPassword" 
                type="password" 
                class="block w-full pl-10 pr-4 py-3.5 bg-slate-50 border-none rounded-xl text-slate-800 font-bold focus:ring-2 focus:ring-amber-300 placeholder-slate-300 transition-all"
                placeholder="Ripeti password"
              >
            </div>
          </div>
  
          <button 
            @click="changePassword" 
            :disabled="loading" 
            class="w-full bg-slate-900 hover:bg-black text-white font-bold py-4 rounded-2xl shadow-lg shadow-slate-900/20 transition-all transform active:scale-95 flex items-center justify-center gap-2 mt-4"
          >
            <span v-if="loading" class="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></span>
            {{ loading ? 'Aggiornamento...' : 'Salva e Accedi' }}
          </button>
  
        </div>
  
      </div>
    </div>
  </template>