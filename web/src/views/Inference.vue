<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { store, notify, ensureSaved } from '../store'
import { api } from '../api'

const p = computed(() => store.project)
const cases = computed(() => p.value.cases || [])
const caseId = ref(cases.value[0]?.id || '')
const caseData = computed(() => cases.value.find((c) => c.id === caseId.value) || null)
const overrides = ref({})
const result = ref(null)
const busy = ref(false)

function resetOverrides() {
  overrides.value = Object.fromEntries((caseData.value?.clues || []).map((c) => [c.id, c.found !== false]))
}

async function run() {
  if (!caseId.value) return
  await ensureSaved()
  busy.value = true
  try {
    result.value = await api.infer(store.activeId, caseId.value, Object.entries(overrides.value).map(([id, found]) => ({ id, found })))
  } catch (e) {
    notify(e.message, 'error')
  } finally {
    busy.value = false
  }
}

function toggleClue(id, ev) {
  overrides.value = { ...overrides.value, [id]: ev.target.checked }
  run()
}

function scorePct(score) {
  return Math.round(Math.max(0, Math.min(1, score)) * 100)
}

function buildStarterCase() {
  const chars = (p.value.characters || []).slice(0, 3)
  const fallback = [
    { id: 'suspect_1', name: '嫌疑人甲', role: '相关者' },
    { id: 'suspect_2', name: '嫌疑人乙', role: '相关者' }
  ]
  const extra = { id: 'suspect_extra', name: '神秘人', role: '尚未登场' }
  const source = chars.length >= 2 ? chars : [...chars, extra]
  const suspects = (source.length ? source : fallback).map((c) => ({ id: c.id, name: c.name, role: c.role || '相关者', traits: {} }))
  return {
    id: `case-${Date.now().toString(36)}`,
    title: '示例案件 · 谁动了手',
    question: '把这个示例问题改成企划里真正的谜题：谁做了什么，证据是什么？',
    solution: {
      suspect: null,
      expectedFacts: [],
      reasoning: '示例案件没有预设答案；可在导出的 JSON 中补齐 solution、facts 与更多规则，或直接删掉这段说明。'
    },
    suspects,
    clues: [
      { id: 'clue_1', name: '线索一', desc: '默认已获得。把它改成案件中真实存在的证据。', found: true, weight: 2 },
      { id: 'clue_2', name: '线索二', desc: '默认未获得。取消 / 勾选它可以模拟调查进度。', found: false, weight: 1 },
      { id: 'clue_3', name: '线索三', desc: '默认未获得，用于演示「待补线索」提示。', found: false, weight: 1 }
    ],
    facts: [],
    rules: [
      { id: 'rule_1', name: '线索成立', cf: 0.85, when: [{ type: 'clue', id: 'clue_1' }], then: { fact: 'base_clue', label: '线索一成立' } },
      { id: 'rule_2', name: '指向嫌疑人甲', cf: 0.7, when: [{ type: 'fact', name: 'base_clue' }, { type: 'clue', id: 'clue_2' }], then: { suspicion: suspects[0].id, reason: '线索一与线索二共同指向该嫌疑人' } },
      { id: 'rule_3', name: '另一个可能', cf: 0.6, when: [{ type: 'fact', name: 'base_clue' }, { type: 'clue', id: 'clue_3' }], then: { suspicion: suspects[Math.min(1, suspects.length - 1)].id, reason: '线索三会改变嫌疑排序' } }
    ]
  }
}

function createStarterCase() {
  const c = buildStarterCase()
  p.value.cases.push(c)
  caseId.value = c.id
  resetOverrides()
  run()
  notify('已创建示例案件，可直接改数据或导出编辑', 'ok', 4000)
}


watch(caseId, () => {
  resetOverrides()
  run()
})

onMounted(() => {
  resetOverrides()
  run()
})
</script>

<template>
  <div class="page">
    <section class="card">
      <div class="card-head">
        <span class="card-title">推理台</span>
        <span class="card-sub">线索 → 规则 → 事实 → 嫌疑，带可信度传播</span>
        <div class="right row">
          <select v-if="cases.length" v-model="caseId" class="select slim" style="width: 190px">
            <option v-for="c in cases" :key="c.id" :value="c.id">{{ c.title }}</option>
          </select>
          <button v-if="caseData" class="btn sm primary" :disabled="busy" @click="run">{{ busy ? '推理中…' : '重新推理' }}</button>
        </div>
      </div>
      <div v-if="caseData" class="card-body">
        <div class="case-question">{{ caseData.question }}</div>
        <div class="row" style="margin-top: 8px">
          <span class="badge">规则 {{ caseData.rules?.length || 0 }}</span>
          <span class="badge">线索 {{ caseData.clues?.length || 0 }}</span>
          <span class="badge">嫌疑人 {{ caseData.suspects?.length || 0 }}</span>
          <span class="right tiny dim">切换线索可模拟「如果找到 / 丢失这条证据」</span>
        </div>
      </div>
      <div v-else class="card-body">
        <div class="notice info"><span>i</span><div>本企划还没有推理案件。推理是可选模块：需要时创建一个示例案件，再按自己的线索与规则改写。</div></div>
        <button class="btn primary" style="margin-top: 10px" @click="createStarterCase">创建示例案件</button>
      </div>
    </section>

    <template v-if="caseData">
      <div class="grid grid-2">
      <section class="card">
        <div class="card-head"><span class="card-title">线索面板</span><span class="card-sub">勾选表示已获得</span></div>
        <div class="card-body col" style="gap: 8px">
          <label v-for="c in caseData?.clues || []" :key="c.id" class="clue-row">
            <input type="checkbox" :checked="overrides[c.id] !== false" @change="toggleClue(c.id, $event)" />
            <div class="grow">
              <div class="row" style="gap: 6px"><span class="small">{{ c.name }}</span><span class="badge">权重 {{ c.weight || 1 }}</span></div>
              <div class="tiny dim">{{ c.desc }}</div>
            </div>
          </label>
        </div>
      </section>

      <section class="card">
        <div class="card-head">
          <span class="card-title">推理结论</span>
          <span v-if="result" class="badge right" :class="result.verdict.hit ? 'ok' : result.verdict.topSuspect ? 'warn' : 'bad'">
            {{ result.verdict.hit ? '推理成立' : result.verdict.topSuspect ? '推理未闭合' : '证据不足' }}
          </span>
        </div>
        <div class="card-body">
          <div v-if="!result" class="empty"><span class="spinner"></span> 推理中…</div>
          <template v-else>
            <div class="verdict-main">
              <div class="verdict-label">最高嫌疑</div>
              <div class="verdict-name" :class="result.verdict.hit ? 'c-green' : 'c-amber'">{{ result.verdict.topSuspectName || '尚无结论' }}</div>
              <div class="tiny dim">{{ result.verdict.hit ? '与预设答案一致' : result.verdict.topSuspect ? '最高嫌疑已浮现，但推理链未闭合' : '线索不足，无法锁定' }}</div>
              <div v-if="result.verdict.confidenceGap != null" class="tiny dim">与第二名差距 {{ result.verdict.confidenceGap }}</div>
            </div>
            <div class="hr"></div>
            <div class="row small"><span class="muted">规则覆盖</span><b class="right mono">{{ result.coverage.firedRules }}/{{ result.coverage.totalRules }}（{{ result.coverage.pct }}%）</b></div>
            <div class="meter" style="margin-top: 5px"><span :style="{ width: result.coverage.pct + '%' }"></span></div>
            <div v-if="result.verdict.missedFacts?.length" style="margin-top: 10px">
              <div class="divider-title">缺失关键事实</div>
              <div class="chips">
                <span v-for="f in result.verdict.missedFacts" :key="f" class="chip tiny rose mono">{{ f }}</span>
              </div>
            </div>
            <div v-if="result.contradictions.length" style="margin-top: 10px">
              <div class="divider-title">矛盾</div>
              <div v-for="(c, i) in result.contradictions" :key="i" class="notice error">{{ c.message }}</div>
            </div>
            <details v-if="caseData?.solution?.reasoning" class="solution">
              <summary>查看预设推理链（剧透）</summary>
              <p class="small muted" style="margin-top: 6px; line-height: 1.7">{{ caseData.solution.reasoning }}</p>
            </details>
          </template>
        </div>
      </section>
      </div>

    <div v-if="result" class="grid grid-2">
      <section class="card">
        <div class="card-head"><span class="card-title">嫌疑排序</span><span class="card-sub">CF 可信度累积</span></div>
        <div class="card-body col" style="gap: 11px">
          <div v-for="(s, i) in result.ranking" :key="s.id" class="suspect" :class="{ eliminated: s.eliminated }">
            <div class="row">
              <span class="badge">{{ i + 1 }}</span>
              <span class="small" :class="s.eliminated ? 'dim' : ''">{{ s.name }}</span>
              <span class="tiny dim">{{ s.role }}</span>
              <span v-if="s.eliminated" class="chip tiny rose" style="margin-left: auto">已排除</span>
              <span v-else class="right mono tiny muted">{{ scorePct(s.score) }}%</span>
            </div>
            <div class="meter" :class="s.eliminated ? 'rose' : ''" style="margin-top: 6px"><span :style="{ width: scorePct(s.score) + '%' }"></span></div>
            <div v-for="(r, j) in s.reasons" :key="j" class="reason">
              <span class="tiny dim">[{{ r.rule }}]</span> {{ r.text }} <span class="tiny mono muted">CF {{ r.cf }}</span>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><span class="card-title">待补线索</span><span class="card-sub">再拿到一条即可推进</span></div>
        <div class="card-body col" style="gap: 9px">
          <div v-for="(h, i) in result.hints" :key="i" class="hint-card">
            <div class="row"><span class="chip tiny amber">{{ h.missing.kind === 'clue' ? '线索' : h.missing.kind }}</span><span class="small">{{ h.missing.label }}</span></div>
            <div class="tiny dim" style="margin-top: 4px">规则「{{ h.ruleName }}」→ {{ h.conclusion }}</div>
          </div>
          <div v-if="!result.hints.length" class="notice ok"><span>✓</span><div>没有「只差一步」的规则，推理链已闭合或条件差距过大。</div></div>
        </div>
      </section>
    </div>

    <section v-if="result" class="card">
      <div class="card-head"><span class="card-title">推理链</span><span class="card-sub">前向链按触发顺序记录</span><span class="badge right">{{ result.fired.length }} 条触发</span></div>
      <div class="card-body">
        <div class="timeline">
          <div v-for="f in result.fired" :key="f.ruleId" class="tl-item">
            <div class="tl-rail"><span class="tl-dot"></span><span class="tl-line"></span></div>
            <div class="tl-body">
              <div class="tl-title">
                <span class="mono tiny dim">[{{ f.ruleId }}]</span> {{ f.name }}
                <span class="chip tiny" :class="f.cf >= 0.8 ? 'green' : f.cf >= 0.6 ? 'amber' : ''">CF {{ f.cf }}</span>
              </div>
              <div class="tl-meta">
                前提：<span v-for="(p, i) in f.premises" :key="i">{{ p.text }}<span v-if="i < f.premises.length - 1"> ∧ </span></span>
              </div>
              <div class="tiny c-cyan" style="margin-top: 3px">
                ⇒
                <span v-for="(c, i) in f.conclusions" :key="i">
                  {{ c.kind === 'fact' ? `事实「${c.label}」` : c.kind === 'suspicion' ? `嫌疑 +${c.cf}` : c.kind === 'eliminate' ? '排除' : c.text }}<span v-if="i < f.conclusions.length - 1">，</span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section v-if="result" class="card">
      <div class="card-head"><span class="card-title">事实库</span><span class="card-sub">CF ≥ 0.5 参与推理</span></div>
      <div class="table-scroll" style="max-height: 300px">
        <table class="table compact">
          <thead><tr><th>事实</th><th>说明</th><th class="num">可信度</th><th>来源规则</th></tr></thead>
          <tbody>
            <tr v-for="f in result.facts" :key="f.name">
              <td class="mono">{{ f.name }}</td>
              <td>{{ f.label }}</td>
              <td class="num">{{ f.cf }}</td>
              <td class="dim tiny">{{ f.sources.join(', ') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
    </template>
  </div>
</template>

<style scoped>
.case-question { font-size: 15px; line-height: 1.6; color: #e6f6ff; }
.clue-row { display: flex; gap: 10px; align-items: flex-start; padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: rgba(2, 6, 23, 0.3); cursor: pointer; }
.clue-row:hover { border-color: rgba(103, 232, 249, 0.3); }
.clue-row input { margin-top: 3px; }
.verdict-main { text-align: center; padding: 6px 0 10px; }
.verdict-label { font-size: 11px; color: var(--dim); letter-spacing: 0.1em; }
.verdict-name { font-size: 26px; font-weight: 700; margin: 6px 0 3px; }
.suspect { padding: 9px 10px; border: 1px solid var(--line); border-radius: 9px; background: rgba(2, 6, 23, 0.3); }
.suspect.eliminated { opacity: 0.55; }
.reason { font-size: 11px; color: var(--muted); margin-top: 4px; line-height: 1.5; }
.hint-card { padding: 9px 10px; border: 1px dashed rgba(251, 191, 36, 0.35); border-radius: 9px; background: rgba(251, 191, 36, 0.04); }
.solution { margin-top: 12px; }
.solution summary { cursor: pointer; font-size: 11.5px; color: var(--dim); }
</style>


