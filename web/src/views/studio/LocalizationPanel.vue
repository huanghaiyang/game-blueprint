<script setup>
import { computed, onMounted, ref } from 'vue'
import { store, ensureSaved, notify } from '../../store'
import { api } from '../../api'

const project = computed(() => store.project)
const report = ref(null)
const loading = ref(false)
const search = ref('')
const moduleFilter = ref('')
const missingOnly = ref(false)
const newCode = ref('')
const newName = ref('')
const fileInput = ref(null)

const loc = computed(() => project.value?.localization || (project.value.localization = { defaultLocale: 'zh-CN', locales: [], strings: {} }))
const locales = computed(() => loc.value.locales || [])
const rows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return (report.value?.entries || []).filter((r) => {
    if (moduleFilter.value && r.module !== moduleFilter.value) return false
    if (missingOnly.value && locales.value.every((l) => r.values[l.id]?.trim())) return false
    if (!q) return true
    return `${r.key} ${r.source} ${r.entityLabel} ${r.field}`.toLowerCase().includes(q)
  })
})
const modules = computed(() => report.value?.modules || [])
const avgCoverage = computed(() => {
  const s = report.value?.summary || []
  return s.length ? Math.round((s.reduce((sum, x) => sum + x.coverage, 0) / s.length) * 10) / 10 : 0
})
const voice = computed(() => loc.value.voice || (loc.value.voice = {}))
const voiceStats = computed(() => report.value?.voice || { total: 0, recorded: 0, todo: 0, missing: 0 })

function setVoice(key, value) {
  voice.value[key] = value
}

function valuesFor(key) {
  if (!loc.value.strings) loc.value.strings = {}
  if (!loc.value.strings[key]) loc.value.strings[key] = {}
  return loc.value.strings[key]
}

function setValue(key, locale, value) {
  valuesFor(key)[locale] = value
}

async function load() {
  loading.value = true
  try {
    await ensureSaved()
    report.value = await api.localization(store.activeId)
  } catch (e) {
    notify(`本地化报告失败：${e.message}`, 'error')
  } finally {
    loading.value = false
  }
}

function addLocale() {
  const code = newCode.value.trim()
  const name = newName.value.trim() || code
  if (!code) return
  if (locales.value.some((l) => l.id === code)) {
    notify('该语言代码已存在', 'warn')
    return
  }
  if (!Array.isArray(loc.value.locales)) loc.value.locales = []
  loc.value.locales.push({ id: code, name })
  newCode.value = ''
  newName.value = ''
  load()
}

function removeLocale(l) {
  if (!confirm(`删除语言「${l.name}」及其全部译文？`)) return
  loc.value.locales = locales.value.filter((x) => x.id !== l.id)
  for (const key of Object.keys(loc.value.strings || {})) delete loc.value.strings[key][l.id]
  load()
}

function fillPseudo(l) {
  for (const row of report.value?.entries || []) {
    const v = valuesFor(row.key)
    if (!v[l.id]?.trim()) v[l.id] = `⟦${row.source}⟧`
    row.values[l.id] = v[l.id]
  }
  notify(`已为 ${l.name} 填充伪本地化`, 'ok')
}

function download(name, text, type = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

async function exportCsv() {
  try {
    await ensureSaved()
    const text = await api.localizationCsv(store.activeId)
    download(`${store.project.name}-localization.csv`, text, 'text/csv;charset=utf-8')
  } catch (e) {
    notify(`导出失败：${e.message}`, 'error')
  }
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const head = rows.shift()?.map((h) => h.trim()) || []
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}

async function importCsv(ev) {
  const file = ev.target.files?.[0]
  ev.target.value = ''
  if (!file) return
  const text = await file.text()
  const parsed = parseCsv(text)
  let count = 0
  for (const row of parsed) {
    if (!row.key) continue
    for (const l of locales.value) {
      if (row[l.id] !== undefined) {
        setValue(row.key, l.id, row[l.id])
        count++
      }
    }
  }
  notify(`已导入 ${count} 条译文`, 'ok')
  load()
}

onMounted(async () => {
  await load()
  if (!report.value?.total) {
    await new Promise((r) => setTimeout(r, 420))
    await load()
  }
})

</script>

<template>
  <div class="studio-panel loc-panel">
    <div class="panel-head">
      <div class="row" style="gap: 7px; flex-wrap: wrap">
        <span class="badge">字符串 {{ report?.total || 0 }}</span>
        <span class="badge">语言 {{ locales.length }}</span>
        <span class="chip tiny" :class="avgCoverage > 85 ? 'green' : avgCoverage > 40 ? 'amber' : 'rose'">平均覆盖 {{ avgCoverage }}%</span>
        <span class="chip tiny">配音 {{ voiceStats.recorded }}/{{ voiceStats.total }}</span>
      </div>
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <button class="btn sm ghost" :disabled="loading" @click="load">{{ loading ? '刷新中…' : '↻ 刷新' }}</button>
        <button class="btn sm ghost" @click="exportCsv">导出 CSV</button>
        <button class="btn sm ghost" @click="fileInput?.click()">导入 CSV</button>
        <input ref="fileInput" type="file" accept=".csv,text/csv" hidden @change="importCsv" />
      </div>
    </div>

    <div class="loc-grid">
      <section class="card loc-main">
        <div class="card-head">
          <span class="card-title">字符串表</span>
          <span class="tiny dim">源语言：{{ report?.defaultLocale || 'zh-CN' }} · 译文直接写入企划并自动保存</span>
        </div>
        <div class="loc-filters">
          <input v-model="search" class="input slim" placeholder="搜索 key / 原文 / 实体…" />
          <select v-model="moduleFilter" class="select slim">
            <option value="">全部模块</option>
            <option v-for="m in modules" :key="m.id" :value="m.id">{{ m.name }} ({{ m.count }})</option>
          </select>
          <label class="switch-row tiny"><input v-model="missingOnly" type="checkbox" /> 只看缺失</label>
        </div>
        <div class="loc-table-wrap">
          <table class="loc-table">
            <thead>
              <tr>
                <th style="width: 25%">原文</th>
                <th v-for="l in locales" :key="l.id">{{ l.name }} <span class="tiny dim">{{ report?.summary?.find(x => x.id === l.id)?.coverage || 0 }}%</span></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.key">
                <td>
                  <div class="source">{{ r.source }}</div>
                  <div class="tiny dim"><span class="mono">{{ r.key }}</span> · {{ r.entityLabel }} · {{ r.field }}</div>
                  <select
                    v-if="r.key.startsWith('dlg:') && r.key.includes(':line:')"
                    class="select slim voice-select"
                    :value="voice[r.key] || ''"
                    @change="setVoice(r.key, $event.target.value)"
                  >
                    <option value="">配音未标记</option>
                    <option value="todo">待录制</option>
                    <option value="recorded">已录制</option>
                    <option value="missing">缺失</option>
                  </select>
                </td>
                <td v-for="l in locales" :key="l.id">
                  <textarea
                    class="input loc-text"
                    rows="2"
                    :value="r.values[l.id] || ''"
                    :placeholder="r.source"
                    @input="setValue(r.key, l.id, $event.target.value)"
                  ></textarea>
                </td>
              </tr>
              <tr v-if="!rows.length"><td :colspan="1 + locales.length" class="empty" style="padding: 28px">没有匹配的字符串</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <aside class="card">
        <div class="card-head"><span class="card-title">语言与覆盖</span></div>
        <div class="card-body col" style="gap: 9px">
          <div v-for="l in locales" :key="l.id" class="locale-row">
            <div>
              <b class="small">{{ l.name }}</b>
              <span class="tiny dim mono">{{ l.id }}</span>
            </div>
            <div class="tiny dim">{{ report?.summary?.find(x => x.id === l.id)?.translated || 0 }} / {{ report?.total || 0 }}</div>
            <div class="row" style="gap: 3px">
              <button class="btn sm ghost" title="用 ⟦原文⟧ 填充缺失项" @click="fillPseudo(l)">伪</button>
              <button class="btn sm ghost danger" @click="removeLocale(l)">删</button>
            </div>
          </div>
          <div v-if="!locales.length" class="hint">还没有目标语言。添加语言后即可逐条翻译。</div>
          <div class="divider"></div>
          <label class="field"><span class="label">语言代码</span><input v-model="newCode" class="input slim" placeholder="en / ja / fr" /></label>
          <label class="field"><span class="label">显示名</span><input v-model="newName" class="input slim" placeholder="English / 日本語" /></label>
          <button class="btn sm" :disabled="!newCode.trim()" @click="addLocale">＋ 添加语言</button>
          <div class="hint">CSV 列：key,module,entity,field,source,目标语言代码。导入按 key 与语言代码合并。</div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.loc-panel { display: flex; flex-direction: column; gap: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.loc-grid { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: 10px; min-height: 400px; }
.loc-main { min-width: 0; display: flex; flex-direction: column; overflow: hidden; }
.loc-filters { display: flex; align-items: center; gap: 7px; padding: 8px 12px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.loc-filters .input { flex: 1; min-width: 150px; }
.loc-table-wrap { overflow: auto; max-height: 560px; }
.loc-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.loc-table th { position: sticky; top: 0; z-index: 1; background: #0d1626; text-align: left; color: var(--muted); font-weight: 500; padding: 7px 8px; border-bottom: 1px solid var(--line); }
.loc-table td { vertical-align: top; padding: 7px 8px; border-bottom: 1px solid var(--line); }
.loc-table tr:hover td { background: rgba(148, 163, 184, 0.03); }
.source { line-height: 1.55; color: #dbeafe; }
.voice-select { margin-top: 4px; width: 108px; font-size: 10px; }
.loc-text { width: 100%; min-width: 150px; resize: vertical; font-size: 11px; line-height: 1.5; }
.locale-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; border: 1px solid var(--line); border-radius: 7px; padding: 6px 7px; }
.locale-row > div:first-child { display: flex; flex-direction: column; gap: 1px; }
@media (max-width: 1000px) { .loc-grid { grid-template-columns: 1fr; } }
</style>
