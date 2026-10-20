/** 多企划工作区：data/projects/<id>.json，原子写入、revision、旧单企划数据自动迁移。 */
import { mkdir, readdir, readFile, writeFile, rename, access, unlink } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { seedProject, blankProject, DEFAULT_MODULES } from './seed.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DATA_DIR = path.join(ROOT, 'data')
const PROJECT_DIR = path.join(DATA_DIR, 'projects')
const LEGACY_FILE = path.join(DATA_DIR, 'project.json')

const cache = new Map() // id -> { project, revision, updatedAt }
let defaultId = null

const now = () => new Date().toISOString()
const safeId = (id) => /^[A-Za-z0-9_-]+$/.test(String(id || ''))

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

export function normalizeProject(p) {
  const base = p && typeof p === 'object' ? p : {}
  const cases = Array.isArray(base.cases) ? base.cases : []
  const providedModules = base.meta?.modules || {}
  const modules = {
    ...DEFAULT_MODULES,
    ...providedModules,
    // 旧数据没有模块字段时：有案件就视为启用推理，否则尊重「推理可选」的默认
    inference: providedModules.inference ?? cases.length > 0
  }
  return {
    ...base,
    id: base.id || `proj-${Date.now().toString(36)}`,
    name: base.name || '未命名企划',
    meta: { genre: '', tone: '', logline: '', author: '', platform: '', playtime: '', version: '0.1.0', ...(base.meta || {}), modules },
    blueprint: { acts: [], themes: [], ...(base.blueprint || {}) },
    stats: {
      attributes: Array.isArray(base.stats?.attributes) ? base.stats.attributes : [],
      formulas: Array.isArray(base.stats?.formulas) ? base.stats.formulas : []
    },
    characters: Array.isArray(base.characters) ? base.characters : [],
    skills: Array.isArray(base.skills) ? base.skills : [],
    combat: {
      defaultPreset: 'duel',
      presets: [],
      dummy: { id: 'dummy', name: '训练假人', base: {}, growth: {} },
      ...(base.combat || {})
    },
    narrative: {
      startId: base.narrative?.startId || base.narrative?.nodes?.[0]?.id || null,
      nodes: Array.isArray(base.narrative?.nodes) ? base.narrative.nodes : [],
      edges: Array.isArray(base.narrative?.edges) ? base.narrative.edges : []
    },
    world: {
      name: base.world?.name || '未命名世界',
      scaleLabel: base.world?.scaleLabel || '1 格 ≈ 20 米',
      elements: Array.isArray(base.world?.elements) ? base.world.elements : []
    },
    cases
  }
}

async function writeRecord(record) {
  const id = record.project.id
  if (!safeId(id)) throw Object.assign(new Error('企划 ID 非法'), { status: 400 })
  await mkdir(PROJECT_DIR, { recursive: true })
  const file = path.join(PROJECT_DIR, `${id}.json`)
  const tmp = `${file}.tmp`
  const payload = JSON.stringify({ project: record.project, revision: record.revision, updatedAt: record.updatedAt }, null, 2)
  await writeFile(tmp, payload, 'utf8')
  await rename(tmp, file)
  cache.set(id, record)
  await sortDefault()
}

async function sortDefault() {
  const records = [...cache.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
  defaultId = records[0]?.project.id || null
}

async function loadAll() {
  const files = (await readdir(PROJECT_DIR).catch(() => [])).filter((f) => f.endsWith('.json'))
  cache.clear()
  for (const name of files) {
    try {
      const raw = await readFile(path.join(PROJECT_DIR, name), 'utf8')
      const parsed = JSON.parse(raw)
      const project = normalizeProject(parsed.project ?? parsed)
      cache.set(project.id, {
        project,
        revision: Number(parsed.revision) || 1,
        updatedAt: parsed.updatedAt || now()
      })
    } catch (e) {
      console.error(`跳过损坏的企划文件 ${name}：${e.message}`)
    }
  }
  await sortDefault()
}

export async function init() {
  await mkdir(PROJECT_DIR, { recursive: true })
  const files = (await readdir(PROJECT_DIR).catch(() => [])).filter((f) => f.endsWith('.json'))
  if (!files.length) {
    // 迁移旧的单企划文件；没有则播种演示企划
    if (await exists(LEGACY_FILE)) {
      try {
        const parsed = JSON.parse(await readFile(LEGACY_FILE, 'utf8'))
        const project = normalizeProject(parsed.project ?? parsed)
        await writeRecord({ project, revision: Number(parsed.revision) || 1, updatedAt: parsed.updatedAt || now() })
      } catch (e) {
        console.error(`旧数据迁移失败，改为播种演示企划：${e.message}`)
        const project = normalizeProject(seedProject())
        await writeRecord({ project, revision: 1, updatedAt: now() })
      }
    } else {
      const project = normalizeProject(seedProject())
      await writeRecord({ project, revision: 1, updatedAt: now() })
    }
  }
  await loadAll()
  return list()
}

export function list() {
  return [...cache.values()]
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))
    .map(({ project, revision, updatedAt }) => ({
      id: project.id,
      name: project.name,
      genre: project.meta?.genre || '',
      tone: project.meta?.tone || '',
      logline: project.meta?.logline || '',
      modules: project.meta?.modules || {},
      nodeCount: project.narrative?.nodes?.length || 0,
      characterCount: project.characters?.length || 0,
      caseCount: project.cases?.length || 0,
      revision,
      updatedAt
    }))
}

export function defaultProjectId() {
  return defaultId
}

export function get(id) {
  const key = id || defaultId
  const record = key ? cache.get(key) : null
  if (!record) {
    const err = new Error(id ? `企划不存在：${id}` : '还没有任何企划')
    err.status = 404
    throw err
  }
  return record
}

export async function create({ name, meta = {}, modules = {}, template = 'blank', cloneFrom = null } = {}) {
  let project
  if (template === 'clone' && cloneFrom && cache.has(cloneFrom)) {
    const source = structuredClone(cache.get(cloneFrom).project)
    project = normalizeProject({
      ...source,
      id: `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: name || `${source.name} 副本`,
      meta: { ...source.meta, ...meta, modules: { ...source.meta.modules, ...modules } }
    })
  } else {
    project = blankProject({ name, meta, modules })
  }
  project = normalizeProject(project)
  const record = { project, revision: 1, updatedAt: now() }
  await writeRecord(record)
  return record
}

export async function save(id, project, baseRevision) {
  const record = get(id)
  if (baseRevision != null && Number(baseRevision) !== record.revision) {
    const err = new Error('版本冲突：数据已被其他窗口修改，请刷新后重试')
    err.status = 409
    err.current = record.revision
    throw err
  }
  const next = normalizeProject(project)
  next.id = id
  record.project = next
  record.revision += 1
  record.updatedAt = now()
  await writeRecord(record)
  return record
}

export async function remove(id) {
  if (cache.size <= 1) {
    throw Object.assign(new Error('至少需要保留一个企划'), { status: 400 })
  }
  get(id)
  await unlink(path.join(PROJECT_DIR, `${id}.json`)).catch(() => {})
  cache.delete(id)
  if (defaultId === id) await sortDefault()
  return list()
}

export async function resetDemo() {
  const project = normalizeProject(seedProject())
  const existing = cache.get(project.id)
  const record = {
    project,
    revision: (existing?.revision || 0) + 1,
    updatedAt: now()
  }
  await writeRecord(record)
  return record
}

export function paths() {
  return { DATA_DIR, PROJECT_DIR, LEGACY_FILE }
}
