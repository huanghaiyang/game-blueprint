/**
 * 分支演算：可达性、路径枚举、概率质量、环/死路检测、旗标依赖、枢纽中心度。
 * 全部为静态演算，不需要真实游玩。
 */
import { evaluate } from './expr.js'
import { round } from './stats.js'

function normalize(narrative) {
  const nodes = (narrative?.nodes || []).filter((n) => n && n.id)
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const edges = (narrative?.edges || [])
    .filter((e) => e && nodeMap.has(e.from) && nodeMap.has(e.to))
    .map((e) => ({
      id: e.id || `${e.from}->${e.to}`,
      from: e.from,
      to: e.to,
      label: e.label || '',
      type: e.type || 'linear',
      weight: Number.isFinite(Number(e.weight)) && Number(e.weight) > 0 ? Number(e.weight) : 1,
      condition: e.condition && e.condition.expr ? e.condition : null,
      effects: e.effects || {}
    }))
  const adj = new Map(nodes.map((n) => [n.id, []]))
  const incoming = new Map(nodes.map((n) => [n.id, []]))
  const dropped = []
  for (const e of narrative?.edges || []) {
    if (!nodeMap.has(e?.from) || !nodeMap.has(e?.to)) dropped.push(e)
  }
  for (const e of edges) {
    adj.get(e.from).push(e)
    incoming.get(e.to).push(e)
  }
  return { nodes, nodeMap, edges, adj, incoming, dropped, startId: narrative?.startId }
}

export function edgeWeightSum(edges) {
  return edges.reduce((s, e) => s + e.weight, 0)
}

/** 条件求值；缺省视为无条件通过。 */
export function edgePass(edge, flags = {}) {
  if (!edge?.condition?.expr) return { ok: true }
  try {
    const value = evaluate(edge.condition.expr, { ...flags, flags })
    return { ok: !!value, value }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

function tarjan(nodes, adj) {
  let index = 0
  const idx = new Map()
  const low = new Map()
  const stack = []
  const onStack = new Set()
  const sccs = []
  const visit = (v) => {
    idx.set(v, index)
    low.set(v, index)
    index++
    stack.push(v)
    onStack.add(v)
    for (const e of adj.get(v) || []) {
      const w = e.to
      if (!idx.has(w)) {
        visit(w)
        low.set(v, Math.min(low.get(v), low.get(w)))
      } else if (onStack.has(w)) {
        low.set(v, Math.min(low.get(v), idx.get(w)))
      }
    }
    if (low.get(v) === idx.get(v)) {
      const comp = []
      let w
      do {
        w = stack.pop()
        onStack.delete(w)
        comp.push(w)
      } while (w !== v)
      if (comp.length > 1) sccs.push(comp.reverse())
    }
  }
  for (const n of nodes) if (!idx.has(n.id)) visit(n.id)
  return sccs
}

/** Brandes 有向无权介数中心度。 */
function betweenness(nodes, adj) {
  const ids = nodes.map((n) => n.id)
  const CB = new Map(ids.map((id) => [id, 0]))
  for (const s of ids) {
    const S = []
    const P = new Map(ids.map((id) => [id, []]))
    const sigma = new Map(ids.map((id) => [id, 0]))
    const d = new Map(ids.map((id) => [id, -1]))
    sigma.set(s, 1)
    d.set(s, 0)
    const Q = [s]
    while (Q.length) {
      const v = Q.shift()
      S.push(v)
      for (const e of adj.get(v) || []) {
        const w = e.to
        if (d.get(w) < 0) {
          d.set(w, d.get(v) + 1)
          Q.push(w)
        }
        if (d.get(w) === d.get(v) + 1) {
          sigma.set(w, sigma.get(w) + sigma.get(v))
          P.get(w).push(v)
        }
      }
    }
    const delta = new Map(ids.map((id) => [id, 0]))
    for (let i = S.length - 1; i >= 0; i--) {
      const w = S[i]
      for (const v of P.get(w)) {
        if (sigma.get(w) > 0) delta.set(v, delta.get(v) + (sigma.get(v) / sigma.get(w)) * (1 + delta.get(w)))
      }
      if (w !== s) CB.set(w, CB.get(w) + delta.get(w))
    }
  }
  const max = Math.max(1, ...CB.values())
  return new Map([...CB.entries()].map(([k, v]) => [k, round(v / max, 3)]))
}

function entropy(edges) {
  const sum = edgeWeightSum(edges)
  if (!sum || edges.length <= 1) return 0
  return -edges.reduce((acc, e) => {
    const p = e.weight / sum
    return acc + (p > 0 ? p * Math.log2(p) : 0)
  }, 0)
}

const FLAG_READ_PATTERNS = [/flags\.([A-Za-z_$][\w$]*)/g, /has\(\s*flags\s*,\s*['"]([A-Za-z_$][\w$]*)['"]\s*\)/g]

export function flagsIn(expr) {
  const out = new Set()
  if (!expr) return out
  for (const re of FLAG_READ_PATTERNS) {
    re.lastIndex = 0
    let m
    while ((m = re.exec(expr))) out.add(m[1])
  }
  return out
}

export function analyze(narrative, options = {}) {
  const maxPaths = Math.max(1, Math.min(options.maxPaths || 4000, 20000))
  const g = normalize(narrative)
  const { nodes, nodeMap, adj, incoming, startId } = g
  const issues = []
  if (!startId || !nodeMap.has(startId)) issues.push({ level: 'error', code: 'BAD_START', message: '起始节点不存在，请先设置有效的 startId' })
  const start = nodeMap.has(startId) ? startId : nodes[0]?.id

  const reachable = new Set()
  if (start) {
    const Q = [start]
    reachable.add(start)
    while (Q.length) {
      const v = Q.shift()
      for (const e of adj.get(v) || []) {
        if (!reachable.has(e.to)) {
          reachable.add(e.to)
          Q.push(e.to)
        }
      }
    }
  }
  for (const n of nodes) if (!reachable.has(n.id)) issues.push({ level: 'warn', code: 'UNREACHABLE', nodeId: n.id, message: `节点「${n.title}」从起点不可达` })
  for (const e of g.dropped) issues.push({ level: 'error', code: 'DANGLING_EDGE', message: `连线 ${e?.from} → ${e?.to} 指向不存在的节点` })

  const cycles = tarjan(nodes, adj).map((comp) => comp.map((id) => nodeMap.get(id)?.title || id))
  for (const comp of cycles) issues.push({ level: 'warn', code: 'CYCLE', message: `检测到回路：${comp.join(' → ')}`, nodes: comp })
  const selfLoops = g.edges.filter((e) => e.from === e.to)
  for (const e of selfLoops) issues.push({ level: 'warn', code: 'SELF_LOOP', message: `节点「${nodeMap.get(e.from)?.title}」存在自环` })

  const deadEnds = []
  for (const id of reachable) {
    const node = nodeMap.get(id)
    if (!node) continue
    const out = adj.get(id) || []
    if (node.type === 'ending') {
      if (out.length) issues.push({ level: 'info', code: 'ENDING_HAS_EXIT', nodeId: id, message: `结局「${node.title}」仍有出口连线` })
      continue
    }
    if (!out.length) {
      deadEnds.push({ id, title: node.title, act: node.act, incoming: (incoming.get(id) || []).length })
      issues.push({ level: 'warn', code: 'DEAD_END', nodeId: id, message: `节点「${node.title}」没有出口且不是结局` })
    }
    if (node.type === 'choice' && out.length === 1) issues.push({ level: 'info', code: 'FAKE_CHOICE', nodeId: id, message: `选择点「${node.title}」只有一个出口，属于假选择` })
    if (out.length > 5) issues.push({ level: 'warn', code: 'BRANCH_EXPLOSION', nodeId: id, message: `节点「${node.title}」有 ${out.length} 个出口，分支数量偏高` })
  }

  // 路径枚举（简单路径，避免重复节点）
  const paths = []
  let truncated = false
  const walk = (id, trail, prob, flagState, depth) => {
    if (paths.length >= maxPaths) {
      truncated = true
      return
    }
    const node = nodeMap.get(id)
    const out = adj.get(id) || []
    const terminal = node.type === 'ending' || out.length === 0
    if (terminal) {
      paths.push({
        nodes: trail.slice(),
        probability: prob,
        ending: node.type === 'ending' ? id : null,
        endingTitle: node.type === 'ending' ? node.title : null,
        deadEnd: node.type !== 'ending',
        length: trail.length,
        flags: { ...flagState }
      })
      return
    }
    if (depth > (options.maxDepth || 60)) {
      truncated = true
      return
    }
    const sum = edgeWeightSum(out)
    for (const e of out) {
      if (trail.includes(e.to)) continue // 不重复节点的简单路径
      const pass = edgePass(e, flagState)
      if (e.condition && !pass.ok) continue
      const nextFlags = applyEffectsToFlags(flagState, e)
      walk(e.to, [...trail, e.to], prob * (e.weight / sum), nextFlags, depth + 1)
    }
  }
  if (start) walk(start, [start], 1, {}, 1)

  const endings = nodes.filter((n) => n.type === 'ending')
  const endingStats = endings.map((n) => {
    const hit = paths.filter((p) => p.ending === n.id)
    return {
      id: n.id,
      title: n.title,
      act: n.act,
      reachable: hit.length > 0,
      pathCount: hit.length,
      probabilityMass: round(hit.reduce((s, p) => s + p.probability, 0), 4),
      minLength: hit.length ? Math.min(...hit.map((p) => p.length)) : null,
      maxLength: hit.length ? Math.max(...hit.map((p) => p.length)) : null
    }
  })
  for (const e of endingStats) {
    if (!e.reachable) issues.push({ level: 'warn', code: 'UNREACHABLE_ENDING', message: `结局「${e.title}」无法通过任何可用路径到达` })
    if (e.reachable && e.probabilityMass < 0.02) issues.push({ level: 'info', code: 'RARE_ENDING', message: `结局「${e.title}」概率质量仅 ${(e.probabilityMass * 100).toFixed(1)}%，可能过于隐蔽` })
  }

  // 旗标依赖
  const flagsWritten = new Map()
  const flagsRead = new Map()
  const addFlag = (map, key, ref) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(ref)
  }
  for (const n of nodes) {
    for (const f of n.setFlags || []) addFlag(flagsWritten, typeof f === 'string' ? f : f.key, { nodeId: n.id, title: n.title })
  }
  for (const e of g.edges) {
    for (const f of Object.keys(e.effects?.flags || {})) addFlag(flagsWritten, f, { edgeId: e.id, title: `${nodeMap.get(e.from)?.title} → ${nodeMap.get(e.to)?.title}` })
    for (const f of flagsIn(e.condition?.expr)) addFlag(flagsRead, f, { edgeId: e.id, title: `${nodeMap.get(e.from)?.title} → ${nodeMap.get(e.to)?.title}` })
  }
  const flagReport = []
  for (const [flag, reads] of flagsRead) {
    const writes = flagsWritten.get(flag) || []
    if (!writes.length) issues.push({ level: 'error', code: 'FLAG_NEVER_SET', message: `条件读取了旗标「${flag}」，但没有任何节点或选项会写入它` })
    flagReport.push({ flag, readBy: reads.length, writtenBy: writes.length, writes, reads })
  }
  for (const [flag, writes] of flagsWritten) {
    if (!flagsRead.has(flag)) {
      issues.push({ level: 'info', code: 'FLAG_NEVER_READ', message: `旗标「${flag}」被写入但从未被读取，可能是冗余设计` })
      flagReport.push({ flag, readBy: 0, writtenBy: writes.length, writes, reads: [] })
    }
  }

  // 中心度
  const centrality = betweenness(nodes, adj)
  const hubs = [...centrality.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([id, score]) => ({
      id,
      title: nodeMap.get(id)?.title,
      act: nodeMap.get(id)?.act,
      score,
      fanout: (adj.get(id) || []).length,
      indegree: (incoming.get(id) || []).length
    }))
    .filter((h) => h.score > 0)

  // 分支熵
  const choiceNodes = nodes.filter((n) => (adj.get(n.id) || []).length > 1)
  const branchEntropy = choiceNodes.map((n) => ({
    id: n.id,
    title: n.title,
    fanout: adj.get(n.id).length,
    entropy: round(entropy(adj.get(n.id)), 3)
  }))
  const avgEntropy = branchEntropy.length ? round(branchEntropy.reduce((s, x) => s + x.entropy, 0) / branchEntropy.length, 3) : 0

  // 张力分布
  const depthMap = new Map()
  if (start) {
    const Q = [[start, 0]]
    depthMap.set(start, 0)
    while (Q.length) {
      const [v, d] = Q.shift()
      for (const e of adj.get(v) || []) {
        if (!depthMap.has(e.to)) {
          depthMap.set(e.to, d + 1)
          Q.push([e.to, d + 1])
        }
      }
    }
  }
  const tensionProfile = nodes
    .filter((n) => depthMap.has(n.id))
    .map((n) => ({ id: n.id, title: n.title, depth: depthMap.get(n.id), tension: Number(n.tension) || 0, type: n.type }))
    .sort((a, b) => a.depth - b.depth || a.title.localeCompare(b.title))

  const pathLengths = paths.map((p) => p.length)
  const summary = {
    nodeCount: nodes.length,
    edgeCount: g.edges.length,
    reachableCount: reachable.size,
    pathCount: paths.length,
    truncated,
    endingCount: endings.length,
    endingReachable: endingStats.filter((e) => e.reachable).length,
    avgPathLength: pathLengths.length ? round(pathLengths.reduce((a, b) => a + b, 0) / pathLengths.length, 2) : 0,
    minPathLength: pathLengths.length ? Math.min(...pathLengths) : 0,
    maxPathLength: pathLengths.length ? Math.max(...pathLengths) : 0,
    deadEndCount: deadEnds.length,
    cycleCount: cycles.length,
    choiceCount: choiceNodes.length,
    avgBranchEntropy: avgEntropy
  }

  return {
    summary,
    issues,
    reachability: {
      reachable: [...reachable].map((id) => ({ id, title: nodeMap.get(id)?.title })),
      unreachable: nodes.filter((n) => !reachable.has(n.id)).map((n) => ({ id: n.id, title: n.title, act: n.act }))
    },
    paths: paths
      .slice()
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 40)
      .map((p) => ({
        ...p,
        nodes: p.nodes.map((id) => ({ id, title: nodeMap.get(id)?.title, type: nodeMap.get(id)?.type, act: nodeMap.get(id)?.act }))
      })),
    endingStats,
    flags: flagReport.sort((a, b) => b.readBy - a.readBy),
    cycles,
    deadEnds,
    hubs,
    branchEntropy: branchEntropy.sort((a, b) => b.entropy - a.entropy),
    tensionProfile,
    nodes: nodes.map((n) => ({
      id: n.id,
      title: n.title,
      type: n.type,
      act: n.act,
      tension: n.tension,
      fanout: (adj.get(n.id) || []).length,
      indegree: (incoming.get(n.id) || []).length,
      reachable: reachable.has(n.id)
    })),
    edges: g.edges
  }
}

function applyEffectsToFlags(flags, edge) {
  const next = { ...flags }
  const set = edge?.effects?.flags || {}
  for (const [k, v] of Object.entries(set)) next[k] = v
  return next
}

/** 逐步演算一条指定路线（edge id 序列），返回状态轨迹。 */
export function simulateRoute(narrative, edgeIds = []) {
  const g = normalize(narrative)
  const { nodeMap, adj } = g
  let current = g.startId
  if (!current || !nodeMap.has(current)) return { ok: false, error: '起始节点无效' }
  const steps = []
  const flags = {}
  let i = 0
  let guard = 0
  while (guard++ < 200) {
    const out = adj.get(current) || []
    if (!out.length) break
    const wanted = i < edgeIds.length ? out.find((e) => e.id === edgeIds[i]) : null
    const edge = wanted || null
    if (!edge) {
      steps.push({ type: 'stop', node: current, title: nodeMap.get(current)?.title, reason: '没有指定下一步或指定连线不存在，演算结束', options: out.map(optionOf) })
      break
    }
    const pass = edgePass(edge, flags)
    if (!pass.ok) {
      steps.push({ type: 'blocked', node: current, title: nodeMap.get(current)?.title, edge: optionOf(edge), reason: `条件不满足：${edge.condition?.label || edge.condition?.expr}`, flags: { ...flags } })
      break
    }
    Object.assign(flags, edge.effects?.flags || {})
    steps.push({
      type: 'step',
      from: current,
      to: edge.to,
      title: nodeMap.get(edge.to)?.title,
      edge: optionOf(edge),
      flags: { ...flags },
      stats: edge.effects?.stats || null
    })
    current = edge.to
    i++
    if (nodeMap.get(current)?.type === 'ending') {
      steps.push({ type: 'ending', node: current, title: nodeMap.get(current)?.title, flags: { ...flags } })
      break
    }
  }
  return { ok: true, start: g.startId, finalNode: current, title: nodeMap.get(current)?.title, flags, steps }
}

function optionOf(e) {
  return { id: e.id, to: e.to, label: e.label, condition: e.condition, weight: e.weight, effects: e.effects }
}
