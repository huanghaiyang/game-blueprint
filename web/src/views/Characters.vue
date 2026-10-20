<script setup>
import { computed, ref, watch } from 'vue'
import { store, notify, ensureSaved } from '../store'
import { api } from '../api'
import Avatar from '../components/Avatar.vue'

const p = computed(() => store.project)
const chars = computed(() => p.value.characters)
const primaryAttrs = computed(() => p.value.stats.attributes.filter((a) => a.kind !== 'derived'))
const skills = computed(() => p.value.skills || [])
const selectedId = ref(chars.value[0]?.id || '')
const selected = computed(() => chars.value.find((c) => c.id === selectedId.value) || null)
const level = ref(5)
const derived = ref(null)
const previewError = ref('')
const previewing = ref(false)
const relationTargets = computed(() => chars.value.filter((c) => c.id !== selectedId.value))

const allRelations = computed(() =>
  chars.value.flatMap((c) =>
    (c.relations || []).map((r) => ({
      from: c.id,
      to: r.targetId,
      type: r.type,
      value: Number(r.value) || 0,
      note: r.note
    }))
  )
)

function colorOf(id) {
  return chars.value.find((c) => c.id === id)?.color || '#94a3b8'
}

function ensureShape(c) {
  if (!c) return
  c.base = c.base || {}
  c.growth = c.growth || {}
  c.tags = c.tags || []
  c.skillIds = c.skillIds || []
  c.relations = c.relations || []
  c.arc = c.arc || { start: '', midpoint: '', end: '' }
  c.color = c.color || '#67e8f9'
  for (const a of primaryAttrs.value) {
    if (c.base[a.key] == null) c.base[a.key] = a.base
    if (c.growth[a.key] == null) c.growth[a.key] = a.growth
  }
}

for (const c of chars.value) ensureShape(c)

function selectChar(id) {
  selectedId.value = id
  ensureShape(chars.value.find((c) => c.id === id))
}

async function refresh() {
  if (!selected.value) return
  await ensureSaved()
  previewing.value = true
  try {
    const r = await api.stats(store.activeId, selected.value.id, level.value, 10, false)
    derived.value = r
    previewError.value = ''
  } catch (e) {
    previewError.value = e.message
  } finally {
    previewing.value = false
  }
}

function addChar() {
  const id = `c${Date.now().toString(36)}`
  const base = {}
  const growth = {}
  for (const a of primaryAttrs.value) {
    base[a.key] = a.base
    growth[a.key] = a.growth
  }
  const c = {
    id,
    name: '新角色',
    role: '配角',
    faction: '',
    age: null,
    archetype: '',
    tags: [],
    color: '#67e8f9',
    motivation: '',
    flaw: '',
    bio: '',
    arc: { start: '', midpoint: '', end: '' },
    base,
    growth,
    skillIds: [],
    relations: []
  }
  chars.value.push(c)
  selectChar(id)
  notify('角色已创建，记得补完动机与缺陷', 'ok')
}

async function deleteChar() {
  if (!selected.value) return
  if (chars.value.length <= 1) return notify('至少保留一个角色', 'warn')
  if (!confirm(`删除角色「${selected.value.name}」？相关关系会被一并清理。`)) return
  const id = selected.value.id
  p.value.characters = chars.value.filter((c) => c.id !== id)
  for (const c of p.value.characters) c.relations = (c.relations || []).filter((r) => r.targetId !== id)
  selectedId.value = p.value.characters[0]?.id || ''
  notify('角色已删除')
}

function onTags(ev) {
  if (!selected.value) return
  selected.value.tags = ev.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  ev.target.value = selected.value.tags.join(', ')
}

function toggleSkill(id) {
  if (!selected.value) return
  const list = selected.value.skillIds || []
  selected.value.skillIds = list.includes(id) ? list.filter((x) => x !== id) : [...list, id]
}

function addRelation() {
  if (!selected.value || !relationTargets.value.length) return
  selected.value.relations.push({ targetId: relationTargets.value[0].id, type: '同伴', value: 0.3, note: '' })
}

function removeRelation(i) {
  selected.value.relations.splice(i, 1)
}

function nameOf(id) {
  return chars.value.find((c) => c.id === id)?.name || id
}

watch(selectedId, () => {
  derived.value = null
  refresh()
})

refresh()
</script>

<template>
  <div class="page">
    <div class="char-layout">
      <div class="col" style="gap: 14px">
        <div class="row">
          <span class="small muted">{{ chars.length }} 个角色 · 点击卡片编辑</span>
          <button class="btn sm primary right" @click="addChar">+ 新建角色</button>
        </div>
        <div class="char-grid">
          <div v-for="c in chars" :key="c.id" class="char-card" :class="{ active: c.id === selectedId }" :style="{ '--accent': c.color }" @click="selectChar(c.id)">
            <div class="row" style="align-items: flex-start">
              <Avatar :name="c.name" :color="c.color" />
              <div class="grow" style="min-width: 0">
                <div class="row" style="gap: 6px">
                  <span class="char-name">{{ c.name }}</span>
                  <span class="badge">{{ c.age ?? '—' }}</span>
                </div>
                <div class="tiny dim" style="margin-top: 3px">{{ c.role }}</div>
                <div class="tiny dim">{{ c.faction || '无阵营' }}</div>
              </div>
            </div>
            <div class="chips" style="margin-top: 10px">
              <span v-for="t in (c.tags || []).slice(0, 3)" :key="t" class="chip tiny">{{ t }}</span>
            </div>
            <div class="char-stats">
              <span>HP <b>{{ c.base?.hp ?? '—' }}</b></span>
              <span>ATK <b>{{ c.base?.atk ?? '—' }}</b></span>
              <span>SPD <b>{{ c.base?.spd ?? '—' }}</b></span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-head"><span class="card-title">关系网</span><span class="card-sub">-1 敌对 ／ +1 同盟 · 双向箭头表示互有关系</span></div>
          <div class="card-body col" style="gap: 7px">
            <div v-for="(r, i) in allRelations" :key="i" class="rel-row" @click="selectChar(r.from)">
              <span class="rel-name" :style="{ color: colorOf(r.from) }">{{ nameOf(r.from) }}</span>
              <span class="tiny dim">{{ r.type || '关系' }}</span>
              <div class="rel-meter"><span :style="{ width: ((r.value + 1) / 2) * 100 + '%', background: r.value >= 0 ? '#67e8f9' : '#fb7185' }"></span></div>
              <span class="mono tiny" :class="r.value >= 0 ? 'c-cyan' : 'c-rose'">{{ r.value.toFixed(2) }}</span>
              <span class="rel-name right" :style="{ color: colorOf(r.to) }">{{ nameOf(r.to) }}</span>
            </div>
            <div v-if="!allRelations.length" class="hint">还没有关系。在右侧编辑器里添加关系，用于推理、阵营与结局条件。</div>
          </div>
        </div>
      </div>

      <section v-if="selected" class="card editor">
        <div class="card-head">
          <Avatar :name="selected.name" :color="selected.color" :size="30" />
          <div>
            <div class="card-title">{{ selected.name }}</div>
            <div class="tiny dim">{{ selected.role }} · {{ selected.archetype || '未设定原型' }}</div>
          </div>
          <button class="btn sm danger right" @click="deleteChar">删除</button>
        </div>
        <div class="card-body col" style="gap: 13px">
          <div class="grid grid-2">
            <label class="field"><span class="label">姓名</span><input v-model="selected.name" class="input" /></label>
            <label class="field"><span class="label">定位 / 职能</span><input v-model="selected.role" class="input" /></label>
            <label class="field"><span class="label">阵营</span><input v-model="selected.faction" class="input" /></label>
            <label class="field"><span class="label">年龄</span><input v-model.number="selected.age" type="number" class="input mono" /></label>
            <label class="field"><span class="label">原型（一句话）</span><input v-model="selected.archetype" class="input" /></label>
            <label class="field"><span class="label">主题色</span><input v-model="selected.color" type="color" class="input" style="padding: 3px; height: 34px" /></label>
          </div>
          <label class="field">
            <span class="label">标签（逗号分隔）</span>
            <input :value="(selected.tags || []).join(', ')" class="input" @change="onTags" />
          </label>

          <div class="hr"></div>
          <div class="divider-title">叙事内核</div>
          <label class="field"><span class="label">欲望 / 目标</span><input v-model="selected.motivation" class="input" /></label>
          <label class="field"><span class="label">缺陷 / 盲点</span><input v-model="selected.flaw" class="input" /></label>
          <label class="field"><span class="label">人物小传</span><textarea v-model="selected.bio" class="textarea" rows="3"></textarea></label>
          <div class="grid grid-3">
            <label class="field"><span class="label">弧光 · 起点</span><input v-model="selected.arc.start" class="input" /></label>
            <label class="field"><span class="label">弧光 · 转折</span><input v-model="selected.arc.midpoint" class="input" /></label>
            <label class="field"><span class="label">弧光 · 终点</span><input v-model="selected.arc.end" class="input" /></label>
          </div>

          <div class="hr"></div>
          <div class="row">
            <span class="divider-title" style="margin: 0">战斗数值</span>
            <span class="badge">Lv {{ level }}</span>
            <button class="btn sm ghost right" :disabled="previewing" @click="refresh">刷新预览</button>
          </div>
          <div class="grid grid-2">
            <label v-for="a in primaryAttrs" :key="a.key" class="field">
              <span class="label">{{ a.label }} <span class="mono dim">{{ a.key }}</span></span>
              <div class="row" style="gap: 6px">
                <input v-model.number="selected.base[a.key]" type="number" step="0.01" class="input mono" :title="`${a.label} 基础值`" />
                <input v-model.number="selected.growth[a.key]" type="number" step="0.01" class="input mono" :title="`${a.label} 每级成长`" style="max-width: 76px" />
              </div>
              <span class="hint">左：基础值 ｜ 右：每级成长</span>
            </label>
          </div>
          <div v-if="previewError" class="notice error">{{ previewError }}</div>
          <div v-else-if="derived" class="derived-box">
            <div class="derived-grid">
              <div><span class="hint">生命</span><b class="mono">{{ derived.values.hp?.toFixed(1) }}</b></div>
              <div><span class="hint">攻击</span><b class="mono">{{ derived.values.atk?.toFixed(1) }}</b></div>
              <div><span class="hint">防御</span><b class="mono">{{ derived.values.def?.toFixed(1) }}</b></div>
              <div><span class="hint">速度</span><b class="mono">{{ derived.values.spd?.toFixed(1) }}</b></div>
              <div><span class="hint">战力</span><b class="mono c-cyan">{{ derived.values.power?.toFixed(1) }}</b></div>
              <div><span class="hint">有效生命</span><b class="mono">{{ derived.values.ehp?.toFixed(0) }}</b></div>
            </div>
            <div class="chips" style="margin-top: 8px">
              <span v-for="(m, k) in derived.metrics" :key="k" class="chip tiny">{{ m.name }} · {{ m.value }} {{ m.unit }}</span>
            </div>
            <div v-if="derived.errors?.length" class="error-text" style="margin-top: 6px">派生属性错误：{{ derived.errors.map((e) => e.key).join('、') }}</div>
          </div>

          <div class="hr"></div>
          <div class="divider-title">技能</div>
          <div class="chips">
            <label v-for="s in skills" :key="s.id" class="check">
              <input type="checkbox" :checked="(selected.skillIds || []).includes(s.id)" @change="toggleSkill(s.id)" />
              {{ s.name }}
            </label>
          </div>

          <div class="hr"></div>
          <div class="row">
            <span class="divider-title" style="margin: 0">关系网</span>
            <button class="btn sm ghost right" @click="addRelation">+ 关系</button>
          </div>
          <div v-for="(r, i) in selected.relations" :key="i" class="relation-row">
            <select v-model="r.targetId" class="select">
              <option v-for="c in relationTargets" :key="c.id" :value="c.id">{{ c.name }}</option>
            </select>
            <input v-model="r.type" class="input" placeholder="关系类型" />
            <input v-model.number="r.value" type="range" min="-1" max="1" step="0.05" />
            <span class="mono tiny" :class="r.value >= 0 ? 'c-cyan' : 'c-rose'">{{ Number(r.value).toFixed(2) }}</span>
            <button class="btn sm ghost danger" @click="removeRelation(i)">×</button>
            <input v-model="r.note" class="input" placeholder="备注" style="grid-column: 1 / -1" />
          </div>
          <div v-if="!selected.relations.length" class="hint">还没有关系。关系值 -1 ~ 1，可用于推理与阵营演算。</div>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.char-layout { display: grid; grid-template-columns: minmax(0, 1fr) minmax(400px, 430px); gap: 16px; align-items: start; }
.editor { position: sticky; top: 0; max-height: calc(100vh - 96px); overflow: auto; }
.char-name { font-size: 14px; font-weight: 600; }
.char-stats { display: flex; gap: 12px; margin-top: 10px; font-size: 10.5px; color: var(--dim); }
.char-stats b { color: var(--muted); font-family: var(--mono); font-weight: 500; }
.derived-box { border: 1px solid var(--line); border-radius: 10px; padding: 11px; background: rgba(2, 6, 23, 0.35); }
.derived-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 9px; }
.derived-grid > div { display: flex; flex-direction: column; gap: 2px; }
.derived-grid b { font-size: 14px; color: #e6fbff; }
.relation-row { display: grid; grid-template-columns: 1.1fr 0.9fr 1fr 44px 28px; gap: 6px; align-items: center; }
.rel-row { display: grid; grid-template-columns: 78px 72px minmax(60px, 1fr) 48px 78px; gap: 8px; align-items: center; padding: 5px 7px; border-radius: 7px; cursor: pointer; }
.rel-row:hover { background: rgba(148, 163, 184, 0.05); }
.rel-name { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rel-meter { height: 5px; border-radius: 99px; background: rgba(148, 163, 184, 0.14); overflow: hidden; }
.rel-meter > span { display: block; height: 100%; border-radius: 99px; }
@media (max-width: 1180px) {
  .char-layout { grid-template-columns: 1fr; }
  .editor { position: static; max-height: none; }
  .relation-row { grid-template-columns: 1fr 1fr; }
}
</style>


