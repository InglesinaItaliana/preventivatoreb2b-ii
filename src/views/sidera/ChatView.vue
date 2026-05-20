<script setup lang="ts">
import { ref } from 'vue'
import MIcon from '../../components/pulsar/MIcon.vue'

const channel = ref('generale')

const channels = [
  { id: 'generale', label: 'Generale',       dot: true  },
  { id: 'catalogo', label: 'Catalogo 2026',  dot: false },
  { id: 'showroom', label: 'Showroom Milano', dot: false },
  { id: 'logistica',label: 'Logistica',      dot: false },
]

type Msg = { from: string; t: string; text: string; a: string; c: string; task?: boolean }

const msgs: Record<string, Msg[]> = {
  generale: [
    { from: 'Daniel', t: '10:23', text: 'Dobbiamo aggiornare il listino prima della stampa del catalogo.', a: 'D', c: '#2F6B4A' },
    { from: 'Eva',    t: '10:25', text: 'Ho già la bozza aggiornata. Creo una task?',                      a: 'E', c: '#4A6B8A' },
    { from: 'Daniel', t: '10:26', text: 'Sì, assegnala a te con scadenza venerdì.',                        a: 'D', c: '#2F6B4A', task: true },
    { from: 'Eva',    t: '10:27', text: 'Fatto! La trovi già in lavorazione nella board del Catalogo.',    a: 'E', c: '#4A6B8A' },
  ],
  catalogo: [
    { from: 'Eva',    t: '09:10', text: 'La copertina è pronta per la tua revisione.', a: 'E', c: '#4A6B8A' },
    { from: 'Daniel', t: '09:45', text: 'La guardo oggi pomeriggio, grazie.',           a: 'D', c: '#2F6B4A' },
  ],
  showroom: [
    { from: 'Daniel', t: '08:30', text: 'Confermate le date per l\'installazione?', a: 'D', c: '#2F6B4A' },
    { from: 'Eva',    t: '08:52', text: 'Sì, tutto confermato per il 22 maggio.',   a: 'E', c: '#4A6B8A' },
  ],
  logistica: [
    { from: 'Eva', t: 'ieri', text: '3 spedizioni in attesa di conferma dalla sede.', a: 'E', c: '#4A6B8A' },
  ],
}

const currentLabel = () => channels.find(c => c.id === channel.value)?.label ?? ''
</script>

<template>
  <div class="cv s-fade-in s-scope-pulsar">
    <!-- Channel sidebar -->
    <aside class="cv-sidebar">
      <p class="cv-section-label">Canali</p>
      <div
        v-for="c in channels"
        :key="c.id"
        class="channel-item"
        :class="{ 'is-active': channel === c.id }"
        @click="channel = c.id"
      >
        <MIcon name="tag" :size="13" :filled="channel === c.id" />
        {{ c.label }}
        <span v-if="c.dot && channel !== c.id" class="unread-dot" />
      </div>
    </aside>

    <!-- Messages area -->
    <div class="cv-main">
      <div class="cv-header">
        <MIcon name="tag" :size="16" />
        {{ currentLabel() }}
      </div>

      <div class="cv-messages">
        <div v-for="(m, i) in (msgs[channel] || [])" :key="i" class="msg">
          <div
            class="msg-avatar"
            :style="{ background: m.c + '18', border: '1.5px solid ' + m.c + '50', color: m.c }"
          >{{ m.a }}</div>
          <div class="msg-body">
            <div class="msg-meta">
              <span class="msg-from">{{ m.from }}</span>
              <span class="msg-time">{{ m.t }}</span>
            </div>
            <div class="msg-text">{{ m.text }}</div>
            <div v-if="m.task" class="task-link">
              <MIcon name="checklist" :size="16" filled style="color:var(--s-green)" />
              <div>
                <div class="task-link-title">Task creata</div>
                <div class="task-link-meta">Aggiornamento listino · Assegnata a Eva · Venerdì 16 mag</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="cv-input">
        <div class="input-bar">
          <input
            class="msg-input"
            :placeholder="`Scrivi in #${currentLabel()}...`"
          />
          <MIcon name="send" :size="16" style="color:var(--s-text-dim);cursor:pointer" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cv {
  height: 100%;
  display: flex;
  overflow: hidden;
  font-family: 'Outfit', sans-serif;
  color: var(--s-text);
}

/* Channel sidebar */
.cv-sidebar {
  width: 196px;
  border-right: 1px solid var(--s-border);
  padding: 24px 10px;
  flex-shrink: 0;
  background: var(--s-sidebar);
}

.cv-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--s-text-dim);
  padding-left: 10px;
  margin-bottom: 12px;
}

.channel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  cursor: pointer;
  font-size: 13px;
  color: var(--s-text-dim);
  transition: all 0.15s;
  margin-bottom: 2px;
}

.channel-item:hover { background: var(--s-border); color: var(--s-text-mid); }
.channel-item.is-active { background: var(--s-green-glow); color: var(--s-green-text); }

.unread-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--s-green);
  margin-left: auto;
  flex-shrink: 0;
}

/* Main */
.cv-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--s-surface);
}

.cv-header {
  padding: 18px 28px;
  border-bottom: 1px solid var(--s-border);
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 500;
  flex-shrink: 0;
}

.cv-messages {
  flex: 1;
  overflow: auto;
  padding: 24px 28px;
  background: var(--s-bg);
}

/* Messages */
.msg { display: flex; gap: 12px; margin-bottom: 20px; }

.msg-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
  margin-top: 1px;
}

.msg-body { flex: 1; }

.msg-meta { display: flex; gap: 8px; align-items: baseline; margin-bottom: 4px; }
.msg-from { font-size: 13px; font-weight: 600; }
.msg-time  { font-size: 11px; color: var(--s-text-dim); }
.msg-text  { font-size: 13.5px; color: var(--s-text-mid); line-height: 1.7; }

/* Task link card */
.task-link {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 10px 14px;
  background: var(--s-green-glow);
  border: 1px solid var(--s-green-border);
  border-radius: 8px;
  max-width: 380px;
}

.task-link-title { font-size: 12px; font-weight: 600; color: var(--s-green-text); }
.task-link-meta  { font-size: 11px; color: var(--s-text-dim); margin-top: 1px; }

/* Input */
.cv-input {
  padding: 14px 28px;
  border-top: 1px solid var(--s-border);
  background: var(--s-surface);
  flex-shrink: 0;
}

.input-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--s-surface-up);
  border: 1px solid var(--s-border);
  border-radius: 10px;
  padding: 10px 16px;
}

.msg-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  color: var(--s-text);
  font-size: 13px;
  font-family: 'Outfit', sans-serif;
}

.msg-input::placeholder { color: var(--s-text-dim); }
</style>
