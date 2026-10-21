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

export const DEFAULT_WORLD_CATEGORIES = [
  { id: 'terrain', name: '地形', emoji: '🏞️', builtin: true },
  { id: 'site', name: '据点', emoji: '🏰', builtin: true },
  { id: 'content', name: '内容', emoji: '🎭', builtin: true }
]

const CATEGORY_LABEL_TO_ID = { 地形: 'terrain', 据点: 'site', 内容: 'content' }
export const TYPE_CATEGORY_ID = Object.fromEntries(
  Object.entries(WORLD_TYPES).map(([type, meta]) => [type, CATEGORY_LABEL_TO_ID[meta.category] || 'content'])
)

export function categoryIdOfType(type) {
  return TYPE_CATEGORY_ID[type] || 'content'
}

export function resolveCategoryId(el, categories = DEFAULT_WORLD_CATEGORIES, customTypes = []) {
  const ids = new Set(categories.map((c) => c.id))
  if (el?.categoryId && ids.has(el.categoryId)) return el.categoryId
  if (el?.type === 'custom') {
    const ct = customTypes.find((t) => t.id === el.customTypeId)
    return ct?.categoryId && ids.has(ct.categoryId) ? ct.categoryId : 'content'
  }
  return categoryIdOfType(el?.type)
}

export function iconOfElement(el, customTypes = []) {
  if (el?.type === 'custom') {
    const ct = customTypes.find((t) => t.id === el.customTypeId)
    return ct?.icon || el.icon || '✨'
  }
  return WORLD_TYPES[el?.type]?.icon || '•'
}

export function labelOfElement(el, customTypes = []) {
  if (el?.type === 'custom') {
    const ct = customTypes.find((t) => t.id === el.customTypeId)
    return ct?.name || el.name || '自定义元素'
  }
  return WORLD_TYPES[el?.type]?.label || el?.type || '元素'
}

export function newCategory(name, emoji = '📁') {
  return {
    id: `cat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: String(name || '新分类').trim() || '新分类',
    emoji: emoji || '📁',
    builtin: false
  }
}

export function newCustomType({ name, icon, categoryId, color, radius, description }) {
  return {
    id: `ctype-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    name: String(name || '自定义元素').trim() || '自定义元素',
    icon: icon || '✨',
    categoryId: categoryId || 'content',
    color: color || '#67e8f9',
    radius: Number(radius) > 0 ? Number(radius) : 0,
    description: String(description || '')
  }
}

export function createCustomElement(customType, x = 0, y = 0) {
  const el = {
    id: newId(),
    type: 'custom',
    customTypeId: customType.id,
    name: customType.name,
    x: Math.round(x),
    y: Math.round(y),
    color: customType.color || '#67e8f9',
    icon: customType.icon || '✨',
    categoryId: customType.categoryId || 'content',
    data: { description: customType.description || '', notes: '' }
  }
  if (Number(customType.radius) > 0) el.radius = Number(customType.radius)
  return el
}

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
    categoryId: categoryIdOfType(type),
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
