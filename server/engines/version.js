/** 版本差异：按模块比较两个企划快照，并推导影响范围。纯函数。 */

const MODULE_LABEL = {
  meta: '企划信息与模块',
  narrative: '叙事图谱',
  characters: '角色设计',
  skills: '技能',
  stats: '数值属性',
  combat: '数值对抗',
  branches: '分支演算（派生）',
  blueprint: '走向蓝图',
  world: '开放世界',
  cases: '推理案件',
  studio: '叙事运营'
}

const IMPACT_RULES = {
  meta: ['narrative', 'characters', 'stats', 'combat', 'branches', 'blueprint', 'world', 'cases'],
  narrative: ['branches', 'blueprint', 'world'],
  characters: ['stats', 'combat', 'world', 'cases'],
  skills: ['characters', 'combat'],
  stats: ['characters', 'combat'],
  combat: ['combat'],
  blueprint: ['blueprint'],
  world: ['blueprint'],
  cases: ['cases']
}

const MAX_LIST = 20
const MAX_FIELDS = 30

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const arr = (v) => (Array.isArray(v) ? v : [])
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

function preview(value) {
  if (value === undefined) return '(无)'
  if (value === null) return 'null'
  if (typeof value === 'string') return value.length > 80 ? `${value.slice(0, 80)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.length} 项]`
  if (typeof value === 'object') {
    const keys = Object.keys(value)
    return `{${keys.slice(0, 6).join(', ')}${keys.length > 6 ? ', …' : ''}}`
  }
  return String(value)
}

function limit(list, max = MAX_LIST) {
  return { items: list.slice(0, max), truncated: Math.max(0, list.length - max), total: list.length }
}

function entityDiff(before = [], after = [], typeField = 'type') {
  const beforeMap = new Map(arr(before).map((x, i) => [x?.id ?? `#${i}`, x]))
  const afterMap = new Map(arr(after).map((x, i) => [x?.id ?? `#${i}`, x]))
  const added = []
  const removed = []
  const updated = []
  for (const [id, item] of afterMap) {
    if (!beforeMap.has(id)) {
      added.push({ id, name: item?.name || item?.title || item?.label || id, type: item?.[typeField] || item?.type })
    }
  }
  for (const [id, old] of beforeMap) {
    const item = afterMap.get(id)
    if (!item) {
      removed.push({ id, name: old?.name || old?.title || old?.label || id, type: old?.[typeField] || old?.type })
      continue
    }
    if (same(old, item)) continue
    const keys = new Set([...Object.keys(obj(old)), ...Object.keys(obj(item))])
    const fields = [...keys].filter((k) => !same(old?.[k], item?.[k]))
    updated.push({
      id,
      name: item?.name || item?.title || item?.label || id,
      type: item?.[typeField] || item?.type,
      fields: fields.slice(0, MAX_FIELDS),
      fieldCount: fields.length
    })
  }
  return { added, removed, updated, before: beforeMap.size, after: afterMap.size }
}

function fieldDiff(before, after, max = MAX_FIELDS) {
  const a = obj(before)
  const b = obj(after)
  const keys = new Set([...Object.keys(a), ...Object.keys(b)])
  const changes = []
  for (const key of keys) {
    if (same(a[key], b[key])) continue
    changes.push({ field: key, from: preview(a[key]), to: preview(b[key]) })
  }
  return { changes: changes.slice(0, max), total: changes.length, truncated: Math.max(0, changes.length - max) }
}

function moduleResult(key, changed, { before = 0, after = 0, added = [], removed = [], updated = [], fields = [], extra = {} } = {}) {
  return {
    key,
    label: MODULE_LABEL[key],
    changed: !!changed,
    counts: {
      before,
      after,
      added: added.length,
      removed: removed.length,
      updated: updated.length,
      fields: fields.length
    },
    details: {
      added: limit(added),
      removed: limit(removed),
      updated: limit(updated),
      fields: fields.slice(0, MAX_FIELDS),
      fieldTotal: fields.length
    },
    ...extra
  }
}

function countsFromDiff(diff) {
  return { added: diff.added, removed: diff.removed, updated: diff.updated }
}

function moduleCounts(d, before, after) {
  return {
    before,
    after,
    added: d.added,
    removed: d.removed,
    updated: d.updated
  }
}

function worldExtras(project) {
  const elements = arr(project.world?.elements)
  const byType = {}
  for (const e of elements) byType[e.type] = (byType[e.type] || 0) + 1
  const dialogCount = elements
    .filter((e) => e.type === 'character')
    .reduce((s, e) => s + arr(e.data?.dialogues).length, 0)
  const questCount = elements
    .filter((e) => e.type === 'character')
    .reduce((s, e) => s + arr(e.data?.dialogues).filter((d) => d.quest).length, 0)
  return {
    byType,
    dialogues: dialogCount,
    quests: questCount,
    settlements: elements.filter((e) => e.type === 'settlement').length,
    hostileSettlements: elements.filter((e) => e.type === 'settlement' && e.data?.hostile).length,
    safeSettlements: elements.filter((e) => e.type === 'settlement' && e.data?.safeZone).length
  }
}

function settlementChanges(beforeProject, afterProject) {
  const before = new Map(arr(beforeProject.world?.elements).filter((e) => e.type === 'settlement').map((e) => [e.id, e]))
  const after = new Map(arr(afterProject.world?.elements).filter((e) => e.type === 'settlement').map((e) => [e.id, e]))
  const changes = []
  for (const [id, e] of after) {
    const old = before.get(id)
    if (!old) continue
    const fields = []
    for (const f of ['hostile', 'safeZone', 'population', 'faction']) {
      if (!same(old.data?.[f], e.data?.[f])) fields.push({ field: f, from: preview(old.data?.[f]), to: preview(e.data?.[f]) })
    }
    const oldBuffs = arr(old.data?.buffs).map((b) => `${b.name}:${b.desc || ''}`)
    const newBuffs = arr(e.data?.buffs).map((b) => `${b.name}:${b.desc || ''}`)
    if (!same(oldBuffs, newBuffs)) fields.push({ field: 'buffs', from: oldBuffs.join('、') || '(无)', to: newBuffs.join('、') || '(无)' })
    if (fields.length) changes.push({ id, name: e.name, fields })
  }
  return changes
}

function collectReferences(project) {
  const world = arr(project.world?.elements)
  return {
    nodeRefs: world.filter((e) => e.data?.narrativeNodeId),
    characterRefs: world.filter((e) => e.data?.characterId),
    portalTargets: world.filter((e) => e.type === 'portal' && e.data?.targetId)
  }
}

function impactNotes(fromProject, toProject, modules, references) {
  const notes = []
  const add = (level, module, text) => notes.push({ level, module, text })
  const removedCharacters = new Set(modules.characters.details.removed.items.map((x) => x.id))
  const removedNodes = new Set(modules.narrative.details.removed.items.map((x) => x.id))
  const removedSkills = new Set(modules.skills.details.removed.items.map((x) => x.id))
  const removedElements = new Set(modules.world.details.removed.items.map((x) => x.id))

  const fromModules = obj(fromProject.meta?.modules)
  const toModules = obj(toProject.meta?.modules)
  const enabled = Object.keys(toModules).filter((k) => toModules[k] && !fromModules[k])
  const disabled = Object.keys(toModules).filter((k) => !toModules[k] && fromModules[k])
  if (enabled.length) add('info', 'meta', `启用了模块：${enabled.join('、')}；侧栏入口与相关页面会新增。`)
  if (disabled.length) add('warn', 'meta', `关闭了模块：${disabled.join('、')}；入口隐藏，但数据仍保留。`)

  if (modules.narrative.changed) {
    add('info', 'narrative', '剧情节点/连线变化会改变分支枚举、蓝图节奏与结局覆盖。')
    const brokenNodeRefs = references.nodeRefs.filter((e) => removedNodes.has(e.data?.narrativeNodeId))
    if (brokenNodeRefs.length) add('warn', 'narrative', `被删除的剧情节点仍被 ${brokenNodeRefs.length} 个地图元素引用：${brokenNodeRefs.slice(0, 5).map((e) => e.name).join('、')}${brokenNodeRefs.length > 5 ? ' 等' : ''}。`)
  }
  if (modules.characters.changed) {
    add('info', 'characters', '角色基础值、成长或关系变化会影响派生属性、战斗胜率与推理嫌疑。')
    const brokenNpc = references.characterRefs.filter((e) => removedCharacters.has(e.data?.characterId))
    if (brokenNpc.length) add('warn', 'characters', `被删除的角色仍被 ${brokenNpc.length} 个地图 NPC 引用。`)
    const suspects = arr(toProject.cases).flatMap((c) => arr(c.suspects))
    const brokenSuspects = suspects.filter((s) => removedCharacters.has(s.id))
    if (brokenSuspects.length) add('warn', 'characters', `推理案件仍引用 ${brokenSuspects.length} 个已删除的嫌疑角色。`)
  }
  if (modules.skills.changed) {
    add('info', 'skills', '技能权重/倍率变化会直接改变战斗模拟结果。')
    const broken = arr(toProject.characters).filter((c) => arr(c.skillIds).some((id) => removedSkills.has(id)))
    if (broken.length) add('warn', 'skills', `${broken.length} 个角色仍引用已删除技能。`)
  }
  if (modules.stats.changed) {
    add('info', 'stats', '属性公式/成长变更会影响所有角色的派生值与战斗数值锚点。')
  }
  if (modules.combat.changed) {
    add('info', 'combat', '战斗预设/假人变化会影响胜率、回合分布与对抗矩阵。')
  }
  if (modules.world.changed) {
    add('info', 'world', '地图元素、聚落状态或 NPC 对话变化会影响世界体检与蓝图开放世界摘要。')
    const settlementDiff = settlementChanges(fromProject, toProject)
    if (settlementDiff.length) {
      const text = settlementDiff.slice(0, 4).map((s) => `${s.name}（${s.fields.map((f) => f.field).join('/')}）`).join('、')
      add('info', 'world', `聚落状态变化：${text}${settlementDiff.length > 4 ? ' 等' : ''}。`)
    }
    const brokenPortals = references.portalTargets.filter((p) => removedElements.has(p.data?.targetId))
    if (brokenPortals.length) add('warn', 'world', `${brokenPortals.length} 个传送门指向已删除的目的地。`)
  }
  if (modules.cases.changed) {
    add('info', 'cases', '推理案件/规则变化会改变结论、可信度传播与待补线索。')
  }
  if (modules.blueprint.changed) {
    add('info', 'blueprint', '分幕目标/主题变化会影响蓝图中的幕结构与节奏评估。')
  }
  if (modules.branches.changed) {
    add('info', 'branches', '分支演算结果由叙事图谱推导，会随本次节点/连线变化重新计算。')
  }
  return notes
}

export function compareProjects(fromProject, toProject, versionMeta = {}) {
  const from = fromProject || {}
  const to = toProject || {}

  const narrativeBefore = arr(from.narrative?.nodes).length + arr(from.narrative?.edges).length
  const narrativeAfter = arr(to.narrative?.nodes).length + arr(to.narrative?.edges).length
  const nodeDiff = entityDiff(arr(from.narrative?.nodes), arr(to.narrative?.nodes))
  const edgeDiff = entityDiff(arr(from.narrative?.edges), arr(to.narrative?.edges))
  const narrativeChanged = !same(from.narrative, to.narrative)
  const narrative = moduleResult('narrative', narrativeChanged, {
    before: narrativeBefore,
    after: narrativeAfter,
    ...countsFromDiff({
      added: [...nodeDiff.added, ...edgeDiff.added],
      removed: [...nodeDiff.removed, ...edgeDiff.removed],
      updated: [...nodeDiff.updated, ...edgeDiff.updated]
    }),
    extra: {
      nodes: moduleCounts(nodeDiff, arr(from.narrative?.nodes).length, arr(to.narrative?.nodes).length),
      edges: moduleCounts(edgeDiff, arr(from.narrative?.edges).length, arr(to.narrative?.edges).length),
      startId: { from: from.narrative?.startId || null, to: to.narrative?.startId || null, changed: !same(from.narrative?.startId, to.narrative?.startId) }
    }
  })

  const charDiff = entityDiff(arr(from.characters), arr(to.characters))
  const characters = moduleResult('characters', !same(from.characters, to.characters), {
    ...moduleCounts(charDiff, arr(from.characters).length, arr(to.characters).length)
  })

  const skillDiff = entityDiff(arr(from.skills), arr(to.skills))
  const skills = moduleResult('skills', !same(from.skills, to.skills), {
    ...moduleCounts(skillDiff, arr(from.skills).length, arr(to.skills).length)
  })

  const attrDiff = entityDiff(arr(from.stats?.attributes), arr(to.stats?.attributes))
  const formulaDiff = entityDiff(arr(from.stats?.formulas), arr(to.stats?.formulas))
  const stats = moduleResult('stats', !same(from.stats, to.stats), {
    ...moduleCounts(
      { added: [...attrDiff.added, ...formulaDiff.added], removed: [...attrDiff.removed, ...formulaDiff.removed], updated: [...attrDiff.updated, ...formulaDiff.updated] },
      arr(from.stats?.attributes).length + arr(from.stats?.formulas).length,
      arr(to.stats?.attributes).length + arr(to.stats?.formulas).length
    ),
    extra: {
      attributes: moduleCounts(attrDiff, arr(from.stats?.attributes).length, arr(to.stats?.attributes).length),
      formulas: moduleCounts(formulaDiff, arr(from.stats?.formulas).length, arr(to.stats?.formulas).length)
    }
  })

  const combatFields = fieldDiff(from.combat, to.combat)
  const combat = moduleResult('combat', !same(from.combat, to.combat), { fields: combatFields.changes, extra: { fieldTotal: combatFields.total } })

  const blueprintFields = fieldDiff(from.blueprint, to.blueprint)
  const blueprint = moduleResult('blueprint', !same(from.blueprint, to.blueprint), { fields: blueprintFields.changes, extra: { fieldTotal: blueprintFields.total } })

  const elementDiff = entityDiff(arr(from.world?.elements), arr(to.world?.elements))
  const customTypeDiff = entityDiff(arr(from.world?.customTypes), arr(to.world?.customTypes))
  const categoryDiff = entityDiff(arr(from.world?.categories), arr(to.world?.categories))
  const worldChanged = !same(from.world, to.world)
  const beforeWorld = worldExtras(from)
  const afterWorld = worldExtras(to)
  const world = moduleResult('world', worldChanged, {
    ...moduleCounts(elementDiff, beforeWorld.byType ? arr(from.world?.elements).length : 0, arr(to.world?.elements).length),
    extra: {
      name: { from: from.world?.name || '', to: to.world?.name || '', changed: !same(from.world?.name, to.world?.name) },
      scaleLabel: { from: from.world?.scaleLabel || '', to: to.world?.scaleLabel || '', changed: !same(from.world?.scaleLabel, to.world?.scaleLabel) },
      byType: { before: beforeWorld.byType, after: afterWorld.byType },
      dialogues: { before: beforeWorld.dialogues, after: afterWorld.dialogues },
      quests: { before: beforeWorld.quests, after: afterWorld.quests },
      settlements: { before: beforeWorld.settlements, after: afterWorld.settlements },
      customTypes: {
        before: arr(from.world?.customTypes).length,
        after: arr(to.world?.customTypes).length,
        ...customTypeDiff
      },
      categories: {
        before: arr(from.world?.categories).length,
        after: arr(to.world?.categories).length,
        ...categoryDiff
      },
      settlementChanges: settlementChanges(from, to)
    }
  })

  const caseDiff = entityDiff(arr(from.cases), arr(to.cases))
  const cases = moduleResult('cases', !same(from.cases, to.cases), {
    ...moduleCounts(caseDiff, arr(from.cases).length, arr(to.cases).length),
    extra: {
      clues: arr(to.cases).reduce((s, c) => s + arr(c.clues).length, 0),
      rules: arr(to.cases).reduce((s, c) => s + arr(c.rules).length, 0)
    }
  })

  const metaChanges = fieldDiff({ name: from.name, ...obj(from.meta) }, { name: to.name, ...obj(to.meta) })
  const fromModules = obj(from.meta?.modules)
  const toModules = obj(to.meta?.modules)
  const moduleToggles = []
  for (const key of new Set([...Object.keys(fromModules), ...Object.keys(toModules)])) {
    if (!!fromModules[key] !== !!toModules[key]) moduleToggles.push({ module: key, label: MODULE_LABEL[key] || key, from: !!fromModules[key], to: !!toModules[key] })
  }
  const metaModule = moduleResult('meta', metaChanges.total > 0, {
    fields: metaChanges.changes,
    extra: { moduleToggles }
  })

  const branches = moduleResult('branches', narrativeChanged, {
    before: narrativeBefore,
    after: narrativeAfter,
    extra: { derived: true }
  })

  const studioComparable = {
    localization: from.localization,
    assets: from.assets,
    tasks: from.production,
    beats: from.storyboard,
    storylets: from.storylets,
    reviews: from.reviews
  }
  const studioComparableTo = {
    localization: to.localization,
    assets: to.assets,
    tasks: to.production,
    beats: to.storyboard,
    storylets: to.storylets,
    reviews: to.reviews
  }
  const studio = moduleResult('studio', !same(studioComparable, studioComparableTo), {
    extra: {
      assets: entityDiff(arr(from.assets), arr(to.assets)),
      tasks: entityDiff(arr(from.production?.tasks), arr(to.production?.tasks)),
      beats: entityDiff(arr(from.storyboard?.beats), arr(to.storyboard?.beats)),
      storylets: entityDiff(arr(from.storylets), arr(to.storylets)),
      reviews: entityDiff(arr(from.reviews), arr(to.reviews)),
      localization: {
        locales: { from: arr(from.localization?.locales).length, to: arr(to.localization?.locales).length },
        strings: { from: Object.keys(obj(from.localization?.strings)).length, to: Object.keys(obj(to.localization?.strings)).length }
      }
    }
  })

  const modules = { meta: metaModule, narrative, characters, skills, stats, combat, branches, blueprint, world, cases, studio }
  const changedModules = Object.values(modules).filter((m) => m.changed)
  const counts = changedModules.reduce(
    (acc, m) => {
      acc.added += m.counts.added
      acc.removed += m.counts.removed
      acc.updated += m.counts.updated
      acc.fields += m.counts.fields
      return acc
    },
    { added: 0, removed: 0, updated: 0, fields: 0 }
  )

  const references = collectReferences(to)
  const notes = impactNotes(from, to, modules, references)
  const affectedKeys = new Set()
  for (const m of changedModules) {
    if (m.key === 'branches') continue
    for (const k of IMPACT_RULES[m.key] || []) affectedKeys.add(k)
  }
  if (changedModules.length) affectedKeys.add('blueprint')
  const affectedModules = [...affectedKeys].map((key) => {
    const related = changedModules.filter((m) => m.key === key || (IMPACT_RULES[m.key] || []).includes(key)).map((m) => m.label)
    return { key, label: MODULE_LABEL[key] || key, reason: related.length ? `受 ${related.join('、')} 变化影响` : '受本次版本变化影响' }
  })

  return {
    from: versionMeta.from || null,
    to: versionMeta.to || null,
    summary: {
      changed: changedModules.length > 0,
      changedModules: changedModules.map((m) => ({ key: m.key, label: m.label })),
      added: counts.added,
      removed: counts.removed,
      updated: counts.updated,
      fields: counts.fields,
      moduleToggles,
      projectName: { from: from.name || '', to: to.name || '' }
    },
    modules,
    impact: { affectedModules, notes },
    generatedAt: new Date().toISOString()
  }
}
