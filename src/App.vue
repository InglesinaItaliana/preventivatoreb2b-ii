<script setup lang="ts">
import { RouterView } from 'vue-router'
import { onMounted } from 'vue';
import GlobalBugReporter from './components/GlobalBugReporter.vue'; // <--- Importa
onMounted(() => {
  // 1. Imposta il NOME DELLA TAB (Titolo)
  document.title = 'Inglesina Italiana P.O.P.S.';

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

    <GlobalBugReporter />

  </div>
</template>

<style>
html, body, #app {
  background-color: transparent;
  margin: 0;
  padding: 0;
}
</style>