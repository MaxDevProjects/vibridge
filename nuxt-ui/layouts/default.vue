<template>
  <div class="min-h-screen bg-bg text-text flex flex-col vb-shell" :class="colorMode.value">
    <div class="absolute inset-0 vb-grid opacity-30 pointer-events-none" />

    <!-- ── Global top bar ─────────────────────── -->
    <header
      class="fixed top-0 left-0 right-0 h-14 z-50 flex items-center justify-between px-4 sm:px-6"
      style="background:color-mix(in srgb, var(--bg) 88%, transparent);border-bottom:1px solid var(--border);backdrop-filter:blur(12px)"
    >
      <div class="flex items-center gap-3">
        <NuxtLink to="/" class="font-display text-xs sm:text-sm tracking-[0.28em] uppercase text-text">ViBridge</NuxtLink>
        <span
          class="hidden sm:inline-flex text-[9px] tracking-[0.18em] uppercase px-2 py-1"
          style="border:1px solid var(--border);background:var(--accent-soft);color:var(--text-mid)"
        >
          {{ isSetupRoute ? 'Phase 1 Setup' : 'Workspace Relay' }}
        </span>
      </div>

      <div class="flex items-center gap-2 sm:gap-4">
        <!-- View toggle (desktop only) -->
        <div v-if="!isSetupRoute" class="hidden lg:flex" style="border:1px solid var(--border)">
          <button
            v-for="v in views"
            :key="v.id"
            class="text-[10px] tracking-[0.15em] uppercase px-3.5 py-1.5 transition-colors"
            :style="activeView === v.id
              ? 'background:var(--text);color:var(--bg)'
              : 'background:none;color:var(--muted);border-right:1px solid var(--border)'"
            :class="v.id === 'mobile' ? '!border-r-0' : ''"
            @click="setView(v.id)"
          >{{ v.label }}</button>
        </div>

        <!-- Theme toggle -->
        <button
          class="text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors"
          style="border:1px solid var(--border-bright);background:color-mix(in srgb, var(--surface) 82%, transparent);color:var(--text-mid)"
          @click="toggleColorMode"
        >
          {{ colorMode.value === 'dark' ? 'Light' : 'Dark' }}
        </button>

        <!-- Settings link -->
        <NuxtLink
          to="/settings"
          class="text-[10px] tracking-[0.1em] uppercase px-3 py-1.5 transition-colors"
          style="border:1px solid var(--border-bright);background:color-mix(in srgb, var(--surface) 82%, transparent);color:var(--text-mid)"
          title="Paramètres réseau"
        >⚙</NuxtLink>
      </div>
    </header>

    <div v-if="notice" class="fixed right-4 top-16 z-50 flex max-w-sm gap-3 p-3 text-sm shadow-md"
      style="background:var(--surface);border:1px solid var(--border-bright);color:var(--text)"
      :role="notice.status === 'error' ? 'alert' : 'status'">
      {{ notice.text }}
      <button type="button" class="shrink-0" aria-label="Masquer le statut de l’envoi" @click="dismiss">×</button>
    </div>

    <!-- Control permissions are enforced on the local agent, not in this UI. -->
    <div v-if="!isSetupRoute && bridge.agentStatus.value?.control && bridge.agentStatus.value.control.mode === 'observe'"
      class="fixed left-4 right-4 bottom-4 z-40 p-3 text-xs"
      style="background:var(--surface);border:1px solid var(--border-bright);color:var(--text)"
      role="status">
      Mode observation : la machine refuse les commandes distantes. Autorise le contrôle dans la configuration locale de l'agent si nécessaire.
    </div>

    <!-- ── Content ──────────────────────────────── -->
    <main class="flex-1 pt-14 overflow-hidden relative z-10">
      <slot :active-view="activeView" />
    </main>

  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const activeView = useViewMode()
const route = useRoute()
const { notice, dismiss } = useBridgeDeliveryNotice()
const bridge = useDevBridge()

const views = [
  { id: 'both' as const,   label: 'Both' },
  { id: 'pc' as const,     label: 'PC' },
  { id: 'mobile' as const, label: 'Mobile' },
]

const isSetupRoute = computed(() => route.path.startsWith('/setup'))

function setView(v: 'both' | 'pc' | 'mobile') {
  activeView.value = v
}

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>
