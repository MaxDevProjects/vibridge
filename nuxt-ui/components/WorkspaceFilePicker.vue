<template>
  <section class="vb-file-picker" role="dialog" aria-modal="true" aria-label="Explorer les fichiers du projet">
    <header>
      <div><small>VIBRIDGE / PROJET</small><strong>Parcourir les fichiers</strong></div>
      <button type="button" aria-label="Fermer les fichiers" @click="emit('close')">×</button>
    </header>
    <div class="vb-breadcrumb">
      <button type="button" :disabled="!currentPath" @click="up">‹</button>
      <span>{{ currentPath || '/' }}</span>
      <button type="button" :disabled="loading" @click="refresh">↻</button>
    </div>
    <p v-if="error" class="vb-file-error" role="status">{{ error }}</p>
    <div v-if="loading" class="vb-file-placeholder">Lecture du dossier…</div>
    <ul v-else class="vb-file-items">
      <li v-for="node in children" :key="node.path">
        <button type="button" class="vb-file-entry" @click="select(node)">
          <span aria-hidden="true">{{ node.type==='dir'?'▤':'◇' }}</span>
          <span>{{ node.name }}</span><span class="vb-chevron">›</span>
        </button>
      </li>
      <li v-if="!children.length" class="vb-file-placeholder">Dossier vide ou indisponible.</li>
    </ul>
    <div v-if="previewPath" class="vb-file-preview">
      <p>{{ previewPath }}</p>
      <pre v-if="previewText">{{ previewText }}</pre>
      <p v-else>{{ previewError || 'Chargement du fichier…' }}</p>
      <button type="button" @click="emit('insert', previewPath)">Insérer le chemin dans la saisie</button>
    </div>
    <footer>
      <button type="button" @click="emit('insert', currentPath || '.')">Insérer le dossier</button>
      <button v-if="context==='shell' && canControl" type="button" class="primary"
        @click="emit('navigate',currentPath)">Aller dans ce dossier</button>
      <span v-else>Navigation shell indisponible dans cette CLI</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import type { FileNode } from '~/components/FileTree.vue'
import type { CliContext } from '~/utils/terminalActionCatalog'
import { safeWorkspaceRelativePath } from '~/utils/terminalActionCatalog'

const props=defineProps<{ windowId:string; context:CliContext; canControl:boolean }>()
const emit=defineEmits<{close:[];insert:[path:string];navigate:[path:string]}>()
const bridge=useDevBridge()
const tree=ref<FileNode[]>([])
const currentPath=ref('')
const error=ref('')
const loading=ref(false)
const previewPath=ref('')
const previewText=ref('')
const previewError=ref('')
function safePath(path:string):boolean{return path===''||safeWorkspaceRelativePath(path)}
function relayBase():string{return bridge.relayUrl.value||''}
async function fileRequest(path?:string):Promise<Response>{
  if(bridge.mode.value==='relay'){
    const url=`${relayBase()}/api/relay/sessions/${encodeURIComponent(bridge.relaySessionId.value)}/files?workspaceId=${encodeURIComponent(bridge.activeWorkspaceId.value)}&windowId=${encodeURIComponent(props.windowId)}`+(path===undefined?'':'&path='+encodeURIComponent(path))
    return fetch(url,{headers:{Authorization:'Bearer '+bridge.token.value}})
  }
  const base=localStorage.getItem('vb:agentUrl')||'http://localhost:3333'
  return fetch(base+(path===undefined?'/files':'/files/'+encodeURIComponent(path)),{
    headers:{Authorization:'Bearer '+bridge.token.value},
  })
}
async function refresh(){
  if(!bridge.token.value){error.value='Session non autorisée.';return}
  loading.value=true;error.value=''
  try{
    const response=await fileRequest()
    if(!response.ok)throw new Error('Erreur '+response.status)
    const data=await response.json()
    const nodes=Array.isArray(data)?data:(Array.isArray(data.tree)?data.tree:[])
    tree.value=nodes.slice(0,300) as FileNode[]
  }catch{error.value='Lecture indisponible. Réessaie lorsque le poste est connecté.'}
  finally{loading.value=false}
}
const children=computed<FileNode[]>(()=>{
 let nodes=tree.value
 for(const segment of currentPath.value.split('/').filter(Boolean)){
  const dir=nodes.find(n=>n.type==='dir'&&n.name===segment)
  nodes=dir?.children??[]
 }
 return [...nodes].sort((a,b)=>a.type===b.type?a.name.localeCompare(b.name):a.type==='dir'?-1:1)
})
function up(){currentPath.value=currentPath.value.split('/').slice(0,-1).join('/');previewPath.value=''}
async function select(node:FileNode){
  if(!safePath(node.path))return
  if(node.type==='dir'){currentPath.value=node.path;previewPath.value='';return}
  previewPath.value=node.path;previewText.value='';previewError.value=''
  try{
    const response=await fileRequest(node.path)
    if(!response.ok)throw new Error('Erreur')
    const result=await response.json() as { content?:unknown }
    previewText.value=typeof result.content==='string'?result.content.slice(0,12000):'Aucun texte disponible.'
  }catch{previewError.value='Aperçu indisponible. Le chemin reste insérable.'}
}
watch(()=>props.windowId,()=>{tree.value=[];currentPath.value='';previewPath.value='';void refresh()})
onMounted(()=>void refresh())
</script>

<style scoped>
.vb-file-picker{display:flex;flex-direction:column;min-height:0;height:min(72dvh,610px);background:var(--surface);border:1px solid var(--border-bright);color:var(--text);font:11px "DM Mono",monospace}
.vb-file-picker header{display:flex;justify-content:space-between;align-items:center;padding:15px;border-bottom:1px solid var(--border)}
.vb-file-picker header div{display:grid;gap:5px}
.vb-file-picker header small{font-size:9px;letter-spacing:.12em;color:var(--text-mid)}
.vb-file-picker header strong{font-size:15px}
.vb-file-picker header button{font-size:21px}
.vb-breadcrumb{display:flex;align-items:center;gap:12px;padding:11px;border-bottom:1px solid var(--border)}
.vb-breadcrumb span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
.vb-breadcrumb button{font-size:18px;color:var(--accent);min-width:30px}
.vb-file-items{list-style:none;margin:0;padding:0;overflow:auto;min-height:0;flex:1}
.vb-file-entry{width:100%;display:flex;align-items:center;gap:12px;text-align:left;padding:11px 14px;border-bottom:1px solid var(--border);overflow:hidden}
.vb-file-entry span:nth-child(2){flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.vb-file-entry span:first-child{color:var(--accent)}
.vb-chevron{color:var(--text-mid)}
.vb-file-preview{padding:10px 13px;border-top:1px solid var(--border);max-height:28dvh;overflow:auto}
.vb-file-preview p{overflow-wrap:anywhere;color:var(--text-mid)}
.vb-file-preview pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:14dvh;overflow:auto}
.vb-file-preview button{padding:9px;border:1px solid var(--border-bright);margin-top:9px}
.vb-file-picker footer{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:12px;border-top:1px solid var(--border)}
.vb-file-picker footer button{padding:9px 11px;border:1px solid var(--border-bright)}
.vb-file-picker footer button.primary{background:var(--accent-soft);color:var(--text)}
.vb-file-picker footer span{color:var(--text-mid);font-size:9px}
.vb-file-error{padding:8px 12px;color:var(--dot-red)}
.vb-file-placeholder{padding:20px;color:var(--text-mid)}
</style>