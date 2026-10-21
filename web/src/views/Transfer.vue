<script setup>
import { computed, ref } from 'vue'
import { store, ensureSaved, reloadProject, switchProject, notify, navigate } from '../store'
import { api } from '../api'

const fileInput = ref(null)
const dragging = ref(false)
const reading = ref(false)
const importing = ref(false)
const preview = ref(null)
const fileName = ref('')
const buffer = ref(null)
const mode = ref('copy')
const importName = ref('')
const exportInfo = ref(null)
const exporting = ref(false)

const project = computed(() => store.project)
const counts = computed(() => ({
  nodes: project.value?.narrative?.nodes?.length || 0,
  characters: project.value?.characters?.length || 0,
  world: project.value?.world?.elements?.length || 0,
  cases: project.value?.cases?.length || 0
}))
const errorConflicts = computed(() => (preview.value?.conflicts || []).filter((c) => c.level === 'error'))
const canConfirm = computed(() => !!preview.value && !errorConflicts.value.length && !importing.value)
const overwrite = computed(() => preview.value && preview.value.existing && mode.value === 'overwrite')

function fmtSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function fmtTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

async function doExport() {
  exporting.value = true
  try {
    await ensureSaved()
    const { blob, filename } = await api.exportGstory(store.activeId)
    const name = filename || `${store.project.name}.gstory`
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 2000)
    exportInfo.value = { name, size: blob.size, at: new Date() }
    notify(`已导出 ${name}（${fmtSize(blob.size)}）`, 'ok')
  } catch (e) {
    notify(`导出失败：${e.message}`, 'error')
  } finally {
    exporting.value = false
  }
}

function openFile() {
  fileInput.value?.click()
}

async function onFile(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (file) await loadFile(file)
}

async function onDrop(ev) {
  ev.preventDefault()
  dragging.value = false
  const file = ev.dataTransfer?.files?.[0]
  if (file) await loadFile(file)
}

async function loadFile(file) {
  if (!/\.gstory$/i.test(file.name)) {
    notify('请选择 .gstory 专有存档', 'warn')
    return
  }
  reading.value = true
  preview.value = null
  try {
    const data = await file.arrayBuffer()
    buffer.value = data
    fileName.value = file.name
    const out = await api.previewImport(data)
    preview.value = out
    importName.value = out.suggestedName || out.summary?.name || '导入企划'
    mode.value = 'copy'
    notify(`存档读取成功：${out.summary?.name || file.name}`, 'ok')
  } catch (e) {
    buffer.value = null
    preview.value = null
    notify(`读取存档失败：${e.message}`, 'error', 5000)
  } finally {
    reading.value = false
  }
}

async function confirmImport() {
  if (!preview.value || !buffer.value) return
  if (overwrite.value) {
    if (!confirm(`覆盖现有企划「${preview.value.existing.name}」？\n当前 revision ${preview.value.existing.revision} 将被替换，但会保留版本历史。`)) return
  }
  importing.value = true
  try {
    await ensureSaved()
    const out = await api.importGstory(buffer.value, {
      mode: mode.value,
      name: importName.value.trim(),
      targetId: overwrite.value ? preview.value.existing.id : '',
      baseRevision: overwrite.value ? preview.value.existing.revision : ''
    })
    store.projects = out.projects || store.projects
    if (out.mode === 'overwrite' && out.project.id === store.activeId) await reloadProject()
    else await switchProject(out.project.id)
    notify(`已导入「${out.project.name}」`, 'ok', 3200)
    preview.value = null
    buffer.value = null
    fileName.value = ''
    navigate('dashboard')
  } catch (e) {
    if (e.status === 409) notify('目标企划已被修改，请重新选择文件预览后再导入', 'warn', 4500)
    else notify(`导入失败：${e.message}`, 'error', 5000)
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <div class="page transfer-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">导入 / 导出</h1>
        <p class="page-desc">导出专有 .gstory 压缩包，或导入他人存档并在写入前检查冲突与引用风险。</p>
      </div>
      <div class="head-actions">
        <button class="btn primary" :disabled="exporting" @click="doExport">{{ exporting ? '打包中…' : '⬇ 导出当前企划' }}</button>
        <button class="btn" @click="openFile">⬆ 导入 .gstory</button>
      </div>
    </div>

    <div class="transfer-grid">
      <section class="card export-card">
        <div class="card-head"><span class="card-title">导出存档</span><span class="badge">.gstory</span></div>
        <div class="card-body col" style="gap: 12px">
          <div class="project-badge">
            <div class="badge-icon">◍</div>
            <div class="grow">
              <b>{{ project?.name }}</b>
              <div class="tiny dim">{{ project?.meta?.genre || '未标注题材' }} · revision {{ store.revision }}</div>
            </div>
          </div>
          <div class="mini-grid">
            <div><b>{{ counts.nodes }}</b><span>剧情节点</span></div>
            <div><b>{{ counts.characters }}</b><span>角色</span></div>
            <div><b>{{ counts.world }}</b><span>世界元素</span></div>
            <div><b>{{ counts.cases }}</b><span>推理案件</span></div>
          </div>
          <div class="hint">
            导出 ZIP 压缩包，内含 <span class="mono">manifest.json</span>、<span class="mono">project.json</span> 与校验哈希；不包含运行数据、密钥或历史快照。
          </div>
          <div v-if="exportInfo" class="notice ok">
            <span>✓</span>
            <div>已导出 <b>{{ exportInfo.name }}</b> · {{ fmtSize(exportInfo.size) }} · {{ fmtTime(exportInfo.at.toISOString()) }}</div>
          </div>
        </div>
      </section>

      <section class="card import-card">
        <div class="card-head"><span class="card-title">导入存档</span><span class="badge">冲突预检</span></div>
        <div class="card-body">
          <div
            class="drop-zone"
            :class="{ dragging, reading }"
            @click="openFile"
            @dragover.prevent="dragging = true"
            @dragleave.prevent="dragging = false"
            @drop="onDrop"
          >
            <input ref="fileInput" type="file" accept=".gstory,application/zip" hidden @change="onFile" />
            <div class="drop-icon">{{ reading ? '…' : '⇩' }}</div>
            <b>{{ reading ? '正在读取存档…' : '拖入 .gstory 文件，或点击选择' }}</b>
            <span class="tiny dim">最大 32MB；写入前会校验格式、哈希、版本与引用</span>
            <span v-if="fileName" class="chip tiny cyan">{{ fileName }}</span>
          </div>

          <div v-if="preview" class="preview-panel">
            <div class="preview-head">
              <div>
                <b>{{ preview.summary?.name }}</b>
                <div class="tiny dim">
                  revision {{ preview.manifest?.revision ?? '—' }} · 导出 {{ fmtTime(preview.manifest?.exportedAt) }} ·
                  {{ fmtSize(preview.size) }}
                </div>
              </div>
              <span class="chip tiny" :class="errorConflicts.length ? 'rose' : 'green'">{{ errorConflicts.length ? '存在错误' : '校验通过' }}</span>
            </div>
            <div class="mini-grid">
              <div><b>{{ preview.summary?.nodes }}</b><span>节点</span></div>
              <div><b>{{ preview.summary?.characters }}</b><span>角色</span></div>
              <div><b>{{ preview.summary?.worldElements }}</b><span>世界元素</span></div>
              <div><b>{{ (preview.conflicts || []).length }}</b><span>冲突/提示</span></div>
            </div>

            <div v-if="preview.conflicts?.length" class="conflict-list">
              <div v-for="(c, i) in preview.conflicts" :key="i" class="conflict-row" :class="c.level">
                <span class="conflict-mark">{{ c.level === 'error' ? '✕' : c.level === 'warn' ? '!' : 'i' }}</span>
                <span>{{ c.message }}</span>
              </div>
            </div>
            <div v-else class="notice ok"><span>✓</span><div class="tiny">未发现冲突或引用问题。</div></div>

            <div v-if="preview.canOverwrite" class="mode-box">
              <label class="radio-row">
                <input v-model="mode" type="radio" value="copy" />
                <span><b>导入为新企划</b><span class="tiny dim">（推荐）</span><span class="tiny dim">保留现有数据，生成新 ID。</span></span>
              </label>
              <label class="radio-row">
                <input v-model="mode" type="radio" value="overwrite" />
                <span><b>覆盖现有企划</b><span class="tiny dim">目标 revision {{ preview.existing?.revision }}，会保留版本历史。</span></span>
              </label>
            </div>

            <label class="field">
              <span class="label">导入后的企划名</span>
              <input v-model="importName" class="input" :disabled="overwrite" />
            </label>

            <div class="row" style="justify-content: flex-end; gap: 8px">
              <button class="btn ghost" @click="preview = null; buffer = null; fileName = ''">取消</button>
              <button class="btn primary" :disabled="!canConfirm" @click="confirmImport">{{ importing ? '导入中…' : overwrite ? '确认覆盖导入' : '确认导入' }}</button>
            </div>
          </div>

          <div v-else class="import-tips">
            <div class="tip-row"><span>01</span><div><b>预检</b><p>读取 manifest、校验 project.json 哈希、检查企划 ID/名称冲突与引用完整性。</p></div></div>
            <div class="tip-row"><span>02</span><div><b>选择策略</b><p>默认复制为新企划；若 ID 已存在，可显式覆盖并保留版本历史。</p></div></div>
            <div class="tip-row"><span>03</span><div><b>写入</b><p>导入会生成一条“导入存档”版本，可在历史版本中对比或回退。</p></div></div>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.transfer-page { min-height: 640px; }
.transfer-grid { display: grid; grid-template-columns: 0.85fr 1.15fr; gap: 12px; align-items: start; }
.export-card, .import-card { overflow: hidden; }
.project-badge { display: flex; align-items: center; gap: 10px; padding: 10px; border: 1px solid var(--line); border-radius: 9px; background: rgba(2, 6, 23, 0.3); }
.badge-icon { width: 38px; height: 38px; border-radius: 10px; display: grid; place-items: center; color: var(--cyan); border: 1px solid rgba(103, 232, 249, 0.3); background: rgba(103, 232, 249, 0.08); font-size: 18px; }
.mini-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.mini-grid > div { padding: 8px 5px; border: 1px solid var(--line); border-radius: 7px; text-align: center; background: rgba(2, 6, 23, 0.25); }
.mini-grid b { display: block; font-family: var(--mono); font-size: 15px; color: #e6fbff; font-weight: 500; }
.mini-grid span { font-size: 9px; color: var(--dim); }
.drop-zone { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 24px 16px; border: 1px dashed rgba(148, 163, 184, 0.35); border-radius: 10px; background: rgba(2, 6, 23, 0.25); cursor: pointer; text-align: center; transition: border-color 0.15s, background 0.15s; }
.drop-zone:hover, .drop-zone.dragging { border-color: rgba(103, 232, 249, 0.6); background: rgba(103, 232, 249, 0.06); }
.drop-zone.reading { pointer-events: none; opacity: 0.7; }
.drop-icon { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; border: 1px solid rgba(103, 232, 249, 0.3); color: var(--cyan); font-size: 19px; }
.preview-panel { margin-top: 11px; display: flex; flex-direction: column; gap: 10px; }
.preview-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.conflict-list { display: flex; flex-direction: column; gap: 4px; max-height: 180px; overflow: auto; }
.conflict-row { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; line-height: 1.5; padding: 5px 7px; border-radius: 6px; background: rgba(2, 6, 23, 0.3); }
.conflict-mark { font-family: var(--mono); font-size: 10px; flex: 0 0 12px; }
.conflict-row.error { color: #fecdd3; border-left: 2px solid var(--rose); }
.conflict-row.warn { color: #fde68a; border-left: 2px solid var(--amber); }
.conflict-row.info { color: var(--muted); border-left: 2px solid rgba(103, 232, 249, 0.5); }
.mode-box { display: flex; flex-direction: column; gap: 5px; padding: 9px; border: 1px solid var(--line); border-radius: 8px; background: rgba(2, 6, 23, 0.25); }
.radio-row { display: flex; align-items: flex-start; gap: 7px; font-size: 12px; cursor: pointer; }
.radio-row input { margin-top: 2px; }
.radio-row > span { display: flex; flex-direction: column; gap: 2px; }
.import-tips { margin-top: 12px; display: flex; flex-direction: column; gap: 9px; }
.tip-row { display: flex; gap: 9px; align-items: flex-start; }
.tip-row > span { font-family: var(--mono); font-size: 10px; color: var(--cyan); border: 1px solid rgba(103, 232, 249, 0.25); border-radius: 4px; padding: 2px 4px; }
.tip-row b { font-size: 12px; }
.tip-row p { margin: 2px 0 0; font-size: 11px; color: var(--dim); line-height: 1.5; }
@media (max-width: 980px) {
  .transfer-grid { grid-template-columns: 1fr; }
}
</style>
