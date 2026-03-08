<template>
  <div
    class="flex items-center justify-between py-2.5"
    style="border-bottom:1px solid var(--border)"
  >
    <span class="text-[9px] tracking-[0.15em] uppercase" style="color:var(--muted)">{{ label }}</span>
    <slot name="value">
      <span
        class="text-[11px]"
        :style="mono ? 'font-family:var(--font-mono, monospace);color:var(--text)' : 'color:var(--text)'"
      >{{ value }}</span>
    </slot>
  </div>
</template>

<script setup lang="ts">
defineProps<{ label: string; value?: string; mono?: boolean }>()
</script>
