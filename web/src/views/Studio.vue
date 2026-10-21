<script setup>
import { computed, ref } from 'vue'
import { store } from '../store'
import PlaytestPanel from './studio/PlaytestPanel.vue'
import LocalizationPanel from './studio/LocalizationPanel.vue'
import AssetsPanel from './studio/AssetsPanel.vue'
import ProductionPanel from './studio/ProductionPanel.vue'
import StoryboardPanel from './studio/StoryboardPanel.vue'
import StoryletsPanel from './studio/StoryletsPanel.vue'
import ReviewPanel from './studio/ReviewPanel.vue'
import AnalyticsPanel from './studio/AnalyticsPanel.vue'

const project = computed(() => store.project)
const tab = ref('play')
const tabs = [
  { id: 'play', label: '试玩 / 存档', icon: '▶' },
  { id: 'loc', label: '本地化 / 配音', icon: '文' },
  { id: 'assets', label: '资产库', icon: '◈' },
  { id: 'production', label: '制作看板', icon: '▤' },
  { id: 'storyboard', label: '演出时间线', icon: '▭' },
  { id: 'storylets', label: '动态叙事', icon: '✦' },
  { id: 'review', label: '评审 / 评论', icon: '✎' },
  { id: 'analytics', label: '选择分析', icon: '⌁' }
]
</script>

<template>
  <div class="page studio-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">叙事运营</h1>
        <p class="page-desc">试玩、本地化、资产、制作、演出、动态叙事、评审与选择分析——全部基于当前企划快照。</p>
      </div>
      <div class="head-actions">
        <span class="badge">{{ project?.name }}</span>
        <span class="badge">r{{ store.revision }}</span>
      </div>
    </div>

    <div class="studio-tabs">
      <button v-for="t in tabs" :key="t.id" class="studio-tab" :class="{ active: tab === t.id }" @click="tab = t.id">
        <span class="studio-tab-icon">{{ t.icon }}</span>{{ t.label }}
      </button>
    </div>

    <PlaytestPanel v-if="tab === 'play'" />
    <LocalizationPanel v-else-if="tab === 'loc'" />
    <AssetsPanel v-else-if="tab === 'assets'" />
    <ProductionPanel v-else-if="tab === 'production'" />
    <StoryboardPanel v-else-if="tab === 'storyboard'" />
    <StoryletsPanel v-else-if="tab === 'storylets'" />
    <ReviewPanel v-else-if="tab === 'review'" />
    <AnalyticsPanel v-else-if="tab === 'analytics'" />
  </div>
</template>

<style scoped>
.studio-page { height: calc(100vh - 112px); min-height: 650px; display: flex; flex-direction: column; min-width: 0; }
.studio-tabs { display: flex; gap: 3px; overflow-x: auto; padding: 0 0 10px; border-bottom: 1px solid var(--line); flex: 0 0 auto; }
.studio-tab { display: flex; align-items: center; gap: 5px; flex: 0 0 auto; border: 1px solid transparent; background: transparent; color: var(--dim); border-radius: 8px; padding: 7px 10px; font-size: 11px; cursor: pointer; white-space: nowrap; }
.studio-tab:hover { color: var(--text); background: rgba(148, 163, 184, 0.06); }
.studio-tab.active { color: var(--cyan); border-color: rgba(103, 232, 249, 0.34); background: rgba(103, 232, 249, 0.08); }
.studio-tab-icon { font-family: var(--mono); font-size: 12px; opacity: 0.9; }
.studio-page > :deep(.studio-panel) { flex: 1; min-height: 0; overflow: auto; padding-top: 12px; }
</style>
