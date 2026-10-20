<script setup>
import { computed, onMounted, ref } from 'vue'
import { store, navigate, boot, notify, ensureSaved } from '../store'
import { api } from '../api'
import LineChart from '../components/LineChart.vue'

const branch = ref(null)
const loading = ref(true)
const fileInput = ref(null)
const p = computed(() => store.project)
const acts = computed(() => p.value?.blueprint?.acts || [])

const actTension = computed(() =>
  acts.value.map((a) => {
    const list = p.value.narrative.nodes.filter((n) => n.act === a.id)
    const avg = list.length ? Math.round(list.reduce((s, n) => s + (Number(n.tension) || 0), 0) / list.length) : 0
    return { name: a.name, avg, target: Number(a.tensionTarget) || 0, count: list.length }
  })
)
const curve = computed(() => ({
  labels: actTension.value.map((a) => a.name.replace(/^第.幕[ ·]*/, '')),
  series: [
    { name: '实际平均张力', color: '#67e8f9', values: actTension.value.map((a) => a.avg) },
    { name: '目标张力', color: '#a78bfa', values: actTension.value.map((a) => a.target) }
  ]
}))

const counts = computed(() => {
  const n = p.value.narrative.nodes
  return {
    nodes: n.length,
    edges: p.value.narrative.edges.length,
    choices: n.filter((x) => x.type === 'choice').length,
    endings: n.filter((x) => x.type === 'ending').length,
    characters: p.value.characters.length,
    cases: p.value.cases.length,
    attrs: p.value.stats.attributes.length,
    formulas: p.value.stats.formulas.length
  }
})

const health = computed(() => {
  if (!branch.value) return null
  const issues = branch.value.issues || []
  const errors = issues.filter((i) => i.level === 'error').length
  const warns = issues.filter((i) => i.level === 'warn').length
  return { errors, warns, paths: branch.value.summary.pathCount, reachable: branch.value.summary.endingReachable, endings: branch.value.summary.endingCount }
})

const modules = [
  { id: 'narrative', route: 'narrative', icon: '⌗', title: '叙事图谱', desc: '18 个节点与连线的 3D 网络，直接编辑场景、抉择、旗标与条件。', tone: '#7dd3fc' },
  { id: 'characters', route: 'characters', icon: '◉', title: '角色设计', desc: '人物卡、动机、缺陷、弧光与关系网，数值与叙事放在一起校准。', tone: '#f0abfc' },
  { id: 'stats', route: 'stats', icon: '▤', title: '数值管理', desc: '属性体系、安全公式引擎与成长曲线，成长异常自动预警。', tone: '#fbbf24' },
  { id: 'combat', route: 'combat', icon: '⚔', title: '数值对抗', desc: '回合制伤害模型 + 蒙特卡洛，胜率、回合分布与对抗矩阵。', tone: '#fb7185' },
  { id: 'branches', route: 'branches', icon: '⑂', title: '分支演算', desc: '路径枚举、概率质量、旗标依赖、死路与环检测，可逐步演算。', tone: '#86efac' },
  { id: 'world', route: 'world', icon: '◍', title: '开放世界', desc: '无限画布大地图：聚落状态、NPC 特定对话、任务派发与传送门。', tone: '#5eead4' },
  { id: 'inference', route: 'inference', icon: '⌕', title: '推理', desc: '线索前向链与可信度传播，嫌疑排序、矛盾检测与待补线索。', tone: '#c084fc' },
  { id: 'blueprint', route: 'blueprint', icon: '▦', title: '走向蓝图', desc: '分幕结构、节奏曲线、结局覆盖，一键生成可交付 Markdown。', tone: '#67e8f9' }
]
const enabledModules = computed(() => modules.filter((m) => p.value?.meta?.modules?.[m.id] !== false))


function exportProject() {
  const blob = new Blob([JSON.stringify(p.value, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${p.value.name || '项目'}-企划数据.json`
  a.click()
  URL.revokeObjectURL(url)
  notify('企划 JSON 已导出', 'ok')
}

async function importProject(ev) {
  const file = ev.target.files?.[0]
  if (!file) return
  try {
    const data = JSON.parse(await file.text())
    const project = data.project || data
    if (!project.narrative?.nodes) throw new Error('不是有效的企划文件（缺少 narrative.nodes）')
    if (!confirm(`导入「${project.name || '未命名'}」会覆盖当前企划，确定继续？`)) return
    await api.putProject(project, store.revision)
    await boot()
    notify('企划已导入', 'ok')
  } catch (e) {
    notify(`导入失败：${e.message}`, 'error', 5000)
  } finally {
    ev.target.value = ''
  }
}

onMounted(async () => {
  try {
    await ensureSaved()
    branch.value = await api.branch(store.activeId)
  } catch (e) {
    /* 留空，不影响总览 */
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="page">
    <section class="hero card">
      <div class="hero-inner">
        <div class="hero-main">
          <div class="chips">
            <span class="chip cyan">{{ p.meta.genre || '未标注题材' }}</span>
            <span class="chip violet">{{ p.meta.platform || '平台未定' }}</span>
            <span class="chip">{{ p.meta.playtime || '时长未定' }}</span>
          </div>
          <h1 class="hero-title">{{ p.name }}</h1>
          <p class="hero-logline">{{ p.meta.logline || '写下一句让人愿意点开的故事。' }}</p>
          <div class="hero-actions">
            <button class="btn primary" @click="navigate('narrative')">进入叙事图谱</button>
            <button class="btn" @click="navigate('branches')">运行分支演算</button>
            <button class="btn ghost" @click="navigate('blueprint')">生成走向蓝图</button>
          </div>
        </div>
        <div class="hero-side">
          <div class="hero-metric">
            <div class="hero-metric-value">{{ counts.nodes }}</div>
            <div class="hero-metric-label">剧情节点</div>
          </div>
          <div class="hero-metric">
            <div class="hero-metric-value">{{ counts.edges }}</div>
            <div class="hero-metric-label">分支连线</div>
          </div>
          <div class="hero-metric">
            <div class="hero-metric-value">{{ counts.endings }}</div>
            <div class="hero-metric-label">结局</div>
          </div>
        </div>
      </div>
    </section>

    <div class="grid grid-2">
      <section class="card">
        <div class="card-head">
          <span class="card-title">分幕张力</span>
          <span class="card-sub">实际 vs 目标</span>
          <button class="btn sm ghost right" @click="navigate('blueprint')">节奏详情 →</button>
        </div>
        <div class="card-body">
          <LineChart :series="curve.series" :labels="curve.labels" :height="190" :y-max="100" />
          <div class="act-bars">
            <div v-for="a in actTension" :key="a.name" class="act-bar">
              <div class="row">
                <span class="small">{{ a.name }}</span>
                <span class="right mono tiny muted">{{ a.avg }} / {{ a.target || '—' }}</span>
              </div>
              <div class="meter"><span :style="{ width: a.avg + '%' }"></span></div>
              <div class="hint">{{ a.count }} 个节点</div>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <span class="card-title">结构体检</span>
          <span class="badge" :class="!health ? '' : health.errors ? 'bad' : health.warns ? 'warn' : 'ok'">{{ loading ? '演算中' : !health ? '—' : health.errors ? '需要修复' : health.warns ? '有待处理' : '结构健康' }}</span>
          <button class="btn sm ghost right" @click="navigate('branches')">完整报告 →</button>
        </div>
        <div class="card-body">
          <div v-if="loading" class="empty"><span class="spinner"></span> 正在演算分支…</div>
          <template v-else-if="branch">
            <div class="metric-grid">
              <div class="metric"><div class="metric-value">{{ branch.summary.pathCount }}</div><div class="metric-label">可行路径</div></div>
              <div class="metric"><div class="metric-value">{{ branch.summary.endingReachable }}/{{ branch.summary.endingCount }}</div><div class="metric-label">可达结局</div></div>
              <div class="metric"><div class="metric-value">{{ branch.summary.avgBranchEntropy }}</div><div class="metric-label">分支熵</div></div>
              <div class="metric"><div class="metric-value">{{ branch.summary.deadEndCount }}</div><div class="metric-label">死路</div></div>
            </div>
            <div class="hr"></div>
            <div v-if="!branch.issues.length" class="notice ok"><span>✓</span><div>没有发现结构性错误。旗标读写闭合，所有结局可达。</div></div>
            <div v-else class="col" style="gap: 6px">
              <div v-for="(i, idx) in branch.issues.slice(0, 4)" :key="idx" class="notice" :class="i.level === 'error' ? 'error' : i.level === 'warn' ? 'warn' : 'info'">
                <span>{{ i.level === 'error' ? '✕' : i.level === 'warn' ? '!' : 'i' }}</span>
                <div>{{ i.message }}</div>
              </div>
              <div v-if="branch.issues.length > 4" class="hint">还有 {{ branch.issues.length - 4 }} 条…</div>
            </div>
          </template>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <span class="card-title">企划信息</span>
        <span class="card-sub">所有修改自动保存</span>
        <div class="right row">
          <input ref="fileInput" type="file" accept="application/json,.json" style="display: none" @change="importProject" />
          <button class="btn sm ghost" @click="fileInput?.click()">导入 JSON</button>
          <button class="btn sm ghost" @click="exportProject">导出 JSON</button>
        </div>
      </div>
      <div class="card-body grid grid-3">
        <label class="field"><span class="label">企划名</span><input v-model="p.name" class="input" /></label>
        <label class="field"><span class="label">题材</span><input v-model="p.meta.genre" class="input" placeholder="悬疑 · 都市奇幻" /></label>
        <label class="field"><span class="label">基调</span><input v-model="p.meta.tone" class="input" placeholder="潮湿、冷冽" /></label>
        <label class="field" style="grid-column: span 2"><span class="label">一句话梗概 / Logline</span><input v-model="p.meta.logline" class="input" /></label>
        <label class="field"><span class="label">作者 / 团队</span><input v-model="p.meta.author" class="input" /></label>
        <label class="field"><span class="label">目标平台</span><input v-model="p.meta.platform" class="input" /></label>
        <label class="field"><span class="label">预计时长</span><input v-model="p.meta.playtime" class="input" /></label>
        <label class="field"><span class="label">版本</span><input v-model="p.meta.version" class="input" /></label>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">模块启用</span>
        <span class="card-sub">按企划需要开启；推理等模块并非每个企划都需要</span>
      </div>
      <div class="card-body">
        <div class="module-toggle-grid">
          <label v-for="m in modules" :key="m.id" class="module-toggle" :class="{ off: p.meta.modules[m.id] === false }">
            <input v-model="p.meta.modules[m.id]" type="checkbox" />
            <div>
              <div class="small">{{ m.title }}<span v-if="m.id === 'inference'" class="chip tiny amber" style="margin-left: 6px">可选</span></div>
              <div class="tiny dim">{{ m.desc }}</div>
            </div>
          </label>
        </div>
        <div class="hint" style="margin-top: 10px">
          关闭的模块会从侧栏隐藏，数据仍保留；重新开启即可恢复。
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><span class="card-title">模块入口</span><span class="card-sub">从叙事到数值到交付</span></div>
      <div class="card-body">
        <div class="module-grid">
          <button v-for="m in enabledModules" :key="m.route" class="module-card" :style="{ '--tone': m.tone }" @click="navigate(m.route)">
            <div class="module-icon">{{ m.icon }}</div>
            <div class="module-title">{{ m.title }}</div>
            <div class="module-desc">{{ m.desc }}</div>
            <div class="module-go">打开 →</div>
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.hero { overflow: hidden; position: relative; }
.hero::before {
  content: '';
  position: absolute;
  inset: -40% -10% auto auto;
  width: 460px;
  height: 460px;
  background: radial-gradient(circle, rgba(103, 232, 249, 0.22), transparent 65%);
  filter: blur(20px);
  pointer-events: none;
}
.hero-inner { display: flex; gap: 24px; padding: 26px 28px; position: relative; }
.hero-main { flex: 1; min-width: 0; }
.hero-title { font-size: 34px; letter-spacing: 0.02em; margin: 14px 0 8px; background: linear-gradient(100deg, #f0f9ff, #a5f3fc 55%, #c4b5fd); -webkit-background-clip: text; background-clip: text; color: transparent; }
.hero-logline { color: var(--muted); font-size: 13.5px; line-height: 1.7; max-width: 620px; }
.hero-actions { display: flex; gap: 10px; margin-top: 20px; flex-wrap: wrap; }
.hero-side { display: flex; gap: 12px; align-items: flex-start; }
.hero-metric { min-width: 92px; padding: 14px 12px; text-align: center; border: 1px solid var(--line); border-radius: 12px; background: rgba(2, 6, 23, 0.35); }
.hero-metric-value { font-family: var(--mono); font-size: 26px; color: #e6fbff; }
.hero-metric-label { font-size: 10.5px; color: var(--dim); margin-top: 3px; }
.act-bars { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 10px; }
.act-bar { padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: rgba(2, 6, 23, 0.3); }
.module-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px; }
.module-toggle-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px; }
.module-toggle { display: flex; align-items: flex-start; gap: 9px; padding: 9px 10px; border-radius: 9px; border: 1px solid var(--line); background: rgba(2, 6, 23, 0.3); cursor: pointer; transition: 0.15s ease; }
.module-toggle:hover { border-color: rgba(103, 232, 249, 0.3); }
.module-toggle.off { opacity: 0.55; }
.module-toggle input { margin-top: 2px; }
.module-card { text-align: left; padding: 15px; border-radius: 12px; border: 1px solid var(--line); background: rgba(2, 6, 23, 0.3); cursor: pointer; transition: 0.16s ease; position: relative; overflow: hidden; }
.module-card:hover { border-color: var(--tone); transform: translateY(-2px); background: rgba(15, 23, 42, 0.6); }
.module-card::after { content: ''; position: absolute; inset: auto 0 0; height: 2px; background: var(--tone); opacity: 0.55; }
.module-icon { font-size: 18px; color: var(--tone); margin-bottom: 8px; }
.module-title { font-size: 13px; font-weight: 600; margin-bottom: 5px; }
.module-desc { font-size: 11.5px; color: var(--dim); line-height: 1.6; min-height: 54px; }
.module-go { font-size: 11px; color: var(--tone); margin-top: 8px; }
@media (max-width: 900px) {
  .hero-inner { flex-direction: column; }
  .hero-title { font-size: 26px; }
  .hero-side { width: 100%; }
  .hero-metric { flex: 1; min-width: 0; }
  .act-bars { grid-template-columns: 1fr; }
}
</style>

