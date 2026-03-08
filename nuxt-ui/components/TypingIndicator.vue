<!--
  TypingIndicator — animated 3-dot "AI is typing" indicator
-->
<template>
  <div class="flex items-center gap-1 px-3 py-2 bg-surface border border-border w-fit">
    <span class="text-[9px] uppercase tracking-widest text-muted mr-2">{{ tool }}</span>
    <span class="w-1.5 h-1.5 rounded-full bg-text vb-dot-1" />
    <span class="w-1.5 h-1.5 rounded-full bg-text vb-dot-2" />
    <span class="w-1.5 h-1.5 rounded-full bg-text vb-dot-3" />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tool?: string
}>()
</script>
