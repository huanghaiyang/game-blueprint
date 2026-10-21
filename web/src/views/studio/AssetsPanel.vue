<script setup>
import { computed, ref } from 'vue'
import { store, notify } from '../../store'

const project = computed(() => store.project)
const assets = computed(() => project.value?.assets || (project.value.assets = []))
const search = ref('')
const statusFilter = ref('')
const typeFilter = ref('')
const showNew = ref(false)
const draft = ref({ name: '', type: 'portrait', status: 'todo', path: '', owner: '', tags: '', linkedModule: '', linkedId: '', notes: '' })

const TYPES = [
  ['portrait', '立绘'], ['voice', '配音'], ['scene', '场景'], ['audio', '音频'], ['video', '视频'], ['ui', 'UI'], ['other', '其他']
]
const STATUS = [['todo', '待制作'], ['wip', '制作中'], ['review', '待审核'], ['ready', '已完成'], ['missing', '缺失']]
const statusLabel = (s) => Object.fromEntries(STATUS)[s] || s
const typeLabel = (t) => Object.fromEntries(TYPES)[t] || t
const statusTone = (s) => ({ ready: 'green', wip: 'cyan', review: 'amber', missing: 'rose', todo: '' }[s] || '')

const linkOptions = computed(() => {
  const out = []
  for (const c of project.value?.characters || []) out.push({ value: `characters:${c.id}`, label: `角色 · ${c.name}` })
  for (const n of project.value?.narrative?.nodes || []) out.push({ value: `narrative:${n.id}`, label: `叙事 · ${n.title}` })
  for (const el of project.value?.world?.elements || []) out.push({ value: `world:${el.id}`, label: `世界 · ${el.name}` })
  return out
})

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return assets.value.filter((a) => {
    if (statusFilter.value && a.status !== statusFilter.value) return false
    if (typeFilter.value && a.type !== typeFilter.value) return false
    if (!q) return true
    return `${a.name} ${a.path} ${a.owner} ${(a.tags || []).join(' ')} ${a.notes}`.toLowerCase().includes(q)
  })
})
const stats = computed(() => {
  const by = (s) => assets.value.filter((a) => a.status === s).length
  return { total: assets.value.length, ready: by('ready'), wip: by('wip'), missing: by('missing'), todo: by('todo') }
})
const warnings = computed(() => {
  const out = []
  for (const a of assets.value) {
    if (a.status !== 'missing' && !a.path?.trim()) out.push({ level: 'warn', text: `「${a.name}」缺少资源路径` })
    if (a.status === 'missing') out.push({ level: 'error', text: `「${a.name}」标记为缺失` })
  }
  for (const c of project.value?.characters || []) {
    if (!assets.value.some((a) => a.linkedModule === 'characters' && a.linkedId === c.id && a.type === 'portrait')) out.push({ level: 'info', text: `角色「${c.name}」尚未关联立绘资产` })
  }
  return out.slice(0, 16)
})

function addAsset() {
  const name = draft.value.name.trim()
  if (!name) return
  const [linkedModule, linkedId] = (draft.value.linkedId || '').split(':')
  assets.value.push({
    id: `asset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name,
    type: draft.value.type,
    status: draft.value.status,
    path: draft.value.path.trim(),
    owner: draft.value.owner.trim(),
    tags: draft.value.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    linkedModule: linkedModule || '',
    linkedId: linkedId || '',
    notes: draft.value.notes.trim()
  })
  showNew.value = false
  draft.value = { name: '', type: 'portrait', status: 'todo', path: '', owner: '', tags: '', linkedModule: '', linkedId: '', notes: '' }
  notify('资产已登记', 'ok')
}

function removeAsset(a) {
  if (!confirm(`删除资产「${a.name}」？`)) return
  project.value.assets = assets.value.filter((x) => x.id !== a.id)
}

function setLink(a, value) {
  const [linkedModule, linkedId] = (value || '').split(':')
  a.linkedModule = linkedModule || ''
  a.linkedId = linkedId || ''
}
</script>

<template>
  <div class="studio-panel assets-panel">
    <div class="panel-head">
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <span class="badge">资产 {{ stats.total }}</span>
        <span class="chip tiny green">完成 {{ stats.ready }}</span>
        <span class="chip tiny cyan">制作 {{ stats.wip }}</span>
        <span class="chip tiny rose">缺失 {{ stats.missing }}</span>
      </div>
      <div class="row" style="gap: 6px">
        <input v-model="search" class="input slim" placeholder="搜索资产 / 路径 / 标签…" style="width: 190px" />
        <select v-model="statusFilter" class="select slim"><option value="">全部状态</option><option v-for="[v, l] in STATUS" :key="v" :value="v">{{ l }}</option></select>
        <select v-model="typeFilter" class="select slim"><option value="">全部类型</option><option v-for="[v, l] in TYPES" :key="v" :value="v">{{ l }}</option></select>
        <button class="btn sm primary" @click="showNew = !showNew">＋ 登记资产</button>
      </div>
    </div>

    <div v-if="showNew" class="card new-asset">
      <div class="card-body grid grid-4" style="gap: 7px">
        <label class="field"><span class="label">名称</span><input v-model="draft.name" class="input slim" placeholder="白鹭 · 立绘" /></label>
        <label class="field"><span class="label">类型</span><select v-model="draft.type" class="select slim"><option v-for="[v, l] in TYPES" :key="v" :value="v">{{ l }}</option></select></label>
        <label class="field"><span class="label">状态</span><select v-model="draft.status" class="select slim"><option v-for="[v, l] in STATUS" :key="v" :value="v">{{ l }}</option></select></label>
        <label class="field"><span class="label">负责人</span><input v-model="draft.owner" class="input slim" /></label>
        <label class="field" style="grid-column: span 2"><span class="label">资源路径 / GUID</span><input v-model="draft.path" class="input slim" placeholder="assets/characters/bailu.png" /></label>
        <label class="field" style="grid-column: span 2"><span class="label">关联内容</span><select v-model="draft.linkedId" class="select slim" @change="draft.linkedModule = ($event.target.value || '').split(':')[0]"><option value="">不关联</option><option v-for="o in linkOptions" :key="o.value" :value="o.value">{{ o.label }}</option></select></label>
        <label class="field" style="grid-column: span 2"><span class="label">标签（逗号分隔）</span><input v-model="draft.tags" class="input slim" /></label>
        <label class="field" style="grid-column: span 2"><span class="label">备注</span><input v-model="draft.notes" class="input slim" /></label>
      </div>
      <div class="row" style="justify-content: flex-end; gap: 6px; padding: 0 12px 10px">
        <button class="btn sm ghost" @click="showNew = false">取消</button>
        <button class="btn sm primary" :disabled="!draft.name.trim()" @click="addAsset">保存资产</button>
      </div>
    </div>

    <div class="assets-grid">
      <section class="card">
        <div class="card-head"><span class="card-title">资产清单</span><span class="tiny dim">资源校验与内容关联</span></div>
        <div class="asset-list">
          <div v-for="a in filtered" :key="a.id" class="asset-row">
            <span class="asset-type">{{ typeLabel(a.type) }}</span>
            <div class="grow">
              <div class="row" style="gap: 5px">
                <input v-model="a.name" class="input slim" style="border-color: transparent; background: transparent; padding-left: 0" />
                <span class="chip tiny" :class="statusTone(a.status)">{{ statusLabel(a.status) }}</span>
              </div>
              <input v-model="a.path" class="input slim" placeholder="资源路径 / GUID" style="margin-top: 3px" />
              <div class="row" style="gap: 5px; margin-top: 3px">
                <select class="select slim" style="max-width: 170px" :value="a.linkedModule && a.linkedId ? `${a.linkedModule}:${a.linkedId}` : ''" @change="setLink(a, $event.target.value)">
                  <option value="">不关联</option>
                  <option v-for="o in linkOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
                </select>
                <input v-model="a.owner" class="input slim" placeholder="负责人" style="width: 90px" />
                <select v-model="a.status" class="select slim" style="width: 90px"><option v-for="[v, l] in STATUS" :key="v" :value="v">{{ l }}</option></select>
                <button class="btn sm ghost danger" @click="removeAsset(a)">×</button>
              </div>
            </div>
          </div>
          <div v-if="!filtered.length" class="empty" style="padding: 30px">没有匹配的资产</div>
        </div>
      </section>

      <aside class="card">
        <div class="card-head"><span class="card-title">资产体检</span><span class="badge">{{ warnings.length }}</span></div>
        <div class="card-body col" style="gap: 6px">
          <div v-for="(w, i) in warnings" :key="i" class="warning-row" :class="w.level">
            <span>{{ w.level === 'error' ? '✕' : w.level === 'warn' ? '!' : 'i' }}</span>
            <span class="tiny">{{ w.text }}</span>
          </div>
          <div v-if="!warnings.length" class="notice ok" style="padding: 7px 9px"><span>✓</span><div class="tiny">资产与角色引用完整。</div></div>
          <div class="hint">资产只是制作登记，不会复制文件到企划。路径可填写工程内相对路径或 GUID。</div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.assets-panel { display: flex; flex-direction: column; gap: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.new-asset { overflow: hidden; }
.assets-grid { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 10px; }
.asset-list { max-height: 540px; overflow: auto; }
.asset-row { display: flex; gap: 8px; align-items: flex-start; padding: 8px 12px; border-bottom: 1px solid var(--line); }
.asset-row:last-child { border-bottom: 0; }
.asset-type { flex: 0 0 48px; font-size: 10px; color: var(--cyan); font-family: var(--mono); padding-top: 4px; }
.asset-row .chip { flex: 0 0 auto; white-space: nowrap; }
@media (max-width: 1000px) { .assets-grid { grid-template-columns: 1fr; } }
</style>
