/** 企划版本历史：data/history/<projectId>/index.json + v-xxxxxx.json 快照。 */
import { mkdir, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { atomicWrite } from './atomic.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const HISTORY_DIR = path.join(ROOT, 'data', 'history')
const MAX_AUTO = 60
const safeId = (id) => /^[A-Za-z0-9_-]+$/.test(String(id || ''))
const now = () => new Date().toISOString()
const queues = new Map()

function projectDir(projectId) {
  if (!safeId(projectId)) throw Object.assign(new Error('企划 ID 非法'), { status: 400 })
  return path.join(HISTORY_DIR, projectId)
}

function indexFile(projectId) {
  return path.join(projectDir(projectId), 'index.json')
}

function versionFile(projectId, versionId) {
  if (!/^v-[A-Za-z0-9_-]+$/.test(String(versionId || ''))) throw Object.assign(new Error('版本 ID 非法'), { status: 400 })
  return path.join(projectDir(projectId), `${versionId}.json`)
}

function hashProject(project) {
  return createHash('sha256').update(JSON.stringify(project)).digest('hex')
}

function summaryOf(project) {
  return {
    name: project.name || '',
    revision: null,
    modules: { ...(project.meta?.modules || {}) },
    counts: {
      nodes: project.narrative?.nodes?.length || 0,
      edges: project.narrative?.edges?.length || 0,
      characters: project.characters?.length || 0,
      worldElements: project.world?.elements?.length || 0,
      cases: project.cases?.length || 0,
      skills: project.skills?.length || 0
    }
  }
}

async function readIndex(projectId) {
  try {
    const parsed = JSON.parse(await readFile(indexFile(projectId), 'utf8'))
    return {
      projectId,
      next: Number(parsed.next) || 1,
      versions: Array.isArray(parsed.versions) ? parsed.versions : []
    }
  } catch {
    return { projectId, next: 1, versions: [] }
  }
}

async function writeIndex(projectId, index) {
  await mkdir(projectDir(projectId), { recursive: true })
  await atomicWrite(indexFile(projectId), JSON.stringify(index, null, 2))
}

function enqueue(projectId, fn) {
  const prev = queues.get(projectId) || Promise.resolve()
  const next = prev.then(fn, fn)
  const guarded = next.catch(() => {})
  queues.set(projectId, guarded)
  guarded.finally(() => {
    if (queues.get(projectId) === guarded) queues.delete(projectId)
  })
  return next
}

function entryOf(snapshot, project, size, hash) {
  return {
    id: snapshot.versionId,
    revision: snapshot.revision,
    createdAt: snapshot.createdAt,
    kind: snapshot.kind,
    label: snapshot.label,
    pinned: !!snapshot.pinned,
    hash,
    size,
    summary: summaryOf(project)
  }
}

async function prune(projectId, index) {
  const auto = index.versions.filter((v) => v.kind !== 'manual' && !v.pinned)
  const protectedIds = new Set(index.versions.filter((v) => v.kind === 'manual' || v.pinned).map((v) => v.id))
  const latest = index.versions[index.versions.length - 1]?.id
  if (latest) protectedIds.add(latest)
  const remove = auto.filter((v) => v.id !== latest).slice(0, Math.max(0, auto.length - MAX_AUTO))
  if (!remove.length) return index
  const removeIds = new Set(remove.map((v) => v.id))
  index.versions = index.versions.filter((v) => !removeIds.has(v.id) || protectedIds.has(v.id))
  for (const v of remove) {
    if (!protectedIds.has(v.id)) await rm(versionFile(projectId, v.id), { force: true })
  }
  return index
}

async function append(project, revision, { kind = 'auto', label = '', pinned = false } = {}) {
  const projectId = project.id
  if (!safeId(projectId)) throw Object.assign(new Error('企划 ID 非法'), { status: 400 })
  return enqueue(projectId, async () => {
    const index = await readIndex(projectId)
    const hash = hashProject(project)
    const latest = index.versions[index.versions.length - 1]
    if (latest && latest.hash === hash && ['auto', 'initial'].includes(kind)) return latest
    const seq = String(index.next).padStart(6, '0')
    const versionId = `v-${seq}`
    const createdAt = now()
    const snapshot = {
      versionId,
      revision: Number(revision) || 1,
      createdAt,
      kind,
      label: label || (kind === 'manual' ? '手动检查点' : kind === 'initial' ? '初始版本' : kind === 'restore' ? '历史回退' : kind === 'import' ? '导入存档' : kind === 'reset' ? '恢复演示企划' : '自动保存'),
      pinned: !!pinned,
      project
    }
    const raw = JSON.stringify(snapshot, null, 2)
    await mkdir(projectDir(projectId), { recursive: true })
    const file = versionFile(projectId, versionId)
    await atomicWrite(file, raw)
    index.next += 1
    const entry = entryOf(snapshot, project, Buffer.byteLength(raw, 'utf8'), hash)
    index.versions.push(entry)
    await prune(projectId, index)
    await writeIndex(projectId, index)
    return entry
  })
}

export async function ensureHistory(project, revision) {
  const index = await readIndex(project.id)
  if (!index.versions.length) return append(project, revision, { kind: 'initial', label: '初始版本', pinned: true })
  const latest = index.versions[index.versions.length - 1]
  if (latest.hash !== hashProject(project)) return append(project, revision, { kind: 'auto', label: '启动快照' })
  return latest
}

export async function recordVersion(project, revision, options = {}) {
  return append(project, revision, options)
}

export async function checkpoint(project, revision, label) {
  return append(project, revision, { kind: 'manual', label: String(label || '手动检查点'), pinned: true })
}

export async function resetHistory(project, revision, options = {}) {
  await rm(projectDir(project.id), { recursive: true, force: true })
  return append(project, revision, { kind: options.kind || 'reset', label: options.label || '重置历史', pinned: true })
}

export async function listVersions(projectId, currentRevision = null) {
  const index = await readIndex(projectId)
  return {
    projectId,
    currentRevision,
    maxAuto: MAX_AUTO,
    versions: [...index.versions].reverse().map((v) => ({
      ...v,
      isCurrent: Number(v.revision) === Number(currentRevision)
    }))
  }
}

export async function getVersion(projectId, versionId) {
  let raw
  try {
    raw = await readFile(versionFile(projectId, versionId), 'utf8')
  } catch {
    throw Object.assign(new Error(`版本不存在：${versionId}`), { status: 404 })
  }
  const snapshot = JSON.parse(raw)
  if (!snapshot?.project) throw Object.assign(new Error(`版本快照损坏：${versionId}`), { status: 500 })
  return snapshot
}

export async function getVersionEntry(projectId, versionId) {
  const index = await readIndex(projectId)
  return index.versions.find((v) => v.id === versionId) || null
}

export async function deleteHistory(projectId) {
  await rm(projectDir(projectId), { recursive: true, force: true })
}

export async function historyInfo(projectId) {
  const index = await readIndex(projectId)
  return { count: index.versions.length, latest: index.versions[index.versions.length - 1] || null }
}

export function historyRoot() {
  return HISTORY_DIR
}
