/** .gstory 专有压缩包：ZIP（deflate）+ manifest + project.json，导入校验与冲突检测。 */
import { createHash } from 'node:crypto'
import { deflateRawSync, inflateRawSync } from 'node:zlib'

export const GSTORY_FORMAT = 'gstory'
export const GSTORY_VERSION = 1
const APP_VERSION = '1.0.0'
const MAX_ARCHIVE = 32 * 1024 * 1024
const MAX_ENTRIES = 100

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex')
}

function safeName(name) {
  return String(name || '未命名企划')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || '未命名企划'
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function buildZip(entries) {
  const localParts = []
  const centralParts = []
  let offset = 0
  const { time, day } = dosDateTime()
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(String(entry.data), 'utf8')
    const compressed = deflateRawSync(data)
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(8, 8)
    local.writeUInt16LE(time, 10)
    local.writeUInt16LE(day, 12)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(compressed.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, compressed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(8, 10)
    central.writeUInt16LE(time, 12)
    central.writeUInt16LE(day, 14)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(compressed.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + compressed.length
  }
  const centralSize = centralParts.reduce((s, b) => s + b.length, 0)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(0, 4)
  eocd.writeUInt16LE(0, 6)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(offset, 16)
  eocd.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, ...centralParts, eocd])
}

function readZip(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 22) throw Object.assign(new Error('不是有效的 .gstory 压缩包'), { status: 400 })
  if (buf.length > MAX_ARCHIVE) throw Object.assign(new Error('压缩包超过 32MB 限制'), { status: 413 })
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i
      break
    }
  }
  if (eocd < 0) throw Object.assign(new Error('压缩包缺少 EOCD 目录（可能不是 ZIP）'), { status: 400 })
  const count = buf.readUInt16LE(eocd + 10)
  const centralOffset = buf.readUInt32LE(eocd + 16)
  if (count > MAX_ENTRIES) throw Object.assign(new Error('压缩包条目过多'), { status: 400 })
  const entries = new Map()
  let p = centralOffset
  let total = 0
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw Object.assign(new Error('ZIP 中央目录损坏'), { status: 400 })
    const flags = buf.readUInt16LE(p + 8)
    const method = buf.readUInt16LE(p + 10)
    const crc = buf.readUInt32LE(p + 16)
    const compSize = buf.readUInt32LE(p + 20)
    const size = buf.readUInt32LE(p + 24)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    p += 46 + nameLen + extraLen + commentLen
    if (flags & 0x0001) throw Object.assign(new Error('不支持加密 ZIP'), { status: 400 })
    if (flags & 0x0008) throw Object.assign(new Error('不支持 data descriptor ZIP'), { status: 400 })
    if (method !== 0 && method !== 8) throw Object.assign(new Error(`不支持压缩算法 ${method}`), { status: 400 })
    if (compSize === 0xffffffff || size === 0xffffffff) throw Object.assign(new Error('不支持 ZIP64'), { status: 400 })
    if (name.includes('..') || name.startsWith('/') || name.includes('\\')) throw Object.assign(new Error(`压缩包包含非法路径：${name}`), { status: 400 })
    if (total + size > MAX_ARCHIVE * 4) throw Object.assign(new Error('压缩包解压后过大'), { status: 413 })
    total += size
    if (localOffset + 30 > buf.length || buf.readUInt32LE(localOffset) !== 0x04034b50) throw Object.assign(new Error('ZIP 本地文件头损坏'), { status: 400 })
    const localNameLen = buf.readUInt16LE(localOffset + 26)
    const localExtraLen = buf.readUInt16LE(localOffset + 28)
    const dataStart = localOffset + 30 + localNameLen + localExtraLen
    const compressed = buf.subarray(dataStart, dataStart + compSize)
    if (compressed.length !== compSize) throw Object.assign(new Error('ZIP 数据不完整'), { status: 400 })
    const data = method === 8 ? inflateRawSync(compressed, { maxOutputLength: MAX_ARCHIVE * 4 }) : compressed
    if (data.length !== size) throw Object.assign(new Error(`ZIP 解压长度不符：${name}`), { status: 400 })
    if (crc32(data) !== crc) throw Object.assign(new Error(`ZIP CRC 校验失败：${name}`), { status: 400 })
    entries.set(name, data)
  }
  return entries
}

function basicValidation(project) {
  const errors = []
  const warnings = []
  const add = (list, text) => list.push(text)
  if (!project || typeof project !== 'object') return { errors: ['project.json 不是对象'], warnings }
  if (!/^[A-Za-z0-9_-]+$/.test(String(project.id || ''))) add(errors, '企划 id 缺失或格式非法')
  if (!String(project.name || '').trim()) add(errors, '企划名称为空')
  if (!project.meta || typeof project.meta !== 'object') add(warnings, '缺少 meta 对象')
  if (!Array.isArray(project.narrative?.nodes)) add(warnings, '缺少 narrative.nodes 数组')
  if (!Array.isArray(project.narrative?.edges)) add(warnings, '缺少 narrative.edges 数组')
  if (!Array.isArray(project.characters)) add(warnings, '缺少 characters 数组')
  if (!Array.isArray(project.world?.elements)) add(warnings, '缺少 world.elements 数组')
  if (!Array.isArray(project.cases)) add(warnings, '缺少 cases 数组')
  const nodeIds = new Set((project.narrative?.nodes || []).map((n) => n.id))
  for (const e of project.narrative?.edges || []) {
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) add(warnings, `剧情连线 ${e.id || `${e.from}->${e.to}`} 指向不存在的节点`)
  }
  const charIds = new Set((project.characters || []).map((c) => c.id))
  for (const el of project.world?.elements || []) {
    if (el.type === 'character' && el.data?.characterId && !charIds.has(el.data.characterId)) add(warnings, `地图 NPC「${el.name}」关联的角色不存在：${el.data.characterId}`)
    if ((el.type === 'building' || el.type === 'stronghold') && el.data?.narrativeNodeId && !nodeIds.has(el.data.narrativeNodeId)) add(warnings, `「${el.name}」关联的剧情节点不存在：${el.data.narrativeNodeId}`)
  }
  const elementIds = new Set((project.world?.elements || []).map((e) => e.id))
  for (const el of project.world?.elements || []) {
    if (el.type === 'portal' && el.data?.targetId && !elementIds.has(el.data.targetId)) add(warnings, `传送门「${el.name}」目的地不存在：${el.data.targetId}`)
  }
  for (const c of project.characters || []) {
    for (const rel of c.relations || []) if (!charIds.has(rel.targetId)) add(warnings, `角色「${c.name}」关系指向不存在的角色：${rel.targetId}`)
  }
  return { errors, warnings }
}

export function buildGstory(project, { revision = null, versionCount = null } = {}) {
  const projectText = JSON.stringify(project, null, 2)
  const projectHash = sha256(projectText)
  const readme =
    `Game Story Studio 存档\n\n` +
    `企划：${project.name}\n` +
    `ID：${project.id}\n` +
    `导出时间：${new Date().toISOString()}\n\n` +
    `此文件为 .gstory 专有格式（ZIP），包含 manifest.json 与 project.json。\n` +
    `请使用 Game Story Studio 的「导入」功能打开。\n`
  const manifest = {
    format: GSTORY_FORMAT,
    formatVersion: GSTORY_VERSION,
    app: 'Game Story Studio',
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    projectId: project.id,
    projectName: project.name,
    revision: revision ?? project.revision ?? null,
    modules: { ...(project.meta?.modules || {}) },
    summary: {
      nodes: project.narrative?.nodes?.length || 0,
      edges: project.narrative?.edges?.length || 0,
      characters: project.characters?.length || 0,
      worldElements: project.world?.elements?.length || 0,
      cases: project.cases?.length || 0,
      versionCount
    },
    projectHash,
    files: [
      { name: 'project.json', sha256: projectHash, size: Buffer.byteLength(projectText, 'utf8') },
      { name: 'README.txt', sha256: sha256(readme), size: Buffer.byteLength(readme, 'utf8') }
    ]
  }
  const manifestText = JSON.stringify(manifest, null, 2)
  const buffer = buildZip([
    { name: 'manifest.json', data: manifestText },
    { name: 'project.json', data: projectText },
    { name: 'README.txt', data: readme }
  ])
  return { buffer, manifest, filename: `${safeName(project.name)}-r${revision ?? project.revision ?? 0}.gstory` }
}

export function parseGstory(buffer) {
  const entries = readZip(buffer)
  const manifestBuf = entries.get('manifest.json')
  const projectBuf = entries.get('project.json')
  if (!manifestBuf || !projectBuf) throw Object.assign(new Error('不是 Game Story 存档：缺少 manifest.json 或 project.json'), { status: 400 })
  let manifest
  let project
  try {
    manifest = JSON.parse(manifestBuf.toString('utf8'))
    project = JSON.parse(projectBuf.toString('utf8'))
  } catch (e) {
    throw Object.assign(new Error(`存档 JSON 解析失败：${e.message}`), { status: 400 })
  }
  if (manifest.format !== GSTORY_FORMAT) throw Object.assign(new Error('不是 .gstory 专有格式'), { status: 400 })
  if (Number(manifest.formatVersion) > GSTORY_VERSION) throw Object.assign(new Error(`存档格式版本过新：${manifest.formatVersion}`), { status: 400 })
  const projectText = projectBuf.toString('utf8')
  const actualHash = sha256(projectText)
  if (manifest.projectHash && manifest.projectHash !== actualHash) throw Object.assign(new Error('存档校验失败：project.json 哈希不匹配'), { status: 400 })
  for (const file of Array.isArray(manifest.files) ? manifest.files : []) {
    const data = entries.get(file.name)
    if (!data) throw Object.assign(new Error(`存档缺少文件：${file.name}`), { status: 400 })
    if (file.size != null && data.length !== Number(file.size)) throw Object.assign(new Error(`存档文件大小不符：${file.name}`), { status: 400 })
    if (file.sha256 && sha256(data.toString('utf8')) !== file.sha256) throw Object.assign(new Error(`存档文件校验失败：${file.name}`), { status: 400 })
  }
  const validation = basicValidation(project)
  return { manifest, project, validation, entries: [...entries.keys()] }
}

export function planImport(archive, existingProjects, { name = null } = {}) {
  const project = archive.project
  const conflicts = []
  const archiveRevision = Number(archive.manifest?.revision ?? project.revision ?? 0)
  const existingById = existingProjects.find((p) => p.id === project.id)
  const existingByName = existingProjects.find((p) => p.name === project.name && p.id !== project.id)
  if (existingById) {
    conflicts.push({
      code: 'PROJECT_ID_EXISTS',
      level: 'warn',
      message: `企划 ID 已存在：${project.id}（现有 revision ${existingById.revision}）`,
      existingId: existingById.id,
      existingRevision: existingById.revision
    })
    if (Number(existingById.revision) >= archiveRevision) {
      conflicts.push({ code: 'ARCHIVE_STALE', level: 'info', message: '存档 revision 不高于现有版本，覆盖会回退到旧数据。' })
    }
  }
  if (existingByName) {
    conflicts.push({ code: 'PROJECT_NAME_EXISTS', level: 'info', message: `已存在同名企划「${project.name}」（${existingByName.id}）。`, existingId: existingByName.id })
  }
  for (const e of archive.validation?.errors || []) conflicts.push({ code: 'INVALID_PROJECT', level: 'error', message: e })
  for (const w of archive.validation?.warnings || []) conflicts.push({ code: 'PROJECT_REFERENCE', level: 'warn', message: w })

  let suggestedName = name || project.name
  const usedNames = new Set(existingProjects.map((p) => p.name))
  if (usedNames.has(suggestedName)) {
    let i = 2
    let candidate = `${suggestedName}（导入）`
    while (usedNames.has(candidate)) candidate = `${suggestedName}（导入 ${i++}）`
    suggestedName = candidate
  }
  return {
    conflicts,
    suggestedName,
    defaultMode: existingById ? 'copy' : 'copy',
    canOverwrite: !!existingById,
    existing: existingById ? { id: existingById.id, revision: existingById.revision, name: existingById.name } : null,
    summary: {
      name: project.name,
      id: project.id,
      nodes: project.narrative?.nodes?.length || 0,
      characters: project.characters?.length || 0,
      worldElements: project.world?.elements?.length || 0,
      modules: project.meta?.modules || {}
    }
  }
}
