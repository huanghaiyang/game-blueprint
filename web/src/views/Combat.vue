<script setup>
import { computed, ref } from 'vue'
import { store, notify, ensureSaved } from '../store'
import { api } from '../api'
import LineChart from '../components/LineChart.vue'

const p = computed(() => store.project)
const chars = computed(() => p.value.characters)
const presets = computed(() => p.value.combat.presets || [])
const aId = ref(chars.value[0]?.id || '')
const bId = ref(chars.value[1]?.id || 'dummy')
const levelA = ref(5)
const levelB = ref(5)
const presetId = ref(p.value.combat.defaultPreset || 'duel')
const runs = ref(2000)
const result = ref(null)
const busy = ref(false)
const oneShot = ref(null)
const matrix = ref(null)
const matrixLevel = ref(5)
const matrixBusy = ref(false)
const sweep = ref(null)
const sweepChar = ref(chars.value[0]?.id || '')
const sweepLevels = ref('1,3,5,8,10')
const sweepBusy = ref(false)

async function run() {
  if (!aId.value || !bId.value) return
  await ensureSaved()
  busy.value = true
  try {
    result.value = await api.simulate({ projectId: store.activeId, aId: aId.value, bId: bId.value, levelA: levelA.value, levelB: levelB.value, presetId: presetId.value, config: { runs: runs.value } })
    oneShot.value = null
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    busy.value = false
  }
}

async function runOneShot() {
  await ensureSaved()
  busy.value = true
  try {
    oneShot.value = await api.simulate({ projectId: store.activeId, aId: aId.value, bId: bId.value, levelA: levelA.value, levelB: levelB.value, presetId: presetId.value, oneShot: true, seed: Date.now() % 100000 })
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    busy.value = false
  }
}

async function runMatrix() {
  await ensureSaved()
  matrixBusy.value = true
  try {
    matrix.value = await api.matrix({ projectId: store.activeId, ids: chars.value.map((c) => c.id), level: matrixLevel.value, presetId: presetId.value, runs: 900 })
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    matrixBusy.value = false
  }
}

async function runSweep() {
  await ensureSaved()
  sweepBusy.value = true
  try {
    const levels = sweepLevels.value.split(/[,，\s]+/).map(Number).filter((n) => n > 0)
    sweep.value = await api.levelSweep({ projectId: store.activeId, aId: sweepChar.value, levels, presetId: presetId.value })
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    sweepBusy.value = false
  }
}

function pickPair(rowId, cellId) {
  if (rowId === cellId) return
  aId.value = rowId
  bId.value = cellId
  run()
}

function cellStyle(wr) {
  const delta = Math.abs(wr - 50) / 50
  const alpha = 0.06 + delta * 0.38
  return { background: wr >= 50 ? `rgba(103, 232, 249, ${alpha})` : `rgba(251, 113, 133, ${alpha})` }
}

const histogram = computed(() => {
  const dist = result.value?.distribution || []
  const max = Math.max(1, ...dist.map((d) => d.pct))
  return dist.map((d) => ({ ...d, h: Math.round((d.pct / max) * 100) }))
})

const donutStyle = computed(() => {
  const wr = result.value?.winRate || 0
  return { background: `conic-gradient(#67e8f9 0% ${wr}%, rgba(251,113,133,0.7) ${wr}% 100%)` }
})

const sweepSeries = computed(() => (sweep.value ? [{ name: '胜率 %', color: '#67e8f9', values: sweep.value.levels.map((l) => l.winRate) }] : []))
const sweepLabels = computed(() => (sweep.value?.levels || []).map((l) => `Lv${l.level}`))

function nameOf(id) {
  if (id === 'dummy') return p.value.combat.dummy?.name || '训练假人'
  return chars.value.find((c) => c.id === id)?.name || id
}
const statKeys = ['hp', 'atk', 'def', 'spd', 'crit', 'critDmg', 'acc', 'dodge', 'mag', 'res']

run()
</script>

<template>
  <div class="page">
    <section class="card">
      <div class="card-head">
        <span class="card-title">对抗配置</span>
        <span class="card-sub">速度决定出手；暴击 / 闪避 / 减伤按属性求值</span>
        <span class="badge right">{{ presets.find((x) => x.id === presetId)?.name || presetId }}</span>
      </div>
      <div class="card-body">
        <div class="combat-controls">
          <label class="field">
            <span class="label">A 方</span>
            <select v-model="aId" class="select">
              <option v-for="c in chars" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
          </label>
          <label class="field level-field">
            <span class="label">等级</span>
            <input v-model.number="levelA" type="number" min="1" max="99" class="input mono" />
          </label>
          <div class="vs">VS</div>
          <label class="field">
            <span class="label">B 方</span>
            <select v-model="bId" class="select">
              <option v-for="c in chars" :key="c.id" :value="c.id">{{ c.name }}</option>
              <option value="dummy">{{ p.combat.dummy?.name || '训练假人' }}</option>
            </select>
          </label>
          <label class="field level-field">
            <span class="label">等级</span>
            <input v-model.number="levelB" type="number" min="1" max="99" class="input mono" />
          </label>
          <label class="field">
            <span class="label">预设</span>
            <select v-model="presetId" class="select">
              <option v-for="x in presets" :key="x.id" :value="x.id">{{ x.name }}</option>
            </select>
          </label>
          <label class="field">
            <span class="label">模拟次数</span>
            <input v-model.number="runs" type="number" min="100" max="20000" step="100" class="input mono" />
          </label>
          <div class="row" style="align-items: flex-end; gap: 8px">
            <button class="btn primary" :disabled="busy" @click="run">{{ busy ? '演算中…' : '开始演算' }}</button>
            <button class="btn ghost" :disabled="busy" @click="runOneShot">单场演示</button>
          </div>
        </div>
      </div>
    </section>

    <div v-if="result" class="grid grid-3">
      <section class="card">
        <div class="card-head"><span class="card-title">胜率</span><span class="card-sub">{{ result.a.name }} vs {{ result.b.name }}</span></div>
        <div class="card-body row" style="gap: 18px">
          <div class="donut" :style="donutStyle">
            <div class="donut-inner">
              <div class="donut-value">{{ result.winRate }}%</div>
              <div class="donut-label">{{ result.a.name }} 胜</div>
            </div>
          </div>
          <div class="col grow" style="gap: 8px">
            <div class="row"><span class="muted small">{{ result.b.name }} 胜</span><b class="right mono">{{ result.loseRate }}%</b></div>
            <div class="meter rose"><span :style="{ width: result.loseRate + '%' }"></span></div>
            <div class="row"><span class="muted small">平局 / 超时</span><b class="right mono">{{ result.drawRate }}% / {{ result.timeoutRate }}%</b></div>
            <div class="row"><span class="muted small">平均回合</span><b class="right mono">{{ result.avgRounds }}</b></div>
            <div class="row"><span class="muted small">中位回合</span><b class="right mono">{{ result.medianRounds }}</b></div>
            <div class="row"><span class="muted small">样本量</span><b class="right mono">{{ result.runs }}</b></div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">回合分布</span><span class="card-sub">越集中越稳定</span></div>
        <div class="card-body">
          <div class="hist">
            <div v-for="d in histogram" :key="d.round" class="hist-bar" :style="{ height: d.h + '%' }" :title="`第 ${d.round} 回合结束：${d.pct}%`"></div>
          </div>
          <div class="row" style="justify-content: space-between; margin-top: 4px">
            <span class="tiny dim">R{{ histogram[0]?.round || 1 }}</span>
            <span class="tiny dim">R{{ histogram[histogram.length - 1]?.round || 1 }}</span>
          </div>
          <div class="hr"></div>
          <div class="row small"><span class="muted">平均剩余生命</span><span class="right mono">{{ result.avgRemainingHp.a }} / {{ result.avgRemainingHp.b }}</span></div>
          <div class="row small"><span class="muted">平均造成伤害</span><span class="right mono">{{ result.avgDamage.a }} / {{ result.avgDamage.b }}</span></div>
          <div class="row small"><span class="muted">暴击率 / 闪避率</span><span class="right mono">{{ result.a.stats.crit }} / {{ result.a.stats.dodge }}</span></div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">属性对照</span><span class="card-sub">Lv{{ result.a.level }} vs Lv{{ result.b.level }}</span></div>
        <div class="table-scroll" style="max-height: 260px">
          <table class="table compact">
            <thead><tr><th>属性</th><th class="num">{{ result.a.name }}</th><th class="num">{{ result.b.name }}</th></tr></thead>
            <tbody>
              <tr v-for="k in statKeys" :key="k">
                <td class="dim">{{ k }}</td>
                <td class="num">{{ Number(result.a.stats[k] || 0).toFixed(2) }}</td>
                <td class="num">{{ Number(result.b.stats[k] || 0).toFixed(2) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div v-if="oneShot" class="card">
      <div class="card-head">
        <span class="card-title">单场战斗回放</span>
        <span class="chip" :class="oneShot.winner === 'A' ? 'green' : oneShot.winner === 'B' ? 'rose' : 'amber'">
          {{ oneShot.winner === 'A' ? oneShot.a.name + ' 胜' : oneShot.winner === 'B' ? oneShot.b.name + ' 胜' : '未分胜负' }}
        </span>
        <span class="right small dim">共 {{ oneShot.rounds }} 回合</span>
      </div>
      <div class="card-body">
        <div class="battle-log">{{ (oneShot.log || []).join('\n') || '双方都未命中…' }}</div>
      </div>
    </div>

    <section class="card">
      <div class="card-head">
        <span class="card-title">对抗矩阵</span>
        <span class="card-sub">行方对列方的胜率，点击格子直接演算</span>
        <div class="right row">
          <input v-model.number="matrixLevel" type="number" min="1" max="99" class="input slim mono" style="width: 62px" title="等级" />
          <button class="btn sm" :disabled="matrixBusy" @click="runMatrix">{{ matrixBusy ? '计算中…' : '计算矩阵' }}</button>
        </div>
      </div>
      <div v-if="matrix" class="table-scroll">
        <table class="table compact matrix-table">
          <thead>
            <tr>
              <th></th>
              <th v-for="c in matrix.rows" :key="c.id" class="num">{{ c.name }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in matrix.rows" :key="row.id">
              <td class="row-name">{{ row.name }}</td>
              <td v-for="cell in row.cells" :key="cell.id" class="num matrix-cell" :style="cell.mirror ? {} : cellStyle(cell.winRate)" @click="pickPair(row.id, cell.id)">
                <span v-if="cell.mirror" class="dim">—</span>
                <span v-else>{{ cell.winRate }}%</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-else class="empty">点击「计算矩阵」得到所有角色的两两胜率。少量样本用于快速定位强弱关系。</div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">等级胜率曲线</span>
        <span class="card-sub">对训练假人的胜率随等级变化</span>
      </div>
      <div class="card-body">
        <div class="row wrap" style="margin-bottom: 12px">
          <select v-model="sweepChar" class="select slim" style="width: 130px">
            <option v-for="c in chars" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <input v-model="sweepLevels" class="input slim mono" style="width: 160px" placeholder="1,3,5,8,10" />
          <button class="btn sm" :disabled="sweepBusy" @click="runSweep">{{ sweepBusy ? '计算中…' : '生成曲线' }}</button>
          <span class="hint">固定假人 Lv1 · 每点 800 次模拟</span>
        </div>
        <LineChart v-if="sweep" :series="sweepSeries" :labels="sweepLabels" :height="210" :y-max="100" unit="%" />
        <div v-else class="empty">选择角色并生成曲线，用于检查成长是否带来合理优势。</div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.combat-controls { display: grid; grid-template-columns: 1.2fr 74px 34px 1.2fr 74px 1fr 100px auto; gap: 10px; align-items: end; }
.level-field { width: 74px; }
.vs { align-self: center; color: var(--dim); font-family: var(--mono); font-size: 12px; padding-top: 14px; text-align: center; }
.matrix-table td, .matrix-table th { text-align: center; }
.row-name { text-align: left !important; color: var(--muted); white-space: nowrap; }
.matrix-cell { cursor: pointer; font-family: var(--mono); transition: 0.12s ease; }
.matrix-cell:hover { outline: 1px solid rgba(103, 232, 249, 0.6); }
@media (max-width: 1200px) {
  .combat-controls { grid-template-columns: 1fr 1fr; }
  .vs { display: none; }
  .page > .grid-3 { grid-template-columns: 1fr; }
}
</style>





