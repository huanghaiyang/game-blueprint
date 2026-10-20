/** MCP 工具定义与处理函数。所有写操作都通过本地 Game Story API 保存。 */
import { analyzeWorld, blueprintMarkdown, getProject, listProjects, mutateProject, resolveProjectId, ApiError } from './api.mjs'

const TYPE = {
  settlement: { label: '聚落', color: '#67e8f9', radius: 220, data: { faction: '', population: 0, hostile: false, safeZone: true, services: [], buffs: [], notes: '' } },
  character: { label: '角色 / NPC', color: '#f0abfc', data: { characterId: null, player: false, faction: '', level: 1, hostile: false, dialogues: [] } },
  stronghold: { label: '重要据点', color: '#c084fc', data: { faction: '', level: 1, defense: 0, narrativeNodeId: '' } },
  building: { label: '建筑', color: '#fbbf24', data: { function: '民居', owner: '', narrativeNodeId: '' } },
  region: { label: '特殊区域', color: '#4ade80', radius: 320, data: { regionType: '森林', danger: 1, effect: '' } },
  collectible: { label: '收集物品', color: '#fde68a', data: { itemName: '新物品', rarity: '普通', amount: 1, respawn: false } },
  bulletin: { label: '公告栏', color: '#fbbf24', data: { posts: [] } },
  sign: { label: '路引', color: '#fbbf24', data: { direction: '→', destination: '', distance: 0 } },
  portal: { label: '传送门', color: '#67e8f9', data: { targetId: '', requirement: '', twoWay: true } },
  river: { label: '河流', color: '#38bdf8', path: true, data: { width: 22 } },
  mountain: { label: '山川', color: '#94a3b8', radius: 150, data: { peaks: 3, danger: 1 } },
  tree: { label: '树木', color: '#4ade80', data: { species: '雾松', height: 16 } },
  road: { label: '道路', color: '#a8a29e', path: true, data: { width: 7 } }
}
const TYPE_NAMES = Object.keys(TYPE)
const QUEST_STATUS = ['未接取', '进行中', '已完成', '已失败']

function ok(text, structured) {
  return { text, structured }
}

function newId(prefix = 'w') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

function assert(condition, message) {
  if (!condition) throw new ApiError(message, 400)
}

function numberField(value, label, { integer = false } = {}) {
  const n = Number(value)
  assert(Number.isFinite(n), `${label} 必须是有效数字`)
  return integer ? Math.round(n) : n
}

function findElement(project, idOrName, type = null) {
  const list = project.world?.elements || []
  const byId = list.find((e) => e.id === idOrName)
  if (byId) {
    if (type) assert(byId.type === type, `元素 ${byId.id} 不是 ${TYPE[type]?.label || type}（实际：${TYPE[byId.type]?.label || byId.type}）`)
    return byId
  }
  const matches = list.filter((e) => String(e.name) === String(idOrName) && (!type || e.type === type))
  assert(matches.length > 0, `找不到元素：${idOrName}${type ? `（类型 ${TYPE[type]?.label || type}）` : ''}。可用 id 可通过 world_list_elements 查询。`)
  assert(matches.length === 1, `名称「${idOrName}」匹配到多个元素，请改用 elementId：${matches.map((e) => e.id).join('、')}`)
  return matches[0]
}

function ensureShape(el) {
  el.data = el.data || {}
  const defaults = structuredClone(TYPE[el.type]?.data || {})
  for (const [k, v] of Object.entries(defaults)) if (el.data[k] === undefined) el.data[k] = v
  if (TYPE[el.type]?.radius && el.radius == null) el.radius = TYPE[el.type].radius
  if (TYPE[el.type]?.path && !Array.isArray(el.points)) el.points = []
  if (el.type === 'character' && !Array.isArray(el.data.dialogues)) el.data.dialogues = []
  if (el.type === 'settlement') {
    if (!Array.isArray(el.data.buffs)) el.data.buffs = []
    else {
      el.data.buffs = el.data.buffs.map((b) =>
        typeof b === 'string' ? { name: b, desc: '' } : { name: String(b?.name || '增益'), desc: String(b?.desc || '') }
      )
    }
    if (!Array.isArray(el.data.services)) el.data.services = []
    else el.data.services = el.data.services.map((s) => String(s)).filter(Boolean)
    el.data.hostile = !!el.data.hostile
    el.data.safeZone = !!el.data.safeZone
  }
  if (el.type === 'bulletin' && !Array.isArray(el.data.posts)) el.data.posts = []
  return el
}

function summary(el) {
  return {
    id: el.id,
    type: el.type,
    typeLabel: TYPE[el.type]?.label || el.type,
    name: el.name,
    x: el.x,
    y: el.y,
    radius: el.radius,
    color: el.color,
    points: el.points,
    data: el.data
  }
}

function short(el) {
  return {
    id: el.id,
    type: el.type,
    typeLabel: TYPE[el.type]?.label || el.type,
    name: el.name,
    x: el.x,
    y: el.y,
    radius: el.radius,
    points: el.points?.length
  }
}

function normalizePoints(points, label = 'points') {
  assert(Array.isArray(points) && points.length >= 2, `${label} 至少需要两个点，格式 [{x,y}, ...]`)
  return points.map((p, i) => {
    const x = Number(p?.x)
    const y = Number(p?.y)
    assert(Number.isFinite(x) && Number.isFinite(y), `${label}[${i}] 缺少有效 x/y`)
    return { x, y }
  })
}

function normalizeBuffs(buffs) {
  assert(Array.isArray(buffs), 'buffs 必须是数组，元素为 {name,desc} 或字符串')
  return buffs.map((b, i) => {
    if (typeof b === 'string') return { name: b, desc: '' }
    assert(b && typeof b === 'object' && b.name, `buffs[${i}].name 不能为空`)
    return { name: String(b.name), desc: String(b.desc || '') }
  })
}

function normalizeServices(services) {
  assert(Array.isArray(services), 'services 必须是字符串数组')
  return services.map((s) => String(s)).filter(Boolean)
}

function resolveAudience(project, audience) {
  const chars = project.characters || []
  if (audience == null) return { ids: [], names: [] }
  assert(Array.isArray(audience), 'audience 必须是角色名或角色 id 的数组；空数组表示所有人')
  const ids = []
  const names = []
  for (const item of audience) {
    const key = String(item)
    const found = chars.find((c) => c.id === key) || chars.find((c) => String(c.name) === key)
    assert(found, `未知角色：${key}。可用角色：${chars.map((c) => `${c.name}(${c.id})`).join('、') || '（当前企划没有角色卡）'}`)
    if (!ids.includes(found.id)) {
      ids.push(found.id)
      names.push(found.name)
    }
  }
  return { ids, names }
}

function normalizeQuest(quest, fallbackTitle) {
  if (!quest) return null
  assert(typeof quest === 'object', 'quest 必须是对象')
  const title = String(quest.title || fallbackTitle || '新任务').trim()
  assert(title, 'quest.title 不能为空')
  const objectives = (Array.isArray(quest.objectives) ? quest.objectives : []).map((o, i) => {
    if (typeof o === 'string') return { text: o, done: false }
    assert(o && o.text, `quest.objectives[${i}].text 不能为空`)
    return { text: String(o.text), done: !!o.done }
  })
  return {
    id: quest.id || newId('q'),
    title,
    summary: String(quest.summary || ''),
    objectives,
    reward: String(quest.reward || ''),
    status: QUEST_STATUS.includes(quest.status) ? quest.status : '未接取'
  }
}

function normalizeDialogue(project, el, args) {
  const lines = (args.lines || []).map((l, i) => {
    assert(l && typeof l.text === 'string' && l.text.trim(), `lines[${i}].text 不能为空`)
    return { speaker: String(l.speaker || el.name || 'NPC'), text: l.text }
  })
  assert(lines.length > 0, 'lines 至少需要一句台词')
  const choices = (args.choices || []).map((c, i) => {
    assert(c && c.label, `choices[${i}].label 不能为空`)
    return { label: String(c.label), response: String(c.response || '') }
  })
  const { ids, names } = resolveAudience(project, args.audience)
  return {
    id: args.dialogueId || newId('d'),
    name: String(args.name || '新对话'),
    audienceIds: ids,
    lines,
    choices,
    quest: normalizeQuest(args.quest, args.name)
  }
}

function findDialogue(el, dialogueId) {
  if (!dialogueId) return null
  return (el.data.dialogues || []).find((d) => d.id === dialogueId) || null
}

/* ---------------- 工具定义 ---------------- */

export const TOOLS = [
  {
    name: 'api_status',
    description: '检查本地 Game Story API 是否可达，并返回企划数量与 API 地址。任何写操作前可先调用。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'project_list',
    description: '列出本地所有企划的 id、名称、模块、节点/角色/世界元素数量。用于取得 projectId。',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
  },
  {
    name: 'project_get',
    description: '读取单个企划摘要：模块、角色、剧情节点、世界概况。includeFull=true 时返回完整 project（较大，通常优先用 world_get）。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划 proj-mist-harbor（否则第一个企划）' },
        includeFull: { type: 'boolean', description: '是否返回完整 project JSON，默认 false' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'world_get',
    description: '读取世界地图完整数据：世界名、比例尺、全部元素（含 data）、角色与剧情节点索引。写操作前用它确认 elementId 和现有字段。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' },
        includeAnalysis: { type: 'boolean', description: '是否同时运行世界体检并返回告警，默认 false' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'world_list_elements',
    description: '按类型或名称过滤地图元素，返回紧凑列表（id、类型、名称、坐标、半径、路径点数）。适合先定位 elementId，再读 world_get。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' },
        type: { type: 'string', enum: TYPE_NAMES, description: '只看某一类型' },
        search: { type: 'string', description: '名称/角色 id 的子串，不区分大小写' },
        limit: { type: 'integer', minimum: 1, maximum: 200, description: '最多返回条数，默认 50' },
        offset: { type: 'integer', minimum: 0, description: '跳过条数，默认 0' }
      },
      additionalProperties: false
    }
  },
  {
    name: 'world_add_element',
    description: '在地图上放置一个元素并保存。河流/道路可传绝对坐标 points，内部转为相对点；不传则生成两点路径。返回新元素 id 与完整元素。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' },
        type: { type: 'string', enum: TYPE_NAMES, description: '元素类型' },
        x: { type: 'number', description: '世界坐标 X；路径元素通常取第一个点' },
        y: { type: 'number', description: '世界坐标 Y；路径元素通常取第一个点' },
        name: { type: 'string', description: '显示名称；省略时用「新 + 类型」' },
        color: { type: 'string', description: '十六进制颜色，如 #67e8f9；省略时用类型默认色' },
        radius: { type: 'number', minimum: 0, description: '区域半径（聚落/区域/山川），省略时用默认值' },
        points: {
          type: 'array',
          items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false },
          description: '河流/道路的绝对世界坐标控制点，至少 2 个'
        },
        data: { type: 'object', description: '类型专属字段，与默认值合并；例如聚落 {hostile,safeZone,buffs}、NPC {characterId,level,dialogues}' }
      },
      required: ['type', 'x', 'y'],
      additionalProperties: false
    }
  },
  {
    name: 'world_update_element',
    description: '更新地图元素的名称、坐标、颜色、半径、路径或 data（shallow merge）。至少提供一个变更字段；元素类型不可修改。返回变更后的元素。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' },
        elementId: { type: 'string', description: '元素 id（优先）或唯一名称' },
        name: { type: 'string', description: '新名称' },
        x: { type: 'number', description: '新世界坐标 X' },
        y: { type: 'number', description: '新世界坐标 Y' },
        color: { type: 'string', description: '新十六进制颜色' },
        radius: { type: 'number', minimum: 0, description: '新区域半径' },
        points: {
          type: 'array',
          items: { type: 'object', properties: { x: { type: 'number' }, y: { type: 'number' } }, required: ['x', 'y'], additionalProperties: false },
          description: '绝对世界坐标的新路径控制点（至少 2 个），用于河流/道路'
        },
        data: { type: 'object', description: '要浅合并进 data 的字段；数组会整体替换' },
        replaceData: { type: 'boolean', description: 'true 时用 data 完全替换旧 data，默认 false' }
      },
      required: ['elementId'],
      additionalProperties: false
    }
  },
  {
    name: 'world_remove_element',
    description: '删除地图元素并保存。返回被删除元素的 id/名称与剩余数量。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' },
        elementId: { type: 'string', description: '元素 id（优先）或唯一名称' }
      },
      required: ['elementId'],
      additionalProperties: false
    }
  },
  {
    name: 'world_set_settlement',
    description: '设置聚落状态：敌对、安全区、阵营、人口、服务、增益、半径/坐标。若最终同时敌对且安全区，会自动把安全区置为 false。返回聚落最新状态。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' },
        elementId: { type: 'string', description: '聚落元素 id（优先）或唯一名称' },
        hostile: { type: 'boolean', description: '是否敌对' },
        safeZone: { type: 'boolean', description: '是否安全区；会被敌对状态自动覆盖为 false' },
        faction: { type: 'string', description: '阵营' },
        population: { type: 'number', minimum: 0, description: '人口' },
        services: { type: 'array', items: { type: 'string' }, description: '服务设施名称列表' },
        buffs: {
          type: 'array',
          description: '增益列表，可传字符串或 {name,desc}',
          items: { oneOf: [{ type: 'string' }, { type: 'object', properties: { name: { type: 'string' }, desc: { type: 'string' } }, required: ['name'], additionalProperties: false }] }
        },
        notes: { type: 'string', description: '备注' },
        radius: { type: 'number', minimum: 0, description: '范围半径' },
        x: { type: 'number', description: '世界坐标 X' },
        y: { type: 'number', description: '世界坐标 Y' }
      },
      required: ['elementId'],
      additionalProperties: false
    }
  },
  {
    name: 'world_set_npc_dialogue',
    description: '给地图 NPC 添加或替换一段对话，可带特定可见对象、分支选项与任务派发。audience 为空表示所有人；dialogueId 已存在时替换该段，否则新增。返回对话与任务。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' },
        elementId: { type: 'string', description: 'NPC 元素 id（优先）或唯一名称' },
        dialogueId: { type: 'string', description: '要替换的对话 id；省略或不存在时新增' },
        name: { type: 'string', description: '对话名称，默认「新对话」' },
        audience: {
          type: 'array',
          items: { type: 'string' },
          description: '可见角色：角色名或角色 id 数组；空数组/省略表示所有人可见'
        },
        lines: {
          type: 'array',
          minItems: 1,
          items: {
            type: 'object',
            properties: { speaker: { type: 'string' }, text: { type: 'string' } },
            required: ['text'],
            additionalProperties: false
          },
          description: '台词；speaker 省略时用 NPC 名称'
        },
        choices: {
          type: 'array',
          items: {
            type: 'object',
            properties: { label: { type: 'string' }, response: { type: 'string' } },
            required: ['label'],
            additionalProperties: false
          },
          description: '分支选项：玩家看到的 label + NPC 回应 response'
        },
        quest: {
          type: 'object',
          description: '任务派发；省略则不挂任务',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            summary: { type: 'string' },
            objectives: { type: 'array', items: { oneOf: [{ type: 'string' }, { type: 'object', properties: { text: { type: 'string' }, done: { type: 'boolean' } }, required: ['text'], additionalProperties: false }] } },
            reward: { type: 'string' },
            status: { type: 'string', enum: QUEST_STATUS }
          },
          additionalProperties: false
        }
      },
      required: ['elementId', 'lines'],
      additionalProperties: false
    }
  },
  {
    name: 'world_analyze',
    description: '运行开放世界体检，返回统计、聚落状态、任务/对话覆盖、传送门有效性与引用告警。只读。',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' } },
      additionalProperties: false
    }
  },
  {
    name: 'blueprint_markdown',
    description: '生成当前企划的走向蓝图 Markdown（含开放世界摘要、结构风险、角色弧光与数值锚点）。只读。',
    inputSchema: {
      type: 'object',
      properties: { projectId: { type: 'string', description: '企划 id 或名称；省略时使用演示企划' } },
      additionalProperties: false
    }
  }
]

/* ---------------- 处理函数 ---------------- */

const handlers = {
  async api_status() {
    const projects = await listProjects()
    return ok(`API 正常：${projects.length} 个企划。`, { ok: true, api: process.env.GAME_STORY_API || 'http://127.0.0.1:3087', projects: projects.map((p) => ({ id: p.id, name: p.name, revision: p.revision })) })
  },

  async project_list() {
    const projects = await listProjects()
    return ok(`共 ${projects.length} 个企划。`, { projects })
  },

  async project_get(args) {
    const rec = await getProject(args.projectId)
    const p = rec.project
    const summary = {
      id: rec.id,
      revision: rec.revision,
      name: p.name,
      meta: p.meta,
      counts: {
        characters: p.characters?.length || 0,
        nodes: p.narrative?.nodes?.length || 0,
        edges: p.narrative?.edges?.length || 0,
        worldElements: p.world?.elements?.length || 0,
        cases: p.cases?.length || 0
      },
      characters: (p.characters || []).map((c) => ({ id: c.id, name: c.name, role: c.role })),
      narrativeNodes: (p.narrative?.nodes || []).map((n) => ({ id: n.id, title: n.title, type: n.type })),
      world: { name: p.world?.name || '', scaleLabel: p.world?.scaleLabel || '', elements: p.world?.elements?.length || 0 }
    }
    if (args.includeFull) summary.project = p
    return ok(`企划「${p.name}」：${summary.counts.worldElements} 个世界元素、${summary.counts.nodes} 个剧情节点、${summary.counts.characters} 个角色。`, summary)
  },

  async world_get(args) {
    const rec = await getProject(args.projectId)
    const p = rec.project
    const result = {
      projectId: rec.id,
      revision: rec.revision,
      name: p.name,
      modules: p.meta?.modules || {},
      world: p.world,
      characters: (p.characters || []).map((c) => ({ id: c.id, name: c.name, role: c.role })),
      narrativeNodes: (p.narrative?.nodes || []).map((n) => ({ id: n.id, title: n.title, type: n.type }))
    }
    if (args.includeAnalysis) result.analysis = await analyzeWorld(rec.id)
    return ok(`世界「${p.world?.name || '未命名'}」：${p.world?.elements?.length || 0} 个元素。`, result)
  },

  async world_list_elements(args) {
    const rec = await getProject(args.projectId)
    const q = String(args.search || '').toLowerCase()
    const all = (rec.project.world?.elements || [])
      .filter((e) => !args.type || e.type === args.type)
      .filter((e) => !q || `${e.name} ${e.id} ${e.data?.characterId || ''}`.toLowerCase().includes(q))
    const offset = Number(args.offset || 0)
    const limit = Math.min(200, Math.max(1, Number(args.limit || 50)))
    const items = all.slice(offset, offset + limit).map(short)
    return ok(`匹配 ${all.length} 个元素，返回 ${items.length} 个。`, { projectId: rec.id, total: all.length, offset, limit, elements: items })
  },

  async world_add_element(args) {
    const type = args.type
    assert(TYPE[type], `未知元素类型：${type}。可用：${TYPE_NAMES.join('、')}`)
    const meta = TYPE[type]
    const id = newId('w')
    const x = numberField(args.x, 'x')
    const y = numberField(args.y, 'y')
    const result = await mutateProject(args.projectId, (project) => {
      const el = {
        id,
        type,
        name: String(args.name || `新${meta.label}`),
        x,
        y,
        color: String(args.color || meta.color),
        data: { ...structuredClone(meta.data), ...(args.data || {}) }
      }
      if (meta.radius) el.radius = args.radius == null ? meta.radius : numberField(args.radius, 'radius')
      if (meta.path) {
        const abs = args.points ? normalizePoints(args.points) : [{ x, y }, { x: x + 160, y: y + 60 }]
        el.points = abs.map((p) => ({ x: p.x - x, y: p.y - y }))
      }
      ensureShape(el)
      project.world = project.world || { name: '未命名世界', scaleLabel: '1 格 ≈ 20 米', elements: [] }
      project.world.elements = project.world.elements || []
      project.world.elements.push(el)
      return el
    })
    return ok(`已添加${TYPE[type].label}「${result.result.name}」id=${id}，revision=${result.revision}。`, { projectId: result.id, revision: result.revision, element: summary(result.result) })
  },

  async world_update_element(args) {
    assert(args.elementId, 'elementId 不能为空')
    const hasPatch = ['name', 'x', 'y', 'color', 'radius', 'points', 'data'].some((k) => args[k] !== undefined)
    assert(hasPatch, '至少提供一个要更新的字段：name/x/y/color/radius/points/data')
    const result = await mutateProject(args.projectId, (project) => {
      const el = findElement(project, args.elementId)
      const changed = []
      if (args.name !== undefined) { el.name = String(args.name); changed.push('name') }
      if (args.x !== undefined) { el.x = numberField(args.x, 'x'); changed.push('x') }
      if (args.y !== undefined) { el.y = numberField(args.y, 'y'); changed.push('y') }
      if (args.color !== undefined) { el.color = String(args.color); changed.push('color') }
      if (args.radius !== undefined) { el.radius = numberField(args.radius, 'radius'); changed.push('radius') }
      if (args.points !== undefined) {
        assert(TYPE[el.type]?.path, `points 只适用于河流/道路，当前类型：${TYPE[el.type]?.label || el.type}`)
        const abs = normalizePoints(args.points)
        const ox = Number.isFinite(Number(args.x)) ? Number(args.x) : Number(el.x) || 0
        const oy = Number.isFinite(Number(args.y)) ? Number(args.y) : Number(el.y) || 0
        el.points = abs.map((p) => ({ x: p.x - ox, y: p.y - oy }))
        changed.push('points')
      }
      if (args.data !== undefined) {
        assert(args.data && typeof args.data === 'object' && !Array.isArray(args.data), 'data 必须是对象')
        el.data = args.replaceData ? structuredClone(args.data) : { ...(el.data || {}), ...args.data }
        changed.push('data')
      }
      ensureShape(el)
      return { el, changed }
    })
    return ok(`已更新「${result.result.el.name}」：${result.result.changed.join('、')}，revision=${result.revision}。`, { projectId: result.id, revision: result.revision, element: summary(result.result.el) })
  },

  async world_remove_element(args) {
    const result = await mutateProject(args.projectId, (project) => {
      const el = findElement(project, args.elementId)
      project.world.elements = (project.world.elements || []).filter((e) => e.id !== el.id)
      return { removed: summary(el), remaining: project.world.elements.length }
    })
    return ok(`已删除「${result.result.removed.name}」，剩余 ${result.result.remaining} 个元素，revision=${result.revision}。`, { projectId: result.id, revision: result.revision, ...result.result })
  },

  async world_set_settlement(args) {
    assert(args.elementId, 'elementId 不能为空')
    const result = await mutateProject(args.projectId, (project) => {
      const el = findElement(project, args.elementId, 'settlement')
      if (args.hostile !== undefined) el.data.hostile = !!args.hostile
      if (args.safeZone !== undefined) el.data.safeZone = !!args.safeZone
      if (args.faction !== undefined) el.data.faction = String(args.faction)
      if (args.population !== undefined) el.data.population = numberField(args.population, 'population', { integer: true })
      if (args.services !== undefined) el.data.services = normalizeServices(args.services)
      if (args.buffs !== undefined) el.data.buffs = normalizeBuffs(args.buffs)
      if (args.notes !== undefined) el.data.notes = String(args.notes)
      if (args.radius !== undefined) el.radius = numberField(args.radius, 'radius')
      if (args.x !== undefined) el.x = numberField(args.x, 'x')
      if (args.y !== undefined) el.y = numberField(args.y, 'y')
      if (el.data.hostile && el.data.safeZone) el.data.safeZone = false
      ensureShape(el)
      return el
    })
    const d = result.result.data
    return ok(`聚落「${result.result.name}」：${d.hostile ? '敌对' : d.safeZone ? '安全区' : '中立'}，增益 ${d.buffs?.length || 0} 个，revision=${result.revision}。`, { projectId: result.id, revision: result.revision, settlement: summary(result.result) })
  },

  async world_set_npc_dialogue(args) {
    assert(args.elementId, 'elementId 不能为空')
    const dialogue = await mutateProject(args.projectId, (project) => {
      const el = findElement(project, args.elementId, 'character')
      el.data.dialogues = el.data.dialogues || []
      const existing = findDialogue(el, args.dialogueId)
      const effective = { ...args }
      if (existing) {
        if (effective.name === undefined) effective.name = existing.name
        if (effective.audience === undefined) effective.audience = existing.audienceIds || []
      }
      const normalized = normalizeDialogue(project, el, effective)
      if (existing && args.quest === undefined) normalized.quest = existing.quest || null
      if (existing) {
        const index = el.data.dialogues.indexOf(existing)
        el.data.dialogues[index] = normalized
      } else {
        el.data.dialogues.push(normalized)
      }
      ensureShape(el)
      return { npc: { id: el.id, name: el.name }, dialogue: normalized }
    })
    const d = dialogue.result.dialogue
    return ok(`NPC「${dialogue.result.npc.name}」已保存对话「${d.name}」${d.quest ? `，并派发任务「${d.quest.title}」` : ''}，revision=${dialogue.revision}。`, { projectId: dialogue.id, revision: dialogue.revision, ...dialogue.result })
  },

  async world_analyze(args) {
    const id = await resolveProjectId(args.projectId)
    const analysis = await analyzeWorld(id)
    const s = analysis.summary
    return ok(`世界体检：${s.elements} 元素 / ${s.settlements} 聚落 / ${s.quests} 任务 / ${s.errors} 错误 / ${s.warns} 警告。`, { projectId: id, analysis })
  },

  async blueprint_markdown(args) {
    const id = await resolveProjectId(args.projectId)
    const md = await blueprintMarkdown(id)
    return ok(md, { projectId: id, format: 'markdown', bytes: Buffer.byteLength(md, 'utf8') })
  }
}

export async function runTool(name, args = {}) {
  const handler = handlers[name]
  if (!handler) throw new ApiError(`未知工具：${name}`, 404)
  return handler(args || {})
}
