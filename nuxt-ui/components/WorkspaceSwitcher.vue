<template>
  <details class="relative" :open="open" @toggle="onToggle">
    <summary
      class="list-none cursor-pointer select-none text-[10px] uppercase tracking-[0.16em] px-3 py-2 flex items-center gap-2"
      style="border:1px solid var(--border);background:var(--bg);color:var(--text)"
    >
      <span
        class="inline-block w-1.5 h-1.5 rounded-full"
        :style="`background:${activeWorkspace && activeWorkspace.connected !== false ? 'var(--dot-green)' : 'var(--border)'}`"
      />
      <span class="flex min-w-0 flex-col text-left">
        <span class="truncate max-w-[14rem] font-semibold" :title="activeProjectPath || activeProjectLabel">{{ activeProjectLabel }}</span>
        <span class="truncate max-w-[14rem] text-[9px] normal-case tracking-normal" style="color:var(--muted)">
          {{ activeWorkspace ? `VS Code · ${activeWorkspaceLabel}` : 'VS Code non connecté' }}
        </span>
      </span>
      <span class="ml-auto text-[9px]" style="color:var(--muted)">▾</span>
    </summary>
    <div
      class="absolute left-0 right-0 mt-1 z-20"
      style="border:1px solid var(--border);background:var(--bg);box-shadow:0 12px 30px rgba(0,0,0,0.2)"
    >
      <template v-if="!showProjects">
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
            <span v-if="workspace.connected === false" class="text-[9px]">hors ligne</span>
            <span v-else-if="workspace.id === activeWorkspaceId" class="text-[9px]">actif</span>
          </button>
        </template>
        <p v-else class="px-3 py-2 text-[10px] uppercase tracking-[0.16em]" style="color:var(--muted)">
          + Aucun autre workspace connecté
        </p>
        <button
          class="w-full flex items-center gap-2 px-3 py-2 text-left text-[10px] uppercase tracking-[0.16em] transition-colors hover:bg-surface"
          style="color:var(--text);border-top:1px solid var(--border)"
          @click="requestProjects"
        >
          <span>+</span>
          <span class="truncate flex-1">Ouvrir un projet</span>
        </button>
        <p v-if="projects.length" class="px-3 py-2 text-[10px] normal-case tracking-normal"
          style="color:var(--muted)">
          {{ projects.length }} projet(s) disponible(s). Choisis « Ouvrir un projet »
          pour sélectionner « Ici » ou « En parallèle ».
        </p>
      </template>

      <template v-else>
        <div class="flex items-center justify-between px-3 py-2" style="border-bottom:1px solid var(--border)">
          <p class="text-[10px] uppercase tracking-[0.16em]" style="color:var(--text)">Projets disponibles</p>
          <button class="text-[9px] uppercase tracking-[0.16em]" style="color:var(--muted)" @click="showProjects = false">
            Retour
          </button>
        </div>
        <p class="px-3 py-2 text-[10px] leading-relaxed" style="color:var(--muted)">
          « Ouvrir ici » change le projet de la fenêtre pilotée. « En parallèle »
          ouvre une autre fenêtre ; son contrôle dépend de sa connexion à l'agent.
        </p>
        <p v-if="loadingProjects" class="px-3 py-3 text-[10px] uppercase tracking-[0.16em]" style="color:var(--muted)">
          Chargement…
        </p>
        <div v-else-if="projects.length">
          <div
            v-for="project in projects"
            :key="project.path"
            class="px-3 py-3"
            style="border-bottom:1px solid var(--border)"
          >
            <div class="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em]" style="color:var(--text)">
              <span>{{ isCurrentProject(project) ? '●' : '○' }}</span>
              <span class="truncate flex-1">{{ project.name }}</span>
            </div>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <button
                class="px-2 py-2 text-[9px] uppercase tracking-[0.14em] transition-colors disabled:opacity-40"
                style="border:1px solid var(--border);color:var(--text)"
                :disabled="isCurrentProject(project) || Boolean(projectOpening[project.path])"
                @click="openListedProject(project.path, false)"
              >
                {{ isCurrentProject(project) ? 'Projet actif' : projectOpening[project.path] === 'replace' ? 'Ouverture…' : 'Ouvrir ici' }}
              </button>
              <button
                class="px-2 py-2 text-[9px] uppercase tracking-[0.14em] transition-colors disabled:opacity-40"
                style="border:1px solid var(--border);color:var(--text)"
                :disabled="Boolean(projectOpening[project.path])"
                @click="openListedProject(project.path, true)"
              >
                {{ projectOpening[project.path] === 'parallel' ? 'Ouverture…' : 'Ouvrir en parallèle' }}
              </button>
            </div>
          </div>
        </div>
        <p v-else class="px-3 py-3 text-[10px] uppercase tracking-[0.16em]" style="color:var(--muted)">
          Aucun projet disponible
        </p>
      </template>
    </div>
  </details>
</template>

<script setup lang="ts">
import { projectIsActive, projectName } from '~/composables/projectContext'
interface WorkspaceOption {
  id: string
  name: string
  active: boolean
  connected?: boolean
}

interface ProjectOption {
  name: string
  path: string
  isActive?: boolean
}

const props = withDefaults(defineProps<{
  workspaces: WorkspaceOption[]
  activeWorkspaceId: string
  activeProjectPath?: string
  projects?: ProjectOption[]
  loadingProjects?: boolean
  projectOpening?: Record<string, string>
}>(), {
  activeProjectPath: '',
  projects: () => [],
  loadingProjects: false,
  projectOpening: () => ({}),
})

const emit = defineEmits<{
  select: [workspaceId: string]
  openProject: []
  requestProjects: []
  openListedProject: [payload: { path: string; newWindow: boolean }]
}>()

const open = ref(false)
const showProjects = ref(false)

const activeWorkspace = computed(() => props.workspaces.find(workspace => workspace.id === props.activeWorkspaceId) ?? null)
const activeWorkspaceLabel = computed(() => activeWorkspace.value?.name ?? 'Aucun workspace')
const activeProjectLabel = computed(() => props.activeProjectPath
  ? projectName(props.activeProjectPath)
  : 'Projet non synchronisé')
function isCurrentProject(project: ProjectOption): boolean {
  return projectIsActive(project.path, props.activeProjectPath)
}

function selectWorkspace(workspaceId: string) {
  open.value = false
  showProjects.value = false
  emit('select', workspaceId)
}

function requestProjects() {
  showProjects.value = true
  emit('requestProjects')
}

function openListedProject(projectPath: string, newWindow: boolean) {
  open.value = false
  showProjects.value = false
  emit('openListedProject', { path: projectPath, newWindow })
}

function onToggle(event: Event) {
  open.value = (event.target as HTMLDetailsElement).open
}
</script>
