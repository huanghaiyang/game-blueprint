<script setup>
import { computed, ref, watch } from 'vue'
import { store, notify, ensureSaved } from '../store'
import { api } from '../api'
import LineChart from '../components/LineChart.vue'

const p = computed(() => store.project)
const chars = computed(() => p.value.characters)
const attrs = computed(() => p.value.stats.attributes)
const formulas = computed(() => p.value.stats.formulas)
const selectedCharId = ref(chars.value[0]?.id || '')
const selectedChar = computed(() => chars.value.find((c) => c.id === selectedCharId.value))
const level = ref(5)
const maxLevel = ref(10)
const result = ref(null)
const busy = ref(false)
const curveKeys = ref(['hp', 'atk', 'power'])
const labExpr = ref('atk * (1 + crit * (critDmg - 1)) * (100 / 120)')
const labVars = ref('')
const labResult = ref(null)
const labBusy = ref(false)
const attrErrors = ref([])
const palette = ['#67e8f9', '#a78bfa', '#fbbf24', '#fb7185', '#86efac', '#f0abfc', '#7dd3fc']

async function refresh() {
  if (!selectedCharId.value) return
  await ensureSaved()
  busy.value = true
  try {
    const r = await api.stats(store.activeId, selectedCharId.value, level.value, maxLevel.value, true)
    result.value = r
    attrErrors.value = r.attributeErrors || []
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    busy.value = false
  }
}

function formatNum(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return v
  if (Number.isInteger(v)) return v
  return Math.abs(v) >= 1000 ? v.toFixed(1) : v.toFixed(3)
}

async function runLab() {
  await ensureSaved()
  labBusy.value = true
  try {
    labResult.value = await api.formula(store.activeId, labExpr.value, {}, selectedCharId.value, level.value)
  } catch (e) {
    labResult.value = { ok: false, error: e.message }
  } finally {
    labBusy.value = false
  }
}

function addAttribute() {
  let i = 1
  while (attrs.value.some((a) => a.key === `attr${i}`)) i++
  attrs.value.push({ key: `attr${i}`, label: '新属性', group: '自定义', kind: 'primary', base: 0, growth: 0, unit: '', desc: '' })
  notify('已添加属性，记得在角色里补基础值', 'ok')
}

function removeAttribute(a) {
  if (!confirm(`删除属性「${a.label}」？引用它的公式会报未知变量。`)) return
  p.value.stats.attributes = attrs.value.filter((x) => x.key !== a.key)
}

function addFormula() {
  let i = 1
  while (formulas.value.some((f) => f.id === `f${i}`)) i++
  formulas.value.push({ id: `f${i}`, name: '新指标', expr: 'atk * 2', unit: '', desc: '' })
}

function removeFormula(f) {
  p.value.stats.formulas = formulas.value.filter((x) => x.id !== f.id)
}

function toggleCurveKey(key) {
  curveKeys.value = curveKeys.value.includes(key) ? curveKeys.value.filter((k) => k !== key) : [...curveKeys.value, key]
}

const curveSeries = computed(() => {
  if (!result.value?.curve) return []
  const rows = result.value.curve.rows
  return curveKeys.value.map((key, i) => ({
    name: labelOf(key),
    color: palette[i % palette.length],
    values: rows.map((r) => (key === 'level' ? r.level : r.values[key] ?? r.metrics[key] ?? 0))
  }))
})
const curveLabels = computed(() => (result.value?.curve?.rows || []).map((r) => `Lv${r.level}`))
function labelOf(key) {
  return attrs.value.find((a) => a.key === key)?.label || formulas.value.find((f) => f.id === key)?.name || key
}

const keyOptions = computed(() => [
  ...attrs.value.filter((a) => a.kind !== 'derived').map((a) => a.key),
  ...attrs.value.filter((a) => a.kind === 'derived').map((a) => a.key),
  ...formulas.value.map((f) => f.id)
])

const currentValues = computed(() => result.value?.values || {})

watch(selectedCharId, refresh)
watch(maxLevel, refresh)
refresh()
runLab()
</script>

<template>
  <div class="page">
    <section class="card">
      <div class="card-head">
        <span class="card-title">数值总览</span>
        <span class="card-sub">属性 → 派生 → 指标，全部由公式驱动</span>
        <div class="right row">
          <select v-model="selectedCharId" class="select slim" style="width: 130px">
            <option v-for="c in chars" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <div class="row" style="gap: 5px">
            <span class="hint">Lv</span>
            <input v-model.number="level" type="number" min="1" max="99" class="input slim mono" style="width: 60px" />
          </div>
          <button class="btn sm" :disabled="busy" @click="refresh">{{ busy ? '计算中…' : '刷新' }}</button>
        </div>
      </div>
      <div class="card-body">
        <div class="metric-grid">
          <div v-for="k in ['hp', 'atk', 'def', 'spd', 'power', 'ehp']" :key="k" class="metric">
            <div class="metric-value">{{ Number(currentValues[k] ?? 0).toFixed(k === 'ehp' ? 0 : 1) }}</div>
            <div class="metric-label">{{ labelOf(k) }}</div>
          </div>
          <div class="metric">
            <div class="metric-value">{{ result?.metrics ? Object.values(result.metrics).filter((m) => m.value != null).length : 0 }}</div>
            <div class="metric-label">指标公式</div>
          </div>
        </div>
        <div v-if="attrErrors.length" class="notice error" style="margin-top: 12px">
          <div>
            <b>属性定义有问题</b>
            <div v-for="(e, i) in attrErrors" :key="i" class="tiny" style="margin-top: 3px">{{ e.key }}：{{ e.errors.join('；') }}</div>
          </div>
        </div>
        <div v-if="result?.errors?.length" class="notice error" style="margin-top: 12px">
          <div v-for="(e, i) in result.errors" :key="i" class="tiny">{{ e.key }}：{{ e.error }}</div>
        </div>
      </div>
    </section>

    <div class="grid" style="grid-template-columns: minmax(0, 1.55fr) minmax(320px, 0.85fr)">
      <section class="card">
        <div class="card-head">
          <span class="card-title">属性体系</span>
          <span class="card-sub">基础/成长/派生公式</span>
          <button class="btn sm ghost right" @click="addAttribute">+ 属性</button>
        </div>
        <div class="table-scroll">
          <table class="table compact">
            <thead>
              <tr><th>标识</th><th>名称</th><th>类型</th><th class="num">基础</th><th class="num">成长</th><th>公式 / 单位</th><th></th></tr>
            </thead>
            <tbody>
              <tr v-for="a in attrs" :key="a.key">
                <td><input v-model="a.key" class="input slim mono" style="width: 82px" /></td>
                <td><input v-model="a.label" class="input slim" style="width: 78px" /></td>
                <td>
                  <select v-model="a.kind" class="select slim" style="width: 88px">
                    <option value="primary">基础</option>
                    <option value="derived">派生</option>
                  </select>
                </td>
                <td><input v-model.number="a.base" type="number" step="0.01" class="input slim mono" style="width: 66px" :disabled="a.kind === 'derived'" /></td>
                <td><input v-model.number="a.growth" type="number" step="0.01" class="input slim mono" style="width: 66px" :disabled="a.kind === 'derived'" /></td>
                <td>
                  <input v-if="a.kind === 'derived'" v-model="a.formula" class="input slim mono" placeholder="atk * 2 + hp * 0.1" />
                  <div v-else class="row" style="gap: 4px">
                    <input v-model="a.unit" class="input slim" placeholder="单位" style="width: 50px" />
                    <span class="tiny dim" v-if="a.group">{{ a.group }}</span>
                  </div>
                </td>
                <td><button class="btn sm ghost danger" @click="removeAttribute(a)">×</button></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="card-body" style="padding-top: 10px">
          <div class="hint">派生属性按依赖关系拓扑求值，支持循环检测。修改后点击右上「刷新」查看结果与曲线。</div>
          <div class="chips" style="margin-top: 8px">
            <span v-for="k in result?.order || []" :key="k" class="chip tiny cyan">{{ labelOf(k) }}</span>
          </div>
        </div>
      </section>

      <section class="card lab">
        <div class="card-head">
          <span class="card-title">公式实验室</span>
          <span class="badge right">安全求值</span>
        </div>
        <div class="card-body col" style="gap: 10px">
          <label class="field">
            <span class="label">表达式</span>
            <textarea v-model="labExpr" class="textarea mono" rows="3"></textarea>
          </label>
          <div class="row">
            <button class="btn sm primary" :disabled="labBusy" @click="runLab">{{ labBusy ? '计算中…' : '计算' }}</button>
            <span class="hint">基于 {{ selectedChar?.name }} · Lv{{ level }}</span>
          </div>
          <div v-if="labResult" class="lab-result">
            <template v-if="labResult.ok">
              <div class="mono lab-value">{{ formatNum(labResult.value) }}</div>
              <div class="hint">引用变量：{{ (labResult.variables || []).join(', ') || '无' }}</div>
            </template>
            <div v-else class="error-text">✕ {{ labResult.error }}</div>
          </div>
          <div class="hr"></div>
          <div class="divider-title">可用变量</div>
          <div class="chips">
            <span v-for="(v, k) in currentValues" :key="k" class="chip tiny">{{ k }} = {{ Number(v).toFixed(2) }}</span>
          </div>
          <div class="divider-title" style="margin-top: 6px">内置函数</div>
          <div class="tiny dim mono">min max clamp abs round floor ceil sqrt pow log sign if has len</div>
          <div class="chips" style="margin-top: 6px">
            <button class="btn sm ghost" @click="labExpr = 'atk * acc * (1 + crit * (critDmg - 1)) * (100 / (100 + 20))'; runLab()">期望 DPS</button>
            <button class="btn sm ghost" @click="labExpr = 'hp / (1 - dodge) * (1 + def / 100)'; runLab()">有效生命</button>
            <button class="btn sm ghost" @click="labExpr = 'clamp(spd / 20, 0, 1)'; runLab()">速度归一</button>
          </div>
        </div>
      </section>
    </div>

    <section class="card">
      <div class="card-head">
        <span class="card-title">指标公式库</span>
        <span class="card-sub">用于角色横向比较与蓝图锚点</span>
        <button class="btn sm ghost right" @click="addFormula">+ 指标</button>
      </div>
      <div class="card-body col" style="gap: 8px">
        <div v-for="f in formulas" :key="f.id" class="formula-row">
          <input v-model="f.name" class="input slim" style="width: 116px" />
          <input v-model="f.expr" class="input slim mono" />
          <input v-model="f.unit" class="input slim" placeholder="单位" style="width: 64px" />
          <span class="mono tiny" :class="result?.metrics?.[f.id]?.value != null ? 'c-cyan' : 'error-text'">
            {{ result?.metrics?.[f.id]?.value ?? result?.metrics?.[f.id]?.error ?? '—' }}
          </span>
          <button class="btn sm ghost danger" @click="removeFormula(f)">×</button>
        </div>
        <div v-if="!formulas.length" class="hint">暂无指标。指标不写入角色属性，只用于比较与报表。</div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <span class="card-title">成长曲线</span>
        <span class="card-sub">{{ selectedChar?.name }} · Lv1–{{ maxLevel }}</span>
        <div class="right row">
          <span class="hint">上限</span>
          <input v-model.number="maxLevel" type="number" min="3" max="60" class="input slim mono" style="width: 58px" />
        </div>
      </div>
      <div class="card-body">
        <div class="chips" style="margin-bottom: 10px">
          <button v-for="k in keyOptions" :key="k" class="chip" :class="{ cyan: curveKeys.includes(k) }" style="cursor: pointer" @click="toggleCurveKey(k)">
            {{ labelOf(k) }}
          </button>
        </div>
        <LineChart :series="curveSeries" :labels="curveLabels" :height="230" :y-min="0" />
        <div v-if="result?.curve?.anomalies?.length" class="col" style="gap: 5px; margin-top: 12px">
          <div class="divider-title">成长体检</div>
          <div v-for="(a, i) in result.curve.anomalies" :key="i" class="notice warn">
            <span>!</span>
            <div>Lv{{ a.level }} · {{ labelOf(a.metric) }} 出现 {{ a.delta > 0 ? '跃升' : '断层' }}（Δ {{ a.delta }}）：{{ a.note }}</div>
          </div>
        </div>
        <div v-else class="notice ok" style="margin-top: 12px"><span>✓</span><div>曲线平滑，未检测到等级收益突变。</div></div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.formula-row { display: grid; grid-template-columns: 116px minmax(0, 1fr) 64px 84px 30px; gap: 7px; align-items: center; }
.lab { align-self: start; }
.lab-result { border: 1px solid var(--line); border-radius: 9px; padding: 10px; background: rgba(2, 6, 23, 0.4); }
.lab-value { font-size: 22px; color: #a5f3fc; }
@media (max-width: 1100px) {
  .page > .grid { grid-template-columns: 1fr !important; }
  .formula-row { grid-template-columns: 1fr 1fr; }
  .formula-row .mono { grid-column: 1 / -1; }
}
</style>



