<script setup>
import { computed, ref } from 'vue'
import { store, notify } from '../../store'

const project = computed(() => store.project)
const beats = computed(() => project.value?.storyboard?.beats || (project.value.storyboard = { beats: [] }).beats)
const actFilter = ref('')
const acts = computed(() => project.value?.blueprint?.acts || [])
const nodes = computed(() => project.value?.narrative?.nodes || [])
const filtered = computed(() => beats.value.filter((b) => !actFilter.value || b.actId === actFilter.value))
const total = computed(() => filtered.value.reduce((s, b) => s + (Number(b.duration) || 0), 0))
const maxDuration = computed(() => Math.max(1, ...filtered.value.map((b) => Number(b.duration) || 0)))

function addBeat() {
  beats.value.push({
    id: `beat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
    title: '新演出节拍',
    actId: acts.value[0]?.id || '',
    nodeId: '',
    duration: 12,
    camera: '',
    audio: '',
    animation: '',
    vfx: '',
    notes: ''
  })
}

function removeBeat(b) {
  if (!confirm(`删除演出「${b.title}」？`)) return
  project.value.storyboard.beats = beats.value.filter((x) => x.id !== b.id)
}

function move(b, dir) {
  const list = project.value.storyboard.beats
  const i = list.findIndex((x) => x.id === b.id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= list.length) return
  const [x] = list.splice(i, 1)
  list.splice(j, 0, x)
}

function actName(id) {
  return acts.value.find((a) => a.id === id)?.name || '未分幕'
}
</script>

<template>
  <div class="studio-panel storyboard-panel">
    <div class="panel-head">
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <span class="badge">节拍 {{ filtered.length }}</span>
        <span class="badge">总时长 {{ total }}s</span>
        <select v-model="actFilter" class="select slim"><option value="">全部幕</option><option v-for="a in acts" :key="a.id" :value="a.id">{{ a.name }}</option></select>
      </div>
      <button class="btn sm primary" @click="addBeat">＋ 新增演出节拍</button>
    </div>

    <section class="card">
      <div class="card-head"><span class="card-title">演出时间线</span><span class="tiny dim">镜头、音频、动画与 VFX 的设计元数据；不渲染引擎画面</span></div>
      <div class="timeline">
        <div v-for="b in filtered" :key="b.id" class="timeline-row">
          <div class="timeline-label">
            <span class="tiny dim">{{ actName(b.actId) }}</span>
            <b class="small">{{ b.title }}</b>
            <span class="tiny dim">{{ b.duration }}s</span>
          </div>
          <div class="timeline-track">
            <div class="timeline-bar" :style="{ width: `${Math.max(8, (b.duration / maxDuration) * 100)}%` }">
              <span class="tiny">{{ b.duration }}s</span>
            </div>
          </div>
        </div>
        <div v-if="!filtered.length" class="empty" style="padding: 28px">还没有演出节拍</div>
      </div>
    </section>

    <div class="beats">
      <article v-for="b in filtered" :key="b.id" class="card beat-card">
        <div class="card-head">
          <input v-model="b.title" class="input slim" style="border-color: transparent; background: transparent; font-weight: 600" />
          <div class="row" style="gap: 3px">
            <button class="btn sm ghost" @click="move(b, -1)">↑</button>
            <button class="btn sm ghost" @click="move(b, 1)">↓</button>
            <button class="btn sm ghost danger" @click="removeBeat(b)">×</button>
          </div>
        </div>
        <div class="card-body grid grid-3" style="gap: 7px">
          <label class="field"><span class="label">幕</span><select v-model="b.actId" class="select slim"><option value="">未分幕</option><option v-for="a in acts" :key="a.id" :value="a.id">{{ a.name }}</option></select></label>
          <label class="field"><span class="label">剧情节点</span><select v-model="b.nodeId" class="select slim"><option value="">不关联</option><option v-for="n in nodes" :key="n.id" :value="n.id">{{ n.title }}</option></select></label>
          <label class="field"><span class="label">时长（秒）</span><input v-model.number="b.duration" type="number" min="1" step="1" class="input slim" /></label>
          <label class="field" style="grid-column: span 2"><span class="label">镜头</span><input v-model="b.camera" class="input slim" placeholder="缓慢推近 / 环绕 / 肩后跟拍" /></label>
          <label class="field"><span class="label">VFX</span><input v-model="b.vfx" class="input slim" /></label>
          <label class="field"><span class="label">音频</span><input v-model="b.audio" class="input slim" placeholder="雨声 / BGM / 音效" /></label>
          <label class="field"><span class="label">动画 / 表演</span><input v-model="b.animation" class="input slim" /></label>
          <label class="field"><span class="label">备注</span><input v-model="b.notes" class="input slim" /></label>
        </div>
      </article>
    </div>
  </div>
</template>

<style scoped>
.storyboard-panel { display: flex; flex-direction: column; gap: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.timeline { padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; max-height: 220px; overflow: auto; }
.timeline-row { display: grid; grid-template-columns: 150px minmax(0, 1fr); align-items: center; gap: 8px; }
.timeline-label { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.timeline-label b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.timeline-track { height: 22px; background: rgba(148, 163, 184, 0.06); border-radius: 4px; overflow: hidden; }
.timeline-bar { height: 100%; background: linear-gradient(90deg, rgba(103, 232, 249, 0.35), rgba(103, 232, 249, 0.1)); border-left: 2px solid var(--cyan); display: flex; align-items: center; padding-left: 5px; color: #dbeafe; }
.beats { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 9px; }
.beat-card { overflow: hidden; }
</style>
