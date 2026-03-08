<template>
  <div
    class="flex items-center justify-between px-7 py-4 shrink-0"
    style="border-bottom:1px solid var(--border)"
  >
    <span class="text-[9px] tracking-[0.25em] uppercase" style="color:var(--muted)">{{ title }}</span>
    <button
      v-if="action"
      class="text-[9px] tracking-[0.15em] uppercase transition-opacity hover:opacity-100"
      style="background:none;border:none;color:var(--muted);cursor:pointer;opacity:0.7;padding:0"
      @click="$emit('action')"
    >{{ action }}</button>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string; action?: string }>()
defineEmits<{ (e: 'action'): void }>()
</script>
