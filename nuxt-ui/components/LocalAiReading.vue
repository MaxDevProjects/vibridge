<template>
  <section class="local-ai" aria-label="Lecture intelligente facultative du terminal">
    <div class="local-ai-header">
      <div class="local-ai-title">
        <span class="local-ai-symbol" aria-hidden="true">✧</span>
        <span>
          <strong>Lecture locale</strong>
          <small>{{ sourceLabel }}</small>
        </span>
      </div>
      <button class="local-ai-trigger" type="button" :disabled="!enabled || busy" @click="emit('analyze')">
        {{ busy ? state === 'queued' ? 'En attente' : 'Analyse en cours' : 'Éclaircir' }}
        <span aria-hidden="true">{{ busy ? '◌' : '↗' }}</span>
      </button>
    </div>
    <p v-if="busy" class="local-ai-state" role="status">
      {{ state === 'queued'
        ? 'Analyse en attente sur le PC' + (queuePosition > 0 ? ' (position ' + queuePosition + ')' : '') + '.'
        : 'Le modèle local travaille sur le PC, sans GPU.' }}
    </p>
    <p v-else-if="unavailableReason && !error" class="local-ai-hint">{{ unavailableReason }}</p>
    <p v-if="error" class="local-ai-error" role="status">{{ error }}</p>
    <div v-if="result" class="local-ai-result">
      <p v-if="result.engine==='observed-excerpts'" class="local-ai-state" role="status">
        Le mini-modèle n’a pas produit une analyse exploitable. Voici uniquement des extraits exacts observés dans le terminal, sans interprétation IA.
      </p>
      <strong>{{ result.title }}</strong>
      <ul>
        <li v-for="(item,i) in result.items" :key="i">
          <span>{{ result.engine==='observed-excerpts' ? 'Extrait observé' :
            item.category === 'remaining' ? 'À faire' : item.category === 'uncertain' ? 'À vérifier' : 'Annoncé' }}</span>
          {{ item.text }}
          <small v-if="result.engine!=='observed-excerpts'">Source : « {{ item.evidence }} »</small>
        </li>
        <li v-if="!result.items.length" class="local-ai-hint">Le modèle n'a pas fourni de point appuyé par une citation exacte de la sortie.</li>
      </ul>
      <small v-if="result.engine!=='observed-excerpts'">Lecture facultative non vérifiée. Seules les commandes réellement confirmées constituent des preuves techniques.</small>
      <small v-else>Les extraits ne prouvent pas que Codex a réellement exécuté ou terminé une instruction.</small>
      <small v-if="result.metrics && result.metrics.peakMemoryMb > 0">
        Pic RAM observé : {{ result.metrics.peakMemoryMb }} Mo · {{ (result.metrics.durationMs / 1000).toFixed(1) }} s
      </small>
    </div>
  </section>
</template>

<script setup lang="ts">
interface LocalReadingItem {
  text: string
  evidence: string
  category: 'announced' | 'remaining' | 'uncertain'
}
interface LocalReading {
  engine?: 'local-model' | 'observed-excerpts'
  title: string
  items: LocalReadingItem[]
  metrics?: { peakMemoryMb: number; durationMs: number }
}
defineProps<{
  sourceLabel: string
  enabled: boolean
  busy: boolean
  state: 'queued' | 'running'
  queuePosition: number
  unavailableReason?: string
  error?: string
  result?: LocalReading | null
}>()
const emit = defineEmits<{ analyze: [] }>()
</script>

<style scoped>
.local-ai{border:1px solid var(--border-bright);background:var(--surface);padding:12px;margin:12px 0;display:grid;gap:9px;min-width:0;color:var(--text)}
.local-ai-header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.local-ai-title{display:flex;align-items:center;gap:9px;min-width:0}
.local-ai-symbol{display:grid;place-items:center;width:29px;height:29px;flex:0 0 29px;background:var(--surface2);border:1px solid var(--border);color:var(--accent);font-size:16px}
.local-ai-title>span:last-child{display:grid;gap:4px;min-width:0}
.local-ai-title strong{font:500 11px "DM Mono",monospace}
.local-ai-title small{font:9px/1.5 "DM Mono",monospace;color:var(--text-mid)}
.local-ai-trigger{display:flex;align-items:center;gap:7px;border:1px solid var(--border-bright);padding:8px 10px;color:var(--accent);font:10px "DM Mono",monospace;white-space:nowrap}
.local-ai-trigger:disabled{opacity:.5}
.local-ai-trigger:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.local-ai-hint,.local-ai-state{margin:0;color:var(--text-mid);font:10px/1.6 "DM Mono",monospace}
.local-ai-error{margin:0;color:var(--dot-amber);font:10px/1.65 "DM Mono",monospace;overflow-wrap:anywhere}
.local-ai-result{display:grid;gap:9px;border-top:1px solid var(--border);padding-top:10px}
.local-ai-result>strong{font:500 12px "DM Mono",monospace}
.local-ai-result ul{list-style:none;padding:0;margin:0;display:grid;gap:10px}
.local-ai-result li{font:11px/1.55 "DM Mono",monospace;display:grid;gap:4px}
.local-ai-result li span{font-size:9px;letter-spacing:.05em;color:var(--accent);text-transform:uppercase}
.local-ai-result li small,.local-ai-result>small{color:var(--text-mid);font:9px/1.6 "DM Mono",monospace;overflow-wrap:anywhere}
</style>