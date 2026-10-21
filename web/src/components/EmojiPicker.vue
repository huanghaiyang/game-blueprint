<script setup>
import { computed, ref } from 'vue'
import { EMOJI_GROUPS, ALL_EMOJI } from '../emoji'

const props = defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const active = ref(EMOJI_GROUPS[0]?.id || 'place')
const search = ref('')
const custom = ref('')

const tabs = computed(() => [...EMOJI_GROUPS, { id: 'all', name: '全部', items: ALL_EMOJI }])
const current = computed(() => {
  const q = search.value.trim()
  if (q) {
    const groups = EMOJI_GROUPS.filter((g) => g.name.includes(q) || g.id.includes(q.toLowerCase()))
    if (groups.length) return groups.flatMap((g) => g.items)
    return ALL_EMOJI.filter((e) => q.includes(e) || e.includes(q)).slice(0, 240)
  }
  if (active.value === 'all') return ALL_EMOJI
  return tabs.value.find((g) => g.id === active.value)?.items || []
})

function pick(e) {
  emit('update:modelValue', e)
}

function useCustom() {
  const v = custom.value.trim().slice(0, 16)
  if (v) {
    emit('update:modelValue', v)
    custom.value = ''
  }
}
</script>

<template>
  <div class="emoji-picker">
    <div class="ep-top">
      <input v-model="search" class="input slim" placeholder="搜索分类，或粘贴 emoji…" />
      <span class="ep-current">{{ modelValue || '—' }}</span>
    </div>
    <div class="ep-tabs">
      <button v-for="g in tabs" :key="g.id" class="ep-tab" :class="{ active: active === g.id && !search }" @click="active = g.id; search = ''">
        {{ g.name }}
      </button>
    </div>
    <div class="ep-grid">
      <button
        v-for="(e, i) in current"
        :key="`${e}-${i}`"
        class="ep-item"
        :class="{ selected: modelValue === e }"
        :title="e"
        @click="pick(e)"
      >{{ e }}</button>
      <div v-if="!current.length" class="hint" style="grid-column: 1 / -1">没有匹配的 emoji</div>
    </div>
    <div class="ep-custom">
      <input v-model="custom" class="input slim grow" placeholder="或粘贴任意 emoji / 符号" @keydown.enter="useCustom" />
      <button class="btn sm ghost" :disabled="!custom.trim()" @click="useCustom">使用</button>
    </div>
  </div>
</template>

<style scoped>
.emoji-picker { border: 1px solid var(--line-strong); border-radius: 10px; background: rgba(2, 6, 23, 0.45); padding: 8px; }
.ep-top { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; }
.ep-top .input { flex: 1; }
.ep-current { width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 8px; font-size: 20px; background: rgba(15, 23, 42, 0.8); }
.ep-tabs { display: flex; gap: 3px; overflow: auto; padding-bottom: 4px; margin-bottom: 4px; }
.ep-tab { flex: 0 0 auto; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--dim); font-size: 10px; padding: 4px 6px; cursor: pointer; }
.ep-tab:hover { color: var(--text); }
.ep-tab.active { color: var(--cyan); border-color: rgba(103, 232, 249, 0.35); background: rgba(103, 232, 249, 0.08); }
.ep-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(32px, 1fr)); gap: 3px; max-height: 190px; overflow: auto; padding: 2px; }
.ep-item { width: 100%; aspect-ratio: 1; border: 1px solid transparent; border-radius: 6px; background: transparent; font-size: 19px; line-height: 1; cursor: pointer; display: grid; place-items: center; padding: 0; font-family: "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif; }
.ep-item:hover { background: rgba(148, 163, 184, 0.12); border-color: var(--line); }
.ep-item.selected { border-color: var(--cyan); background: rgba(103, 232, 249, 0.12); }
.ep-custom { display: flex; gap: 5px; margin-top: 6px; }
</style>
