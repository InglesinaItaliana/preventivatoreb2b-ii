<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { onMounted, computed, watch } from 'vue';
import GlobalBugReporter from './components/GlobalBugReporter.vue'; // <--- Importa
import UpdateBanner from './components/UpdateBanner.vue';

const route = useRoute();
// Scope della suite-of-webapps (SIDERA + PWA mobile). Il GlobalBugReporter è
// uno strumento POPS — non deve apparire dentro questi scope, dove il chrome
// del modulo (ContextualFab / sidebar) gestisce le proprie azioni primarie.
const SUITE_PREFIXES = ['/sidera', '/pulsar', '/cepheid', '/nebula', '/nova', '/magnetar', '/quasar'];
const showFab = computed(() => {
  if (route.path === '/' || route.name === 'login') return false;
  if (SUITE_PREFIXES.some(p => route.path.startsWith(p))) return false;
  return true;
});

// Identità tab (titolo + favicon) per scope. Lo script inline di index.html
// fa il setup al first paint per evitare flash; questo watcher copre le
// navigazioni SPA successive (es. login → /sidera/hub senza reload).
//
// Branding unificato: tutta la suite (sidera + PWA mobile) mostra in tab
// browser il favicon Schlegel e il titolo "Sistema SIDERA". POPS resta
// distinto. Le icone PWA per "Aggiungi a Home" restano scope-specifiche
// (gestite dai manifest, fuori dal controllo di questo watcher).
interface TabIdentity { title: string; favicon: { href: string; type: string } }

const POPS_IDENTITY: TabIdentity = {
  title:   'P.O.P.S. Inglesina Italiana',
  favicon: { href: '/favicon.png', type: 'image/png' },
};

const SUITE_IDENTITY: TabIdentity = {
  title:   'Sistema SIDERA',
  favicon: { href: '/favicon-sidera.svg', type: 'image/svg+xml' },
};

function identityFor(path: string): TabIdentity {
  return SUITE_PREFIXES.some(p => path.startsWith(p)) ? SUITE_IDENTITY : POPS_IDENTITY;
}

function applyTabIdentity(path: string) {
  const { title, favicon } = identityFor(path);

  if (document.title !== title) document.title = title;

  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  if (link.href !== new URL(favicon.href, location.origin).href) {
    link.type = favicon.type;
    link.href = favicon.href;
  }
}

onMounted(() => applyTabIdentity(route.path));
watch(() => route.path, applyTabIdentity);
</script>

<template>
  <div class="relative min-h-screen w-full font-sans text-gray-700 overflow-x-hidden">

    <div class="fixed inset-0 z-0 flex items-center justify-center pointer-events-none">
      <img 
        src="/logo.svg" 
        alt="Sfondo Watermark" 
        class="w-[100%] md:w-[80%] object-contain opacity-40" 
      />
    </div>

    <div class="relative z-10">
      <RouterView />
    </div>

    <GlobalBugReporter v-if="showFab" />
    <UpdateBanner />
  </div>
</template>

<style>
html, body, #app {
  background-color: transparent;
  margin: 0;
  padding: 0;
}
</style>