<script setup>
import { computed, onMounted, ref } from 'vue'
import { store, ensureSaved, notify } from '../../store'
import { api } from '../../api'

const report = ref(null)
const loading = ref(false)
const tab = ref('choices')

async function load() {
  loading.value = true
  try {
    await ensureSaved()
    report.value = await api.analytics(store.activeId)
  } catch (e) {
    notify(`分析失败：${e.message}`, 'error')
  } finally {
    loading.value = false
  }
}

const summary = computed(() => report.value?.summary || {})
const choices = computed(() => report.value?.choices || [])
const endings = computed(() => report.value?.endings || [])
const quests = computed(() => report.value?.quests || [])
const dialogues = computed(() => report.value?.dialogues || [])
const issues = computed(() => (report.value?.issues || []).filter((i) => i.level !== 'info'))
const maxShare = computed(() => Math.max(1, ...choices.value.flatMap((c) => c.options.map((o) => o.share))))

function exportJson() {
  const blob = new Blob([JSON.stringify(report.value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.project.name}-analytics.json`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
onMounted(load)
</script>

<template>
  <div class="studio-panel analytics-panel">
    <div class="panel-head">
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <span class="badge">节点 {{ summary.nodes || 0 }}</span>
        <span class="badge">路径 {{ summary.paths || 0 }}</span>
        <span class="badge">结局 {{ summary.endingsReachable || 0 }}/{{ summary.endings || 0 }}</span>
        <span class="chip tiny" :class="summary.riskCount ? 'rose' : 'green'">结构错误 {{ summary.riskCount || 0 }}</span>
      </div>
      <div class="row" style="gap: 6px">
        <button class="btn sm ghost" @click="load">{{ loading ? '…' : '↻ 重新分析' }}</button>
        <button class="btn sm ghost" @click="exportJson">导出 JSON</button>
      </div>
    </div>

    <div class="kpi-grid">
      <div class="kpi"><b>{{ summary.choiceNodes || 0 }}</b><span>选择节点</span></div>
      <div class="kpi"><b>{{ summary.avgEntropy || 0 }}</b><span>平均分支熵</span></div>
      <div class="kpi"><b>{{ summary.avgPathLength || 0 }}</b><span>平均路径长度</span></div>
      <div class="kpi"><b>{{ summary.quests || 0 }}</b><span>任务</span></div>
      <div class="kpi"><b>{{ summary.dialogueLines || 0 }}</b><span>对话行</span></div>
      <div class="kpi"><b>{{ summary.dialogues || 0 }}</b><span>对话段</span></div>
    </div>

    <div class="tabs">
      <button class="tab" :class="{ active: tab === 'choices' }" @click="tab = 'choices'">选择热力</button>
      <button class="tab" :class="{ active: tab === 'endings' }" @click="tab = 'endings'">结局分布</button>
      <button class="tab" :class="{ active: tab === 'content' }" @click="tab = 'content'">任务 / 对话覆盖</button>
      <button class="tab" :class="{ active: tab === 'issues' }" @click="tab = 'issues'">结构风险</button>
    </div>

    <section v-if="tab === 'choices'" class="card">
      <div class="card-head"><span class="card-title">选择热力</span><span class="tiny dim">基于路径枚举的近似概率；不是真实玩家数据</span></div>
      <div class="choice-list">
        <div v-for="c in choices" :key="c.nodeId" class="choice-group">
          <div class="row" style="justify-content: space-between"><b class="small">{{ c.title }}</b><span class="tiny dim">{{ c.total }} 条路径</span></div>
          <div v-for="o in c.options" :key="o.id" class="option-row">
            <span class="option-label">{{ o.label }}</span>
            <div class="bar"><div class="fill" :style="{ width: `${(o.share / maxShare) * 100}%` }"></div></div>
            <span class="option-pct">{{ o.share }}%</span>
            <span v-if="o.conditions" class="chip tiny amber">条件</span>
          </div>
        </div>
        <div v-if="!choices.length" class="empty" style="padding: 25px">没有可分析的选择</div>
      </div>
    </section>

    <section v-else-if="tab === 'endings'" class="card">
      <div class="card-head"><span class="card-title">结局覆盖</span></div>
      <div class="content-list">
        <div v-for="e in endings" :key="e.id" class="ending-row">
          <div><b class="small">{{ e.title }}</b><div class="tiny dim">{{ e.id }} · {{ e.pathCount }} 条路径</div></div>
          <div class="bar" style="flex: 1"><div class="fill" :style="{ width: `${Math.min(100, e.probability)}%` }"></div></div>
          <span class="chip tiny" :class="e.reachable ? 'green' : 'rose'">{{ e.reachable ? `${e.probability}%` : '不可达' }}</span>
        </div>
      </div>
    </section>

    <section v-else-if="tab === 'content'" class="content-grid">
      <div class="card">
        <div class="card-head"><span class="card-title">任务覆盖</span><span class="badge">{{ quests.length }}</span></div>
        <div class="content-list">
          <div v-for="q in quests" :key="q.id" class="content-row"><b class="small">{{ q.title }}</b><span class="tiny dim">{{ q.npc }} · {{ q.objectives }} 目标 · {{ q.status }}</span></div>
          <div v-if="!quests.length" class="hint">没有任务</div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">对话覆盖</span><span class="badge">{{ dialogues.length }}</span></div>
        <div class="content-list">
          <div v-for="d in dialogues" :key="d.id" class="content-row"><b class="small">{{ d.npc }} · {{ d.id }}</b><span class="tiny dim">{{ d.lines }} 行 · {{ d.choices }} 选项 {{ d.hasQuest ? '· 带任务' : '' }}</span></div>
          <div v-if="!dialogues.length" class="hint">没有对话</div>
        </div>
      </div>
    </section>

    <section v-else class="card">
      <div class="card-head"><span class="card-title">结构风险</span><span class="badge">{{ issues.length }}</span></div>
      <div class="content-list">
        <div v-for="(i, idx) in issues" :key="idx" class="warning-row" :class="i.level">
          <span>{{ i.level === 'error' ? '✕' : '!' }}</span><span class="tiny">{{ i.message }}</span>
        </div>
        <div v-if="!issues.length" class="notice ok" style="padding: 7px; margin: 8px"><span>✓</span><div class="tiny">没有结构预警。</div></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.analytics-panel { display: flex; flex-direction: column; gap: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.kpi-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; }
.kpi { border: 1px solid var(--line); border-radius: 8px; padding: 8px; text-align: center; background: rgba(2, 6, 23, 0.25); }
.kpi b { display: block; font-size: 18px; font-family: var(--mono); color: #e6fbff; }
.kpi span { font-size: 9px; color: var(--dim); }
.tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--line); }
.tab { border: 0; background: transparent; color: var(--dim); padding: 6px 10px; font-size: 11px; cursor: pointer; border-bottom: 2px solid transparent; }
.tab.active { color: var(--cyan); border-bottom-color: var(--cyan); }
.choice-list, .content-list { padding: 8px 12px; display: flex; flex-direction: column; gap: 8px; max-height: 480px; overflow: auto; }
.choice-group { border-bottom: 1px dashed var(--line); padding-bottom: 7px; }
.option-row { display: grid; grid-template-columns: minmax(80px, 180px) 1fr 52px auto; align-items: center; gap: 6px; margin-top: 4px; font-size: 11px; }
.option-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bar { height: 8px; background: rgba(148, 163, 184, 0.08); border-radius: 4px; overflow: hidden; }
.fill { height: 100%; background: linear-gradient(90deg, rgba(103, 232, 249, 0.45), rgba(103, 232, 249, 0.12)); }
.option-pct { font-family: var(--mono); font-size: 10px; text-align: right; color: var(--cyan); }
.ending-row { display: flex; align-items: center; gap: 8px; }
.content-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.content-row { display: flex; flex-direction: column; gap: 1px; padding: 5px 0; border-bottom: 1px dashed var(--line); }
@media (max-width: 1000px) { .kpi-grid { grid-template-columns: repeat(3, 1fr); } .content-grid { grid-template-columns: 1fr; } }
</style>
