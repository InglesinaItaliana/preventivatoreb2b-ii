<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../../firebase'
import SideraLogoSchlegel, { type ScopeKey } from '../../components/shared/SideraLogoSchlegel.vue'

// Login unificata per le PWA modulari (PULSAR, CEPHEID, future). Vedi POLARIS.md azione 3.
// Logo: SideraLogoSchlegel con vertice attivo = scope. Palette via CSS variable --sl-primary.

interface Props {
  scope: ScopeKey
  primaryColor: string        // es. '#3AAF98' (PULSAR), '#D4A020' (CEPHEID)
  title: string               // es. 'PULSAR', 'CEPHEID'
  tagline: string             // es. 'Chat · Comunicazione · Collaborazione'
  redirectPath: string        // es. '/pulsar', '/cepheid'
}
const props = defineProps<Props>()

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
    router.replace(props.redirectPath)
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
    router.replace(props.redirectPath)
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

// Sphere colors derivate dal primaryColor (replica logica setSpheres di SideraHubView)
function hexToRgb(h: string) {
  return { r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) }
}
const sphereColors = computed(() => {
  const { r, g, b } = hexToRgb(props.primaryColor)
  return {
    s1: `rgba(${r},${g},${b},0.42)`,
    s2: `rgba(${Math.round(r * 0.5)},${Math.round(g * 0.55)},${Math.round(b * 0.6)},0.55)`,
    s3: `rgba(${Math.round(r * 0.3)},${Math.round(g * 0.36)},${Math.round(b * 0.4)},0.5)`,
  }
})

const footerText = computed(() => `Modulo ${props.title} · Sistema SIDERA · Inglesina Italiana`)
</script>

<template>
  <div class="sl-shell" :style="{ '--sl-primary': primaryColor }">
    <div class="sl-bg">
      <div class="sl-sphere s1" :class="{ on: mounted }" :style="{ background: sphereColors.s1 }"></div>
      <div class="sl-sphere s2" :class="{ on: mounted }" :style="{ background: sphereColors.s2 }"></div>
      <div class="sl-sphere s3" :class="{ on: mounted }" :style="{ background: sphereColors.s3 }"></div>
    </div>

    <div class="sl-content" :class="{ on: mounted }">
      <div class="sl-brand">
        <SideraLogoSchlegel :active-scope="scope" :size="280" />
        <h1 class="sl-wordmark">
          <template v-for="(letter, i) in title.split('')" :key="i">
            <span class="sl-ltr">{{ letter }}</span>
            <span v-if="i < title.length - 1" class="sl-dot">·</span>
          </template>
        </h1>
        <p class="sl-tagline">{{ tagline }}</p>
      </div>

      <form class="sl-form" @submit.prevent="showForgot ? handleForgot() : handleLogin()">
        <div class="sl-field">
          <label for="sl-email">Email</label>
          <input
            id="sl-email"
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

        <div v-if="!showForgot" class="sl-field">
          <label for="sl-pwd">Password</label>
          <input
            id="sl-pwd"
            v-model="password"
            type="password"
            autocomplete="current-password"
            placeholder="••••••••"
            :disabled="loading"
          />
        </div>

        <p v-if="errorMsg" class="sl-msg sl-msg-err">{{ errorMsg }}</p>
        <p v-if="infoMsg" class="sl-msg sl-msg-ok">{{ infoMsg }}</p>

        <button type="submit" class="sl-btn" :disabled="loading">
          <span v-if="loading">…</span>
          <span v-else-if="showForgot">Invia link di reset</span>
          <span v-else>Entra</span>
        </button>

        <button
          type="button"
          class="sl-link"
          :disabled="loading"
          @click="showForgot = !showForgot; errorMsg = ''; infoMsg = ''"
        >
          {{ showForgot ? 'Torna al login' : 'Password dimenticata?' }}
        </button>
      </form>

      <p class="sl-footer">{{ footerText }}</p>
    </div>
  </div>
</template>

<style scoped>
.sl-shell {
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

.sl-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}

.sl-sphere {
  position: absolute;
  border-radius: 50%;
  opacity: 0;
  will-change: transform;
  transition: opacity 2s ease;
}
.sl-sphere.on { opacity: 1; }

.s1 {
  width: 540px; height: 540px;
  top: -200px; left: -160px;
  filter: blur(110px);
  animation: d1 30s ease-in-out infinite;
}
.s2 {
  width: 460px; height: 460px;
  bottom: -180px; right: -140px;
  filter: blur(120px);
  animation: d2 36s ease-in-out infinite;
}
.s3 {
  width: 380px; height: 380px;
  top: 30%; right: -100px;
  filter: blur(95px);
  animation: d3 26s ease-in-out infinite;
}

@keyframes d1 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(60px,80px) scale(1.05)} }
@keyframes d2 { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(-80px,-50px) scale(1.04)} }
@keyframes d3 { 0%,100%{transform:translate(0,0)} 50%{transform:translate(70px,-60px) scale(1.03)} }

.sl-content {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 380px;
  opacity: 0;
  transform: translateY(14px);
  transition: opacity 0.9s ease, transform 0.9s ease;
}
.sl-content.on { opacity: 1; transform: translateY(0); }

.sl-brand {
  text-align: center;
  margin-bottom: 2.4rem;
}

.sl-wordmark {
  font-family: 'Cormorant Garamond', serif;
  font-weight: 700;
  font-size: 2.4rem;
  letter-spacing: 0.04em;
  line-height: 1;
  color: #fff;
  margin: 0.4rem 0 0.5rem;
  text-align: center;
}
.sl-ltr { display: inline-block; }
.sl-dot {
  font-weight: 400;
  font-size: 0.75em;
  opacity: 0.3;
  display: inline-block;
  margin: 0 0.08em;
  position: relative;
  top: -0.18em;
  text-shadow: 0 0 3px rgba(255, 255, 255, 0.55), 0 0 7px rgba(255, 255, 255, 0.25);
}

.sl-tagline {
  font-size: 0.7rem;
  letter-spacing: 0.2em;
  color: rgba(255,255,255,0.35);
  text-transform: uppercase;
  font-weight: 300;
  margin: 0;
}

.sl-form { display: flex; flex-direction: column; gap: 1.2rem; }

.sl-field { display: flex; flex-direction: column; gap: 0.45rem; }

.sl-field label {
  font-size: 0.62rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.32);
  font-weight: 300;
}

.sl-field input {
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
.sl-field input::placeholder { color: rgba(255,255,255,0.18); }
.sl-field input:focus {
  border-color: var(--sl-primary);
  background: rgba(255,255,255,0.04);
}
.sl-field input:disabled { opacity: 0.55; }

.sl-btn {
  margin-top: 0.4rem;
  padding: 1rem;
  background: var(--sl-primary);
  border: 1px solid var(--sl-primary);
  color: #05090F;
  font-family: 'Outfit', sans-serif;
  font-weight: 600;
  font-size: 0.78rem;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.2s, filter 0.2s;
}
.sl-btn:disabled { opacity: 0.5; cursor: default; }
.sl-btn:not(:disabled):active { filter: brightness(0.85); }

.sl-link {
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
.sl-link:hover, .sl-link:active { color: var(--sl-primary); }

.sl-msg {
  font-size: 0.78rem;
  text-align: center;
  margin: 0;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
}
.sl-msg-err {
  color: #ff8a72;
  background: rgba(255, 138, 114, 0.08);
  border: 1px solid rgba(255, 138, 114, 0.18);
}
.sl-msg-ok {
  color: var(--sl-primary);
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
}

.sl-footer {
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
  .sl-content { max-width: 420px; }
  .sl-wordmark { font-size: 2.8rem; }
}
</style>
