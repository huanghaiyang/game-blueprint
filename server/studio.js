/** 叙事运营数据：本地化、资产、制作、演出、动态叙事、评审与无障碍。 */

export function defaultStudio() {
  return {
    localization: { defaultLocale: 'zh-CN', locales: [], strings: {}, voice: {} },
    assets: [],
    production: { tasks: [], milestones: [] },
    storyboard: { beats: [] },
    storylets: [],
    reviews: [],
    access: { contentWarnings: [], textSpeed: 32, autoDelay: 2.5, fontScale: 1, reduceMotion: false }
  }
}

export function normalizeStudio(base = {}) {
  const studio = defaultStudio()
  const loc = base.localization || {}
  studio.localization = {
    defaultLocale: loc.defaultLocale || 'zh-CN',
    locales: Array.isArray(loc.locales) ? loc.locales : [],
    strings: loc.strings && typeof loc.strings === 'object' ? loc.strings : {},
    voice: loc.voice && typeof loc.voice === 'object' ? loc.voice : {}
  }
  studio.assets = Array.isArray(base.assets) ? base.assets : []
  studio.production = {
    tasks: Array.isArray(base.production?.tasks) ? base.production.tasks : [],
    milestones: Array.isArray(base.production?.milestones) ? base.production.milestones : []
  }
  studio.storyboard = { beats: Array.isArray(base.storyboard?.beats) ? base.storyboard.beats : [] }
  studio.storylets = Array.isArray(base.storylets) ? base.storylets : []
  studio.reviews = Array.isArray(base.reviews) ? base.reviews : []
  studio.access = {
    ...studio.access,
    ...(base.access && typeof base.access === 'object' ? base.access : {})
  }
  return studio
}

export function demoStudio() {
  return {
    localization: {
      defaultLocale: 'zh-CN',
      locales: [
        { id: 'en', name: 'English' },
        { id: 'ja', name: '日本語' }
      ],
      strings: {
        'node:n1:title': { en: 'Prologue · Night Train', ja: '序章・雨夜列車' },        'node:n2:title': { en: 'The Stranger at the Gate', ja: '改札口の見知らぬ人' },
        'node:n3:title': { en: 'The Signal in the Fog', ja: '霧の暗号' },
        'node:n9:title': { en: 'Egret’s Bargain', ja: '白鷺の取引' },
        'char:shen_yan:name': { en: 'Shen Yan', ja: '沈硯' },
        'char:bai_lu:name': { en: 'Egret', ja: '白鷺' },
        'dlg:w-char-bailu:d-bailu-all:name': { en: 'Information Trade', ja: '情報売買' },
        'dlg:w-char-bailu:d-bailu-all:line:0': { en: 'The fog price is rising tonight. What are you buying?', ja: '今夜は霧の値段が上がっている。何を買う？' },
        'act:act1:name': { en: 'Act I · Fog Rising', ja: '第一幕・霧立ち' },
        'act:act2:name': { en: 'Act II · Echoes', ja: '第二幕・残響' },
        'act:act3:name': { en: 'Act III · Tide', ja: '第三幕・潮汐' }
      },
      voice: {
        'dlg:w-char-bailu:d-bailu-all:line:0': 'recorded',
        'dlg:w-char-bailu:d-bailu-all:line:1': 'todo',
        'dlg:w-char-bailu:d-bailu-shen:line:0': 'missing'
      }
    },
    assets: [
      { id: 'asset-bailu-portrait', name: '白鹭 · 立绘', type: 'portrait', status: 'ready', path: 'assets/characters/bailu.png', owner: '美术', tags: ['角色', '主要'], linkedModule: 'characters', linkedId: 'bai_lu', notes: '含三种表情' },
      { id: 'asset-oldtown-scene', name: '雾港老城 · 场景', type: 'scene', status: 'wip', path: 'assets/scenes/oldtown', owner: '场景', tags: ['第一幕'], linkedModule: 'world', linkedId: 'w-set-oldtown', notes: '雨夜版本待补' },
      { id: 'asset-third-letter-voice', name: '第三封信 · 白鹭配音', type: 'voice', status: 'missing', path: '', owner: '音频', tags: ['语音'], linkedModule: 'world', linkedId: 'w-char-bailu', notes: '' },
      { id: 'asset-clocktower-score', name: '钟楼主题 · BGM', type: 'audio', status: 'ready', path: 'assets/audio/clocktower.ogg', owner: '音频', tags: ['第三幕'], linkedModule: 'narrative', linkedId: 'n11', notes: '' }
    ],
    production: {
      tasks: [
        { id: 'task-act1-whitebox', title: '第一幕场景白盒', module: 'narrative', refId: 'act1', status: 'doing', owner: '关卡', estimate: 5, priority: 'high', sourceKey: 'act:act1', notes: '' },
        { id: 'task-bailu-portrait', title: '白鹭立绘三表情', module: 'characters', refId: 'bai_lu', status: 'review', owner: '美术', estimate: 3, priority: 'high', sourceKey: 'char:bai_lu', notes: '' },
        { id: 'task-third-letter-voice', title: '第三封信配音', module: 'world', refId: 'w-char-bailu', status: 'todo', owner: '音频', estimate: 1, priority: 'medium', sourceKey: 'voice:third-letter', notes: '' },
        { id: 'task-localize-ch1', title: '第一章英文本地化', module: 'localization', refId: 'n1', status: 'todo', owner: '本地化', estimate: 2, priority: 'medium', sourceKey: 'loc:act1', notes: '' }
      ],
      milestones: [
        { id: 'ms-vertical-slice', name: '垂直切片', date: '2026-11-15', done: false },
        { id: 'ms-content-lock', name: '内容锁版', date: '2026-12-10', done: false }
      ]
    },
    storyboard: {
      beats: [
        { id: 'beat-rain-tram', title: '雨夜列车进站', actId: 'act1', nodeId: 'n1', duration: 18, camera: '车窗外雨幕 → 缓慢推近沈砚', audio: '雨声 / 铁轨低频 / 无配乐', animation: '沈砚醒来、低头看信', vfx: '雨、车窗雾', notes: '开场 8 秒内不出现对白' },
        { id: 'beat-platform', title: '月台擦肩', actId: 'act1', nodeId: 'n2', duration: 12, camera: '肩后跟拍，白鹭只露半张脸', audio: '站台广播、脚步回声', animation: '白鹭塞票、转身离开', vfx: '雾', notes: '' },
        { id: 'beat-clocktower', title: '钟楼对峙', actId: 'act3', nodeId: 'n11', duration: 26, camera: '环绕双人 → 俯拍钟摆', audio: '钟声、潮水、弦乐渐强', animation: '铁鸦拔枪、沈砚后退', vfx: '雨、钟摆尘埃', notes: '需与战斗场景无缝衔接' }
      ]
    },
    storylets: [
      { id: 'st-fog-letter', name: '雾中的第二封信', description: '当玩家持有第三封信且信任白鹭时，在雾港老城触发额外线索。', tags: ['主线', '白鹭'], conditions: [{ expr: 'flags.has_third_letter == true && flags.bailu_ally == true', label: '有信且白鹭同盟' }], effects: { flags: { fog_second_letter: true }, quests: { 'q-third-letter': 'active' } }, weight: 3, salience: 8, once: true, cooldown: 0, notes: '' },
      { id: 'st-clock-rumor', name: '钟楼的传闻', description: '玩家进入钟楼集后听到关于铁鸦的传闻。', tags: ['支线', '钟楼'], conditions: [{ expr: 'flags.entered_clocktower == true', label: '进入钟楼' }], effects: { flags: { clock_rumor: true } }, weight: 2, salience: 5, once: true, cooldown: 0, notes: '' },
      { id: 'st-memory-echo', name: '记忆回响', description: '低信任、高压力时出现的一段错位记忆。', tags: ['角色', '沈砚'], conditions: [{ expr: 'flags.has_third_letter == true', label: '持有第三封信' }], effects: { flags: { memory_echo: true } }, weight: 1, salience: 3, once: false, cooldown: 2, notes: '' }
    ],
    reviews: [
      { id: 'rev-trade-cost', module: 'narrative', entityId: 'n9', entityLabel: '白鹭的交易', author: '叙事总监', text: '交易代价需要更具体：失去哪一段记忆？最好在后续节点可见后果。', status: 'open', createdAt: '2026-10-20T10:30:00.000Z', replies: [] },
      { id: 'rev-voice-priority', module: 'world', entityId: 'w-char-bailu', entityLabel: '白鹭', author: '音频', text: '第三封信的配音优先级建议提到 P0，它承担反转信息。', status: 'resolved', createdAt: '2026-10-19T16:10:00.000Z', replies: [{ id: 'r1', author: '制作人', text: '同意，已加入垂直切片范围。', createdAt: '2026-10-20T09:00:00.000Z' }] }
    ],
    access: {
      contentWarnings: ['失踪', '记忆篡改', '暴力威胁'],
      textSpeed: 32,
      autoDelay: 2.5,
      fontScale: 1,
      reduceMotion: false
    }
  }
}
