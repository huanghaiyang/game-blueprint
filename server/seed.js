/** 演示企划：雾港回声 —— 剧情、角色、数值、分支、推理、蓝图全量示例数据。 */
import { defaultStudio, demoStudio } from './studio.js'

/** 模块开关默认值：推理默认关闭（并非所有企划都需要推理）。 */
export const DEFAULT_MODULES = {
  dashboard: true,
  narrative: true,
  characters: true,
  stats: true,
  combat: true,
  branches: true,
  blueprint: true,
  world: true,
  inference: false,
  studio: true
}

/* ---------------- 开放世界演示地图 ---------------- */

export const DEFAULT_WORLD_CATEGORIES = [
  { id: 'terrain', name: '地形', emoji: '🏞️', builtin: true },
  { id: 'site', name: '据点', emoji: '🏰', builtin: true },
  { id: 'content', name: '内容', emoji: '🎭', builtin: true }
]

function pathElement(id, type, name, coords, width, color) {
  const [x, y] = coords[0]
  return {
    id,
    type,
    name,
    x,
    y,
    color,
    points: coords.map(([px, py]) => ({ x: px - x, y: py - y })),
    data: { width }
  }
}

const line = (speaker, text) => ({ speaker, text })
const choice = (label, response) => ({ label, response })
const quest = (id, title, summary, objectives, reward) => ({
  id,
  title,
  summary,
  objectives: objectives.map((text) => ({ text, done: false })),
  reward,
  status: '未接取'
})
const dialogue = (id, name, audienceIds, lines, choices, questData = null) => ({
  id,
  name,
  audienceIds,
  lines,
  choices,
  quest: questData
})

export function seedWorld() {
  const elements = [
    // 区域（先画，作为底图）
    { id: 'w-region-mist', type: 'region', name: '雾语森林', x: -1180, y: -260, radius: 520, color: '#4ade80', data: { regionType: '森林', danger: 3, effect: '低语会缓慢消耗理智，雾浓时方向感下降。' } },
    { id: 'w-region-salt', type: 'region', name: '盐沼', x: -560, y: 720, radius: 430, color: '#2dd4bf', data: { regionType: '沼泽', danger: 4, effect: '持续掉血；盐雾会腐蚀金属装备。' } },
    { id: 'w-region-clock', type: 'region', name: '钟楼区', x: 420, y: -350, radius: 430, color: '#fbbf24', data: { regionType: '城区', danger: 2, effect: '钟声范围内移动速度 +10%，但会引来雾中生物。' } },
    { id: 'w-region-strait', type: 'region', name: '雾港海峡', x: 1050, y: 520, radius: 500, color: '#38bdf8', data: { regionType: '海域', danger: 5, effect: '能见度极低，需要灯塔或潮汐罗盘指引。' } },
    { id: 'w-region-north', type: 'region', name: '北岭', x: -220, y: -960, radius: 400, color: '#94a3b8', data: { regionType: '山地', danger: 4, effect: '寒冷：火把消耗翻倍，夜间视野缩短。' } },

    // 聚落
    {
      id: 'w-set-oldtown', type: 'settlement', name: '雾港老城', x: -780, y: -60, radius: 300, color: '#67e8f9',
      data: {
        faction: '港务局', population: 4200, hostile: false, safeZone: true,
        services: ['商店', '铁匠', '酒馆', '任务'],
        buffs: [{ name: '潮汐庇护', desc: '在城内每 10 秒恢复 2% 生命。' }],
        notes: '雾港唯一还算像样的地方。入夜后巡夜队会关闭东门。'
      }
    },
    {
      id: 'w-set-clock', type: 'settlement', name: '钟楼集', x: 420, y: -360, radius: 220, color: '#fbbf24',
      data: {
        faction: '民间', population: 860, hostile: false, safeZone: true,
        services: ['修表', '任务', '交易所'],
        buffs: [{ name: '齿轮专注', desc: '制作与修理成功率 +10%。' }],
        notes: '钟楼下的小集市，阿禾的修表铺就在广场西侧。'
      }
    },
    {
      id: 'w-set-north', type: 'settlement', name: '北岸哨站', x: 760, y: -780, radius: 170, color: '#7dd3fc',
      data: {
        faction: '港务局', population: 120, hostile: false, safeZone: true,
        services: ['补给', '任务'],
        buffs: [{ name: '哨戒视野', desc: '附近隐身单位显形。' }],
        notes: '铁鸦的地盘。哨塔上能看见整个北岸。'
      }
    },
    {
      id: 'w-set-salt', type: 'settlement', name: '盐沼营地', x: -520, y: 760, radius: 240, color: '#fb7185',
      data: {
        faction: '雾教', population: 210, hostile: true, safeZone: false,
        services: ['黑市'],
        buffs: [{ name: '盐雾适应', desc: '在盐沼中不再减速（仅对雾教成员生效）。' }],
        notes: '雾教的补给点。外人进入会被盘问，建议带上雾中女士的信物。'
      }
    },

    // 建筑
    { id: 'w-build-teahouse', type: 'building', name: '老城茶馆', x: -840, y: -10, color: '#fbbf24', data: { function: '茶馆', owner: '白鹭', narrativeNodeId: 'n7' } },
    { id: 'w-build-archive', type: 'building', name: '港务局档案室', x: -700, y: -150, color: '#94a3b8', data: { function: '档案室', owner: '港务局', narrativeNodeId: 'n10' } },
    { id: 'w-build-watchshop', type: 'building', name: '阿禾修表铺', x: 360, y: -420, color: '#fcd34d', data: { function: '修表铺', owner: '阿禾', narrativeNodeId: '' } },
    { id: 'w-build-warehouse', type: 'building', name: '废弃货栈', x: -80, y: 140, color: '#a8a29e', data: { function: '货栈', owner: '无', narrativeNodeId: 'n4' } },
    { id: 'w-build-lighthouse', type: 'building', name: '雾港灯塔', x: 1080, y: 430, color: '#fde68a', data: { function: '灯塔', owner: '港务局', narrativeNodeId: '' } },
    { id: 'w-build-dock', type: 'building', name: '老城码头', x: -980, y: 150, color: '#7dd3fc', data: { function: '码头', owner: '港务局', narrativeNodeId: '' } },

    // 重要据点
    { id: 'w-hold-clocktower', type: 'stronghold', name: '钟楼', x: 420, y: -300, color: '#c084fc', data: { faction: '民间', level: 2, defense: 60, narrativeNodeId: 'n11' } },
    { id: 'w-hold-fort', type: 'stronghold', name: '北岸炮台', x: 860, y: -840, color: '#94a3b8', data: { faction: '港务局', level: 3, defense: 90, narrativeNodeId: '' } },

    // 角色 / NPC
    {
      id: 'w-char-bailu', type: 'character', name: '白鹭', x: -790, y: -30, color: '#f0abfc',
      data: {
        characterId: 'bai_lu', faction: '独立', level: 6,
        dialogues: [
          dialogue('d-bailu-all', '情报买卖', [], [
            line('白鹭', '雾港不问你从哪来，只问你付得起什么。'),
            line('白鹭', '第三封信？那可不便宜。')
          ], [
            choice('问第三封信', '去钟楼集找阿禾，他见过送信的人。别走正门。'),
            choice('问货舱的事', '你终于学会怀疑了。货舱里的箱子，最好别一个人去开。')
          ]),
          dialogue('d-bailu-shen', '只对沈砚说的话', ['shen_yan'], [
            line('白鹭', '你欠我的两段记忆，还记得吗？'),
            line('白鹭', '别急着还。先活着走出雾港。')
          ], [
            choice('我会还的', '那就先把第三封信找回来。'),
            choice('你在替谁做事？', '替一个已经死了的人。')
          ], quest('q-third-letter', '第三封信的线索', '白鹭要你去钟楼集确认第三封信的收信人，并把结果带回来。', ['前往钟楼集', '与阿禾交谈', '把结果带回老城茶馆'], '雾港情报网通行证'))
        ]
      }
    },
    {
      id: 'w-char-ahe', type: 'character', name: '阿禾', x: 395, y: -445, color: '#fcd34d',
      data: {
        characterId: 'a_he', faction: '民间', level: 3,
        dialogues: [
          dialogue('d-ahe-all', '钟摆的维修记录', ['shen_yan', 'bai_lu'], [
            line('阿禾', '钟楼停了七分钟，不是坏了，是有人让它停的。'),
            line('阿禾', '我爹的维修记录里，夹着三枚旧齿轮。')
          ], [
            choice('能给我看看记录吗？', '可以，但你得先帮我把三枚齿轮找回来。'),
            choice('谁让你停的钟？', '一个戴帽子的人。他没说名字，只给了很多钱。')
          ], quest('q-clock', '修好钟摆', '阿禾需要三枚旧齿轮才能修好钟楼，钟声或许能驱散雾。', ['找到旧齿轮（钟楼区）', '找到第二枚齿轮（盐沼）', '把齿轮交给阿禾'], '钟楼钥匙'))
        ]
      }
    },
    {
      id: 'w-char-tieya', type: 'character', name: '铁鸦', x: 780, y: -800, color: '#fca5a5',
      data: {
        characterId: 'tie_ya', faction: '港务局', level: 8,
        dialogues: [
          dialogue('d-tieya-shen', '执法官的警告', ['shen_yan'], [
            line('铁鸦', '巡夜人，你最近走得太远了。'),
            line('铁鸦', '把第三封信交出来，我可以当什么都没发生。')
          ], [
            choice('信不在我手上', '那就去找。找到之前，别回老城。'),
            choice('是你写的吗？', '……你比我想的更聪明，也更麻烦。')
          ], quest('q-hand-in', '交出第三封信', '铁鸦要求你交出第三封信，换取巡夜队的通行权限。', ['找到第三封信', '决定是否交给铁鸦'], '北岸通行令'))
        ]
      }
    },
    {
      id: 'w-char-lady', type: 'character', name: '雾中女士', x: -180, y: -880, color: '#a78bfa',
      data: {
        characterId: 'lady_mist', faction: '雾教', level: 12,
        dialogues: [
          dialogue('d-lady-shen', '名字的代价', ['shen_yan'], [
            line('雾中女士', '沈砚不是你的名字。你猜，谁替你取的？'),
            line('雾中女士', '拿一段记忆来换，我就告诉你。')
          ], [
            choice('换', '成交。但我只收你最想忘记的那一段。'),
            choice('不换', '那就带着你的名字，继续在雾里走。')
          ], quest('q-name', '名字的代价', '雾中女士愿意用真相交换一段记忆；代价由你决定。', ['前往雾中石门', '与雾中女士对话', '做出交易选择'], '被抹去的三年'))
        ]
      }
    },
    { id: 'w-char-player', type: 'character', name: '沈砚（出生点）', x: -880, y: -60, color: '#7dd3fc', data: { characterId: 'shen_yan', player: true, faction: '港务局', level: 5, dialogues: [] } },
    {
      id: 'w-char-fisher', type: 'character', name: '渔夫老周', x: 980, y: 320, color: '#86efac',
      data: {
        characterId: null, faction: '民间', level: 1,
        dialogues: [
          dialogue('d-fisher-all', '失踪的渔网', [], [
            line('渔夫老周', '我的渔网昨夜被什么东西拖进海里了。'),
            line('渔夫老周', '你要是能帮我找回来，我请你喝鱼汤。')
          ], [
            choice('我去看看', '谢了！就在灯塔下面的礁石边。'),
            choice('最近海里不太平', '可不是嘛，雾一起来，连鱼都不见了。')
          ], quest('q-net', '失踪的渔网', '老周的渔网被拖到了灯塔礁石边，帮他找回来。', ['在灯塔礁石边搜索', '把渔网带回给老周'], '鱼汤配方'))
        ]
      }
    },
    {
      id: 'w-char-merchant', type: 'character', name: '行商', x: 180, y: 140, color: '#fbbf24',
      data: {
        characterId: null, faction: '商会', level: 2,
        dialogues: [
          dialogue('d-merchant-all', '走南闯北', [], [
            line('行商', '老城收盐，盐沼收命。你要哪种？'),
            line('行商', '我这儿有地图，不过价格随雾的浓度浮动。')
          ], [
            choice('看看地图', '五十枚铜币，不还价。雾散了就涨价。'),
            choice('打听盐沼的路', '沿着盐溪走，看见红灯笼就回头。')
          ])
        ]
      }
    },
    {
      id: 'w-char-guard', type: 'character', name: '盐沼守卫', x: -520, y: 790, color: '#fb7185',
      data: {
        characterId: null, faction: '雾教', level: 5, hostile: true,
        dialogues: [
          dialogue('d-guard-all', '此路不通', [], [
            line('盐沼守卫', '雾教的地盘，外人止步。'),
            line('盐沼守卫', '除非你带来雾中女士的口信。')
          ], [
            choice('我有信物', '……进去吧，别碰祭坛。'),
            choice('让开', '那就别怪我不客气。')
          ])
        ]
      }
    },

    // 可收集物
    { id: 'w-item-key', type: 'collectible', name: '生锈的钟楼钥匙', x: 520, y: -250, color: '#fbbf24', data: { itemName: '钟楼钥匙', rarity: '稀有', amount: 1, respawn: false } },
    { id: 'w-item-letter', type: 'collectible', name: '第三封信残页', x: -360, y: -760, color: '#f0abfc', data: { itemName: '第三封信残页', rarity: '传说', amount: 1, respawn: false } },
    { id: 'w-item-shell', type: 'collectible', name: '记忆贝壳', x: 920, y: 560, color: '#67e8f9', data: { itemName: '记忆贝壳', rarity: '普通', amount: 3, respawn: true } },
    { id: 'w-item-lotus', type: 'collectible', name: '雾莲', x: -1080, y: -300, color: '#86efac', data: { itemName: '雾莲', rarity: '稀有', amount: 2, respawn: true } },
    { id: 'w-item-salt', type: 'collectible', name: '盐晶簇', x: -430, y: 620, color: '#5eead4', data: { itemName: '盐晶', rarity: '普通', amount: 5, respawn: true } },
    { id: 'w-item-gear', type: 'collectible', name: '旧齿轮', x: 320, y: -380, color: '#a8a29e', data: { itemName: '旧齿轮', rarity: '稀有', amount: 1, respawn: false } },
    { id: 'w-item-compass', type: 'collectible', name: '潮汐罗盘', x: 1120, y: 380, color: '#fde68a', data: { itemName: '潮汐罗盘', rarity: '传说', amount: 1, respawn: false } },

    // 树木
    { id: 'w-tree-1', type: 'tree', name: '雾松', x: -1320, y: -120, color: '#4ade80', data: { species: '雾松', height: 18 } },
    { id: 'w-tree-2', type: 'tree', name: '雾松', x: -1240, y: 80, color: '#4ade80', data: { species: '雾松', height: 22 } },
    { id: 'w-tree-3', type: 'tree', name: '老槐', x: -1120, y: 240, color: '#86efac', data: { species: '老槐', height: 15 } },
    { id: 'w-tree-4', type: 'tree', name: '雾松', x: -1110, y: -360, color: '#4ade80', data: { species: '雾松', height: 20 } },
    { id: 'w-tree-5', type: 'tree', name: '老槐', x: -980, y: 440, color: '#86efac', data: { species: '老槐', height: 14 } },
    { id: 'w-tree-6', type: 'tree', name: '雾松', x: -1380, y: -320, color: '#4ade80', data: { species: '雾松', height: 24 } },
    { id: 'w-tree-7', type: 'tree', name: '枯柳', x: -1420, y: 60, color: '#a3a35c', data: { species: '枯柳', height: 12 } },
    { id: 'w-tree-8', type: 'tree', name: '盐桦', x: -620, y: 560, color: '#a3e635', data: { species: '盐桦', height: 10 } },

    // 山川
    { id: 'w-mtn-1', type: 'mountain', name: '北岭主峰', x: -420, y: -1020, radius: 180, color: '#94a3b8', data: { peaks: 5, danger: 4 } },
    { id: 'w-mtn-2', type: 'mountain', name: '断崖', x: -40, y: -1080, radius: 140, color: '#94a3b8', data: { peaks: 3, danger: 3 } },
    { id: 'w-mtn-3', type: 'mountain', name: '鹰嘴岩', x: 260, y: -920, radius: 120, color: '#94a3b8', data: { peaks: 3, danger: 4 } },
    { id: 'w-mtn-4', type: 'mountain', name: '西海礁', x: 1000, y: 700, radius: 110, color: '#64748b', data: { peaks: 2, danger: 2 } },

    // 河流与道路
    pathElement('w-river-mist', 'river', '雾河', [[-1500, -520], [-1220, -360], [-960, -200], [-780, -60], [-560, 200], [-400, 460], [-300, 720], [-200, 1100]], 26, '#38bdf8'),
    pathElement('w-river-salt', 'river', '盐溪', [[-820, 900], [-660, 830], [-520, 760], [-320, 700], [-180, 560]], 14, '#2dd4bf'),
    pathElement('w-road-main', 'road', '雾港官道', [[-780, -60], [-420, 90], [-40, -120], [420, -360]], 8, '#a8a29e'),
    pathElement('w-road-clock', 'road', '钟楼小径', [[420, -360], [700, -200], [980, 240]], 6, '#a8a29e'),
    pathElement('w-road-north', 'road', '北岸栈道', [[760, -780], [600, -600], [420, -360]], 6, '#a8a29e'),

    // 传送门
    { id: 'w-portal-dock', type: 'portal', name: '老城码头传送门', x: -1000, y: 170, color: '#67e8f9', data: { targetId: 'w-set-north', requirement: '雾港通行证', twoWay: true } },
    { id: 'w-portal-mist', type: 'portal', name: '雾中石门', x: -300, y: -820, color: '#a78bfa', data: { targetId: 'w-set-salt', requirement: '第三封信', twoWay: true } },

    // 路引
    { id: 'w-sign-old', type: 'sign', name: '老城路引', x: -500, y: 40, color: '#fbbf24', data: { direction: '←', destination: '雾港老城', distance: 300 } },
    { id: 'w-sign-clock', type: 'sign', name: '钟楼路引', x: 300, y: -230, color: '#fbbf24', data: { direction: '→', destination: '钟楼集', distance: 180 } },
    { id: 'w-sign-north', type: 'sign', name: '北岸路引', x: 620, y: -640, color: '#fbbf24', data: { direction: '↗', destination: '北岸哨站', distance: 220 } },
    { id: 'w-sign-salt', type: 'sign', name: '盐沼警示牌', x: -700, y: 560, color: '#fb7185', data: { direction: '↓', destination: '盐沼（危险）', distance: 260 } },

    // 公告栏
    {
      id: 'w-board-old', type: 'bulletin', name: '老城布告栏', x: -700, y: 50, color: '#fbbf24',
      data: {
        posts: [
          { id: 'p1', title: '寻人：巡夜人沈砚', kind: 'notice', content: '港务局悬赏知情者，赏金面议。' },
          { id: 'p2', title: '悬赏：盐沼走私', kind: 'quest', content: '查获走私盐晶者，可到巡夜队领取赏金。' }
        ]
      }
    },
    {
      id: 'w-board-clock', type: 'bulletin', name: '钟楼集告示板', x: 470, y: -300, color: '#fbbf24',
      data: {
        posts: [{ id: 'p3', title: '钟楼维修募捐', kind: 'quest', content: '阿禾在筹钱修钟，愿意帮忙的人请到修表铺。' }]
      }
    }
  ]

  return { name: '雾港群岛', scaleLabel: '1 格 ≈ 20 米', categories: DEFAULT_WORLD_CATEGORIES.map((c) => ({ ...c })), customTypes: [], elements }
}

function starterCharacter(base, growth, name = '主角', color = '#7dd3fc') {
  return {
    id: `char-${Date.now().toString(36)}`,
    name,
    role: '主角',
    faction: '',
    age: null,
    archetype: '',
    tags: [],
    color,
    motivation: '',
    flaw: '',
    bio: '',
    arc: { start: '', midpoint: '', end: '' },
    base: { ...base },
    growth: { ...growth },
    skillIds: ['pierce'],
    relations: []
  }
}

/** 新建空白企划：带一套通用属性/技能/战斗预设，方便立刻上手。 */
export function blankProject({ name = '未命名企划', meta = {}, modules = {} } = {}) {
  const demo = seedProject()
  const resolvedModules = { ...DEFAULT_MODULES, ...modules }
  resolvedModules.inference = modules.inference === true
  const attrs = demo.stats.attributes
  const base = {}
  const growth = {}
  for (const a of attrs) {
    if (a.kind === 'derived') continue
    base[a.key] = a.base
    growth[a.key] = a.growth
  }
  return {
    id: `proj-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    meta: {
      genre: '',
      tone: '',
      logline: '',
      author: '',
      platform: '',
      playtime: '',
      version: '0.1.0',
      ...meta,
      modules: resolvedModules
    },
    blueprint: { acts: [{ id: 'act1', name: '第一幕', goal: '', tensionTarget: 30 }], themes: [] },
    stats: structuredClone(demo.stats),
    skills: structuredClone(demo.skills),
    combat: structuredClone(demo.combat),
    characters: [starterCharacter(base, growth)],
    narrative: {
      startId: 'n1',
      nodes: [{ id: 'n1', title: '开场', type: 'scene', act: 'act1', tension: 10, summary: '故事从这里开始。', text: '' }],
      edges: []
    },
    cases: [],
    world: { name: `${name}的世界`, scaleLabel: '1 格 ≈ 20 米', categories: DEFAULT_WORLD_CATEGORIES.map((c) => ({ ...c })), customTypes: [], elements: [] },
    ...defaultStudio()
  }
}

export function seedProject() {
  const attributes = [
    { key: 'hp', label: '生命', group: '资源', kind: 'primary', base: 100, growth: 12, min: 1, unit: '', desc: '归零即退场' },
    { key: 'atk', label: '攻击', group: '主属性', kind: 'primary', base: 12, growth: 2.4, min: 0, unit: '', desc: '物理伤害基数' },
    { key: 'def', label: '防御', group: '主属性', kind: 'primary', base: 6, growth: 1.2, min: 0, unit: '', desc: '按 100/(100+def) 减伤' },
    { key: 'spd', label: '速度', group: '主属性', kind: 'primary', base: 10, growth: 0.6, min: 1, unit: '', desc: '决定出手顺序' },
    { key: 'crit', label: '暴击率', group: '次属性', kind: 'primary', base: 0.08, growth: 0.004, min: 0, max: 1, unit: '%', desc: '0~1' },
    { key: 'critDmg', label: '暴击伤害', group: '次属性', kind: 'primary', base: 1.5, growth: 0.01, min: 1, unit: 'x', desc: '暴击倍率' },
    { key: 'acc', label: '命中率', group: '次属性', kind: 'primary', base: 0.92, growth: 0.002, min: 0, max: 1, unit: '%', desc: '对闪避的对抗值' },
    { key: 'dodge', label: '闪避率', group: '次属性', kind: 'primary', base: 0.05, growth: 0.003, min: 0, max: 0.5, unit: '%', desc: '上限 50%' },
    { key: 'mag', label: '法术强度', group: '主属性', kind: 'primary', base: 10, growth: 2, min: 0, unit: '', desc: '法术伤害基数' },
    { key: 'res', label: '法术抗性', group: '主属性', kind: 'primary', base: 3, growth: 0.8, min: 0, unit: '', desc: '法术减伤' },
    { key: 'power', label: '综合战力', group: '派生', kind: 'derived', base: 0, growth: 0, unit: '', formula: 'atk * (1 + crit * (critDmg - 1)) * (0.8 + spd / 100) + hp * 0.15 + def * 1.2 + mag * 0.6', desc: '用于横向比较角色强度' },
    { key: 'ehp', label: '有效生命', group: '派生', kind: 'derived', base: 0, growth: 0, unit: '', formula: 'hp / (1 - dodge) * (1 + def / 100)', desc: '含减伤与闪避的等效血量' },
    { key: 'dps', label: '期望输出', group: '派生', kind: 'derived', base: 0, growth: 0, unit: '', formula: 'atk * acc * (1 + crit * (critDmg - 1)) * (100 / 120)', desc: '对 20 防御标准靶的期望伤害' },
    { key: 'ttk', label: '击杀回合', group: '派生', kind: 'derived', base: 0, growth: 0, unit: '回合', formula: '1000 / (atk * acc * (1 + crit * (critDmg - 1)) * (100 / 120))', desc: '击穿 1000 HP 标准靶所需回合' }
  ]

  const formulas = [
    { id: 'burst', name: '爆发上限', expr: 'atk * critDmg * 2.2', unit: '伤害', desc: '一次高倍率技能的伤害上限' },
    { id: 'survival', name: '生存指数', expr: 'hp * (1 + def / 100) / (1 - dodge)', unit: '', desc: '与 ehp 相近，保留用于对照' },
    { id: 'speedEdge', name: '先手优势', expr: 'spd * acc * (1 + crit)', unit: '', desc: '速度与命中的复合权重' },
    { id: 'balance', name: '均衡度', expr: 'min(hp / 100, atk / 12, def / 6, spd / 10) / max(hp / 100, atk / 12, def / 6, spd / 10)', unit: '', desc: '越接近 1 越均衡' }
  ]

  const skills = [
    { id: 'basic', name: '普通攻击', power: 1, hits: 1, critBonus: 0, cooldown: 0, weight: 1, type: 'physical', desc: '始终可用' },
    { id: 'pierce', name: '突刺', power: 1.15, hits: 1, critBonus: 0.05, cooldown: 0, weight: 3, type: 'physical', desc: '稳定的高频手段' },
    { id: 'combo', name: '三段连击', power: 0.52, hits: 3, critBonus: 0, cooldown: 1, weight: 2, type: 'physical', desc: '多段判定，吃暴击' },
    { id: 'heavy', name: '重斩', power: 1.8, hits: 1, critBonus: 0, cooldown: 2, weight: 2, type: 'physical', desc: '高倍率慢速' },
    { id: 'execute', name: '处决', power: 2.3, hits: 1, critBonus: 0.2, cooldown: 3, weight: 1, type: 'physical', desc: '低频率斩杀' },
    { id: 'hex', name: '雾咒', power: 1.5, hits: 1, critBonus: 0.05, cooldown: 2, weight: 3, type: 'magic', desc: '以 mag 对抗 res' }
  ]

  const characters = [
    {
      id: 'shen_yan',
      name: '沈砚',
      role: '主角 · 巡夜人',
      faction: '港务局巡夜队',
      age: 29,
      archetype: '沉默的追索者',
      tags: ['失忆', '忠诚', '刀'],
      color: '#7dd3fc',
      motivation: '找回被抹去的三年，以及那三年里答应过谁',
      flaw: '习惯服从体制，把怀疑留给自己',
      bio: '雾港最年轻的巡夜人，三年前在一场大雾中失去记忆。随身带一把没有编号的短刀，刀鞘里刻着「第三封信」。',
      arc: { start: '服从命令的巡夜人', midpoint: '发现档案被篡改，开始怀疑体制', end: '公开真相，放弃巡夜人身份' },
      base: { hp: 120, atk: 14, def: 8, spd: 11, crit: 0.1, critDmg: 1.55, acc: 0.94, dodge: 0.06, mag: 8, res: 5 },
      growth: { hp: 14, atk: 2.6, def: 1.4, spd: 0.7, crit: 0.004, critDmg: 0.01, acc: 0.002, dodge: 0.003, mag: 1.2, res: 0.6 },
      skillIds: ['pierce', 'heavy'],
      relations: [
        { targetId: 'bai_lu', type: '情报同盟', value: 0.6, note: '欠她两段记忆' },
        { targetId: 'tie_ya', type: '上下级', value: -0.3, note: '敬重但开始怀疑' },
        { targetId: 'a_he', type: '保护', value: 0.8, note: '把他当弟弟' }
      ]
    },
    {
      id: 'bai_lu',
      name: '白鹭',
      role: '情报贩子',
      faction: '独立',
      age: 26,
      archetype: '轻佻的守秘人',
      tags: ['情报', '双面', '雾'],
      color: '#f0abfc',
      motivation: '把妹妹的死亡记录从港务局档案里换出来',
      flaw: '用交易代替信任，关键时刻说不出口',
      bio: '在雾港任何一间茶馆都能找到她。她卖情报，也卖别人的记忆——只要价格合适。',
      arc: { start: '只谈价码的掮客', midpoint: '为沈砚破例一次', end: '在钟楼替他挡下雾咒' },
      base: { hp: 88, atk: 16, def: 5, spd: 16, crit: 0.22, critDmg: 1.7, acc: 0.9, dodge: 0.18, mag: 6, res: 3 },
      growth: { hp: 10, atk: 3, def: 0.9, spd: 1.1, crit: 0.008, critDmg: 0.012, acc: 0.001, dodge: 0.006, mag: 0.8, res: 0.4 },
      skillIds: ['combo', 'pierce'],
      relations: [
        { targetId: 'shen_yan', type: '交易对象', value: 0.5, note: '开始在意' },
        { targetId: 'lady_mist', type: '恐惧', value: -0.8, note: '知道她的真名' }
      ]
    },
    {
      id: 'tie_ya',
      name: '铁鸦',
      role: '港务局执法官',
      faction: '港务局',
      age: 44,
      archetype: '秩序的执行者',
      tags: ['权威', '铁腕', '旧约'],
      color: '#fca5a5',
      motivation: '维持雾港的秩序，哪怕代价是篡改几页纸',
      flaw: '把一切妥协都解释成为了大局',
      bio: '执法队里唯一敢在雾夜出勤的人。左手少了三根手指，据说是年轻时从雾里抢回一条船。',
      arc: { start: '不可质疑的长官', midpoint: '第三封信暴露笔迹', end: '在钟楼下交出徽章' },
      base: { hp: 160, atk: 13, def: 14, spd: 8, crit: 0.06, critDmg: 1.4, acc: 0.94, dodge: 0.03, mag: 4, res: 8 },
      growth: { hp: 18, atk: 2.2, def: 2, spd: 0.4, crit: 0.003, critDmg: 0.008, acc: 0.002, dodge: 0.002, mag: 0.4, res: 1.2 },
      skillIds: ['heavy', 'execute'],
      relations: [
        { targetId: 'shen_yan', type: '下属', value: 0.2, note: '把他当接班人' },
        { targetId: 'lady_mist', type: '旧约', value: -0.5, note: '二十年前的交易' }
      ]
    },
    {
      id: 'lady_mist',
      name: '雾中女士',
      role: '反派 · 雾中低语者',
      faction: '雾教',
      age: null,
      archetype: '温柔的掠夺者',
      tags: ['记忆', '雾', '契约'],
      color: '#a78bfa',
      motivation: '收集足够的名字，让雾退去',
      flaw: '从不认为自己是在掠夺',
      bio: '没有人见过她的脸。她的声音像潮水漫过耳膜，能叫出你早已忘记的名字。',
      arc: { start: '雾中的传说', midpoint: '叫出沈砚的真名', end: '被第三封信钉在钟声里' },
      base: { hp: 130, atk: 10, def: 9, spd: 13, crit: 0.12, critDmg: 1.6, acc: 0.96, dodge: 0.1, mag: 24, res: 14 },
      growth: { hp: 15, atk: 1.8, def: 1.5, spd: 0.8, crit: 0.005, critDmg: 0.01, acc: 0.002, dodge: 0.005, mag: 3.2, res: 1.8 },
      skillIds: ['hex'],
      relations: [
        { targetId: 'shen_yan', type: '契约', value: -0.6, note: '拿走了他三年' }
      ]
    },
    {
      id: 'a_he',
      name: '阿禾',
      role: '少年工匠',
      faction: '民间',
      age: 17,
      archetype: '认真的目击者',
      tags: ['钟表', '证人', '少年'],
      color: '#fcd34d',
      motivation: '修好父亲留下的钟，证明自己不是累赘',
      flaw: '太想被大人认可，容易被人利用',
      bio: '在钟楼底下开了一间修表铺。他记得每一个上过钟楼的人，也记得那晚的脚步声。',
      arc: { start: '躲在铺子里的学徒', midpoint: '交出父亲的维修记录', end: '亲手敲响钟楼的第一声' },
      base: { hp: 95, atk: 9, def: 7, spd: 12, crit: 0.08, critDmg: 1.45, acc: 0.93, dodge: 0.08, mag: 12, res: 6 },
      growth: { hp: 11, atk: 1.6, def: 1.1, spd: 0.7, crit: 0.004, critDmg: 0.008, acc: 0.002, dodge: 0.004, mag: 1.6, res: 0.8 },
      skillIds: ['basic', 'pierce'],
      relations: [
        { targetId: 'shen_yan', type: '仰慕', value: 0.7, note: '把他当英雄' },
        { targetId: 'tie_ya', type: '畏惧', value: -0.4, note: '被盘问过三次' }
      ]
    }
  ]

  const nodes = [
    { id: 'n1', title: '序章 · 雨夜列车', type: 'scene', act: 'act1', tension: 15, summary: '末班车上的无名信与空座位。', text: '雨点把车窗敲成一片毛玻璃。你醒来时，对面座位是空的，膝上多了一封没有署名的信。' },
    { id: 'n2', title: '检票口的陌生人', type: 'choice', act: 'act1', tension: 32, summary: '白鹭把一张站台票塞进你的口袋。', text: '「雾港到了。」她压低帽檐，「今晚别走正门。」' },
    { id: 'n3', title: '车厢暗号', type: 'scene', act: 'act1', tension: 28, summary: '车窗的雾被划出三个符号。', text: '三个符号：潮汐、钟、以及一扇没有门的房间。' },
    { id: 'n4', title: '尾随至货舱', type: 'scene', act: 'act1', tension: 40, summary: '货舱里堆着印有港务局徽记的箱子。', text: '箱子没有封条，里面是一层又一层被盐浸透的信。' },
    { id: 'n5', title: '雾港站台', type: 'scene', act: 'act1', tension: 35, summary: '列车驶入雾港，站台空无一人。', text: '雾从铁轨尽头涌上来，像有人在很深的地方呼吸。' },
    { id: 'n6', title: '货舱对峙', type: 'combat', act: 'act1', tension: 58, summary: '铁鸦的部下堵住了舱门。', text: '「巡夜人，你走错车厢了。」' },
    { id: 'n7', title: '老城茶馆', type: 'hub', act: 'act2', tension: 42, summary: '白鹭在二楼等你，茶凉了三次。', text: '她把茶换成酒：「你要的东西，档案室里有，代价是另一样东西。」' },
    { id: 'n8', title: '被扣押', type: 'scene', act: 'act2', tension: 48, summary: '你在巡夜队地下室醒来，档案被人动过。', text: '门没锁。有人希望你自己走出去，并且记得是谁放了你。' },
    { id: 'n9', title: '白鹭的交易', type: 'choice', act: 'act2', tension: 55, summary: '她开价：一封第三封信，换你的一段记忆。', text: '「用你最想不起来的那段。」她说得很轻。' },
    { id: 'n10', title: '港务局档案室', type: 'scene', act: 'act2', tension: 50, summary: '缺页的账本与一枚钟楼钥匙。', text: '账本缺了七页。第八页的装订线上，挂着一枚生锈的钥匙。' },
    { id: 'n11', title: '钟楼之上', type: 'scene', act: 'act2', tension: 66, summary: '齿轮间回荡着不属于机械的低语。', text: '钟摆停了。雾从齿轮的缝隙里渗出来，带着咸味。' },
    { id: 'n12', title: '独自调查', type: 'scene', act: 'act2', tension: 58, summary: '沿着潮汐线，你找到第三封信的收件人。', text: '收件人一栏写着你自己的名字，笔迹和你的一模一样。' },
    { id: 'n13', title: '雾中女士', type: 'choice', act: 'act3', tension: 80, summary: '她背对着雾，叫出你被抹去的名字。', text: '「沈砚不是你的名字。」她说，「你猜，谁替你取的？」' },
    { id: 'n14', title: '钟摆决斗', type: 'combat', act: 'act3', tension: 92, summary: '钟摆每摆一次，雾就吞掉一层记忆。', text: '你必须在她数到十二之前，把刀送进钟摆的阴影里。' },
    { id: 'n15', title: '交易与真相', type: 'scene', act: 'act3', tension: 78, summary: '女士揭开灰雾的真相，代价是忘记一个人。', text: '「你只能带走一个名字。」钟声从很远的地方传来。' },
    { id: 'n16', title: '尾声 · 潮汐', type: 'ending', act: 'act3', tension: 60, summary: '天亮了，雾港第一次看得见海。', text: '你交出了徽章。白鹭在码头等你，手里没有信。' },
    { id: 'n17', title: '结局 · 沉默的港口', type: 'ending', act: 'act3', tension: 72, summary: '钟响了十二下，港口重新沉进雾里。', text: '没有人记得今晚发生过什么。包括你。' },
    { id: 'n18', title: '隐藏结局 · 第三封信', type: 'ending', act: 'act3', tension: 88, summary: '用第三封信唤醒钟楼，雾退去，名字归还。', text: '信纸烧尽的一刻，雾里所有的名字一起亮了起来。' }
  ]

  const edges = [
    { id: 'e1', from: 'n1', to: 'n2', label: '收起信，下车', type: 'linear' },
    { id: 'e2', from: 'n2', to: 'n3', label: '出示车票', type: 'choice', weight: 1 },
    { id: 'e3', from: 'n2', to: 'n4', label: '跟踪陌生人', type: 'choice', weight: 1, effects: { flags: { saw_smuggling: true } } },
    { id: 'e4', from: 'n3', to: 'n5', label: '记下暗号', type: 'linear', effects: { flags: { heard_whisper: true } } },
    { id: 'e5', from: 'n4', to: 'n6', label: '推开舱门', type: 'linear' },
    { id: 'e6', from: 'n5', to: 'n7', label: '去老城茶馆', type: 'linear' },
    { id: 'e7', from: 'n6', to: 'n7', label: '战斗胜利', type: 'choice', weight: 3 },
    { id: 'e8', from: 'n6', to: 'n8', label: '战斗失败被扣押', type: 'choice', weight: 1 },
    { id: 'e9', from: 'n7', to: 'n9', label: '赴白鹭的约', type: 'choice', weight: 1 },
    { id: 'e10', from: 'n7', to: 'n10', label: '夜探档案室', type: 'choice', weight: 1 },
    { id: 'e11', from: 'n8', to: 'n7', label: '顺着没锁的门离开', type: 'linear' },
    { id: 'e12', from: 'n9', to: 'n11', label: '接受交易', type: 'choice', weight: 1, effects: { flags: { baulu_ally: true, has_third_letter: true } } },
    { id: 'e13', from: 'n9', to: 'n12', label: '拒绝交易', type: 'choice', weight: 1 },
    { id: 'e14', from: 'n10', to: 'n11', label: '带走第三封信', type: 'choice', weight: 2, condition: { expr: 'flags.saw_smuggling == true', label: '需要见过货舱徽记' }, effects: { flags: { has_third_letter: true } } },
    { id: 'e15', from: 'n10', to: 'n12', label: '只抄走账本', type: 'choice', weight: 1 },
    { id: 'e16', from: 'n11', to: 'n13', label: '循着低语上楼', type: 'linear' },
    { id: 'e17', from: 'n12', to: 'n13', label: '去钟楼', type: 'linear' },
    { id: 'e18', from: 'n13', to: 'n14', label: '拔刀', type: 'choice', weight: 1 },
    { id: 'e19', from: 'n13', to: 'n15', label: '谈判', type: 'choice', weight: 1, condition: { expr: 'flags.heard_whisper == true', label: '需要听过雾中低语' } },
    { id: 'e20', from: 'n14', to: 'n16', label: '击碎钟摆', type: 'choice', weight: 3 },
    { id: 'e21', from: 'n14', to: 'n17', label: '被雾吞没', type: 'choice', weight: 1 },
    { id: 'e22', from: 'n15', to: 'n16', label: '忘记她，离开港口', type: 'choice', weight: 2 },
    { id: 'e23', from: 'n15', to: 'n17', label: '记住她，被雾留下', type: 'choice', weight: 1 },
    { id: 'e24', from: 'n11', to: 'n18', label: '用第三封信唤醒钟楼', type: 'conditional', condition: { expr: 'flags.has_third_letter == true && flags.baulu_ally == true', label: '需要第三封信与白鹭同盟' } }
  ]

  const acts = [
    { id: 'act1', name: '第一幕 · 雾起', goal: '把巡夜人拉进失踪案，交出第一封信', tensionTarget: 30 },
    { id: 'act2', name: '第二幕 · 回声', goal: '在交易与档案之间做选择，暴露内部腐败', tensionTarget: 55 },
    { id: 'act3', name: '第三幕 · 潮汐', goal: '钟楼对决，真相与代价', tensionTarget: 82 }
  ]

  const cases = [
    {
      id: 'case_letter',
      title: '第三封信是谁写的',
      question: '是谁把第三封信塞进了沈砚的口袋？',
      culprits: ['tie_ya'],
      solution: {
        suspect: 'tie_ya',
        expectedFacts: ['ink_official', 'sender_official', 'ledger_tampered', 'key_insider', 'alibi_forged', 'tie_ya_sender'],
        reasoning: '夜光墨水为港务局内部专用，第三封信必然出自内部；账本缺页与钟楼钥匙同时指向有档案权限的人；铁鸦的不在现场证明与内部信件相互矛盾，最终指向铁鸦。白鹭虽有阿禾的目击证词，但她的行为可由「送信人」解释，应被排除。'
      },
      suspects: [
        { id: 'tie_ya', name: '铁鸦', role: '港务局执法官', traits: { access_ledger: true, night_shift: true, lost_fingers: true } },
        { id: 'bai_lu', name: '白鹭', role: '情报贩子', traits: { street_informant: true, archive_visitor: true } },
        { id: 'a_he', name: '阿禾', role: '钟表匠学徒', traits: { apprentice: true, witness: true } },
        { id: 'lady_mist', name: '雾中女士', role: '雾中低语者', traits: { mist_voice: true, no_identity: true } }
      ],
      clues: [
        { id: 'c_letter', name: '第三封信', desc: '纸张带港务局水印，收件人一栏写着沈砚的名字。', found: true, weight: 3 },
        { id: 'c_ink', name: '夜光墨水', desc: '只在雾夜显形，港务局内部专用。', found: true, weight: 3 },
        { id: 'c_ledger', name: '缺页账本', desc: '账本缺了七页，第八页装订线上挂着钟楼钥匙。', found: true, weight: 3 },
        { id: 'c_key', name: '钟楼钥匙', desc: '能打开钟楼机械层的三把钥匙之一。', found: true, weight: 2 },
        { id: 'c_alibi', name: '铁鸦的不在场证明', desc: '他声称整夜都在港务局值夜，但值班记录被撕掉了。', found: true, weight: 2 },
        { id: 'c_witness', name: '阿禾的证词', desc: '「那晚我看见一个戴帽子的女人进了档案室。」', found: true, weight: 1 },
        { id: 'c_log', name: '港口值班记录', desc: '被封存在港务局地下库，尚未取得。', found: false, weight: 2 }
      ],
      facts: [],
      rules: [
        { id: 'r_ink', name: '墨水来源', cf: 0.9, when: [{ type: 'clue', id: 'c_ink' }], then: { fact: 'ink_official', label: '夜光墨水为港务局专用' } },
        { id: 'r_sender', name: '内部寄信人', cf: 0.85, when: [{ type: 'fact', name: 'ink_official' }, { type: 'clue', id: 'c_letter' }], then: { fact: 'sender_official', label: '第三封信出自港务局内部' } },
        { id: 'r_ledger', name: '账本被改', cf: 0.9, when: [{ type: 'clue', id: 'c_ledger' }], then: { fact: 'ledger_tampered', label: '账本被系统性篡改' } },
        { id: 'r_key', name: '钥匙权限', cf: 0.85, when: [{ type: 'fact', name: 'ledger_tampered' }, { type: 'clue', id: 'c_key' }], then: { fact: 'key_insider', label: '能取钥匙者仅内部三人' } },
        { id: 'r_tieya_access', name: '铁鸦有权限', cf: 0.7, when: [{ type: 'fact', name: 'key_insider' }, { type: 'trait', suspect: 'tie_ya', trait: 'access_ledger' }], then: { suspicion: 'tie_ya', reason: '铁鸦有档案权限且在雾夜值勤' } },
        { id: 'r_alibi', name: '不在场证明', cf: 0.9, when: [{ type: 'clue', id: 'c_alibi' }], then: { fact: 'alibi_claimed', label: '铁鸦声称整夜值夜' } },
        { id: 'r_forged', name: '证明被推翻', cf: 0.75, when: [{ type: 'fact', name: 'alibi_claimed' }, { type: 'fact', name: 'sender_official' }], then: { fact: 'alibi_forged', label: '不在场证明与内部信件矛盾' } },
        { id: 'r_sus_tieya', name: '嫌疑上升', cf: 0.7, when: [{ type: 'fact', name: 'alibi_forged' }], then: { suspicion: 'tie_ya', reason: '不在场证明被推翻，且无法解释内部信件' } },
        { id: 'r_witness', name: '目击指向白鹭', cf: 0.6, when: [{ type: 'clue', id: 'c_witness' }, { type: 'fact', name: 'ledger_tampered' }], then: { suspicion: 'bai_lu', reason: '阿禾看见戴帽子的女人进入档案室' } },
        { id: 'r_clear_bai', name: '排除白鹭', cf: 0.8, when: [{ type: 'fact', name: 'sender_official' }, { type: 'clue', id: 'c_witness' }], then: { eliminate: 'bai_lu', reason: '白鹭只是送信人与目击对象，信件权限与笔迹均指向内部' } },
        { id: 'r_final', name: '锁定寄信人', cf: 0.9, when: [{ type: 'fact', name: 'alibi_forged' }, { type: 'fact', name: 'key_insider' }], then: { fact: 'tie_ya_sender', label: '铁鸦即为第三封信的作者' } },
        { id: 'r_verdict', name: '裁决', cf: 0.95, when: [{ type: 'fact', name: 'tie_ya_sender' }], then: { suspicion: 'tie_ya', reason: '最终推理链指向铁鸦' } },
        { id: 'r_log', name: '值班记录补强', cf: 0.8, when: [{ type: 'clue', id: 'c_log' }, { type: 'fact', name: 'alibi_forged' }], then: { fact: 'shift_records', label: '值班记录显示铁鸦当晚离岗两小时' } },
        { id: 'r_log_sus', name: '离岗证据', cf: 0.75, when: [{ type: 'fact', name: 'shift_records' }], then: { suspicion: 'tie_ya', reason: '值班记录显示其离岗' } }
      ]
    }
  ]

  return {
    id: 'proj-mist-harbor',
    name: '雾港回声',
    meta: {
      genre: '悬疑 · 都市奇幻',
      tone: '潮湿、冷冽、缓慢收紧',
      logline: '一个失去三年记忆的巡夜人，在雾港的末班车上收到一封自己写给自己的信。',
      author: '叙事组',
      platform: 'PC 叙事 RPG',
      playtime: '4–6 小时',
      version: '0.3.0',
      modules: { ...DEFAULT_MODULES, inference: true }
    },
    blueprint: { acts, themes: [
      { id: 't_memory', name: '记忆与身份', motif: '雾' },
      { id: 't_truth', name: '真相的代价', motif: '信' },
      { id: 't_trust', name: '信任的交换', motif: '茶' }
    ] },
    stats: { attributes, formulas },
    characters,
    skills,
    combat: {
      defaultPreset: 'duel',
      presets: [
        { id: 'duel', name: '标准决斗', runs: 2000, maxRounds: 15, variance: 0.12, seed: 20260101, critEnabled: true, firstStrike: 'speed' },
        { id: 'elite', name: '精英战', runs: 3000, maxRounds: 25, variance: 0.18, seed: 7, critEnabled: true, firstStrike: 'speed' }
      ],
      dummy: { id: 'dummy', name: '训练假人', base: { hp: 120, atk: 12, def: 8, spd: 10, crit: 0, critDmg: 1.5, acc: 0.9, dodge: 0, mag: 0, res: 0 }, growth: {} }
    },
    narrative: { startId: 'n1', nodes, edges },
    cases,
    world: seedWorld(),
    ...demoStudio()
  }
}
