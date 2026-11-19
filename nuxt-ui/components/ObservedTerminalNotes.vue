<template>
  <section v-if="notes.length" class="terminal-notes" :class="{ inline }"
    :aria-label="lang === 'fr' ? 'Points réellement reçus du terminal' : 'Passages actually received from the terminal'">
    <header>
      <div class="notes-title">
        <span class="notes-mark" aria-hidden="true">↳</span>
        <div>
          <span class="eyebrow">{{ lang === 'fr' ? 'LECTURE DE CETTE SORTIE' : 'READING THIS OUTPUT' }}</span>
          <h3>{{ lang === 'fr' ? 'À retenir' : 'Key passages' }}</h3>
        </div>
      </div>
      <span class="count">{{ notes.length }}</span>
    </header>
    <ul>
      <li v-for="(note, index) in visibleNotes" :key="index">
        <span class="dot" aria-hidden="true">·</span>
        <span>{{ note.text }}</span>
      </li>
    </ul>
    <button v-if="notes.length > 2" class="notes-expand" type="button" :aria-expanded="expanded"
      @click="expanded = !expanded">
      {{ expanded
        ? (lang === 'fr' ? 'Réduire' : 'Show less')
        : (lang === 'fr' ? 'Voir les ' + notes.length + ' passages' : 'See all ' + notes.length + ' passages') }}
      <span aria-hidden="true">{{ expanded ? '⌃' : '⌄' }}</span>
    </button>
    <p class="disclaimer">
      {{ lang === 'fr'
        ? 'Passages reçus, non vérifiés. Le terminal original fait foi.'
        : 'Received passages, not verified. The original terminal is authoritative.' }}
    </p>
  </section>
</template>

<script setup lang="ts">
import type { ObservedNote } from '~/utils/observedTerminalNotes'

const props = withDefaults(defineProps<{ notes: ObservedNote[]; lang?: 'fr' | 'en'; inline?: boolean }>(), {
  lang: 'fr', inline: false,
})
const expanded = ref(false)
const visibleNotes = computed(() => expanded.value ? props.notes : props.notes.slice(0, 2))
watch(() => props.notes, () => { expanded.value = false })
</script>

<style scoped>
.terminal-notes{margin:12px 15px;border:1px solid var(--border-bright);background:var(--surface);font-family:monospace}
.terminal-notes.inline{margin:12px 0 0;border:0;border-top:1px solid var(--border);background:transparent}
.terminal-notes header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;border-bottom:1px solid var(--border)}
.terminal-notes.inline header{padding:12px 0}
.notes-title{display:flex;align-items:center;gap:10px;min-width:0}
.notes-mark{display:grid;place-items:center;width:27px;height:27px;flex:0 0 27px;background:var(--surface2);border:1px solid var(--border);color:var(--accent);font-size:16px}
.eyebrow{display:block;font-size:9px;letter-spacing:.1em;color:var(--text-mid);margin-bottom:2px}
.terminal-notes h3{font-size:12px;font-weight:500;color:var(--text);margin:0}
.count{font-size:10px;color:var(--text-mid)}
.terminal-notes ul{list-style:none;margin:0;padding:12px 14px;display:grid;gap:11px}
.terminal-notes.inline ul{padding:12px 0}
.terminal-notes li{display:flex;gap:9px;align-items:flex-start;font-size:11px;line-height:1.65;color:var(--text);overflow-wrap:anywhere}
.dot{color:var(--text-mid);width:14px;min-width:14px;line-height:1.6}
.notes-expand{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:8px 14px;width:100%;color:var(--accent);font-size:10px;text-align:left;border-top:1px solid var(--border)}
.inline .notes-expand{padding-left:0;padding-right:0}
.disclaimer{margin:0;padding:10px 14px;border-top:1px solid var(--border);font-size:9px;line-height:1.6;color:var(--text-mid)}
.inline .disclaimer{padding:9px 0 0}
</style>
