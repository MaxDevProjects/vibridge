<template>
  <section class="vb-cli-sessions" role="dialog" aria-modal="true" aria-label="Sessions CLI enregistrées">
    <header>
      <div><small>VIBRIDGE / REPRISE</small><strong>Sessions du projet</strong></div>
      <button type="button" aria-label="Fermer la liste" @click="emit('close')">×</button>
    </header>
    <p class="info">Liste issue du poste local, limitée au projet VS Code sélectionné. Reprendre ouvre un nouveau terminal suivi.</p>
    <div class="toolbar">
      <span>{{ loading?'Actualisation…':sessions.length+' session(s)' }}</span>
      <button type="button" :disabled="loading" @click="emit('refresh')">↻ Actualiser</button>
    </div>
    <div v-if="error" class="error" role="status">{{error}}</div>
    <ul class="items">
      <li v-for="session in sessions" :key="session.id">
        <button type="button" :disabled="!canResume || loading" @click="emit('resume',session)">
          <span class="tool">{{session.cliId==='codex'?'CO':'CL'}}</span>
          <span class="description">
            <strong>{{session.title}}</strong>
            <small>{{session.cliId==='codex'?'Codex':'Claude Code'}} · {{date(session.updatedAt)}} · {{session.id.slice(0,8)}}</small>
          </span>
          <span class="play">↗</span>
        </button>
      </li>
      <li v-if="!sessions.length && !loading" class="empty">
        Aucune session reconnue pour ce projet. Les historiques locaux des CLI ne sont pas forcément accessibles ou complets.
      </li>
    </ul>
    <footer>Le résultat de reprise reste à confirmer par VS Code. Aucun historique de transcription n'est transféré.</footer>
  </section>
</template>
<script setup lang="ts">
interface CliSessionListing {id:string;cliId:'codex'|'claude-code';title:string;updatedAt:number}
defineProps<{sessions:CliSessionListing[];loading:boolean;error:string;canResume:boolean}>()
const emit=defineEmits<{close:[];refresh:[];resume:[session:CliSessionListing]}>()
function date(at:number):string{
  if(!Number.isFinite(at)||!at)return 'date inconnue'
  return new Date(at).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'})
}
</script>
<style scoped>
.vb-cli-sessions{display:flex;flex-direction:column;height:min(72dvh,600px);min-height:0;background:var(--surface);border:1px solid var(--border-bright);color:var(--text);font:11px "DM Mono",monospace}
.vb-cli-sessions header{display:flex;justify-content:space-between;align-items:center;padding:14px;border-bottom:1px solid var(--border)}
.vb-cli-sessions header div{display:grid;gap:5px}.vb-cli-sessions header small{color:var(--text-mid);font-size:9px;letter-spacing:.1em}
.vb-cli-sessions header strong{font-size:15px}.vb-cli-sessions header button{font-size:20px}
.info{padding:10px 14px;color:var(--text-mid);line-height:1.6}
.toolbar{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-block:1px solid var(--border);font-size:10px}
.toolbar button{color:var(--accent)}
.items{padding:0;margin:0;list-style:none;overflow-y:auto;flex:1}
.items button{display:flex;width:100%;align-items:center;gap:10px;padding:13px;text-align:left;border-bottom:1px solid var(--border)}
.items button:disabled{opacity:.5}
.tool{width:30px;height:30px;display:grid;place-items:center;flex:0 0 30px;background:var(--surface2);border:1px solid var(--border-bright);color:var(--accent);font-size:11px}
.description{flex:1;min-width:0;display:grid;gap:6px}
.description strong{font-size:11px;font-weight:500;overflow-wrap:anywhere}
.description small{font-size:9px;color:var(--text-mid)}
.play{font-size:19px;color:var(--accent)}
.empty{padding:22px 14px;line-height:1.6;color:var(--text-mid)}
.error{padding:9px 13px;color:var(--dot-red)}
.vb-cli-sessions footer{padding:12px 14px;border-top:1px solid var(--border);font-size:9px;line-height:1.6;color:var(--text-mid)}
</style>