<script setup lang="ts">
import { RouterView } from 'vue-router'
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

  </div>
</template>

<style>
/* FONDAMENTALE:
   Impostiamo lo sfondo dell'applicazione come trasparente.
   Se non lo fai, il bianco di default coprirà l'immagine di sfondo.
*/
html, body, #app {
  background-color: transparent;
  margin: 0;
  padding: 0;
}
</style>