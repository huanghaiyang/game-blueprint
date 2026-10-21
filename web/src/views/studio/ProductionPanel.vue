<script setup>
import { computed, onMounted, ref } from 'vue'
import { store, ensureSaved, notify } from '../../store'
import { api } from '../../api'

const project = computed(() => store.project)
const tasks = computed(() => project.value?.production?.tasks || (project.value.production = { tasks: [], milestones: [] }).tasks)
const report = ref(null)
const loading = ref(false)
const showNew = ref(false)
const draft = ref({ title: '', module: 'narrative', owner: '', estimate: 1, priority: 'medium', status: 'todo', notes: '' })
const COLUMNS = [
  { id: 'todo', label: '待办' },
  { id: 'doing', label: '进行中' },
  { id: 'review', label: '评审' },
  { id: 'done', label: '完成' }
]
const PRIORITY = { high: '高', medium: '中', low: '低' }

const grouped = computed(() => Object.fromEntries(COLUMNS.map((c) => [c.id, tasks.value.filter((t) => (t.status || 'todo') === c.id)])))
const readinessTone = computed(() => (report.value?.readiness >= 75 ? 'green' : report.value?.readiness >= 40 ? 'amber' : 'rose'))

async function load() {
  loading.value = true
  try {
    await ensureSaved()
    report.value = await api.production(store.activeId)
  } catch (e) {
    notify(`制作报告失败：${e.message}`, 'error')
  } finally {
    loading.value = false
  }
}

function addTask() {
  if (!draft.value.title.trim()) return
  tasks.value.push({
    id: `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
    title: draft.value.title.trim(),
    module: draft.value.module,
    refId: '',
    status: draft.value.status,
    owner: draft.value.owner.trim(),
    estimate: Number(draft.value.estimate) || 1,
    priority: draft.value.priority,
    sourceKey: '',
    notes: draft.value.notes.trim()
  })
  draft.value = { title: '', module: 'narrative', owner: '', estimate: 1, priority: 'medium', status: 'todo', notes: '' }
  showNew.value = false
  load()
}

async function generate() {
  try {
    await ensureSaved()
    const out = await api.generateTasks(store.activeId)
    if (!out.tasks?.length) return notify('没有需要新增的任务', 'ok')
    project.value.production.tasks.push(...out.tasks)
    notify(`已从内容生成 ${out.tasks.length} 个任务`, 'ok')
    await load()
  } catch (e) {
    notify(`生成失败：${e.message}`, 'error')
  }
}

function removeTask(t) {
  if (!confirm(`删除任务「${t.title}」？`)) return
  project.value.production.tasks = tasks.value.filter((x) => x.id !== t.id)
  load()
}

function exportReport() {
  const r = report.value
  if (!r) return
  const lines = [
    `# ${store.project.name} · 制作报告`,
    '',
    `- 就绪度：${r.readiness}%`,
    `- 任务：${r.tasks.total}（完成 ${r.tasks.byStatus.done || 0}，预计 ${r.tasks.estimate} 人日）`,
    `- 资产：${r.assets.total}（完成 ${r.assets.byStatus.ready || 0}）`,
    `- 本地化平均覆盖：${r.localization.avgCoverage}%`,
    `- 未解决评论：${r.reviews.open}`,
    '',
    '## 任务',
    ...tasks.value.map((t) => `- [${t.status === 'done' ? 'x' : ' '}] ${t.title} · ${t.owner || '未分配'} · ${t.estimate || 0} 人日`),
    '',
    '## 缺失项',
    ...(r.missing || []).map((m) => `- ${m.message}`)
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.project.name}-production.md`
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
onMounted(load)
</script>

<template>
  <div class="studio-panel production-panel">
    <div class="panel-head">
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <span class="chip tiny" :class="readinessTone">就绪度 {{ report?.readiness ?? '—' }}%</span>
        <span class="badge">任务 {{ tasks.length }}</span>
        <span class="badge">资产 {{ report?.assets.total || 0 }}</span>
        <span class="badge">未解决评论 {{ report?.reviews.open || 0 }}</span>
      </div>
      <div class="row" style="gap: 6px">
        <button class="btn sm ghost" @click="load">{{ loading ? '…' : '↻ 刷新' }}</button>
        <button class="btn sm ghost" @click="generate">✦ 从内容生成任务</button>
        <button class="btn sm ghost" @click="exportReport">导出报告</button>
        <button class="btn sm primary" @click="showNew = !showNew">＋ 新建任务</button>
      </div>
    </div>

    <div v-if="showNew" class="card" style="padding: 9px">
      <div class="grid grid-4" style="gap: 7px">
        <label class="field" style="grid-column: span 2"><span class="label">任务标题</span><input v-model="draft.title" class="input slim" placeholder="完成第二幕白盒" /></label>
        <label class="field"><span class="label">模块</span><input v-model="draft.module" class="input slim" /></label>
        <label class="field"><span class="label">负责人</span><input v-model="draft.owner" class="input slim" /></label>
        <label class="field"><span class="label">预计人日</span><input v-model.number="draft.estimate" type="number" min="0.5" step="0.5" class="input slim" /></label>
        <label class="field"><span class="label">优先级</span><select v-model="draft.priority" class="select slim"><option v-for="(v, k) in PRIORITY" :key="k" :value="k">{{ v }}</option></select></label>
        <label class="field" style="grid-column: span 2"><span class="label">备注</span><input v-model="draft.notes" class="input slim" /></label>
      </div>
      <div class="row" style="justify-content: flex-end; gap: 6px; margin-top: 7px">
        <button class="btn sm ghost" @click="showNew = false">取消</button>
        <button class="btn sm primary" :disabled="!draft.title.trim()" @click="addTask">创建任务</button>
      </div>
    </div>

    <div class="prod-grid">
      <section class="board">
        <div v-for="col in COLUMNS" :key="col.id" class="board-col">
          <div class="board-head"><span>{{ col.label }}</span><span class="badge">{{ grouped[col.id].length }}</span></div>
          <div class="board-list">
            <div v-for="t in grouped[col.id]" :key="t.id" class="task-card">
              <div class="row" style="justify-content: space-between; gap: 4px">
                <b class="small">{{ t.title }}</b>
                <button class="btn sm ghost danger" @click="removeTask(t)">×</button>
              </div>
              <div class="tiny dim">{{ t.module }} · {{ t.owner || '未分配' }} · {{ t.estimate || 0 }} 人日</div>
              <div class="row" style="gap: 4px; margin-top: 5px">
                <span class="chip tiny" :class="t.priority === 'high' ? 'rose' : t.priority === 'low' ? '' : 'amber'">{{ PRIORITY[t.priority] || '中' }}</span>
                <select v-model="t.status" class="select slim" style="margin-left: auto; width: 84px" @change="load">
                  <option v-for="c in COLUMNS" :key="c.id" :value="c.id">{{ c.label }}</option>
                </select>
              </div>
            </div>
            <div v-if="!grouped[col.id].length" class="hint" style="padding: 8px 2px">空</div>
          </div>
        </div>
      </section>

      <aside class="card">
        <div class="card-head"><span class="card-title">就绪度与缺口</span></div>
        <div class="card-body col" style="gap: 9px">
          <div class="readiness">
            <div class="readiness-num">{{ report?.readiness ?? '—' }}<small>%</small></div>
            <div class="tiny dim">任务 {{ report?.tasks.progress || 0 }}% · 资产 {{ report?.assets.ready || 0 }}% · 本地化 {{ report?.localization.avgCoverage || 0 }}%</div>
          </div>
          <div class="divider"></div>
          <div class="side-title">制作缺口 <span class="badge">{{ report?.missingTotal || 0 }}</span></div>
          <div v-for="(m, i) in (report?.missing || []).slice(0, 12)" :key="i" class="warning-row" :class="m.type === 'localization' ? 'warn' : 'info'">
            <span>!</span><span class="tiny">{{ m.message }}</span>
          </div>
          <div v-if="!report?.missing?.length" class="notice ok" style="padding: 7px 9px"><span>✓</span><div class="tiny">没有明显缺口。</div></div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.production-panel { display: flex; flex-direction: column; gap: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.prod-grid { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 10px; }
.board { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; min-width: 0; }
.board-col { border: 1px solid var(--line); border-radius: 9px; background: rgba(2, 6, 23, 0.2); display: flex; flex-direction: column; min-height: 200px; }
.board-head { display: flex; align-items: center; justify-content: space-between; padding: 7px 8px; border-bottom: 1px solid var(--line); font-size: 11px; color: var(--muted); }
.board-list { padding: 6px; display: flex; flex-direction: column; gap: 5px; }
.task-card { border: 1px solid var(--line); border-radius: 7px; padding: 7px; background: rgba(15, 23, 42, 0.55); }
.readiness { display: flex; flex-direction: column; gap: 3px; }
.readiness-num { font-family: var(--mono); font-size: 32px; color: var(--cyan); }
.readiness-num small { font-size: 13px; color: var(--dim); }
@media (max-width: 1100px) { .prod-grid { grid-template-columns: 1fr; } .board { overflow-x: auto; } }
</style>
