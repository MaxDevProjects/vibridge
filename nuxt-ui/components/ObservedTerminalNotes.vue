<template>
  <details v-if="notes.length" class="terminal-notes" :aria-label="lang === 'fr' ? 'Points relevés dans la sortie' : 'Observed terminal excerpts'">
    <summary class="notes-toggle">
      <span class="notes-icon" aria-hidden="true">≡</span>
      <span class="notes-heading">
        <strong>{{ lang === 'fr' ? 'Derniers points relevés' : 'Latest observed notes' }}</strong>
        <small>{{ notes.length }} {{ lang === 'fr' ? (notes.length > 1 ? 'extraits du terminal' : 'extrait du terminal') : (notes.length > 1 ? 'terminal excerpts' : 'terminal excerpt') }}</small>
      </span>
      <span class="notes-chevron" aria-hidden="true">⌄</span>
    </summary>
    <div class="notes-details">
      <ul>
        <li v-for="(note, index) in notes" :key="index">
          <span class="dot" aria-hidden="true">·</span>
          <span>{{ note.text }}</span>
        </li>
      </ul>
      <p class="disclaimer">
        {{ lang === 'fr'
          ? 'Extraits réellement reçus, sans validation automatique. Vérifie la sortie complète dans le terminal.'
          : 'Excerpts actually received, without automatic verification. Check the full terminal output.' }}
      </p>
    </div>
  </details>
</template>

<script setup lang="ts">
import type { ObservedNote } from '~/utils/observedTerminalNotes'
withDefaults(defineProps<{ notes: ObservedNote[]; lang?: 'fr' | 'en' }>(), { lang:'fr' })
</script>

<style scoped>
.terminal-notes{margin:7px 15px 4px;border:1px solid var(--border-bright);background:var(--surface);font-family:monospace;flex:0 0 auto;min-width:0}
.notes-toggle{display:flex;align-items:center;gap:11px;min-height:57px;padding:11px 13px;cursor:pointer;list-style:none;user-select:none;-webkit-tap-highlight-color:transparent}
.notes-toggle::-webkit-details-marker{display:none}
.notes-toggle::marker{content:''}
.notes-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.notes-toggle:active{background:var(--surface2)}
.notes-icon{display:grid;place-items:center;width:31px;height:31px;flex:0 0 31px;border:1px solid var(--border-bright);color:var(--accent);font-size:20px;line-height:1}
.notes-heading{display:grid;gap:4px;min-width:0;flex:1}
.notes-heading strong{font-size:12px;font-weight:500;color:var(--text)}
.notes-heading small{font-size:10px;line-height:1.4;color:var(--text-mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.notes-chevron{flex:0 0 auto;color:var(--text-mid);font-size:22px;transition:transform 140ms ease}
.terminal-notes[open] .notes-chevron{transform:rotate(180deg)}
.notes-details{border-top:1px solid var(--border);max-height:min(40dvh,330px);overflow-y:auto;overscroll-behavior:contain}
.terminal-notes ul{list-style:none;margin:0;padding:13px;display:grid;gap:12px}
.terminal-notes li{display:flex;gap:10px;align-items:flex-start;font-size:12px;line-height:1.65;color:var(--text);overflow-wrap:anywhere}
.terminal-notes .dot{color:var(--text-mid);border:1px solid var(--border-bright);width:20px;height:20px;min-width:20px;display:grid;place-items:center;line-height:1}
.terminal-notes .disclaimer{margin:0;padding:10px 13px;border-top:1px solid var(--border);font-size:10px;line-height:1.6;color:var(--text-mid)}
@media(prefers-reduced-motion:reduce){.notes-chevron{transition:none}}
</style>
