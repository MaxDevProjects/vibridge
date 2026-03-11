<template>
  <details class="relative" :open="open" @toggle="open = $event.target.open">
    <summary
      class="list-none cursor-pointer select-none text-[10px] uppercase tracking-[0.16em] px-3 py-2 flex items-center gap-2"
      style="border:1px solid var(--border);background:var(--bg);color:var(--text)"
    >
      <span
        class="inline-block w-1.5 h-1.5 rounded-full"
        :style="`background:${activeWorkspace ? 'var(--dot-green)' : 'var(--border)'}`"
      />
      <span class="truncate max-w-[12rem]">{{ activeWorkspaceLabel }}</span>
      <span class="ml-auto text-[9px]" style="color:var(--muted)">▾</span>
    </summary>
    <div
      class="absolute left-0 right-0 mt-1 z-20"
      style="border:1px solid var(--border);background:var(--bg);box-shadow:0 12px 30px rgba(0,0,0,0.2)"
    >
      <template v-if="workspaces.length">
        <button
          v-for="workspace in workspaces"
          :key="workspace.id"
          class="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] uppercase tracking-[0.16em] transition-colors hover:bg-surface"
          :style="workspace.id === activeWorkspaceId ? 'color:var(--text)' : 'color:var(--muted)'"
          @click="selectWorkspace(workspace.id)"
        >
          <span>{{ workspace.id === activeWorkspaceId ? '●' : '○' }}</span>
          <span class="truncate flex-1">{{ workspace.name }}</span>
          <span v-if="workspace.id === activeWorkspaceId" class="text-[9px]">actif</span>
        </button>
      </template>
      <p v-else class="px-3 py-2 text-[10px] uppercase tracking-[0.16em]" style="color:var(--muted)">
        + Aucun autre workspace connecté
      </p>
      <button
        class="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] uppercase tracking-[0.16em] transition-colors hover:bg-surface"
        style="color:var(--text);border-top:1px solid var(--border)"
        @click="requestOpenProject"
      >
        <span>+</span>
        <span class="truncate flex-1">Ouvrir un projet</span>
      </button>
    </div>
  </details>
</template>

<script setup lang="ts">
interface WorkspaceOption {
  id: string
  name: string
  active: boolean
}

const props = defineProps<{
  workspaces: WorkspaceOption[]
  activeWorkspaceId: string
}>()

const emit = defineEmits<{
  select: [workspaceId: string]
  openProject: []
}>()

const open = ref(false)

const activeWorkspace = computed(() => props.workspaces.find(workspace => workspace.id === props.activeWorkspaceId) ?? null)
const activeWorkspaceLabel = computed(() => activeWorkspace.value?.name ?? 'Aucun workspace')

function selectWorkspace(workspaceId: string) {
  open.value = false
  emit('select', workspaceId)
}

function requestOpenProject() {
  open.value = false
  emit('openProject')
}
</script>
