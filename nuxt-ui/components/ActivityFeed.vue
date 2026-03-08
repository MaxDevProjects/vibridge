<!--
  ActivityFeed — scrollable list of log entries
-->
<template>
  <div class="flex flex-col gap-0 overflow-y-auto font-mono text-[11px]">
    <div
      v-for="entry in entries"
      :key="entry.id"
      class="flex items-start gap-2 px-0 py-1.5 border-b border-border last:border-0"
    >
      <!-- Timestamp -->
      <span class="text-dimmed shrink-0 tabular-nums">{{ fmtTime(entry.ts) }}</span>
      <!-- Tag -->
      <span
        class="shrink-0 uppercase tracking-widest px-1 text-[9px] border"
        :class="tagClass(entry.tag)"
      >{{ entry.tag }}</span>
      <!-- Message -->
      <span class="text-text break-all leading-snug">{{ entry.text }}</span>
    </div>

    <p v-if="!entries.length" class="py-4 text-center text-muted text-xs">
      — no activity —
    </p>
  </div>
</template>

<script setup lang="ts">
export interface ActivityEntry {
  id: string
  ts: number
  tag: 'info' | 'ai' | 'user' | 'sys' | 'err'
  text: string
}

defineProps<{
  entries: ActivityEntry[]
}>()

const fmtTime = (ts: number) => {
  const d = new Date(ts)
  return [
    d.getHours().toString().padStart(2, '0'),
    d.getMinutes().toString().padStart(2, '0'),
    d.getSeconds().toString().padStart(2, '0'),
  ].join(':')
}

const tagClass = (tag: ActivityEntry['tag']) => ({
  info: 'border-border text-muted',
  ai:   'border-text text-text',
  user: 'border-muted text-muted',
  sys:  'border-dimmed text-dimmed',
  err:  'border-dot-red text-dot-red',
}[tag])
</script>
