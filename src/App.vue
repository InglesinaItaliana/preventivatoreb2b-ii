<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import { onMounted, computed } from 'vue';
import GlobalBugReporter from './components/GlobalBugReporter.vue'; // <--- Importa

const route = useRoute();
const showFab = computed(() => {
  // Nascondi se il path è la root '/' oppure se il nome della rotta è 'login'
  return route.path !== '/' && route.name !== 'login';
});

onMounted(() => {
  // 1. Imposta il NOME DELLA TAB (Titolo)
  document.title = 'P.O.P.S. Inglesina Italiana';

  // 2. Imposta la FAVICON dinamicamente
  // Cerca se esiste già un link per l'icona
  let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement;
  
  // Se non esiste, crealo
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }

  // Imposta l'immagine (assicurati di aver messo il file favicon.png in public/)
  link.type = 'image/png';
  link.href = '/favicon.png';
});
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
  </div>
</template>

<style>
html, body, #app {
  background-color: transparent;
  margin: 0;
  padding: 0;
}
</style>