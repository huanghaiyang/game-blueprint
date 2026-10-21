<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { store, navigate, ensureSaved, notify } from '../store'
import { api } from '../api'
import WorldCanvas from '../components/WorldCanvas.vue'
import WorldInspector from '../components/WorldInspector.vue'
import WorldCatalogModal from '../components/WorldCatalogModal.vue'
import {
  WORLD_TYPES,
  DEFAULT_WORLD_CATEGORIES,
  createElement,
  createCustomElement,
  newCategory,
  newCustomType,
  categoryIdOfType,
  resolveCategoryId,
  iconOfElement,
  labelOfElement,
  isPathType
} from '../worldTypes'

const p = computed(() => store.project)
const world = computed(() => p.value.world)
const elements = computed(() => world.value?.elements || [])
const selectedId = ref(
  [...elements.value]
    .filter((e) => e.type === 'settlement')
    .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]?.id ||
    [...elements.value]
      .filter((e) => e.type === 'character' && (e.data?.dialogues || []).length)
      .sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))[0]?.id ||
    ''
)
const selected = computed(() => elements.value.find((e) => e.id === selectedId.value) || null)
const search = ref('')
const category = ref('')
const drawMode = ref('')
const snap = ref(true)
const showAdd = ref(false)
const showCatalog = ref(false)
const addMenuRef = ref(null)
const canvasRef = ref(null)
const analysis = ref(null)
const analyzing = ref(false)
const canUndo = ref(false)
const canRedo = ref(false)
let analysisTimer = null
let addMenuHandler = null
let historyTimer = null
let history = []
let historyIndex = -1
let lastHistoryKey = ''
let applyingHistory = false
const HISTORY_LIMIT = 60

const categories = computed(() => {
  const stored = Array.isArray(world.value?.categories) ? world.value.categories : []
  const builtins = DEFAULT_WORLD_CATEGORIES.map((base) => {
    const found = stored.find((c) => c.id === base.id)
    return found ? { ...base, ...found, builtin: true } : { ...base }
  })
  const custom = stored
    .filter((c) => c && c.id && !DEFAULT_WORLD_CATEGORIES.some((b) => b.id === c.id))
    .map((c) => ({ builtin: false, emoji: '📁', ...c }))
  return [...builtins, ...custom]
})

const customTypes = computed(() => (Array.isArray(world.value?.customTypes) ? world.value.customTypes : []))

const categoryCounts = computed(() => {
  const out = { '': elements.value.length }
  for (const c of categories.value) out[c.id] = 0
  for (const el of elements.value) {
    const id = resolveCategoryId(el, categories.value, customTypes.value)
    out[id] = (out[id] || 0) + 1
  }
  return out
})

const visibleElementIds = computed(() => {
  if (!category.value) return elements.value.map((el) => el.id)
  return elements.value
    .filter((el) => resolveCategoryId(el, categories.value, customTypes.value) === category.value)
    .map((el) => el.id)
})

const addGroups = computed(() =>
  categories.value.map((cat) => ({
    id: cat.id,
    name: cat.name,
    emoji: cat.emoji,
    types: Object.entries(WORLD_TYPES)
      .filter(([type]) => categoryIdOfType(type) === cat.id)
      .map(([type, meta]) => ({ kind: 'builtin', key: type, type, label: meta.label, icon: meta.icon, color: meta.color, path: meta.path })),
    customTypes: customTypes.value.filter((t) => t.categoryId === cat.id)
  }))
)

const filteredList = computed(() => {
  const q = search.value.trim().toLowerCase()
  return elements.value
    .filter((el) => visibleElementIds.value.includes(el.id))
    .filter((el) => {
      if (!q) return true
      const label = labelOfElement(el, customTypes.value)
      return `${el.name} ${label} ${el.data?.characterId || ''} ${el.categoryId || ''}`.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const ca = resolveCategoryId(a, categories.value, customTypes.value)
      const cb = resolveCategoryId(b, categories.value, customTypes.value)
      return ca === cb ? String(a.name).localeCompare(String(b.name), 'zh') : ca.localeCompare(cb)
    })
})

const stats = computed(() => ({
  settlements: elements.value.filter((e) => e.type === 'settlement').length,
  characters: elements.value.filter((e) => e.type === 'character').length,
  quests: analysis.value?.summary?.quests || 0,
  errors: analysis.value?.warnings?.filter((w) => w.level === 'error').length || 0,
  warns: analysis.value?.warnings?.filter((w) => w.level === 'warn').length || 0
}))

function ensureElement(el) {
  if (!el) return
  if (!el.data) el.data = {}
  if (el.type === 'custom') {
    const ct = customTypes.value.find((t) => t.id === el.customTypeId)
    if (!el.icon) el.icon = ct?.icon || '✨'
    if (!el.color) el.color = ct?.color || '#67e8f9'
    if (!el.categoryId) el.categoryId = ct?.categoryId || 'content'
    if (el.data.description === undefined) el.data.description = ct?.description || ''
    if (el.data.notes === undefined) el.data.notes = ''
    if (el.radius == null && Number(ct?.radius) > 0) el.radius = Number(ct.radius)
    return
  }
  const meta = WORLD_TYPES[el.type]
  if (!meta) return
  const defaults = structuredClone(meta.data)
  for (const [k, v] of Object.entries(defaults)) if (el.data[k] === undefined) el.data[k] = v
  if (meta.radius && el.radius == null) el.radius = meta.radius
  if (meta.path && !Array.isArray(el.points)) el.points = []
  if (el.type === 'character') {
    if (!Array.isArray(el.data.dialogues)) el.data.dialogues = []
    for (const d of el.data.dialogues) {
      if (!Array.isArray(d.lines)) d.lines = []
      if (!Array.isArray(d.choices)) d.choices = []
      if (!Array.isArray(d.audienceIds)) d.audienceIds = []
    }
  }
  if (el.type === 'settlement') {
    if (!Array.isArray(el.data.buffs)) el.data.buffs = []
    if (!Array.isArray(el.data.services)) el.data.services = []
  }
  if (el.type === 'bulletin' && !Array.isArray(el.data.posts)) el.data.posts = []
}

function selectElement(id, focus = true) {
  selectedId.value = id || ''
  const el = elements.value.find((e) => e.id === id)
  if (el) {
    ensureElement(el)
    if (focus) nextTick(() => canvasRef.value?.focusOn(el))
  }
}

/* ---------------- 撤销 / 重做（元素快照） ---------------- */

function cloneSnapshot(value) {
  return JSON.parse(JSON.stringify(value))
}

function snapshotKey(snap) {
  return JSON.stringify(snap)
}

function updateHistoryFlags() {
  canUndo.value = historyIndex > 0
  canRedo.value = historyIndex >= 0 && historyIndex < history.length - 1
}

function resetHistory() {
  clearTimeout(historyTimer)
  historyTimer = null
  history = [cloneSnapshot(elements.value)]
  historyIndex = 0
  lastHistoryKey = snapshotKey(history[0])
  applyingHistory = false
  updateHistoryFlags()
}

function commitHistory() {
  historyTimer = null
  if (applyingHistory) return
  const snap = cloneSnapshot(elements.value)
  const key = snapshotKey(snap)
  if (key === lastHistoryKey) return
  if (historyIndex < history.length - 1) history = history.slice(0, historyIndex + 1)
  history.push(snap)
  if (history.length > HISTORY_LIMIT) history.shift()
  historyIndex = history.length - 1
  lastHistoryKey = key
  updateHistoryFlags()
}

function scheduleHistory() {
  if (applyingHistory) return
  // 先让按钮可用，真正的快照在防抖后合并；撤销前会 flush 当前状态。
  canUndo.value = snapshotKey(elements.value) !== lastHistoryKey
  canRedo.value = false
  clearTimeout(historyTimer)
  historyTimer = setTimeout(commitHistory, 400)
}

function flushHistory() {
  if (historyTimer) {
    clearTimeout(historyTimer)
    commitHistory()
  }
}

function applyHistorySnapshot(snap) {
  applyingHistory = true
  world.value.elements = cloneSnapshot(snap)
  lastHistoryKey = snapshotKey(world.value.elements)
  if (selectedId.value && !world.value.elements.some((e) => e.id === selectedId.value)) selectedId.value = ''
  updateHistoryFlags()
  nextTick(() => {
    setTimeout(() => { applyingHistory = false }, 0)
  })
}

function undo() {
  flushHistory()
  if (historyIndex <= 0) return
  historyIndex--
  applyHistorySnapshot(history[historyIndex])
  notify('已撤销', 'ok', 1200)
}

function redo() {
  flushHistory()
  if (historyIndex >= history.length - 1) return
  historyIndex++
  applyHistorySnapshot(history[historyIndex])
  notify('已重做', 'ok', 1200)
}

function onHistoryKey(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return
  const tag = e.target?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return
  const key = String(e.key).toLowerCase()
  if (key === 'z') {
    e.preventDefault()
    if (e.shiftKey) redo()
    else undo()
  } else if (key === 'y') {
    e.preventDefault()
    redo()
  }
}

function addElement(type, at = null) {
  const center = at || canvasRef.value?.getCenter() || { x: 0, y: 0 }
  const el = createElement(type, center.x + (Math.random() - 0.5) * 60, center.y + (Math.random() - 0.5) * 60)
  if (type === 'river') { el.name = '新河流'; el.data.width = 22 }
  if (type === 'road') { el.name = '新道路'; el.data.width = 7 }
  if (type === 'character') el.name = '新 NPC'
  if (type === 'settlement') el.name = '新聚落'
  if (type === 'collectible') el.name = '新收集物'
  if (!world.value.elements) world.value.elements = []
  world.value.elements.push(el)
  selectElement(el.id, false)
  showAdd.value = false
  notify(`已添加「${el.name}」，在右侧编辑详情`, 'ok', 2200)
}

function addCustomElement(customType, at = null) {
  const center = at || canvasRef.value?.getCenter() || { x: 0, y: 0 }
  const el = createCustomElement(customType, center.x + (Math.random() - 0.5) * 60, center.y + (Math.random() - 0.5) * 60)
  world.value.elements = world.value.elements || []
  world.value.elements.push(el)
  selectElement(el.id, false)
  showAdd.value = false
  notify(`已添加「${customType.name}」，可继续改名称与备注`, 'ok', 2400)
}

function ensureCatalog() {
  if (!world.value) return
  if (!Array.isArray(world.value.categories)) world.value.categories = DEFAULT_WORLD_CATEGORIES.map((c) => ({ ...c }))
  if (!Array.isArray(world.value.customTypes)) world.value.customTypes = []
}

function createCategory({ name, emoji }) {
  ensureCatalog()
  if (categories.value.some((c) => c.name === String(name).trim())) {
    notify('已存在同名分类', 'warn')
    return
  }
  const cat = newCategory(name, emoji)
  world.value.categories.push(cat)
  notify(`已新建分类「${cat.name}」`, 'ok')
}

function deleteCategory(id) {
  ensureCatalog()
  const cat = categories.value.find((c) => c.id === id)
  if (!cat || cat.builtin) return
  const used = elements.value.some((el) => resolveCategoryId(el, categories.value, customTypes.value) === id)
  const usedByType = customTypes.value.some((t) => t.categoryId === id)
  if (used || usedByType) {
    notify('该分类下还有元素或自定义类型，不能删除', 'warn')
    return
  }
  world.value.categories = world.value.categories.filter((c) => c.id !== id)
  if (category.value === id) category.value = ''
  notify('分类已删除')
}

function createType(payload) {
  ensureCatalog()
  if (customTypes.value.some((t) => t.name === String(payload.name).trim())) {
    notify('已存在同名自定义类型', 'warn')
    return
  }
  const type = newCustomType(payload)
  world.value.customTypes.push(type)
  notify(`已创建自定义类型「${type.name}」，可从「添加元素」放置`, 'ok', 3600)
}

function updateType({ id, ...payload }) {
  ensureCatalog()
  const type = world.value.customTypes.find((t) => t.id === id)
  if (!type) return
  if (customTypes.value.some((t) => t.id !== id && t.name === String(payload.name).trim())) {
    notify('已存在同名自定义类型', 'warn')
    return
  }
  const old = { ...type }
  Object.assign(type, payload)
  for (const el of elements.value) {
    if (el.type !== 'custom' || el.customTypeId !== id) continue
    if (!el.icon || el.icon === old.icon) el.icon = type.icon
    if (el.categoryId === old.categoryId) el.categoryId = type.categoryId
    if (Number(el.radius || 0) === Number(old.radius || 0)) el.radius = type.radius || undefined
    if (el.data?.description === (old.description || '')) el.data.description = type.description || ''
  }
  notify(`已更新自定义类型「${type.name}」`, 'ok')
}

function deleteType(id) {
  ensureCatalog()
  const used = elements.value.filter((el) => el.type === 'custom' && el.customTypeId === id).length
  if (used > 0) {
    notify('该类型仍有地图实例，不能删除', 'warn')
    return
  }
  world.value.customTypes = world.value.customTypes.filter((t) => t.id !== id)
  notify('自定义类型已删除')
}

function removeElement(id) {
  world.value.elements = elements.value.filter((e) => e.id !== id)
  if (selectedId.value === id) selectedId.value = ''
  notify('元素已从地图移除')
}

function onMove({ id, x, y }) {
  const el = elements.value.find((e) => e.id === id)
  if (!el) return
  el.x = x
  el.y = y
}

function onPathComplete({ type, points }) {
  if (!points?.length) return
  const [first] = points
  const el = createElement(type, first.x, first.y)
  el.name = type === 'river' ? '新河流' : '新道路'
  el.points = points.map((pt) => ({ x: pt.x - first.x, y: pt.y - first.y }))
  el.data.width = type === 'river' ? 22 : 7
  world.value.elements.push(el)
  drawMode.value = ''
  selectElement(el.id, false)
  notify(`已绘制「${el.name}」（${points.length} 个控制点）`, 'ok', 2400)
}

function toggleDraw(type) {
  drawMode.value = drawMode.value === type ? '' : type
}

function onNarrative(nodeId) {
  store.selectedNodeId = nodeId
  navigate('narrative')
}

async function analyze() {
  analyzing.value = true
  try {
    await ensureSaved()
    analysis.value = await api.world(store.activeId)
  } catch (e) {
    notify(`世界体检失败：${e.message}`, 'error')
  } finally {
    analyzing.value = false
  }
}

function categoryLabel(cat) {
  if (!cat) return '全部'
  return categories.value.find((c) => c.id === cat)?.name || cat
}

function categoryEmoji(cat) {
  return categories.value.find((c) => c.id === cat)?.emoji || '•'
}

function elementIcon(el) {
  return iconOfElement(el, customTypes.value)
}

function elementTypeLabel(el) {
  return labelOfElement(el, customTypes.value)
}

function elementSubtitle(el) {
  const cat = categoryLabel(resolveCategoryId(el, categories.value, customTypes.value))
  if (el.type === 'custom') {
    return `${cat} · 自定义${el.data?.description ? ` · ${el.data.description}` : ''}`
  }
  if (el.type === 'settlement') {
    const d = el.data || {}
    return `${cat} · ${d.hostile ? '敌对' : d.safeZone ? '安全区' : '中立'} · ${(d.faction || '无阵营')}`
  }
  if (el.type === 'character') return `${cat} · ${el.data?.faction || '无阵营'} · ${(el.data?.dialogues || []).length} 段对话`
  if (el.type === 'region') return `${cat} · ${el.data?.regionType || '区域'} · 危险 ${el.data?.danger || 1}`
  if (el.type === 'portal') return `${cat} · ${el.data?.targetId ? '已连接' : '未设置目的地'}`
  if (isPathType(el.type)) return `${cat} · ${el.points?.length || 0} 个控制点`
  return `${cat} · ${Math.round(el.x)}, ${Math.round(el.y)}`
}

function typeLabel(t) {
  return WORLD_TYPES[t]?.label || t
}

watch(
  () => world.value?.elements,
  (v) => {
    if (v) v.forEach(ensureElement)
  },
  { deep: false }
)

watch(
  () => world.value?.elements,
  () => {
    scheduleHistory()
  },
  { deep: true }
)

watch(
  () => JSON.stringify(world.value?.elements || []),
  () => {
    clearTimeout(analysisTimer)
    analysisTimer = setTimeout(() => {
      if (store.ready) analyze()
    }, 1600)
  }
)

onMounted(async () => {
  if (!p.value.world) p.value.world = { name: '新世界', scaleLabel: '1 格 ≈ 20 米', elements: [] }
  ensureCatalog()
  elements.value.forEach(ensureElement)
  resetHistory()
  await analyze()
  addMenuHandler = (e) => {
    if (addMenuRef.value && !addMenuRef.value.contains(e.target)) showAdd.value = false
  }
  document.addEventListener('click', addMenuHandler)
  window.addEventListener('keydown', onHistoryKey)
})

onBeforeUnmount(() => {
  clearTimeout(analysisTimer)
  clearTimeout(historyTimer)
  if (addMenuHandler) document.removeEventListener('click', addMenuHandler)
  window.removeEventListener('keydown', onHistoryKey)
})
</script>

<template>
  <div class="world-page">
    <div class="world-layout">
      <aside class="card side">
        <div class="side-head">
          <div class="card-title">世界地图</div>
          <span class="badge">{{ elements.length }} 元素</span>
        </div>
        <div class="side-scroll">
          <label class="field"><span class="label">世界名</span><input v-model="world.name" class="input slim" /></label>
          <label class="field" style="margin-top: 8px"><span class="label">比例尺</span><input v-model="world.scaleLabel" class="input slim" /></label>

          <div class="side-stats">
            <div><b>{{ stats.settlements }}</b><span>聚落</span></div>
            <div><b>{{ stats.characters }}</b><span>NPC</span></div>
            <div><b>{{ stats.quests }}</b><span>任务</span></div>
            <div class="warn"><b>{{ stats.errors + stats.warns }}</b><span>待办</span></div>
          </div>

          <input v-model="search" class="input slim" placeholder="搜索元素 / NPC / 类型…" style="margin: 10px 0" />
          <div class="chips" style="margin-bottom: 8px">
            <button class="chip" :class="{ cyan: category === '' }" @click="category = ''">全部 <span class="dim">{{ categoryCounts[''] || 0 }}</span></button>
            <button v-for="cat in categories" :key="cat.id" class="chip" :class="{ cyan: category === cat.id }" @click="category = cat.id">
              {{ cat.emoji }} {{ cat.name }} <span class="dim">{{ categoryCounts[cat.id] || 0 }}</span>
            </button>
          </div>

          <div class="el-list">
            <button v-for="el in filteredList" :key="el.id" class="el-row" :class="{ active: el.id === selectedId }" :data-element-id="el.id" :data-type="el.type" @click="selectElement(el.id)">
              <span class="el-icon" :style="{ color: el.color }">{{ elementIcon(el) }}</span>
              <span class="grow">
                <span class="small">{{ el.name }}</span>
                <span class="tiny dim el-sub">{{ elementTypeLabel(el) }} · {{ elementSubtitle(el) }}</span>
              </span>
              <span v-if="el.type === 'settlement'" class="dot" :class="el.data?.hostile ? 'hostile' : el.data?.safeZone ? 'safe' : 'neutral'"></span>
            </button>
            <div v-if="!filteredList.length" class="empty" style="padding: 18px">没有匹配的元素</div>
          </div>

          <div v-if="analysis?.quests?.length" class="side-block">
            <div class="side-title">任务派发 <span class="badge">{{ analysis.quests.length }}</span></div>
            <button v-for="q in analysis.quests" :key="q.id" class="quest-row" @click="selectElement(q.elementId)">
              <div class="small">{{ q.title }}</div>
              <div class="tiny dim">{{ q.npc }} · {{ q.objectives }} 个目标 · {{ q.status }}</div>
            </button>
          </div>

          <div class="side-block">
            <div class="row">
              <span class="side-title" style="margin: 0">世界体检</span>
              <button class="btn sm ghost right" :disabled="analyzing" @click="analyze">{{ analyzing ? '…' : '刷新' }}</button>
            </div>
            <div v-if="analysis" class="tiny dim" style="margin: 5px 0 7px">
              元素 {{ analysis.summary.elements }} · 对话 {{ analysis.summary.dialogues }} · 特定对象 {{ analysis.summary.specificDialogues }} · 传送门 {{ analysis.summary.validPortals }}/{{ analysis.summary.portals }}
            </div>
            <div v-for="(w, i) in (analysis?.warnings || []).filter((x) => x.level !== 'info').slice(0, 5)" :key="i" class="warning-row" :class="w.level" @click="w.elementId && selectElement(w.elementId)">
              <span>{{ w.level === 'error' ? '✕' : '!' }}</span>
              <span class="tiny">{{ w.message }}</span>
            </div>
            <div v-if="analysis && !analysis.warnings.filter((x) => x.level !== 'info').length" class="notice ok" style="padding: 7px 9px">
              <span>✓</span><div class="tiny">世界状态健康</div>
            </div>
          </div>
        </div>
      </aside>

      <section class="card map-card">
        <div class="card-head map-head">
          <div class="map-title">
            <span class="card-title">开放世界</span>
            <span class="card-sub">{{ world.name }} · {{ world.scaleLabel }}</span>
          </div>
          <div class="map-tools right">
            <div ref="addMenuRef" class="add-wrap">
              <button class="btn sm primary" @click.stop="showAdd = !showAdd">＋ 添加元素</button>
              <div v-if="showAdd" class="add-menu" @click.stop>
                <div class="add-actions">
                  <button class="btn sm ghost" @click.stop="showCatalog = true; showAdd = false">⚙ 分类与自定义类型</button>
                  <button class="btn sm ghost" @click.stop="showCatalog = true; showAdd = false">＋ 新建自定义元素</button>
                </div>
                <div v-for="group in addGroups" :key="group.id" class="add-group">
                  <div class="add-group-title">{{ group.emoji }} {{ group.name }}</div>
                  <button v-for="meta in group.types" :key="meta.key" class="add-item" @click="addElement(meta.type)">
                    <span :style="{ color: meta.color }">{{ meta.icon }}</span>
                    <span>{{ meta.label }}</span>
                    <span class="tiny dim">{{ meta.path ? '绘制' : '' }}</span>
                  </button>
                  <button v-for="ct in group.customTypes" :key="ct.id" class="add-item" @click="addCustomElement(ct)">
                    <span class="emoji-icon">{{ ct.icon }}</span>
                    <span>{{ ct.name }}</span>
                    <span class="tiny dim">自定义</span>
                  </button>
                </div>
              </div>
            </div>
            <button class="btn sm" :class="{ primary: drawMode === 'river' }" @click="toggleDraw('river')">≈ 河流</button>
            <button class="btn sm" :class="{ primary: drawMode === 'road' }" @click="toggleDraw('road')">╌ 道路</button>
            <button class="btn sm ghost" :disabled="!canUndo" title="撤销 (Ctrl+Z)" aria-label="撤销" @click="undo">↶ 撤销</button>
            <button class="btn sm ghost" :disabled="!canRedo" title="重做 (Ctrl+Shift+Z / Ctrl+Y)" aria-label="重做" @click="redo">↷ 重做</button>
            <button class="btn sm ghost" @click="snap = !snap">{{ snap ? '网格吸附 开' : '网格吸附 关' }}</button>
            <button class="btn sm ghost" @click="canvasRef?.fit()">⤢ 适应</button>
            <button class="btn sm ghost" @click="canvasRef?.overview()">⬚ 全览</button>
          </div>
        </div>
        <div class="map-body">
          <WorldCanvas
            ref="canvasRef"
            :elements="elements"
            :selected-id="selectedId"
            :visible-element-ids="visibleElementIds"
            :snap="snap"
            :draw-mode="drawMode"
            @select="(id) => selectElement(id, false)"
            @move="onMove"
            @path-complete="onPathComplete"
            @path-cancel="drawMode = ''"
          />
        </div>
      </section>

      <WorldInspector
        :element="selected"
        :characters="p.characters"
        :nodes="p.narrative.nodes"
        :elements="elements"
        :categories="categories"
        :custom-types="customTypes"
        @delete="removeElement"
        @navigate-narrative="onNarrative"
      />
    </div>

    <WorldCatalogModal
      v-if="showCatalog"
      :categories="categories"
      :custom-types="customTypes"
      :elements="elements"
      @close="showCatalog = false"
      @create-category="createCategory"
      @delete-category="deleteCategory"
      @create-type="createType"
      @update-type="updateType"
      @delete-type="deleteType"
    />
  </div>
</template>

<style scoped>
.world-page { height: calc(100vh - 112px); min-height: 620px; }
.world-layout { display: grid; grid-template-columns: 218px minmax(0, 1fr) 352px; gap: 12px; height: 100%; min-height: 0; }
.side { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.side-head { display: flex; align-items: center; gap: 8px; padding: 13px 14px; border-bottom: 1px solid var(--line); }
.side-scroll { flex: 1; overflow: auto; padding: 12px 12px 16px; min-height: 0; }
.side-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin-top: 10px; }
.side-stats > div { background: rgba(2, 6, 23, 0.35); border: 1px solid var(--line); border-radius: 7px; padding: 6px 5px; text-align: center; }
.side-stats b { display: block; font-family: var(--mono); font-size: 14px; color: #e6fbff; font-weight: 500; }
.side-stats span { font-size: 9px; color: var(--dim); }
.side-stats .warn b { color: var(--amber); }
.el-list { display: flex; flex-direction: column; gap: 2px; max-height: 340px; overflow: auto; padding-right: 2px; }
.el-row { display: flex; align-items: center; gap: 7px; text-align: left; padding: 6px 7px; border-radius: 7px; border: 1px solid transparent; background: transparent; color: var(--text); cursor: pointer; }
.el-row:hover { background: rgba(148, 163, 184, 0.06); }
.el-row.active { border-color: rgba(103, 232, 249, 0.3); background: rgba(103, 232, 249, 0.08); }
.el-icon { width: 18px; text-align: center; font-size: 14px; flex: 0 0 18px; }
.el-sub { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 6px; }
.dot.safe { background: var(--green); box-shadow: 0 0 6px rgba(134, 239, 172, 0.7); }
.dot.hostile { background: var(--rose); box-shadow: 0 0 6px rgba(251, 113, 133, 0.7); }
.dot.neutral { background: var(--amber); }
.side-block { margin-top: 14px; padding-top: 12px; border-top: 1px solid var(--line); }
.side-title { font-size: 10.5px; letter-spacing: 0.1em; color: var(--dim); text-transform: uppercase; }
.quest-row { width: 100%; text-align: left; padding: 6px 7px; border-radius: 7px; border: 1px solid var(--line); background: rgba(2, 6, 23, 0.3); color: var(--text); cursor: pointer; margin-top: 5px; }
.quest-row:hover { border-color: rgba(251, 191, 36, 0.35); }
.warning-row { display: flex; gap: 6px; align-items: flex-start; padding: 5px 6px; border-radius: 6px; margin-top: 4px; cursor: pointer; background: rgba(2, 6, 23, 0.3); }
.warning-row.warn { color: #fde68a; border-left: 2px solid rgba(251, 191, 36, 0.6); }
.warning-row.error { color: #fecdd3; border-left: 2px solid rgba(251, 113, 133, 0.7); }
.map-card { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.map-head { flex-wrap: wrap; gap: 8px; }
.map-title { min-width: 0; }
.map-tools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.map-body { flex: 1; min-height: 0; }
.add-wrap { position: relative; }
.add-actions { display: flex; gap: 5px; padding: 2px 2px 7px; border-bottom: 1px solid var(--line); margin-bottom: 6px; }
.add-actions .btn { flex: 1; font-size: 10.5px; padding: 5px 4px; }
.emoji-icon { font-size: 15px; line-height: 1; font-family: "Segoe UI Emoji", "Apple Color Emoji", sans-serif; }
.add-menu { position: absolute; right: 0; top: calc(100% + 7px); width: 290px; max-height: 420px; overflow: auto; z-index: 20; padding: 8px; border-radius: 11px; border: 1px solid var(--line-strong); background: #0e1727; box-shadow: 0 22px 60px rgba(2, 6, 23, 0.8); }
.add-group + .add-group { margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--line); }
.add-group-title { font-size: 10px; color: var(--dim); padding: 2px 6px 5px; letter-spacing: 0.1em; }
.add-item { display: flex; align-items: center; gap: 7px; width: 100%; padding: 6px 7px; border: none; border-radius: 6px; background: transparent; color: var(--text); text-align: left; cursor: pointer; font-size: 12px; }
.add-item:hover { background: rgba(103, 232, 249, 0.08); }
@media (max-width: 1280px) {
  .world-layout { grid-template-columns: 210px minmax(0, 1fr); height: auto; }
  .world-page { height: auto; }
  .side { min-height: 520px; }
  .map-card { min-height: 620px; }
  .world-layout > .inspector { grid-column: 1 / -1; max-height: 560px; }
}
@media (max-width: 900px) {
  .world-layout { grid-template-columns: 1fr; }
  .side { min-height: 360px; }
  .map-card { min-height: 500px; }
}
</style>
