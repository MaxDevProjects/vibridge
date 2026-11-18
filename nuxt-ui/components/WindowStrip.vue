<template>
  <section class="shrink-0 border-b border-border px-3 py-2" aria-label="Fenêtres VS Code">
    <div class="mb-2 flex items-center justify-between gap-2">
      <span class="text-[10px] uppercase tracking-[0.14em]" style="color:var(--muted)">Fenêtres VS Code</span>
      <span class="text-[10px]" style="color:var(--muted)">{{ windows.filter(window => window.connected).length }} connectée(s)</span>
    </div>
    <div v-if="windows.length" class="flex gap-2 overflow-x-auto pb-1">
      <button
        v-for="window in windows"
        :key="window.id"
        class="min-w-[9rem] max-w-[14rem] shrink-0 rounded-md border px-3 py-2 text-left transition-colors"
        :style="window.id === selectedWindowId
          ? 'border-color:var(--text);background:var(--surface);color:var(--text)'
          : 'border-color:var(--border);color:var(--muted)'"
        :aria-pressed="window.id === selectedWindowId"
        :disabled="!window.connected"
        @click="emit('select', window.id)"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="truncate text-xs font-semibold">{{ projectLabel(window) }}</span>
          <span :style="`color:${window.connected ? 'var(--dot-green)' : 'var(--muted)'}`">●</span>
        </div>
        <div class="mt-1 flex items-center justify-between gap-1 text-[10px]">
          <span class="truncate">{{ (window.ideState?.terminals ?? []).length }} terminal(aux)</span>
          <span v-if="activity[window.id]?.state === 'attention_possible'" style="color:var(--dot-amber)">
            À vérifier
          </span>
          <span v-else-if="activity[window.id]?.state === 'running'">Commande en cours</span>
          <span v-else-if="activity[window.id]?.state === 'finished'">Commande terminée</span>
          <span v-else-if="!window.connected">Hors ligne</span>
          <span v-else>Disponible</span>
        </div>
      </button>
    </div>
    <p v-else class="text-xs" style="color:var(--muted)">
      Aucune fenêtre VS Code enregistrée. Vérifie que l'extension est démarrée.
    </p>
  </section>
</template>

<script setup lang="ts">
import type { ConnectedWindow, WindowActivity } from '~/composables/useDevBridge'
import { projectName } from '~/composables/projectContext'

defineProps<{
  windows: ConnectedWindow[]
  selectedWindowId: string
  activity: Record<string, WindowActivity>
}>()
const emit = defineEmits<{ select: [windowId: string] }>()

function projectLabel(window: ConnectedWindow): string {
  const folder = window.workspaceFolders[0] ?? window.ideState?.workspaceFolders?.[0] ?? ''
  return folder ? projectName(folder) : 'Fenêtre sans dossier'
}
</script>
