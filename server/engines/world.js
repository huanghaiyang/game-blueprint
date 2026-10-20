/**
 * 开放世界体检：元素覆盖、NPC 对话/任务、聚落状态、传送门与叙事节点引用。
 * 纯函数，供 API 与蓝图共用。
 */

export const WORLD_TYPE_LABEL = {
  settlement: '聚落',
  character: '角色',
  stronghold: '重要据点',
  building: '建筑',
  region: '特殊区域',
  collectible: '收集物品',
  bulletin: '公告栏',
  sign: '路引',
  portal: '传送门',
  river: '河流',
  mountain: '山川',
  tree: '树木',
  road: '道路'
}

const r2 = (v) => Math.round(v * 100) / 100

export function analyzeWorld(project) {
  const world = project?.world || { elements: [] }
  const elements = Array.isArray(world.elements) ? world.elements.filter((e) => e && e.id) : []
  const characterMap = new Map((project?.characters || []).map((c) => [c.id, c]))
  const nodeMap = new Map((project?.narrative?.nodes || []).map((n) => [n.id, n]))
  const byType = {}
  for (const el of elements) byType[el.type] = (byType[el.type] || 0) + 1
  const warnings = []
  const seen = new Set()
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  const push = (level, code, message, elementId = null) => warnings.push({ level, code, message, elementId })

  const quests = []
  const dialogues = []
  const charsOnMap = new Set()
  let charactersWithoutDialogue = 0
  let specificDialogues = 0

  for (const el of elements) {
    if (seen.has(el.id)) push('error', 'DUPLICATE_ELEMENT_ID', `元素 ID 重复：${el.id}`, el.id)
    seen.add(el.id)
    if (!Number.isFinite(Number(el.x)) || !Number.isFinite(Number(el.y))) {
      push('warn', 'ELEMENT_NO_POSITION', `元素「${el.name || el.id}」缺少有效坐标`, el.id)
      continue
    }
    const radius = Number(el.radius) || 0
    minX = Math.min(minX, Number(el.x) - radius)
    minY = Math.min(minY, Number(el.y) - radius)
    maxX = Math.max(maxX, Number(el.x) + radius)
    maxY = Math.max(maxY, Number(el.y) + radius)
    if (Array.isArray(el.points)) {
      for (const p of el.points) {
        minX = Math.min(minX, Number(el.x) + Number(p.x || 0))
        minY = Math.min(minY, Number(el.y) + Number(p.y || 0))
        maxX = Math.max(maxX, Number(el.x) + Number(p.x || 0))
        maxY = Math.max(maxY, Number(el.y) + Number(p.y || 0))
      }
    }
    const data = el.data || {}

    if (el.type === 'character') {
      if (data.characterId) {
        if (!characterMap.has(data.characterId)) push('warn', 'CHARACTER_NOT_FOUND', `地图角色「${el.name}」关联的角色已不存在：${data.characterId}`, el.id)
        else charsOnMap.add(data.characterId)
      } else if (!data.player) {
        push('info', 'CHARACTER_UNLINKED', `地图角色「${el.name}」未关联角色卡，只作为独立 NPC 存在`, el.id)
      }
      const dlg = Array.isArray(data.dialogues) ? data.dialogues : []
      const meaningful = dlg.filter((d) => (d.lines || []).length || (d.choices || []).length)
      if (!data.player && !meaningful.length) {
        charactersWithoutDialogue++
        push('info', 'CHARACTER_NO_DIALOGUE', `NPC「${el.name}」还没有任何对话`, el.id)
      }
      for (const d of dlg) {
        if (!(d.lines || []).length && !(d.choices || []).length) push('warn', 'EMPTY_DIALOGUE', `「${el.name}」的对话「${d.name || d.id}」没有台词或选项`, el.id)
        const audience = Array.isArray(d.audienceIds) ? d.audienceIds : []
        if (audience.length) specificDialogues++
        for (const id of audience) {
          if (!characterMap.has(id)) push('warn', 'AUDIENCE_MISSING', `对话「${d.name || d.id}」的特定对象已不存在：${id}`, el.id)
        }
        dialogues.push({
          id: d.id,
          name: d.name,
          npc: el.name,
          elementId: el.id,
          audience: audience.map((id) => characterMap.get(id)?.name || id),
          lines: (d.lines || []).length,
          choices: (d.choices || []).length,
          hasQuest: !!d.quest
        })
        if (d.quest) {
          const objectives = Array.isArray(d.quest.objectives) ? d.quest.objectives : []
          quests.push({
            id: d.quest.id,
            title: d.quest.title || d.name,
            npc: el.name,
            elementId: el.id,
            status: d.quest.status || '未接取',
            objectives: objectives.length,
            reward: d.quest.reward || ''
          })
          if (!objectives.length) push('info', 'QUEST_NO_OBJECTIVE', `任务「${d.quest.title || d.name}」没有目标步骤`, el.id)
        }
      }
    }

    if (el.type === 'settlement') {
      const hostile = !!data.hostile
      const safe = !!data.safeZone
      if (hostile && safe) push('error', 'SETTLEMENT_CONFLICT', `聚落「${el.name}」同时被标记为敌对与安全区`, el.id)
      if (radius <= 0) push('warn', 'AREA_NO_RADIUS', `聚落「${el.name}」缺少有效范围半径`, el.id)
      if (!Array.isArray(data.buffs)) push('info', 'SETTLEMENT_NO_BUFF', `聚落「${el.name}」没有配置增益`, el.id)
    }

    if (el.type === 'region' || el.type === 'mountain') {
      if (radius <= 0) push('warn', 'AREA_NO_RADIUS', `「${el.name}」缺少有效范围半径`, el.id)
    }

    if (el.type === 'portal') {
      if (!data.targetId) push('warn', 'PORTAL_NO_TARGET', `传送门「${el.name}」没有设置目的地`, el.id)
      else {
        const target = elements.find((e) => e.id === data.targetId)
        if (!target) push('warn', 'PORTAL_TARGET_MISSING', `传送门「${el.name}」的目的地不存在：${data.targetId}`, el.id)
      }
    }

    if (el.type === 'building' || el.type === 'stronghold') {
      if (data.narrativeNodeId && !nodeMap.has(data.narrativeNodeId)) {
        push('warn', 'NARRATIVE_LINK_MISSING', `「${el.name}」关联的剧情节点不存在：${data.narrativeNodeId}`, el.id)
      }
    }

    if (el.type === 'collectible' && Number(data.amount) <= 0) {
      push('warn', 'COLLECTIBLE_AMOUNT', `收集物「${el.name}」数量为 0 或无效`, el.id)
    }

    if ((el.type === 'river' || el.type === 'road') && (el.points || []).length < 2) {
      push('info', 'PATH_TOO_SHORT', `「${el.name}」的路径点少于 2 个`, el.id)
    }
  }

  if (!elements.length) push('warn', 'EMPTY_WORLD', '世界地图还没有任何元素')
  const settlements = elements.filter((e) => e.type === 'settlement')
  if (!settlements.length) push('info', 'NO_SETTLEMENT', '地图上还没有聚落')

  const safeSettlements = settlements.filter((s) => !s.data?.hostile && s.data?.safeZone)
  const hostileSettlements = settlements.filter((s) => s.data?.hostile)
  const neutralSettlements = settlements.filter((s) => !s.data?.hostile && !s.data?.safeZone)
  const portals = elements.filter((e) => e.type === 'portal')
  const validPortals = portals.filter((p) => elements.some((e) => e.id === p.data?.targetId))
  const charactersOnMap = [...charsOnMap]
    .map((id) => characterMap.get(id))
    .filter(Boolean)
    .map((c) => ({ id: c.id, name: c.name }))
  const charactersNotOnMap = (project?.characters || [])
    .filter((c) => !charsOnMap.has(c.id))
    .map((c) => ({ id: c.id, name: c.name }))

  const safeArea = safeSettlements.reduce((sum, s) => sum + Math.PI * (Number(s.radius) || 0) ** 2, 0)
  const hostileArea = hostileSettlements.reduce((sum, s) => sum + Math.PI * (Number(s.radius) || 0) ** 2, 0)
  const bounds = Number.isFinite(minX)
    ? { minX, minY, maxX, maxY, width: r2(maxX - minX), height: r2(maxY - minY) }
    : { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 }

  const errors = warnings.filter((w) => w.level === 'error').length
  const warns = warnings.filter((w) => w.level === 'warn').length

  return {
    summary: {
      name: world.name || '未命名世界',
      elements: elements.length,
      byType,
      settlements: settlements.length,
      safeSettlements: safeSettlements.length,
      hostileSettlements: hostileSettlements.length,
      neutralSettlements: neutralSettlements.length,
      characters: byType.character || 0,
      linkedCharacters: charactersOnMap.length,
      quests: quests.length,
      dialogues: dialogues.length,
      specificDialogues,
      portals: portals.length,
      validPortals: validPortals.length,
      errors,
      warns,
      bounds,
      safeArea: Math.round(safeArea),
      hostileArea: Math.round(hostileArea)
    },
    warnings,
    settlements: settlements.map((s) => {
      const radius = Number(s.radius) || 0
      const npcCount = elements.filter((e) => e.type === 'character' && Math.hypot(Number(e.x) - Number(s.x), Number(e.y) - Number(s.y)) <= radius).length
      return {
        id: s.id,
        name: s.name,
        x: s.x,
        y: s.y,
        radius: s.radius,
        faction: s.data?.faction || '',
        population: s.data?.population || 0,
        hostile: !!s.data?.hostile,
        safeZone: !!s.data?.safeZone,
        buffs: (s.data?.buffs || []).map((b) => b.name),
        services: s.data?.services || [],
        npcCount
      }
    }),
    quests,
    dialogues,
    portals: portals.map((p) => ({
      id: p.id,
      name: p.name,
      targetId: p.data?.targetId || '',
      targetName: elements.find((e) => e.id === p.data?.targetId)?.name || '(未解析)',
      requirement: p.data?.requirement || '',
      valid: elements.some((e) => e.id === p.data?.targetId)
    })),
    charactersOnMap,
    charactersNotOnMap,
    charactersWithoutDialogue,
    bounds
  }
}
