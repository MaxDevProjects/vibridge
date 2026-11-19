<template>
  <div class="mb-root">
    <section v-if="!activeThread" class="mb-inbox">
      <div class="mb-heading">
        <div class="mb-heading-copy">
          <p class="mb-brand"><span class="mb-brand-name">VIBRIDGE</span><span class="mb-brand-divider">/</span><span>{{ t('connectedTo') }}</span></p>
          <h1>{{ t('conversations') }}</h1>
        </div>
        <button class="mb-iconbtn" :aria-label="t('menu')" @click="menuOpen = true">⋮</button>
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
      <button v-if="archivedThreads.length" type="button" class="mb-archive-toggle" @click="showArchived = !showArchived">
        {{ showArchived ? (lang==='fr' ? 'Masquer les conversations hors ligne' : 'Hide offline conversations') : (lang==='fr' ? 'Historique hors ligne' : 'Offline history') + ' (' + archivedThreads.length + ')' }}
      </button>
      <div class="mb-list">
        <template v-for="group in groups" :key="group.id">
          <div class="mb-group"><span>{{ group.name }}</span><span>{{ group.items.length }}</span></div>
          <button v-for="thread in group.items" :key="thread.key" class="mb-conversation" @click="openThread(thread)">
            <div class="mb-avatar" aria-hidden="true">⌘</div>
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
        <button class="mb-iconbtn" :aria-label="t('actions')" @click="actionsOpen = true">⋮</button>
      </header>
      <div class="mb-context"><span><span class="mb-context-brand">VIBRIDGE</span> / {{ activeThread.project }}</span><span>{{ t('window') }} {{ activeThread.windowShort }}</span></div>
      <div v-if="bridge.status.value !== 'connected'" class="mb-alert">{{ t('offlineWarning') }}</div>
      <div v-else-if="bridge.agentStatus.value?.control?.mode === 'observe'" class="mb-alert">{{ t('observeWarning') }}</div>
      <div v-if="activeThread.connected && activeThread.shellIntegration === false && !activeMessages.some(entry=>entry.kind==='output')" class="mb-alert">
        {{ t('shellIntegrationMissing') }}
      </div>
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
          <select :value="activeThread.key" :aria-label="t('target')" :disabled="!windowThreads.length" @change="onTargetChange">
            <option v-if="!selectedTerminalAvailable" :value="activeThread.key" disabled>{{ activeThread.label }} ({{ t('terminalMissingShort') }})</option>
            <option v-for="thread in windowThreads" :key="thread.key" :value="thread.key">{{ thread.label }}</option>
          </select>
          <button v-if="activeThread.connected" :title="t('newTerminal')" @click="createTerminal">+</button>
        </div>
        <div class="mb-type-row">
          <textarea v-model="draft" :placeholder="t('message')" rows="1" :aria-label="t('message')" @keydown.enter.exact.prevent="sendInstruction" />
          <button class="mb-send" :disabled="!canSend || !draft.trim()" :aria-label="t('send')" @click="sendInstruction">↑</button>
        </div>
        <div v-if="sendBlockReason" class="mb-send-block" role="status">
          <span>{{ sendBlockReason }}</span>
          <button v-if="bridge.status.value==='connected'" type="button" @click="refreshControlStatus">Actualiser</button>
        </div>
        <button v-if="!selectedTerminalAvailable" type="button" class="mb-reselect-terminal" @click="activeThread=null">
          {{ t('reselectTerminal') }}
        </button>
        <small v-else class="mb-subline">{{ t('notAChatbot') }}</small>
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
          <button class="mb-sheet-action" @click="openAdvancedSettings">{{ lang==='fr'?'Paramètres avancés':'Advanced settings' }} <span>⚙</span></button>
          <button class="mb-sheet-action" @click="signOut">{{ t('disconnectDevice') }}</button>
          <button class="mb-sheet-action danger" @click="confirmRevoke=true;menuOpen=false">{{ t('revoke') }}</button>
          <p class="mb-muted">{{ t('revokeExplain') }}</p>
        </template>
        <button class="mb-sheet-dismiss" @click="closeSheets">{{ t('cancel') }}</button>
      </section>
    </div>
    <div v-if="previewOpen" class="mb-overlay" role="dialog" aria-modal="true" :aria-label="t('preview')">
      <section class="mb-preview-sheet">
        <div class="mb-preview-top"><div><small>{{ activeThread?.project }}</small><h2>{{ t('preview') }}</h2></div>
          <button class="mb-iconbtn" :aria-label="t('cancel')" @click="closePreview">×</button>
        </div>
        <p class="mb-preview-hint">{{ lang==='fr' ? 'Capture Playwright sur ton PC, sans tunnel public.' : 'Local Playwright screenshot on your PC, no public tunnel.' }}</p>
        <div class="mb-preview-controls">
          <label :for="'mb-preview-port'">{{ lang==='fr' ? 'Port local' : 'Local port' }}</label>
          <input id="mb-preview-port" v-model.number="previewPort" type="number" min="1024" max="65535" />
          <select v-model="previewDevice" :aria-label="lang==='fr' ? 'Format de capture' : 'Capture size'">
            <option value="mobile">Mobile</option><option value="desktop">Desktop</option>
          </select>
        </div>
        <button class="mb-preview-request" :disabled="previewBusy || bridge.status.value!=='connected'" @click="requestPreview">
          {{ previewBusy ? (lang==='fr' ? 'Capture en cours…' : 'Capturing…') : (lang==='fr' ? 'Capturer la page' : 'Capture page') }}
        </button>
        <p v-if="previewBusy" class="mb-preview-hint">{{ lang==='fr' ? 'En attente de réponse de VS Code. La capture ne sera pas relancée automatiquement.' : 'Waiting for VS Code. No automatic retry.' }}</p>
        <p v-if="previewError" class="mb-preview-error" role="alert">{{ previewError }}</p>
        <div v-if="previewImage" class="mb-preview-image"><img :src="previewImage" :alt="lang==='fr' ? 'Capture de la page locale' : 'Local page screenshot'" /></div>
        <p v-else-if="!previewBusy && !previewError" class="mb-preview-placeholder">▣<br>{{ lang==='fr' ? 'Aucune capture pour cette session' : 'No screenshot yet' }}</p>
        <p class="mb-preview-hint">{{ lang==='fr' ? 'Prérequis : Playwright et Chromium dans WSL. Port autorisé dans devbridge.previewPorts.' : 'Requires Playwright and Chromium in WSL. Port allowed in devbridge.previewPorts.' }}</p>
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
import { routeTerminalEvent } from '~/utils/routeTerminalEvent'
import { findRestorableThread } from '~/utils/mobileThreadRecovery'

type Entry = { id: string; ts: number; kind: 'user'|'status'|'output'; text: string; raw?: string; working?: boolean }
type Thread = { key: string; windowId: string; terminalId: string; label: string; project: string; projectPath: string; processId?: number; shellIntegration?: boolean; windowShort: string; connected: boolean; state: string }
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
const archivedThreads = ref<Thread[]>([])
const showArchived = ref(false)
const draft = ref('')
const expandedRaw = ref<Record<string,boolean>>({})
const nearBottom = ref(true)
const scroller = ref<HTMLElement|null>(null)
const menuOpen = ref(false), actionsOpen = ref(false), projectsOpen = ref(false)
const confirmRevoke = ref(false), revoking = ref(false), revokeError = ref(false)
const confirmClose = ref(false)
const previewOpen = ref(false)
const previewPort = ref(5500)
const previewDevice = ref<'mobile'|'desktop'>('mobile')
const previewBusy = ref(false)
const previewError = ref('')
const previewImage = ref('')
const previewWindowId = ref('')
let previewTimeout: ReturnType<typeof setTimeout> | null = null
const availableProjects = ref<Project[]>([])
const pendingTerminalId = ref('')
const dic: Record<string,Record<string,string>> = {
  fr: {conversations:'Conversations',connectedTo:'POSTE DISTANT',windows:'fenêtre(s)',connected:'Connecté',offline:'Hors ligne',connecting:'Connexion…',search:'Rechercher une conversation…',filter:'Filtrer',all:'Tout',running:'En cours',attention:'Besoin de moi',finished:'Terminé',emptyTitle:'Aucun terminal disponible',emptyText:'Ouvre un projet dans VS Code, puis sélectionne son terminal ici.',project:'Choisir un projet',projects:'Projets et fenêtres',otherProjects:'Autres projets',noProjects:'Aucun projet disponible',back:'Retour',menu:'Menu',actions:'Actions',window:'Fenêtre',offlineWarning:'Connexion interrompue. Aucune instruction ne sera envoyée.',observeWarning:'Mode observation. Le contrôle distant est désactivé sur ton ordinateur.',readyChat:'Terminal prêt à être consulté',chatDescription:'Les sorties observées apparaîtront ici. Les commandes sont exécutées sur ton ordinateur.',outputInProgress:'Sortie en cours de réception',unreadableOutput:'Sortie technique sans texte lisible.',showRaw:'Afficher la sortie reçue',hideRaw:'Masquer la sortie reçue',observedNotVerified:'Sortie observée, résultat CLI non vérifié',preview:'Voir la preview',latest:'Derniers messages',target:'Terminal',newTerminal:'Nouveau terminal',message:'Nouvelle instruction…',send:'Envoyer',notAChatbot:'Transmission vers le vrai terminal VS Code',projectExplain:'La sélection ne rouvre pas les dossiers. Les commandes vont uniquement à la fenêtre choisie.',switchProject:'Changer de fenêtre',launch:'Lancer',closeWindowNotSupported:'Pour fermer une fenêtre, autorise explicitement VIBRIDGE_ALLOW_WINDOW_CLOSE sur ton PC.',closeWindow:'Fermer la fenêtre VS Code',closeWindowConfirm:'La fenêtre sélectionnée sera fermée sur ton ordinateur. VS Code peut demander de sauvegarder les fichiers non enregistrés. Les processus indépendants peuvent continuer.',requestClose:'Demander la fermeture',language:'Langue',disconnectDevice:'Déconnecter ce téléphone',revoke:'Couper l’accès distant',revokeExplain:'La révocation invalide les jetons relay. Un nouvel appairage sera nécessaire.',revokeConfirm:'Couper cette session pour tous les appareils associés ? Le terminal local peut continuer à fonctionner.',revokeFailed:'Impossible de confirmer la révocation. Aucun succès n’est annoncé. Réessaie une fois connecté.',revoking:'Révocation…',confirmRevoke:'Révoquer la session',cancel:'Annuler',instructionSent:'Instruction envoyée. En attente de confirmation.',terminalCreated:'Terminal créé dans VS Code.',launchDispatched:'Demande de lancement envoyée. En attente de confirmation par VS Code.',attentionPossible:'Intervention possible. Vérifie la sortie du terminal.',commandStarted:'Exécution shell détectée.',commandFinished:'Fin de commande shell détectée (succès CLI non confirmé).',invalidContext:'Terminal indisponible, rien n’a été envoyé.',shellIntegrationMissing:'Shell Integration non détectée au dernier relevé. Certaines sorties peuvent manquer.',terminalMissingShort:'indisponible',reselectTerminal:'Revenir aux terminaux disponibles' },
  en: {conversations:'Conversations',connectedTo:'REMOTE COMPUTER',windows:'window(s)',connected:'Connected',offline:'Offline',connecting:'Connecting…',search:'Search conversations…',filter:'Filter',all:'All',running:'Running',attention:'Needs me',finished:'Finished',emptyTitle:'No terminals available',emptyText:'Open a project in VS Code to display its real terminals here.',project:'Choose a project',projects:'Projects and windows',otherProjects:'Other projects',noProjects:'No projects available',back:'Back',menu:'Menu',actions:'Actions',window:'Window',offlineWarning:'Connection lost. No instruction will be sent.',observeWarning:'Observe mode. Remote control is disabled on your computer.',readyChat:'Terminal available',chatDescription:'Observed output appears here. Commands run on your computer.',outputInProgress:'Receiving output',unreadableOutput:'Technical output without readable text.',showRaw:'Show received output',hideRaw:'Hide received output',observedNotVerified:'Output observed, CLI result not verified',preview:'Open preview',latest:'Latest messages',target:'Terminal',newTerminal:'New terminal',message:'New instruction…',send:'Send',notAChatbot:'Sending to the real VS Code terminal',projectExplain:'Selecting a window does not reopen folders. Commands target only the selected window.',switchProject:'Change window',launch:'Launch',closeWindowNotSupported:'Enable VIBRIDGE_ALLOW_WINDOW_CLOSE on your computer to close a window remotely.',closeWindow:'Close VS Code window',closeWindowConfirm:'Close the selected VS Code window on your computer? VS Code may ask to save unsaved files. Independent processes may keep running.',requestClose:'Request close',language:'Language',disconnectDevice:'Sign out of this phone',revoke:'Revoke remote access',revokeExplain:'Revocation invalidates relay tokens. Pair again from VS Code to reconnect.',revokeConfirm:'Revoke this session for all paired clients? Local terminal processes may continue.',revokeFailed:'Revocation could not be confirmed. Access may still be active.',revoking:'Revoking…',confirmRevoke:'Revoke session',cancel:'Cancel',instructionSent:'Instruction sent. Awaiting confirmation.',terminalCreated:'Terminal created in VS Code.',launchDispatched:'Launch requested. Awaiting confirmation from VS Code.',attentionPossible:'Intervention possible. Check terminal output.',commandStarted:'Shell execution observed.',commandFinished:'Shell command finished. CLI success unconfirmed.',invalidContext:'Terminal unavailable. Nothing sent.',shellIntegrationMissing:'Shell Integration not detected in the latest snapshot. Some output may be missing.',terminalMissingShort:'unavailable',reselectTerminal:'Back to available terminals' }
}
const t=(key:string)=>dic[lang.value]?.[key] ?? key
const connectionText=computed(()=> t(bridge.status.value === 'connected' ? 'connected' : bridge.status.value === 'connecting' ? 'connecting' : 'offline'))
const availableClis=computed(()=>bridge.agentStatus.value?.control?.canControl ? (bridge.agentStatus.value?.control?.allowedClis ?? []).slice(0,6) : [])
function projectLabel(w:ConnectedWindow) { return (w.workspaceFolders[0] ?? w.ideState?.workspaceFolders?.[0] ?? '').replace(/\\/g,'/').split('/').filter(Boolean).pop() || 'VS Code' }
const allThreads=computed<Thread[]>(()=>bridge.windows.value.flatMap(w=>{
 const project=projectLabel(w)
 const projectPath=(w.workspaceFolders[0] ?? w.ideState?.workspaceFolders?.[0] ?? '').replace(/\\/g,'/')
 return (w.ideState?.terminals ?? []).filter(term=>Boolean(term.id)).map(term=>({
  key:terminalConversationKey(bridge.relaySessionId.value || bridge.activeUrl.value,bridge.activeWorkspaceId.value,w.id,String(term.id)),
  windowId:w.id, terminalId:String(term.id), label:term.name,project,projectPath,
  processId:term.processId,shellIntegration:term.shellIntegration,windowShort:w.id.slice(0,5),
  connected:Boolean(w.connected),state:w.activity?.terminalId === term.id ? (w.activity?.state ?? 'idle') : 'idle'
 }))
}))
const groups=computed(()=>{
 const q=search.value.trim().toLowerCase()
 const all=[...allThreads.value.filter(item=>item.connected),...(showArchived.value?archivedThreads.value:[])]
 const matching=all.filter(item=>(!q || (item.label+' '+item.project).toLowerCase().includes(q))
   && (filter.value==='all' || (filter.value==='attention' ? item.state==='attention_possible' : item.state===filter.value)))
 const grouped=new Map<string,{id:string;name:string;items:Thread[]}>()
 for(const item of matching){
   const id=(item.connected?'live:':'archive:')+item.windowId
   const name=item.connected ? item.project+' / '+item.windowShort : (lang.value==='fr'?'Historique':'History')+' / '+item.project+' / '+item.windowShort
   if(!grouped.has(id))grouped.set(id,{id,name,items:[]})
   if(!grouped.get(id)!.items.some(existing=>existing.key===item.key))grouped.get(id)!.items.push(item)
 }
 return [...grouped.values()]
})
const windowThreads=computed(()=>allThreads.value.filter(item=>item.connected && item.windowId===activeThread.value?.windowId))
const selectedTerminalAvailable=computed(()=>Boolean(activeThread.value && windowThreads.value.some(item=>item.key===activeThread.value?.key)))
const activeMessages=computed(()=>activeThread.value ? threadsHistory.value[activeThread.value.key] ?? [] : [])
const sendBlockReason=computed(()=>{
 if(!activeThread.value)return 'Aucun terminal sélectionné.'
 if(bridge.status.value!=='connected')return 'Relais déconnecté. Instruction conservée, envoi indisponible.'
 if(bridge.agentStatus.value?.control?.mode==='observe')return 'Mode observation activé sur le PC. Envoi interdit.'
 if(!bridge.agentStatus.value?.control?.canControl)return 'Autorisations du PC non synchronisées. Actualise l’état de l’agent.'
 if(!activeThread.value.connected)return 'Cette fenêtre VS Code est hors ligne. Sélectionne une conversation active.'
 if(!bridge.selectedWindow.value?.connected || bridge.activeWindowId.value!==activeThread.value.windowId)
   return 'Fenêtre VS Code non sélectionnée. Rouvre la conversation active.'
 if(!selectedTerminalAvailable.value)
   return 'Terminal non retrouvé dans la fenêtre connectée.'
 if(bridge.projectTransition.value)return 'Changement de projet en cours. Envoi temporairement indisponible.'
 return ''
})
const canSend=computed(()=>!sendBlockReason.value)
function refreshControlStatus(){void bridge.fetchAgentStatus()}
function threadState(state:string,connected:boolean) { return !connected ? t('offline') : state==='attention_possible'?t('attention'):state==='running'?t('running'):state==='finished'?t('finished'):t('connected') }
function threadPreview(key:string,state:string){const entries=threadsHistory.value[key] ?? []; const last=entries.at(-1);return last?.kind==='output'?compactTerminalOutput(last.raw ?? last.text).display.slice(-90)||t('outputInProgress'):last?.text.slice(0,90)||threadState(state,true)}
function activeKey(){return activeThread.value?.key??''}
function addEntry(key:string,entry:Entry){
 if(!key)return
 const prior=threadsHistory.value[key]??[]
 const next=[...prior,entry].slice(-70)
 threadsHistory.value={...threadsHistory.value,[key]:next}
 saveLog(key)
 if(activeThread.value?.key===key && nearBottom.value)nextTick(scrollBottom)
}
function saveLog(key:string){
  if(!import.meta.client)return
  // Persist only the compact view. Raw terminal streams may contain secrets
  // and must not be copied into long-lived browser storage.
  const entries=(threadsHistory.value[key]??[]).slice(-70).map(({raw, ...entry})=>entry)
  try{localStorage.setItem('vb:mobile-thread:'+key,JSON.stringify(entries))}catch{}
}
function loadLog(key:string){if(!import.meta.client || threadsHistory.value[key])return;try{const parsed=JSON.parse(localStorage.getItem('vb:mobile-thread:'+key)||'[]') as Entry[];if(Array.isArray(parsed))threadsHistory.value={...threadsHistory.value,[key]:parsed.slice(-70)}}catch{}}
function openThread(item:Thread){if(item.connected)bridge.selectWindow(item.windowId);activeThread.value=item;loadLog(item.key);draft.value=localStorage.getItem('vb:mobile-draft:'+item.key)||'';nearBottom.value=true;nextTick(scrollBottom)}
function onTargetChange(e:Event){const key=(e.target as HTMLSelectElement).value; const next=allThreads.value.find(item=>item.key===key);if(next){saveDraft();openThread(next)}}
function saveDraft(){if(import.meta.client && activeThread.value)localStorage.setItem('vb:mobile-draft:'+activeThread.value.key,draft.value)}

type IndexedThread = Thread & { lastSeen: number; recoveredTo?: string }
const INDEX_LIMIT = 100

function threadIndexKey(): string {
  const session = bridge.relaySessionId.value || bridge.activeUrl.value
  const workspace = bridge.activeWorkspaceId.value || 'local'
  return 'vb:mobile-thread-index:'+JSON.stringify([session, workspace])
}

function readIndex(): Record<string, IndexedThread> {
  if (!import.meta.client || !bridge.token.value) return {}
  try {
    const records = JSON.parse(localStorage.getItem(threadIndexKey()) || '{}') as Record<string, IndexedThread>
    return records && typeof records === 'object' && !Array.isArray(records) ? records : {}
  } catch { return {} }
}

function hasSavedHistory(key:string): boolean {
  try {
    const entries=JSON.parse(localStorage.getItem('vb:mobile-thread:'+key)||'[]') as Entry[]
    return Array.isArray(entries) && entries.length>0
  } catch { return false }
}

function syncThreadArchive(threads:Thread[]): void {
  if (!import.meta.client || !bridge.token.value || !bridge.activeWorkspaceId.value) return
  const index=readIndex(), now=Date.now()
  for(const thread of threads){
    const prior=index[thread.key]
    index[thread.key]={...thread,lastSeen:thread.connected ? now : (prior?.lastSeen ?? now),recoveredTo:prior?.recoveredTo}
  }
  const live=threads.filter(thread=>thread.connected)
  for(const thread of live){
    if(hasSavedHistory(thread.key)) continue
    const oldKey=findRestorableThread(thread,Object.values(index),live,hasSavedHistory)
    if(!oldKey) continue
    const oldLog=localStorage.getItem('vb:mobile-thread:'+oldKey)
    if(!oldLog) continue
    // Only the display history is reused. Never carry over terminal routing IDs.
    localStorage.setItem('vb:mobile-thread:'+thread.key,oldLog)
    index[oldKey]!.recoveredTo=thread.key
    delete threadsHistory.value[thread.key]
    if(activeThread.value?.key===oldKey) activeThread.value=thread
  }
  const currentKeys=new Set(live.map(thread=>thread.key))
  const values=Object.values(index)
  archivedThreads.value=values
    .filter(item=>!item.connected || !currentKeys.has(item.key))
    .filter(item=>!currentKeys.has(item.key) && !item.recoveredTo && hasSavedHistory(item.key))
    .sort((a,b)=>b.lastSeen-a.lastSeen)
    .slice(0,INDEX_LIMIT)
    .map(({lastSeen,recoveredTo,...thread})=>({...thread,connected:false,state:'idle'}))
  // Do not cache credentials or terminal output here, only display identities.
  const retained=values.sort((a,b)=>b.lastSeen-a.lastSeen).slice(0,INDEX_LIMIT)
  try { localStorage.setItem(threadIndexKey(),JSON.stringify(Object.fromEntries(retained.map(item=>[item.key,item])))) } catch {}
  for(const archived of archivedThreads.value)loadLog(archived.key)
}

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
function openPreview(){
  closeSheets()
  if(!activeThread.value)return
  bridge.selectWindow(activeThread.value.windowId)
  previewWindowId.value=activeThread.value.windowId
  previewError.value=''
  previewImage.value=''
  previewOpen.value=true
}
function closePreview(){
  previewOpen.value=false
  previewBusy.value=false
  if(previewTimeout){clearTimeout(previewTimeout);previewTimeout=null}
}
function requestPreview(){
  const port=Number(previewPort.value)
  if(!previewOpen.value || previewBusy.value || !activeThread.value)return
  if(!Number.isInteger(port)||port<1024||port>65535){
    previewError.value=lang.value==='fr'?'Port invalide.':'Invalid port.'
    return
  }
  if(!activeThread.value.connected || !bridge.agentStatus.value?.control?.canControl){
    previewError.value=lang.value==='fr'?'Contrôle distant indisponible.':'Remote control unavailable.'
    return
  }
  bridge.selectWindow(activeThread.value.windowId)
  previewWindowId.value=activeThread.value.windowId
  previewError.value=''
  previewImage.value=''
  if(!bridge.send({type:'preview_capture',port,device:previewDevice.value})){
    previewError.value=lang.value==='fr'?'Demande non envoyée. Vérifie la connexion et les autorisations.':'Request not sent. Check connection and permissions.'
    return
  }
  previewBusy.value=true
  if(previewTimeout)clearTimeout(previewTimeout)
  previewTimeout=setTimeout(()=>{
    if(previewBusy.value){
      previewBusy.value=false
      previewError.value=lang.value==='fr'?'Réception non confirmée. Pas de nouvel envoi automatique.':'Receipt unconfirmed. No automatic retry.'
    }
  },30000)
}
function closeSheets(){menuOpen.value=false;actionsOpen.value=false;projectsOpen.value=false}
function showProjectPicker(){closeSheets();projectsOpen.value=true;availableProjects.value=[];if(bridge.status.value==='connected')bridge.send({type:'list_projects'})}
function chooseWindow(windowId:string){const next=allThreads.value.find(item=>item.windowId===windowId);closeSheets();if(next)openThread(next);else bridge.selectWindow(windowId)}
function openProject(path:string){closeSheets();bridge.requestOpenProject(path,true)}
function openAdvancedSettings(){closeSheets();void navigateTo('/settings')}
function signOut(){closeSheets();bridge.clearStoredSession();void navigateTo('/setup')}
function requestWindowClose(){if(!activeThread.value?.connected || !bridge.agentStatus.value?.control?.allowWindowClose)return;confirmClose.value=false;if(bridge.send({type:'close_window'})){activeThread.value=null}}
async function revokeAccess(){revoking.value=true;revokeError.value=false;const success=await bridge.revokeRelaySession();revoking.value=false;if(success){confirmRevoke.value=false;void navigateTo('/setup')}else revokeError.value=true}
const off=bridge.onMessage((msg:WsMessage)=>{
 if(msg.type==='preview_capture_result' && previewOpen.value && previewBusy.value
   && msg.windowId===previewWindowId.value){
    previewBusy.value=false
    if(previewTimeout){clearTimeout(previewTimeout);previewTimeout=null}
    if(msg.success===true && typeof msg.image==='string' && msg.image.length<=700000){
      previewImage.value='data:image/png;base64,'+msg.image
      previewError.value=''
    }else{
      const reason=String(msg.error??'preview_failed')
      const labels:Record<string,string>={
        preview_port_not_authorized_on_pc:'Port non autorisé dans les paramètres Utilisateur VS Code.',
        playwright_not_installed_on_pc:'Playwright absent sur le PC.',
        playwright_chromium_not_installed:'Chromium Playwright absent sur le PC.',
        preview_capture_failed:'Capture impossible. Vérifie le serveur local et WSL.',
        preview_busy:'Une capture est déjà en cours.'
      }
      previewError.value=labels[reason]??reason
    }
    return
 }
 if(msg.type==='projects_list'){
  const payload=msg.payload && typeof msg.payload==='object'?msg.payload as {projects?:Project[]}: {}
  const projects=Array.isArray(msg.projects)?msg.projects as Project[]:payload.projects
  availableProjects.value=Array.isArray(projects)?projects:[]
  return
 }
 if((msg.type==='terminal_created' || msg.type==='cli_started') && msg.terminalId){
  pendingTerminalId.value=String(msg.terminalId)
 }
})

const offTerminal=bridge.onWorkspaceTerminalMessage((msg:WsMessage)=>{
 const thread=routeTerminalEvent(msg,allThreads.value)
 if(!thread)return
 const key=thread.key
 loadLog(key)
 if(msg.type==='output' && typeof msg.text==='string'){
  const tool=String(msg.tool??'')
  if(tool && tool!=='terminal:'+thread.terminalId)return
  const prior=threadsHistory.value[key]??[]
  const last=prior.at(-1)
  // A continuous CLI stream is *one* message, not a new bubble per PTY chunk.
  if(last?.kind==='output' && Date.now()-last.ts<120000){
   const raw=((last.raw??'')+msg.text).slice(-20000)
   const next=[...prior.slice(0,-1),{...last,raw,text:compactTerminalOutput(raw).display,working:compactTerminalOutput(raw).working,ts:Date.now()}]
   threadsHistory.value={...threadsHistory.value,[key]:next};saveLog(key);if(activeThread.value?.key===key && nearBottom.value)nextTick(scrollBottom)
  }else{
   const raw=msg.text
   addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'output',raw,text:compactTerminalOutput(raw).display,working:true})
  }
 }else if(msg.type==='ide_event' && typeof msg.kind==='string' && String(msg.terminalId??'')===thread.terminalId){
  if(msg.kind==='terminal_command_started')addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',text:t('commandStarted')})
  if(msg.kind==='terminal_command_finished'){const prior=threadsHistory.value[key]??[];const last=prior.at(-1);if(last?.kind==='output'){threadsHistory.value={...threadsHistory.value,[key]:[...prior.slice(0,-1),{...last,working:false}]};saveLog(key)}addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',text:t('commandFinished')})}
 }else if(msg.type==='notification' && (!msg.terminalId || String(msg.terminalId)===thread.terminalId)){
  addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',text:t('attentionPossible')})
 }else if(msg.type==='command_execution' && (!msg.terminalId || msg.terminalId===thread.terminalId)){
   const action=String(msg.action??'action')
   const phase=String(msg.phase??'')
   if(phase==='dispatched')addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',
     text:lang.value==='fr' ? action+' transmis à VS Code. Résultat CLI non confirmé.' : action+' sent to VS Code. CLI outcome not confirmed.'})
   if(phase==='rejected')addEntry(key,{id:crypto.randomUUID(),ts:Date.now(),kind:'status',
     text:(lang.value==='fr' ? 'Action refusée : ' : 'Action rejected: ')+String(msg.reason??'unknown')})
 }
})

onMounted(()=>{
  const stored = localStorage.getItem('vb:mobile-language')
  if(stored==='fr'||stored==='en')lang.value=stored
  else lang.value=navigator.language.toLowerCase().startsWith('fr')?'fr':'en'
  syncThreadArchive(allThreads.value)
  for(const thread of allThreads.value)loadLog(thread.key)
})
watch(lang,value=>{if(import.meta.client)localStorage.setItem('vb:mobile-language',value)})
watch([()=>bridge.status.value,()=>bridge.activeWorkspaceId.value],([connection,workspace])=>{
  if(connection==='connected' && workspace && !bridge.agentStatus.value?.control) {
    void bridge.fetchAgentStatus()
  }
},{immediate:true})
watch(allThreads,(threads)=>{
  syncThreadArchive(threads)
  for(const thread of threads)loadLog(thread.key)
  if(pendingTerminalId.value){
    const created=threads.find(thread=>thread.windowId===bridge.activeWindowId.value && thread.terminalId===pendingTerminalId.value)
    if(created){pendingTerminalId.value='';openThread(created)}
  }
  if(activeThread.value){
    const updated=[...threads,...archivedThreads.value].find(thread=>thread.key===activeThread.value?.key)
    if(updated)activeThread.value=updated
  }
  const focusWindow=String(route.query.focusWindow??'')
  const focusTerminal=String(route.query.focusTerminal??'')
  if(focusWindow && focusTerminal){
    const target=threads.find(thread=>thread.windowId===focusWindow && thread.terminalId===focusTerminal)
    if(target)openThread(target)
  }
},{immediate:true})
onUnmounted(()=>{off();offTerminal();if(previewTimeout)clearTimeout(previewTimeout)})
useHead({title:'DevBridge | Conversations'})
</script>

<style scoped>
/*
 * DevBridge mobile / visual parity with the desktop app.
 * All colors reuse tokens from assets/css/main.css.
 * Monospace UI, Unbounded display headings, technical labels, thin outlines
 * and small corners. Navigation and interaction behaviour remain unchanged.
 */
.mb-root{
  --mb-radius:2px;
  --mb-border:1px solid var(--border);
  --mb-outline:1px solid var(--border-bright);
  height:100dvh;
  max-width:900px;
  margin:0 auto;
  position:relative;
  overflow:hidden;
  isolation:isolate;
  background:var(--bg);
  color:var(--text);
  font-family:"DM Mono","Courier New",monospace;
  font-size:12px;
  line-height:1.55;
}
.mb-root::before{
  content:"";
  position:absolute;
  inset:0;
  z-index:-1;
  pointer-events:none;
  background:var(--panel-glow);
  opacity:.34;
}
.mb-root button,
.mb-root input,
.mb-root select,
.mb-root textarea{
  font:inherit;
  color:inherit;
}
.mb-root button{cursor:pointer}
.mb-root button:disabled{cursor:not-allowed}
.mb-root button:focus-visible,
.mb-root input:focus-visible,
.mb-root select:focus-visible,
.mb-root textarea:focus-visible{
  outline:2px solid var(--accent);
  outline-offset:2px;
}
.mb-inbox,.mb-chat{
  height:100%;
  min-height:0;
  display:flex;
  flex-direction:column;
}

/* Identity and connection status */
.mb-heading{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:16px;
  padding:calc(22px + env(safe-area-inset-top)) 20px 15px;
  border-bottom:var(--mb-border);
}
.mb-heading-copy{min-width:0}
.mb-brand{
  display:flex;
  align-items:center;
  gap:8px;
  color:var(--muted);
  font-size:9px;
  letter-spacing:.15em;
  text-transform:uppercase;
  white-space:nowrap;
}
.mb-brand-name{
  color:var(--text);
  font-family:"Unbounded",sans-serif;
  font-size:11px;
  font-weight:300;
  letter-spacing:.23em;
}
.mb-brand-divider{color:var(--border-bright)}
.mb-heading h1{
  font-family:"Unbounded",sans-serif;
  font-size:21px;
  font-weight:300;
  line-height:1.5;
  letter-spacing:-.055em;
  margin:9px 0 0;
}
.mb-eyebrow,.mb-subline{
  font-size:9px;
  text-transform:uppercase;
  letter-spacing:.15em;
  color:var(--muted);
}
.mb-iconbtn,.mb-back{
  display:grid;
  place-items:center;
  flex:0 0 auto;
  width:44px;
  height:44px;
  background:var(--surface);
  color:var(--text);
  border:var(--mb-outline);
  border-radius:var(--mb-radius);
  font-family:"DM Mono",monospace;
  font-size:23px;
  line-height:1;
  transition:background 160ms,border-color 160ms;
}
.mb-iconbtn:hover,.mb-back:hover{border-color:var(--text);background:var(--surface2)}
.mb-status{
  display:flex;
  align-items:center;
  gap:9px;
  padding:12px 20px;
  border-bottom:var(--mb-border);
  background:color-mix(in srgb,var(--surface) 52%,transparent);
  color:var(--text-mid);
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.08em;
}
.mb-status small{
  margin-left:auto;
  font-size:10px;
  color:var(--muted);
  letter-spacing:.04em;
  white-space:nowrap;
}
.mb-dot{
  display:inline-block;
  flex:0 0 auto;
  width:7px;
  height:7px;
  border-radius:50%;
  background:var(--dot-amber);
}
.mb-dot.connected{background:var(--dot-green)}
.mb-dot.disconnected{background:var(--dot-red)}
.mb-dot.small{width:7px;height:7px}

.mb-send-block{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px;font-size:10px;line-height:1.5;color:var(--dot-amber);padding:8px 11px;border:1px solid var(--border)}
.mb-send-block button{flex-shrink:0;text-decoration:underline;color:var(--text);font-size:10px}
.mb-reselect-terminal{display:block;margin:10px auto 0;padding:9px 12px;border:1px solid var(--border-bright);color:var(--text);font-size:11px;letter-spacing:.04em}
/* Search, filters, grouped conversations */
.mb-archive-toggle{width:calc(100% - 38px);margin:12px 19px;padding:12px 14px;display:block;text-align:left;border:1px solid var(--border-bright);font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:var(--text-mid);background:var(--surface)}
.mb-archive-toggle:hover{color:var(--text);border-color:var(--text-mid)}

.mb-search{
  display:flex;
  align-items:center;
  gap:12px;
  height:45px;
  margin:15px 20px 12px;
  padding:0 14px;
  color:var(--muted);
  background:var(--surface);
  border:var(--mb-border);
  border-radius:var(--mb-radius);
  font-size:17px;
}
.mb-search:focus-within{border-color:var(--accent)}
.mb-search input{width:100%;min-width:0;outline:none;background:transparent;color:var(--text);font-size:12px}
.mb-search input::placeholder,.mb-type-row textarea::placeholder{color:var(--dimmed);opacity:1}
.mb-filters{
  display:flex;
  gap:0;
  padding:0 20px 14px;
  overflow-x:auto;
}
.mb-filters button{
  flex:0 0 auto;
  min-height:38px;
  padding:8px 11px;
  margin-right:-1px;
  border:var(--mb-border);
  background:transparent;
  color:var(--muted);
  font-size:9px;
  text-transform:uppercase;
  letter-spacing:.10em;
  white-space:nowrap;
}
.mb-filters button.selected{
  position:relative;
  z-index:1;
  border-color:var(--text);
  background:var(--text);
  color:var(--bg);
}
.mb-list{
  flex:1;
  min-height:0;
  overflow-y:auto;
  padding-bottom:100px;
}
.mb-group{
  display:flex;
  justify-content:space-between;
  align-items:center;
  gap:8px;
  padding:17px 20px 10px;
  border-top:var(--mb-border);
  color:var(--muted);
  font-size:9px;
  line-height:1.5;
  letter-spacing:.20em;
  text-transform:uppercase;
}
.mb-conversation{
  width:100%;
  min-height:86px;
  display:flex;
  align-items:center;
  gap:14px;
  padding:13px 20px;
  text-align:left;
  border-top:1px solid color-mix(in srgb,var(--border) 80%,transparent);
  color:var(--text);
  background:color-mix(in srgb,var(--surface) 30%,transparent);
  transition:background 160ms;
}
.mb-conversation:last-child{border-bottom:var(--mb-border)}
.mb-conversation:hover,.mb-conversation:active,.mb-sheet-action:active{
  background:var(--surface2);
}
.mb-avatar{
  display:grid;
  place-items:center;
  width:44px;
  height:44px;
  flex:0 0 44px;
  background:var(--surface);
  border:var(--mb-outline);
  border-radius:var(--mb-radius);
  color:var(--accent);
  font-size:23px;
  font-family:"DM Mono",monospace;
}
.mb-conversation-body{min-width:0;flex:1}
.mb-conversation-top{display:flex;align-items:center;justify-content:space-between;gap:10px}
.mb-conversation-top strong{
  min-width:0;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:12px;
  font-weight:500;
  letter-spacing:.01em;
}
.mb-conversation-body p{
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:var(--text-mid);
  margin:6px 0 4px;
  font-size:11px;
}
.mb-conversation-body small{
  color:var(--muted);
  font-size:9px;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.mb-conversation-body small.mb-attention{color:var(--dot-amber)}
.mb-chevron{flex:0 0 auto;color:var(--dimmed);font-size:22px}
.mb-add{
  position:absolute;
  right:20px;
  bottom:max(20px,env(safe-area-inset-bottom));
  min-height:46px;
  padding:12px 16px;
  background:var(--text);
  border:1px solid var(--text);
  border-radius:var(--mb-radius);
  color:var(--bg)!important;
  font-size:10px;
  font-weight:500;
  text-transform:uppercase;
  letter-spacing:.11em;
  box-shadow:var(--shadow);
}
.mb-add:hover{background:var(--accent);border-color:var(--accent)}
.mb-empty{
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:12px;
  padding:55px 26px;
  text-align:center;
  color:var(--text-mid);
}
.mb-empty strong{color:var(--text);font-size:12px;font-weight:500}
.mb-empty p{font-size:11px;line-height:1.8;max-width:340px}
.mb-empty-icon{font-size:27px;color:var(--accent)}

/* Conversation view */
.mb-chatbar{
  display:flex;
  align-items:center;
  gap:11px;
  flex:0 0 auto;
  min-height:68px;
  padding:calc(10px + env(safe-area-inset-top)) 14px 10px;
  border-bottom:var(--mb-border);
  background:color-mix(in srgb,var(--bg) 88%,transparent);
}
.mb-back{width:36px;height:42px;font-size:28px;background:transparent;border:0}
.mb-chat-heading{min-width:0;flex:1}
.mb-chat-heading strong{
  display:block;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  font-size:12px;
  font-weight:500;
}
.mb-chat-heading small{
  display:block;
  margin-top:3px;
  overflow:hidden;
  text-overflow:ellipsis;
  white-space:nowrap;
  color:var(--muted);
  font-size:10px;
}
.mb-context{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding:10px 17px;
  border-bottom:var(--mb-border);
  background:var(--surface);
  color:var(--muted);
  font-size:9px;
  letter-spacing:.08em;
  text-transform:uppercase;
}
.mb-context span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mb-context-brand{color:var(--text);letter-spacing:.15em}
.mb-alert{
  padding:12px 18px;
  background:var(--surface2);
  border-bottom:1px solid var(--dot-amber);
  color:var(--dot-amber);
  font-size:11px;
  line-height:1.6;
}
.mb-messages{
  flex:1;
  min-height:0;
  display:flex;
  flex-direction:column;
  gap:19px;
  overflow-y:auto;
  padding:21px 16px 25px;
  scroll-behavior:smooth;
}
.mb-empty-chat{margin:auto}
.mb-bubble-row.user{
  align-self:flex-end;
  display:flex;
  flex-direction:column;
  align-items:flex-end;
  gap:6px;
  max-width:92%;
}
.mb-user-bubble{
  padding:12px 14px;
  border:1px solid var(--border-bright);
  border-radius:var(--mb-radius);
  border-right:2px solid var(--text);
  background:var(--surface2);
  color:var(--text);
  font-size:12px;
  line-height:1.8;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
}
.mb-bubble-row time,.mb-system time{color:var(--dimmed);font-size:9px}
.mb-system{
  align-self:center;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:8px;
  max-width:100%;
  padding:5px 10px;
  border:var(--mb-border);
  background:var(--surface);
  color:var(--muted);
  font-size:9px;
  line-height:1.6;
  text-align:center;
}
.mb-system-mark{color:var(--accent)}
.mb-system time{display:none}
.mb-output-card{
  max-width:100%;
  padding:14px;
  background:var(--surface);
  border:var(--mb-border);
  border-left:2px solid var(--accent);
  border-radius:var(--mb-radius);
  box-shadow:none;
}
.mb-output-header{
  display:flex;
  align-items:center;
  gap:10px;
  margin-bottom:13px;
  padding-bottom:10px;
  border-bottom:var(--mb-border);
}
.mb-output-header strong{flex:1;min-width:0;font-size:11px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mb-output-time{color:var(--muted);font-size:9px}
.mb-output-badge{
  flex:0 0 27px;
  display:grid;
  place-items:center;
  width:27px;height:27px;
  background:var(--surface2);
  border:var(--mb-border);
  border-radius:var(--mb-radius);
  color:var(--accent);
  font-size:17px;
}
.mb-working{display:flex;align-items:center;gap:9px;margin-bottom:11px;color:var(--text-mid);font-size:10px}
.mb-pulse{
  flex:0 0 7px;
  width:7px;height:7px;
  background:var(--dot-amber);
  border-radius:50%;
  animation:mb-blink 1.3s ease-in-out infinite;
}
@keyframes mb-blink{50%{opacity:.25}}
.mb-output-text{
  max-height:330px;
  overflow:auto;
  color:var(--text);
  font-size:11px;
  line-height:1.8;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
  word-break:break-word;
}
.mb-muted{color:var(--muted);font-size:11px;line-height:1.7}
.mb-inline{
  display:inline-flex;
  gap:8px;
  margin-top:12px;
  color:var(--accent);
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.06em;
}
.mb-raw{
  max-height:330px;
  overflow:auto;
  padding:12px;
  margin-top:10px;
  border:var(--mb-border);
  background:var(--bg);
  color:var(--text-mid);
  font-size:10px;
  line-height:1.6;
  white-space:pre-wrap;
  overflow-wrap:anywhere;
}
.mb-output-footer{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  padding-top:12px;
  margin-top:13px;
  border-top:var(--mb-border);
  color:var(--muted);
  font-size:9px;
}
.mb-output-footer button{flex:0 0 auto;color:var(--accent);text-transform:uppercase;letter-spacing:.05em;font-size:9px}
.mb-new-messages{
  position:absolute;
  right:16px;
  bottom:155px;
  padding:9px 12px;
  border:var(--mb-outline);
  border-radius:var(--mb-radius);
  background:var(--surface2);
  color:var(--text);
  font-size:10px;
  box-shadow:var(--shadow);
}

/* Target picker and input stay fixed at the bottom */
.mb-composer{
  flex:0 0 auto;
  padding:10px 12px max(12px,env(safe-area-inset-bottom));
  border-top:var(--mb-border);
  background:color-mix(in srgb,var(--bg) 95%,transparent);
}
.mb-target{
  display:flex;
  align-items:center;
  gap:9px;
  padding:0 3px 10px;
  color:var(--muted);
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.09em;
}
.mb-target select{
  flex:1;
  min-width:0;
  min-height:39px;
  padding:8px 9px;
  border:var(--mb-border);
  border-radius:var(--mb-radius);
  background:var(--surface);
  color:var(--text);
  font-size:11px;
}
.mb-target button{
  display:grid;
  place-items:center;
  flex:0 0 39px;
  width:39px;height:39px;
  border:var(--mb-border);
  border-radius:var(--mb-radius);
  background:var(--surface);
  color:var(--text);
  font-size:19px;
}
.mb-type-row{display:flex;gap:8px}
.mb-type-row textarea{
  flex:1;
  min-width:0;
  min-height:46px;
  max-height:120px;
  padding:12px;
  resize:none;
  outline:none;
  border:var(--mb-border);
  border-radius:var(--mb-radius);
  background:var(--surface);
  color:var(--text);
  font-size:12px;
  line-height:1.5;
}
.mb-type-row textarea:focus{border-color:var(--accent)}
.mb-send{
  flex:0 0 46px;
  width:46px;min-height:46px;
  border:1px solid var(--text);
  border-radius:var(--mb-radius);
  background:var(--text);
  color:var(--bg)!important;
  font-size:22px!important;
}
.mb-send:disabled{opacity:.35}
.mb-subline{display:block;text-align:center;margin-top:8px;letter-spacing:.05em;text-transform:none}

/* Sheets and confirmation surfaces */
.mb-overlay{
  position:absolute;
  inset:0;
  z-index:80;
  display:flex;
  align-items:flex-end;
  justify-content:center;
  background:rgba(0,0,0,.68);
}
.mb-sheet{
  width:100%;
  max-height:83%;
  overflow-y:auto;
  padding:15px 19px max(22px,env(safe-area-inset-bottom));
  background:var(--surface);
  border:var(--mb-outline);
  border-radius:var(--mb-radius);
}
.mb-sheet-handle{width:40px;height:3px;margin:0 auto 18px;background:var(--border-bright)}
.mb-sheet h2,.mb-confirm h2{
  margin-bottom:14px;
  font-family:"Unbounded",sans-serif;
  font-size:15px;
  line-height:1.6;
  font-weight:300;
  letter-spacing:-.04em;
}
.mb-sheet-action{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  width:100%;
  min-height:49px;
  padding:14px 4px;
  border-bottom:var(--mb-border);
  background:transparent;
  color:var(--text);
  text-align:left;
  font-size:11px;
}
.mb-sheet-action small{color:var(--muted)}
.mb-sheet-action.danger,.mb-error{color:var(--dot-red)}
.mb-sheet-dismiss{
  width:100%;
  min-height:44px;
  padding:12px;
  margin-top:11px;
  border:var(--mb-border);
  background:var(--bg);
  color:var(--muted);
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.1em;
}
.mb-confirm{
  width:calc(100% - 36px);
  max-width:440px;
  margin:auto;
  padding:23px;
  border:var(--mb-outline);
  border-radius:var(--mb-radius);
  background:var(--surface);
}
.mb-confirm p{color:var(--text-mid);font-size:11px;line-height:1.8}
.mb-revoke-btn{
  width:100%;
  min-height:45px;
  padding:13px;
  margin-top:18px;
  border:1px solid var(--dot-red);
  border-radius:var(--mb-radius);
  background:var(--dot-red);
  color:var(--bg)!important;
  font-size:10px;
  font-weight:500;
  text-transform:uppercase;
  letter-spacing:.07em;
}
.mb-revoke-btn:disabled{opacity:.5}

/* Local Playwright preview stays visually part of the same app */
.mb-preview-sheet{
  display:flex;
  flex-direction:column;
  gap:14px;
  width:100%;
  max-width:900px;
  height:min(88dvh,850px);
  padding:20px 17px max(19px,env(safe-area-inset-bottom));
  overflow-y:auto;
  background:var(--surface);
  border:var(--mb-outline);
  border-radius:var(--mb-radius);
}
.mb-preview-top{display:flex;align-items:center;justify-content:space-between;gap:15px}
.mb-preview-top h2{
  font-family:"Unbounded",sans-serif;
  font-size:16px;
  font-weight:300;
}
.mb-preview-top small{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.1em}
.mb-preview-hint{font-size:10px;line-height:1.7;color:var(--muted)}
.mb-preview-error{font-size:11px;color:var(--dot-red)}
.mb-preview-controls{display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.mb-preview-controls label{font-size:10px;color:var(--muted);text-transform:uppercase}
.mb-preview-controls input,.mb-preview-controls select{
  min-height:43px;
  padding:10px;
  border:var(--mb-border);
  border-radius:var(--mb-radius);
  background:var(--bg);
  color:var(--text);
  font-size:11px;
}
.mb-preview-controls input{width:94px}
.mb-preview-controls select{flex:1;min-width:115px}
.mb-preview-request{
  min-height:45px;
  padding:13px 16px;
  border:1px solid var(--text);
  border-radius:var(--mb-radius);
  background:var(--text);
  color:var(--bg)!important;
  font-size:10px;
  text-transform:uppercase;
  letter-spacing:.1em;
}
.mb-preview-request:disabled{opacity:.4}
.mb-preview-image{
  display:flex;
  justify-content:center;
  max-height:48dvh;
  overflow:auto;
  background:var(--bg);
  border:var(--mb-border);
  border-radius:var(--mb-radius);
}
.mb-preview-image img{align-self:flex-start;max-width:100%;height:auto;object-fit:contain}
.mb-preview-placeholder{
  padding:40px 15px;
  border:1px dashed var(--border-bright);
  border-radius:var(--mb-radius);
  background:var(--bg);
  color:var(--muted);
  font-size:11px;
  line-height:2;
  text-align:center;
}

@media(min-width:768px){
  .mb-root{border-left:var(--mb-border);border-right:var(--mb-border)}
  .mb-heading{padding-left:26px;padding-right:26px}
  .mb-conversation{padding-left:26px;padding-right:26px}
}
@media(max-width:360px){
  .mb-heading{padding-left:14px;padding-right:14px}
  .mb-heading h1{font-size:19px}
  .mb-brand{font-size:8px;gap:6px}
  .mb-status{padding-left:14px;padding-right:14px}
  .mb-search{margin-left:14px;margin-right:14px}
  .mb-filters{padding-left:14px;padding-right:14px}
  .mb-conversation{padding-left:14px;padding-right:14px}
  .mb-group{padding-left:14px;padding-right:14px}
  .mb-add{right:14px}
}
@media(prefers-reduced-motion:reduce){
  .mb-pulse{animation:none}
  .mb-messages{scroll-behavior:auto}
  .mb-conversation,.mb-iconbtn,.mb-back{transition:none}
}
</style>
