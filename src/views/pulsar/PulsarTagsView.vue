<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useChatHashtags } from '../../composables/pulsar/useChatHashtags'
import MIcon from '../../components/pulsar/MIcon.vue'

const router = useRouter()
const { hashtags } = useChatHashtags()

const sorted = computed(() =>
  [...hashtags.value].sort((a, b) => b.count - a.count)
)
</script>

<template>
  <div class="tv">
    <div class="tv-header">
      <h2 class="tv-title">Etichette</h2>
      <p class="tv-sub">{{ sorted.length }} {{ sorted.length === 1 ? 'etichetta usata' : 'etichette usate' }} nelle chat</p>
    </div>

    <div v-if="!sorted.length" class="empty-state">
      <MIcon name="sell" :size="40" class="empty-icon" />
      Nessuna etichetta ancora.
    </div>

    <div v-else class="tag-grid">
      <button
        v-for="tag in sorted"
        :key="tag.name"
        class="tag-card"
        @click="router.push('/pulsar/tag/' + tag.name)"
      >
        <MIcon name="sell" filled :size="18" class="tag-card-icon" />
        <span class="tag-card-name">#{{ tag.name }}</span>
        <span class="tag-card-count">{{ tag.count }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.tv {
  padding: 0;
  font-family: 'Outfit', sans-serif;
  color: #1A1917;
}

.tv-header {
  padding: 18px 20px 14px;
  border-bottom: 1px solid #E8E5DF;
  background: #fff;
}

.tv-title {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #1A1917;
  margin: 0 0 4px 0;
}

.tv-sub { font-size: 12px; color: #9B9590; margin-top: 2px; }

.empty-state {
  padding: 60px 20px;
  text-align: center;
  color: #9B9590;
  font-size: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.empty-icon { color: var(--md-sys-color-primary); opacity: 0.35; }

.tag-grid {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tag-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: #fff;
  border: 1px solid #E8E5DF;
  border-radius: 12px;
  cursor: pointer;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  color: #1A1917;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.tag-card:hover {
  border-color: var(--md-sys-color-primary);
  background: color-mix(in srgb, var(--md-sys-color-primary) 5%, transparent);
}

.tag-card-icon { color: var(--md-sys-color-primary); }
.tag-card-name { flex: 1; }

.tag-card-count {
  font-size: 12px;
  font-weight: 600;
  color: #6A6560;
  background: #F4F2EE;
  padding: 2px 8px;
  border-radius: 999px;
}
</style>
