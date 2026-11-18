<template>
  <div class="mb-root">
    <section v-if="!activeThread" class="mb-inbox">
      <div class="mb-heading">
        <div><p class="mb-eyebrow">{{ t('connectedTo') }}</p><h1>{{ t('conversations') }}</h1></div>
        <button class="mb-iconbtn" :aria-label="t('menu')" @click="menuOpen = true">•••</button>
      </div>
      <div class="mb-status">
        <span class="mb-dot" :class="bridge.status.value"></span>
        <span>{{ connectionText }}</span>
        <small>{{ bridge.windows.value.filter(w => w.connected).length }} {{ t('windows') }}</small>
      </div>
      <div class="mb-search"><span aria-hidden="true">⌕</span><input v-model="search" :placeholder="t('search')" :aria-label="t('search')"></div>
      <div class="mb-filters" role="group" :aria-label="t('filter')">
        <button v-for="f in filters" :key="f" :class="{selected:filter===f}" @click="filter=f">{{ t(f) }}</button>
      </div>
      <div class="mb-list">
        <template v-for="group in groups" :key="group.id">
          <div class="mb-group"><span>{{ group.name }}</span><span>{{ group.items.length }}</span></div>
          <button v-for="thread in group.items" :key="thread.key" class="mb-conversation" @click="openThread(thread)">
            <div class="mb-avatar">⌘</div>
            <div class="mb-conversation-body">
              <div class="mb-conversation-top">
                <strong>{{ thread.label }}</strong>
                <span class="mb-dot small" :class="thread.connected ? 'connected' : 'disconnected'"></span>
              </div>
              <p>{{ threadPreview(thread.key, thread.state) }}</p>
              <small :class="thread.state === 'attention_possible' ? 'mb-attention' : ''">{{ threadState(thread.state,thread.connected) }}</small>
            </div>
            <span class="mb-chevron">›</span>
          </button>
        </template>
        <div v-if="!groups.length" class="mb-empty">
          <div class="mb-empty-icon">⌘</div>
          <strong>{{ t('emptyTitle') }}</strong>
          <p>{{ t('emptyText') }}</p>
        </div>
      </div>
      <button class="mb-add" @click="showProjectPicker">+ {{ t('project') }}</button>
    </section>

    <section v-else class="mb-chat">
      <header class="mb-chatbar">
        <button class="mb-back" :aria-label="t('back')" @click="activeThread = null">‹</button>
        <div class="mb-chat-heading">
          <strong>{{ activeThread.label }}</strong>
          <small>{{ activeThread.project }} · {{ threadState(activeThread.state,activeThread.connected) }}</small>
        </div>
        <button class="mb-iconbtn" :aria-label="t('actions')" @click="actionsOpen = true">•••</button>
      </header>
      <div class="mb-context"><span>⌘ {{ activeThread.project }}</span><span>{{ t('window') }} {{ activeThread.windowShort }}</span></div>
      <div v-if="bridge.status.value !== 'connected'" class="mb-alert">{{ t('offlineWarning') }}</div>
      <div v-else-if="bridge.agentStatus.value?.control?.mode === 'observe'" class="mb-alert">{{ t('observeWarning') }}</div>
      <div class="mb-messages" ref="scroller" @scroll="onScroll">
        <div v-if="!activeMessages.length" class="mb-empty mb-empty-chat">
          <span class="mb-empty-icon">⌘</span>
          <strong>{{ t('readyChat') }}</strong>
          <p>{{ t('chatDescription') }}</p>
        </div>
        <template v-for="entry in activeMessages" :key="entry.id">
          <div v-if="entry.kind==='user'" class="mb-bubble-row user">
            <div class="mb-user-bubble">{{ entry.text }}</div>
            <time>{{ timeLabel(entry.ts) }}</time>
          </div>
          <div v-else-if="entry.kind==='status'" class="mb-system">
            <span class="mb-system-mark">◉</span><span>{{ entry.text }}</span><time>{{ timeLabel(entry.ts) }}</time>
          </div>
          <div v-else class="mb-output-card">
            <div class="mb-output-header">
              <div class="mb-output-badge">⌘</div>
              <strong>{{ activeThread.label }}</strong>
              <span class="mb-output-time">{{ timeLabel(entry.ts) }}</span>
            </div>
            <div v-if="entry.working" class="mb-working"><span class="mb-pulse"></span>{{ t('outputInProgress') }}</div>
            <div v-if="entry.text" class="mb-output-text">{{ displayOutput(entry) }}</div>
            <div v-else class="mb-muted">{{ t('unreadableOutput') }}</div>
            <button v-if="entry.raw" class="mb-inline" @click="toggleRaw(entry.id)">{{ expandedRaw[entry.id] ? t('hideRaw') : t('showRaw') }} <span>⌄</span></button>
            <pre v-if="expandedRaw[entry.id]" class="mb-raw">{{ entry.raw }}</pre>
            <div class="mb-output-footer"><span>{{ t('observedNotVerified') }}</span><button @click="openPreview">{{ t('preview') }} ↗</button></div>
          </div>
        </template>
      </div>
      <button v-if="!nearBottom" class="mb-new-messages" @click="scrollBottom">{{ t('latest') }} ↓</button>
      <div class="mb-composer">
        <div class="mb-target">
          <span>⌘ {{ t('target') }}</span>
          <select :value="activeThread.key" :aria-label="t('target')" @change="onTargetChange">
            <option v-for="thread in windowThreads" :key="thread.key" :value="thread.key">{{ thread.label }}</option>
          </select>
          <button :title="t('newTerminal')" @click="createTerminal">+</button>
        </div>
        <div class="mb-type-row">
          <textarea v-model="draft" :placeholder="t('message')" rows="1" :aria-label="t('message')" :disabled="!canSend" @keydown.enter.exact.prevent="sendInstruction" />
          <button class="mb-send" :disabled="!canSend || !draft.trim()" :aria-label="t('send')" @click="sendInstruction">↑</button>
        </div>
        <small class="mb-subline">{{ t('notAChatbot') }}</small>
      </div>
    </section>

    <div v-if="menuOpen || actionsOpen || projectsOpen" class="mb-overlay" @click.self="closeSheets">
      <section class="mb-sheet" role="dialog" aria-modal="true" :aria-label="t('actions')">
        <div class="mb-sheet-handle"></div>
        <template v-if="projectsOpen">
          <h2>{{ t('projects') }}</h2>
          <p class="mb-muted">{{ t('projectExplain') }}</p>
          <button v-for="window in bridge.windows.value" :key="window.id" class="mb-sheet-action" @click="chooseWindow(window.id)">
            <span>⌘ {{ projectLabel(window) }}</span><small>{{ window.connected ? t('connected') : t('offline') }}</small>
          </button>
          <div v-if="availableProjects.length" class="mb-group">{{ t('otherProjects') }}</div>
          <button v-for="p in availableProjects" :key="p.path" class="mb-sheet-action" @click="openProject(p.path)">{{ p.name }} <span>↗</span></button>
          <p v-if="!availableProjects.length && !bridge.windows.value.length" class="mb-muted">{{ t('noProjects') }}</p>
        </template>
        <template v-else-if="actionsOpen">
          <h2>{{ activeThread?.project }}</h2>
          <button class="mb-sheet-action" @click="openPreview">{{ t('preview') }} <span>▣</span></button>
          <button class="mb-sheet-action" @click="showProjectPicker">{{ t('switchProject') }} <span>⌄</span></button>
          <button v-if="bridge.agentStatus.value?.control?.canControl" class="mb-sheet-action" @click="createTerminal">{{ t('newTerminal') }} <span>+</span></button>
          <button v-for="cli in availableClis" :key="cli" class="mb-sheet-action" @click="startCli(cli)">{{ t('launch') }} {{ cli }} <span>↗</span></button>
          <button v-if="bridge.agentStatus.value?.control?.allowWindowClose" class="mb-sheet-action danger" @click="actionsOpen=false;confirmClose=true">{{ t('closeWindow') }} <span>×</span></button>
          <p v-else class="mb-muted">{{ t('closeWindowNotSupported') }}</p>
        </template>
        <template v-else>
          <h2>{{ t('menu') }}</h2>
          <button class="mb-sheet-action" @click="showProjectPicker">{{ t('projects') }} <span>⌄</span></button>
          <div class="mb-sheet-action"><span>{{ t('language') }}</span><button @click="lang=lang==='fr'?'en':'fr'">{{ lang.toUpperCase() }} ⇄</button></div>
          <button class="mb-sheet-action" @click="signOut">{{ t('disconnectDevice') }}</button>
          <button class="mb-sheet-action danger" @click="confirmRevoke=true;menuOpen=false">{{ t('revoke') }}</button>
          <p class="mb-muted">{{ t('revokeExplain') }}</p>
        </template>
        <button class="mb-sheet-dismiss" @click="closeSheets">{{ t('cancel') }}</button>
      </section>
    </div>
    <div v-if="confirmRevoke" class="mb-overlay" role="dialog" aria-modal="true" :aria-label="t('revoke')">
      <div class="mb-confirm">
        <h2>{{ t('revoke') }}</h2><p>{{ t('revokeConfirm') }}</p>
        <p v-if="revokeError" class="mb-error">{{ t('revokeFailed') }}</p>
        <button class="mb-revoke-btn" :disabled="revoking" @click="revokeAccess">{{ revoking ? t('revoking') : t('confirmRevoke') }}</button>
        <button class="mb-sheet-dismiss" :disabled="revoking" @click="confirmRevoke=false">{{ t('cancel') }}</button>
      </div>
    </div>
    <div v-if="confirmClose" class="mb-overlay" role="dialog" aria-modal="true" :aria-label="t('closeWindow')">
      <div class="mb-confirm">
        <h2>{{ t('closeWindow') }}</h2><p>{{ t('closeWindowConfirm') }}</p>
        <button class="mb-revoke-btn" @click="requestWindowClose">{{ t('requestClose') }}</button>
        <button class="mb-sheet-dismiss" @click="confirmClose=false">{{ t('cancel') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ConnectedWindow, WsMessage } from '~/composables/useDevBridge'
import { compactTerminalOutput, terminalConversationKey } from '~/composables/compactTerminalOutput'

type Entry = { id: string; ts: number; kind: 'user'|'status'|'output'; text: string; raw?: string; working?: boolean }
type Thread = { key: string; windowId: string; terminalId: string; label: string; project: string; windowShort: string; connected: boolean; state: string }
type Project = { name: string; path: string }
const bridge = useDevBridge()
const route = useRoute()
const locale = useState<'fr'|'en'>('mobileLocale', () => 'fr')
const lang = locale
const search = ref('')
const filter = ref('all')
const filters = ['all', 'running', 'attention', 'finished']
const activeThread = ref<Thread|null>(null)
const threadsHistory = ref<Record<string,Entry[]>>({})
const draft = ref('')
const expandedRaw = ref<Record<string,boolean>>({})
const nearBottom = ref(true)
const scroller = ref<HTMLElement|null>(null)
const menuOpen = ref(false), actionsOpen = ref(false), projectsOpen = ref(false)
const confirmRevoke = ref(false), revoking = ref(false), revokeError = ref(false)
const confirmClose = ref(false)
const availableProjects = ref<Project[]>([])
const dic: Record<string,Record<string,string>> = {
  fr: {conversations:'Conversations',connectedTo:'POSTE DISTANT',windows:'fenêtre(s)',connected:'Connecté',offline:'Hors ligne',connecting:'Connexion…',search:'Rechercher une conversation…',filter:'Filtrer',all:'Tout',running:'En cours',attention:'Besoin de moi',finished:'Terminé',emptyTitle:'Aucun terminal disponible',emptyText:'Ouvre un projet dans VS Code, puis sélectionne son terminal ici.',project:'Choisir un projet',projects:'Projets et fenêtres',otherProjects:'Autres projets',noProjects:'Aucun projet disponible',back:'Retour',menu:'Menu',actions:'Actions',window:'Fenêtre',offlineWarning:'Connexion interrompue. Aucune instruction ne sera envoyée.',observeWarning:'Mode observation. Le contrôle distant est désactivé sur ton ordinateur.',readyChat:'Terminal prêt à être consulté',chatDescription:'Les sorties observées apparaîtront ici. Les commandes sont exécutées sur ton ordinateur.',outputInProgress:'Sortie en cours de réception',unreadableOutput:'Sortie technique sans texte lisible.',showRaw:'Afficher la sortie reçue',hideRaw:'Masquer la sortie reçue',observedNotVerified:'Sortie observée, résultat CLI non vérifié',preview:'Voir la preview',latest:'Derniers messages',target:'Terminal',newTerminal:'Nouveau terminal',message:'Nouvelle instruction…',send:'Envoyer',notAChatbot:'Transmission vers le vrai terminal VS Code',projectExplain:'La sélection ne rouvre pas les dossiers. Les commandes vont uniquement à la fenêtre choisie.',switchProject:'Changer de fenêtre',launch:'Lancer',closeWindowNotSupported:'Pour fermer une fenêtre, autorise explicitement VIBRIDGE_ALLOW_WINDOW_CLOSE sur ton PC.',closeWindow:'Fermer la fenêtre VS Code',closeWindowConfirm:'La fenêtre sélectionnée sera fermée sur ton ordinateur. VS Code peut demander de sauvegarder les fichiers non enregistrés. Les processus indépendants peuvent continuer.',requestClose:'Demander la fermeture',language:'Langue',disconnectDevice:'Déconnecter ce téléphone',revoke:'Couper l’accès distant',revokeExplain:'La révocation invalide les jetons relay. Un nouvel appairage sera nécessaire.',revokeConfirm:'Couper cette session pour tous les appareils associés ? Le terminal local peut continuer à fonctionner.',revokeFailed:'Impossible de confirmer la révocation. Aucun succès n’est annoncé. Réessaie une fois connecté.',revoking:'Révocation…',confirmRevoke:'Révoquer la session',cancel:'Annuler',instructionSent:'Instruction envoyée. En attente de confirmation.',terminalCreated:'Terminal créé dans VS Code.',launchDispatched:'Commande de lancement transmise. CLI prête non confirmée.',attentionPossible:'Intervention possible. Vérifie la sortie du terminal.',commandStarted:'Exécution shell détectée.',commandFinished:'Fin de commande shell détectée (succès CLI non confirmé).',invalidContext:'Terminal indisponible, rien n’a été envoyé.' },
  en: {conversations:'Conversations',connectedTo:'REMOTE COMPUTER',windows:'window(s)',connected:'Connected',offline:'Offline',connecting:'Connecting…',search:'Search conversations…',filter:'Filter',all:'All',running:'Running',attention:'Needs me',finished:'Finished',emptyTitle:'No terminals available',emptyText:'Open a project in VS Code to display its real terminals here.',project:'Choose a project',projects:'Projects and windows',otherProjects:'Other projects',noProjects:'No projects available',back:'Back',menu:'Menu',actions:'Actions',window:'Window',offlineWarning:'Connection lost. No instruction will be sent.',observeWarning:'Observe mode. Remote control is disabled on your computer.',readyChat:'Terminal available',chatDescription:'Observed output appears here. Commands run on your computer.',outputInProgress:'Receiving output',unreadableOutput:'Technical output without readable text.',showRaw:'Show received output',hideRaw:'Hide received output',observedNotVerified:'Output observed, CLI result not verified',preview:'Open preview',latest:'Latest messages',target:'Terminal',newTerminal:'New terminal',message:'New instruction…',send:'Send',notAChatbot:'Sending to the real VS Code terminal',projectExplain:'Selecting a window does not reopen folders. Commands target only the selected window.',switchProject:'Change window',launch:'Launch',closeWindowNotSupported:'Enable VIBRIDGE_ALLOW_WINDOW_CLOSE on your computer to close a window remotely.',closeWindow:'Close VS Code window',closeWindowConfirm:'Close the selected VS Code window on your computer? VS Code may ask to save unsaved files. Independent processes may keep running.',requestClose:'Request close',language:'Language',disconnectDevice:'Sign out of this phone',revoke:'Revoke remote access',revokeExplain:'Revocation invalidates relay tokens. Pair again from VS Code to reconnect.',revokeConfirm:'Revoke this session for all paired clients? Local terminal processes may continue.',revokeFailed:'Revocation could not be confirmed. Access may still be active.',revoking:'Revoking…',confirmRevoke:'Revoke session',cancel:'Cancel',instructionSent:'Instruction sent. Awaiting confirmation.',terminalCreated:'Terminal created in VS Code.',launchDispatched:'CLI launch dispatched, readiness unconfirmed.',attentionPossible:'Intervention possible. Check terminal output.',commandStarted:'Shell execution observed.',commandFinished:'Shell command finished. CLI success unconfirmed.',invalidContext:'Terminal unavailable. Nothing sent.' }
}
const t=(key:string)=>dic[lang.value]?.[key] ?? key
const connectionText=computed(()=> t(bridge.status.value === 'connected' ? 'connected' : bridge.status.value === 'connecting' ? 'connecting' : 'offline'))
const availableClis=computed(()=>bridge.agentStatus.value?.control?.canControl ? (bridge.agentStatus.value?.control?.allowedClis ?? []).slice(0,6) : [])
function projectLabel(w:ConnectedWindow) { return (w.workspaceFolders[0] ?? w.ideState?.workspaceFolders?.[0] ?? '').replace(/\\/g,'/').split('/').filter(Boolean).pop() || 'VS Code' }
const allThreads=computed<Thread[]>(()=>bridge.windows.value.flatMap(w=>{
 const project=projectLabel(w)
 return (w.ideState?.terminals ?? []).filter(term=>Boolean(term.id)).map(term=>({
  key:terminalConversationKey(bridge.relaySessionId.value || bridge.activeUrl.value,bridge.activeWorkspaceId.value,w.id,String(term.id)),
  windowId:w.id, terminalId:String(term.id), label:term.name,project,windowShort:w.id.slice(0,5),
  connected:Boolean(w.connected),state:w.activity?.terminalId === term.id ? (w.activity?.state ?? 'idle') : 'idle'
 }))
}))
const groups=computed(()=>{
 const q=search.value.trim().toLowerCase()
 const matching=allThreads.value.filter(item=>(!q || (item.label+' '+item.project).toLowerCase().includes(q))
   && (filter.value==='all' || (filter.value==='attention' ? item.state==='attention_possible' : item.state===filter.value)))
 const grouped=new Map<string,{id:string;name:string;items:Thread[]}>()
 for(const item of matching){const id=item.windowId; if(!grouped.has(id))grouped.set(id,{id,name:item.project,items:[]});grouped.get(id)!.items.push(item)}
 return [...grouped.values()]
})
const windowThreads=computed(()=>allThreads.value.filter(item=>item.windowId===activeThread.value?.windowId))
const activeMessages=computed(()=>activeThread.value ? threadsHistory.value[activeThread.value.key] ?? [] : [])
const canSend=computed(()=>bridge.status.value==='connected' && Boolean(bridge.agentStatus.value?.control?.canControl) && Boolean(bridge.selectedWindow.value?.connected) && bridge.activeWindowId.value===activeThread.value?.windowId && !bridge.projectTransition.value)
function threadState(state:string,connected:boolean) { return !connected ? t('offline') : state==='attention_possible'?t('attention'):state==='running'?t('running'):state==='finished'?t('finished'):t('connected') }
function threadPreview(key:string,state:string){const entries=threadsHistory.value[key] ?? []; const last=entries.at(-1);return last?.kind==='output'?compactTerminalOutput(last.raw ?? '').display.slice(-90)||t('outputInProgress'):last?.text.slice(0,90)||threadState(state,true)}
function activeKey(){return activeThread.value?.key??''}
function addEntry(key:string,entry:Entry){
 if(!key)return
 const prior=threadsHistory.value[key]??[]
 const next=[...prior,entry].slice(-70)
 threadsHistory.value={...threadsHistory.value,[key]:next}
 saveLog(key)
 if(nearBottom.value)nextTick(scrollBottom)
}
function saveLog(key:string){
  if(!import.meta.client)return
  // Persist only the compact view. Raw terminal streams may contain secrets
  // and must not be copied into long-lived browser storage.
  const entries=(threadsHistory.value[key]??[]).slice(-70).map(({raw, ...entry})=>entry)
  try{localStorage.setItem('vb:mobile-thread:'+key,JSON.stringify(entries))}catch{}
}
function loadLog(key:string){if(!import.meta.client || threadsHistory.value[key])return;try{const parsed=JSON.parse(localStorage.getItem('vb:mobile-thread:'+key)||'[]') as Entry[];if(Array.isArray(parsed))threadsHistory.value={...threadsHistory.value,[key]:parsed.slice(-70)}}catch{}}
function openThread(item:Thread){bridge.selectWindow(item.windowId);activeThread.value=item;loadLog(item.key);draft.value=localStorage.getItem('vb:mobile-draft:'+item.key)||'';nearBottom.value=true;nextTick(scrollBottom)}
function onTargetChange(e:Event){const key=(e.target as HTMLSelectElement).value; const next=allThreads.value.find(item=>item.key===key);if(next){saveDraft();openThread(next)}}
function saveDraft(){if(import.meta.client && activeThread.value)localStorage.setItem('vb:mobile-draft:'+activeThread.value.key,draft.value)}
watch(draft,saveDraft)
function onScroll(){const el=scroller.value;if(el)nearBottom.value=el.scrollHeight-el.scrollTop-el.clientHeight<90}
function scrollBottom(){if(scroller.value)scroller.value.scrollTop=scroller.value.scrollHeight}
function timeLabel(ts:number){return new Date(ts).toLocaleTimeString(lang.value==='fr'?'fr-FR':'en-GB',{hour:'2-digit',minute:'2-digit'})}
function displayOutput(entry:Entry){return compactTerminalOutput(entry.raw??entry.text).display || entry.text || t('unreadableOutput')}
function toggleRaw(id:string){expandedRaw.value={...expandedRaw.value,[id]:!expandedRaw.value[id]}}
function sendInstruction(){
 const text=draft.value.trim(),item=activeThread.value
 if(!item || !text || !canSend.value)return
 if(!bridge.send({type:'message',text,target:'terminal:'+item.terminalId,sendEnter:true}))return
 addEntry(item.key,{id:crypto.randomUUID(),ts:Date.now(),kind:'user',text})
 addEntry(item.key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',text:t('instructionSent')})
 draft.value=''
}
function createTerminal(){if(!canSend.value)return;const names=new Set(windowThreads.value.map(t=>t.label));let i=1;while(names.has('DevBridge '+i))i++;const sent=bridge.send({type:'create_terminal',terminalName:'DevBridge '+i});if(sent)closeSheets()}
function startCli(cli:string){const sent=bridge.send({type:'start_cli',cliId:cli});if(sent){if(activeThread.value)addEntry(activeThread.value.key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',text:t('launchDispatched')});closeSheets()}}
function openPreview(){closeSheets();void navigateTo('/preview')}
function closeSheets(){menuOpen.value=false;actionsOpen.value=false;projectsOpen.value=false}
function showProjectPicker(){closeSheets();projectsOpen.value=true;availableProjects.value=[];if(bridge.status.value==='connected')bridge.send({type:'list_projects'})}
function chooseWindow(windowId:string){const next=allThreads.value.find(item=>item.windowId===windowId);closeSheets();if(next)openThread(next);else bridge.selectWindow(windowId)}
function openProject(path:string){closeSheets();bridge.requestOpenProject(path,true)}
function signOut(){closeSheets();bridge.clearStoredSession();void navigateTo('/setup')}
function requestWindowClose(){if(!activeThread.value?.connected || !bridge.agentStatus.value?.control?.allowWindowClose)return;confirmClose.value=false;if(bridge.send({type:'close_window'})){activeThread.value=null}}
async function revokeAccess(){revoking.value=true;revokeError.value=false;const success=await bridge.revokeRelaySession();revoking.value=false;if(success){confirmRevoke.value=false;void navigateTo('/setup')}else revokeError.value=true}
const off=bridge.onMessage((msg:WsMessage)=>{
 const key=activeKey(),item=activeThread.value
 if(msg.type==='projects_list'){const payload=msg.payload && typeof msg.payload==='object'?msg.payload as {projects?:Project[]}:{};const projects=Array.isArray(msg.projects)?msg.projects as Project[]:payload.projects;availableProjects.value=Array.isArray(projects)?projects:[];return}
 if(!item || !key)return
 if(typeof msg.windowId==='string' && msg.windowId!==item.windowId)return
 if(msg.type==='output' && typeof msg.text==='string'){
  const tool=String(msg.tool??'')
  if(tool && tool!=='terminal:'+item.terminalId)return
  const prior=threadsHistory.value[key]??[]
  const last=prior.at(-1)
  // A continuous CLI stream is *one* message, not a new bubble per PTY chunk.
  if(last?.kind==='output' && Date.now()-last.ts<120000){
   const raw=((last.raw??'')+msg.text).slice(-20000)
   const next=[...prior.slice(0,-1),{...last,raw,text:compactTerminalOutput(raw).display,working:compactTerminalOutput(raw).working,ts:Date.now()}]
   threadsHistory.value={...threadsHistory.value,[key]:next};saveLog(key);if(nearBottom.value)nextTick(scrollBottom)
  }else{
   const raw=msg.text
   addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'output',raw,text:compactTerminalOutput(raw).display,working:true})
  }
 }else if(msg.type==='ide_event' && typeof msg.kind==='string' && String(msg.terminalId??'')===item.terminalId){
  if(msg.kind==='terminal_command_started')addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',text:t('commandStarted')})
  if(msg.kind==='terminal_command_finished'){const prior=threadsHistory.value[key]??[];const last=prior.at(-1);if(last?.kind==='output'){threadsHistory.value={...threadsHistory.value,[key]:[...prior.slice(0,-1),{...last,working:false}]};saveLog(key)}addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',text:t('commandFinished')})}
 }else if(msg.type==='notification' && (!msg.terminalId || String(msg.terminalId)===item.terminalId)){
  addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',text:t('attentionPossible')})
 }else if(msg.type==='terminal_created' && msg.terminalId){nextTick(()=>{const found=allThreads.value.find(thread=>thread.windowId===item.windowId && thread.terminalId===String(msg.terminalId));if(found)openThread(found)})}
})
onMounted(()=>{
  const stored = localStorage.getItem('vb:mobile-language')
  if(stored==='fr'||stored==='en')lang.value=stored
  else lang.value=navigator.language.toLowerCase().startsWith('fr')?'fr':'en'
  for(const thread of allThreads.value)loadLog(thread.key)
})
watch(lang,value=>{if(import.meta.client)localStorage.setItem('vb:mobile-language',value)})
watch(allThreads,(threads)=>{
  for(const thread of threads)loadLog(thread.key)
  if(activeThread.value){
    const updated=threads.find(thread=>thread.key===activeThread.value?.key)
    if(updated)activeThread.value=updated
  }
  const focusWindow=String(route.query.focusWindow??'')
  const focusTerminal=String(route.query.focusTerminal??'')
  if(focusWindow && focusTerminal){
    const target=threads.find(thread=>thread.windowId===focusWindow && thread.terminalId===focusTerminal)
    if(target)openThread(target)
  }
},{immediate:true})
onUnmounted(off)
useHead({title:'DevBridge | Conversations'})
</script>

<style scoped>
.mb-root{height:calc(100dvh - 3.5rem);max-width:900px;margin:auto;color:var(--text);background:var(--bg);font-family:Inter,system-ui,sans-serif;position:relative;overflow:hidden}
.mb-inbox,.mb-chat{height:100%;display:flex;flex-direction:column;min-height:0}
.mb-heading{padding:28px 20px 14px;display:flex;justify-content:space-between;align-items:center}
.mb-eyebrow,.mb-subline{font-family:monospace;font-size:10px;letter-spacing:.12em;color:var(--muted);text-transform:uppercase}
.mb-heading h1{font-size:26px;line-height:1.15;font-weight:650;letter-spacing:-.04em;margin:5px 0 0}
.mb-iconbtn,.mb-back{border:1px solid var(--border);border-radius:12px;background:var(--surface);color:var(--text);width:42px;height:42px;font-size:20px;flex-shrink:0}
.mb-status{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-mid);padding:0 20px 16px}
.mb-status small{margin-left:auto;color:var(--muted)}
.mb-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--dot-amber);flex-shrink:0}
.mb-dot.connected{background:var(--dot-green)}.mb-dot.disconnected{background:var(--dot-red)}.mb-dot.small{width:7px;height:7px}
.mb-search{display:flex;align-items:center;gap:10px;padding:0 13px;margin:0 20px 14px;height:44px;background:var(--surface);border:1px solid var(--border);border-radius:12px;color:var(--muted)}
.mb-search input{background:transparent;outline:none;width:100%;font-size:13px;color:var(--text)}
.mb-filters{display:flex;gap:6px;overflow-x:auto;padding:0 20px 15px}.mb-filters button{flex-shrink:0;padding:8px 12px;border:1px solid var(--border);border-radius:9px;font-size:12px;color:var(--muted)}
.mb-filters button.selected{color:var(--bg);background:var(--text);border-color:var(--text)}
.mb-list{overflow-y:auto;flex:1;min-height:0;padding-bottom:90px}.mb-group{padding:17px 20px 9px;display:flex;justify-content:space-between;color:var(--muted);font-size:10px;text-transform:uppercase;letter-spacing:.15em}
.mb-conversation{display:flex;align-items:center;gap:12px;text-align:left;padding:14px 20px;width:100%;border-bottom:1px solid var(--border);background:transparent;color:var(--text)}
.mb-conversation:active,.mb-sheet-action:active{background:var(--surface2)}
.mb-avatar{width:46px;height:46px;border-radius:15px;background:var(--surface2);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;font-family:monospace;font-size:20px;color:var(--accent)}
.mb-conversation-body{flex:1;min-width:0}.mb-conversation-top{display:flex;justify-content:space-between;align-items:center;gap:10px}.mb-conversation-top strong{font-size:14px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mb-conversation-body p{color:var(--text-mid);font-size:12px;margin:4px 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mb-conversation-body small{font-size:11px;color:var(--muted)}.mb-conversation-body small.mb-attention{color:var(--dot-amber)}
.mb-chevron{font-size:24px;color:var(--dimmed)}.mb-add{position:absolute;bottom:22px;right:20px;border-radius:13px;background:var(--text);color:var(--bg);padding:12px 17px;font-size:13px;font-weight:600;box-shadow:0 10px 28px #0004}
.mb-empty{display:flex;flex-direction:column;align-items:center;text-align:center;gap:12px;padding:55px 30px;color:var(--text-mid)}.mb-empty strong{color:var(--text);font-size:14px}.mb-empty p{font-size:12px;line-height:1.6}.mb-empty-icon{font-size:30px;color:var(--accent)}
.mb-chatbar{height:63px;display:flex;align-items:center;gap:10px;padding:0 13px;border-bottom:1px solid var(--border);flex-shrink:0}.mb-back{font-size:30px;background:transparent;border:none;width:28px}.mb-chat-heading{flex:1;min-width:0}.mb-chat-heading strong{font-size:15px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mb-chat-heading small{font-size:11px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;margin-top:4px}
.mb-context{display:flex;justify-content:space-between;gap:5px;padding:9px 17px;font-family:monospace;font-size:10px;color:var(--muted);background:var(--surface);border-bottom:1px solid var(--border)}
.mb-alert{padding:10px 18px;font-size:11px;color:var(--dot-amber);background:var(--surface2);border-bottom:1px solid var(--border)}
.mb-messages{flex:1;min-height:0;overflow-y:auto;padding:18px 16px 24px;display:flex;flex-direction:column;gap:17px;scroll-behavior:smooth}.mb-empty-chat{margin:auto}
.mb-bubble-row.user{align-self:flex-end;max-width:90%;display:flex;flex-direction:column;align-items:flex-end;gap:5px}.mb-user-bubble{background:var(--surface2);border:1px solid var(--border-bright);border-radius:17px 17px 4px 17px;padding:12px 15px;line-height:1.6;font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere}.mb-bubble-row time,.mb-system time{color:var(--dimmed);font-size:10px}
.mb-system{display:flex;align-items:center;justify-content:center;gap:7px;font-size:10px;line-height:1.5;color:var(--muted);text-align:center}.mb-system-mark{color:var(--accent)}.mb-system time{display:none}
.mb-output-card{border:1px solid var(--border);border-radius:15px;padding:13px;background:var(--surface);max-width:100%;box-shadow:0 5px 14px #0001}.mb-output-header{display:flex;align-items:center;gap:8px;margin-bottom:10px}.mb-output-header strong{font-size:12px;flex:1}.mb-output-time{color:var(--muted);font-size:10px}.mb-output-badge{width:28px;height:28px;display:grid;place-items:center;border-radius:9px;background:var(--surface2);color:var(--accent)}
.mb-working{display:flex;align-items:center;gap:7px;font-size:11px;color:var(--text-mid);margin-bottom:8px}.mb-pulse{width:7px;height:7px;border-radius:50%;background:var(--dot-amber);animation:mb-blink 1.2s infinite}@keyframes mb-blink{50%{opacity:.2}}
.mb-output-text{white-space:pre-wrap;word-break:break-word;overflow-wrap:anywhere;line-height:1.6;font-size:12px;max-height:320px;overflow:auto}.mb-muted{font-size:11px;line-height:1.5;color:var(--muted)}
.mb-inline{font-size:11px;margin-top:10px;color:var(--accent)}.mb-raw{margin-top:8px;max-height:300px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bg);padding:11px;border:1px solid var(--border);font-size:10px;line-height:1.45;color:var(--text-mid)}
.mb-output-footer{display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid var(--border);padding-top:10px;margin-top:11px;font-size:10px;color:var(--muted)}.mb-output-footer button{white-space:nowrap;color:var(--accent)}
.mb-new-messages{position:absolute;bottom:143px;right:18px;background:var(--surface2);color:var(--text);border:1px solid var(--border-bright);border-radius:100px;padding:9px 13px;font-size:11px;box-shadow:0 4px 20px #0005}
.mb-composer{padding:10px 12px max(12px,env(safe-area-inset-bottom));background:var(--bg);border-top:1px solid var(--border);flex-shrink:0}.mb-target{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:11px;padding:0 4px 9px}.mb-target select{flex:1;min-width:0;color:var(--text);background:var(--surface);border:1px solid var(--border);border-radius:7px;padding:6px}.mb-target button{border:1px solid var(--border);border-radius:7px;padding:5px 9px;color:var(--text)}
.mb-type-row{display:flex;gap:9px}.mb-type-row textarea{flex:1;min-width:0;border-radius:12px;background:var(--surface);border:1px solid var(--border);resize:none;padding:12px;color:var(--text);font-size:13px;outline:none;min-height:44px;max-height:110px}.mb-send{border-radius:12px;background:var(--text);color:var(--bg);width:46px;font-size:22px}.mb-send:disabled{opacity:.35}.mb-subline{display:block;text-align:center;margin-top:7px;letter-spacing:.03em;text-transform:none}
.mb-overlay{position:absolute;inset:0;z-index:80;display:flex;align-items:flex-end;justify-content:center;background:#000a}.mb-sheet{width:100%;background:var(--surface);border:1px solid var(--border);border-radius:22px 22px 0 0;padding:12px 18px max(20px,env(safe-area-inset-bottom));max-height:80%;overflow:auto}.mb-sheet-handle{height:4px;width:39px;border-radius:5px;background:var(--border-bright);margin:0 auto 18px}.mb-sheet h2,.mb-confirm h2{font-size:18px;font-weight:650;margin-bottom:13px}.mb-sheet-action{width:100%;text-align:left;display:flex;justify-content:space-between;gap:10px;padding:17px 2px;border-bottom:1px solid var(--border);font-size:13px}.mb-sheet-action small{color:var(--muted)}.mb-sheet-action.danger,.mb-error{color:var(--dot-red)}.mb-sheet-dismiss{width:100%;padding:13px;font-size:12px;color:var(--muted);margin-top:10px}.mb-confirm{padding:22px;background:var(--surface);border:1px solid var(--border);border-radius:18px;width:calc(100% - 36px);max-width:440px;margin:auto}.mb-confirm p{font-size:13px;line-height:1.6;color:var(--text-mid)}.mb-revoke-btn{background:var(--dot-red);color:var(--bg);padding:13px;border-radius:9px;width:100%;margin-top:18px;font-weight:600}.mb-revoke-btn:disabled{opacity:.5}
@media(min-width:768px){.mb-root{border-left:1px solid var(--border);border-right:1px solid var(--border)}}
@media(prefers-reduced-motion:reduce){.mb-pulse{animation:none}.mb-messages{scroll-behavior:auto}}
</style>
