<script setup>
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { store, boot, flush, queueSave, resetProject, notify, createProject, switchProject, deleteProject } from './store'
import Dashboard from './views/Dashboard.vue'
import Narrative from './views/Narrative.vue'
import Characters from './views/Characters.vue'
import Stats from './views/Stats.vue'
import Combat from './views/Combat.vue'
import Branches from './views/Branches.vue'
import Inference from './views/Inference.vue'
import Blueprint from './views/Blueprint.vue'
import World from './views/World.vue'
import History from './views/History.vue'
import Transfer from './views/Transfer.vue'

const views = { dashboard: Dashboard, narrative: Narrative, characters: Characters, stats: Stats, combat: Combat, branches: Branches, inference: Inference, blueprint: Blueprint, world: World, history: History, transfer: Transfer }
const routes = Object.keys(views)

const nav = [
  { id: 'dashboard', label: '总览', icon: '◈', hint: '企划概况与入口' },
  { id: 'narrative', label: '叙事图谱', icon: '⌗', hint: '3D 剧情节点网络' },
  { id: 'characters', label: '角色设计', icon: '◉', hint: '人物、动机与关系' },
  { id: 'stats', label: '数值管理', icon: '▤', hint: '属性、公式与成长' },
  { id: 'combat', label: '数值对抗', icon: '⚔', hint: '蒙特卡洛战斗演算' },
  { id: 'branches', label: '分支演算', icon: '⑂', hint: '路径、旗标与结局' },
  { id: 'world', label: '开放世界', icon: '◍', hint: '无限画布大地图、聚落与 NPC 任务' },
  { id: 'inference', label: '推理', icon: '⌕', hint: '线索与可信度推理（可选）' },
  { id: 'blueprint', label: '走向蓝图', icon: '▦', hint: '结构总览与导出' },
  { id: 'history', label: '历史版本', icon: '↺', hint: '版本对比、影响范围与回退' },
  { id: 'transfer', label: '导入导出', icon: '⇅', hint: '.gstory 存档与冲突预检' }
]

const titles = {
  dashboard: ['总览', '企划概况、模块入口与快速体检'],
  narrative: ['叙事图谱', '剧情节点、分支连线与 3D 结构视图'],
  characters: ['角色设计', '人物卡、动机、弧光与关系网'],
  stats: ['数值管理', '属性体系、公式实验室与成长曲线'],
  combat: ['数值对抗', '回合制伤害模型与蒙特卡洛胜率'],
  branches: ['分支演算', '路径枚举、旗标依赖与结局覆盖'],
  world: ['开放世界', '无限画布大地图、聚落状态、NPC 对话与任务派发'],
  inference: ['推理', '线索前向链、可信度与嫌疑排序'],
  blueprint: ['走向蓝图', '分幕结构、节奏曲线与可交付文档'],
  history: ['历史版本', '自动保存、手动检查点、跨版本模块对比与回退'],
  transfer: ['导入 / 导出', '专有 .gstory 压缩包、冲突预检与迁移']
}

const current = computed(() => views[store.route] || Dashboard)
const meta = computed(() => titles[store.route] || titles.dashboard)
const statusText = computed(() => (store.saving ? '保存中…' : store.dirty ? '有未保存修改' : store.savedAt ? '已自动保存' : '已同步'))
const statusClass = computed(() => (store.saving ? 'saving' : store.dirty ? 'dirty' : ''))
const modules = computed(() => store.project?.meta?.modules || {})
const ALWAYS_VISIBLE = new Set(['dashboard', 'history', 'transfer'])
const visibleNav = computed(() => nav.filter((n) => ALWAYS_VISIBLE.has(n.id) || modules.value[n.id] !== false))
const moduleOptions = computed(() => nav.filter((n) => !ALWAYS_VISIBLE.has(n.id)))

const showProjectMenu = ref(false)
const projectSwitchRef = ref(null)
const showNew = ref(false)
const creating = ref(false)
const newProject = reactive({
  name: '',
  genre: '',
  tone: '',
  logline: '',
  template: 'blank',
  modules: { narrative: true, characters: true, stats: true, combat: true, branches: true, blueprint: true, world: true, inference: false }
})

function syncRoute() {
  const r = (location.hash || '').replace(/^#\/?/, '').split('?')[0]
  store.route = routes.includes(r) ? r : 'dashboard'
}

function go(id) {
  location.hash = `#/${id}`
  syncRoute()
}

async function doReset() {
  if (!confirm('恢复演示企划会覆盖该企划当前的所有编辑，确定继续？')) return
  try {
    await resetProject()
  } catch (e) {
    notify(e.message, 'error')
  }
}

async function saveNow() {
  await flush()
  notify('已保存', 'ok', 1600)
}

function onKey(e) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault()
    saveNow()
  }
  if (e.key === 'Escape') {
    showProjectMenu.value = false
    showNew.value = false
  }
}

function onDocClick(e) {
  if (projectSwitchRef.value && !projectSwitchRef.value.contains(e.target)) showProjectMenu.value = false
}

async function pickProject(id) {
  showProjectMenu.value = false
  try {
    await switchProject(id)
  } catch (e) {
    notify(e.message, 'error')
  }
}

function openNewProject() {
  showProjectMenu.value = false
  newProject.name = ''
  newProject.genre = ''
  newProject.tone = ''
  newProject.logline = ''
  newProject.template = 'blank'
  newProject.modules = { narrative: true, characters: true, stats: true, combat: true, branches: true, blueprint: true, world: true, inference: false }
  showNew.value = true
}

async function submitNewProject() {
  if (!newProject.name.trim() || creating.value) return
  creating.value = true
  try {
    await createProject({
      name: newProject.name.trim(),
      meta: { genre: newProject.genre, tone: newProject.tone, logline: newProject.logline },
      modules: { ...newProject.modules },
      template: newProject.template,
      cloneFrom: newProject.template === 'clone' ? store.activeId : null
    })
    showNew.value = false
    go('dashboard')
  } catch (e) {
    notify(`创建失败：${e.message}`, 'error', 5000)
  } finally {
    creating.value = false
  }
}

async function removeCurrent() {
  showProjectMenu.value = false
  try {
    await deleteProject(store.activeId)
  } catch (e) {
    notify(e.message, 'error')
  }
}

watch(
  () => store.project,
  () => {
    if (store.ready) queueSave()
  },
  { deep: true }
)

watch(
  () => [store.route, JSON.stringify(modules.value || {}), store.ready],
  () => {
    if (!store.ready) return
    if (store.route !== 'dashboard' && modules.value[store.route] === false) {
      notify(`「${titles[store.route]?.[0] || store.route}」未在本企划启用，已返回总览`, 'warn', 2600)
      go('dashboard')
    }
  }
)

onMounted(() => {
  syncRoute()
  window.addEventListener('hashchange', syncRoute)
  window.addEventListener('keydown', onKey)
  document.addEventListener('click', onDocClick)
  boot()
})
onUnmounted(() => {
  window.removeEventListener('hashchange', syncRoute)
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('click', onDocClick)
})
</script>

<template>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">魂</div>
        <div>
          <div class="brand-name">Game Story Studio</div>
          <div class="brand-sub">Narrative Workbench</div>
        </div>
      </div>
      <div class="nav">
        <div class="nav-label">工作台</div>
        <button v-for="n in visibleNav" :key="n.id" class="nav-item" :class="{ active: store.route === n.id }" :title="n.hint" @click="go(n.id)">
          <span class="nav-icon">{{ n.icon }}</span>
          <span>{{ n.label }}</span>
          <span v-if="n.id === 'narrative' && store.project" class="nav-badge">{{ store.project.narrative.nodes.length }}</span>
          <span v-else-if="n.id === 'characters' && store.project" class="nav-badge">{{ store.project.characters.length }}</span>
          <span v-else-if="n.id === 'inference' && store.project" class="nav-badge">{{ store.project.cases.length }}</span>
          <span v-else-if="n.id === 'world' && store.project" class="nav-badge">{{ store.project.world?.elements?.length || 0 }}</span>
        </button>
      </div>
      <div class="sidebar-foot">
        <div>企划 · <b>{{ store.project?.name || '加载中' }}</b></div>
        <div>共 <b>{{ store.projects.length }}</b> 个企划 · rev {{ store.revision }}</div>
        <div class="tiny">Ctrl / ⌘ + S 立即保存</div>
      </div>
    </aside>

    <div class="main">
      <header class="topbar">
        <div class="topbar-heading">
          <div class="topbar-title">
            {{ meta[0] }}<span class="topbar-crumb">/ {{ meta[1] }}</span>
          </div>
        </div>
        <div class="topbar-spacer"></div>

        <div ref="projectSwitchRef" class="project-switch">
          <button class="project-btn" title="切换企划" @click.stop="showProjectMenu = !showProjectMenu">
            <span class="project-dot"></span>
            <span class="project-name">{{ store.project?.name || '载入中' }}</span>
            <span class="chev">▾</span>
          </button>
          <div v-if="showProjectMenu" class="project-menu" @click.stop>
            <div class="menu-label">全部企划 · {{ store.projects.length }}</div>
            <button v-for="p in store.projects" :key="p.id" class="menu-item" :class="{ active: p.id === store.activeId }" @click="pickProject(p.id)">
              <div class="menu-item-main">
                <b>{{ p.name }}</b>
                <span class="tiny dim">{{ p.genre || '未标注题材' }} · {{ p.nodeCount }} 节点 · {{ p.characterCount }} 角色</span>
              </div>
              <span v-if="p.id === store.activeId" class="chip tiny cyan">当前</span>
            </button>
            <div class="menu-divider"></div>
            <button class="menu-item action" @click="openNewProject">＋ 新建企划</button>
            <button class="menu-item action danger" :disabled="store.projects.length <= 1" @click="removeCurrent">删除当前企划</button>
          </div>
        </div>

        <button class="btn sm primary" title="新建企划" @click="openNewProject">＋ 新建企划</button>
        <div class="status-pill"><span class="status-dot" :class="statusClass"></span>{{ statusText }}</div>
        <button class="btn sm ghost" title="立即保存" @click="saveNow">保存</button>
        <button v-if="store.project?.id === 'proj-mist-harbor'" class="btn sm ghost danger" title="恢复演示企划" @click="doReset">恢复演示</button>
      </header>

      <div class="content">
        <div v-if="!store.ready && !store.error" class="empty"><span class="spinner"></span> 正在载入企划…</div>
        <div v-else-if="store.error" class="page">
          <div class="notice error">
            <div>
              <b>无法载入企划</b>
              <div class="small" style="margin-top: 4px">{{ store.error }}</div>
              <div class="small" style="margin-top: 6px">请确认 API 已启动：<code>npm run dev</code> 或 <code>npm start</code>（端口 3087）。</div>
            </div>
          </div>
        </div>
        <component :is="current" v-else :key="store.activeId" />
      </div>
    </div>

    <div v-if="showNew" class="modal-backdrop" @click.self="showNew = false">
      <div class="modal">
        <div class="modal-head">
          <div>
            <div class="modal-title">新建企划</div>
            <div class="tiny dim">企划彼此独立；模块可随时在总览里调整</div>
          </div>
          <button class="btn sm ghost" @click="showNew = false">✕</button>
        </div>
        <div class="modal-body">
          <label class="field">
            <span class="label">企划名 *</span>
            <input v-model="newProject.name" class="input" placeholder="例如：雾港回声 · 第二章" @keyup.enter="submitNewProject" />
          </label>
          <div class="grid grid-2">
            <label class="field"><span class="label">题材</span><input v-model="newProject.genre" class="input" placeholder="悬疑 · 都市奇幻" /></label>
            <label class="field"><span class="label">基调</span><input v-model="newProject.tone" class="input" placeholder="潮湿、冷冽" /></label>
          </div>
          <label class="field">
            <span class="label">一句话梗概</span>
            <input v-model="newProject.logline" class="input" placeholder="一句话讲清这个故事" />
          </label>
          <div class="field">
            <span class="label">起点</span>
            <div class="row" style="gap: 8px">
              <label class="check"><input v-model="newProject.template" type="radio" value="blank" /> 空白企划</label>
              <label class="check"><input v-model="newProject.template" type="radio" value="clone" /> 复制当前企划</label>
            </div>
          </div>
          <div>
            <div class="divider-title" style="margin-bottom: 8px">启用模块</div>
            <div class="module-checks">
              <label v-for="m in moduleOptions" :key="m.id" class="module-check">
                <input v-model="newProject.modules[m.id]" type="checkbox" />
                <span class="module-check-body">
                  <span class="small">{{ m.label }}</span>
                  <span class="tiny dim">{{ m.hint }}</span>
                </span>
                <span v-if="m.id === 'inference'" class="chip tiny amber">可选</span>
              </label>
            </div>
          </div>
          <div class="notice info">
            <span>i</span>
            <div>推理模块并非所有企划都需要，默认关闭。开启后可在推理页创建示例案件；细分功能随企划独立保存。</div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn ghost" @click="showNew = false">取消</button>
          <button class="btn primary" :disabled="!newProject.name.trim() || creating" @click="submitNewProject">{{ creating ? '创建中…' : '创建并进入' }}</button>
        </div>
      </div>
    </div>

    <Transition name="fade">
      <div v-if="store.toast" class="toast" :class="store.toast.type">
        <span>{{ store.toast.type === 'error' ? '✕' : store.toast.type === 'ok' ? '✓' : '•' }}</span>
        <span>{{ store.toast.msg }}</span>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.topbar-heading { min-width: 0; }
.project-switch { position: relative; }
.project-btn {
  display: inline-flex; align-items: center; gap: 7px; max-width: 220px;
  padding: 6px 10px; border-radius: 999px; border: 1px solid var(--line);
  background: rgba(15, 23, 42, 0.55); color: var(--text); cursor: pointer; font-size: 12px;
}
.project-btn:hover { border-color: rgba(103, 232, 249, 0.4); }
.project-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 8px var(--cyan); flex: 0 0 7px; }
.project-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { color: var(--dim); font-size: 10px; }
.project-menu {
  position: absolute; right: 0; top: calc(100% + 8px); width: 310px; z-index: 30;
  background: #0e1727; border: 1px solid var(--line-strong); border-radius: 12px;
  box-shadow: 0 24px 60px rgba(2, 6, 23, 0.75); padding: 8px; max-height: 380px; overflow: auto;
}
.menu-label { font-size: 10px; letter-spacing: 0.12em; color: var(--dim); padding: 6px 8px; text-transform: uppercase; }
.menu-item { width: 100%; display: flex; align-items: center; gap: 8px; text-align: left; padding: 8px 9px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--text); cursor: pointer; }
.menu-item:hover { background: rgba(148, 163, 184, 0.08); }
.menu-item.active { background: rgba(103, 232, 249, 0.09); border-color: rgba(103, 232, 249, 0.25); }
.menu-item-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.menu-item-main b { font-size: 12.5px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.menu-item.action { color: var(--cyan); font-size: 12px; }
.menu-item.action.danger { color: #fda4af; }
.menu-item.action:disabled { opacity: 0.4; cursor: not-allowed; }
.menu-divider { height: 1px; background: var(--line); margin: 6px 4px; }

.modal-backdrop { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.72); backdrop-filter: blur(6px); z-index: 60; display: grid; place-items: center; padding: 20px; }
.modal { width: min(600px, 100%); max-height: 90vh; overflow: auto; background: #0d1626; border: 1px solid var(--line-strong); border-radius: 16px; box-shadow: 0 30px 90px rgba(2, 6, 23, 0.8); }
.modal-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 18px 20px 10px; }
.modal-title { font-size: 17px; font-weight: 600; margin-bottom: 4px; }
.modal-body { padding: 8px 20px 16px; display: flex; flex-direction: column; gap: 12px; }
.modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 14px 20px 18px; border-top: 1px solid var(--line); }
.module-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.module-check { display: flex; align-items: flex-start; gap: 8px; padding: 8px 9px; border: 1px solid var(--line); border-radius: 9px; background: rgba(2, 6, 23, 0.35); cursor: pointer; }
.module-check:hover { border-color: rgba(103, 232, 249, 0.3); }
.module-check input { margin-top: 2px; }
.module-check-body { display: flex; flex-direction: column; gap: 2px; min-width: 0; flex: 1; }
.fade-enter-active, .fade-leave-active { transition: opacity 0.18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
@media (max-width: 980px) {
  .project-name { max-width: 90px; }
  .topbar-crumb { display: none; }
  .status-pill { display: none; }
}
@media (max-width: 700px) {
  .topbar { flex-wrap: wrap; }
  .module-checks { grid-template-columns: 1fr; }
  .project-switch { order: 3; }
}
</style>
