<script setup>
import { computed, ref, watch } from 'vue'
import { WORLD_TYPES, newDialogue, newQuest, isPathType, isAreaType, resolveCategoryId } from '../worldTypes'

const props = defineProps({
  element: { type: Object, default: null },
  characters: { type: Array, default: () => [] },
  nodes: { type: Array, default: () => [] },
  elements: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  customTypes: { type: Array, default: () => [] }
})
const emit = defineEmits(['delete', 'navigate-narrative'])

const tab = ref('base')
const viewerId = ref(props.characters[0]?.id || '')
const selectedDialogueId = ref('')
const choiceResponse = ref('')

const typeMeta = computed(() => {
  if (!props.element) return null
  if (props.element.type === 'custom') {
    const ct = props.customTypes.find((t) => t.id === props.element.customTypeId)
    return { label: ct?.name || '自定义元素', icon: ct?.icon || props.element.icon || '✨' }
  }
  return WORLD_TYPES[props.element.type] || null
})
const categoryId = computed({
  get: () => (props.element ? resolveCategoryId(props.element, props.categories, props.customTypes) : ''),
  set: (v) => {
    if (props.element) props.element.categoryId = v
  }
})
const data = computed(() => props.element?.data || {})
const isCharacter = computed(() => props.element?.type === 'character')
const dialogues = computed(() => (isCharacter.value ? data.value.dialogues || [] : []))
const availableDialogues = computed(() => {
  if (!viewerId.value) return dialogues.value
  return dialogues.value.filter((d) => !(d.audienceIds || []).length || d.audienceIds.includes(viewerId.value))
})
const activeDialogue = computed(() => dialogues.value.find((d) => d.id === selectedDialogueId.value) || dialogues.value[0] || null)
const quest = computed(() => activeDialogue.value?.quest || null)
const audienceNames = computed(() => (activeDialogue.value?.audienceIds || []).map((id) => props.characters.find((c) => c.id === id)?.name || id))
const portalTargets = computed(() =>
  props.elements.filter((e) => ['settlement', 'stronghold', 'portal'].includes(e.type) && e.id !== props.element?.id)
)
const status = computed(() => {
  if (props.element?.type !== 'settlement') return null
  const d = data.value
  return d.hostile ? { label: '敌对', tone: 'rose' } : d.safeZone ? { label: '安全区', tone: 'green' } : { label: '中立', tone: 'amber' }
})

watch(
  () => props.element?.id,
  () => {
    tab.value = 'base'
    selectedDialogueId.value = dialogues.value[0]?.id || ''
    choiceResponse.value = ''
  },
  { immediate: true }
)
watch(
  () => dialogues.value.length,
  () => {
    if (!dialogues.value.find((d) => d.id === selectedDialogueId.value)) selectedDialogueId.value = dialogues.value[0]?.id || ''
  }
)
watch(selectedDialogueId, () => {
  choiceResponse.value = ''
})

function addDialogue() {
  if (!props.element) return
  if (!Array.isArray(props.element.data.dialogues)) props.element.data.dialogues = []
  const d = newDialogue()
  props.element.data.dialogues.push(d)
  selectedDialogueId.value = d.id
}

function removeDialogue(d) {
  if (!props.element) return
  if (!confirm(`删除对话「${d.name}」？`)) return
  props.element.data.dialogues = dialogues.value.filter((x) => x.id !== d.id)
}

function addLine() {
  if (!activeDialogue.value) return
  activeDialogue.value.lines.push({ speaker: 'NPC', text: '' })
}

function addChoice() {
  if (!activeDialogue.value) return
  activeDialogue.value.choices.push({ label: '新选项', response: '' })
}

function toggleQuest(ev) {
  if (!activeDialogue.value) return
  activeDialogue.value.quest = ev.target.checked ? newQuest() : null
}

function addObjective() {
  if (!quest.value) return
  quest.value.objectives.push({ text: '新目标', done: false })
}

function addBuff() {
  if (!props.element) return
  if (!Array.isArray(props.element.data.buffs)) props.element.data.buffs = []
  props.element.data.buffs.push({ name: '新增益', desc: '' })
}

function onServices(ev) {
  if (!props.element) return
  props.element.data.services = ev.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  ev.target.value = props.element.data.services.join(', ')
}

function addPost() {
  if (!props.element) return
  if (!Array.isArray(props.element.data.posts)) props.element.data.posts = []
  props.element.data.posts.push({ id: `p-${Date.now().toString(36)}`, title: '新公告', kind: 'notice', content: '' })
}

function syncCharacter() {
  if (!props.element || !data.value.characterId) return
  const c = props.characters.find((x) => x.id === data.value.characterId)
  if (!c) return
  props.element.name = c.name
  props.element.color = c.color || props.element.color
  props.element.data.faction = c.faction || ''
}

function goNarrative() {
  const id = data.value.narrativeNodeId
  if (id) emit('navigate-narrative', id)
}

function deleteElement() {
  if (!props.element) return
  if (!confirm(`从地图删除「${props.element.name}」？`)) return
  emit('delete', props.element.id)
}
</script>

<template>
  <aside class="card inspector">
    <div v-if="!element" class="empty">在画布或左侧列表选择一个元素开始编辑</div>
    <template v-else>
      <div class="card-head">
        <span class="type-badge" :style="{ color: element.color }">{{ typeMeta?.icon }} {{ typeMeta?.label }}</span>
        <span class="mono tiny dim right">{{ element.id }}</span>
      </div>
      <div class="inspector-scroll">
        <div class="tabs" style="padding: 0 14px">
          <button class="tab" :class="{ active: tab === 'base' }" @click="tab = 'base'">基础</button>
          <button v-if="isCharacter" class="tab" :class="{ active: tab === 'dialogue' }" @click="tab = 'dialogue'">
            对话与任务
            <span v-if="dialogues.length" class="badge" style="margin-left: 4px">{{ dialogues.length }}</span>
          </button>
        </div>

        <div v-if="tab === 'base'" class="col" style="padding: 12px 14px 18px; gap: 12px">
          <label class="field"><span class="label">名称</span><input v-model="element.name" class="input" /></label>
          <label class="field">
            <span class="label">分类</span>
            <select v-model="categoryId" class="select">
              <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.emoji }} {{ c.name }}</option>
            </select>
          </label>
          <div class="grid grid-2">
            <label class="field"><span class="label">X 坐标</span><input v-model.number="element.x" type="number" step="10" class="input mono" /></label>
            <label class="field"><span class="label">Y 坐标</span><input v-model.number="element.y" type="number" step="10" class="input mono" /></label>
          </div>
          <div class="grid grid-2">
            <label class="field"><span class="label">颜色</span><input v-model="element.color" type="color" class="input color-input" /></label>
            <label v-if="isAreaType(element.type) || element.type === 'custom'" class="field"><span class="label">范围半径</span><input v-model.number="element.radius" type="number" min="0" step="10" class="input mono" /></label>
          </div>

          <!-- 自定义元素 -->
          <template v-if="element.type === 'custom'">
            <div class="row">
              <span class="chip tiny cyan">{{ typeMeta?.icon }} {{ typeMeta?.label }}</span>
              <span class="tiny dim">自定义类型 · 可在「分类与自定义类型」中管理</span>
            </div>
            <label class="field"><span class="label">实例图标（可覆盖类型）</span><input v-model="element.icon" class="input" maxlength="16" placeholder="✨" /></label>
            <label class="field"><span class="label">说明</span><textarea v-model="data.description" class="textarea" rows="2"></textarea></label>
            <div class="hint">半径 &gt; 0 时显示为区域；否则显示为点位。名称、图标和备注按实例保存。</div>
          </template>

          <!-- 聚落 -->
          <template v-if="element.type === 'settlement'">
            <div class="row">
              <span class="chip" :class="status.tone">{{ status.label }}</span>
              <span class="chip tiny" v-if="data.buffs?.length">✦ {{ data.buffs.length }} 个增益</span>
              <span class="tiny dim right">{{ data.population || 0 }} 人</span>
            </div>
            <label class="field"><span class="label">阵营</span><input v-model="data.faction" class="input" /></label>
            <div class="grid grid-2">
              <label class="field"><span class="label">人口</span><input v-model.number="data.population" type="number" min="0" class="input mono" /></label>
              <label class="field"><span class="label">安全区</span>
                <span class="switch-row"><input v-model="data.safeZone" type="checkbox" :disabled="data.hostile" /> <span class="tiny dim">{{ data.safeZone ? '进入不触发战斗' : '可被攻击 / 触发战斗' }}</span></span>
              </label>
            </div>
            <label class="switch-row"><input v-model="data.hostile" type="checkbox" @change="data.hostile && (data.safeZone = false)" /> <span class="small">敌对聚落</span><span class="tiny dim">敌对时自动取消安全区</span></label>
            <label class="field">
              <span class="label">服务（逗号分隔）</span>
              <input :value="(data.services || []).join(', ')" class="input" @change="onServices" />
            </label>
            <div class="row">
              <span class="divider-title" style="margin: 0">聚落增益</span>
              <button class="btn sm ghost right" @click="addBuff">+ 增益</button>
            </div>
            <div v-for="(b, i) in data.buffs || []" :key="i" class="buff-row">
              <input v-model="b.name" class="input slim" placeholder="增益名" />
              <input v-model="b.desc" class="input slim" placeholder="效果说明" />
              <button class="btn sm ghost danger" @click="data.buffs.splice(i, 1)">×</button>
            </div>
            <div v-if="!data.buffs?.length" class="hint">没有增益。聚落可以只作为安全区或敌对据点存在。</div>
          </template>

          <!-- 角色 -->
          <template v-if="element.type === 'character'">
            <label class="field">
              <span class="label">关联角色卡</span>
              <div class="row" style="gap: 6px">
                <select v-model="data.characterId" class="select grow">
                  <option :value="null">独立 NPC（不关联角色卡）</option>
                  <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <button class="btn sm ghost" :disabled="!data.characterId" @click="syncCharacter">同步</button>
              </div>
            </label>
            <div class="grid grid-2">
              <label class="field"><span class="label">阵营</span><input v-model="data.faction" class="input" /></label>
              <label class="field"><span class="label">等级</span><input v-model.number="data.level" type="number" min="1" class="input mono" /></label>
            </div>
            <label class="switch-row"><input v-model="data.player" type="checkbox" /> <span class="small">玩家出生点</span></label>
            <label class="switch-row"><input v-model="data.hostile" type="checkbox" /> <span class="small">敌对 NPC</span></label>
            <div class="notice info" v-if="!data.player">
              <span>i</span><div>在「对话与任务」里配置通用对话、只对特定角色开放的对话、分支选项和任务派发。</div>
            </div>
          </template>

          <!-- 据点 / 建筑 -->
          <template v-if="element.type === 'building' || element.type === 'stronghold'">
            <div class="grid grid-2">
              <label class="field"><span class="label">{{ element.type === 'building' ? '功能' : '阵营' }}</span><input v-if="element.type === 'building'" v-model="data.function" class="input" /><input v-else v-model="data.faction" class="input" /></label>
              <label class="field" v-if="element.type === 'building'"><span class="label">所有者</span><input v-model="data.owner" class="input" /></label>
              <label class="field" v-else><span class="label">等级</span><input v-model.number="data.level" type="number" min="1" class="input mono" /></label>
            </div>
            <label v-if="element.type === 'stronghold'" class="field"><span class="label">防御值</span><input v-model.number="data.defense" type="number" min="0" class="input mono" /></label>
            <label class="field">
              <span class="label">关联剧情节点</span>
              <select v-model="data.narrativeNodeId" class="select">
                <option value="">不关联</option>
                <option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.title }}</option>
              </select>
            </label>
            <button class="btn sm" :disabled="!data.narrativeNodeId" @click="goNarrative">在叙事图谱中打开 →</button>
          </template>

          <!-- 区域 / 山川 -->
          <template v-if="element.type === 'region' || element.type === 'mountain'">
            <div class="grid grid-2">
              <label class="field" v-if="element.type === 'region'"><span class="label">区域类型</span><input v-model="data.regionType" class="input" /></label>
              <label class="field" v-else><span class="label">山峰数量</span><input v-model.number="data.peaks" type="number" min="2" max="6" class="input mono" /></label>
              <label class="field"><span class="label">危险等级</span>
                <select v-model.number="data.danger" class="select">
                  <option v-for="d in 5" :key="d" :value="d">{{ d }} 级</option>
                </select>
              </label>
            </div>
            <label class="field"><span class="label">区域效果</span><textarea v-model="data.effect" class="textarea" rows="3"></textarea></label>
          </template>

          <!-- 收集物 -->
          <template v-if="element.type === 'collectible'">
            <div class="grid grid-2">
              <label class="field"><span class="label">物品名</span><input v-model="data.itemName" class="input" /></label>
              <label class="field"><span class="label">稀有度</span>
                <select v-model="data.rarity" class="select">
                  <option>普通</option><option>稀有</option><option>史诗</option><option>传说</option>
                </select>
              </label>
              <label class="field"><span class="label">数量</span><input v-model.number="data.amount" type="number" min="1" class="input mono" /></label>
              <label class="switch-row" style="margin-top: 18px"><input v-model="data.respawn" type="checkbox" /> <span class="small">可刷新</span></label>
            </div>
          </template>

          <!-- 公告栏 -->
          <template v-if="element.type === 'bulletin'">
            <div class="row"><span class="divider-title" style="margin: 0">公告 / 悬赏</span><button class="btn sm ghost right" @click="addPost">+ 条目</button></div>
            <div v-for="(p, i) in data.posts || []" :key="i" class="post-row">
              <input v-model="p.title" class="input slim" placeholder="标题" />
              <select v-model="p.kind" class="select slim" style="width: 82px"><option value="notice">公告</option><option value="quest">悬赏</option></select>
              <textarea v-model="p.content" class="textarea" rows="2" placeholder="内容"></textarea>
              <button class="btn sm ghost danger" @click="data.posts.splice(i, 1)">删除</button>
            </div>
            <div v-if="!data.posts?.length" class="hint">空公告栏。可以放任务悬赏或世界传闻。</div>
          </template>

          <!-- 路引 -->
          <template v-if="element.type === 'sign'">
            <div class="grid grid-2">
              <label class="field"><span class="label">指向</span>
                <select v-model="data.direction" class="select">
                  <option>←</option><option>→</option><option>↑</option><option>↓</option><option>↖</option><option>↗</option><option>↙</option><option>↘</option>
                </select>
              </label>
              <label class="field"><span class="label">距离</span><input v-model.number="data.distance" type="number" min="0" class="input mono" /></label>
            </div>
            <label class="field"><span class="label">目的地</span><input v-model="data.destination" class="input" /></label>
          </template>

          <!-- 传送门 -->
          <template v-if="element.type === 'portal'">
            <label class="field">
              <span class="label">目的地</span>
              <select v-model="data.targetId" class="select">
                <option value="">未设置</option>
                <option v-for="t in portalTargets" :key="t.id" :value="t.id">{{ t.name }}（{{ WORLD_TYPES[t.type]?.label }}）</option>
              </select>
            </label>
            <label class="field"><span class="label">通行条件</span><input v-model="data.requirement" class="input" placeholder="例如：雾港通行证" /></label>
            <label class="switch-row"><input v-model="data.twoWay" type="checkbox" /> <span class="small">双向传送</span></label>
            <div v-if="data.targetId && !portalTargets.some((t) => t.id === data.targetId)" class="notice warn">目的地已不存在，请重新选择。</div>
          </template>

          <!-- 树木 -->
          <template v-if="element.type === 'tree'">
            <div class="grid grid-2">
              <label class="field"><span class="label">树种</span><input v-model="data.species" class="input" /></label>
              <label class="field"><span class="label">高度（米）</span><input v-model.number="data.height" type="number" min="1" class="input mono" /></label>
            </div>
          </template>

          <!-- 河流 / 道路 -->
          <template v-if="isPathType(element.type)">
            <label class="field"><span class="label">路径宽度</span><input v-model.number="data.width" type="number" min="1" max="80" class="input mono" /></label>
            <div class="hint">路径包含 {{ element.points?.length || 0 }} 个控制点。拖动元素可整体移动；重新绘制请从工具栏选择「绘制」。</div>
          </template>

          <label class="field"><span class="label">备注</span><textarea v-model="data.notes" class="textarea" rows="3"></textarea></label>

          <div class="hr"></div>
          <button class="btn danger" @click="deleteElement">从地图删除</button>
        </div>

        <div v-else class="col" style="padding: 12px 14px 18px; gap: 12px">
          <div class="row">
            <span class="divider-title" style="margin: 0">对话列表</span>
            <button class="btn sm primary right" @click="addDialogue">+ 新对话</button>
          </div>
          <div class="dlg-list">
            <button v-for="(d, i) in dialogues" :key="d.id" class="dlg-item" :class="{ active: d.id === selectedDialogueId }" @click="selectedDialogueId = d.id">
              <span class="dlg-index">{{ i + 1 }}</span>
              <span class="grow">
                <span class="small">{{ d.name || '未命名对话' }}</span>
                <span class="tiny dim" style="display: block">
                  {{ (d.audienceIds || []).length ? (d.audienceIds || []).map((id) => characters.find((c) => c.id === id)?.name || id).join('、') : '所有人' }}
                  · {{ (d.lines || []).length }} 句
                </span>
              </span>
              <span v-if="d.quest" class="chip tiny amber">任务</span>
              <span v-if="i === 0" class="chip tiny cyan">主要</span>
            </button>
          </div>
          <div v-if="!dialogues.length" class="notice info"><span>i</span><div>这个 NPC 还没有对话。点击「+ 新对话」开始。</div></div>

          <template v-if="activeDialogue">
            <label class="field"><span class="label">对话名称</span><input v-model="activeDialogue.name" class="input" /></label>
            <div class="field">
              <span class="label">可见对象（不选 = 所有人）</span>
              <div class="chips audience">
                <label v-for="c in characters" :key="c.id" class="check">
                  <input type="checkbox" :checked="(activeDialogue.audienceIds || []).includes(c.id)" @change="(e) => { const list = (activeDialogue.audienceIds || []).filter((x) => x !== c.id); if (e.target.checked) list.push(c.id); activeDialogue.audienceIds = list }" />
                  {{ c.name }}
                </label>
              </div>
              <div class="hint">{{ (activeDialogue.audienceIds || []).length ? `只对：${audienceNames.join('、')} 可见` : '所有人可见' }}</div>
            </div>

            <div class="row"><span class="divider-title" style="margin: 0">台词</span><button class="btn sm ghost right" @click="addLine">+ 台词</button></div>
            <div v-for="(l, i) in activeDialogue.lines" :key="i" class="line-row">
              <input v-model="l.speaker" class="input slim" placeholder="说话者" style="width: 90px" />
              <textarea v-model="l.text" class="textarea" rows="2" placeholder="台词"></textarea>
              <button class="btn sm ghost danger" @click="activeDialogue.lines.splice(i, 1)">×</button>
            </div>

            <div class="row"><span class="divider-title" style="margin: 0">分支选项</span><button class="btn sm ghost right" @click="addChoice">+ 选项</button></div>
            <div v-for="(c, i) in activeDialogue.choices" :key="i" class="choice-row">
              <input v-model="c.label" class="input slim" placeholder="玩家选项" />
              <textarea v-model="c.response" class="textarea" rows="2" placeholder="NPC 的回应"></textarea>
              <button class="btn sm ghost danger" @click="activeDialogue.choices.splice(i, 1)">×</button>
            </div>
            <div v-if="!activeDialogue.choices?.length" class="hint">没有分支选项时，这段对话按台词顺序播放。</div>

            <div class="switch-row" style="margin-top: 4px">
              <input type="checkbox" :checked="!!activeDialogue.quest" @change="toggleQuest" />
              <span class="small">这段对话派发任务</span>
            </div>
            <div v-if="quest" class="quest-box">
              <label class="field"><span class="label">任务名</span><input v-model="quest.title" class="input" /></label>
              <label class="field"><span class="label">任务说明</span><textarea v-model="quest.summary" class="textarea" rows="2"></textarea></label>
              <div class="row"><span class="divider-title" style="margin: 0">目标</span><button class="btn sm ghost right" @click="addObjective">+ 目标</button></div>
              <div v-for="(o, i) in quest.objectives" :key="i" class="row" style="gap: 6px; margin-bottom: 5px">
                <input v-model="o.text" class="input slim grow" />
                <label class="check"><input v-model="o.done" type="checkbox" />完成</label>
                <button class="btn sm ghost danger" @click="quest.objectives.splice(i, 1)">×</button>
              </div>
              <div class="grid grid-2" style="margin-top: 6px">
                <label class="field"><span class="label">奖励</span><input v-model="quest.reward" class="input" /></label>
                <label class="field"><span class="label">状态</span>
                  <select v-model="quest.status" class="select">
                    <option>未接取</option><option>进行中</option><option>已完成</option><option>已失败</option>
                  </select>
                </label>
              </div>
            </div>

            <div class="hr"></div>
            <div class="row">
              <span class="divider-title" style="margin: 0">试看</span>
              <select v-model="viewerId" class="select slim" style="width: 130px">
                <option value="">所有人视角</option>
                <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
              </select>
              <button class="btn sm ghost danger right" @click="removeDialogue(activeDialogue)">删除对话</button>
            </div>
            <div class="preview-box">
              <div class="tiny dim" style="margin-bottom: 6px">
                当前视角：{{ characters.find((c) => c.id === viewerId)?.name || '所有人' }}
                · 可用对话 {{ availableDialogues.length }} / {{ dialogues.length }}
              </div>
              <div v-for="d in availableDialogues" :key="d.id" class="preview-dlg">
                <div class="row" style="gap: 6px">
                  <b class="small">{{ d.name }}</b>
                  <span class="chip tiny">{{ (d.audienceIds || []).length ? '专属' : '通用' }}</span>
                  <span v-if="d.quest" class="chip tiny amber">派发任务</span>
                </div>
                <div v-for="(l, i) in d.lines" :key="i" class="preview-line">
                  <span class="preview-speaker">{{ l.speaker }}</span>
                  <span>{{ l.text }}</span>
                </div>
                <div class="chips" style="margin-top: 6px">
                  <button v-for="(c, i) in d.choices || []" :key="i" class="btn sm ghost" @click="choiceResponse = `${c.label} → ${c.response}`">{{ c.label }}</button>
                </div>
                <div v-if="d.quest" class="preview-quest">
                  <div class="small c-amber">任务：{{ d.quest.title }}</div>
                  <div class="tiny dim">{{ d.quest.summary }}</div>
                  <div class="tiny" style="margin-top: 3px">目标：{{ (d.quest.objectives || []).map((o) => o.text).join(' / ') }} ｜ 奖励：{{ d.quest.reward || '—' }}</div>
                </div>
              </div>
              <div v-if="choiceResponse" class="notice info" style="margin-top: 8px">{{ choiceResponse }}</div>
              <div v-if="!availableDialogues.length" class="notice warn">当前视角没有可用对话；这段 NPC 的所有对话都限定了其他角色。</div>
            </div>
          </template>
        </div>
      </div>
    </template>
  </aside>
</template>

<style scoped>
.inspector { display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.inspector-scroll { flex: 1; overflow: auto; min-height: 0; }
.type-badge { font-size: 12px; font-weight: 600; color: var(--cyan); }
.color-input { height: 34px; padding: 3px; }
.switch-row { display: flex; align-items: center; gap: 8px; cursor: pointer; font-size: 12px; }
.buff-row { display: grid; grid-template-columns: 1fr 1.4fr 28px; gap: 5px; }
.dlg-list { display: flex; flex-direction: column; gap: 4px; }
.dlg-item { display: flex; align-items: center; gap: 8px; text-align: left; padding: 8px 9px; border-radius: 8px; border: 1px solid var(--line); background: rgba(2, 6, 23, 0.3); color: var(--text); cursor: pointer; }
.dlg-item:hover { border-color: rgba(103, 232, 249, 0.3); }
.dlg-item.active { border-color: rgba(103, 232, 249, 0.55); background: rgba(103, 232, 249, 0.07); }
.dlg-index { width: 16px; text-align: center; font-family: var(--mono); font-size: 10px; color: var(--dim); }
.line-row { display: grid; grid-template-columns: 90px 1fr 26px; gap: 5px; align-items: start; margin-bottom: 5px; }
.choice-row { display: grid; grid-template-columns: 1fr 26px; gap: 5px; align-items: start; margin-bottom: 6px; }
.choice-row .textarea { grid-column: 1 / 2; }
.choice-row .btn { grid-column: 2 / 3; grid-row: 1 / 3; }
.post-row { display: grid; grid-template-columns: 1fr 82px 28px; gap: 5px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px; }
.post-row .textarea { grid-column: 1 / -1; }
.post-row .btn { grid-column: 3 / 4; grid-row: 1 / 2; }
.audience { max-height: 110px; overflow: auto; }
.quest-box { border: 1px solid rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.04); border-radius: 9px; padding: 9px; display: flex; flex-direction: column; gap: 7px; }
.preview-box { border: 1px solid var(--line); border-radius: 9px; background: rgba(2, 6, 23, 0.35); padding: 10px; }
.preview-dlg { padding: 8px 0; border-bottom: 1px solid var(--line); }
.preview-dlg:last-child { border-bottom: none; }
.preview-line { font-size: 11.5px; line-height: 1.6; color: var(--muted); margin-top: 3px; }
.preview-speaker { color: #a5f3fc; font-family: var(--mono); font-size: 10.5px; margin-right: 5px; }
.preview-quest { margin-top: 7px; border-left: 2px solid rgba(251, 191, 36, 0.5); padding-left: 7px; }
</style>
