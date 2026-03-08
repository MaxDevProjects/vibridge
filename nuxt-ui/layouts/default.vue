<template>
  <div class="min-h-screen bg-bg text-text flex flex-col" :class="colorMode.value">

    <!-- ── Global top bar ─────────────────────── -->
    <header
      class="fixed top-0 left-0 right-0 h-12 z-50 flex items-center justify-between px-6"
      style="background:var(--bg);border-bottom:1px solid var(--border)"
    >
      <span class="font-display text-xs tracking-[0.3em] uppercase text-text">DevBridge</span>

      <div class="flex items-center gap-4">
        <!-- View toggle (desktop only) -->
        <div class="hidden lg:flex" style="border:1px solid var(--border)">
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
          style="border:1px solid var(--border);background:none;color:var(--muted)"
          @click="toggleColorMode"
        >
          {{ colorMode.value === 'dark' ? 'Light' : 'Dark' }}
        </button>
      </div>
    </header>

    <!-- ── Content ──────────────────────────────── -->
    <main class="flex-1 pt-12 overflow-hidden">
      <slot :active-view="activeView" />
    </main>

  </div>
</template>

<script setup lang="ts">
const colorMode = useColorMode()
const activeView = useViewMode()

const views = [
  { id: 'both' as const,   label: 'Both' },
  { id: 'pc' as const,     label: 'PC' },
  { id: 'mobile' as const, label: 'Mobile' },
]

function setView(v: 'both' | 'pc' | 'mobile') {
  activeView.value = v
}

function toggleColorMode() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>
