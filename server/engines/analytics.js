/** 设计期分析：分支选择热力、结局分布、任务/对话覆盖与结构风险。纯函数。 */
import { analyze } from './branch.js'

const arr = (v) => (Array.isArray(v) ? v : [])

export function analytics(project = {}) {
  const branch = analyze(project.narrative || {}, { maxPaths: 4000 })
  const paths = arr(branch.paths)
  const total = paths.reduce((s, p) => s + (Number(p.probability) || 0), 0) || 1
  const nodeMap = new Map(arr(project.narrative?.nodes).map((n) => [n.id, n]))
  const edgeMap = new Map()
  for (const e of arr(project.narrative?.edges)) {
    if (!edgeMap.has(e.from)) edgeMap.set(e.from, [])
    edgeMap.get(e.from).push(e)
  }
  const choiceMap = new Map()
  for (const p of paths) {
    const weight = Number(p.probability) || 0
    const seq = arr(p.nodes).map((n) => (typeof n === 'string' ? n : n.id))
    for (let i = 0; i < seq.length - 1; i++) {
      const from = seq[i]
      const to = seq[i + 1]
      const edge = (edgeMap.get(from) || []).find((e) => e.to === to)
      const edgeId = edge?.id || `${from}->${to}`
      if (!choiceMap.has(from)) choiceMap.set(from, new Map())
      const bucket = choiceMap.get(from)
      const prev = bucket.get(edgeId) || { id: edgeId, label: edge?.label || '继续', to, count: 0, probability: 0, conditions: 0 }
      prev.count += 1
      prev.probability += weight / total
      if (edge?.condition?.expr) prev.conditions += 1
      bucket.set(edgeId, prev)
    }
  }
  const choices = [...choiceMap.entries()]
    .map(([nodeId, options]) => {
      const list = [...options.values()].map((o) => ({ ...o, probability: Math.round(o.probability * 1000) / 10 }))
      const sum = list.reduce((s, o) => s + o.probability, 0) || 1
      return {
        nodeId,
        title: nodeMap.get(nodeId)?.title || nodeId,
        act: nodeMap.get(nodeId)?.act || '',
        total: list.reduce((s, o) => s + o.count, 0),
        options: list.map((o) => ({ ...o, share: Math.round((o.probability / sum) * 1000) / 10 }))
      }
    })
    .sort((a, b) => b.total - a.total)

  const endings = arr(branch.endingStats).map((e) => ({
    id: e.id,
    title: e.title,
    reachable: e.reachable,
    pathCount: e.pathCount,
    probability: Math.round((e.probabilityMass || 0) * 1000) / 10
  }))
  const quests = []
  const dialogues = []
  for (const el of arr(project.world?.elements)) {
    for (const d of arr(el.data?.dialogues)) {
      dialogues.push({ id: d.id, npc: el.name, lines: arr(d.lines).length, choices: arr(d.choices).length, hasQuest: !!d.quest })
      if (d.quest) quests.push({ id: d.quest.id || `${el.id}:${d.id}`, title: d.quest.title, objectives: arr(d.quest.objectives).length, npc: el.name, status: d.quest.status || '未接取' })
    }
  }
  const riskyNodes = choices.filter((c) => c.options.some((o) => o.share > 85)).map((c) => ({ nodeId: c.nodeId, title: c.title, dominant: c.options.sort((a, b) => b.share - a.share)[0] }))
  return {
    summary: {
      nodes: branch.summary.nodeCount,
      edges: branch.summary.edgeCount,
      paths: branch.summary.pathCount,
      choiceNodes: branch.summary.choiceCount,
      endings: branch.summary.endingCount,
      endingsReachable: branch.summary.endingReachable,
      avgPathLength: branch.summary.avgPathLength,
      avgEntropy: branch.summary.avgBranchEntropy,
      quests: quests.length,
      dialogues: dialogues.length,
      dialogueLines: dialogues.reduce((s, d) => s + d.lines, 0),
      riskCount: branch.issues.filter((i) => i.level === 'error').length
    },
    choices,
    endings,
    quests,
    dialogues,
    issues: branch.issues,
    flags: branch.flags,
    tension: branch.tensionProfile,
    riskyNodes
  }
}
