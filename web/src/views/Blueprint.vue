<script setup>
import { computed, onMounted, ref } from 'vue'
import { store, notify, ensureSaved } from '../store'
import { api } from '../api'
import LineChart from '../components/LineChart.vue'

const p = computed(() => store.project)
const bp = ref(null)
const busy = ref(false)
const showMd = ref(false)

async function load() {
  await ensureSaved()
  busy.value = true
  try {
    bp.value = await api.blueprint(store.activeId)
    showMd.value = false
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    busy.value = false
  }
}

function download() {
  if (!bp.value) return
  const blob = new Blob([bp.value.markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${bp.value.title}-走向蓝图.md`
  a.click()
  URL.revokeObjectURL(url)
  notify('蓝图文档已下载', 'ok')
}

async function copy() {
  if (!bp.value) return
  try {
    await navigator.clipboard.writeText(bp.value.markdown)
    notify('Markdown 已复制到剪贴板', 'ok')
  } catch {
    notify('浏览器拒绝了剪贴板访问，请手动选择文本复制', 'warn')
  }
}

const tensionChart = computed(() => {
  const curve = bp.value?.tensionCurve || []
  return {
    labels: curve.map((c) => c.act?.replace(/^第.幕[ ·]*/, '') || '—'),
    series: [
      { name: '实际平均张力', color: '#67e8f9', values: curve.map((c) => c.avg) },
      { name: '目标张力', color: '#a78bfa', values: curve.map((c) => c.target) }
    ]
  }
})

const allWarnings = computed(() => {
  if (!bp.value) return []
  return [...(bp.value.warnings || []), ...(bp.value.issues || []).map((i) => ({ level: i.level, code: i.code, message: i.message }))]
})

function levelText(level) {
  return level === 'error' ? '严重' : level === 'warn' ? '警告' : '提示'
}

onMounted(load)
</script>

<template>
  <div class="page">
    <section class="card">
      <div class="card-head">
        <span class="card-title">走向蓝图</span>
        <span class="card-sub">结构、节奏、角色弧光与数值锚点合成一份可交付文档</span>
        <div class="right row">
          <button class="btn sm" :disabled="busy" @click="load">{{ busy ? '生成中…' : '重新生成' }}</button>
          <button class="btn sm ghost" @click="copy">复制 Markdown</button>
          <button class="btn sm primary" @click="download">下载 .md</button>
        </div>
      </div>
      <div v-if="!bp" class="empty"><span class="spinner"></span> 正在汇总结构…</div>
      <div v-else class="card-body">
        <div class="row wrap" style="gap: 8px">
          <span class="chip cyan">{{ bp.genre || '题材未标注' }}</span>
          <span class="chip violet">{{ bp.tone || '基调未标注' }}</span>
          <span class="badge">{{ bp.summary.acts }} 幕</span>
          <span class="badge">{{ bp.summary.nodes }} 节点</span>
          <span class="badge">{{ bp.summary.routes }} 条路径</span>
          <span class="badge">{{ bp.summary.endings }} 个结局</span>
        </div>
        <div class="metric-grid" style="margin-top: 14px">
          <div class="metric"><div class="metric-value">{{ bp.summary.avgTension }}</div><div class="metric-label">平均张力</div></div>
          <div class="metric"><div class="metric-value">{{ bp.summary.avgPathLength }}</div><div class="metric-label">平均路径长度</div></div>
          <div class="metric"><div class="metric-value">{{ bp.summary.reachableEndings }}/{{ bp.summary.endings }}</div><div class="metric-label">可达结局</div></div>
          <div class="metric"><div class="metric-value">{{ bp.summary.entropy }}</div><div class="metric-label">分支熵</div></div>
          <div class="metric"><div class="metric-value">{{ bp.summary.choices }}</div><div class="metric-label">抉择点</div></div>
        </div>
      </div>
    </section>

    <div v-if="bp" class="grid grid-2">
      <section class="card">
        <div class="card-head"><span class="card-title">分幕结构</span><span class="card-sub">可直接编辑，改完重新生成</span></div>
        <div class="card-body col" style="gap: 10px">
          <div v-for="a in p.blueprint.acts" :key="a.id" class="act-row">
            <div class="row"><span class="badge">{{ a.id }}</span><input v-model="a.name" class="input slim" /></div>
            <input v-model="a.goal" class="input slim" placeholder="这一幕要完成什么" />
            <div class="row">
              <span class="hint">目标张力</span>
              <input v-model.number="a.tensionTarget" type="number" min="0" max="100" class="input slim mono" style="width: 68px" />
              <span class="hint right">实际 {{ bp.acts.find((x) => x.id === a.id)?.avgTension ?? '—' }}</span>
            </div>
          </div>
          <button class="btn sm ghost" @click="load">应用并重新生成 →</button>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">节奏曲线</span><span class="card-sub">{{ bp.sparkline }}</span></div>
        <div class="card-body">
          <LineChart :series="tensionChart.series" :labels="tensionChart.labels" :height="220" :y-max="100" />
          <div class="hr"></div>
          <div v-for="a in bp.acts" :key="a.id" class="act-stat">
            <div class="row"><span class="small">{{ a.name }}</span><span class="right tiny dim">{{ a.nodeCount }} 节点 · {{ a.choiceCount }} 抉择 · {{ a.endingCount }} 结局</span></div>
            <div class="meter-row">
              <div class="meter"><span :style="{ width: a.avgTension + '%' }"></span></div>
              <span class="meter-val">{{ a.avgTension }}</span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <div v-if="bp" class="grid grid-2">
      <section class="card">
        <div class="card-head"><span class="card-title">关键节拍</span><span class="card-sub">扇出 × 张力 × 中心度</span></div>
        <div class="card-body col" style="gap: 7px">
          <div v-for="(b, i) in bp.keyBeats" :key="b.id" class="beat-row">
            <span class="badge">{{ i + 1 }}</span>
            <div class="grow">
              <div class="small">{{ b.title }} <span class="chip tiny">{{ b.type }}</span></div>
              <div class="tiny dim">{{ b.act || '未分幕' }} · 张力 {{ b.tension }} · 出口 {{ b.fanout }} · 入口 {{ b.indegree }}</div>
            </div>
            <span class="mono tiny c-cyan">{{ b.score }}</span>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">风险与修正</span><span class="badge right" :class="allWarnings.some((w) => w.level === 'error') ? 'bad' : allWarnings.length ? 'warn' : 'ok'">{{ allWarnings.length }}</span></div>
        <div class="card-body col" style="gap: 6px">
          <div v-for="(w, i) in allWarnings" :key="i" class="notice" :class="w.level === 'error' ? 'error' : w.level === 'warn' ? 'warn' : 'info'">
            <span>{{ w.level === 'error' ? '✕' : w.level === 'warn' ? '!' : 'i' }}</span>
            <div><div>{{ w.message }}</div><div class="tiny dim mono">{{ w.code }}</div></div>
          </div>
          <div v-if="!allWarnings.length" class="notice ok"><span>✓</span><div>结构、节奏与分支均未发现风险。</div></div>
        </div>
      </section>
    </div>

    <section v-if="bp" class="card">
      <div class="card-head"><span class="card-title">结局与路径覆盖</span><span class="card-sub">概率质量为静态估算</span></div>
      <div class="table-scroll">
        <table class="table">
          <thead><tr><th>结局</th><th>幕</th><th class="num">可达</th><th class="num">路径</th><th class="num">概率质量</th><th class="num">最短/最长</th><th>覆盖</th></tr></thead>
          <tbody>
            <tr v-for="r in bp.routeTable" :key="r.id">
              <td><b>{{ r.title }}</b></td>
              <td class="dim">{{ p.blueprint.acts.find((a) => a.id === r.act)?.name || r.act || '—' }}</td>
              <td class="num"><span class="badge" :class="r.reachable ? 'ok' : 'bad'">{{ r.reachable ? '是' : '否' }}</span></td>
              <td class="num">{{ r.pathCount }}</td>
              <td class="num">{{ r.probability }}%</td>
              <td class="num">{{ r.minLength ?? '—' }} / {{ r.maxLength ?? '—' }}</td>
              <td style="min-width: 110px"><div class="meter"><span :style="{ width: Math.min(100, r.probability) + '%' }"></span></div></td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <div v-if="bp" class="grid grid-2">
      <section class="card">
        <div class="card-head"><span class="card-title">角色弧光</span><span class="card-sub">与数值锚点联动</span></div>
        <div class="table-scroll">
          <table class="table compact">
            <thead><tr><th>角色</th><th>定位</th><th>起点</th><th>转折</th><th>终点</th></tr></thead>
            <tbody>
              <tr v-for="c in bp.arcs" :key="c.id">
                <td :style="{ color: c.color }">{{ c.name }}</td>
                <td class="dim">{{ c.role }}</td>
                <td class="tiny">{{ c.start || '—' }}</td>
                <td class="tiny">{{ c.midpoint || '—' }}</td>
                <td class="tiny">{{ c.end || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">数值锚点</span><span class="card-sub">Lv1 / Lv5 / Lv10</span></div>
        <div class="table-scroll">
          <table class="table compact">
            <thead><tr><th>角色</th><th class="num">HP</th><th class="num">ATK</th><th class="num">DEF</th><th class="num">SPD</th><th class="num">{{ bp.numericAnchors[0]?.metricName || '指标' }}</th></tr></thead>
            <tbody>
              <tr v-for="n in bp.numericAnchors" :key="n.id">
                <td :style="{ color: bp.arcs.find((a) => a.id === n.id)?.color }">{{ n.name }}</td>
                <td class="num">{{ n.hp.join(' / ') }}</td>
                <td class="num">{{ n.atk.join(' / ') }}</td>
                <td class="num">{{ n.def.join(' / ') }}</td>
                <td class="num">{{ n.spd.join(' / ') }}</td>
                <td class="num">{{ (n.metric || []).join(' / ') || '—' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <section v-if="bp" class="card">
      <div class="card-head">
        <span class="card-title">交付文档</span>
        <span class="card-sub">Markdown 预览</span>
        <button class="btn sm ghost right" @click="showMd = !showMd">{{ showMd ? '收起' : '展开预览' }}</button>
      </div>
      <div v-if="showMd" class="card-body">
        <pre class="md-preview">{{ bp.markdown }}</pre>
      </div>
      <div v-else class="card-body row">
        <span class="hint">包含分幕细纲、关键节拍、结局覆盖、风险清单、角色弧光与数值锚点，可直接进 Wiki / 邮件 / 评审。</span>
        <button class="btn sm primary right" @click="download">下载 {{ bp.title }}-走向蓝图.md</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.act-row { display: flex; flex-direction: column; gap: 6px; padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: rgba(2, 6, 23, 0.3); }
.act-stat { padding: 6px 0; border-bottom: 1px solid var(--line); }
.act-stat:last-child { border-bottom: none; }
.beat-row { display: flex; gap: 9px; align-items: flex-start; padding: 7px 8px; border-radius: 8px; background: rgba(2, 6, 23, 0.3); }
</style>


