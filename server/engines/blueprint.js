/**
 * 走向蓝图：把叙事结构、分支质量、角色弧光、数值锚点汇总为可交付文档。
 */
import { deriveAll, round } from './stats.js'
import { analyzeWorld } from './world.js'

const TYPE_LABEL = { scene: '场景', choice: '抉择', combat: '对抗', ending: '结局', hub: '枢纽' }
const BLOCKS = '▁▂▃▄▅▆▇█'

export function buildBlueprint(project, branch = null) {
  const narrative = project.narrative || {}
  const nodes = (narrative.nodes || []).slice()
  const characters = project.characters || []
  const warnings = []
  const issues = branch?.issues || []

  let acts = (project.blueprint?.acts || []).slice()
  if (!acts.length) {
    const names = [...new Set(nodes.map((n) => n.act).filter(Boolean))]
    acts = names.map((name, i) => ({ id: `act-${i + 1}`, name, goal: '', tensionTarget: 0 }))
  }
  acts = acts.map((a, i) => ({ ...a, order: i }))

  const actOf = (node) => {
    if (!node.act) return null
    return acts.find((a) => a.id === node.act) || acts.find((a) => a.name === node.act) || null
  }
  const actIndex = new Map(acts.map((a, i) => [a.id, i]))
  for (const n of nodes) {
    const a = actOf(n)
    n._actId = a?.id || null
    n._order = a ? actIndex.get(a.id) : 99
  }

  const actStats = acts.map((a, i) => {
    const list = nodes.filter((n) => n._actId === a.id)
    const tensions = list.map((n) => Number(n.tension) || 0)
    const fanout = list.reduce((s, n) => s + (branch?.nodes?.find((b) => b.id === n.id)?.fanout ?? 0), 0)
    return {
      id: a.id,
      name: a.name,
      goal: a.goal || '',
      order: i,
      nodeCount: list.length,
      choiceCount: list.filter((n) => n.type === 'choice').length,
      combatCount: list.filter((n) => n.type === 'combat').length,
      endingCount: list.filter((n) => n.type === 'ending').length,
      avgTension: tensions.length ? round(tensions.reduce((x, y) => x + y, 0) / tensions.length, 1) : 0,
      maxTension: tensions.length ? Math.max(...tensions) : 0,
      minTension: tensions.length ? Math.min(...tensions) : 0,
      tensionTarget: Number(a.tensionTarget) || 0,
      fanout,
      nodes: list.map((n) => ({ id: n.id, title: n.title, type: n.type, tension: n.tension, summary: n.summary }))
    }
  })

  for (const a of actStats) {
    if (!a.nodeCount) warnings.push({ level: 'warn', code: 'EMPTY_ACT', message: `幕「${a.name}」没有任何节点` })
    if (a.nodeCount && a.nodeCount < 2) warnings.push({ level: 'info', code: 'THIN_ACT', message: `幕「${a.name}」只有 ${a.nodeCount} 个节点，节奏可能过急` })
    if (a.tensionTarget && Math.abs(a.avgTension - a.tensionTarget) > 15) {
      warnings.push({ level: 'info', code: 'TENSION_TARGET_GAP', message: `幕「${a.name}」实际平均张力 ${a.avgTension} 与目标 ${a.tensionTarget} 偏差 ${round(a.avgTension - a.tensionTarget, 1)}` })
    }
  }
  // 幕间张力
  for (let i = 1; i < actStats.length; i++) {
    const prev = actStats[i - 1]
    const cur = actStats[i]
    if (prev.nodeCount && cur.nodeCount && cur.avgTension - prev.avgTension < -22) {
      warnings.push({ level: 'warn', code: 'TENSION_DROP', message: `第三幕式下坠：从「${prev.name}」(${prev.avgTension}) 到「${cur.name}」(${cur.avgTension})，张力掉 ${round(prev.avgTension - cur.avgTension, 1)}` })
    }
    if (cur.avgTension - prev.avgTension > 45) {
      warnings.push({ level: 'warn', code: 'TENSION_SPIKE', message: `张力突跳：从「${prev.name}」到「${cur.name}」上升 ${round(cur.avgTension - prev.avgTension, 1)}，考虑增加过渡节点` })
    }
  }
  if (actStats[0] && actStats[0].avgTension > 60) warnings.push({ level: 'warn', code: 'EARLY_CLIMAX', message: '首幕平均张力偏高，缺少铺垫空间' })
  if (actStats.length > 1) {
    const last = actStats[actStats.length - 1]
    const first = actStats[0]
    if (last.avgTension < first.avgTension && !last.endingCount) warnings.push({ level: 'info', code: 'SOFT_FINISH', message: '尾幕张力低于首幕且无结局落点，收束可能乏力' })
  }
  if (branch?.summary) {
    if (branch.summary.deadEndCount) warnings.push({ level: 'error', code: 'DEAD_END', message: `存在 ${branch.summary.deadEndCount} 个死路节点，会让玩家卡死` })
    if (branch.summary.endingCount && branch.summary.endingReachable < branch.summary.endingCount) {
      warnings.push({ level: 'warn', code: 'ENDING_COVERAGE', message: `只有 ${branch.summary.endingReachable}/${branch.summary.endingCount} 个结局可达` })
    }
    if (branch.summary.avgBranchEntropy < 0.6) warnings.push({ level: 'info', code: 'WEAK_BRANCH', message: '选择点平均分支熵偏低，玩家可能感觉「选什么都一样」' })
    if (branch.summary.pathCount > 120) warnings.push({ level: 'info', code: 'ROUTE_BLOAT', message: `路径数 ${branch.summary.pathCount}，分支规模偏大，建议合并低价值分支` })
  }

  // 关键节拍：扇出 × 张力 × 中心度
  const hubScore = new Map((branch?.hubs || []).map((h) => [h.id, h.score]))
  const keyBeats = nodes
    .map((n) => {
      const bn = branch?.nodes?.find((b) => b.id === n.id)
      const score = (bn?.fanout || 0) * 10 + (Number(n.tension) || 0) * 0.6 + (hubScore.get(n.id) || 0) * 30 + (n.type === 'ending' ? 18 : 0) + (n.type === 'combat' ? 8 : 0)
      return { id: n.id, title: n.title, type: n.type, act: n.act, tension: Number(n.tension) || 0, fanout: bn?.fanout || 0, indegree: bn?.indegree || 0, score: round(score, 1) }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)

  // 角色弧光
  const arcs = characters.map((c) => ({
    id: c.id,
    name: c.name,
    role: c.role,
    faction: c.faction,
    color: c.color,
    motivation: c.motivation,
    flaw: c.flaw,
    start: c.arc?.start,
    midpoint: c.arc?.midpoint,
    end: c.arc?.end,
    relations: (c.relations || []).length
  }))

  // 数值锚点
  const metric = (project.stats?.formulas || [])[0]
  const numericAnchors = characters.map((c) => {
    const d1 = deriveAll(project, c, 1)
    const d5 = deriveAll(project, c, 5)
    const d10 = deriveAll(project, c, 10)
    const lv1 = d1.values
    const lv5 = d5.values
    const lv10 = d10.values
    return {
      id: c.id,
      name: c.name,
      role: c.role,
      hp: [lv1.hp, lv5.hp, lv10.hp].map((v) => round(v, 0)),
      atk: [lv1.atk, lv5.atk, lv10.atk].map((v) => round(v, 0)),
      def: [lv1.def, lv5.def, lv10.def].map((v) => round(v, 0)),
      spd: [lv1.spd, lv5.spd, lv10.spd].map((v) => round(v, 0)),
      metricName: metric?.name || '',
      metric: metric
        ? [d1.metrics[metric.id]?.value, d5.metrics[metric.id]?.value, d10.metrics[metric.id]?.value].map((v) => round(v || 0, 1))
        : null
    }
  })

  // 张力曲线：按幕 + 节点序列
  const tensionCurve = actStats.map((a) => ({ act: a.name, avg: a.avgTension, max: a.maxTension, target: a.tensionTarget }))
  const sparkline = tensionCurve.map((p) => {
    const idx = Math.min(BLOCKS.length - 1, Math.max(0, Math.round((p.avg / 100) * (BLOCKS.length - 1))))
    return BLOCKS[idx]
  }).join('')

  const routeTable = (branch?.endingStats || []).map((e) => ({
    id: e.id,
    title: e.title,
    act: e.act,
    reachable: e.reachable,
    pathCount: e.pathCount,
    probability: round(e.probabilityMass * 100, 1),
    minLength: e.minLength,
    maxLength: e.maxLength
  }))

  const worldEnabled = project.meta?.modules?.world !== false
  const world = worldEnabled && (project.world?.elements?.length || 0) > 0 ? analyzeWorld(project) : null
  if (world) {
    for (const w of world.warnings) {
      if (w.level === 'error' || w.level === 'warn') {
        warnings.push({ level: w.level, code: `WORLD_${w.code}`, message: `[开放世界] ${w.message}` })
      }
    }
  }

  const blueprint = {
    title: project.name || '未命名企划',
    logline: project.meta?.logline || '',
    genre: project.meta?.genre || '',
    tone: project.meta?.tone || '',
    acts: actStats,
    tensionCurve,
    sparkline,
    routeTable,
    keyBeats,
    arcs,
    numericAnchors,
    characters,
    world,
    warnings,
    issues,
    summary: {
      acts: actStats.length,
      nodes: nodes.length,
      choices: nodes.filter((n) => n.type === 'choice').length,
      endings: nodes.filter((n) => n.type === 'ending').length,
      routes: branch?.summary?.pathCount || 0,
      reachableEndings: branch?.summary?.endingReachable || 0,
      avgTension: nodes.length ? round(nodes.reduce((s, n) => s + (Number(n.tension) || 0), 0) / nodes.length, 1) : 0,
      avgPathLength: branch?.summary?.avgPathLength || 0,
      entropy: branch?.summary?.avgBranchEntropy || 0,
      worldElements: world?.summary.elements || 0,
      worldSettlements: world?.summary.settlements || 0,
      worldQuests: world?.summary.quests || 0
    }
  }
  blueprint.markdown = generateMarkdown(project, blueprint)
  return blueprint
}

export function generateMarkdown(project, bp) {
  const L = []
  const typeLabel = (t) => TYPE_LABEL[t] || t
  L.push(`# 《${bp.title}》走向蓝图`, '')
  if (bp.logline) L.push(`> ${bp.logline}`, '')
  L.push(`- 题材：${bp.genre || '未标注'}`)
  L.push(`- 基调：${bp.tone || '未标注'}`)
  L.push(`- 结构：${bp.summary.acts} 幕 / ${bp.summary.nodes} 节点 / ${bp.summary.choices} 抉择点 / ${bp.summary.endings} 结局 / ${bp.summary.routes} 条演算路径`)
  L.push(`- 平均张力：${bp.summary.avgTension} ｜ 平均路径长度：${bp.summary.avgPathLength} ｜ 分支熵：${bp.summary.entropy}`)
  L.push('')
  L.push('## 一、节奏曲线', '')
  L.push('```')
  L.push(bp.sparkline || '（无数据）')
  L.push('```')
  L.push('')
  L.push('| 幕 | 节点 | 抉择 | 对抗 | 结局 | 平均张力 | 目标 | 状态 |')
  L.push('| --- | --- | --- | --- | --- | --- | --- | --- |')
  for (const a of bp.acts) {
    const status = !a.nodeCount ? '⚠ 空幕' : a.tensionTarget && Math.abs(a.avgTension - a.tensionTarget) > 15 ? '△ 偏差' : '✓'
    L.push(`| ${a.name} | ${a.nodeCount} | ${a.choiceCount} | ${a.combatCount} | ${a.endingCount} | ${a.avgTension} | ${a.tensionTarget || '-'} | ${status} |`)
  }
  L.push('')
  L.push('## 二、分幕细纲', '')
  for (const a of bp.acts) {
    L.push(`### ${a.name}${a.goal ? ` — ${a.goal}` : ''}`, '')
    if (!a.nodes.length) L.push('_（暂无节点）_', '')
    for (const n of a.nodes.slice().sort((x, y) => (y.tension || 0) - (x.tension || 0))) {
      L.push(`- [${typeLabel(n.type)}｜张力 ${n.tension ?? '-'}] **${n.title}**${n.summary ? `：${n.summary}` : ''}`)
    }
    L.push('')
  }
  L.push('## 三、关键节拍（枢纽与高潮）', '')
  for (const b of bp.keyBeats) {
    L.push(`- ${b.title}（${typeLabel(b.type)}，${b.act || '未分幕'}）张力 ${b.tension}｜出口 ${b.fanout}｜入口 ${b.indegree}｜关键度 ${b.score}`)
  }
  L.push('')
  L.push('## 四、分支与结局覆盖', '')
  L.push('| 结局 | 幕 | 可达 | 路径数 | 概率质量 | 最短/最长路径 |')
  L.push('| --- | --- | --- | --- | --- | --- |')
  for (const r of bp.routeTable) {
    L.push(`| ${r.title} | ${r.act || '-'} | ${r.reachable ? '是' : '否'} | ${r.pathCount} | ${r.probability}% | ${r.minLength ?? '-'}/${r.maxLength ?? '-'} |`)
  }
  L.push('')
  if ((bp.warnings || []).length) {
    L.push('## 五、风险与修正建议', '')
    for (const w of bp.warnings) L.push(`- [${w.level === 'error' ? '严重' : w.level === 'warn' ? '警告' : '提示'}] ${w.message}`)
    L.push('')
  } else {
    L.push('## 五、风险与修正建议', '', '✓ 结构、节奏与分支均未发现风险。', '')
  }
  L.push('## 六、角色弧光', '')
  L.push('| 角色 | 定位 | 欲望 | 缺陷 | 起点 | 转折 | 终点 |')
  L.push('| --- | --- | --- | --- | --- | --- | --- |')
  for (const c of bp.arcs) {
    L.push(`| ${c.name} | ${c.role || '-'} | ${c.motivation || '-'} | ${c.flaw || '-'} | ${c.start || '-'} | ${c.midpoint || '-'} | ${c.end || '-'} |`)
  }
  L.push('')
  L.push('## 七、数值锚点（Lv1 / Lv5 / Lv10）', '')
  L.push(`| 角色 | HP | 攻击 | 防御 | 速度 | ${bp.numericAnchors[0]?.metricName || '指标'} |`)
  L.push('| --- | --- | --- | --- | --- | --- |')
  for (const n of bp.numericAnchors) {
    const fmt = (arr) => (arr ? arr.join(' / ') : '-')
    L.push(`| ${n.name} | ${fmt(n.hp)} | ${fmt(n.atk)} | ${fmt(n.def)} | ${fmt(n.spd)} | ${fmt(n.metric)} |`)
  }
  L.push('')
  if (bp.world) {
    const w = bp.world
    L.push('## 八、开放世界摘要', '')
    L.push(`- 世界：${w.summary.name} ｜ 元素 ${w.summary.elements} 个 ｜ 聚落 ${w.summary.settlements}（安全 ${w.summary.safeSettlements} / 敌对 ${w.summary.hostileSettlements} / 中立 ${w.summary.neutralSettlements}）`)
    L.push(`- NPC 对话 ${w.summary.dialogues} 条（其中针对特定角色 ${w.summary.specificDialogues} 条）｜ 任务 ${w.summary.quests} 个 ｜ 传送门 ${w.summary.validPortals}/${w.summary.portals} 可用`)
    L.push(`- 地图范围：${Math.round(w.bounds.width)} × ${Math.round(w.bounds.height)} 世界单位 ｜ 已放置角色 ${w.summary.linkedCharacters}/${(project.characters || []).length}`)
    L.push('')
    if (w.settlements.length) {
      L.push('| 聚落 | 阵营 | 敌对 | 安全区 | 增益 | 人口 | 附近 NPC |')
      L.push('| --- | --- | --- | --- | --- | --- | --- |')
      for (const s of w.settlements) {
        L.push(`| ${s.name} | ${s.faction || '-'} | ${s.hostile ? '是' : '否'} | ${s.safeZone ? '是' : '否'} | ${(s.buffs || []).join('、') || '-'} | ${s.population || '-'} | ${s.npcCount} |`)
      }
      L.push('')
    }
    if (w.quests.length) {
      L.push('### 任务派发', '')
      L.push('| 任务 | 发布者 | 目标数 | 奖励 | 状态 |')
      L.push('| --- | --- | --- | --- | --- |')
      for (const q of w.quests) L.push(`| ${q.title} | ${q.npc} | ${q.objectives} | ${q.reward || '-'} | ${q.status} |`)
      L.push('')
    }
    const worldRisks = w.warnings.filter((x) => x.level !== 'info')
    if (worldRisks.length) {
      L.push('### 世界待办', '')
      for (const r of worldRisks.slice(0, 8)) L.push(`- [${r.level === 'error' ? '严重' : '警告'}] ${r.message}`)
      L.push('')
    }
  }
  L.push('---')
  L.push(`_由 Game Story Studio 自动生成 · ${new Date().toISOString().slice(0, 10)}_`)
  return L.join('\n')
}
