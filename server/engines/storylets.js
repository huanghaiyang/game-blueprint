/** 动态叙事：storylet 条件评分、可用性筛选与效果应用。纯函数。 */
import { check } from './expr.js'

const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

export function evaluateStorylet(storylet, flags = {}) {
  const results = arr(storylet.conditions).map((c) => {
    try {
      const r = check(c.expr, { flags })
      return { expr: c.expr, label: c.label || c.expr, ok: !!r.ok && !!r.value, error: r.error || '' }
    } catch (error) {
      return { expr: c.expr, label: c.label || c.expr, ok: false, error: error.message }
    }
  })
  const eligible = results.every((r) => r.ok)
  return {
    eligible,
    score: eligible ? (Number(storylet.salience) || 1) * (Number(storylet.weight) || 1) : 0,
    conditions: results,
    reason: eligible ? '' : results.filter((r) => !r.ok).map((r) => r.label || r.error).join('；')
  }
}

export function selectStorylets(project = {}, { flags = {}, seen = [] } = {}) {
  const seenSet = new Set(arr(seen))
  const rows = arr(project.storylets).map((s) => {
    const evalResult = evaluateStorylet(s, flags)
    const wasSeen = seenSet.has(s.id)
    const blockedByOnce = !!s.once && wasSeen
    return {
      id: s.id,
      name: s.name,
      description: s.description || '',
      tags: arr(s.tags),
      weight: Number(s.weight) || 1,
      salience: Number(s.salience) || 1,
      once: !!s.once,
      cooldown: Number(s.cooldown) || 0,
      ...evalResult,
      eligible: evalResult.eligible && !blockedByOnce,
      reason: blockedByOnce ? '一次性 storylet 已触发' : evalResult.reason
    }
  })
  return {
    flags,
    eligible: rows.filter((r) => r.eligible).sort((a, b) => b.score - a.score),
    rejected: rows.filter((r) => !r.eligible),
    all: rows,
    summary: { total: rows.length, eligible: rows.filter((r) => r.eligible).length, rejected: rows.filter((r) => !r.eligible).length }
  }
}

export function applyStorylet(state = {}, storylet = {}) {
  state.flags = state.flags || {}
  for (const [k, v] of Object.entries(obj(storylet.effects?.flags))) state.flags[k] = v
  state.quests = state.quests || {}
  for (const [id, status] of Object.entries(obj(storylet.effects?.quests))) state.quests[id] = { status }
  state.storylets = arr(state.storylets)
  if (!state.storylets.includes(storylet.id)) state.storylets.push(storylet.id)
  return state
}
