<template>
  <details class="activity-panel" :class="{compact}" :aria-label="lang === 'fr' ? 'Activité observée' : 'Observed activity'">
    <summary class="activity-toggle">
      <span class="activity-icon" aria-hidden="true">☷</span>
      <span class="activity-heading">
        <strong>{{ compact
          ? (lang === 'fr' ? 'Commandes et preuves' : 'Commands and evidence')
          : (lang === 'fr' ? 'Étapes observées' : 'Observed steps') }}</strong>
        <small>{{ summary }}</small>
      </span>
      <span class="activity-chevron" aria-hidden="true">⌄</span>
    </summary>

    <div class="activity-details">
      <ol class="activity-list">
        <li v-for="item in items" :key="item.id" class="activity-item">
          <span class="activity-marker" :class="'state-' + item.status" aria-hidden="true">
            {{ marker(item.status) }}
          </span>
          <div class="activity-description">
            <strong>{{ item.label }}</strong>
            <small>{{ statusLabel(item) }}</small>
          </div>
        </li>
      </ol>
      <p class="activity-disclaimer">
        {{ lang === 'fr'
          ? 'Une commande confirmée (code 0) ne garantit pas la réussite du projet. Le terminal reste la référence.'
          : 'A confirmed command (exit 0) does not establish project completion. The terminal remains authoritative.' }}
      </p>
    </div>
  </details>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { ActivityItem, ActivityStatus } from '~/composables/useDevBridge'

const props = withDefaults(defineProps<{ items: ActivityItem[]; lang?: 'fr' | 'en'; compact?: boolean }>(), {
  lang: 'fr', compact: false,
})

const summary = computed(() => {
  const counts = {
    confirmed: 0, failed: 0, running: 0, attention: 0, observed: 0,
  }
  for (const item of props.items) counts[item.status] += 1
  const fr = props.lang === 'fr'
  const parts = [
    `${props.items.length} ${fr ? (props.items.length > 1 ? 'événements' : 'événement') : (props.items.length > 1 ? 'events' : 'event')}`,
    counts.failed ? `${counts.failed} ${fr ? 'en échec' : 'failed'}` : '',
    counts.running ? `${counts.running} ${fr ? 'en cours' : 'running'}` : '',
    counts.attention ? `${counts.attention} ${fr ? 'à vérifier' : 'attention'}` : '',
    counts.confirmed ? `${counts.confirmed} ${fr ? 'commandes OK' : 'commands OK'}` : '',
  ]
  return parts.filter(Boolean).join(' · ')
})

function marker(status: ActivityStatus): string {
  switch (status) {
    case 'confirmed': return '✓'
    case 'failed': return '!'
    case 'attention': return '?'
    case 'running': return '◌'
    default: return '·'
  }
}

function statusLabel(item: ActivityItem): string {
  const fr = props.lang === 'fr'
  switch (item.status) {
    case 'confirmed': return fr ? 'Commande confirmée (code 0)' : 'Command confirmed (exit 0)'
    case 'failed': return fr ? `Commande en échec (code ${item.exitCode ?? '?'})` : `Command failed (exit ${item.exitCode ?? '?'})`
    case 'running': return fr ? 'En cours, résultat attendu' : 'Running, result pending'
    case 'attention': return fr ? 'Intervention possible, à vérifier' : 'May need attention; verify'
    default: return fr ? 'Observé, sans confirmation de réussite' : 'Observed, success not confirmed'
  }
}
</script>

<style scoped>
.activity-panel{margin:7px 15px 4px;border:1px solid var(--border-bright);background:var(--surface);font-family:monospace;flex:0 0 auto;min-width:0}
.activity-panel.compact{margin:14px 0 0;border-color:var(--border);background:transparent}
.activity-panel.compact .activity-toggle{min-height:45px;padding:9px 10px}
.activity-panel.compact .activity-icon{width:25px;height:25px;flex-basis:25px;font-size:16px}
.activity-toggle{display:flex;align-items:center;gap:11px;min-height:57px;padding:11px 13px;cursor:pointer;list-style:none;user-select:none;-webkit-tap-highlight-color:transparent}
.activity-toggle::-webkit-details-marker{display:none}
.activity-toggle::marker{content:''}
.activity-toggle:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.activity-toggle:active{background:var(--surface2)}
.activity-icon{display:grid;place-items:center;width:31px;height:31px;flex:0 0 31px;border:1px solid var(--border-bright);color:var(--accent);font-size:20px;line-height:1}
.activity-heading{display:grid;gap:4px;min-width:0;flex:1}
.activity-heading strong{font-size:12px;font-weight:500;color:var(--text)}
.activity-heading small{font-size:10px;line-height:1.4;color:var(--text-mid);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.activity-chevron{font-size:22px;color:var(--text-mid);transition:transform 140ms ease;flex:0 0 auto}
.activity-panel[open] .activity-chevron{transform:rotate(180deg)}
.activity-details{border-top:1px solid var(--border);max-height:min(40dvh,330px);overflow-y:auto;overscroll-behavior:contain}
.activity-list{list-style:none;margin:0;padding:14px 13px;display:grid;gap:15px}
.activity-item{display:flex;align-items:flex-start;gap:11px}
.activity-marker{display:grid;place-items:center;border:1px solid var(--border-bright);width:23px;height:23px;min-width:23px;font-size:14px;line-height:1}
.activity-marker.state-confirmed{color:#62c89a;border-color:#327e64}
.activity-marker.state-failed{color:#ee8585;border-color:#a44c4c}
.activity-marker.state-attention{color:#e1ba7a;border-color:#967344}
.activity-marker.state-running{color:#8ecbf3;border-color:#4784a4}
.activity-marker.state-observed{color:var(--text-mid)}
.activity-description{min-width:0;display:grid;gap:4px}
.activity-description strong{font-size:12px;line-height:1.45;font-weight:500;color:var(--text);overflow-wrap:anywhere}
.activity-description small{font-size:10px;line-height:1.4;color:var(--text-mid)}
.activity-disclaimer{margin:0;padding:10px 13px;border-top:1px solid var(--border);font-size:10px;line-height:1.55;color:var(--text-mid)}
@media(prefers-reduced-motion:reduce){.activity-chevron{transition:none}}
</style>
