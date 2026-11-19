<template>
  <section v-if="notes.length" class="terminal-notes" :aria-label="lang === 'fr' ? 'Points relevés dans la sortie' : 'Observed terminal excerpts'">
    <header>
      <span class="eyebrow">VIBRIDGE / LECTURE DU TERMINAL</span>
      <h3>{{ lang === 'fr' ? 'Derniers points relevés' : 'Latest observed notes' }}</h3>
    </header>
    <ul>
      <li v-for="(note, index) in notes" :key="index">
        <span class="dot" aria-hidden="true">·</span>
        <span>{{ note.text }}</span>
      </li>
    </ul>
    <p class="disclaimer">
      {{ lang === 'fr'
        ? 'Extraits de la sortie réellement reçue. Ce ne sont ni des validations automatiques, ni une synthèse exhaustive. Consulte le terminal pour vérifier.'
        : 'Excerpts from the terminal output actually received. Not automatic verification or a complete summary. Check the terminal for confirmation.' }}
    </p>
  </section>
</template>

<script setup lang="ts">
import type { ObservedNote } from '~/utils/observedTerminalNotes'

withDefaults(defineProps<{ notes: ObservedNote[]; lang?: 'fr' | 'en' }>(), { lang:'fr' })
</script>

<style scoped>
.terminal-notes{margin:12px 15px;border:1px solid var(--border-bright);background:var(--surface);font-family:monospace}
.terminal-notes header{padding:13px 15px;border-bottom:1px solid var(--border)}
.eyebrow{display:block;font-size:9px;letter-spacing:.14em;color:var(--text-mid);margin-bottom:7px}
.terminal-notes h3{font-size:15px;font-weight:600;color:var(--text);margin:0}
.terminal-notes ul{list-style:none;margin:0;padding:12px 15px;display:grid;gap:12px}
.terminal-notes li{display:flex;gap:10px;align-items:flex-start;font-size:12px;line-height:1.65;color:var(--text);overflow-wrap:anywhere}
.terminal-notes .dot{color:var(--text-mid);border:1px solid var(--border-bright);width:20px;height:20px;min-width:20px;display:grid;place-items:center;line-height:1}
.terminal-notes .disclaimer{margin:0;padding:10px 15px;border-top:1px solid var(--border);font-size:10px;line-height:1.6;color:var(--text-mid)}
</style>
