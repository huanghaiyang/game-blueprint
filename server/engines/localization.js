/** 本地化字符串抽取与覆盖率报告。纯函数。 */

const arr = (v) => (Array.isArray(v) ? v : [])
const str = (v) => (typeof v === 'string' ? v : '')
const push = (out, key, module, entityId, entityLabel, field, text) => {
  if (!str(text).trim()) return
  out.push({ key, module, entityId, entityLabel: entityLabel || entityId || '', field, source: text })
}

export const LOCALIZATION_MODULES = {
  meta: '企划信息',
  narrative: '叙事',
  characters: '角色',
  skills: '技能',
  blueprint: '蓝图',
  cases: '推理',
  world: '开放世界',
  storyboard: '演出',
  storylets: '动态叙事',
  studio: '其他'
}

export function extractStrings(project = {}) {
  const out = []
  const meta = project.meta || {}
  push(out, 'meta:name', 'meta', project.id, project.name, 'name', project.name)
  push(out, 'meta:logline', 'meta', project.id, project.name, 'logline', meta.logline)
  push(out, 'meta:tone', 'meta', project.id, project.name, 'tone', meta.tone)

  const narrative = project.narrative || {}
  for (const n of arr(narrative.nodes)) {
    push(out, `node:${n.id}:title`, 'narrative', n.id, n.title, 'title', n.title)
    push(out, `node:${n.id}:text`, 'narrative', n.id, n.title, 'text', n.text)
    push(out, `node:${n.id}:summary`, 'narrative', n.id, n.title, 'summary', n.summary)
  }
  for (const e of arr(narrative.edges)) {
    push(out, `edge:${e.id}:label`, 'narrative', e.id, e.label, 'label', e.label)
  }

  for (const c of arr(project.characters)) {
    push(out, `char:${c.id}:name`, 'characters', c.id, c.name, 'name', c.name)
    for (const field of ['role', 'desc', 'motive', 'flaw', 'arc', 'background']) {
      push(out, `char:${c.id}:${field}`, 'characters', c.id, c.name, field, c[field])
    }
  }
  for (const s of arr(project.skills)) {
    push(out, `skill:${s.id}:name`, 'skills', s.id, s.name, 'name', s.name)
    push(out, `skill:${s.id}:desc`, 'skills', s.id, s.name, 'desc', s.desc)
  }

  const bp = project.blueprint || {}
  for (const a of arr(bp.acts)) {
    push(out, `act:${a.id}:name`, 'blueprint', a.id, a.name, 'name', a.name)
    push(out, `act:${a.id}:goal`, 'blueprint', a.id, a.name, 'goal', a.goal)
  }
  for (const t of arr(bp.themes)) {
    push(out, `theme:${t.id}:name`, 'blueprint', t.id, t.name, 'name', t.name)
    push(out, `theme:${t.id}:motif`, 'blueprint', t.id, t.name, 'motif', t.motif)
  }

  for (const c of arr(project.cases)) {
    push(out, `case:${c.id}:title`, 'cases', c.id, c.title, 'title', c.title)
    push(out, `case:${c.id}:question`, 'cases', c.id, c.title, 'question', c.question)
    push(out, `case:${c.id}:solution`, 'cases', c.id, c.title, 'solution', c.solution?.reasoning)
    for (const s of arr(c.suspects)) {
      push(out, `suspect:${c.id}:${s.id}:name`, 'cases', s.id, s.name, 'name', s.name)
      push(out, `suspect:${c.id}:${s.id}:role`, 'cases', s.id, s.name, 'role', s.role)
    }
    for (const cl of arr(c.clues)) {
      push(out, `clue:${c.id}:${cl.id}:name`, 'cases', cl.id, cl.name, 'name', cl.name)
      push(out, `clue:${c.id}:${cl.id}:desc`, 'cases', cl.id, cl.name, 'desc', cl.desc)
    }
    for (const r of arr(c.rules)) {
      push(out, `rule:${c.id}:${r.id}:name`, 'cases', r.id, r.name, 'name', r.name)
      push(out, `rule:${c.id}:${r.id}:reason`, 'cases', r.id, r.name, 'reason', r.then?.reason)
    }
  }

  for (const el of arr(project.world?.elements)) {
    push(out, `world:${el.id}:name`, 'world', el.id, el.name, 'name', el.name)
    push(out, `world:${el.id}:notes`, 'world', el.id, el.name, 'notes', el.data?.notes)
    if (el.type === 'bulletin') {
      for (const p of arr(el.data?.posts)) {
        push(out, `world:${el.id}:post:${p.id}:title`, 'world', p.id, p.title, 'title', p.title)
        push(out, `world:${el.id}:post:${p.id}:content`, 'world', p.id, p.title, 'content', p.content)
      }
    }
    for (const d of arr(el.data?.dialogues)) {
      const base = `dlg:${el.id}:${d.id}`
      push(out, `${base}:name`, 'world', d.id, d.name, 'name', d.name)
      arr(d.lines).forEach((line, i) => push(out, `${base}:line:${i}`, 'world', d.id, d.name, `line ${i + 1}`, line.text))
      arr(d.choices).forEach((choice, i) => {
        push(out, `${base}:choice:${i}:label`, 'world', d.id, d.name, `choice ${i + 1}`, choice.label)
        push(out, `${base}:choice:${i}:response`, 'world', d.id, d.name, `choice ${i + 1} response`, choice.response)
      })
      const quest = d.quest
      if (quest) {
        const qb = `quest:${el.id}:${d.id}:${quest.id || 'quest'}`
        push(out, `${qb}:title`, 'world', quest.id, quest.title, 'title', quest.title)
        push(out, `${qb}:summary`, 'world', quest.id, quest.title, 'summary', quest.summary)
        push(out, `${qb}:reward`, 'world', quest.id, quest.title, 'reward', quest.reward)
        arr(quest.objectives).forEach((o, i) => push(out, `${qb}:objective:${i}`, 'world', quest.id, quest.title, `objective ${i + 1}`, typeof o === 'string' ? o : o?.text))
      }
    }
  }

  for (const b of arr(project.storyboard?.beats)) {
    push(out, `beat:${b.id}:title`, 'storyboard', b.id, b.title, 'title', b.title)
    push(out, `beat:${b.id}:notes`, 'storyboard', b.id, b.title, 'notes', b.notes)
  }
  for (const s of arr(project.storylets)) {
    push(out, `storylet:${s.id}:name`, 'storylets', s.id, s.name, 'name', s.name)
    push(out, `storylet:${s.id}:description`, 'storylets', s.id, s.name, 'description', s.description)
  }

  const seen = new Set()
  return out.filter((entry) => {
    if (seen.has(entry.key)) return false
    seen.add(entry.key)
    return true
  })
}

export function localizationReport(project = {}) {
  const entries = extractStrings(project)
  const loc = project.localization || {}
  const locales = arr(loc.locales)
  const strings = loc.strings || {}
  const voice = loc.voice || {}
  const rows = entries.map((entry) => ({
    ...entry,
    values: Object.fromEntries(locales.map((l) => [l.id, strings[entry.key]?.[l.id] || ''])),
    voice: voice[entry.key] || ''
  }))
  const summary = locales.map((locale) => {
    const translated = rows.filter((r) => r.values[locale.id]?.trim()).length
    return {
      id: locale.id,
      name: locale.name,
      translated,
      missing: rows.length - translated,
      coverage: rows.length ? Math.round((translated / rows.length) * 1000) / 10 : 0
    }
  })
  const voiceEntries = rows.filter((r) => r.key.startsWith('dlg:') && r.key.includes(':line:') && r.voice !== undefined)
  return {
    defaultLocale: loc.defaultLocale || 'zh-CN',
    locales,
    entries: rows,
    summary,
    total: rows.length,
    voice: {
      total: voiceEntries.length,
      recorded: voiceEntries.filter((r) => r.voice === 'recorded').length,
      todo: voiceEntries.filter((r) => !r.voice || r.voice === 'todo').length,
      missing: voiceEntries.filter((r) => r.voice === 'missing').length
    },
    modules: [...new Set(rows.map((r) => r.module))].map((id) => ({ id, name: LOCALIZATION_MODULES[id] || id, count: rows.filter((r) => r.module === id).length }))
  }
}

export function toCsv(report) {
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const head = ['key', 'module', 'entity', 'field', 'source', ...report.locales.map((l) => l.id)]
  const lines = [head.map(esc).join(',')]
  for (const row of report.entries) {
    lines.push([row.key, row.module, row.entityLabel, row.field, row.source, ...report.locales.map((l) => row.values[l.id] || '')].map(esc).join(','))
  }
  return lines.join('\n')
}

export function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < String(text).length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (ch !== '\r') cell += ch
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  if (!rows.length) return []
  const head = rows.shift().map((h) => h.trim())
  return rows.filter((r) => r.some((c) => c.trim())).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])))
}
