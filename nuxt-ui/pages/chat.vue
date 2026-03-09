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
    <div class="shrink-0 border-b border-border px-3 py-1.5 flex items-center gap-2">
      <span class="text-[9px] uppercase tracking-[0.15em] text-muted shrink-0">➡</span>
      <div class="flex gap-1.5 overflow-x-auto">
        <button
          v-for="t in activeTargets"
          :key="t.id"
          class="shrink-0 text-[9px] uppercase tracking-[0.1em] px-2 py-1 transition-colors"
          :style="replyTarget === t.id
            ? 'border:1px solid var(--text);color:var(--text);background:var(--surface)'
            : t.launched
              ? 'border:1px solid var(--border);color:var(--muted);background:none'
              : 'border:1px solid var(--border);color:var(--dot-red);background:none;opacity:0.6'"
          @click="setTarget(t.id)"
        >
          {{ t.label }}
        </button>
        <!-- Undetected / unlaunched CLIs with a [Lancer] button -->
        <template v-for="cli in cliList.filter(c => c.detected)" :key="'launch-' + cli.id">
          <button
            v-if="!activeTargets.some(t => t.id === `terminal:DevBridge ${cli.name}`)"
            :disabled="!!cliLaunching[cli.id]"
            class="shrink-0 text-[9px] uppercase tracking-[0.1em] px-2 py-1 transition-colors disabled:opacity-40"
            style="border:1px dashed var(--border);color:var(--muted);background:none"
            @click="launchCli(cli.id)"
          >
            {{ cliLaunching[cli.id] ? '…' : `+ ${cli.name}` }}
          </button>
        </template>
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
          :disabled="!draft.trim() || bridge.status.value !== 'connected'"
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

const REPLY_TARGET_KEY = 'vb:replyTarget'

interface ChatMessage {
  id: string
  text: string
  direction: 'user' | 'ai'
  tool?: string
  ts: number
}

const bridge = useDevBridge()

// CLI state — synced from WS broadcast
interface CliItem { id: string; name: string; command: string; detected: boolean; isDefault: boolean }
const cliList = ref<CliItem[]>([])
const cliLaunching = ref<Record<string, boolean>>({})

// Target (synced with index.vue via localStorage)
const replyTarget = ref(
  import.meta.client ? (localStorage.getItem(REPLY_TARGET_KEY) ?? '') : ''
)

const ideState = computed(() => bridge.agentStatus.value?.ideState ?? null)
const terminals = computed(() =>
  Array.isArray(ideState.value?.terminals) ? ideState.value!.terminals! : []
)

const activeTargets = computed(() => {
  const list: Array<{ id: string; label: string; launched: boolean }> = []
  // Detected CLIs — launched ones come first
  for (const cli of cliList.value) {
    if (!cli.detected) continue
    const termName = `DevBridge ${cli.name}`
    const isLaunched = terminals.value.some(t => String((t as { name?: string }).name ?? '') === termName)
    list.push({ id: `terminal:${termName}`, label: `⟨⟩ ${cli.name}`, launched: isLaunched })
  }
  // Sort: launched first
  list.sort((a, b) => (b.launched ? 1 : 0) - (a.launched ? 1 : 0))
  // Other open terminals (not from CLIs)
  for (const t of terminals.value) {
    const name = String((t as { name?: string }).name ?? '').trim()
    if (!name) continue
    if (list.some(l => l.id === `terminal:${name}`)) continue
    list.push({ id: `terminal:${name}`, label: `■ ${name}`, launched: true })
  }
  list.push({ id: 'chat:devbridge', label: '◈ Chat', launched: true })
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

const messages = ref<ChatMessage[]>([])
const draft = ref('')
const aiTyping = ref(false)
const currentTool = ref<string | null>(null)
const recording = ref(false)
const scrollEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

function nowTs() { return Date.now() }

function scrollToBottom() {
  nextTick(() => {
    if (scrollEl.value) scrollEl.value.scrollTop = scrollEl.value.scrollHeight
  })
}

function sendMessage() {
  const text = draft.value.trim()
  if (!text || bridge.status.value !== 'connected') return
  messages.value.push({ id: Date.now().toString(), text, direction: 'user', ts: nowTs() })
  const isTerminal = replyTarget.value.startsWith('terminal:')
  bridge.send({ type: 'message', text, target: replyTarget.value, sendEnter: isTerminal })
  draft.value = ''
  aiTyping.value = true
  if (inputEl.value) { inputEl.value.style.height = 'auto' }
  scrollToBottom()
}

function clearChat() { messages.value = [] }

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
    scrollToBottom()
  } else if (msg.type === 'ai_typing') {
    aiTyping.value = true
    currentTool.value = (msg.tool as string) ?? null
  } else if (msg.type === 'clis_update' && Array.isArray(msg.clis)) {
    cliList.value = msg.clis as CliItem[]
  } else if (msg.type === 'cli_started') {
    const termName = String(msg.terminalName ?? '')
    cliLaunching.value[String(msg.cliId ?? '')] = false
    // Auto-select the new terminal
    if (termName) setTarget(`terminal:${termName}`)
    // Refresh IDE state so the terminal appears in the list
    void bridge.fetchAgentStatus()
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
</script>
