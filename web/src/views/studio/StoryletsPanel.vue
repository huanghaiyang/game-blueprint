<script setup>
import { computed, onMounted, ref } from 'vue'
import { store, ensureSaved, notify } from '../../store'
import { api } from '../../api'

const project = computed(() => store.project)
const storylets = computed(() => project.value?.storylets || (project.value.storylets = []))
const result = ref(null)
const flags = ref([{ key: 'has_third_letter', value: true }, { key: 'bailu_ally', value: true }])
const loading = ref(false)
const showNew = ref(false)
const draft = ref({ name: '', description: '', tags: '', conditions: '', flagEffects: '', weight: 1, salience: 1, once: false, cooldown: 0 })

function flagsObject() {
  return Object.fromEntries(flags.value.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value]))
}

async function simulate() {
  loading.value = true
  try {
    await ensureSaved()
    result.value = await api.storylets(store.activeId, flagsObject(), [])
  } catch (e) {
    notify(`Storylet 模拟失败：${e.message}`, 'error')
  } finally {
    loading.value = false
  }
}

function add() {
  if (!draft.value.name.trim()) return
  const conditions = draft.value.conditions.split('\n').map((s) => s.trim()).filter(Boolean).map((expr) => ({ expr, label: expr }))
  const effects = Object.fromEntries(draft.value.flagEffects.split('\n').map((s) => s.split('=')).filter((x) => x.length === 2).map(([k, v]) => [k.trim(), v.trim() === 'true' ? true : v.trim() === 'false' ? false : v.trim()]))
  storylets.value.push({
    id: `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
    name: draft.value.name.trim(),
    description: draft.value.description.trim(),
    tags: draft.value.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    conditions,
    effects: { flags: effects, quests: {} },
    weight: Number(draft.value.weight) || 1,
    salience: Number(draft.value.salience) || 1,
    once: !!draft.value.once,
    cooldown: Number(draft.value.cooldown) || 0,
    notes: ''
  })
  draft.value = { name: '', description: '', tags: '', conditions: '', flagEffects: '', weight: 1, salience: 1, once: false, cooldown: 0 }
  showNew.value = false
  simulate()
}

function remove(s) {
  if (!confirm(`删除动态叙事「${s.name}」？`)) return
  project.value.storylets = storylets.value.filter((x) => x.id !== s.id)
  simulate()
}

function addFlag() { flags.value.push({ key: '', value: true }) }
function removeFlag(i) { flags.value.splice(i, 1) }

onMounted(simulate)
</script>

<template>
  <div class="studio-panel storylets-panel">
    <div class="panel-head">
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <span class="badge">Storylets {{ storylets.length }}</span>
        <span class="chip tiny green">可用 {{ result?.summary.eligible || 0 }}</span>
        <span class="chip tiny">未满足 {{ result?.summary.rejected || 0 }}</span>
      </div>
      <div class="row" style="gap: 6px">
        <button class="btn sm ghost" @click="simulate">{{ loading ? '…' : '↻ 重新模拟' }}</button>
        <button class="btn sm primary" @click="showNew = !showNew">＋ 新建 Storylet</button>
      </div>
    </div>

    <div v-if="showNew" class="card" style="padding: 9px">
      <div class="grid grid-4" style="gap: 7px">
        <label class="field" style="grid-column: span 2"><span class="label">名称</span><input v-model="draft.name" class="input slim" placeholder="雾中的第二封信" /></label>
        <label class="field"><span class="label">权重</span><input v-model.number="draft.weight" type="number" min="0" step="0.5" class="input slim" /></label>
        <label class="field"><span class="label">显著度</span><input v-model.number="draft.salience" type="number" min="0" step="1" class="input slim" /></label>
        <label class="field" style="grid-column: span 2"><span class="label">标签</span><input v-model="draft.tags" class="input slim" placeholder="主线, 白鹭" /></label>
        <label class="field"><span class="label">一次性</span><span class="switch-row"><input v-model="draft.once" type="checkbox" /> 只触发一次</span></label>
        <label class="field"><span class="label">冷却</span><input v-model.number="draft.cooldown" type="number" min="0" class="input slim" /></label>
        <label class="field" style="grid-column: span 2"><span class="label">条件表达式（每行一个）</span><textarea v-model="draft.conditions" class="textarea" rows="3" placeholder="flags.has_third_letter == true"></textarea></label>
        <label class="field" style="grid-column: span 2"><span class="label">效果旗标（key=true，每行一个）</span><textarea v-model="draft.flagEffects" class="textarea" rows="3" placeholder="fog_second_letter=true"></textarea></label>
        <label class="field" style="grid-column: span 4"><span class="label">描述</span><input v-model="draft.description" class="input slim" /></label>
      </div>
      <div class="row" style="justify-content: flex-end; gap: 6px; margin-top: 7px">
        <button class="btn sm ghost" @click="showNew = false">取消</button>
        <button class="btn sm primary" :disabled="!draft.name.trim()" @click="add">创建</button>
      </div>
    </div>

    <div class="storylet-grid">
      <section class="card">
        <div class="card-head"><span class="card-title">动态叙事库</span><span class="tiny dim">条件满足时按显著度排序</span></div>
        <div class="storylet-list">
          <article v-for="s in storylets" :key="s.id" class="storylet-card">
            <div class="row" style="justify-content: space-between; gap: 6px">
              <b class="small">{{ s.name }}</b>
              <button class="btn sm ghost danger" @click="remove(s)">×</button>
            </div>
            <div class="tiny dim">{{ s.description || '无描述' }}</div>
            <div class="row" style="gap: 4px; flex-wrap: wrap; margin-top: 4px">
              <span v-for="t in s.tags || []" :key="t" class="chip tiny">{{ t }}</span>
              <span class="chip tiny">权重 {{ s.weight }}</span>
              <span class="chip tiny">显著度 {{ s.salience }}</span>
              <span v-if="s.once" class="chip tiny amber">一次性</span>
            </div>
            <div class="tiny dim mono" style="margin-top: 4px">{{ (s.conditions || []).map(c => c.expr).join(' && ') || '无条件' }}</div>
          </article>
          <div v-if="!storylets.length" class="empty" style="padding: 28px">还没有 storylet</div>
        </div>
      </section>

      <aside class="card">
        <div class="card-head"><span class="card-title">模拟旗标</span><button class="btn sm ghost" @click="addFlag">＋</button></div>
        <div class="card-body col" style="gap: 6px">
          <div v-for="(f, i) in flags" :key="i" class="row" style="gap: 4px">
            <input v-model="f.key" class="input slim" placeholder="flag" />
            <select v-model="f.value" class="select slim" style="width: 72px"><option :value="true">true</option><option :value="false">false</option></select>
            <button class="btn sm ghost danger" @click="removeFlag(i)">×</button>
          </div>
          <button class="btn sm" @click="simulate">应用并模拟</button>
          <div class="divider"></div>
          <div class="side-title">可用 <span class="badge">{{ result?.summary.eligible || 0 }}</span></div>
          <div v-for="s in result?.eligible || []" :key="s.id" class="eligible-row">
            <div class="row" style="justify-content: space-between"><b class="small">{{ s.name }}</b><span class="chip tiny green">{{ s.score }}</span></div>
            <div class="tiny dim">{{ s.description }}</div>
          </div>
          <div v-if="!result?.eligible?.length" class="hint">当前旗标组合没有可用 storylet。</div>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.storylets-panel { display: flex; flex-direction: column; gap: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.storylet-grid { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 10px; }
.storylet-list { max-height: 560px; overflow: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 7px; }
.storylet-card { border: 1px solid var(--line); border-radius: 8px; padding: 8px; background: rgba(2, 6, 23, 0.25); display: flex; flex-direction: column; gap: 3px; }
.eligible-row { border-bottom: 1px dashed var(--line); padding: 5px 0; }
@media (max-width: 1000px) { .storylet-grid { grid-template-columns: 1fr; } }
</style>
