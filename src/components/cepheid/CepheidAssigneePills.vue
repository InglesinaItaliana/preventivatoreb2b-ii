<script setup lang="ts">
/**
 * Gruppo assegnatari CEPHEID: cerchietti avatar che, al tap o all'hover, si
 * aprono TUTTI in pillole (avatar + Nome Cognome) spostando il layout.
 *
 * FONTE UNICA: usato da CepheidTimelineTaskRow, CepheidActionCard (Azioni /
 * Scadenze / dettaglio progetto / PULSAR azioni) e ovunque servano gli
 * assegnatari — così aspetto e comportamento restano allineati ovunque.
 */
import { ref, computed } from 'vue'
import StarAvatar from '../shared/StarAvatar.vue'
import { starAvatarProps, displayName, type TeamMember } from '../../composables/sidera/useTeamMembers'
// @ts-expect-error — starAvatar.js è vanilla senza tipi (stesso motore di StarAvatar)
import { makeStar } from '../../lib/starAvatar.js'

const props = withDefaults(defineProps<{
  assignees: string[]
  members: TeamMember[]
  size?: number
}>(), { size: 22 })

const avOpen = ref(false)   // tap su mobile per aprire le pillole

// Colori pillola, derivati dallo stesso motore dello StarAvatar:
//  - bg   = sfondo del bollino (makeStar.bgColor, pastello hsl(hue,42%,92%))
//  - name = colore della stella (hue + sat/light "rinforzati" come in drawStar)
// Così la pillola del nome è dello stesso colore di sfondo del bollino e il nome
// dello stesso colore della stella.
const avColors = computed<Record<string, { bg: string; name: string }>>(() => {
  const out: Record<string, { bg: string; name: string }> = {}
  for (const email of props.assignees ?? []) {
    const s = makeStar(starAvatarProps(email, props.members))
    const sB = Math.min(100, s.sat + 12)
    const lB = Math.max(40, s.light - 12)
    out[email] = {
      bg: s.bgColor,
      name: `hsl(${Math.round(s.hue)}, ${Math.round(sB)}%, ${Math.round(lB)}%)`,
    }
  }
  return out
})
</script>

<template>
  <div class="avg" :class="{ 'is-open': avOpen }" @click.stop="avOpen = !avOpen">
    <span
      v-for="email in assignees"
      :key="email"
      class="av-pill"
      :style="{ background: avColors[email]?.bg }"
    >
      <StarAvatar class="av" v-bind="starAvatarProps(email, members)" :size="size" />
      <span class="av-name" :style="{ color: avColors[email]?.name }">{{ displayName(email, members) }}</span>
    </span>
  </div>
</template>

<style scoped>
.avg { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; flex: 0 1 auto; cursor: pointer; }
.avg.is-open, .avg:hover { gap: 6px; }
/* Il bordo avvolge l'INTERA pillola (avatar + nome): in stato espanso non deve
   chiudersi attorno al cerchio dell'avatar. Quindi il ring lo mette la pillola
   e l'avatar dentro lo annulla (box-shadow:none, vince per specificità sul
   ring globale di StarAvatar). */
.av-pill { display: inline-flex; align-items: center; background: #05090F; border-radius: 999px; border: 1px solid var(--md-sys-color-outline-variant); transition: padding-right .2s ease; }
.avg.is-open .av-pill, .avg:hover .av-pill { padding-right: 10px; }
.av-pill .av { border-radius: 50%; flex: 0 0 auto; box-shadow: none; }
.av-name {
  max-width: 0; overflow: hidden; white-space: nowrap; opacity: 0; padding-left: 0;
  color: #fff; font-size: 11px; font-weight: 500; line-height: 1;
  transition: max-width .22s ease, opacity .15s ease, padding-left .2s ease;
}
.avg.is-open .av-name, .avg:hover .av-name { max-width: 160px; opacity: 1; padding-left: 4px; }
</style>
