<template>
  <div class="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3rem)]">
    <!-- TOOLBAR -->
    <div class="flex items-center justify-between border-b border-border px-4 py-2 shrink-0">
      <p class="text-xs uppercase tracking-widest text-muted">CHAT IA</p>
      <div class="flex items-center gap-3">
        <StatusDot :state="bridge.status.value" />
        <button
          class="text-xs text-muted hover:text-text transition-colors uppercase tracking-widest"
          @click="clearChat"
        >
          EFFACER
        </button>
      </div>
    </div>

    <div class="shrink-0 border-b border-border px-4 py-2">
      <WorkspaceSwitcher
        :workspaces="relayWorkspaceOptions"
        :active-workspace-id="activeWorkspaceKey"
        :projects="projects"
        :loading-projects="loadingProjects"
        :project-opening="projectOpening"
        @select="bridge.setActiveWorkspace"
        @open-project="requestOpenProject"
        @request-projects="requestOpenProject"
        @open-listed-project="openListedProject"
      />
    </div>

    <!-- AUTH ERROR BANNER -->
    <div
      v-if="bridge.authError.value"
      class="shrink-0 flex items-center justify-between px-4 py-2 text-xs uppercase tracking-widest"
      style="background:rgba(239,68,68,0.12);border-bottom:1px solid var(--dot-red);color:var(--dot-red)"
    >
      <span>QR expiré — scannez à nouveau</span>
      <button class="ml-4 underline" @click="bridge.clearStoredSession()">Effacer</button>
    </div>

    <!-- TARGET SELECTOR -->
    <div class="shrink-0 border-b border-border px-3 py-2">
      <div class="flex gap-1.5 overflow-x-auto">
        <button
          v-for="target in chatTargets"
          :key="target.id"
          :disabled="target.state === 'starting'"
          class="shrink-0 text-[10px] uppercase tracking-[0.14em] px-3 py-1.5 font-mono transition-colors disabled:pointer-events-none"
          :style="targetButtonStyle(target)"
          @click="selectChatTarget(target)"
        >
          {{ targetButtonLabel(target) }}
        </button>
      </div>
    </div>

    <!-- MESSAGE LIST -->
    <div ref="scrollEl" class="flex-1 overflow-y-auto p-4 space-y-3">
      <template v-if="messages.length">
        <ChatBubble
          v-for="m in messages"
          :key="m.id"
          :text="m.text"
          :direction="m.direction"
          :tool="m.tool"
          :ts="m.ts"
        />
      </template>
      <p v-else class="text-dimmed text-xs text-center mt-8 uppercase tracking-widest">
        — AUCUN MESSAGE —
      </p>
      <TypingIndicator v-if="aiTyping" :tool="currentTool ?? undefined" />
    </div>

    <!-- INPUT BAR -->
    <div class="shrink-0 border-t border-border p-3">
      <div class="flex gap-2 items-end">
        <textarea
          ref="inputEl"
          v-model="draft"
          :rows="1"
          placeholder="MESSAGE…"
          class="flex-1 bg-surface border border-border text-text text-sm px-3 py-2 font-mono resize-none focus:outline-none focus:border-text max-h-40 overflow-auto"
          @keydown.enter.exact.prevent="sendMessage"
          @input="autoResize"
        />
        <!-- Mic button -->
        <button
          :class="recording ? 'border-dot-amber text-dot-amber' : 'border-border text-muted hover:text-text'"
          class="border px-3 py-2 text-sm transition-colors"
          @click="toggleRecording"
        >
          ◎
        </button>
        <!-- Send button -->
        <button
          :disabled="!draft.trim() || bridge.status.value !== 'connected' || !selectedTargetReady"
          class="border border-text text-text text-xs uppercase tracking-widest px-4 py-2 hover:bg-surface2 disabled:opacity-30 transition-colors"
          @click="sendMessage"
        >
          ▶
        </button>
      </div>
      <p v-if="recording" class="text-dot-amber text-xs mt-1 uppercase tracking-widest">
        ● ÉCOUTE EN COURS…
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WsMessage } from '~/composables/useDevBridge'
import { loadWorkspaceChatHistory, saveWorkspaceChatHistory } from '~/composables/useWorkspaceChatHistory'

const REPLY_TARGET_KEY = 'vb:chatTarget'

interface ChatMessage {
  id: string
  text: string
  direction: 'user' | 'ai'
  tool?: string
  ts: number
}

interface ProjectItem {
  name: string
  path: string
  isActive: boolean
}

const bridge = useDevBridge()
const activeWorkspaceKey = computed(() => bridge.mode.value === 'relay' ? (bridge.activeWorkspaceId.value || 'default') : 'local')
const relayWorkspaceOptions = computed(() => bridge.mode.value === 'relay'
  ? bridge.relayWorkspaces.value
  : [{ id: 'local', name: 'Workspace local', active: true }])

// CLI state — synced from WS broadcast
interface CliItem { id: string; name: string; command: string; detected: boolean; isDefault: boolean }
const cliList = ref<CliItem[]>([])
const cliLaunching = ref<Record<string, boolean>>({})

type ChatTargetState = 'idle' | 'starting' | 'active'

interface ChatTarget {
  id: string
  label: string
  terminalName?: string
  state: ChatTargetState
}

// Target (synced with index.vue via localStorage)
const replyTarget = ref(
  import.meta.client ? (localStorage.getItem(REPLY_TARGET_KEY) ?? 'bash') : 'bash'
)

const ideState = computed(() => bridge.agentStatus.value?.ideState ?? null)
const terminals = computed(() =>
  Array.isArray(ideState.value?.terminals) ? ideState.value!.terminals! : []
)

const chatTargets = computed<ChatTarget[]>(() => {
  const list: ChatTarget[] = [
    { id: 'bash', label: 'BASH', terminalName: 'bash', state: replyTarget.value === 'bash' ? 'active' : 'idle' },
  ]
  for (const cli of cliList.value) {
    const terminalName = `DevBridge ${cli.name}`
    const isLaunched = terminals.value.some(t => String((t as { name?: string }).name ?? '') === terminalName)
    const isStarting = Boolean(cliLaunching.value[cli.id])
    list.push({
      id: cli.id,
      label: cliButtonName(cli),
      terminalName,
      state: isStarting ? 'starting' : (replyTarget.value === cli.id && isLaunched ? 'active' : 'idle'),
    })
  }
  return list
})

function launchCli(cliId: string) {
  if (cliLaunching.value[cliId]) return
  cliLaunching.value[cliId] = true
  bridge.send({ type: 'start_cli', cliId })
  setTimeout(() => { cliLaunching.value[cliId] = false }, 5_000)
}

function setTarget(id: string) {
  replyTarget.value = id
  if (import.meta.client) localStorage.setItem(REPLY_TARGET_KEY, id)
}

function selectChatTarget(target: ChatTarget) {
  if (target.id === 'bash') {
    setTarget('bash')
    return
  }
  if (target.state === 'starting') return
  setTarget(target.id)
  const cli = cliList.value.find(item => item.id === target.id)
  const isLaunched = target.terminalName
    ? terminals.value.some(t => String((t as { name?: string }).name ?? '') === target.terminalName)
    : false
  if (!cli || isLaunched) return
  launchCli(target.id)
}

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const aiTyping = ref(false)
const currentTool = ref<string | null>(null)
const recording = ref(false)
const scrollEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)
const projects = ref<ProjectItem[]>([])
const loadingProjects = ref(false)
const projectOpening = ref<Record<string, string>>({})

function nowTs() { return Date.now() }

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

function sendMessage() {
  const text = draft.value.trim()
  if (!text || bridge.status.value !== 'connected' || !selectedTargetReady.value) return
  messages.value.push({ id: Date.now().toString(), text, direction: 'user', ts: nowTs() })
  saveWorkspaceChatHistory(activeWorkspaceKey.value, messages.value)
  bridge.send({ type: 'message', text, target: replyTarget.value, sendEnter: true })
  draft.value = ''
  aiTyping.value = true
  if (inputEl.value) { inputEl.value.style.height = 'auto' }
  scrollToBottom()
}

function clearChat() {
  messages.value = []
  saveWorkspaceChatHistory(activeWorkspaceKey.value, messages.value)
}

function requestOpenProject() {
  loadingProjects.value = true
  bridge.send({ type: 'list_projects' })
}

function openListedProject(payload: { path: string; newWindow: boolean }) {
  projectOpening.value[payload.path] = payload.newWindow ? 'parallel' : 'replace'
  bridge.send({ type: 'open_project', path: payload.path, newWindow: payload.newWindow })
  setTimeout(() => { delete projectOpening.value[payload.path] }, 4_000)
}

function autoResize(e: Event) {
  const el = e.target as HTMLTextAreaElement
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

// Speech recognition — types guarded for cross-browser compat
type AnySpeechRecognition = { new(): { lang: string; continuous: boolean; interimResults: boolean; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; start(): void; stop(): void } }
let recognition: ReturnType<AnySpeechRecognition['prototype']['constructor']> | null = null

function toggleRecording() {
  if (!recording.value) {
    const w = window as unknown as { SpeechRecognition?: AnySpeechRecognition; webkitSpeechRecognition?: AnySpeechRecognition }
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition
    if (!SR) return
    recognition = new SR()
    recognition.lang = 'fr-FR'
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => {
      draft.value += (e.results[0] as ArrayLike<{ transcript: string }>)[0].transcript
    }
    recognition.onend = () => { recording.value = false }
    recognition.start()
    recording.value = true
  } else {
    recognition?.stop()
    recording.value = false
  }
}

// WS messages
const offMessage = bridge.onMessage((msg: WsMessage) => {
  if (bridge.mode.value === 'relay') {
    const msgWorkspaceId = typeof msg.workspaceId === 'string' ? msg.workspaceId : ''
    if (msgWorkspaceId && msgWorkspaceId !== activeWorkspaceKey.value) return
  }
  if (msg.type === 'chat_response' || msg.type === 'ai_message') {
    aiTyping.value = false
    currentTool.value = null
    messages.value.push({
      id: Date.now().toString(),
      text: msg.text ?? '',
      direction: 'ai',
      tool: msg.tool,
      ts: nowTs(),
    })
    saveWorkspaceChatHistory(activeWorkspaceKey.value, messages.value)
    scrollToBottom()
  } else if (msg.type === 'ai_typing') {
    aiTyping.value = true
    currentTool.value = (msg.tool as string) ?? null
  } else if (msg.type === 'clis_update' && Array.isArray(msg.clis)) {
    cliList.value = msg.clis as CliItem[]
  } else if (msg.type === 'cli_started') {
    const termName = String(msg.terminalName ?? '')
    cliLaunching.value[String(msg.cliId ?? '')] = false
    if (msg.cliId) setTarget(String(msg.cliId))
    // Refresh IDE state so the terminal appears in the list
    void bridge.fetchAgentStatus()
  } else if (msg.type === 'terminal_closed') {
    const terminalName = String(msg.terminalName ?? '')
    const closedCli = cliList.value.find(cli => `DevBridge ${cli.name}` === terminalName)
    if (closedCli && replyTarget.value === closedCli.id) setTarget('bash')
    if (terminalName === 'bash' && replyTarget.value === 'bash') setTarget('bash')
  } else if (msg.type === 'projects_list' && Array.isArray(msg.projects)) {
    loadingProjects.value = false
    projects.value = msg.projects as ProjectItem[]
  }
})

// Fetch CLI list on connect
watch(() => bridge.status.value, (status) => {
  if (status === 'connected') {
    const token = bridge.token.value ?? ''
    const base = bridge.activeUrl.value ?? ''
    if (base) {
      fetch(`${base}/clis`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json() as Promise<{ clis?: CliItem[] }>)
        .then(d => { if (d.clis) cliList.value = d.clis })
        .catch(() => {})
    }
  }
}, { immediate: true })

onUnmounted(offMessage)

useHead({ title: 'Chat — VibeBridge' })

const selectedTargetReady = computed(() => {
  if (replyTarget.value === 'bash') return true
  const selected = chatTargets.value.find(target => target.id === replyTarget.value)
  return Boolean(selected && selected.state !== 'starting' && selected.terminalName && terminals.value.some(
    t => String((t as { name?: string }).name ?? '') === selected.terminalName
  ))
})

watch(chatTargets, (targets) => {
  if (!targets.some(target => target.id === replyTarget.value)) {
    setTarget('bash')
  }
}, { immediate: true })

watch(activeWorkspaceKey, (workspaceId) => {
  messages.value = loadWorkspaceChatHistory(workspaceId)
  aiTyping.value = false
  currentTool.value = null
  scrollToBottom()
}, { immediate: true })

function cliButtonName(cli: CliItem) {
  if (cli.id === 'claude-code') return 'CLAUDE'
  if (cli.id === 'copilot') return 'COPILOT'
  if (cli.id === 'codex') return 'CODEX'
  if (cli.id === 'aider') return 'AIDER'
  const firstToken = String(cli.command ?? '').trim().split(/\s+/)[0] ?? ''
  return (firstToken || cli.name).replace(/[^a-z0-9]+/gi, '').toUpperCase()
}

function targetButtonLabel(target: ChatTarget) {
  if (target.state === 'starting') return `▶ ${target.label}`
  if (target.state === 'active') return `${target.label} ●`
  return target.label
}

function targetButtonStyle(target: ChatTarget) {
  if (target.state === 'active') {
    return 'border:1px solid var(--text);color:var(--text);background:var(--surface)'
  }
  if (target.state === 'starting') {
    return 'border:1px solid var(--border);color:var(--muted);background:none;opacity:0.45'
  }
  return 'border:1px solid var(--border);color:var(--muted);background:none'
}
</script>
