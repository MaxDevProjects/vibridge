<template>
  <div class="flex flex-col h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3rem)]">
    <!-- TOOLBAR -->
    <div class="flex items-center gap-3 border-b border-border px-4 py-2 shrink-0 flex-wrap">
      <p class="text-xs uppercase tracking-widest text-muted mr-2">APERÇU</p>

      <input
        v-model="urlInput"
        placeholder="http://localhost:5173"
        class="flex-1 min-w-48 bg-surface border border-border text-text text-xs px-3 py-1.5 font-mono focus:outline-none focus:border-text"
        @keydown.enter="applyUrl"
      />
      <button
        class="border border-text text-text text-xs uppercase tracking-widest px-3 py-1.5 hover:bg-surface2 transition-colors"
        @click="applyUrl"
      >
        GO
      </button>
      <button
        class="border border-border text-muted text-xs uppercase tracking-widest px-3 py-1.5 hover:border-text hover:text-text transition-colors"
        @click="reload"
      >
        ↺
      </button>

      <!-- Device width selector -->
      <div class="flex gap-1 ml-auto">
        <button
          v-for="d in devices"
          :key="d.label"
          :class="activeDevice === d.label ? 'border-text text-text' : 'border-border text-muted hover:border-text hover:text-text'"
          class="border text-xs px-2 py-1.5 transition-colors uppercase"
          @click="activeDevice = d.label"
        >
          {{ d.label }}
        </button>
      </div>
    </div>

    <!-- FRAME WRAPPER -->
    <div class="flex-1 overflow-auto flex justify-center items-start bg-surface2 p-4">
      <div
        v-if="activeUrl"
        :style="frameStyle"
        class="bg-bg border border-border overflow-hidden relative"
      >
        <!-- Loading overlay -->
        <div
          v-if="frameLoading"
          class="absolute inset-0 bg-bg flex items-center justify-center text-xs text-muted uppercase tracking-widest"
        >
          CHARGEMENT…
        </div>
        <iframe
          ref="iframeEl"
          :src="activeUrl"
          class="w-full h-full border-none"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          @load="frameLoading = false"
        />
      </div>
      <div v-else class="text-dimmed text-xs uppercase tracking-widest mt-24">
        — ENTREZ UNE URL POUR PRÉVISUALISER —
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { WsMessage } from '~/composables/useDevBridge'

const bridge = useDevBridge()

interface Device { label: string; width: number; height: number }

const devices: Device[] = [
  { label: 'FULL', width: 0, height: 0 },
  { label: 'LG', width: 1024, height: 768 },
  { label: 'MD', width: 768, height: 1024 },
  { label: 'SM', width: 390, height: 844 },
]

const urlInput = ref('http://localhost:5173')
const activeUrl = ref('')
const activeDevice = ref('FULL')
const frameLoading = ref(false)
const iframeEl = ref<HTMLIFrameElement | null>(null)

const currentDevice = computed(() => devices.find(d => d.label === activeDevice.value) ?? devices[0])

const frameStyle = computed(() => {
  const d = currentDevice.value
  if (!d || d.width === 0) return { width: '100%', height: '70vh' }
  return { width: `${d.width}px`, height: `${d.height}px` }
})

function applyUrl() {
  const url = urlInput.value.trim()
  if (!url) return
  activeUrl.value = url
  frameLoading.value = true
}

function reload() {
  if (!iframeEl.value || !activeUrl.value) return
  frameLoading.value = true
  iframeEl.value.src = activeUrl.value
}

// Listen for dev-server URL from agent
const offMessage = bridge.onMessage((msg: WsMessage) => {
  if (msg.type === 'dev_server_url' && msg.url) {
    urlInput.value = msg.url as string
  }
})

onMounted(() => {
  const snapshotUrl = bridge.agentStatus.value?.previewUrl
  if (snapshotUrl) {
    urlInput.value = snapshotUrl
    activeUrl.value = snapshotUrl
  } else if (bridge.status.value === 'connected') {
    bridge.send({ type: 'get_preview_url' })
  }
})

onUnmounted(offMessage)

useHead({ title: 'Aperçu — VibeBridge' })
</script>
