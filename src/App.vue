<script setup lang="ts">
import { RouterView } from 'vue-router'
import GlobalBugReporter from './components/GlobalBugReporter.vue'; // <--- Importa
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