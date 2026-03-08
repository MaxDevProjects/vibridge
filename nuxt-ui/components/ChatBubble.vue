<!--
  ChatBubble — single chat message (AI or user)
-->
<template>
  <div
    class="flex flex-col gap-1"
    :class="direction === 'user' ? 'items-end' : 'items-start'"
  >
    <!-- Sender label -->
    <span class="text-[9px] uppercase tracking-widest text-muted px-1">
      {{ direction === 'user' ? 'YOU' : tool }}
    </span>

    <!-- Bubble -->
    <div
      class="max-w-[80%] px-3 py-2 text-xs leading-relaxed border"
      :class="direction === 'user'
        ? 'bg-surface2 border-text text-text'
        : 'bg-surface border-border text-text'"
    >
      <!-- Render newlines -->
      <span v-for="(line, i) in lines" :key="i">
        {{ line }}<br v-if="i < lines.length - 1" />
      </span>
    </div>

    <!-- Timestamp -->
    <span class="text-[9px] text-dimmed tabular-nums px-1">{{ fmtTime(ts) }}</span>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  text: string
  direction: 'user' | 'ai'
  tool?: string
  ts: number
}>()

const lines = computed(() => props.text.split('\n'))

const fmtTime = (ts: number) => {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
}
</script>
