/** 引擎自测：node server/tests/run.js */
import assert from 'node:assert/strict'
import { seedProject, blankProject, DEFAULT_MODULES } from '../seed.js'
import { evaluate, variablesOf, check } from '../engines/expr.js'
import { deriveAll, curve } from '../engines/stats.js'
import { simulate, matrix, resolveBattle } from '../engines/combat.js'
import { analyze, simulateRoute } from '../engines/branch.js'
import { runInference } from '../engines/infer.js'
import { buildBlueprint } from '../engines/blueprint.js'
import { analyzeWorld } from '../engines/world.js'

let pass = 0
const failures = []
const test = (name, fn) => {
  try {
    fn()
    pass++
    console.log(`  ✓ ${name}`)
  } catch (e) {
    failures.push({ name, error: e })
    console.log(`  ✗ ${name}\n    ${e.message}`)
  }
}

console.log('\n[1] 表达式引擎')
test('算术与优先级', () => {
  assert.equal(evaluate('1 + 2 * 3'), 7)
  assert.equal(evaluate('(1 + 2) * 3'), 9)
  assert.equal(evaluate('2 ^ 3 ^ 2'), 512)
})
test('逻辑 / 三元 / 成员访问', () => {
  const ctx = { flags: { has_letter: true }, hp: 30 }
  assert.equal(evaluate('flags.has_letter && hp < 50 ? 1 : 0', ctx), 1)
  assert.equal(evaluate('!flags.has_letter', ctx), false)
})
test('内置函数', () => {
  assert.equal(evaluate('clamp(12, 0, 10)'), 10)
  assert.equal(evaluate('round(1.2345, 2)'), 1.23)
  assert.equal(evaluate('min(3, max(1, 2))'), 2)
  assert.equal(evaluate('has(flags, "has_letter")', { flags: { has_letter: true } }), true)
})
test('未知变量报错，变量收集正确', () => {
  assert.equal(check('nope + 1').ok, false)
  assert.deepEqual(variablesOf('atk * 2 + flags.has_letter').sort(), ['atk', 'flags'])
})

console.log('\n[2] 数值系统')
const project = seedProject()
test('派生属性按依赖求值', () => {
  const c = project.characters.find((x) => x.id === 'shen_yan')
  const d = deriveAll(project, c, 1)
  assert.deepEqual(d.errors, [])
  assert.ok(d.values.power > 0, 'power > 0')
  assert.ok(d.values.ehp > d.values.hp, 'ehp 含减伤')
  assert.ok(['dps', 'ttk', 'ehp', 'power'].every((k) => k in d.values), '派生键齐全')
})
test('等级成长单调', () => {
  const c = project.characters.find((x) => x.id === 'tie_ya')
  const lv1 = deriveAll(project, c, 1).values
  const lv10 = deriveAll(project, c, 10).values
  assert.ok(lv10.hp > lv1.hp)
  assert.ok(lv10.ehp > lv1.ehp)
})
test('曲线与指标', () => {
  const c = project.characters.find((x) => x.id === 'bai_lu')
  const { rows, anomalies } = curve(project, c, 10)
  assert.equal(rows.length, 10)
  assert.ok(rows[9].metrics.burst > rows[0].metrics.burst)
  assert.ok(Array.isArray(anomalies))
})

console.log('\n[3] 数值对抗')
const shen = () => {
  const c = project.characters.find((x) => x.id === 'shen_yan')
  return { id: c.id, name: c.name, stats: deriveAll(project, c, 5).values, skills: project.skills.filter((s) => (c.skillIds || []).includes(s.id)) }
}
const dummy = () => ({ id: 'dummy', name: '训练假人', stats: { hp: 120, atk: 12, def: 8, spd: 10, crit: 0, critDmg: 1.5, acc: 0.9, dodge: 0, mag: 0, res: 0 }, skills: [] })
test('蒙特卡洛胜率与分布', () => {
  const r = simulate(shen(), dummy(), { runs: 500, seed: 42 })
  assert.ok(r.winRate >= 0 && r.winRate <= 100)
  assert.equal(r.runs, 500)
  assert.ok(r.distribution.length > 0)
  assert.ok(r.avgRounds > 0)
})
test('强角色对假人胜率更高', () => {
  const weak = { id: 'weak', name: '弱鸡', stats: { hp: 60, atk: 5, def: 2, spd: 6 }, skills: [] }
  const weakWin = simulate(weak, dummy(), { runs: 400, seed: 7 }).winRate
  const strongWin = simulate(shen(), dummy(), { runs: 400, seed: 7 }).winRate
  assert.ok(strongWin > weakWin, `${strongWin} > ${weakWin}`)
})
test('同种子结果可复现', () => {
  const a = resolveBattle(shen(), dummy(), { seed: 123 }, 123)
  const b = resolveBattle(shen(), dummy(), { seed: 123 }, 123)
  assert.deepEqual(a.hp, b.hp)
  assert.equal(a.rounds, b.rounds)
})
test('对抗矩阵对角线为镜像', () => {
  const units = project.characters.map((c) => ({ id: c.id, name: c.name, stats: deriveAll(project, c, 3).values }))
  const m = matrix(units, { runs: 120 })
  assert.equal(m.rows.length, units.length)
  assert.equal(m.rows[0].cells[0].mirror, true)
})

console.log('\n[4] 分支演算')
const branch = analyze(project.narrative, { maxPaths: 4000 })
test('可达性与结局覆盖', () => {
  assert.equal(branch.summary.nodeCount, project.narrative.nodes.length)
  assert.equal(branch.summary.endingReachable, 3)
  assert.ok(branch.summary.pathCount > 15, `paths=${branch.summary.pathCount}`)
  assert.equal(branch.summary.truncated, false)
})
test('无死路、无自环、无悬空边', () => {
  assert.equal(branch.summary.deadEndCount, 0)
  assert.equal(branch.summary.cycleCount, 0)
  assert.equal(branch.issues.filter((i) => i.code === 'DANGLING_EDGE').length, 0)
})
test('旗标读写一致（无永不写入的旗标）', () => {
  const never = branch.issues.filter((i) => i.code === 'FLAG_NEVER_SET')
  assert.deepEqual(never, [])
  assert.ok(branch.flags.find((f) => f.flag === 'has_third_letter').writtenBy >= 2)
})
test('隐藏结局依赖双旗标且可达', () => {
  const hidden = branch.endingStats.find((e) => e.id === 'n18')
  assert.ok(hidden.reachable)
  assert.ok(hidden.pathCount > 0)
  assert.ok(hidden.probabilityMass > 0)
})
test('路径逐步演算', () => {
  const r = simulateRoute(project.narrative, ['e1', 'e2', 'e4', 'e6', 'e9', 'e12', 'e16', 'e19', 'e22'])
  assert.equal(r.ok, true)
  assert.equal(r.finalNode, 'n16')
  assert.equal(r.flags.baulu_ally, true)
  assert.equal(r.flags.has_third_letter, true)
  const blocked = simulateRoute(project.narrative, ['e1', 'e2', 'e4', 'e6', 'e10', 'e14'])
  assert.equal(blocked.steps.find((s) => s.type === 'blocked').reason.includes('条件不满足'), true)
})
test('枢纽中心度与张力剖面', () => {
  assert.ok(branch.hubs.length > 0)
  assert.equal(branch.hubs[0].id, 'n7')
  assert.ok(branch.tensionProfile.length > 0)
})

console.log('\n[5] 推理机')
const inference = runInference(project.cases[0])
test('推理链锁定正确凶手', () => {
  assert.equal(inference.verdict.hit, true)
  assert.equal(inference.verdict.topSuspectName, '铁鸦')
  assert.ok(inference.fired.length >= 8, `fired=${inference.fired.length}`)
})
test('白鹭被排除、无矛盾', () => {
  const bai = inference.ranking.find((r) => r.id === 'bai_lu')
  assert.equal(bai.eliminated, true)
  assert.deepEqual(inference.contradictions, [])
})
test('给出待补线索提示', () => {
  assert.ok(inference.hints.some((h) => h.missing.id === 'c_log'), '提示缺少港口值班记录')
})
test('缺少关键线索时无法定案', () => {
  const weak = runInference({ ...project.cases[0], clues: project.cases[0].clues.map((c) => ({ ...c, found: false })) })
  assert.equal(weak.verdict.hit, false)
  assert.ok(weak.fired.length < inference.fired.length)
})

console.log('\n[6] 走向蓝图')
test('生成蓝图与 Markdown', () => {
  const bp = buildBlueprint(project, branch)
  assert.equal(bp.acts.length, 3)
  assert.ok(bp.summary.nodes === project.narrative.nodes.length)
  assert.ok(bp.keyBeats.length > 0)
  assert.ok(bp.markdown.includes('# 《雾港回声》走向蓝图'))
  assert.ok(bp.markdown.includes('## 四、分支与结局覆盖'))
  assert.ok(bp.numericAnchors.every((a) => a.metric[2] > a.metric[0]))
})
test('发现叙事风险', () => {
  const mutated = structuredClone(project.narrative)
  mutated.nodes.push({ id: 'nx', title: '被遗忘的支线', type: 'scene', act: 'act2', tension: 30 })
  mutated.nodes.push({ id: 'ny', title: '从未启用的支线', type: 'scene', act: 'act2', tension: 20 })
  mutated.edges.push({ id: 'ex', from: 'n10', to: 'nx', label: '走错方向', type: 'choice', weight: 1 })
  const b2 = analyze(mutated, {})
  const bp2 = buildBlueprint({ ...project, narrative: mutated }, b2)
  assert.ok(bp2.warnings.some((w) => w.code === 'DEAD_END'), '应报告死路节点')
  assert.ok(bp2.issues.some((i) => i.code === 'UNREACHABLE'), '应报告不可达节点')
})

console.log('\n[7] 开放世界')
test('演示世界覆盖主要元素与聚落状态', () => {
  const w = analyzeWorld(project)
  assert.ok(w.summary.elements >= 50, `elements=${w.summary.elements}`)
  assert.equal(w.summary.settlements, 4)
  assert.equal(w.summary.hostileSettlements, 1)
  assert.equal(w.summary.safeSettlements, 3)
  assert.equal(w.summary.quests, 5)
  assert.ok(w.summary.dialogues >= 8)
  assert.ok(w.summary.specificDialogues >= 4)
  assert.equal(w.summary.validPortals, w.summary.portals)
})
test('NPC 对话包含特定对象、分支与任务', () => {
  const w = analyzeWorld(project)
  const bai = project.world.elements.find((e) => e.id === 'w-char-bailu')
  const specific = bai.data.dialogues.find((d) => d.audienceIds.includes('shen_yan'))
  assert.ok(specific, '白鹭应有只对沈砚开放的对话')
  assert.ok(specific.choices.length >= 2, '应有分支选项')
  assert.ok(specific.quest.objectives.length >= 3, '应有任务派发')
  assert.ok(w.quests.some((q) => q.title === '第三封信的线索'))
  assert.ok(w.dialogues.some((d) => d.audience.includes('沈砚')))
})
test('世界体检无严重错误，且能发现空世界', () => {
  const w = analyzeWorld(project)
  assert.equal(w.warnings.filter((x) => x.level === 'error').length, 0)
  const blank = blankProject({ name: '空世界' })
  const empty = analyzeWorld(blank)
  assert.ok(empty.warnings.some((x) => x.code === 'EMPTY_WORLD'))
  assert.equal(empty.summary.elements, 0)
})
test('走向蓝图包含开放世界章节', () => {
  const bp = buildBlueprint(project, branch)
  assert.ok(bp.world)
  assert.equal(bp.summary.worldSettlements, 4)
  assert.ok(bp.markdown.includes('## 八、开放世界摘要'))
  assert.ok(bp.markdown.includes('雾港老城'))
  assert.ok(bp.markdown.includes('第三封信的线索'))
})

console.log('\n[8] 多企划与模块开关')
test('演示企划启用推理模块', () => {
  assert.equal(project.meta.modules.inference, true)
  assert.equal(project.meta.modules.narrative, true)
})
test('空白企划默认关闭推理且可立即使用', () => {
  const blank = blankProject({ name: '测试企划' })
  assert.equal(blank.name, '测试企划')
  assert.equal(blank.meta.modules.inference, false)
  assert.equal(blank.meta.modules.narrative, true)
  assert.ok(blank.stats.attributes.length >= 10, '应带通用属性模板')
  assert.equal(blank.characters.length, 1, '应带一个可改名的初始角色')
  assert.equal(blank.narrative.nodes.length, 1)
  assert.equal(blank.cases.length, 0)
  assert.deepEqual(blank.world.elements, [])
  const d = deriveAll(blank, blank.characters[0], 1)
  assert.deepEqual(d.errors, [])
  assert.ok(d.values.power > 0)
})
test('可选模块列表完整', () => {
  assert.deepEqual(Object.keys(DEFAULT_MODULES).sort(), ['blueprint', 'branches', 'characters', 'combat', 'dashboard', 'inference', 'narrative', 'stats', 'world'])
  const blank = blankProject({ name: '无推理', modules: { inference: true } })
  assert.equal(blank.meta.modules.inference, true)
})

console.log(`\n结果：${pass} 通过，${failures.length} 失败\n`)
if (failures.length) {
  for (const f of failures) console.error(f.error)
  process.exit(1)
}
