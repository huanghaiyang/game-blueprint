<script setup>
import { computed, ref } from 'vue'
import { store, notify, ensureSaved } from '../store'
import { api } from '../api'
import Graph3D from '../components/Graph3D.vue'

const p = computed(() => store.project)
const nodes = computed(() => p.value.narrative.nodes)
const edges = computed(() => p.value.narrative.edges)
const acts = computed(() => p.value.blueprint.acts || [])
const typeOptions = [
  { value: 'scene', label: '场景' },
  { value: 'choice', label: '抉择' },
  { value: 'combat', label: '对抗' },
  { value: 'hub', label: '枢纽' },
  { value: 'ending', label: '结局' }
]
const typeColor = { scene: '#7dd3fc', choice: '#fbbf24', combat: '#fb7185', ending: '#86efac', hub: '#c084fc' }
const typeName = (t) => typeOptions.find((o) => o.value === t)?.label || t

const selectedId = ref(
  nodes.value.some((n) => n.id === store.selectedNodeId) ? store.selectedNodeId : p.value.narrative.startId || nodes.value[0]?.id
)
const selected = computed(() => nodes.value.find((n) => n.id === selectedId.value) || null)
const outEdges = computed(() => edges.value.filter((e) => e.from === selectedId.value))
const inEdges = computed(() => edges.value.filter((e) => e.to === selectedId.value))
const exprChecks = ref({})

const groups = computed(() => {
  const list = acts.value.map((a) => ({ id: a.id, name: a.name, nodes: nodes.value.filter((n) => n.act === a.id) }))
  const rest = nodes.value.filter((n) => !acts.value.some((a) => a.id === n.act))
  if (rest.length) list.push({ id: '__none', name: '未分幕', nodes: rest })
  return list
})

function selectNode(id) {
  selectedId.value = id
  store.selectedNodeId = id
}

function nextNodeId() {
  let i = 1
  while (nodes.value.some((n) => n.id === `n${i}`)) i++
  return `n${i}`
}

function addNode(type) {
  const id = nextNodeId()
  const node = {
    id,
    title: `新${typeName(type)} ${id}`,
    type,
    act: selected.value?.act || acts.value[0]?.id || '',
    tension: type === 'ending' ? 75 : 35,
    summary: '',
    text: ''
  }
  nodes.value.push(node)
  selectNode(id)
  notify(`已添加「${node.title}」，记得连上入口`, 'ok')
}

async function deleteNode() {
  if (!selected.value) return
  if (!confirm(`删除节点「${selected.value.title}」及其相关连线？`)) return
  const id = selected.value.id
  p.value.narrative.nodes = nodes.value.filter((n) => n.id !== id)
  p.value.narrative.edges = edges.value.filter((e) => e.from !== id && e.to !== id)
  if (p.value.narrative.startId === id) p.value.narrative.startId = p.value.narrative.nodes[0]?.id || null
  selectedId.value = p.value.narrative.startId || p.value.narrative.nodes[0]?.id || ''
  notify('节点已删除')
}

function setStart() {
  if (!selected.value) return
  p.value.narrative.startId = selected.value.id
  notify(`起点设为「${selected.value.title}」`, 'ok')
}

function addEdge() {
  if (!selected.value) return
  const target = nodes.value.find((n) => n.id !== selected.value.id)
  if (!target) return notify('至少需要两个节点', 'warn')
  const edge = {
    id: `e${Date.now().toString(36)}`,
    from: selected.value.id,
    to: target.id,
    label: '新选项',
    type: selected.value.type === 'ending' ? 'linear' : 'choice',
    weight: 1
  }
  edges.value.push(edge)
  notify('已添加连线，设置条件与效果后即可参与演算', 'ok')
}

function deleteEdge(edge) {
  p.value.narrative.edges = edges.value.filter((e) => e.id !== edge.id)
  delete exprChecks.value[edge.id]
}

function onNodeFlags(ev) {
  if (!selected.value) return
  const list = ev.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean)
  selected.value.setFlags = list
  ev.target.value = list.join(', ')
}

function flagText(edge) {
  const f = edge.effects?.flags || {}
  return Object.entries(f).map(([k, v]) => `${k}:${v}`).join(', ')
}

function onEdgeFlags(edge, ev) {
  const obj = {}
  for (const part of ev.target.value.split(/[,，]/)) {
    const [rawK, rawV = 'true'] = part.split(':')
    const k = (rawK || '').trim()
    if (!k) continue
    const v = rawV.trim()
    obj[k] = v === 'true' ? true : v === 'false' ? false : Number.isFinite(Number(v)) ? Number(v) : v
  }
  edge.effects = { ...(edge.effects || {}), flags: obj }
  ev.target.value = flagText(edge)
}

function onEdgeCondition(edge, ev) {
  const expr = ev.target.value.trim()
  if (!expr) {
    edge.condition = null
    delete exprChecks.value[edge.id]
    return
  }
  edge.condition = { expr, label: edge.condition?.label || '条件' }
}

function onEdgeConditionLabel(edge, ev) {
  if (!edge.condition) return
  edge.condition = { ...edge.condition, label: ev.target.value }
}

function onEdgeWeight(edge, ev) {
  const v = Number(ev.target.value)
  edge.weight = Number.isFinite(v) && v > 0 ? v : 1
}

async function checkExpr(edge) {
  const expr = edge.condition?.expr
  if (!expr) return
  await ensureSaved()
  exprChecks.value[edge.id] = { loading: true }
  try {
    const r = await api.formula(store.activeId, expr, { flags: {} })
    exprChecks.value[edge.id] = { ok: r.ok, value: r.value, error: r.error, vars: r.variables }
  } catch (e) {
    exprChecks.value[edge.id] = { ok: false, error: e.message }
  }
}
</script>

<template>
  <div class="page">
    <div class="narrative-layout">
      <div class="col" style="gap: 16px">
        <section class="card">
          <div class="card-head">
            <span class="card-title">3D 叙事图谱</span>
            <span class="card-sub">拖动旋转 · 滚轮缩放 · 点击节点编辑</span>
            <div class="right row">
              <button class="btn sm" @click="addNode('scene')">+ 场景</button>
              <button class="btn sm" @click="addNode('choice')">+ 抉择</button>
              <button class="btn sm" @click="addNode('combat')">+ 对抗</button>
              <button class="btn sm" @click="addNode('ending')">+ 结局</button>
            </div>
          </div>
          <div class="card-body" style="padding: 12px">
            <Graph3D :nodes="nodes" :edges="edges" :selected-id="selectedId" :start-id="p.narrative.startId" :acts="acts" @select="selectNode" />
          </div>
        </section>

        <section class="card">
          <div class="card-head">
            <span class="card-title">节点清单</span>
            <span class="card-sub">按幕分组 · 点击定位</span>
            <span class="badge right">{{ nodes.length }}</span>
          </div>
          <div class="card-body" style="padding: 10px 12px">
            <div v-for="g in groups" :key="g.id" class="node-group">
              <div class="node-group-title">{{ g.name }} <span class="dim">· {{ g.nodes.length }}</span></div>
              <div class="node-list">
                <div v-for="n in g.nodes" :key="n.id" class="node-item" :class="{ active: n.id === selectedId }" @click="selectNode(n.id)">
                  <span class="node-dot" :style="{ background: typeColor[n.type] || '#94a3b8' }"></span>
                  <span class="grow">{{ n.title }}</span>
                  <span v-if="n.id === p.narrative.startId" class="chip cyan tiny">起点</span>
                  <span class="dim tiny">{{ typeName(n.type) }}</span>
                  <span class="mono tiny muted">{{ n.tension ?? 0 }}</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section class="card inspector">
        <div v-if="!selected" class="empty">选择一个节点开始编辑</div>
        <template v-else>
          <div class="card-head">
            <span class="card-title">节点编辑</span>
            <span class="chip tiny" :class="selected.type === 'ending' ? 'green' : selected.type === 'combat' ? 'rose' : selected.type === 'choice' ? 'amber' : 'cyan'">{{ typeName(selected.type) }}</span>
            <span class="right mono tiny dim">{{ selected.id }}</span>
          </div>
          <div class="card-body col" style="gap: 12px">
            <label class="field"><span class="label">标题</span><input v-model="selected.title" class="input" /></label>
            <div class="grid grid-2">
              <label class="field">
                <span class="label">类型</span>
                <select v-model="selected.type" class="select">
                  <option v-for="t in typeOptions" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
              </label>
              <label class="field">
                <span class="label">幕</span>
                <select v-model="selected.act" class="select">
                  <option value="">未分幕</option>
                  <option v-for="a in acts" :key="a.id" :value="a.id">{{ a.name }}</option>
                </select>
              </label>
            </div>
            <label class="field">
              <span class="label">张力 {{ selected.tension ?? 0 }} / 100</span>
              <input v-model.number="selected.tension" type="range" min="0" max="100" />
            </label>
            <label class="field"><span class="label">摘要（列表与图谱悬浮显示）</span><input v-model="selected.summary" class="input" /></label>
            <label class="field"><span class="label">场景正文 / 对白</span><textarea v-model="selected.text" class="textarea" rows="4"></textarea></label>
            <label class="field">
              <span class="label">进入节点即写入的旗标（逗号分隔）</span>
              <input :value="(selected.setFlags || []).join(', ')" class="input mono" placeholder="e.g. heard_whisper" @change="onNodeFlags" />
            </label>
            <div class="row">
              <button class="btn sm" :disabled="p.narrative.startId === selected.id" @click="setStart">设为起点</button>
              <button class="btn sm danger right" @click="deleteNode">删除节点</button>
            </div>

            <div class="hr"></div>
            <div class="row">
              <span class="divider-title" style="margin: 0">出口连线 · {{ outEdges.length }}</span>
              <button class="btn sm ghost right" @click="addEdge">+ 连线</button>
            </div>
            <div v-if="!outEdges.length" class="notice warn">结局节点或孤立节点没有出口；非结局节点需要至少一条出口，否则分支演算会报死路。</div>
            <div v-for="e in outEdges" :key="e.id" class="edge-card">
              <div class="edge-head">
                <span class="chip" :class="e.type === 'conditional' ? 'violet' : e.type === 'choice' ? 'amber' : ''">{{ e.type }}</span>
                <span class="mono tiny dim">{{ e.id }}</span>
                <button class="btn sm ghost danger right" @click="deleteEdge(e)">删除</button>
              </div>
              <div class="grid grid-2">
                <label class="field"><span class="label">目标节点</span>
                  <select v-model="e.to" class="select">
                    <option v-for="n in nodes.filter((x) => x.id !== selected.id)" :key="n.id" :value="n.id">{{ n.title }}</option>
                  </select>
                </label>
                <label class="field"><span class="label">选项文案</span><input v-model="e.label" class="input" /></label>
                <label class="field"><span class="label">连线类型</span>
                  <select v-model="e.type" class="select">
                    <option value="linear">linear · 顺叙</option>
                    <option value="choice">choice · 选择</option>
                    <option value="conditional">conditional · 条件</option>
                  </select>
                </label>
                <label class="field"><span class="label">权重（概率）</span><input :value="e.weight ?? 1" type="number" min="0.1" step="0.1" class="input mono" @change="onEdgeWeight(e, $event)" /></label>
              </div>
              <div class="grid grid-2" style="margin-top: 6px">
                <label class="field"><span class="label">条件表达式（空 = 无条件）</span><input :value="e.condition?.expr || ''" class="input mono" placeholder="flags.baulu_ally == true" @change="onEdgeCondition(e, $event)" /></label>
                <label class="field"><span class="label">条件说明（显示给策划）</span><input :value="e.condition?.label || ''" class="input" placeholder="需要白鹭同盟" @change="onEdgeConditionLabel(e, $event)" /></label>
              </div>
              <div class="row" style="margin-top: 6px">
                <label class="field grow"><span class="label">旗标效果（key:value，逗号分隔）</span><input :value="flagText(e)" class="input mono" placeholder="baulu_ally:true, has_third_letter:true" @change="onEdgeFlags(e, $event)" /></label>
                <button class="btn sm ghost" style="margin-top: 16px" @click="checkExpr(e)">校验</button>
              </div>
              <div v-if="exprChecks[e.id]" class="tiny" style="margin-top: 4px">
                <span v-if="exprChecks[e.id].loading" class="dim">校验中…</span>
                <span v-else-if="exprChecks[e.id].ok" class="c-green">✓ 语法通过，空旗标下结果 = {{ exprChecks[e.id].value }}</span>
                <span v-else class="error-text">✕ {{ exprChecks[e.id].error }}</span>
              </div>
            </div>

            <div v-if="inEdges.length" class="col" style="gap: 5px; margin-top: 4px">
              <span class="divider-title" style="margin: 0">入口连线 · {{ inEdges.length }}</span>
              <div v-for="e in inEdges" :key="e.id" class="tiny muted">
                {{ nodes.find((n) => n.id === e.from)?.title || e.from }} → 本节点
                <span class="dim">（{{ e.label || '未命名' }}）</span>
              </div>
            </div>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.inspector { position: sticky; top: 0; max-height: calc(100vh - 96px); overflow: auto; }
.node-group + .node-group { margin-top: 8px; }
.node-group-title { font-size: 11px; color: var(--dim); letter-spacing: 0.06em; padding: 6px 8px 2px; }
.node-list { max-height: 260px; overflow: auto; }
.edge-card { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: rgba(2, 6, 23, 0.32); }
.edge-head { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
</style>


