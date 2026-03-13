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
      <div class="flex flex-col gap-2">
        <template v-for="(block, blockIndex) in formatted.blocks" :key="`${ts}-${blockIndex}`">
          <div
            v-if="block.type === 'code'"
            class="overflow-x-auto border border-border bg-surface2 px-2.5 py-2 text-[11px] leading-relaxed font-mono"
          >
            <div
              v-for="(line, lineIndex) in block.lines"
              :key="`${blockIndex}-${lineIndex}`"
              class="whitespace-pre-wrap break-words"
            >
              <span v-for="(segment, segmentIndex) in lineSegments(blockIndex, lineIndex, line)" :key="`${blockIndex}-${lineIndex}-${segmentIndex}`">
                <code v-if="segment.type === 'path'" class="font-mono text-[0.95em]">{{ segment.text }}</code>
                <template v-else>{{ segment.text }}</template>
              </span>
              <button
                v-if="line.isLong"
                class="ml-2 text-[10px] uppercase tracking-[0.12em] font-mono"
                style="color:var(--muted)"
                @click="toggleExpanded(blockIndex, lineIndex)"
              >
                {{ isExpanded(blockIndex, lineIndex) ? 'Voir moins' : 'Voir plus' }}
              </button>
            </div>
          </div>
          <div v-else class="flex flex-col gap-1">
            <div
              v-for="(line, lineIndex) in block.lines"
              :key="`${blockIndex}-${lineIndex}`"
              class="whitespace-pre-wrap break-words"
            >
              <span v-for="(segment, segmentIndex) in lineSegments(blockIndex, lineIndex, line)" :key="`${blockIndex}-${lineIndex}-${segmentIndex}`">
                <code v-if="segment.type === 'path'" class="font-mono text-[0.95em]">{{ segment.text }}</code>
                <template v-else>{{ segment.text }}</template>
              </span>
              <button
                v-if="line.isLong"
                class="ml-2 text-[10px] uppercase tracking-[0.12em] font-mono"
                style="color:var(--muted)"
                @click="toggleExpanded(blockIndex, lineIndex)"
              >
                {{ isExpanded(blockIndex, lineIndex) ? 'Voir moins' : 'Voir plus' }}
              </button>
            </div>
          </div>
        </template>
      </div>
    </div>

    <div
      v-if="direction === 'ai' && showQuickReplies && quickReplyState.hasChoices && !quickReplyDismissed"
      class="max-w-[80%] flex flex-wrap gap-2 px-1 pt-1"
    >
      <button
        v-for="choice in quickReplyState.choices"
        :key="choice.key"
        class="px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] font-mono whitespace-nowrap"
        style="border:1px solid var(--border);background:none;color:var(--text)"
        @click="selectQuickReply(choice.value)"
      >
        {{ quickReplyLabel(choice) }}
      </button>
    </div>

    <!-- Timestamp -->
    <span class="text-[9px] text-dimmed tabular-nums px-1">{{ fmtTime(ts) }}</span>
  </div>
</template>

<script setup lang="ts">
import type { QuickReplyChoice } from '~/composables/useQuickReplies'

const props = defineProps<{
  text: string
  direction: 'user' | 'ai'
  tool?: string
  ts: number
  showQuickReplies?: boolean
}>()

const emit = defineEmits<{
  quickReply: [value: string]
}>()

const formatted = computed(() => formatTerminalMessage(props.text))
const quickReplyState = computed(() => useQuickReplies(props.text))
const expandedLines = ref<Record<string, boolean>>({})
const quickReplyDismissed = ref(false)

watch(() => props.text, () => {
  expandedLines.value = {}
  quickReplyDismissed.value = false
})

function lineKey(blockIndex: number, lineIndex: number) {
  return `${blockIndex}:${lineIndex}`
}

function isExpanded(blockIndex: number, lineIndex: number) {
  return Boolean(expandedLines.value[lineKey(blockIndex, lineIndex)])
}

function toggleExpanded(blockIndex: number, lineIndex: number) {
  const key = lineKey(blockIndex, lineIndex)
  expandedLines.value[key] = !expandedLines.value[key]
}

function lineSegments(
  blockIndex: number,
  lineIndex: number,
  line: { raw: string; preview: string; isLong: boolean },
) {
  const content = line.isLong && !isExpanded(blockIndex, lineIndex) ? line.preview : line.raw
  return splitTerminalInlineSegments(content)
}

function quickReplyLabel(choice: QuickReplyChoice) {
  if (choice.style === 'binary') {
    return choice.value.toLowerCase() === 'y' ? '✓ Oui' : '✗ Non'
  }
  return `${choice.key} · ${choice.label}`
}

function selectQuickReply(value: string) {
  quickReplyDismissed.value = true
  emit('quickReply', value)
}

const fmtTime = (ts: number) => {
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}:${d.getSeconds().toString().padStart(2,'0')}`
}
</script>
