<template>
  <div class="flex h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3rem)]">
    <!-- FILE TREE PANEL -->
    <aside class="w-64 shrink-0 border-r border-border flex flex-col hidden lg:flex">
      <div class="flex items-center justify-between px-4 py-3 border-b border-border">
        <p class="text-xs uppercase tracking-widest text-muted">FICHIERS</p>
        <div class="flex items-center gap-2">
          <input
            v-model="fileQuery"
            type="text"
            placeholder="Rechercher"
            class="w-28 bg-transparent text-[11px] text-text border border-border px-2 py-1 outline-none"
          >
          <button class="text-xs text-muted hover:text-text" @click="refreshTree">↺</button>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <FileTree
          v-if="filteredTree.length"
          :nodes="filteredTree"
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
        <div class="flex items-center gap-2">
          <input
            v-model="fileQuery"
            type="text"
            placeholder="Rechercher"
            class="lg:hidden w-24 bg-transparent text-[11px] text-text border border-border px-2 py-1 outline-none"
          >
          <button class="lg:hidden text-xs text-muted hover:text-text uppercase tracking-widest" @click="showMobileTree = !showMobileTree">
            ◧ FICHIERS
          </button>
        </div>
      </div>

      <!-- Mobile tree drawer -->
      <div v-if="showMobileTree" class="lg:hidden border-b border-border p-2 max-h-48 overflow-y-auto bg-surface">
        <FileTree v-if="filteredTree.length" :nodes="filteredTree" :active="activePath ?? undefined" @select="openFileMobile" />
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
const fileQuery = ref('')

function baseUrl() {
  if (import.meta.server) return ''
  return localStorage.getItem('vb:agentUrl') ?? `http://${config.public.agentHost}:${config.public.agentPort}`
}

function relayBaseUrl() {
  if (import.meta.server) return ''
  return bridge.relayUrl.value || String(config.public.relayUrl ?? '')
}

function filterNodes(nodes: FileNode[], query: string): FileNode[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return nodes
  return nodes.flatMap((node) => {
    if (node.type === 'file') {
      return node.path.toLowerCase().includes(needle) || node.name.toLowerCase().includes(needle) ? [node] : []
    }
    const children = filterNodes(node.children ?? [], needle)
    if (children.length || node.name.toLowerCase().includes(needle)) {
      return [{ ...node, children }]
    }
    return []
  })
}

const filteredTree = computed(() => filterNodes(tree.value, fileQuery.value))

async function refreshTree() {
  if (bridge.mode.value === 'relay') {
    const workspaceId = bridge.activeWorkspaceId.value
    try {
      const res = await fetch(`${relayBaseUrl()}/api/relay/sessions/${bridge.relaySessionId.value}/files?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: { Authorization: `Bearer ${bridge.token.value}` },
      })
      if (res.ok) {
        const data = await res.json() as { tree?: FileNode[] }
        tree.value = Array.isArray(data.tree) ? data.tree : []
        return
      }
    } catch {
      // ignore and fall back to cached snapshot
    }
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
    try {
      const workspaceId = bridge.activeWorkspaceId.value
      const res = await fetch(
        `${relayBaseUrl()}/api/relay/sessions/${bridge.relaySessionId.value}/files?workspaceId=${encodeURIComponent(workspaceId)}&path=${encodeURIComponent(path)}`,
        { headers: { Authorization: `Bearer ${bridge.token.value}` } },
      )
      if (res.ok) {
        const data = await res.json() as { content?: string }
        fileContent.value = data.content ?? ''
      } else {
        fileContent.value = `[ERREUR ${res.status}]`
      }
    } catch {
      fileContent.value = '[IMPOSSIBLE DE CHARGER]'
    } finally {
      loading.value = false
    }
    return
  }
  try {
    const res = await fetch(`${baseUrl()}/files/${encodeURIComponent(path)}`, {
      headers: { Authorization: `Bearer ${bridge.token.value}` },
    })
    if (res.ok) {
      const data = await res.json() as { content?: string }
      fileContent.value = data.content ?? ''
    }
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

watch(() => bridge.activeWorkspaceId.value, () => {
  if (bridge.status.value === 'connected') {
    fileContent.value = null
    activePath.value = null
    void refreshTree()
  }
})

onUnmounted(offMessage)

useHead({ title: 'Code — VibeBridge' })
</script>
