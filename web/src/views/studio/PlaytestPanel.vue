<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { store, ensureSaved, notify } from '../../store'
import { api } from '../../api'

const project = computed(() => store.project)
const access = computed(() => project.value?.access || {})
const runtime = ref(null)
const mode = ref('story')
const state = ref(null)
const view = ref(null)
const loading = ref(false)
const error = ref('')
const chars = ref(0)
const auto = ref(false)
let typeTimer = null
let autoTimer = null

const dialogueId = ref('')
const lineIndex = ref(0)
const choiceResponse = ref('')
const dialogueQuests = ref({})
const dialogueHistory = ref([])

const text = computed(() => view.value?.text || '')
const shown = computed(() => text.value.slice(0, chars.value))
const typing = computed(() => chars.value < text.value.length)
const speed = computed(() => Math.max(8, Number(access.value.textSpeed) || 32))
const fontScale = computed(() => Number(access.value.fontScale) || 1)
const dialogues = computed(() => runtime.value?.dialogues || [])
const dialogue = computed(() => dialogues.value.find((d) => d.id === dialogueId.value) || dialogues.value[0] || null)
const line = computed(() => dialogue.value?.lines?.[lineIndex.value] || null)
const questRows = computed(() => {
  const rows = []
  for (const q of runtime.value?.quests || []) {
    const s = state.value?.quests?.[q.id]
    rows.push({ ...q, status: s?.status || q.sourceStatus || '未接取', source: 'runtime' })
  }
  for (const [id, status] of Object.entries(dialogueQuests.value)) {
    const q = runtime.value?.quests?.find((x) => x.id === id)
    if (q && !rows.find((r) => r.id === id)) rows.push({ ...q, status, source: 'dialogue' })
  }
  return rows
})

const slots = ref({})
const slotKey = computed(() => `gss.playtest.${store.activeId}`)

function loadSlots() {
  try { slots.value = JSON.parse(localStorage.getItem(slotKey.value) || '{}') } catch { slots.value = {} }
}
function persistSlots() {
  localStorage.setItem(slotKey.value, JSON.stringify(slots.value))
}

function resetTypewriter() {
  clearInterval(typeTimer)
  chars.value = 0
  if (access.value.reduceMotion || !text.value) {
    chars.value = text.value.length
    return
  }
  const step = Math.max(1, Math.round(speed.value / 30))
  typeTimer = setInterval(() => {
    chars.value = Math.min(text.value.length, chars.value + step)
    if (chars.value >= text.value.length) clearInterval(typeTimer)
  }, 33)
}

function skipTyping() {
  clearInterval(typeTimer)
  chars.value = text.value.length
}

async function loadRuntime() {
  loading.value = true
  error.value = ''
  try {
    await ensureSaved()
    runtime.value = await api.runtimeView(store.activeId)
    if (!dialogueId.value) dialogueId.value = runtime.value.dialogues?.[0]?.id || ''
    if (!state.value) startStory()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function startStory() {
  clearTimeout(autoTimer)
  loading.value = true
  try {
    const out = await api.runtimeStart(store.activeId)
    state.value = out.state
    view.value = out.view
    mode.value = 'story'
    resetTypewriter()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}

async function choose(choice) {
  if (!state.value || loading.value) return
  skipTyping()
  loading.value = true
  try {
    const out = await api.runtimeStep(store.activeId, state.value, choice.id)
    state.value = out.state
    view.value = out.view
    resetTypewriter()
    choiceResponse.value = ''
  } catch (e) {
    notify(`无法推进：${e.message}`, 'warn')
  } finally {
    loading.value = false
  }
}

function switchDialogue(id) {
  dialogueId.value = id
  lineIndex.value = 0
  choiceResponse.value = ''
  dialogueHistory.value = []
}

function nextLine() {
  if (!dialogue.value) return
  if (lineIndex.value < dialogue.value.lines.length - 1) {
    lineIndex.value++
    choiceResponse.value = ''
    dialogueHistory.value.push(line.value?.text || '')
  } else if (!dialogue.value.choices.length) {
    notify('这段对话已结束', 'ok')
  }
}

function pickChoice(c) {
  choiceResponse.value = c.response
  dialogueHistory.value.push(`「${c.label}」${c.response}`)
}

function acceptDialogueQuest() {
  const q = dialogue.value?.quest
  if (!q) return
  dialogueQuests.value[q.id] = '进行中'
  notify(`已接取「${q.title}」`, 'ok')
}

function saveSlot(n) {
  slots.value[n] = {
    at: new Date().toISOString(),
    mode: mode.value,
    state: state.value,
    view: view.value,
    dialogueId: dialogueId.value,
    lineIndex: lineIndex.value,
    dialogueQuests: dialogueQuests.value
  }
  persistSlots()
  notify(`已写入存档槽 ${n}`, 'ok')
}
function loadSlot(n) {
  const s = slots.value[n]
  if (!s) return
  state.value = s.state
  view.value = s.view
  mode.value = s.mode || 'story'
  dialogueId.value = s.dialogueId || dialogueId.value
  lineIndex.value = s.lineIndex || 0
  dialogueQuests.value = s.dialogueQuests || {}
  resetTypewriter()
  notify(`已读取存档槽 ${n}`, 'ok')
}
function deleteSlot(n) {
  delete slots.value[n]
  persistSlots()
}

function saveSettings() {
  const a = project.value.access || (project.value.access = {})
  a.textSpeed = Number(a.textSpeed) || 32
  a.autoDelay = Number(a.autoDelay) || 2.5
  a.fontScale = Number(a.fontScale) || 1
  a.reduceMotion = !!a.reduceMotion
  notify('试玩设置已保存', 'ok')
}

watch(text, () => resetTypewriter())
watch([typing, auto, view], () => {
  clearTimeout(autoTimer)
  if (!auto.value || typing.value || !view.value || view.value.ending) return
  if (view.value.choices.length === 1) autoTimer = setTimeout(() => choose(view.value.choices[0]), Math.max(400, (Number(access.value.autoDelay) || 2.5) * 1000))
})

onMounted(async () => {
  loadSlots()
  await loadRuntime()
})
onBeforeUnmount(() => {
  clearInterval(typeTimer)
  clearTimeout(autoTimer)
})
</script>

<template>
  <div class="studio-panel play-panel">
    <div class="panel-head">
      <div class="mode-switch">
        <button class="mode-btn" :class="{ active: mode === 'story' }" @click="mode = 'story'">剧情节点</button>
        <button class="mode-btn" :class="{ active: mode === 'dialogue' }" @click="mode = 'dialogue'">NPC 对话</button>
      </div>
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <button class="btn sm ghost" :disabled="loading" @click="startStory">↺ 重新开始</button>
        <button class="btn sm" :class="{ primary: auto }" @click="auto = !auto">自动 {{ auto ? '开' : '关' }}</button>
        <button class="btn sm ghost" @click="skipTyping">跳过打字</button>
      </div>
    </div>

    <div v-if="error" class="notice rose" style="margin-bottom: 8px">{{ error }}</div>
    <div v-if="access.contentWarnings?.length" class="warn-banner">
      <b>内容提示</b>
      <span>{{ access.contentWarnings.join(' · ') }}</span>
    </div>

    <div class="play-grid">
      <section class="card stage" :style="{ fontSize: `${fontScale}em` }">
        <template v-if="mode === 'story'">
          <div v-if="view" class="stage-body">
            <div class="stage-meta">
              <span class="chip tiny cyan">{{ view.act || '未分幕' }}</span>
              <span class="chip tiny">{{ view.type }}</span>
              <span class="tiny dim">张力 {{ view.tension }}</span>
              <span v-if="view.ending" class="chip tiny green">结局</span>
            </div>
            <h2 class="stage-title">{{ view.title }}</h2>
            <p class="stage-text">{{ shown }}<span v-if="typing" class="caret">▍</span></p>
            <div v-if="view.summary && !typing" class="hint">{{ view.summary }}</div>
            <div class="choices">
              <button v-for="c in view.choices" :key="c.id" class="choice" :disabled="loading" @click="choose(c)">
                <span class="choice-arrow">→</span>{{ c.label }}
              </button>
              <div v-for="c in view.locked" :key="c.id" class="choice locked" :title="c.reason">
                <span class="choice-arrow">×</span>{{ c.label }}
                <span class="tiny dim">条件未满足：{{ c.reason }}</span>
              </div>
              <div v-if="view.ending" class="ending-box">
                <b>本路线到达结局</b>
                <span class="tiny dim">可重新开始，或读取存档尝试其他选择。</span>
              </div>
              <div v-if="!view.choices.length && !view.locked.length && !view.ending" class="hint">此节点没有出口。</div>
            </div>
          </div>
          <div v-else class="empty" style="padding: 40px">正在编译运行时…</div>
        </template>

        <template v-else>
          <div class="stage-body">
            <div class="row" style="justify-content: space-between; gap: 8px">
              <select class="select" style="max-width: 280px" :value="dialogue?.id" @change="switchDialogue($event.target.value)">
                <option v-for="d in dialogues" :key="d.id" :value="d.id">{{ d.npc }} · {{ d.name }}</option>
              </select>
              <span v-if="dialogue" class="tiny dim">{{ dialogue.audienceIds.length ? `仅：${dialogue.audienceIds.join('、')}` : '所有人可见' }}</span>
            </div>
            <template v-if="line">
              <div class="speaker">{{ line.speaker }}</div>
              <p class="stage-text">{{ line.text }}</p>
              <div class="row" style="gap: 8px">
                <button class="btn sm" @click="nextLine">下一句 →</button>
                <span class="tiny dim">{{ lineIndex + 1 }} / {{ dialogue.lines.length }}</span>
              </div>
              <div v-if="dialogue.choices.length" class="choices">
                <button v-for="c in dialogue.choices" :key="c.id" class="choice" @click="pickChoice(c)">
                  <span class="choice-arrow">◇</span>{{ c.label }}
                </button>
              </div>
              <div v-if="choiceResponse" class="notice cyan" style="margin-top: 8px">{{ choiceResponse }}</div>
              <div v-if="dialogue.quest" class="quest-accept">
                <div>
                  <b>{{ dialogue.quest.title }}</b>
                  <span class="tiny dim">{{ dialogue.quest.summary }}</span>
                </div>
                <button class="btn sm primary" :disabled="dialogueQuests[dialogue.quest.id]" @click="acceptDialogueQuest">{{ dialogueQuests[dialogue.quest.id] ? '已接取' : '接取任务' }}</button>
              </div>
            </template>
            <div v-else class="empty" style="padding: 30px">该 NPC 没有对话数据</div>
          </div>
        </template>
      </section>

      <aside class="card side">
        <div class="side-tabs">
          <span class="side-tab active">任务</span>
          <span class="side-tab">旗标</span>
          <span class="side-tab">日志</span>
        </div>
        <div class="side-section">
          <div class="side-title">任务日志 <span class="badge">{{ questRows.length }}</span></div>
          <div v-for="q in questRows" :key="q.id" class="quest-row">
            <div class="row" style="justify-content: space-between; gap: 6px">
              <b class="small">{{ q.title }}</b>
              <span class="chip tiny" :class="{ green: q.status === '已完成' || q.status === '进行中', amber: q.status === '未接取' }">{{ q.status }}</span>
            </div>
            <div class="tiny dim">{{ q.npc }} · {{ q.objectives.length }} 个目标</div>
            <div v-for="o in q.objectives" :key="o.id || o.text" class="tiny dim quest-objective">· {{ o.text || o }}</div>
          </div>
          <div v-if="!questRows.length" class="hint">当前没有任务。</div>
        </div>
        <div class="side-section">
          <div class="side-title">旗标 / 状态</div>
          <div class="flag-list">
            <span v-for="(v, k) in state?.flags || {}" :key="k" class="chip tiny" :class="{ green: v === true, amber: v === false }">{{ k }}: {{ v }}</span>
          </div>
          <div v-if="!Object.keys(state?.flags || {}).length" class="hint">尚未写入旗标。</div>
        </div>
        <div class="side-section">
          <div class="side-title">选择日志</div>
          <div class="log-list">
            <div v-for="(l, i) in (state?.log || []).slice(-8)" :key="i" class="log-row">
              <span class="dim mono">{{ l.type === 'node' ? '节点' : '选择' }}</span>
              <span class="tiny">{{ l.title || l.label }}</span>
            </div>
            <div v-if="!state?.log?.length" class="hint">尚未开始。</div>
          </div>
        </div>
      </aside>
    </div>

    <div class="bottom-grid">
      <section class="card">
        <div class="card-head"><span class="card-title">存档槽</span><span class="tiny dim">自动保存在本地浏览器，不写入企划</span></div>
        <div class="card-body row" style="gap: 8px; flex-wrap: wrap">
          <div v-for="n in 3" :key="n" class="slot">
            <div class="tiny dim">槽 {{ n }}</div>
            <div class="small">{{ slots[n] ? new Date(slots[n].at).toLocaleString('zh-CN') : '空' }}</div>
            <div class="row" style="gap: 3px">
              <button class="btn sm ghost" @click="saveSlot(n)">存</button>
              <button class="btn sm ghost" :disabled="!slots[n]" @click="loadSlot(n)">读</button>
              <button class="btn sm ghost danger" :disabled="!slots[n]" @click="deleteSlot(n)">删</button>
            </div>
          </div>
        </div>
      </section>
      <section class="card">
        <div class="card-head"><span class="card-title">试玩与无障碍</span><button class="btn sm ghost" @click="saveSettings">保存</button></div>
        <div class="card-body play-settings">
          <label class="tiny dim">打字速度 <input v-model.number="access.textSpeed" type="range" min="8" max="90" /></label>
          <label class="tiny dim">自动间隔 <input v-model.number="access.autoDelay" type="number" min="0.5" max="10" step="0.5" class="input slim mono" style="width: 66px" /></label>
          <label class="tiny dim">字号 <input v-model.number="access.fontScale" type="range" min="0.85" max="1.5" step="0.05" /></label>
          <label class="switch-row tiny"><input v-model="access.reduceMotion" type="checkbox" /> 减少动效</label>
          <label class="field"><span class="label">内容提示（逗号分隔）</span><input :value="(access.contentWarnings || []).join('，')" class="input slim" @change="access.contentWarnings = $event.target.value.split(/[,，]/).map(s => s.trim()).filter(Boolean)" /></label>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.play-panel { display: flex; flex-direction: column; gap: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.mode-switch { display: flex; gap: 2px; border: 1px solid var(--line); border-radius: 8px; padding: 2px; }
.mode-btn { border: 0; background: transparent; color: var(--dim); font-size: 11px; padding: 5px 11px; border-radius: 6px; cursor: pointer; }
.mode-btn.active { color: var(--cyan); background: rgba(103, 232, 249, 0.1); }
.warn-banner { display: flex; gap: 8px; align-items: center; padding: 7px 10px; border: 1px solid rgba(251, 191, 36, 0.35); border-radius: 8px; background: rgba(251, 191, 36, 0.07); font-size: 11px; color: #fde68a; }
.play-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 10px; min-height: 360px; }
.stage { min-height: 360px; overflow: hidden; }
.stage-body { padding: 18px 20px; display: flex; flex-direction: column; gap: 12px; }
.stage-meta { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.stage-title { font-size: 22px; margin: 2px 0; letter-spacing: 0.01em; }
.stage-text { font-size: 15px; line-height: 1.9; color: #dbeafe; min-height: 70px; margin: 0; white-space: pre-wrap; }
.speaker { font-size: 12px; color: var(--cyan); font-weight: 600; }
.caret { color: var(--cyan); animation: blink 0.9s steps(2) infinite; }
@keyframes blink { 50% { opacity: 0; } }
.choices { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
.choice { text-align: left; display: flex; align-items: baseline; gap: 7px; border: 1px solid var(--line); border-radius: 8px; background: rgba(2, 6, 23, 0.35); color: var(--text); padding: 9px 11px; font-size: 12px; cursor: pointer; }
.choice:hover:not(:disabled) { border-color: rgba(103, 232, 249, 0.45); background: rgba(103, 232, 249, 0.07); }
.choice.locked { color: var(--dim); cursor: not-allowed; border-style: dashed; }
.choice-arrow { color: var(--cyan); font-family: var(--mono); }
.ending-box { padding: 10px; border: 1px solid rgba(74, 222, 128, 0.35); border-radius: 8px; background: rgba(74, 222, 128, 0.06); display: flex; flex-direction: column; gap: 3px; }
.quest-accept { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 9px; border: 1px solid rgba(103, 232, 249, 0.25); border-radius: 8px; background: rgba(103, 232, 249, 0.05); }
.quest-accept > div { display: flex; flex-direction: column; gap: 2px; }
.side { display: flex; flex-direction: column; min-height: 0; overflow: auto; }
.side-tabs { display: none; }
.side-section { padding: 10px 12px; border-bottom: 1px solid var(--line); }
.side-section:last-child { border-bottom: 0; }
.side-title { font-size: 11px; color: var(--muted); margin-bottom: 7px; display: flex; align-items: center; gap: 6px; }
.quest-row { padding: 7px 0; border-bottom: 1px dashed var(--line); display: flex; flex-direction: column; gap: 3px; }
.quest-row:last-child { border-bottom: 0; }
.quest-objective { padding-left: 4px; }
.flag-list { display: flex; flex-wrap: wrap; gap: 4px; }
.log-list { display: flex; flex-direction: column; gap: 4px; max-height: 130px; overflow: auto; }
.log-row { display: flex; gap: 6px; align-items: baseline; }
.bottom-grid { display: grid; grid-template-columns: 1.2fr 1fr; gap: 10px; }
.slot { flex: 1; min-width: 120px; border: 1px solid var(--line); border-radius: 8px; padding: 7px; display: flex; flex-direction: column; gap: 3px; background: rgba(2, 6, 23, 0.25); }
.play-settings { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.play-settings label { display: flex; align-items: center; gap: 7px; }
.play-settings input[type=range] { flex: 1; accent-color: var(--cyan); }
@media (max-width: 1000px) {
  .play-grid, .bottom-grid { grid-template-columns: 1fr; }
  .side { max-height: 300px; }
}
</style>
