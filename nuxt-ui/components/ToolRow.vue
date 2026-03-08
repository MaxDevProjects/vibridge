<!-- ToolRow — single default routing target -->
<template>
  <div class="flex items-center justify-between py-2.5 border-b border-border last:border-0">
    <div class="flex items-center gap-3 min-w-0">
      <StatusDot :state="available ? (model ? 'connected' : 'connecting') : 'disconnected'" />
      <div class="min-w-0">
        <p class="text-xs truncate text-text">{{ name }}</p>
        <p class="text-[10px] text-muted uppercase tracking-wider">{{ available ? type : reason || `${type} indisponible` }}</p>
      </div>
    </div>
    <button
      class="text-[10px] tracking-widest uppercase px-3 py-1 border border-border transition-colors shrink-0"
      :class="model
        ? 'text-text border-text'
        : 'text-muted hover:text-text hover:border-text'"
      :disabled="!available"
      @click="model = !model"
    >
      {{ !available ? 'INDISPONIBLE' : model ? 'PAR DÉFAUT' : 'CHOISIR' }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  name: string
  type: string
  available?: boolean
  reason?: string | null
}>()

const model = defineModel<boolean>({ default: false })
</script>
