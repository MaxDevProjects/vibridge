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
        @select="selectWorkspaceOrSession"
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
          :disabled="target.state === 'new' && creatingTerminal"
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
const activeWorkspaceKey = computed(() => bridge.mode.value === 'relay' ? (bridge.activeWorkspaceId.value || bridge.relaySessionId.value || 'default') : 'local')
const relayWorkspaceOptions = computed(() => bridge.mode.value === 'relay'
  ? (bridge.relaySessions.value.length
      ? bridge.relaySessions.value.map(session => ({
          id: session.id,
          name: session.label,
          active: session.id === bridge.relaySessionId.value,
        }))
      : bridge.relayWorkspaces.value)
  : [{ id: 'local', name: 'Workspace local', active: true }])

function selectWorkspaceOrSession(id: string) {
  if (bridge.mode.value === 'relay' && bridge.relaySessions.value.length) {
    void bridge.switchRelaySession(id)
    return
  }
  bridge.setActiveWorkspace(id)
}

type ChatTargetState = 'active' | 'open' | 'new'

interface ChatTarget {
  id: string
  label: string
  target?: string
  terminalName?: string
  state: ChatTargetState
  selected: boolean
}

// Target (synced with index.vue via localStorage)
const replyTarget = ref(
  import.meta.client ? (localStorage.getItem(REPLY_TARGET_KEY) ?? '__new__') : '__new__'
)
const creatingTerminal = ref(false)

const ideState = computed(() => bridge.agentStatus.value?.ideState ?? null)
const terminals = computed(() =>
  Array.isArray(ideState.value?.terminals) ? ideState.value!.terminals! : []
)
const activeTerminalName = computed(() => String(ideState.value?.activeTerminal ?? '').trim())

const chatTargets = computed<ChatTarget[]>(() => {
  const list: ChatTarget[] = []
  const seen = new Set<string>()

  for (const terminal of terminals.value) {
    const terminalName = String((terminal as { name?: string }).name ?? '').trim()
    if (!terminalName || seen.has(terminalName)) continue
    seen.add(terminalName)
    const target = `terminal:${terminalName}`
    list.push({
      id: target,
      label: terminalName,
      target,
      terminalName,
      state: terminalName === activeTerminalName.value ? 'active' : 'open',
      selected: replyTarget.value === target,
    })
  }

  list.push({
    id: '__new__',
    label: '+',
    state: 'new',
    selected: replyTarget.value === '__new__',
  })

  return list
})

function nextTerminalName(): string {
  const existing = new Set(terminals.value.map(t => String((t as { name?: string }).name ?? '').trim()).filter(Boolean))
  let idx = 1
  while (existing.has(`DevBridge ${idx}`)) idx += 1
  return `DevBridge ${idx}`
}

function setTarget(id: string) {
  replyTarget.value = id
  if (import.meta.client) localStorage.setItem(REPLY_TARGET_KEY, id)
}

function selectChatTarget(target: ChatTarget) {
  if (target.state === 'new') {
    const terminalName = nextTerminalName()
    creatingTerminal.value = true
    bridge.send({ type: 'create_terminal', terminalName })
    setTarget(`terminal:${terminalName}`)
    setTimeout(() => { creatingTerminal.value = false }, 3_000)
    return
  }
  if (target.target) setTarget(target.target)
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
    if (msgWorkspaceId && msgWorkspaceId !== bridge.activeWorkspaceId.value) return
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
  } else if (msg.type === 'terminal_closed') {
    const terminalName = String(msg.terminalName ?? '')
    if (replyTarget.value === `terminal:${terminalName}`) setTarget('__new__')
  } else if (msg.type === 'projects_list' && Array.isArray(msg.projects)) {
    loadingProjects.value = false
    projects.value = msg.projects as ProjectItem[]
  } else if (msg.type === 'projects_list') {
    const payload = typeof msg.payload === 'object' && msg.payload ? msg.payload as { projects?: ProjectItem[] } : {}
    loadingProjects.value = false
    projects.value = Array.isArray(payload.projects) ? payload.projects : []
  }
})

watch(() => bridge.status.value, (status) => {
  if (status === 'connected' && bridge.mode.value === 'relay') {
    void bridge.fetchRelaySessions()
  }
}, { immediate: true })

onUnmounted(offMessage)

useHead({ title: 'Chat — VibeBridge' })

const selectedTargetReady = computed(() => {
  if (!replyTarget.value.startsWith('terminal:')) return false
  const selected = chatTargets.value.find(target => target.id === replyTarget.value)
  return Boolean(selected && selected.state !== 'new' && selected.terminalName && terminals.value.some(
    t => String((t as { name?: string }).name ?? '') === selected.terminalName
  ))
})

watch(chatTargets, (targets) => {
  if (!targets.some(target => target.id === replyTarget.value)) {
    setTarget('__new__')
  }
}, { immediate: true })

watch(activeWorkspaceKey, (workspaceId) => {
  messages.value = loadWorkspaceChatHistory(workspaceId)
  aiTyping.value = false
  currentTool.value = null
  scrollToBottom()
}, { immediate: true })

function targetButtonLabel(target: ChatTarget) {
  if (target.state === 'new') return '+'
  return `${target.state === 'active' ? '●' : '○'} ${target.label}`
}

function targetButtonStyle(target: ChatTarget) {
  if (target.selected) {
    return 'border:1px solid var(--text);color:var(--text);background:var(--surface)'
  }
  if (target.state === 'active') {
    return 'border:1px solid var(--border);color:var(--text);background:none'
  }
  if (target.state === 'new') {
    return 'border:1px dashed var(--border);color:var(--muted);background:none'
  }
  return 'border:1px solid var(--border);color:var(--muted);background:none'
}
</script>
