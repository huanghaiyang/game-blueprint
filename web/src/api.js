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
  infer: (projectId, caseId, clueOverrides = null) =>
    req('/engine/infer', { method: 'POST', body: { projectId, caseId, clueOverrides } }),
  blueprint: (projectId) => req('/engine/blueprint', { method: 'POST', body: { projectId } })
}
