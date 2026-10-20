import { reactive } from 'vue'
import { api } from './api'

const STORAGE_KEY = 'gss.activeProject'

export const store = reactive({
  ready: false,
  error: null,
  project: null,
  projects: [],
  activeId: null,
  revision: 0,
  dirty: false,
  saving: false,
  savedAt: null,
  route: 'dashboard',
  selectedNodeId: null,
  toast: null,
  busy: false
})

let timer = null
let suppress = false

export function notify(msg, type = 'info', ms = 3200) {
  store.toast = { msg, type, at: Date.now() }
  setTimeout(() => {
    if (store.toast && Date.now() - store.toast.at >= ms - 50) store.toast = null
  }, ms)
}

async function loadProject(id) {
  suppress = true
  try {
    const data = await api.loadProject(id)
    store.project = data.project
    store.revision = data.revision
    store.activeId = id
    store.ready = true
    store.error = null
    store.dirty = false
    store.selectedNodeId = data.project.narrative?.startId || null
    localStorage.setItem(STORAGE_KEY, id)
  } finally {
    setTimeout(() => {
      suppress = false
    }, 0)
  }
}

export async function boot() {
  try {
    const data = await api.listProjects()
    store.projects = data.projects || []
    if (!store.projects.length) {
      store.error = '还没有任何企划，请新建一个企划。'
      return
    }
    const saved = localStorage.getItem(STORAGE_KEY)
    const target = store.projects.find((p) => p.id === saved) || store.projects[0]
    await loadProject(target.id)
  } catch (e) {
    store.error = e.message
  }
}

export function queueSave() {
  if (suppress || !store.ready || !store.activeId) return
  store.dirty = true
  clearTimeout(timer)
  timer = setTimeout(flush, 650)
}

export async function flush() {
  if (!store.ready || !store.dirty || store.saving || !store.activeId) return
  clearTimeout(timer)
  store.saving = true
  try {
    const out = await api.saveProject(store.activeId, store.project, store.revision)
    store.revision = out.revision
    store.dirty = false
    store.savedAt = new Date()
    if (out.projects) store.projects = out.projects
  } catch (e) {
    if (e.status === 409) {
      notify('检测到其他窗口的修改，正在重新加载…', 'warn', 4000)
      await loadProject(store.activeId)
    } else {
      notify(`保存失败：${e.message}`, 'error', 5000)
    }
  } finally {
    store.saving = false
  }
}

/** 引擎计算前确保服务端拿到最新快照（避免「刚改完就演算」读到旧数据）。 */
export async function ensureSaved() {
  if (store.dirty) await flush()
  return store.revision
}

export async function switchProject(id) {
  if (!id || id === store.activeId) return
  clearTimeout(timer)
  if (store.dirty) await flush()
  try {
    await loadProject(id)
    notify(`已切换到「${store.project.name}」`, 'ok', 1800)
  } catch (e) {
    notify(`切换失败：${e.message}`, 'error')
  }
}

export async function createProject(payload) {
  clearTimeout(timer)
  if (store.dirty) await flush()
  const out = await api.createProject(payload)
  store.projects = out.projects || store.projects
  await loadProject(out.project.id)
  notify(`企划「${out.project.name}」已创建`, 'ok')
  return out.project
}

export async function deleteProject(id = store.activeId) {
  if (store.projects.length <= 1) {
    notify('至少需要保留一个企划', 'warn')
    return
  }
  const target = store.projects.find((p) => p.id === id)
  if (!target) return
  if (!confirm(`删除企划「${target.name}」？该操作会删除本地数据文件，无法撤销。`)) return
  const out = await api.deleteProject(id)
  store.projects = out.projects || []
  if (id === store.activeId) {
    const next = store.projects[0]
    if (next) await loadProject(next.id)
  } else if (out.projects) {
    store.projects = out.projects
  }
  notify('企划已删除')
}

export async function resetProject() {
  const out = await api.resetDemo()
  store.projects = out.projects || store.projects
  await loadProject(out.project.id)
  notify('已恢复演示企划', 'ok')
}

export function navigate(route) {
  if (location.hash !== `#/${route}`) location.hash = `#/${route}`
  else store.route = route
}
