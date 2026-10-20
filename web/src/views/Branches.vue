<script setup>
import { computed, ref } from 'vue'
import { store, notify, ensureSaved } from '../store'
import { api } from '../api'
import LineChart from '../components/LineChart.vue'

const p = computed(() => store.project)
const result = ref(null)
const busy = ref(false)
const maxPaths = ref(4000)
const tab = ref('paths')
const showAll = ref(false)
const routeState = ref(null)
const routePicks = ref([])
const routeBusy = ref(false)
const filterLevel = ref('all')

const acts = computed(() => p.value.blueprint.acts || [])
const nodeName = (id) => p.value.narrative.nodes.find((n) => n.id === id)?.title || id

async function run() {
  await ensureSaved()
  busy.value = true
  try {
    result.value = await api.branch(store.activeId, { maxPaths: maxPaths.value })
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    busy.value = false
  }
}

async function routeStep(edgeId) {
  await ensureSaved()
  routeBusy.value = true
  try {
    routePicks.value = [...routePicks.value, edgeId]
    routeState.value = await api.branchRoute(store.activeId, routePicks.value)
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    routeBusy.value = false
  }
}

async function routeReset() {
  await ensureSaved()
  routeBusy.value = true
  try {
    routePicks.value = []
    routeState.value = await api.branchRoute(store.activeId, [])
  } finally {
    routeBusy.value = false
  }
}

async function routeAuto() {
  await ensureSaved()
  routeBusy.value = true
  try {
    routePicks.value = []
    let state = await api.branchRoute(store.activeId, [])
    let guard = 0
    while (guard++ < 24) {
      const stop = [...state.steps].reverse().find((s) => s.type === 'stop')
      if (!stop || !stop.options?.length) break
      const pick = stop.options[Math.floor(Math.random() * stop.options.length)]
      if (!pick) break
      routePicks.value.push(pick.id)
      state = await api.branchRoute(store.activeId, routePicks.value)
    }
    routeState.value = state
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    routeBusy.value = false
  }
}

const routeOptions = computed(() => {
  const steps = routeState.value?.steps || []
  const stop = [...steps].reverse().find((s) => s.type === 'stop')
  return stop?.options || []
})
const routeBlocked = computed(() => [...(routeState.value?.steps || [])].reverse().find((s) => s.type === 'blocked') || null)

const visiblePaths = computed(() => {
  const paths = result.value?.paths || []
  return showAll.value ? paths : paths.slice(0, 10)
})

const issuesByLevel = computed(() => {
  const list = result.value?.issues || []
  return {
    error: list.filter((i) => i.level === 'error'),
    warn: list.filter((i) => i.level === 'warn'),
    info: list.filter((i) => i.level === 'info')
  }
})
const filteredIssues = computed(() => {
  const all = result.value?.issues || []
  return filterLevel.value === 'all' ? all : all.filter((i) => i.level === filterLevel.value)
})

const tensionByDepth = computed(() => {
  const profile = result.value?.tensionProfile || []
  const map = new Map()
  for (const n of profile) {
    if (!map.has(n.depth)) map.set(n.depth, [])
    map.get(n.depth).push(n.tension)
  }
  const entries = [...map.entries()].sort((a, b) => a[0] - b[0])
  return {
    labels: entries.map(([d]) => `D${d}`),
    series: [{ name: '平均张力', color: '#67e8f9', values: entries.map(([, arr]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length)) }]
  }
})

function flagRefs(refs) {
  return (refs || []).map((r) => r.title || r.nodeId || r.edgeId).slice(0, 3)
}

run()
routeReset()
</script>

<template>
  <div class="page">
    <section class="card">
      <div class="card-head">
        <span class="card-title">分支演算</span>
        <span class="card-sub">从起点枚举所有可行路径（不重复节点的简单路径）</span>
        <div class="right row">
          <span class="hint">路径上限</span>
          <input v-model.number="maxPaths" type="number" min="100" max="20000" step="100" class="input slim mono" style="width: 84px" />
          <button class="btn sm primary" :disabled="busy" @click="run">{{ busy ? '演算中…' : '重新演算' }}</button>
        </div>
      </div>
      <div v-if="result" class="card-body">
        <div class="metric-grid">
          <div class="metric"><div class="metric-value">{{ result.summary.pathCount }}</div><div class="metric-label">可行路径{{ result.summary.truncated ? '（截断）' : '' }}</div></div>
          <div class="metric"><div class="metric-value">{{ result.summary.endingReachable }}/{{ result.summary.endingCount }}</div><div class="metric-label">可达结局</div></div>
          <div class="metric"><div class="metric-value">{{ result.summary.avgPathLength }}</div><div class="metric-label">平均路径长度</div></div>
          <div class="metric"><div class="metric-value">{{ result.summary.choiceCount }}</div><div class="metric-label">选择点</div></div>
          <div class="metric"><div class="metric-value">{{ result.summary.avgBranchEntropy }}</div><div class="metric-label">平均分支熵</div></div>
          <div class="metric"><div class="metric-value" :class="result.summary.deadEndCount ? 'c-rose' : ''">{{ result.summary.deadEndCount }}</div><div class="metric-label">死路节点</div></div>
          <div class="metric"><div class="metric-value" :class="result.summary.cycleCount ? 'c-amber' : ''">{{ result.summary.cycleCount }}</div><div class="metric-label">回路</div></div>
          <div class="metric"><div class="metric-value">{{ result.summary.nodeCount }}</div><div class="metric-label">节点总数</div></div>
        </div>
        <div class="row" style="margin-top: 12px; gap: 6px">
          <button class="chip" :class="{ cyan: filterLevel === 'all' }" @click="filterLevel = 'all'">全部问题 {{ result.issues.length }}</button>
          <button class="chip" :class="{ rose: filterLevel === 'error' }" @click="filterLevel = 'error'">错误 {{ issuesByLevel.error.length }}</button>
          <button class="chip" :class="{ amber: filterLevel === 'warn' }" @click="filterLevel = 'warn'">警告 {{ issuesByLevel.warn.length }}</button>
          <button class="chip" :class="{ cyan: filterLevel === 'info' }" @click="filterLevel = 'info'">提示 {{ issuesByLevel.info.length }}</button>
        </div>
      </div>
      <div v-else class="empty"><span class="spinner"></span> 正在演算分支…</div>
    </section>

    <section class="card">
      <div class="tabs">
        <button v-for="t in [
          { id: 'paths', label: '路径' },
          { id: 'endings', label: '结局覆盖' },
          { id: 'flags', label: '旗标依赖' },
          { id: 'nodes', label: '节点表' },
          { id: 'structure', label: '结构诊断' },
          { id: 'simulate', label: '逐步演算' }
        ]" :key="t.id" class="tab" :class="{ active: tab === t.id }" @click="tab = t.id">{{ t.label }}</button>
      </div>

      <div v-if="tab === 'paths'" class="card-body">
        <div class="col" style="gap: 10px">
          <div v-for="(path, i) in visiblePaths" :key="i" class="path-card">
            <div class="row">
              <span class="badge">{{ i + 1 }}</span>
              <span class="small" :class="path.ending ? 'c-green' : 'c-amber'">{{ path.endingTitle || '死路 / 未完结' }}</span>
              <span class="right mono tiny muted">概率 {{ (path.probability * 100).toFixed(2) }}% · 长度 {{ path.length }}</span>
            </div>
            <div class="path-line">
              <template v-for="(n, j) in path.nodes" :key="j">
                <span class="path-node" :class="n.type">{{ n.title }}</span>
                <span v-if="j < path.nodes.length - 1" class="path-arrow">→</span>
              </template>
            </div>
            <div class="chips">
              <span v-for="(v, k) in path.flags" :key="k" class="chip tiny green">{{ k }} = {{ v }}</span>
              <span v-if="!Object.keys(path.flags).length" class="tiny dim">无旗标变化</span>
            </div>
          </div>
          <div v-if="!result?.paths.length" class="empty">没有可行路径，请检查起点与连线条件。</div>
          <button v-if="(result?.paths.length || 0) > 10 && !showAll" class="btn sm ghost" @click="showAll = true">显示全部 {{ result.paths.length }} 条路径</button>
        </div>
      </div>

      <div v-else-if="tab === 'endings'" class="card-body">
        <table class="table">
          <thead><tr><th>结局</th><th>幕</th><th class="num">可达</th><th class="num">路径数</th><th class="num">概率质量</th><th class="num">最短 / 最长</th><th>分布</th></tr></thead>
          <tbody>
            <tr v-for="e in result?.endingStats || []" :key="e.id">
              <td><b>{{ e.title }}</b><div class="tiny dim">{{ e.id }}</div></td>
              <td class="dim">{{ acts.find((a) => a.id === e.act)?.name || e.act || '—' }}</td>
              <td class="num"><span class="badge" :class="e.reachable ? 'ok' : 'bad'">{{ e.reachable ? '是' : '否' }}</span></td>
              <td class="num">{{ e.pathCount }}</td>
              <td class="num">{{ (e.probabilityMass * 100).toFixed(2) }}%</td>
              <td class="num">{{ e.minLength ?? '—' }} / {{ e.maxLength ?? '—' }}</td>
              <td style="min-width: 120px"><div class="meter"><span :style="{ width: Math.min(100, e.probabilityMass * 100) + '%' }"></span></div></td>
            </tr>
          </tbody>
        </table>
        <div class="hint" style="margin-top: 8px">概率质量 = 所有到达该结局的路径概率之和；用于判断隐藏结局是否过于隐蔽。</div>
      </div>

      <div v-else-if="tab === 'flags'" class="card-body">
        <table class="table">
          <thead><tr><th>旗标</th><th class="num">被读</th><th class="num">被写</th><th>写入位置</th><th>读取位置</th></tr></thead>
          <tbody>
            <tr v-for="f in result?.flags || []" :key="f.flag">
              <td class="mono">{{ f.flag }}</td>
              <td class="num"><span :class="f.readBy ? '' : 'dim'">{{ f.readBy }}</span></td>
              <td class="num"><span :class="f.writtenBy ? '' : 'error-text'">{{ f.writtenBy }}</span></td>
              <td>
                <div class="chips">
                  <span v-for="(r, i) in (f.writes || []).slice(0, 4)" :key="i" class="chip tiny">{{ r.title }}</span>
                  <span v-if="!f.writes?.length" class="tiny error-text">无人写入</span>
                </div>
              </td>
              <td>
                <div class="chips">
                  <span v-for="(r, i) in (f.reads || []).slice(0, 4)" :key="i" class="chip tiny">{{ r.title }}</span>
                  <span v-if="!f.reads?.length" class="tiny dim">无人读取</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-else-if="tab === 'nodes'" class="card-body">
        <div class="table-scroll">
          <table class="table compact">
            <thead><tr><th>节点</th><th>类型</th><th>幕</th><th class="num">出口</th><th class="num">入口</th><th class="num">张力</th><th>可达</th></tr></thead>
            <tbody>
              <tr v-for="n in result?.nodes || []" :key="n.id">
                <td>{{ n.title }} <span class="tiny dim mono">{{ n.id }}</span></td>
                <td class="dim">{{ n.type }}</td>
                <td class="dim">{{ acts.find((a) => a.id === n.act)?.name || n.act || '—' }}</td>
                <td class="num">{{ n.fanout }}</td>
                <td class="num">{{ n.indegree }}</td>
                <td class="num">{{ n.tension }}</td>
                <td><span class="badge" :class="n.reachable ? 'ok' : 'bad'">{{ n.reachable ? '是' : '否' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-else-if="tab === 'structure'" class="card-body grid grid-2">
        <div class="col" style="gap: 10px">
          <div class="divider-title">关键枢纽（介数中心度）</div>
          <div v-for="h in result?.hubs || []" :key="h.id" class="hub-row">
            <div class="row"><span class="small">{{ h.title }}</span><span class="right mono tiny muted">{{ h.score }}</span></div>
            <div class="meter"><span :style="{ width: Math.round(h.score * 100) + '%' }"></span></div>
            <div class="hint">出口 {{ h.fanout }} · 入口 {{ h.indegree }}</div>
          </div>
          <div v-if="!result?.hubs?.length" class="hint">没有明显的枢纽节点。</div>
          <div class="divider-title" style="margin-top: 8px">张力 × 深度</div>
          <LineChart :series="tensionByDepth.series" :labels="tensionByDepth.labels" :height="170" :y-max="100" />
        </div>
        <div class="col" style="gap: 8px">
          <div class="divider-title">诊断明细</div>
          <div v-for="(i, idx) in filteredIssues" :key="idx" class="notice" :class="i.level === 'error' ? 'error' : i.level === 'warn' ? 'warn' : 'info'">
            <span>{{ i.level === 'error' ? '✕' : i.level === 'warn' ? '!' : 'i' }}</span>
            <div>
              <div>{{ i.message }}</div>
              <div class="tiny dim mono">{{ i.code }}</div>
            </div>
          </div>
          <div v-if="!filteredIssues.length" class="notice ok"><span>✓</span><div>当前筛选下没有发现问题。</div></div>
        </div>
      </div>

      <div v-else class="card-body">
        <div class="row wrap" style="margin-bottom: 12px">
          <button class="btn sm primary" :disabled="routeBusy" @click="routeAuto">随机走一条路线</button>
          <button class="btn sm ghost" :disabled="routeBusy" @click="routeReset">重新开始</button>
          <span class="hint">当前已走 {{ routePicks.length }} 步{{ routeState?.title ? ` · 位于「${routeState.title}」` : '' }}</span>
        </div>
        <div v-if="routeState" class="route-layout">
          <div class="timeline">
            <div class="tl-item">
              <div class="tl-rail"><span class="tl-dot" style="background: #67e8f9"></span><span class="tl-line"></span></div>
              <div class="tl-body"><div class="tl-title">起点 · {{ p.narrative.nodes.find((n) => n.id === routeState.start)?.title || '—' }}</div><div class="tl-meta">选择每一个分支，观察旗标如何累积</div></div>
            </div>
            <div v-for="(s, i) in routeState.steps" :key="i" class="tl-item">
              <div class="tl-rail">
                <span class="tl-dot" :style="{ background: s.type === 'blocked' ? '#fb7185' : s.type === 'ending' ? '#86efac' : s.type === 'stop' ? '#fbbf24' : '#7dd3fc' }"></span>
                <span v-if="i < routeState.steps.length - 1" class="tl-line"></span>
              </div>
              <div class="tl-body">
                <div v-if="s.type === 'step'">
                  <div class="tl-title">{{ s.edge.label || '默认分支' }} <span class="dim">→ {{ s.title }}</span></div>
                  <div class="tl-meta">{{ s.edge.condition?.label ? `条件：${s.edge.condition.label} · ` : '' }}{{ Object.keys(s.flags || {}).length ? '旗标：' + Object.entries(s.flags).map(([k, v]) => `${k}=${v}`).join(', ') : '无旗标变化' }}</div>
                </div>
                <div v-else-if="s.type === 'ending'" class="tl-title c-green">到达结局 · {{ s.title }}</div>
                <div v-else-if="s.type === 'blocked'" class="tl-title c-rose">被拦截：{{ s.reason }}</div>
                <div v-else class="tl-title c-amber">等待选择 · {{ s.title }}</div>
              </div>
            </div>
          </div>
          <div class="route-options">
            <div class="divider-title">可选分支</div>
            <div v-if="routeBlocked" class="notice error">{{ routeBlocked.reason }}</div>
            <button v-for="o in routeOptions" :key="o.id" class="route-option" :disabled="routeBusy" @click="routeStep(o.id)">
              <span class="grow">{{ o.label || '默认分支' }} → {{ nodeName(o.to) }}</span>
              <span v-if="o.condition" class="chip tiny violet">{{ o.condition.label || '条件' }}</span>
              <span v-if="o.effects && Object.keys(o.effects.flags || {}).length" class="chip tiny green">旗标 +{{ Object.keys(o.effects.flags).length }}</span>
            </button>
            <div v-if="!routeOptions.length && !routeBlocked" class="empty" style="padding: 18px">路线已结束。点击「重新开始」再来一次。</div>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.path-card { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; background: rgba(2, 6, 23, 0.32); }
.path-line { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; margin: 8px 0; }
.path-node { font-size: 11px; padding: 2px 7px; border-radius: 5px; background: rgba(148, 163, 184, 0.1); color: var(--muted); }
.path-node.ending { background: rgba(134, 239, 172, 0.12); color: #bbf7d0; }
.path-node.combat { background: rgba(251, 113, 133, 0.12); color: #fecdd3; }
.path-node.choice { background: rgba(251, 191, 36, 0.1); color: #fde68a; }
.path-arrow { color: var(--dim); font-size: 10px; }
.hub-row { padding: 7px 9px; border: 1px solid var(--line); border-radius: 8px; background: rgba(2, 6, 23, 0.3); }
.route-layout { display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(280px, 0.7fr); gap: 16px; }
.route-options { display: flex; flex-direction: column; gap: 7px; }
.route-option { display: flex; align-items: center; gap: 8px; text-align: left; padding: 10px; border-radius: 9px; border: 1px solid var(--line); background: rgba(2, 6, 23, 0.35); color: var(--text); cursor: pointer; font-size: 12px; }
.route-option:hover { border-color: rgba(103, 232, 249, 0.4); background: rgba(103, 232, 249, 0.06); }
.route-option:disabled { opacity: 0.5; cursor: wait; }
@media (max-width: 980px) {
  .route-layout { grid-template-columns: 1fr; }
}
</style>





