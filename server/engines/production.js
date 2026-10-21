/** 制作就绪度：任务、资产、本地化、评审与内容覆盖的统一体检。纯函数。 */
import { localizationReport } from './localization.js'
import { analyze } from './branch.js'

const arr = (v) => (Array.isArray(v) ? v : [])
const round = (n) => Math.round(n * 10) / 10

export function productionReport(project = {}) {
  const tasks = arr(project.production?.tasks)
  const assets = arr(project.assets)
  const reviews = arr(project.reviews)
  const beats = arr(project.storyboard?.beats)
  const loc = localizationReport(project)
  const branch = analyze(project.narrative || {}, { maxPaths: 1200 })
  const byStatus = (list, key = 'status') => list.reduce((out, x) => { out[x[key] || 'todo'] = (out[x[key] || 'todo'] || 0) + 1; return out }, {})
  const taskStats = byStatus(tasks)
  const assetStats = byStatus(assets)
  const done = (taskStats.done || 0)
  const taskProgress = tasks.length ? done / tasks.length : 0
  const readyAssets = assets.length ? (assetStats.ready || 0) / assets.length : 0
  const locCoverage = loc.summary.length ? loc.summary.reduce((s, x) => s + x.coverage, 0) / loc.summary.length / 100 : 0
  const openReviews = reviews.filter((r) => r.status !== 'resolved').length
  const errors = branch.issues.filter((i) => i.level === 'error').length
  const readiness = Math.max(0, Math.min(100, round(taskProgress * 45 + readyAssets * 25 + locCoverage * 20 + (openReviews ? 0 : 5) + (errors ? 0 : 5))))
  const missing = []
  for (const c of arr(project.characters)) {
    if (!assets.some((a) => a.linkedModule === 'characters' && a.linkedId === c.id)) missing.push({ type: 'character', id: c.id, label: c.name, message: `角色「${c.name}」没有关联立绘/资产` })
  }
  for (const el of arr(project.world?.elements)) {
    for (const d of arr(el.data?.dialogues)) {
      if (!assets.some((a) => a.type === 'voice' && a.linkedId === el.id)) missing.push({ type: 'voice', id: d.id, label: d.name, message: `「${el.name}」的对话「${d.name}」没有配音资产` })
    }
  }
  for (const q of loc.summary) {
    if (q.coverage < 65) missing.push({ type: 'localization', id: q.id, label: q.name, message: `${q.name} 本地化覆盖率仅 ${q.coverage}%` })
  }
  for (const b of beats) {
    if (!b.nodeId) missing.push({ type: 'storyboard', id: b.id, label: b.title, message: `演出「${b.title}」没有关联剧情节点` })
  }
  return {
    readiness,
    tasks: { total: tasks.length, byStatus: taskStats, estimate: tasks.reduce((s, t) => s + (Number(t.estimate) || 0), 0), progress: round(taskProgress * 100) },
    assets: { total: assets.length, byStatus: assetStats, ready: round(readyAssets * 100) },
    localization: { locales: loc.summary, total: loc.total, avgCoverage: round(locCoverage * 100) },
    reviews: { total: reviews.length, open: openReviews, resolved: reviews.length - openReviews },
    content: { nodes: branch.summary.nodeCount, paths: branch.summary.pathCount, endings: branch.summary.endingCount, beats: beats.length, storylets: arr(project.storylets).length },
    structure: { errors, warns: branch.issues.filter((i) => i.level === 'warn').length, issues: branch.issues.slice(0, 12) },
    missing: missing.slice(0, 30),
    missingTotal: missing.length
  }
}

export function generateTasks(project = {}) {
  const existing = new Set(arr(project.production?.tasks).map((t) => t.sourceKey).filter(Boolean))
  const out = []
  const add = (sourceKey, title, module, refId, priority = 'medium', estimate = 1) => {
    if (existing.has(sourceKey)) return
    existing.add(sourceKey)
    out.push({ id: `task-gen-${sourceKey.replace(/[^a-z0-9]+/gi, '-').slice(0, 36)}-${out.length + 1}`, title, module, refId, status: 'todo', owner: '', estimate, priority, sourceKey, notes: '' })
  }
  for (const a of arr(project.blueprint?.acts)) add(`act:${a.id}`, `完成「${a.name}」场景与节拍`, 'narrative', a.id, 'high', 5)
  for (const c of arr(project.characters)) add(`char:${c.id}`, `制作「${c.name}」视觉与动画`, 'characters', c.id, 'medium', 3)
  for (const el of arr(project.world?.elements)) {
    for (const d of arr(el.data?.dialogues)) {
      if (d.quest) add(`quest:${d.quest.id || `${el.id}:${d.id}`}`, `实现任务「${d.quest.title || '未命名'}」`, 'world', el.id, 'high', 3)
    }
  }
  for (const b of arr(project.storyboard?.beats)) add(`beat:${b.id}`, `制作演出「${b.title}」`, 'storyboard', b.id, 'medium', 2)
  for (const s of arr(project.storylets)) add(`storylet:${s.id}`, `实现动态叙事「${s.name}」`, 'studio', s.id, 'low', 1)
  return out
}
