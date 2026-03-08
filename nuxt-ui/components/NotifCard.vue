<!--
  NotifCard — AI question card with Validate / Refuse / Ignore actions
-->
<template>
  <div class="border border-border bg-surface p-4 flex flex-col gap-3">

    <!-- Header -->
    <div class="flex items-center gap-2">
      <StatusDot state="connecting" />
      <span class="text-[10px] uppercase tracking-widest text-muted">AI · question</span>
      <span class="ml-auto text-[10px] text-dimmed tabular-nums">{{ fmtTime(ts) }}</span>
    </div>

    <!-- Message -->
    <p class="text-sm leading-relaxed text-text">{{ text }}</p>

    <!-- Tool badge -->
    <p class="text-[10px] uppercase tracking-widest text-muted">via {{ tool }}</p>

    <!-- Actions -->
    <div class="flex gap-2 pt-1">
      <button
        class="flex-1 py-1.5 text-[10px] uppercase tracking-widest border border-border hover:border-text hover:text-text transition-colors"
        @click="emit('validate')"
      >
        ✓ Valider
      </button>
      <button
        class="flex-1 py-1.5 text-[10px] uppercase tracking-widest border border-border text-dot-red border-dot-red hover:border-dot-red transition-colors opacity-70 hover:opacity-100"
        @click="emit('refuse')"
      >
        ✕ Refuser
      </button>
      <button
        class="px-4 py-1.5 text-[10px] uppercase tracking-widest border border-border text-muted hover:text-text transition-colors"
        @click="emit('ignore')"
      >
        —
      </button>
    </div>

  </div>
</template>

<script setup lang="ts">
defineProps<{
  text: string
  tool: string
  ts: number
}>()

const emit = defineEmits<{
  validate: []
  refuse: []
  ignore: []
}>()

const fmtTime = (ts: number) => {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`
}
</script>
