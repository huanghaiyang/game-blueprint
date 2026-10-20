/**
 * 数值系统：等级成长、派生属性求值（拓扑排序）、指标计算。
 */
import { evaluate, variablesOf, check } from './expr.js'

export const DEFAULT_STATS = {
  hp: 100, atk: 10, def: 5, spd: 10, crit: 0.05, critDmg: 1.5, acc: 0.95, dodge: 0.05, res: 0, mag: 0
}

export function attrsOf(project) {
  return (project?.stats?.attributes || []).slice()
}

export function attrMap(project) {
  const map = new Map()
  for (const a of attrsOf(project)) map.set(a.key, a)
  return map
}

/** 角色在某等级的属性原值（未含派生公式）。 */
export function baseValues(project, character, level = 1) {
  const out = {}
  const lv = Math.max(1, Math.round(level || 1))
  for (const attr of attrsOf(project)) {
    if (attr.kind === 'derived') continue
    const base = num(character?.base?.[attr.key] ?? attr.base ?? 0)
    const growth = num(character?.growth?.[attr.key] ?? attr.growth ?? 0)
    let v = base + growth * (lv - 1)
    if (attr.min != null) v = Math.max(attr.min, v)
    if (attr.max != null) v = Math.min(attr.max, v)
    out[attr.key] = round(v, 4)
  }
  // 角色自定义字段兜底
  for (const [k, v] of Object.entries(character?.base || {})) {
    if (!(k in out) && typeof v === 'number') out[k] = v
  }
  return out
}

/** 求值全部属性，派生属性按依赖拓扑执行。 */
export function deriveAll(project, character, level = 1) {
  const lv = Math.max(1, Math.round(level || 1))
  const values = baseValues(project, character, lv)
  const attrs = attrsOf(project)
  const derived = attrs.filter((a) => a.kind === 'derived' && a.formula && String(a.formula).trim())
  const derivedKeys = new Set(derived.map((a) => a.key))
  const order = []
  const errors = []
  const warnings = []

  // Kahn 拓扑排序
  const deps = new Map()
  for (const a of derived) {
    let vars = []
    try {
      vars = variablesOf(a.formula).filter((v) => derivedKeys.has(v) && v !== a.key)
    } catch (e) {
      errors.push({ key: a.key, error: e.message })
    }
    deps.set(a.key, new Set(vars))
  }
  const pending = new Set(derived.map((a) => a.key))
  while (pending.size) {
    let progressed = false
    for (const key of [...pending]) {
      const d = deps.get(key) || new Set()
      if ([...d].every((k) => !pending.has(k))) {
        order.push(key)
        pending.delete(key)
        progressed = true
      }
    }
    if (!progressed) {
      for (const k of pending) errors.push({ key: k, error: '派生属性存在循环依赖' })
      break
    }
  }

  const byKey = new Map(derived.map((a) => [a.key, a]))
  for (const key of order) {
    const a = byKey.get(key)
    const ctx = { ...values, level: lv, lvl: lv, stats: values, character: { name: character?.name, role: character?.role } }
    try {
      const v = Number(evaluate(a.formula, ctx))
      if (!Number.isFinite(v)) throw new Error('结果不是有限数字')
      values[key] = round(v, 4)
    } catch (e) {
      values[key] = 0
      errors.push({ key, error: e.message, formula: a.formula })
    }
  }

  // 指标公式（不写入属性）
  const metrics = {}
  for (const f of project?.stats?.formulas || []) {
    if (!f.expr || !String(f.expr).trim()) continue
    const ctx = { ...values, level: lv, lvl: lv, stats: values }
    try {
      metrics[f.id] = { id: f.id, name: f.name, unit: f.unit || '', value: round(Number(evaluate(f.expr, ctx)), 3) }
    } catch (e) {
      metrics[f.id] = { id: f.id, name: f.name, unit: f.unit || '', value: null, error: e.message }
    }
  }

  if (character) {
    for (const [k, v] of Object.entries(values)) {
      if (!Number.isFinite(v)) warnings.push(`${character.name} 的 ${k} 不是有限数值`)
    }
  }

  return { level: lv, values, order, metrics, errors, warnings }
}

/** 等级曲线，用于图表与成长体检。 */
export function curve(project, character, maxLevel = 10) {
  const rows = []
  for (let lv = 1; lv <= maxLevel; lv++) {
    const d = deriveAll(project, character, lv)
    rows.push({ level: lv, values: d.values, metrics: Object.fromEntries(Object.entries(d.metrics).map(([k, m]) => [k, m.value])) })
  }
  // 成长体检：二阶差分尖峰
  const anomalies = []
  const metricKeys = Object.keys(rows[0]?.metrics || {})
  for (const key of metricKeys) {
    const series = rows.map((r) => r.metrics[key]).filter((v) => typeof v === 'number' && Number.isFinite(v))
    if (series.length < 3) continue
    const growth = series.slice(1).map((v, i) => v - series[i])
    for (let i = 1; i < growth.length; i++) {
      const delta = growth[i] - growth[i - 1]
      const scale = Math.abs(series[i]) || 1
      if (Math.abs(delta) / scale > 0.6) {
        anomalies.push({
          metric: key,
          level: i + 2,
          delta: round(delta, 2),
          note: delta > 0 ? '成长曲线出现跃升，检查等级收益是否过高' : '成长曲线出现断层，检查是否漏配成长值'
        })
      }
    }
  }
  return { rows, anomalies }
}

/** 校验单个属性定义。 */
export function validateAttribute(attr, project) {
  const errors = []
  if (!attr.key || !/^[A-Za-z_$][\w$]*$/.test(attr.key)) errors.push('key 必须是合法标识符（字母/下划线开头）')
  if (attr.kind === 'derived' && !String(attr.formula || '').trim()) errors.push('派生属性必须填写公式')
  if (attr.formula) {
    const r = check(attr.formula, { ...baseValues(project, {}, 1), level: 1 })
    if (!r.ok && !/未知变量/.test(r.error)) errors.push(`公式语法错误：${r.error}`)
  }
  return errors
}

export function round(v, d = 2) {
  const p = Math.pow(10, d)
  return Math.round((Number(v) || 0) * p) / p
}

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
