/** 开放世界元素类型、默认数据与分类。 */

export const WORLD_TYPES = {
  settlement: {
    label: '聚落',
    icon: '⬢',
    color: '#67e8f9',
    category: '据点',
    radius: 220,
    data: {
      faction: '',
      population: 0,
      hostile: false,
      safeZone: true,
      services: [],
      buffs: [],
      notes: ''
    }
  },
  character: {
    label: '角色 / NPC',
    icon: '◉',
    color: '#f0abfc',
    category: '内容',
    data: { characterId: null, player: false, faction: '', level: 1, hostile: false, dialogues: [] }
  },
  stronghold: {
    label: '重要据点',
    icon: '♜',
    color: '#c084fc',
    category: '据点',
    data: { faction: '', level: 1, defense: 0, narrativeNodeId: '' }
  },
  building: {
    label: '建筑',
    icon: '⌂',
    color: '#fbbf24',
    category: '据点',
    data: { function: '民居', owner: '', narrativeNodeId: '' }
  },
  region: {
    label: '特殊区域',
    icon: '◌',
    color: '#4ade80',
    category: '地形',
    radius: 320,
    data: { regionType: '森林', danger: 1, effect: '' }
  },
  collectible: {
    label: '收集物品',
    icon: '◆',
    color: '#fde68a',
    category: '内容',
    data: { itemName: '新物品', rarity: '普通', amount: 1, respawn: false }
  },
  bulletin: {
    label: '公告栏',
    icon: '▤',
    color: '#fbbf24',
    category: '据点',
    data: { posts: [] }
  },
  sign: {
    label: '路引',
    icon: '➤',
    color: '#fbbf24',
    category: '据点',
    data: { direction: '→', destination: '', distance: 0 }
  },
  portal: {
    label: '传送门',
    icon: '◎',
    color: '#67e8f9',
    category: '据点',
    data: { targetId: '', requirement: '', twoWay: true }
  },
  river: {
    label: '河流',
    icon: '≈',
    color: '#38bdf8',
    category: '地形',
    path: true,
    data: { width: 22 }
  },
  mountain: {
    label: '山川',
    icon: '⛰',
    color: '#94a3b8',
    category: '地形',
    radius: 150,
    data: { peaks: 3, danger: 1 }
  },
  tree: {
    label: '树木',
    icon: '♣',
    color: '#4ade80',
    category: '地形',
    data: { species: '雾松', height: 16 }
  },
  road: {
    label: '道路',
    icon: '╌',
    color: '#a8a29e',
    category: '地形',
    path: true,
    data: { width: 7 }
  }
}

export const WORLD_CATEGORIES = ['地形', '据点', '内容']

export function worldTypesByCategory() {
  return WORLD_CATEGORIES.map((name) => ({
    name,
    types: Object.entries(WORLD_TYPES).filter(([, meta]) => meta.category === name)
  }))
}

export function isPathType(type) {
  return !!WORLD_TYPES[type]?.path
}

export function isAreaType(type) {
  return !!WORLD_TYPES[type]?.radius
}

export function newId(prefix = 'w') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
}

export function createElement(type, x = 0, y = 0) {
  const meta = WORLD_TYPES[type] || WORLD_TYPES.building
  const el = {
    id: newId(),
    type,
    name: `新${meta.label}`,
    x: Math.round(x),
    y: Math.round(y),
    color: meta.color,
    data: structuredClone(meta.data)
  }
  if (meta.radius) el.radius = meta.radius
  if (meta.path) el.points = [{ x: 0, y: 0 }, { x: 160, y: 60 }]
  return el
}

export function newDialogue() {
  return {
    id: `d-${Date.now().toString(36)}`,
    name: '新对话',
    audienceIds: [],
    lines: [{ speaker: 'NPC', text: '……' }],
    choices: [],
    quest: null
  }
}

export function newQuest() {
  return {
    id: `q-${Date.now().toString(36)}`,
    title: '新任务',
    summary: '',
    objectives: [{ text: '第一步', done: false }],
    reward: '',
    status: '未接取'
  }
}

export function deleteTypedData(type, el) {
  if (!el) return
  if (type === 'character') el.data.dialogues = []
}
