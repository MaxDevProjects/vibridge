<template>
  <section class="activity-panel" :aria-label="lang === 'fr' ? 'Activité observée' : 'Observed activity'">
    <header class="activity-header">
      <div>
        <span class="activity-eyebrow">VIBRIDGE / ACTIVITY ENGINE</span>
        <h3>{{ lang === 'fr' ? 'Étapes observées' : 'Observed steps' }}</h3>
      </div>
      <span class="activity-count">{{ items.length }} {{ lang === 'fr' ? 'événement(s)' : 'event(s)' }}</span>
    </header>
    <ol class="activity-list">
      <li v-for="item in items" :key="item.id" class="activity-item">
        <span class="activity-marker" :class="'state-' + item.status" aria-hidden="true">
          {{ marker(item.status) }}
        </span>
        <div class="activity-description">
          <strong>{{ item.label }}</strong>
          <small :class="'state-text-' + item.status">{{ statusLabel(item) }}</small>
        </div>
      </li>
    </ol>
    <p class="activity-disclaimer">
      {{ lang === 'fr'
        ? 'Les statuts confirmés concernent les commandes shell, pas la réussite globale du projet. Terminal réel disponible ci-dessus.'
        : 'Verified states describe shell command results, not overall project completion. The real terminal remains available above.' }}
    </p>
  </section>
</template>

<script setup lang="ts">
import type { ActivityItem, ActivityStatus } from '~/composables/useDevBridge'

const props = withDefaults(defineProps<{ items: ActivityItem[]; lang?: 'fr' | 'en' }>(), {
  lang: 'fr',
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
.activity-panel{margin:12px 15px;border:1px solid var(--border-bright);background:var(--surface);font-family:monospace}
.activity-header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 15px;border-bottom:1px solid var(--border)}
.activity-eyebrow{display:block;font-size:9px;letter-spacing:.16em;color:var(--text-mid);margin-bottom:6px}
.activity-header h3{font-size:15px;color:var(--text);font-weight:600;margin:0}
.activity-count{flex-shrink:0;font-size:10px;color:var(--text-mid)}
.activity-list{list-style:none;margin:0;padding:12px 15px;display:grid;gap:14px}
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
.activity-disclaimer{margin:0;padding:10px 15px;border-top:1px solid var(--border);font-size:10px;line-height:1.55;color:var(--text-mid)}
</style>
