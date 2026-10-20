/** Game Story Studio · Node HTTP 服务：多企划 REST API + 静态站点。 */
import http from 'node:http'
import path from 'node:path'
import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { init, list, create, get, save, remove, resetDemo, defaultProjectId } from './store.js'
import { deriveAll, curve, validateAttribute, attrsOf } from './engines/stats.js'
import { simulate, matrix, resolveBattle, levelSweep, DEFAULT_CONFIG } from './engines/combat.js'
import { analyze, simulateRoute } from './engines/branch.js'
import { runInference } from './engines/infer.js'
import { buildBlueprint } from './engines/blueprint.js'
import { check as checkExpr, variablesOf, BUILTIN_FUNCTIONS } from './engines/expr.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT || 3087)
const HOST = process.env.HOST || '127.0.0.1'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8'
}

/* ---------------- 工具 ---------------- */

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  })
  res.end(data)
}

function fail(res, err) {
  const status = err.status || 400
  send(res, status, { error: err.message || String(err), ...(err.current ? { current: err.current } : {}) })
}

async function readBody(req, limit = 8 * 1024 * 1024) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > limit) throw Object.assign(new Error('请求体过大'), { status: 413 })
    chunks.push(chunk)
  }
  if (!chunks.length) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    return JSON.parse(text)
  } catch {
    throw Object.assign(new Error('请求体不是合法 JSON'), { status: 400 })
  }
}

function projectOf(body = {}, req) {
  const qs = new URL(req.url, 'http://localhost').searchParams
  const id = body.projectId || qs.get('projectId') || defaultProjectId()
  return get(id)
}

function presetConfig(project, body) {
  const presets = project.combat?.presets || []
  const preset = presets.find((p) => p.id === body.presetId) || presets.find((p) => p.id === project.combat?.defaultPreset) || null
  const cfg = { ...DEFAULT_CONFIG, ...(preset || {}) }
  delete cfg.id
  delete cfg.name
  return { ...cfg, ...(body.config || {}) }
}

function buildCombatant(project, id, level = 1) {
  if (!id) throw Object.assign(new Error('缺少 combatant id'), { status: 400 })
  if (id === 'dummy') {
    const dummy = project.combat?.dummy || {}
    const values = {}
    for (const [k, v] of Object.entries(dummy.base || {})) {
      const growth = Number(dummy.growth?.[k] || 0)
      values[k] = Number(v || 0) + growth * (level - 1)
    }
    return { id: 'dummy', name: dummy.name || '训练假人', stats: values, skills: [] }
  }
  const character = (project.characters || []).find((c) => c.id === id)
  if (!character) throw Object.assign(new Error(`角色不存在：${id}`), { status: 404 })
  const derived = deriveAll(project, character, level)
  const skills = (character.skillIds || [])
    .map((sid) => (project.skills || []).find((s) => s.id === sid))
    .filter(Boolean)
  return { id: character.id, name: character.name, stats: derived.values, skills, derived, level }
}

/* ---------------- 路由 ---------------- */

const routes = []
const route = (method, pattern, handler) => routes.push({ method, pattern, handler })

route('GET', /^\/api\/health$/, async (req, res) => {
  send(res, 200, { ok: true, name: 'game-story-studio', projects: list().length, defaultProjectId: defaultProjectId(), time: new Date().toISOString(), port: PORT })
})

/* ---- 企划管理 ---- */

route('GET', /^\/api\/projects$/, async (req, res) => {
  send(res, 200, { projects: list(), defaultProjectId: defaultProjectId() })
})

route('POST', /^\/api\/projects$/, async (req, res) => {
  const body = await readBody(req)
  const name = String(body.name || '').trim()
  if (!name) throw Object.assign(new Error('企划名不能为空'), { status: 400 })
  const record = await create({
    name,
    meta: body.meta || {},
    modules: body.modules || {},
    template: body.template || 'blank',
    cloneFrom: body.cloneFrom || null
  })
  send(res, 201, { project: record.project, revision: record.revision, updatedAt: record.updatedAt, projects: list() })
})

route('POST', /^\/api\/demo\/reset$/, async (req, res) => {
  const record = await resetDemo()
  send(res, 200, { project: record.project, revision: record.revision, updatedAt: record.updatedAt, projects: list() })
})

route('GET', /^\/api\/projects\/([A-Za-z0-9_-]+)$/, async (req, res) => {
  const record = get(req.params[0])
  send(res, 200, { project: record.project, revision: record.revision, updatedAt: record.updatedAt })
})

route('PUT', /^\/api\/projects\/([A-Za-z0-9_-]+)$/, async (req, res) => {
  const body = await readBody(req)
  const project = body.project || body
  const record = await save(req.params[0], project, body.baseRevision)
  send(res, 200, { ok: true, revision: record.revision, updatedAt: record.updatedAt, projects: list() })
})

route('DELETE', /^\/api\/projects\/([A-Za-z0-9_-]+)$/, async (req, res) => {
  const projects = await remove(req.params[0])
  send(res, 200, { ok: true, projects, defaultProjectId: defaultProjectId() })
})

/* ---- 元信息 ---- */

route('GET', /^\/api\/meta\/engine$/, async (req, res) => {
  const project = projectOf({}, req).project
  send(res, 200, {
    functions: BUILTIN_FUNCTIONS,
    attributes: attrsOf(project).map((a) => ({ key: a.key, label: a.label, kind: a.kind, formula: a.formula || null })),
    presets: project.combat?.presets || [],
    defaults: DEFAULT_CONFIG
  })
})

/* ---- 引擎 ---- */

route('POST', /^\/api\/engine\/formula$/, async (req, res) => {
  const body = await readBody(req)
  if (!body.expr) throw Object.assign(new Error('缺少 expr'), { status: 400 })
  const project = projectOf(body, req).project
  const character = (project.characters || []).find((c) => c.id === body.characterId)
  const level = Number(body.level || 1)
  let vars = { ...(body.vars || {}) }
  if (character) vars = { ...deriveAll(project, character, level).values, ...vars }
  const result = checkExpr(body.expr, vars)
  send(res, 200, { ...result, vars: Object.keys(vars), variables: variablesOf(body.expr) })
})

route('POST', /^\/api\/engine\/stats$/, async (req, res) => {
  const body = await readBody(req)
  const project = projectOf(body, req).project
  const character = (project.characters || []).find((c) => c.id === body.characterId)
  if (!character) throw Object.assign(new Error(`角色不存在：${body.characterId}`), { status: 404 })
  const level = Number(body.level || 1)
  const derived = deriveAll(project, character, level)
  const curveData = body.curve === false ? null : curve(project, character, Number(body.maxLevel || 10))
  const attrs = attrsOf(project)
  const validation = attrs.map((a) => ({ key: a.key, errors: validateAttribute(a, project) })).filter((v) => v.errors.length)
  send(res, 200, { characterId: character.id, ...derived, curve: curveData, attributeErrors: validation })
})

route('POST', /^\/api\/engine\/combat\/simulate$/, async (req, res) => {
  const body = await readBody(req)
  const project = projectOf(body, req).project
  const cfg = presetConfig(project, body)
  const a = buildCombatant(project, body.aId, Number(body.levelA || 1))
  const b = buildCombatant(project, body.bId || 'dummy', Number(body.levelB || 1))
  if (body.oneShot) {
    const result = resolveBattle(a, b, cfg, body.seed)
    return send(res, 200, { ...result, a, b, config: cfg })
  }
  const result = simulate(a, b, cfg)
  send(res, 200, {
    ...result,
    a: { id: a.id, name: a.name, level: a.level || 1, stats: a.stats },
    b: { id: b.id, name: b.name, level: b.level || 1, stats: b.stats }
  })
})

route('POST', /^\/api\/engine\/combat\/matrix$/, async (req, res) => {
  const body = await readBody(req)
  const project = projectOf(body, req).project
  const ids = Array.isArray(body.ids) && body.ids.length ? body.ids : (project.characters || []).map((c) => c.id)
  const level = Number(body.level || 1)
  const units = ids.map((id) => buildCombatant(project, id, level))
  const cfg = presetConfig(project, body)
  const result = matrix(units, { ...cfg, runs: Number(body.runs || 600) })
  send(res, 200, { level, ...result })
})

route('POST', /^\/api\/engine\/combat\/level$/, async (req, res) => {
  const body = await readBody(req)
  const project = projectOf(body, req).project
  const cfg = presetConfig(project, body)
  const levels = Array.isArray(body.levels) && body.levels.length ? body.levels : [1, 3, 5, 8, 10]
  const dummy = body.bId ? buildCombatant(project, body.bId, 1) : buildCombatant(project, 'dummy', 1)
  const result = levelSweep((level) => buildCombatant(project, body.aId, level), dummy, levels, cfg)
  send(res, 200, { aId: body.aId, bId: body.bId || 'dummy', levels: result })
})

route('POST', /^\/api\/engine\/branch$/, async (req, res) => {
  const body = await readBody(req)
  const project = projectOf(body, req).project
  const narrative = body.narrative || project.narrative
  const result = analyze(narrative, body.options || {})
  send(res, 200, result)
})

route('POST', /^\/api\/engine\/branch\/route$/, async (req, res) => {
  const body = await readBody(req)
  const project = projectOf(body, req).project
  const narrative = body.narrative || project.narrative
  send(res, 200, simulateRoute(narrative, body.edgeIds || []))
})

route('POST', /^\/api\/engine\/infer$/, async (req, res) => {
  const body = await readBody(req)
  const project = projectOf(body, req).project
  const caseData = (project.cases || []).find((c) => c.id === body.caseId)
  if (!caseData) throw Object.assign(new Error(`案件不存在：${body.caseId}`), { status: 404 })
  let effective = caseData
  if (Array.isArray(body.clueOverrides)) {
    const map = new Map(body.clueOverrides.map((o) => [o.id, !!o.found]))
    effective = { ...caseData, clues: (caseData.clues || []).map((c) => (map.has(c.id) ? { ...c, found: map.get(c.id) } : c)) }
  }
  send(res, 200, runInference(effective, body.options || {}))
})

route('POST', /^\/api\/engine\/blueprint$/, async (req, res) => {
  const body = await readBody(req)
  const project = projectOf(body, req).project
  const narrative = body.narrative || project.narrative
  const branch = analyze(narrative, body.options || {})
  const blueprint = buildBlueprint({ ...project, narrative }, branch)
  if (body.format === 'md') {
    return send(res, 200, blueprint.markdown, { 'Content-Type': 'text/markdown; charset=utf-8' })
  }
  send(res, 200, blueprint)
})

/* ---------------- 静态资源 ---------------- */

async function serveStatic(req, res, pathname) {
  let file = path.join(DIST, decodeURIComponent(pathname === '/' ? '/index.html' : pathname))
  if (!file.startsWith(DIST)) return fail(res, Object.assign(new Error('非法路径'), { status: 403 }))
  try {
    const info = await stat(file)
    if (info.isDirectory()) file = path.join(file, 'index.html')
  } catch {
    file = path.join(DIST, 'index.html')
  }
  try {
    const data = await readFile(file)
    const ext = path.extname(file).toLowerCase()
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
    })
    res.end(data)
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(
      '<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0b0f16;color:#cbd5e1;padding:48px">' +
        '<h2>前端尚未构建</h2><p>开发模式请运行 <code>npm run dev</code>（Vite 5173 + API 3087）。</p>' +
        '<p>单进程模式请先 <code>npm run build</code>，再 <code>npm start</code>。</p></body>'
    )
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = url.pathname
  if (pathname.startsWith('/api/')) {
    for (const r of routes) {
      if (r.method !== req.method) continue
      const m = r.pattern.exec(pathname)
      if (!m) continue
      try {
        req.params = m.slice(1)
        await r.handler(req, res)
      } catch (err) {
        if (!res.headersSent) fail(res, err)
        else console.error(err)
      }
      return
    }
    return fail(res, Object.assign(new Error('接口不存在'), { status: 404 }))
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, Object.assign(new Error('方法不允许'), { status: 405 }))
  await serveStatic(req, res, pathname)
})

const projects = await init()
server.listen(PORT, HOST, () => {
  console.log(`\n  ◍ Game Story Studio API  http://${HOST}:${PORT}`)
  console.log(`  ◍ 企划：${projects.length} 个（默认 ${defaultProjectId()}）`)
  console.log(`  ◍ 数据：data/projects/\n`)
})
