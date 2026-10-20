/**
 * 数值对抗引擎：回合制伤害演算 + 蒙特卡洛胜率 + 对抗矩阵。
 * 纯函数、可复现（种子随机）。
 */
import { round } from './stats.js'

const BASIC_SKILL = { id: 'basic', name: '普通攻击', power: 1, hits: 1, critBonus: 0, cooldown: 0, weight: 1, type: 'physical' }

export const DEFAULT_CONFIG = {
  runs: 2000,
  maxRounds: 15,
  variance: 0.12,
  seed: 20260101,
  critEnabled: true,
  firstStrike: 'speed'
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function n(v, fallback = 0) {
  const x = Number(v)
  return Number.isFinite(x) ? x : fallback
}

export function normalizeCombatant(input = {}) {
  const s = input.values || input.stats || {}
  return {
    id: input.id || input.name || 'unit',
    name: input.name || '未命名',
    stats: {
      hp: Math.max(1, n(s.hp, 100)),
      atk: Math.max(1, n(s.atk, 10)),
      def: Math.max(0, n(s.def, 5)),
      spd: Math.max(1, n(s.spd, 10)),
      crit: clamp(n(s.crit, 0.05), 0, 1),
      critDmg: Math.max(1, n(s.critDmg, 1.5)),
      acc: clamp(n(s.acc, 0.95), 0.05, 1),
      dodge: clamp(n(s.dodge, 0), 0, 0.9),
      res: Math.max(0, n(s.res, 0)),
      mag: Math.max(0, n(s.mag, n(s.atk, 10)))
    },
    skills: (input.skills || []).length ? input.skills : [BASIC_SKILL]
  }
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v))
}

function pickSkill(unit, cooldowns, rng) {
  const ready = unit.skills.filter((s) => (cooldowns[s.id] || 0) <= 0)
  const pool = ready.length ? ready : [BASIC_SKILL]
  const total = pool.reduce((sum, s) => sum + Math.max(0.0001, n(s.weight, 1)), 0)
  let r = rng() * total
  for (const s of pool) {
    r -= Math.max(0.0001, n(s.weight, 1))
    if (r <= 0) return s
  }
  return pool[pool.length - 1]
}

function resolveHit(attacker, defender, skill, cfg, rng) {
  const a = attacker.stats
  const d = defender.stats
  const magic = skill.type === 'magic'
  const atk = magic ? a.mag : a.atk
  const def = magic ? d.res : d.def
  const hitChance = clamp(a.acc - d.dodge, 0.05, 0.99)
  const hits = Math.max(1, Math.round(n(skill.hits, 1)))
  let total = 0
  let crits = 0
  const detail = []
  for (let i = 0; i < hits; i++) {
    if (rng() > hitChance) {
      detail.push({ hit: i + 1, damage: 0, crit: false, miss: true })
      continue
    }
    const crit = cfg.critEnabled && rng() < clamp(a.crit + n(skill.critBonus, 0), 0, 0.95)
    const variance = 1 + (rng() * 2 - 1) * clamp(n(cfg.variance, 0.12), 0, 0.8)
    const raw = atk * Math.max(0, n(skill.power, 1)) * (100 / (100 + def))
    const dmg = Math.max(1, raw * (crit ? a.critDmg : 1) * variance)
    total += dmg
    if (crit) crits++
    detail.push({ hit: i + 1, damage: round(dmg, 1), crit })
  }
  return { damage: Math.max(0, Math.round(total)), crits, detail, hitChance }
}

/** 单场战斗。 */
export function resolveBattle(aInput, bInput, config = {}, seed) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const rng = mulberry32((seed ?? cfg.seed ?? Date.now()) >>> 0)
  const A = normalizeCombatant(aInput)
  const B = normalizeCombatant(bInput)
  const hp = { [A.id]: A.stats.hp, [B.id]: B.stats.hp }
  const cooldowns = { [A.id]: {}, [B.id]: {} }
  const units = { [A.id]: A, [B.id]: B }
  const orderIds = cfg.firstStrike === 'random' && rng() < 0.5 ? [B.id, A.id] : [A.id, B.id]
  const log = []
  let rounds = 0
  let damage = { [A.id]: 0, [B.id]: 0 }
  let crits = { [A.id]: 0, [B.id]: 0 }
  let misses = { [A.id]: 0, [B.id]: 0 }

  for (let r = 1; r <= cfg.maxRounds; r++) {
    rounds = r
    const acting = orderIds
      .map((id) => units[id])
      .sort((x, y) => y.stats.spd - x.stats.spd || (rng() < 0.5 ? -1 : 1))
    for (const actor of acting) {
      const target = actor === A ? B : A
      if (hp[actor.id] <= 0 || hp[target.id] <= 0) continue
      const skill = pickSkill(actor, cooldowns[actor.id], rng)
      const res = resolveHit(actor, target, skill, cfg, rng)
      hp[target.id] = Math.max(0, hp[target.id] - res.damage)
      damage[actor.id] += res.damage
      crits[actor.id] += res.crits
      misses[actor.id] += res.detail.filter((d) => d.miss).length
      if (n(skill.cooldown, 0) > 0) cooldowns[actor.id][skill.id] = Math.round(n(skill.cooldown, 0))
      for (const k of Object.keys(cooldowns[actor.id])) {
        if (k !== skill.id) cooldowns[actor.id][k] = Math.max(0, (cooldowns[actor.id][k] || 0) - 1)
      }
      if (log.length < 240) {
        log.push(
          res.damage > 0
            ? `R${r} ${actor.name} 使用「${skill.name}」对 ${target.name} 造成 ${res.damage} 点伤害${res.crits ? `（暴击 ×${res.crits}）` : ''}，剩余 ${hp[target.id]}`
            : `R${r} ${actor.name} 的「${skill.name}」被 ${target.name} 闪避`
        )
      }
      if (hp[target.id] <= 0) break
    }
    if (hp[A.id] <= 0 || hp[B.id] <= 0) break
  }

  const winner = hp[A.id] <= 0 && hp[B.id] <= 0 ? 'draw' : hp[A.id] <= 0 ? 'B' : hp[B.id] <= 0 ? 'A' : 'timeout'
  return {
    winner,
    rounds,
    hp: { [A.id]: round(hp[A.id], 1), [B.id]: round(hp[B.id], 1) },
    hpPercent: { [A.id]: round((hp[A.id] / A.stats.hp) * 100, 1), [B.id]: round((hp[B.id] / B.stats.hp) * 100, 1) },
    damage,
    crits,
    misses,
    log,
    units: {
      [A.id]: { name: A.name, stats: A.stats },
      [B.id]: { name: B.name, stats: B.stats }
    }
  }
}

/** 蒙特卡洛：胜率、回合分布、伤害/暴击/闪避统计。 */
export function simulate(aInput, bInput, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config }
  const runs = clamp(Math.round(n(cfg.runs, 2000)), 1, 50000)
  const seed = (n(cfg.seed, 20260101) || 1) >>> 0
  const A = normalizeCombatant(aInput)
  const B = normalizeCombatant(bInput)
  let wins = 0
  let losses = 0
  let draws = 0
  let timeouts = 0
  let roundSum = 0
  let hpSumA = 0
  let hpSumB = 0
  let dmgA = 0
  let dmgB = 0
  let critsA = 0
  let critsB = 0
  let missesA = 0
  let missesB = 0
  const roundHist = new Map()
  const samples = []

  for (let i = 0; i < runs; i++) {
    const r = resolveBattle(A, B, cfg, seed + i * 7919)
    if (r.winner === 'A') wins++
    else if (r.winner === 'B') losses++
    else if (r.winner === 'draw') draws++
    else timeouts++
    roundSum += r.rounds
    hpSumA += r.hp[A.id]
    hpSumB += r.hp[B.id]
    dmgA += r.damage[A.id]
    dmgB += r.damage[B.id]
    critsA += r.crits[A.id]
    critsB += r.crits[B.id]
    missesA += r.misses[A.id]
    missesB += r.misses[B.id]
    const key = Math.min(cfg.maxRounds, r.rounds)
    roundHist.set(key, (roundHist.get(key) || 0) + 1)
    if (samples.length < 3 && i % Math.max(1, Math.floor(runs / 3)) === 0) {
      samples.push({ winner: r.winner, rounds: r.rounds, hp: r.hp, log: r.log.slice(0, 14) })
    }
  }

  const avgRounds = round(roundSum / runs, 2)
  const distribution = [...roundHist.entries()]
    .sort((x, y) => x[0] - y[0])
    .map(([rd, count]) => ({ round: rd, count, pct: round((count / runs) * 100, 1) }))

  return {
    config: { ...cfg, runs },
    a: { id: A.id, name: A.name, stats: A.stats },
    b: { id: B.id, name: B.name, stats: B.stats },
    runs,
    winRate: round((wins / runs) * 100, 2),
    loseRate: round((losses / runs) * 100, 2),
    drawRate: round((draws / runs) * 100, 2),
    timeoutRate: round((timeouts / runs) * 100, 2),
    avgRounds,
    medianRounds: median([...roundHist.entries()].flatMap(([rd, c]) => Array(Math.min(c, 200)).fill(rd))),
    avgRemainingHp: { a: round(hpSumA / runs, 1), b: round(hpSumB / runs, 1) },
    avgDamage: { a: round(dmgA / runs, 1), b: round(dmgB / runs, 1) },
    critRate: { a: round((critsA / Math.max(1, dmgA / Math.max(1, A.stats.atk))) * 100, 1), b: round((critsB / Math.max(1, dmgB / Math.max(1, B.stats.atk))) * 100, 1) },
    missRate: { a: round((missesA / runs) * 100, 1), b: round((missesB / runs) * 100, 1) },
    distribution,
    samples
  }
}

/** 两两对抗矩阵。 */
export function matrix(units, config = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config, runs: clamp(Math.round((config.runs || 600) / 10) * 10, 50, 4000) }
  const rows = []
  for (const a of units) {
    const row = { id: a.id, name: a.name, cells: [] }
    for (const b of units) {
      if (a.id === b.id) {
        row.cells.push({ id: b.id, name: b.name, winRate: 50, mirror: true })
        continue
      }
      const r = simulate(a, b, { ...cfg, runs: Math.max(80, Math.round(cfg.runs / units.length)) })
      row.cells.push({ id: b.id, name: b.name, winRate: r.winRate, avgRounds: r.avgRounds })
    }
    rows.push(row)
  }
  return { runs: cfg.runs, rows }
}

/** 战力-回合体检：给出角色在不同等级对基准假人的胜率。 */
export function levelSweep(aInput, dummyInput, levels = [1, 3, 5, 8, 10], config = {}) {
  const out = []
  for (const level of levels) {
    const a = typeof aInput === 'function' ? aInput(level) : aInput
    const r = simulate(a, dummyInput, { ...config, runs: Math.min(800, config.runs || 800) })
    out.push({ level, winRate: r.winRate, avgRounds: r.avgRounds })
  }
  return out
}

function median(arr) {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : round((s[m - 1] + s[m]) / 2, 2)
}

export const SKILL_TEMPLATES = [
  { id: 'basic', name: '普通攻击', power: 1, hits: 1, critBonus: 0, cooldown: 0, weight: 1, type: 'physical' },
  { id: 'pierce', name: '突刺', power: 1.15, hits: 1, critBonus: 0.05, cooldown: 0, weight: 3, type: 'physical' },
  { id: 'combo', name: '三段连击', power: 0.52, hits: 3, critBonus: 0, cooldown: 1, weight: 2, type: 'physical' },
  { id: 'heavy', name: '重斩', power: 1.8, hits: 1, critBonus: 0, cooldown: 2, weight: 2, type: 'physical' },
  { id: 'execute', name: '处决', power: 2.3, hits: 1, critBonus: 0.2, cooldown: 3, weight: 1, type: 'physical' },
  { id: 'hex', name: '雾咒', power: 1.5, hits: 1, critBonus: 0.05, cooldown: 2, weight: 3, type: 'magic' }
]
