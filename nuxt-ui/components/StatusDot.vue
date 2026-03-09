<!--
  StatusDot — coloured dot with optional mode/latency label
  Props:
    state   = 'connected' | 'connecting' | 'disconnected'
    mode    = 'local' | 'relay'  (optional — shows text label)
    latency = number | null      (optional — shows ms)
-->
<template>
  <span class="inline-flex items-center gap-1.5">
    <span
      class="inline-block w-2 h-2 rounded-full shrink-0"
      :class="[colorClass, pulse ? 'vb-pulse' : '']"
    />
    <span
      v-if="labelText"
      class="text-[10px] tracking-[0.08em] uppercase"
      :style="labelStyle"
    >{{ labelText }}</span>
  </span>
</template>

<script setup lang="ts">
type State = 'connected' | 'connecting' | 'disconnected'

const props = defineProps<{
  state: State
  pulse?: boolean
  mode?: 'local' | 'relay' | null
  latency?: number | null
}>()

const colorClass = computed(() => ({
  connected:    'bg-dot-green',
  connecting:   'bg-dot-amber',
  disconnected: 'bg-dot-red',
}[props.state]))

const pulse = computed(() => props.state === 'connecting')

const labelText = computed(() => {
  if (!props.mode && props.latency == null) return ''
  if (props.state === 'connecting') return 'Connexion…'
  if (props.state === 'disconnected') return 'Hors ligne'
  const modeLabel = props.mode === 'relay' ? 'Relay' : props.mode === 'local' ? 'Local' : ''
  const latLabel = props.latency != null ? `· ${props.latency}ms` : ''
  return [modeLabel, latLabel].filter(Boolean).join(' ')
})

const labelStyle = computed(() => {
  const c = { connected: 'var(--dot-green)', connecting: 'var(--dot-amber)', disconnected: 'var(--dot-red)' }[props.state]
  return `color:${c}`
})
</script>
