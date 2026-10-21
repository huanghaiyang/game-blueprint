<script setup>
import { computed, onMounted, ref } from 'vue'
import { store, ensureSaved, reloadProject, notify } from '../store'
import { api } from '../api'
import { WORLD_TYPES } from '../worldTypes'

const versions = ref([])
const loading = ref(false)
const comparing = ref(false)
const restoring = ref(false)
const fromId = ref('')
const toId = ref('')
const diff = ref(null)
const checkpointLabel = ref('')
const error = ref('')

const project = computed(() => store.project)
const toVersion = computed(() => versions.value.find((v) => v.id === toId.value) || null)
const fromVersion = computed(() => versions.value.find((v) => v.id === fromId.value) || null)
const canRestore = computed(() => !!toVersion.value && Number(toVersion.value.revision) !== Number(store.revision))
const changedModuleList = computed(() => (diff.value?.summary?.changedModules || []).map((m) => m.key))

const KIND = {
  initial: { label: '初始', tone: 'cyan' },
  auto: { label: '自动', tone: '' },
  manual: { label: '检查点', tone: 'amber' },
  restore: { label: '回退', tone: 'rose' },
  import: { label: '导入', tone: 'green' },
  reset: { label: '重置', tone: 'rose' }
}

function kindInfo(kind) {
  return KIND[kind] || { label: kind || '版本', tone: '' }
}

function fmtTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function versionOption(v) {
  return `r${v.revision} · ${v.label || v.id} · ${fmtTime(v.createdAt)}`
}

function countText(m) {
  const parts = []
  if (m.counts.added) parts.push(`+${m.counts.added}`)
  if (m.counts.removed) parts.push(`-${m.counts.removed}`)
  if (m.counts.updated) parts.push(`~${m.counts.updated}`)
  if (m.counts.fields) parts.push(`${m.counts.fields} 字段`)
  return parts.join(' · ') || '仅派生变化'
}

function typeLabel(type) {
  if (type === 'custom') return '自定义元素'
  return WORLD_TYPES[type]?.label || type
}

async function load({ keepSelection = false } = {}) {
  loading.value = true
  error.value = ''
  try {
    await ensureSaved()
    const data = await api.versions(store.activeId)
    versions.value = data.versions || []
    if (!keepSelection || !versions.value.some((v) => v.id === toId.value)) {
      toId.value = versions.value[0]?.id || ''
      fromId.value = versions.value[1]?.id || toId.value
    }
    if (!versions.value.some((v) => v.id === fromId.value)) fromId.value = versions.value[1]?.id || toId.value
    await compare()
  } catch (e) {
    error.value = e.message
    notify(`历史版本加载失败：${e.message}`, 'error')
  } finally {
    loading.value = false
  }
}

async function compare() {
  if (!fromId.value || !toId.value) return
  comparing.value = true
  try {
    const data = await api.compareVersions(store.activeId, fromId.value, toId.value)
    diff.value = data.diff
  } catch (e) {
    notify(`版本对比失败：${e.message}`, 'error')
  } finally {
    comparing.value = false
  }
}

function pickTarget(v) {
  toId.value = v.id
  if (fromId.value === toId.value && versions.value.length > 1) {
    fromId.value = versions.value.find((x) => x.id !== v.id)?.id || toId.value
  }
  compare()
}

async function createCheckpoint() {
  const label = checkpointLabel.value.trim() || `手动检查点 · ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`
  try {
    const out = await api.createVersion(store.activeId, label)
    checkpointLabel.value = ''
    notify(`已创建检查点「${label}」`, 'ok')
    await load({ keepSelection: true })
    if (out.entry?.id) {
      toId.value = out.entry.id
      fromId.value = versions.value[1]?.id || out.entry.id
      await compare()
    }
  } catch (e) {
    notify(`创建检查点失败：${e.message}`, 'error')
  }
}

async function restore() {
  if (!toVersion.value || !canRestore.value) return
  const v = toVersion.value
  if (!confirm(`回退到 r${v.revision}「${v.label}」？\n当前数据会先保存为自动版本，回退记录也会保留。`)) return
  restoring.value = true
  try {
    await ensureSaved()
    await api.restoreVersion(store.activeId, v.id, store.revision)
    await reloadProject()
    notify(`已回退到 r${v.revision}「${v.label}」`, 'ok', 3600)
    await load()
  } catch (e) {
    if (e.status === 409) {
      notify('当前企划已被修改，正在刷新历史…', 'warn')
      await load()
    } else {
      notify(`回退失败：${e.message}`, 'error')
    }
  } finally {
    restoring.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page history-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">历史版本</h1>
        <p class="page-desc">自动保存与手动检查点、跨版本模块对比、影响范围与一键回退。</p>
      </div>
      <div class="head-actions">
        <input v-model="checkpointLabel" class="input slim" placeholder="检查点名称（可选）" @keydown.enter="createCheckpoint" />
        <button class="btn primary" @click="createCheckpoint">＋ 创建检查点</button>
        <button class="btn ghost" :disabled="loading" @click="load({ keepSelection: true })">{{ loading ? '刷新中…' : '刷新' }}</button>
      </div>
    </div>

    <div v-if="error" class="notice warn"><span>!</span><div>{{ error }}</div></div>

    <div class="history-layout">
      <aside class="card timeline">
        <div class="card-head">
          <span class="card-title">版本时间线</span>
          <span class="badge">{{ versions.length }}</span>
        </div>
        <div class="timeline-list">
          <button
            v-for="v in versions"
            :key="v.id"
            class="version-row"
            :class="{ active: v.id === toId, compare: v.id === fromId }"
            :data-version-id="v.id"
            @click="pickTarget(v)"
          >
            <span class="version-dot" :class="kindInfo(v.kind).tone"></span>
            <span class="grow">
              <span class="version-title">
                {{ v.label || v.id }}
                <span v-if="v.pinned" class="pin" title="已固定">◆</span>
              </span>
              <span class="version-meta">
                <span class="mono">r{{ v.revision }}</span>
                <span>{{ fmtTime(v.createdAt) }}</span>
                <span class="chip tiny" :class="kindInfo(v.kind).tone">{{ kindInfo(v.kind).label }}</span>
                <span v-if="v.isCurrent" class="chip tiny cyan">当前</span>
              </span>
              <span class="version-counts tiny dim">
                {{ v.summary?.counts?.nodes || 0 }} 节点 · {{ v.summary?.counts?.characters || 0 }} 角色 · {{ v.summary?.counts?.worldElements || 0 }} 元素
              </span>
            </span>
            <span v-if="v.id === fromId" class="side-mark">A</span>
            <span v-if="v.id === toId" class="side-mark target">B</span>
          </button>
          <div v-if="!versions.length && !loading" class="empty">还没有历史版本。编辑并自动保存后会出现。</div>
        </div>
        <div class="timeline-foot tiny dim">
          自动版本最多保留 60 个；手动检查点会固定保留。点击版本设为对比目标 B。
        </div>
      </aside>

      <section class="diff-area">
        <div class="card compare-head">
          <div class="compare-selects">
            <label class="field">
              <span class="label">基准版本 A</span>
              <select v-model="fromId" class="select" @change="compare">
                <option v-for="v in versions" :key="v.id" :value="v.id">{{ versionOption(v) }}</option>
              </select>
            </label>
            <span class="arrow">→</span>
            <label class="field">
              <span class="label">目标版本 B</span>
              <select v-model="toId" class="select" @change="compare">
                <option v-for="v in versions" :key="v.id" :value="v.id">{{ versionOption(v) }}</option>
              </select>
            </label>
          </div>
          <div class="compare-actions">
            <button class="btn sm ghost" :disabled="comparing" @click="compare">{{ comparing ? '对比中…' : '重新对比' }}</button>
            <button class="btn sm" :disabled="!canRestore || restoring" @click="restore">{{ restoring ? '回退中…' : `回退到 B${toVersion ? ` (r${toVersion.revision})` : ''}` }}</button>
          </div>
        </div>

        <div v-if="diff" class="diff-content">
          <div v-if="!diff.summary.changed" class="card empty-diff">
            <div class="empty-icon">✓</div>
            <div>
              <b>两个版本内容一致</b>
              <p class="small dim">没有检测到企划、叙事、角色、数值、开放世界或推理案件的变化。</p>
            </div>
          </div>

          <template v-else>
            <div class="summary-grid">
              <div class="summary-card">
                <span class="summary-label">变化模块</span>
                <b class="summary-value">{{ diff.summary.changedModules.length }}</b>
                <span class="tiny dim">{{ diff.summary.changedModules.map((m) => m.label).join('、') }}</span>
              </div>
              <div class="summary-card">
                <span class="summary-label">新增 / 删除 / 更新</span>
                <b class="summary-value">+{{ diff.summary.added }} / -{{ diff.summary.removed }} / ~{{ diff.summary.updated }}</b>
                <span class="tiny dim">实体级变化；另有 {{ diff.summary.fields }} 个对象字段变化</span>
              </div>
              <div class="summary-card">
                <span class="summary-label">模块开关</span>
                <b class="summary-value">{{ diff.summary.moduleToggles.length }}</b>
                <span class="tiny dim">{{ diff.summary.moduleToggles.map((t) => `${t.label}${t.to ? '开' : '关'}`).join('、') || '无变化' }}</span>
              </div>
              <div class="summary-card impact">
                <span class="summary-label">影响范围</span>
                <b class="summary-value">{{ diff.impact.affectedModules.length }} 个模块</b>
                <span class="tiny dim">{{ diff.impact.affectedModules.map((m) => m.label).join('、') }}</span>
              </div>
            </div>

            <div class="card impact-card">
              <div class="card-head"><span class="card-title">影响范围与风险</span><span class="badge">{{ diff.impact.notes.length }} 条</span></div>
              <div class="card-body">
                <div class="chips" style="margin-bottom: 8px">
                  <span v-for="m in diff.impact.affectedModules" :key="m.key" class="chip tiny">{{ m.label }}</span>
                </div>
                <div v-for="(n, i) in diff.impact.notes" :key="i" class="impact-note" :class="n.level">
                  <span class="impact-dot"></span>
                  <span>{{ n.text }}</span>
                </div>
                <div v-if="!diff.impact.notes.length" class="hint">本次变化没有跨模块风险提示。</div>
              </div>
            </div>

            <div class="module-grid">
              <div v-for="(m, key) in diff.modules" :key="key" class="card module-card" :class="{ changed: m.changed }">
                <div class="module-head">
                  <span class="module-dot" :class="{ on: m.changed }"></span>
                  <span class="grow">
                    <span class="module-title">{{ m.label }}</span>
                    <span class="module-sub tiny dim">{{ m.changed ? countText(m) : '无变化' }}</span>
                  </span>
                  <span v-if="m.changed" class="chip tiny amber">已变化</span>
                </div>
                <div class="module-body">
                  <div class="module-counts">
                    <span>前 {{ m.counts.before }}</span><span class="dim">→</span><span>后 {{ m.counts.after }}</span>
                  </div>

                  <template v-if="m.key === 'meta'">
                    <div v-for="f in m.details.fields" :key="f.field" class="change-field">
                      <span class="change-key">{{ f.field }}</span>
                      <span class="change-from">{{ f.from }}</span><span class="dim">→</span><span class="change-to">{{ f.to }}</span>
                    </div>
                    <div v-for="t in m.moduleToggles || []" :key="t.module" class="toggle-row">
                      <span class="chip tiny" :class="t.to ? 'green' : 'rose'">{{ t.label }} {{ t.to ? '启用' : '关闭' }}</span>
                    </div>
                  </template>

                  <template v-else-if="m.key === 'narrative'">
                    <div class="mini-stats">
                      <span>节点 {{ m.nodes?.before || 0 }} → {{ m.nodes?.after || 0 }}</span>
                      <span>连线 {{ m.edges?.before || 0 }} → {{ m.edges?.after || 0 }}</span>
                    </div>
                    <div v-if="m.startId?.changed" class="change-field"><span class="change-key">起点</span><span class="change-from">{{ m.startId.from }}</span><span class="dim">→</span><span class="change-to">{{ m.startId.to }}</span></div>
                  </template>

                  <template v-else-if="m.key === 'stats'">
                    <div class="mini-stats"><span>属性 {{ m.attributes?.before || 0 }} → {{ m.attributes?.after || 0 }}</span><span>公式 {{ m.formulas?.before || 0 }} → {{ m.formulas?.after || 0 }}</span></div>
                  </template>

                  <template v-else-if="m.key === 'world'">
                    <div class="mini-stats">
                      <span>聚落 {{ m.settlements?.before || 0 }} → {{ m.settlements?.after || 0 }}</span>
                      <span>对话 {{ m.dialogues?.before || 0 }} → {{ m.dialogues?.after || 0 }}</span>
                      <span>任务 {{ m.quests?.before || 0 }} → {{ m.quests?.after || 0 }}</span>
                      <span v-if="m.customTypes">类型 {{ m.customTypes.before || 0 }} → {{ m.customTypes.after || 0 }}</span>
                      <span v-if="m.categories">分类 {{ m.categories.before || 0 }} → {{ m.categories.after || 0 }}</span>
                    </div>
                    <div class="type-diff">
                      <span v-for="(n, t) in m.byType?.after || {}" :key="t" class="chip tiny" :class="{ amber: (m.byType?.before?.[t] || 0) !== n }">
                        {{ typeLabel(t) }} {{ m.byType?.before?.[t] || 0 }} → {{ n }}
                      </span>
                    </div>
                    <div v-for="s in m.settlementChanges || []" :key="s.id" class="change-field">
                      <span class="change-key">{{ s.name }}</span>
                      <span class="tiny">{{ s.fields.map((f) => `${f.field}: ${f.from}→${f.to}`).join('；') }}</span>
                    </div>
                  </template>

                  <template v-else-if="m.key === 'studio'">
                    <div class="mini-stats">
                      <span>资产 {{ m.assets?.before || 0 }} → {{ m.assets?.after || 0 }}</span>
                      <span>任务 {{ m.tasks?.before || 0 }} → {{ m.tasks?.after || 0 }}</span>
                      <span>演出 {{ m.beats?.before || 0 }} → {{ m.beats?.after || 0 }}</span>
                      <span>Storylet {{ m.storylets?.before || 0 }} → {{ m.storylets?.after || 0 }}</span>
                      <span>评论 {{ m.reviews?.before || 0 }} → {{ m.reviews?.after || 0 }}</span>
                    </div>
                    <div class="mini-stats"><span>语言 {{ m.localization?.locales?.from || 0 }} → {{ m.localization?.locales?.to || 0 }}</span><span>字符串 {{ m.localization?.strings?.from || 0 }} → {{ m.localization?.strings?.to || 0 }}</span></div>
                  </template>

                  <template v-else-if="m.key === 'cases'">
                    <div class="mini-stats"><span>案件 {{ m.counts.before }} → {{ m.counts.after }}</span><span>线索 {{ m.clues || 0 }}</span><span>规则 {{ m.rules || 0 }}</span></div>
                  </template>

                  <template v-else-if="m.key === 'branches'">
                    <div class="hint">由叙事图谱推导，节点/连线变化后需重新运行分支演算。</div>
                  </template>

                  <template v-if="m.details.added.total">
                    <div class="detail-line">
                      <span class="detail-label green">新增</span>
                      <span class="chips">
                        <span v-for="x in m.details.added.items" :key="x.id" class="chip tiny">{{ x.name || x.id }}</span>
                        <span v-if="m.details.added.truncated" class="tiny dim">+{{ m.details.added.truncated }} 个</span>
                      </span>
                    </div>
                  </template>
                  <template v-if="m.details.removed.total">
                    <div class="detail-line">
                      <span class="detail-label rose">删除</span>
                      <span class="chips">
                        <span v-for="x in m.details.removed.items" :key="x.id" class="chip tiny">{{ x.name || x.id }}</span>
                        <span v-if="m.details.removed.truncated" class="tiny dim">+{{ m.details.removed.truncated }} 个</span>
                      </span>
                    </div>
                  </template>
                  <template v-if="m.details.updated.total">
                    <div class="detail-line">
                      <span class="detail-label amber">更新</span>
                      <span class="chips">
                        <span v-for="x in m.details.updated.items" :key="x.id" class="chip tiny" :title="(x.fields || []).join(', ')">{{ x.name || x.id }}<span v-if="x.fields?.length" class="dim"> · {{ x.fields.slice(0, 3).join('/') }}</span></span>
                        <span v-if="m.details.updated.truncated" class="tiny dim">+{{ m.details.updated.truncated }} 个</span>
                      </span>
                    </div>
                  </template>
                  <template v-if="m.details.fields?.length && m.key !== 'meta'">
                    <div v-for="f in m.details.fields" :key="f.field" class="change-field">
                      <span class="change-key">{{ f.field }}</span>
                      <span class="change-from">{{ f.from }}</span><span class="dim">→</span><span class="change-to">{{ f.to }}</span>
                    </div>
                  </template>
                  <div v-if="!m.changed" class="hint">未检测到变化</div>
                </div>
              </div>
            </div>
          </template>
        </div>

        <div v-else class="card empty-diff">
          <div class="empty-icon">↺</div>
          <div><b>选择一个版本开始对比</b><p class="small dim">左侧点击版本设为目标 B，选择基准 A 后自动计算模块差异。</p></div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.history-page { height: calc(100vh - 112px); min-height: 640px; display: flex; flex-direction: column; }
.history-layout { display: grid; grid-template-columns: 300px minmax(0, 1fr); gap: 12px; flex: 1; min-height: 0; }
.timeline { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.timeline-list { flex: 1; overflow: auto; padding: 8px; min-height: 0; }
.version-row { width: 100%; display: flex; align-items: flex-start; gap: 8px; text-align: left; padding: 9px 8px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--text); cursor: pointer; }
.version-row:hover { background: rgba(148, 163, 184, 0.06); }
.version-row.active { border-color: rgba(103, 232, 249, 0.45); background: rgba(103, 232, 249, 0.07); }
.version-row.compare { box-shadow: inset 2px 0 0 rgba(251, 191, 36, 0.65); }
.version-dot { width: 7px; height: 7px; border-radius: 50%; margin-top: 5px; background: var(--dim); flex: 0 0 7px; }
.version-dot.cyan { background: var(--cyan); box-shadow: 0 0 7px rgba(103, 232, 249, 0.7); }
.version-dot.amber { background: var(--amber); }
.version-dot.rose { background: var(--rose); }
.version-dot.green { background: var(--green); }
.version-title { display: block; font-size: 12px; font-weight: 600; color: #e6fbff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 190px; }
.pin { color: var(--amber); font-size: 9px; margin-left: 4px; }
.version-meta { display: flex; align-items: center; gap: 5px; flex-wrap: wrap; margin-top: 3px; font-size: 10px; color: var(--dim); }
.version-counts { display: block; margin-top: 3px; font-size: 10px; }
.side-mark { font-family: var(--mono); font-size: 9px; color: var(--dim); border: 1px solid var(--line); border-radius: 4px; padding: 1px 3px; }
.side-mark.target { color: var(--cyan); border-color: rgba(103, 232, 249, 0.45); }
.timeline-foot { padding: 9px 12px; border-top: 1px solid var(--line); line-height: 1.5; }
.diff-area { min-height: 0; overflow: auto; padding-right: 2px; display: flex; flex-direction: column; gap: 12px; }
.compare-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 12px 14px; flex: 0 0 auto; }
.compare-selects { display: flex; align-items: flex-end; gap: 8px; flex: 1; min-width: 280px; }
.compare-selects .field { flex: 1; min-width: 150px; }
.compare-selects .arrow { color: var(--cyan); padding-bottom: 9px; }
.compare-actions { display: flex; gap: 6px; }
.diff-content { display: flex; flex-direction: column; gap: 12px; }
.summary-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.summary-card { display: flex; flex-direction: column; gap: 4px; padding: 11px 12px; border-radius: 10px; border: 1px solid var(--line); background: linear-gradient(160deg, rgba(15, 23, 42, 0.9), rgba(8, 13, 24, 0.9)); min-height: 82px; }
.summary-card.impact { border-color: rgba(251, 191, 36, 0.25); }
.summary-label { font-size: 10px; color: var(--dim); letter-spacing: 0.08em; text-transform: uppercase; }
.summary-value { font-size: 18px; color: #e6fbff; font-weight: 600; line-height: 1.2; }
.summary-card .tiny { line-height: 1.4; }
.impact-card .card-body { padding: 10px 12px; }
.impact-note { display: flex; align-items: flex-start; gap: 7px; font-size: 11.5px; color: var(--muted); padding: 4px 0; line-height: 1.55; }
.impact-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--cyan); margin-top: 7px; flex: 0 0 5px; }
.impact-note.warn .impact-dot { background: var(--amber); }
.impact-note.error .impact-dot { background: var(--rose); }
.impact-note.warn { color: #fde68a; }
.impact-note.error { color: #fecdd3; }
.module-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
.module-card { overflow: hidden; }
.module-card.changed { border-color: rgba(103, 232, 249, 0.22); }
.module-head { display: flex; align-items: center; gap: 7px; padding: 9px 11px; border-bottom: 1px solid var(--line); }
.module-dot { width: 7px; height: 7px; border-radius: 50%; background: rgba(148, 163, 184, 0.3); flex: 0 0 7px; }
.module-dot.on { background: var(--cyan); box-shadow: 0 0 7px rgba(103, 232, 249, 0.7); }
.module-title { font-size: 12px; font-weight: 600; color: #e6fbff; }
.module-sub { display: block; margin-top: 2px; }
.module-body { padding: 9px 11px 11px; }
.module-counts { font-family: var(--mono); font-size: 10.5px; color: var(--dim); margin-bottom: 7px; display: flex; gap: 6px; }
.mini-stats { display: flex; flex-wrap: wrap; gap: 5px 10px; font-size: 10.5px; color: var(--muted); margin-bottom: 7px; }
.type-diff { display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 7px; }
.detail-line { display: flex; align-items: flex-start; gap: 6px; margin-top: 6px; }
.detail-label { font-size: 9.5px; flex: 0 0 28px; padding-top: 3px; }
.detail-label.green { color: var(--green); }
.detail-label.rose { color: var(--rose); }
.detail-label.amber { color: var(--amber); }
.detail-line .chips { gap: 3px; }
.change-field { display: flex; flex-wrap: wrap; align-items: baseline; gap: 5px; font-size: 10.5px; margin-top: 4px; }
.change-key { font-family: var(--mono); color: var(--cyan); }
.change-from { color: var(--rose); }
.change-to { color: var(--green); }
.toggle-row { margin-top: 4px; }
.empty-diff { display: flex; align-items: center; gap: 14px; padding: 28px; }
.empty-icon { width: 42px; height: 42px; border-radius: 50%; border: 1px solid rgba(103, 232, 249, 0.35); display: grid; place-items: center; color: var(--cyan); font-size: 20px; }
.head-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.head-actions .input { width: 170px; }
@media (max-width: 1180px) {
  .history-page { height: auto; }
  .history-layout { grid-template-columns: 260px minmax(0, 1fr); }
  .summary-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .module-grid { grid-template-columns: 1fr; }
}
@media (max-width: 820px) {
  .history-layout { grid-template-columns: 1fr; }
  .timeline { max-height: 360px; }
  .compare-selects { flex-wrap: wrap; }
}
</style>
