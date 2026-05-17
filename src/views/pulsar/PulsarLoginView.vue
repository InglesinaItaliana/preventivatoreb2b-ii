<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../firebase'

const router = useRouter()
const email = ref('')
const password = ref('')
const loading = ref(false)
const errorMsg = ref('')
const infoMsg = ref('')
const showForgot = ref(false)
const mounted = ref(false)

onMounted(() => {
  if (auth.currentUser) {
    router.replace('/pulsar')
    return
  }
  requestAnimationFrame(() => requestAnimationFrame(() => { mounted.value = true }))
})

async function handleLogin() {
  if (!email.value || !password.value) {
    errorMsg.value = 'Inserisci email e password.'
    return
  }
  loading.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    await signInWithEmailAndPassword(auth, email.value.trim(), password.value)
    router.replace('/pulsar')
  } catch (e: any) {
    if (e.code === 'auth/invalid-credential' || e.code === 'auth/wrong-password' || e.code === 'auth/user-not-found') {
      errorMsg.value = 'Credenziali non valide.'
    } else if (e.code === 'auth/invalid-email') {
      errorMsg.value = 'Formato email non valido.'
    } else if (e.code === 'auth/too-many-requests') {
      errorMsg.value = 'Troppi tentativi. Riprova fra qualche minuto.'
    } else {
      errorMsg.value = 'Errore di accesso. Riprova.'
    }
  } finally {
    loading.value = false
  }
}

async function handleForgot() {
  if (!email.value) {
    errorMsg.value = 'Inserisci la tua email per ricevere il link di reset.'
    return
  }
  loading.value = true
  errorMsg.value = ''
  infoMsg.value = ''
  try {
    await sendPasswordResetEmail(auth, email.value.trim())
    infoMsg.value = 'Email di reset inviata. Controlla la posta.'
    showForgot.value = false
  } catch (e: any) {
    if (e.code === 'auth/user-not-found') errorMsg.value = 'Email non trovata.'
    else if (e.code === 'auth/invalid-email') errorMsg.value = 'Formato email non valido.'
    else errorMsg.value = 'Impossibile inviare la mail. Riprova.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="pl-shell">
    <div class="pl-bg">
      <div class="pl-sphere s1" :class="{ on: mounted }"></div>
      <div class="pl-sphere s2" :class="{ on: mounted }"></div>
      <div class="pl-sphere s3" :class="{ on: mounted }"></div>
    </div>

    <div class="pl-content" :class="{ on: mounted }">
      <div class="pl-brand">
        <svg class="pl-logo-icon" width="140" height="140" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <radialGradient id="pl-halo-grad" cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stop-color="#3AAF98" stop-opacity="0.55"/>
              <stop offset="55%"  stop-color="#3AAF98" stop-opacity="0.15"/>
              <stop offset="100%" stop-color="#3AAF98" stop-opacity="0"/>
            </radialGradient>
            <linearGradient id="pl-e1" x1="512" y1="512" x2="359" y2="78"  gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#3AAF98" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#3AAF98" stop-opacity="0.15"/>
            </linearGradient>
            <linearGradient id="pl-e2" x1="512" y1="512" x2="795" y2="861" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#3AAF98" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#3AAF98" stop-opacity="0.15"/>
            </linearGradient>
            <linearGradient id="pl-e3" x1="512" y1="512" x2="205" y2="512" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#3AAF98" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#3AAF98" stop-opacity="0.15"/>
            </linearGradient>
            <linearGradient id="pl-e4" x1="512" y1="512" x2="359" y2="776" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stop-color="#3AAF98" stop-opacity="0.95"/>
              <stop offset="100%" stop-color="#3AAF98" stop-opacity="0.15"/>
            </linearGradient>
          </defs>

          <circle cx="512" cy="512" r="400" fill="url(#pl-halo-grad)"/>
          <g stroke-width="7" stroke-linecap="round" fill="none">
            <line x1="512" y1="512" x2="359" y2="78"  stroke="url(#pl-e1)"/>
            <line x1="512" y1="512" x2="795" y2="861" stroke="url(#pl-e2)"/>
            <line x1="512" y1="512" x2="205" y2="512" stroke="url(#pl-e3)"/>
            <line x1="512" y1="512" x2="359" y2="776" stroke="url(#pl-e4)"/>
          </g>
          <circle cx="512" cy="512" r="135" fill="#3AAF98" opacity="0.22"/>
          <circle cx="512" cy="512" r="85"  fill="#3AAF98" opacity="0.45"/>
          <circle cx="512" cy="512" r="58"  fill="#3AAF98"/>
        </svg>
        <h1 class="pl-title">PULSAR</h1>
        <p class="pl-tagline">Chat · Comunicazione · Collaborazione</p>
      </div>

      <form class="pl-form" @submit.prevent="showForgot ? handleForgot() : handleLogin()">
        <div class="pl-field">
          <label for="pl-email">Email</label>
          <input
            id="pl-email"
            v-model="email"
            type="email"
            autocomplete="email"
            inputmode="email"
            autocapitalize="none"
            spellcheck="false"
            placeholder="nome@azienda.it"
            :disabled="loading"
          />
        </div>

        <div v-if="!showForgot" class="pl-field">
          <label for="pl-pwd">Password</label>
          <input
            id="pl-pwd"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            :disabled="loading"
          />
        </div>

        <p v-if="errorMsg" class="pl-msg pl-msg-err">{{ errorMsg }}</p>
        <p v-if="infoMsg" class="pl-msg pl-msg-ok">{{ infoMsg }}</p>

        <button type="submit" class="pl-btn" :disabled="loading">
          <span v-if="loading">…</span>
          <span v-else-if="showForgot">Invia link di reset</span>
          <span v-else>Entra</span>
        </button>

        <button
          type="button"
          class="pl-link"
          :disabled="loading"
          @click="showForgot = !showForgot; errorMsg = ''; infoMsg = ''"
        >
          {{ showForgot ? 'Torna al login' : 'Password dimenticata?' }}
        </button>
      </form>

      <p class="pl-footer">Sistema PULSAR · Inglesina Italiana</p>
    </div>
  </div>
</template>

<style scoped>
.pl-shell {
  position: fixed;
  inset: 0;
  background: #05090F;
  color: #fff;
  font-family: 'Outfit', sans-serif;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: env(safe-area-inset-top) 24px env(safe-area-inset-bottom);
}

.pl-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.pl-sphere {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
  will-change: transform;
  transition: opacity 2s ease;
}
.pl-sphere.on { opacity: 1; }

.s1 {
  width: 540px; height: 540px;
  top: -200px; left: -160px;
  background: rgba(58, 175, 152, 0.42);
  filter: blur(110px);
  animation: d1 30s ease-in-out infinite;
}
.s2 {
  width: 460px; height: 460px;
  bottom: -180px; right: -140px;
  background: rgba(46, 114, 104, 0.55);
  filter: blur(120px);
  animation: d2 36s ease-in-out infinite;
}
.s3 {
  width: 380px; height: 380px;
  top: 30%; right: -100px;
  background: rgba(30, 70, 64, 0.5);
  filter: blur(95px);
  animation: d3 26s ease-in-out infinite;
}

@keyframes d1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(60px,80px) scale(1.05)} }
@keyframes d2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-80px,-50px) scale(1.04)} }
@keyframes d3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(70px,-60px) scale(1.03)} }

.pl-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.9s ease, transform 0.9s ease;
}
.pl-content.on { opacity: 1; transform: translateY(0); }

.pl-brand {
  text-align: center;
  margin-bottom: 2.4rem;
}

.pl-logo-icon {
  display: block;
  margin: 0 auto 1.2rem;
}

.pl-title {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 500;
  font-size: 2.4rem;
  letter-spacing: 0.22em;
  color: #fff;
  margin-bottom: 0.5rem;
}

.pl-tagline {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
  font-weight: 300;
}

.pl-form {
  display: flex;
  flex-direction: column;
  gap: 1.2rem;
}

.pl-field { display: flex; flex-direction: column; gap: 0.45rem; }

.pl-field label {
  font-size: 0.62rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.32);
  font-weight: 300;
}

.pl-field input {
  width: 100%;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 0.95rem 1rem;
  color: rgba(255,255,255,0.92);
  font-family: 'Outfit', sans-serif;
  font-size: 1rem;
  font-weight: 300;
  outline: none;
  transition: border-color 0.25s, background 0.25s;
  -webkit-appearance: none;
  appearance: none;
}
.pl-field input::placeholder { color: rgba(255,255,255,0.18); }
.pl-field input:focus {
  border-color: #3AAF98;
  background: rgba(58, 175, 152, 0.06);
}
.pl-field input:disabled { opacity: 0.55; }

.pl-btn {
  margin-top: 0.4rem;
  padding: 1rem;
  background: #3AAF98;
  border: 1px solid #3AAF98;
  color: #05090F;
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: 0.78rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.2s, opacity 0.2s;
}
.pl-btn:disabled { opacity: 0.5; cursor: default; }
.pl-btn:not(:disabled):active { background: #2E8E7B; }

.pl-link {
  background: none;
  border: none;
  color: rgba(255,255,255,0.42);
  font-family: 'Outfit', sans-serif;
  font-size: 0.72rem;
  letter-spacing: 0.12em;
  text-align: center;
  padding: 0.4rem;
  cursor: pointer;
  transition: color 0.2s;
}
.pl-link:hover, .pl-link:active { color: #3AAF98; }

.pl-msg {
  font-size: 0.78rem;
  text-align: center;
  margin: 0;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
}
.pl-msg-err {
  color: #ff8a72;
  background: rgba(255, 138, 114, 0.08);
  border: 1px solid rgba(255, 138, 114, 0.18);
}
.pl-msg-ok {
  color: #3AAF98;
  background: rgba(58, 175, 152, 0.08);
  border: 1px solid rgba(58, 175, 152, 0.22);
}

.pl-footer {
  margin-top: 2.4rem;
  text-align: center;
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-weight: 300;
  font-size: 0.78rem;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.16);
}

@media (min-width: 769px) {
  .pl-content { max-width: 420px; }
  .pl-title { font-size: 2.8rem; }
}
</style>
