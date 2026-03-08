<!--
  StatusDot — coloured dot with optional pulse animation
  Props: state = 'connected' | 'connecting' | 'disconnected'
-->
<template>
  <span
    class="inline-block w-2 h-2 rounded-full shrink-0"
    :class="[colorClass, pulse ? 'vb-pulse' : '']"
  />
</template>

<script setup lang="ts">
type State = 'connected' | 'connecting' | 'disconnected'

const props = defineProps<{
  state: State
  pulse?: boolean
}>()

const colorClass = computed(() => ({
  connected:    'bg-dot-green',
  connecting:   'bg-dot-amber',
  disconnected: 'bg-dot-red',
}[props.state]))

const pulse = computed(() => props.state === 'connecting')
</script>
