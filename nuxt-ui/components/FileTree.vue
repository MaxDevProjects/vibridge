<!--
  FileTree — recursive file/directory tree
-->
<template>
  <ul class="font-mono text-xs select-none">
    <li
      v-for="node in nodes"
      :key="node.path"
    >
      <!-- Directory -->
      <template v-if="node.type === 'dir'">
        <button
          class="w-full flex items-center gap-1.5 py-1 px-2 hover:bg-surface2 text-left transition-colors"
          :style="{ paddingLeft: `${depth * 12 + 8}px` }"
          @click="toggle(node.path)"
        >
          <span class="text-muted shrink-0">{{ open.has(node.path) ? '▾' : '▸' }}</span>
          <span class="text-muted shrink-0">◫</span>
          <span class="text-text truncate">{{ node.name }}</span>
        </button>
        <FileTree
          v-if="open.has(node.path) && node.children"
          :nodes="node.children"
          :depth="depth + 1"
          :active="active"
          @select="emit('select', $event)"
        />
      </template>

      <!-- File -->
      <button
        v-else
        class="w-full flex items-center gap-1.5 py-1 px-2 hover:bg-surface2 text-left transition-colors"
        :class="active === node.path ? 'bg-surface2 text-text' : 'text-muted'"
        :style="{ paddingLeft: `${depth * 12 + 8}px` }"
        @click="emit('select', node.path)"
      >
        <span class="text-dimmed shrink-0">◦</span>
        <span class="truncate">{{ node.name }}</span>
      </button>

    </li>
  </ul>
</template>

<script setup lang="ts">
export interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
}

const props = defineProps<{
  nodes: FileNode[]
  depth?: number
  active?: string
}>()

const emit = defineEmits<{
  select: [path: string]
}>()

const depth = computed(() => props.depth ?? 0)

const open = ref<Set<string>>(new Set())
const toggle = (path: string) => {
  if (open.value.has(path)) open.value.delete(path)
  else open.value.add(path)
}
</script>
