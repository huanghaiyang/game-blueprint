const BASE = '/api'

async function req(path, { method = 'GET', body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: body != null ? { 'Content-Type': 'application/json' } : undefined,
    body: body != null ? JSON.stringify(body) : undefined
  })
  const type = res.headers.get('content-type') || ''
  const payload = type.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    const err = new Error((payload && payload.error) || `请求失败（HTTP ${res.status}）`)
    err.status = res.status
    err.data = payload
    throw err
  }
  return payload
}

export const api = {
  listProjects: () => req('/projects'),
  createProject: (payload) => req('/projects', { method: 'POST', body: payload }),
  loadProject: (id) => req(`/projects/${encodeURIComponent(id)}`),
  saveProject: (id, project, baseRevision) => req(`/projects/${encodeURIComponent(id)}`, { method: 'PUT', body: { project, baseRevision } }),
  deleteProject: (id) => req(`/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  resetDemo: () => req('/demo/reset', { method: 'POST', body: {} }),
  meta: (projectId) => req(`/meta/engine?projectId=${encodeURIComponent(projectId)}`),
  stats: (projectId, characterId, level = 1, maxLevel = 10, curve = true) =>
    req('/engine/stats', { method: 'POST', body: { projectId, characterId, level, maxLevel, curve } }),
  formula: (projectId, expr, vars = {}, characterId = null, level = 1) =>
    req('/engine/formula', { method: 'POST', body: { projectId, expr, vars, characterId, level } }),
  simulate: (payload) => req('/engine/combat/simulate', { method: 'POST', body: payload }),
  matrix: (payload) => req('/engine/combat/matrix', { method: 'POST', body: payload }),
  levelSweep: (payload) => req('/engine/combat/level', { method: 'POST', body: payload }),
  branch: (projectId, options = {}) => req('/engine/branch', { method: 'POST', body: { projectId, options } }),
  branchRoute: (projectId, edgeIds) => req('/engine/branch/route', { method: 'POST', body: { projectId, edgeIds } }),
  world: (projectId) => req('/engine/world', { method: 'POST', body: { projectId } }),
  versions: (projectId) => req(`/projects/${encodeURIComponent(projectId)}/versions`),
  version: (projectId, versionId) => req(`/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`),
  createVersion: (projectId, label) => req(`/projects/${encodeURIComponent(projectId)}/versions`, { method: 'POST', body: { label } }),
  compareVersions: (projectId, a, b) =>
    req(`/projects/${encodeURIComponent(projectId)}/versions/compare?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`),
  restoreVersion: (projectId, versionId, baseRevision) =>
    req(`/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/restore`, { method: 'POST', body: { baseRevision } }),
  exportGstory: async (projectId) => {
    const res = await fetch(`${BASE}/projects/${encodeURIComponent(projectId)}/export`)
    if (!res.ok) {
      const type = res.headers.get('content-type') || ''
      const payload = type.includes('application/json') ? await res.json() : await res.text()
      throw new Error(payload?.error || `导出失败（HTTP ${res.status}）`)
    }
    return { blob: await res.blob(), filename: filenameFromDisposition(res.headers.get('content-disposition')) }
  },
  previewImport: async (buffer) => {
    const res = await fetch(`${BASE}/projects/import/preview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer
    })
    return parseRaw(res)
  },
  importGstory: async (buffer, { mode = 'copy', name = '', targetId = '', baseRevision = '' } = {}) => {
    const qs = new URLSearchParams({ mode, name, targetId, baseRevision })
    const res = await fetch(`${BASE}/projects/import?${qs}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: buffer
    })
    return parseRaw(res)
  },
  infer: (projectId, caseId, clueOverrides = null) =>
    req('/engine/infer', { method: 'POST', body: { projectId, caseId, clueOverrides } }),
  blueprint: (projectId) => req('/engine/blueprint', { method: 'POST', body: { projectId } }),
  runtimeStart: (projectId, startId = '', flags = {}) =>
    req('/engine/runtime', { method: 'POST', body: { projectId, action: 'start', startId, flags } }),
  runtimeView: (projectId) => req('/engine/runtime', { method: 'POST', body: { projectId, action: 'view' } }),
  runtimeStep: (projectId, state, edgeId) =>
    req('/engine/runtime', { method: 'POST', body: { projectId, action: 'step', state, edgeId } }),
  localization: (projectId) => req('/engine/localization', { method: 'POST', body: { projectId } }),
  localizationCsv: (projectId) => req('/engine/localization', { method: 'POST', body: { projectId, format: 'csv' } }),
  analytics: (projectId) => req('/engine/analytics', { method: 'POST', body: { projectId } }),
  storylets: (projectId, flags = {}, seen = []) => req('/engine/storylets', { method: 'POST', body: { projectId, flags, seen } }),
  production: (projectId) => req('/engine/production', { method: 'POST', body: { projectId } }),
  generateTasks: (projectId) => req('/engine/production', { method: 'POST', body: { projectId, action: 'generate' } })
}

async function parseRaw(res) {
  const type = res.headers.get('content-type') || ''
  const payload = type.includes('application/json') ? await res.json() : await res.text()
  if (!res.ok) {
    const err = new Error(payload?.error || `请求失败（HTTP ${res.status}）`)
    err.status = res.status
    err.data = payload
    throw err
  }
  return payload
}

function filenameFromDisposition(value) {
  if (!value) return ''
  const utf = /filename\*=UTF-8''([^;]+)/i.exec(value)
  if (utf) {
    try {
      return decodeURIComponent(utf[1])
    } catch {}
  }
  const plain = /filename="?([^";]+)"?/i.exec(value)
  return plain ? plain[1] : ''
}
