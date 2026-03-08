<template>
  <div class="flex h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3rem)]">
    <!-- FILE TREE PANEL -->
    <aside class="w-64 shrink-0 border-r border-border flex flex-col hidden lg:flex">
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <p class="text-xs uppercase tracking-widest text-muted">FICHIERS</p>
        <button class="text-xs text-muted hover:text-text" @click="refreshTree">↺</button>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <FileTree
          v-if="tree.length"
          :nodes="tree"
          :active="activePath ?? undefined"
          @select="openFile"
        />
        <p v-else class="text-dimmed text-xs px-2 py-4">— VIDE —</p>
      </div>
    </aside>

    <!-- CONTENT PANEL -->
    <div class="flex-1 flex flex-col min-w-0">
      <!-- Toolbar -->
      <div class="flex items-center justify-between border-b border-border px-4 py-2 shrink-0">
        <p class="text-xs text-muted font-mono truncate max-w-xs lg:max-w-none">
          {{ activePath ?? 'AUCUN FICHIER' }}
        </p>
        <!-- Mobile: file picker -->
        <button class="lg:hidden text-xs text-muted hover:text-text uppercase tracking-widest" @click="showMobileTree = !showMobileTree">
          ◧ FICHIERS
        </button>
      </div>

      <!-- Mobile tree drawer -->
      <div v-if="showMobileTree" class="lg:hidden border-b border-border p-2 max-h-48 overflow-y-auto bg-surface">
        <FileTree v-if="tree.length" :nodes="tree" :active="activePath ?? undefined" @select="openFileMobile" />
      </div>

      <!-- File content -->
      <div class="flex-1 overflow-auto p-4">
        <template v-if="loading">
          <p class="text-dimmed text-xs uppercase tracking-widest">CHARGEMENT…</p>
        </template>
        <template v-else-if="fileContent !== null">
          <pre class="text-text text-xs leading-relaxed whitespace-pre-wrap break-words font-mono">{{ fileContent }}</pre>
        </template>
        <template v-else>
          <p class="text-dimmed text-xs text-center mt-16 uppercase tracking-widest">
            — SÉLECTIONNEZ UN FICHIER —
          </p>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { FileNode } from '~/components/FileTree.vue'
import type { WsMessage } from '~/composables/useDevBridge'

const bridge = useDevBridge()
const config = useRuntimeConfig()

const tree = ref<FileNode[]>([])
const activePath = ref<string | null>(null)
const fileContent = ref<string | null>(null)
const loading = ref(false)
const showMobileTree = ref(false)

function baseUrl() {
  if (import.meta.server) return ''
  return localStorage.getItem('vb:agentUrl') ?? `http://${config.public.agentHost}:${config.public.agentPort}`
}

async function refreshTree() {
  if (bridge.mode.value === 'relay') {
    tree.value = (bridge.agentStatus.value?.fileTree as FileNode[] | undefined) ?? []
    return
  }
  try {
    const res = await fetch(`${baseUrl()}/files`, {
      headers: { Authorization: `Bearer ${bridge.token.value}` },
    })
    if (res.ok) tree.value = await res.json() as FileNode[]
  } catch { /* ignore */ }
}

async function openFile(path: string) {
  activePath.value = path
  fileContent.value = null
  loading.value = true
  if (bridge.mode.value === 'relay') {
    fileContent.value = '[LECTURE DE FICHIER DIRECTE NON ENCORE RELAYEE]'
    loading.value = false
    return
  }
  try {
    const res = await fetch(`${baseUrl()}/files/${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${bridge.token.value}` },
    })
    if (res.ok) fileContent.value = await res.text()
    else fileContent.value = `[ERREUR ${res.status}]`
  } catch {
    fileContent.value = '[IMPOSSIBLE DE CHARGER]'
  } finally {
    loading.value = false
  }
}

function openFileMobile(path: string) {
  openFile(path)
  showMobileTree.value = false
}

// WS: live file change events
const offMessage = bridge.onMessage((msg: WsMessage) => {
  if (msg.type === 'file_changed' && msg.path === activePath.value) {
    openFile(activePath.value!)
  }
})

onMounted(() => {
  if (bridge.status.value === 'connected') refreshTree()
})

watch(() => bridge.status.value, (s) => {
  if (s === 'connected') refreshTree()
})

onUnmounted(offMessage)

useHead({ title: 'Code — VibeBridge' })
</script>
