/** Game Story API 客户端（MCP 服务专用，零第三方依赖）。 */

export const API_BASE = (process.env.GAME_STORY_API || 'http://127.0.0.1:3087').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

async function parseBody(res) {
  const text = await res.text()
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

export async function call(method, path, body = undefined) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch (err) {
    throw new ApiError(
      `无法连接 Game Story API（${API_BASE}）。请先在项目目录运行 npm start 或 npm run dev，再重试。`,
      0,
      err?.message
    )
  }
  const data = await parseBody(res)
  if (!res.ok) {
    const detail = data && typeof data === 'object' ? data.error || data.message || JSON.stringify(data) : String(data || '')
    throw new ApiError(`Game Story API ${res.status}：${detail}`, res.status, data)
  }
  return data
}

export async function callText(method, path, body = undefined) {
  let res
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
  } catch (err) {
    throw new ApiError(`无法连接 Game Story API（${API_BASE}）。请先运行 npm start。`, 0, err?.message)
  }
  const text = await res.text()
  if (!res.ok) throw new ApiError(`Game Story API ${res.status}：${text.slice(0, 400)}`, res.status, text)
  return text
}

export async function listProjects() {
  const data = await call('GET', '/api/projects')
  return Array.isArray(data?.projects) ? data.projects : []
}

export async function resolveProjectId(projectId) {
  const projects = await listProjects()
  if (!projects.length) throw new ApiError('当前没有任何企划，请先在应用里新建一个。', 404)
  if (projectId) {
    const found = projects.find((p) => p.id === projectId || p.name === projectId)
    if (!found) throw new ApiError(`企划不存在：${projectId}。可用：${projects.map((p) => `${p.name}(${p.id})`).join('、')}`, 404)
    return found.id
  }
  const demo = projects.find((p) => p.id === 'proj-mist-harbor')
  return demo?.id || projects[0].id
}

export async function getProject(projectId) {
  const id = await resolveProjectId(projectId)
  const data = await call('GET', `/api/projects/${encodeURIComponent(id)}`)
  if (!data?.project) throw new ApiError(`企划数据为空：${id}`, 500)
  return { id, project: data.project, revision: data.revision }
}

async function saveProject(id, project, baseRevision) {
  const data = await call('PUT', `/api/projects/${encodeURIComponent(id)}`, { project, baseRevision })
  return { project: data?.project || project, revision: data?.revision ?? baseRevision + 1 }
}

/**
 * 读-改-写企划；遇到 revision 409 时自动重读并重试一次。
 * mutator 必须是幂等的（新增元素的 id 需在外部生成）。
 */
export async function mutateProject(projectId, mutator) {
  let lastError = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const rec = await getProject(projectId)
    const result = await mutator(rec.project)
    try {
      const saved = await saveProject(rec.id, rec.project, rec.revision)
      return { id: rec.id, project: saved.project, revision: saved.revision, result }
    } catch (err) {
      lastError = err
      if (err instanceof ApiError && err.status === 409) continue
      throw err
    }
  }
  throw new ApiError('企划已被其他客户端修改（revision 冲突），请重试本次操作。', 409, lastError?.message)
}

export async function analyzeWorld(projectId) {
  const id = await resolveProjectId(projectId)
  return call('POST', '/api/engine/world', { projectId: id })
}

export async function blueprintMarkdown(projectId) {
  const id = await resolveProjectId(projectId)
  return callText('POST', '/api/engine/blueprint', { projectId: id, format: 'md' })
}
