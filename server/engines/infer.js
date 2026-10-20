/**
 * 推理机：带可信度（CF）的前向链推理。
 * 支持线索 / 事实 / 人物特质 / 表达式条件，推导事实、嫌疑分、排除结论；
 * 并给出「差一条线索」的待补提示与矛盾检测。
 */
import { evaluate } from './expr.js'

const THRESHOLD = 0.5
const ELIMINATE_THRESHOLD = 0.6

const combine = (a, b) => clamp(a + b - a * b, 0, 1)
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const r2 = (v) => Math.round(v * 100) / 100

export function runInference(caseData = {}, options = {}) {
  const suspects = (caseData.suspects || []).map((s) => ({ ...s, traits: s.traits || {} }))
  const suspectMap = new Map(suspects.map((s) => [s.id, s]))
  const clues = caseData.clues || []
  const clueMap = new Map(clues.map((c) => [c.id, c]))
  const found = new Set(clues.filter((c) => c.found !== false).map((c) => c.id))
  const rules = (caseData.rules || []).map((r) => ({ ...r, when: (r.when || []).map((c) => ({ ...c })), then: { ...(r.then || {}) } }))
  const facts = new Map() // name -> {cf, sources, label}
  const suspicion = new Map(suspects.map((s) => [s.id, { score: 0, eliminated: false, reasons: [] }]))
  const fired = []
  const contradictions = []
  const warnings = []
  const iterations = Math.max(1, Math.min(options.maxIterations || 50, 200))

  const addFact = (name, cf, source, label) => {
    if (!name) return 0
    const prev = facts.get(name)
    const nextCF = prev ? combine(prev.cf, cf) : cf
    if (!prev) facts.set(name, { cf: nextCF, sources: [source], label: label || name })
    else {
      prev.cf = nextCF
      if (!prev.sources.includes(source)) prev.sources.push(source)
    }
    return nextCF
  }

  // 初始事实
  for (const f of caseData.facts || []) {
    if (typeof f === 'string') addFact(f, 1, 'initial', f)
    else if (f && f.name) addFact(f.name, Number.isFinite(Number(f.cf)) ? Number(f.cf) : 1, 'initial', f.label)
  }

  const ctxFor = () => {
    const factValues = Object.fromEntries([...facts.entries()].map(([k, v]) => [k, v.cf]))
    const clueValues = Object.fromEntries(clues.map((c) => [c.id, found.has(c.id)]))
    const traitValues = Object.fromEntries(suspects.map((s) => [s.id, s.traits]))
    return { facts: factValues, clues: clueValues, traits: traitValues, suspects: traitValues }
  }

  const condMet = (cond) => {
    if (!cond) return { met: false, text: '空条件', cf: 0 }
    const type = cond.type || 'fact'
    if (type === 'clue') {
      const c = clueMap.get(cond.id)
      const ok = found.has(cond.id)
      return { met: ok, text: `线索「${c?.name || cond.id}」${ok ? '' : '（未获得）'}`, cf: ok ? 1 : 0, missing: ok ? null : { kind: 'clue', id: cond.id, label: c?.name || cond.id } }
    }
    if (type === 'fact') {
      const f = facts.get(cond.name)
      const cf = f ? f.cf : 0
      const min = Number.isFinite(Number(cond.minCF)) ? Number(cond.minCF) : THRESHOLD
      const ok = cf >= min
      return { met: ok, text: `事实「${f?.label || cond.name}」(CF ${r2(cf)})`, cf, missing: ok ? null : { kind: 'fact', id: cond.name, label: cond.label || cond.name } }
    }
    if (type === 'trait') {
      const s = suspectMap.get(cond.suspect)
      const ok = !!(s && s.traits[cond.trait])
      return { met: ok, text: `${s?.name || cond.suspect} 具备特质「${cond.trait}」`, cf: ok ? 1 : 0, missing: ok ? null : { kind: 'trait', id: `${cond.suspect}.${cond.trait}`, label: `${s?.name || cond.suspect}.${cond.trait}` } }
    }
    if (type === 'expr') {
      try {
        const ok = !!evaluate(cond.expr, ctxFor())
        return { met: ok, text: cond.label || cond.expr, cf: ok ? 1 : 0, missing: ok ? null : { kind: 'expr', id: cond.expr, label: cond.label || cond.expr } }
      } catch (e) {
        return { met: false, text: `表达式错误：${e.message}`, cf: 0, missing: null, error: e.message }
      }
    }
    return { met: false, text: `未知条件类型 ${type}`, cf: 0 }
  }

  const ruleText = (rule) => (rule.name ? rule.name : `规则 ${rule.id}`)

  // 前向链
  let changed = true
  let round = 0
  while (changed && round < iterations) {
    changed = false
    round++
    for (const rule of rules) {
      if (rule._fired) continue
      const checks = (rule.when || []).map(condMet)
      if (checks.some((c) => c.error)) warnings.push(`规则「${ruleText(rule)}」包含无效表达式`)
      if (!checks.length || !checks.every((c) => c.met)) continue
      const premiseCF = Math.min(...checks.map((c) => c.cf), 1)
      const ruleCF = Number.isFinite(Number(rule.cf)) ? Number(rule.cf) : 1
      const cf = r2(clamp(ruleCF * premiseCF, 0, 1))
      const then = rule.then || {}
      const conclusions = []
      if (then.fact) {
        const value = addFact(then.fact, cf, rule.id, then.label)
        conclusions.push({ kind: 'fact', name: then.fact, label: then.label || then.fact, cf: value })
      }
      if (then.suspicion) {
        const s = suspicion.get(then.suspicion)
        if (s) {
          s.score = r2(combine(s.score, cf))
          s.reasons.push({ rule: rule.id, ruleName: ruleText(rule), cf, text: then.reason || then.label || ruleText(rule) })
          conclusions.push({ kind: 'suspicion', suspect: then.suspicion, cf })
        }
      }
      if (then.eliminate) {
        const s = suspicion.get(then.eliminate)
        if (s && cf >= ELIMINATE_THRESHOLD) {
          s.eliminated = true
          s.reasons.push({ rule: rule.id, ruleName: ruleText(rule), cf, text: then.reason || `排除 ${then.eliminate}`, eliminate: true })
          conclusions.push({ kind: 'eliminate', suspect: then.eliminate, cf })
        }
      }
      if (!then.fact && !then.suspicion && !then.eliminate && then.note) conclusions.push({ kind: 'note', text: then.note })
      if (!conclusions.length) continue
      rule._fired = true
      fired.push({
        order: fired.length + 1,
        ruleId: rule.id,
        name: ruleText(rule),
        premises: checks.map((c) => ({ text: c.text, cf: r2(c.cf) })),
        premiseCF: r2(premiseCF),
        ruleCF,
        cf,
        conclusions
      })
      // 矛盾：同时推导出 x 与 not_x
      for (const c of conclusions) {
        if (c.kind !== 'fact') continue
        const neg = c.name.startsWith('not_') ? c.name.slice(4) : `not_${c.name}`
        const other = facts.get(neg)
        if (other && other.cf >= THRESHOLD && c.cf >= THRESHOLD) {
          contradictions.push({ fact: c.name, opposite: neg, cf: c.cf, oppositeCF: r2(other.cf), message: `同时推出「${c.name}」与「${neg}」，需要人工裁决` })
        }
      }
      changed = true
    }
  }

  // 待补线索提示：只差一个未满足条件、且缺失项是线索
  const hints = []
  for (const rule of rules) {
    if (rule._fired) continue
    const checks = (rule.when || []).map(condMet)
    const missing = checks.filter((c) => !c.met)
    if (missing.length === 1 && missing[0].missing) {
      hints.push({
        ruleId: rule.id,
        ruleName: ruleText(rule),
        missing: missing[0].missing,
        missingText: missing[0].text,
        conclusion: rule.then?.label || rule.then?.fact || (rule.then?.suspicion ? `提高 ${suspectMap.get(rule.then.suspicion)?.name} 的嫌疑` : rule.then?.note || '')
      })
    }
  }

  const ranking = suspects
    .map((s) => {
      const st = suspicion.get(s.id)
      return {
        id: s.id,
        name: s.name,
        role: s.role || '',
        score: r2(st.score),
        eliminated: st.eliminated,
        reasons: st.reasons
      }
    })
    .sort((a, b) => (a.eliminated - b.eliminated) || b.score - a.score)

  const ranked = ranking.filter((r) => !r.eliminated)
  const top = ranked.find((r) => r.score >= 0.3) || null
  const solution = caseData.solution || {}
  const expectedFacts = solution.expectedFacts || []
  const missedFacts = expectedFacts.filter((f) => !facts.has(f) || facts.get(f).cf < THRESHOLD)
  const verdict = {
    suspect: solution.suspect || null,
    suspectName: suspectMap.get(solution.suspect)?.name || null,
    topSuspect: top?.id || null,
    topSuspectName: top?.name || null,
    closed: missedFacts.length === 0,
    hit: !!(solution.suspect && top && solution.suspect === top.id && missedFacts.length === 0),
    confidenceGap: ranking.length > 1 ? r2((ranking[0].score || 0) - (ranking[1].score || 0)) : null,
    missedFacts,
    reasoning: solution.reasoning || ''
  }

  return {
    caseId: caseData.id,
    title: caseData.title,
    question: caseData.question || '',
    rounds: round,
    clueUsage: clues.map((c) => ({ id: c.id, name: c.name, found: found.has(c.id), weight: c.weight || 1 })),
    facts: [...facts.entries()].map(([name, v]) => ({ name, label: v.label, cf: r2(v.cf), sources: v.sources })),
    fired,
    ranking,
    hints,
    contradictions,
    warnings,
    verdict,
    coverage: { firedRules: fired.length, totalRules: rules.length, pct: rules.length ? Math.round((fired.length / rules.length) * 100) : 0 },
    explain: fired.map((f) => `[${f.ruleId}] ${f.premises.map((p) => p.text).join(' ∧ ')} ⇒ ${f.conclusions.map((c) => `${c.kind}:${c.label || c.name || c.suspect || c.text}`).join('，')} (CF ${f.cf})`)
  }
}
