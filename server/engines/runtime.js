/** 叙事运行时：把企划快照编译为可试玩的状态机，支持旗标、条件、任务状态与存档。 */
import { check } from './expr.js'

const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

export function buildRuntime(project = {}) {
  const narrative = project.narrative || {}
  const nodes = arr(narrative.nodes).map((n) => ({
    id: n.id,
    title: n.title || n.id,
    type: n.type || 'scene',
    act: n.act || '',
    tension: Number(n.tension) || 0,
    summary: n.summary || '',
    text: n.text || '',
    setFlags: arr(n.setFlags),
    choices: arr(narrative.edges)
      .filter((e) => e.from === n.id)
      .map((e) => ({
        id: e.id,
        from: e.from,
        to: e.to,
        label: e.label || '继续',
        type: e.type || 'linear',
        weight: Number(e.weight) || 1,
        condition: e.condition || null,
        effects: {
          flags: obj(e.effects?.flags),
          quests: obj(e.effects?.quests)
        }
      }))
  }))
  const quests = []
  for (const el of arr(project.world?.elements)) {
    for (const d of arr(el.data?.dialogues)) {
      if (!d.quest) continue
      quests.push({
        id: d.quest.id || `${el.id}:${d.id}:quest`,
        title: d.quest.title || '未命名任务',
        summary: d.quest.summary || '',
        objectives: arr(d.quest.objectives).map((o, i) => ({ id: `o${i + 1}`, text: typeof o === 'string' ? o : o?.text || '', done: !!o?.done })),
        reward: d.quest.reward || '',
        npc: el.name,
        elementId: el.id,
        dialogueId: d.id,
        sourceStatus: d.quest.status || '未接取'
      })
    }
  }
  const dialogues = []
  for (const el of arr(project.world?.elements)) {
    for (const d of arr(el.data?.dialogues)) {
      dialogues.push({
        id: d.id,
        elementId: el.id,
        npc: el.name,
        name: d.name || '对话',
        audienceIds: arr(d.audienceIds),
        lines: arr(d.lines).map((l, i) => ({ id: `${el.id}:${d.id}:line:${i}`, speaker: l.speaker || el.name, text: l.text || '' })),
        choices: arr(d.choices).map((c, i) => ({ id: `${el.id}:${d.id}:choice:${i}`, label: c.label || '回应', response: c.response || '' })),
        quest: d.quest || null
      })
    }
  }
  return {
    projectId: project.id,
    projectName: project.name,
    startId: narrative.startId || nodes[0]?.id || null,
    nodes,
    start: nodes.find((n) => n.id === (narrative.startId || nodes[0]?.id)) || nodes[0] || null,
    endings: nodes.filter((n) => n.type === 'ending').map((n) => ({ id: n.id, title: n.title, summary: n.summary })),
    characters: arr(project.characters).map((c) => ({ id: c.id, name: c.name, color: c.color || '#7dd3fc' })),
    quests,
    dialogues,
    access: project.access || {},
    contentWarnings: arr(project.access?.contentWarnings),
    counts: { nodes: nodes.length, edges: arr(narrative.edges).length, endings: nodes.filter((n) => n.type === 'ending').length, quests: quests.length, dialogues: dialogues.length }
  }
}

export function evaluate(condition, state) {
  if (!condition?.expr) return { ok: true }
  try {
    const r = check(condition.expr, { flags: state.flags || {}, stats: state.stats || {} })
    return { ok: !!r.ok && !!r.value, error: r.error || '', label: condition.label || '' }
  } catch (error) {
    return { ok: false, error: error.message, label: condition.label || '' }
  }
}

export function nodeView(node, state) {
  if (!node) return null
  const choices = node.choices.map((c) => {
    const gate = evaluate(c.condition, state)
    return {
      id: c.id,
      label: c.label,
      to: c.to,
      type: c.type,
      enabled: gate.ok,
      reason: gate.ok ? '' : gate.error || gate.label || '条件未满足',
      condition: c.condition
    }
  })
  return {
    id: node.id,
    title: node.title,
    type: node.type,
    act: node.act,
    tension: node.tension,
    summary: node.summary,
    text: node.text,
    choices: choices.filter((c) => c.enabled),
    locked: choices.filter((c) => !c.enabled),
    ending: node.type === 'ending'
  }
}

function applyEffects(state, effects) {
  for (const [k, v] of Object.entries(obj(effects?.flags))) state.flags[k] = v
  for (const [id, status] of Object.entries(obj(effects?.quests))) {
    if (!state.quests[id]) state.quests[id] = { status: '未接取', objectives: [] }
    state.quests[id].status = status
  }
}

function enterNode(node, state) {
  if (!node) return
  state.nodeId = node.id
  if (!state.visited.includes(node.id)) state.visited.push(node.id)
  for (const flag of arr(node.setFlags)) state.flags[flag] = true
  if (node.type === 'ending') state.ended = true
  state.log.push({ type: 'node', id: node.id, title: node.title, at: new Date().toISOString() })
}

export function startRuntime(project, { startId = '', flags = {} } = {}) {
  const runtime = buildRuntime(project)
  const start = runtime.nodes.find((n) => n.id === (startId || runtime.startId)) || runtime.start
  const state = {
    nodeId: start?.id || null,
    flags: { ...obj(flags) },
    stats: {},
    visited: [],
    quests: Object.fromEntries(runtime.quests.map((q) => [q.id, { status: q.sourceStatus || '未接取', objectives: q.objectives.map((o) => o.id) }])),
    log: [],
    ended: false,
    startedAt: new Date().toISOString()
  }
  enterNode(start, state)
  return { runtime, state, view: nodeView(start, state) }
}

export function stepRuntime(project, state, edgeId) {
  const runtime = buildRuntime(project)
  const node = runtime.nodes.find((n) => n.id === state.nodeId)
  if (!node) throw Object.assign(new Error('当前节点不存在'), { status: 400 })
  if (state.ended) throw Object.assign(new Error('故事已结束'), { status: 400 })
  const edge = node.choices.find((c) => c.id === edgeId)
  if (!edge) throw Object.assign(new Error('该选项不存在或不属于当前节点'), { status: 400 })
  const gate = evaluate(edge.condition, state)
  if (!gate.ok) throw Object.assign(new Error(gate.error || gate.label || '条件未满足'), { status: 409 })
  applyEffects(state, edge.effects)
  state.log.push({ type: 'choice', id: edge.id, label: edge.label, at: new Date().toISOString() })
  const next = runtime.nodes.find((n) => n.id === edge.to)
  if (!next) throw Object.assign(new Error(`目标节点 ${edge.to} 不存在`), { status: 400 })
  enterNode(next, state)
  return { runtime, state, view: nodeView(next, state) }
}
