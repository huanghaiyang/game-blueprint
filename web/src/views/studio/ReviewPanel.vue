<script setup>
import { computed, ref } from 'vue'
import { store, notify } from '../../store'

const project = computed(() => store.project)
const reviews = computed(() => project.value?.reviews || (project.value.reviews = []))
const statusFilter = ref('open')
const moduleFilter = ref('')
const showNew = ref(false)
const draft = ref({ module: 'narrative', entityLabel: '', entityId: '', author: '我', text: '' })
const replyText = ref({})
const MODULES = ['meta', 'narrative', 'characters', 'stats', 'combat', 'branches', 'world', 'cases', 'storyboard', 'storylets', 'studio', 'localization', 'production']
const filtered = computed(() => reviews.value.filter((r) => {
  if (statusFilter.value && r.status !== statusFilter.value) return false
  if (moduleFilter.value && r.module !== moduleFilter.value) return false
  return true
}))
const openCount = computed(() => reviews.value.filter((r) => r.status !== 'resolved').length)

function add() {
  if (!draft.value.text.trim()) return
  reviews.value.unshift({
    id: `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 4)}`,
    module: draft.value.module,
    entityId: draft.value.entityId.trim(),
    entityLabel: draft.value.entityLabel.trim() || draft.value.module,
    author: draft.value.author.trim() || '我',
    text: draft.value.text.trim(),
    status: 'open',
    createdAt: new Date().toISOString(),
    replies: []
  })
  draft.value = { module: 'narrative', entityLabel: '', entityId: '', author: '我', text: '' }
  showNew.value = false
  notify('评论已添加', 'ok')
}

function toggle(r) {
  r.status = r.status === 'resolved' ? 'open' : 'resolved'
}

function reply(r) {
  const text = (replyText.value[r.id] || '').trim()
  if (!text) return
  r.replies = r.replies || []
  r.replies.push({ id: `reply-${Date.now().toString(36)}`, author: '我', text, createdAt: new Date().toISOString() })
  replyText.value[r.id] = ''
}

function fmt(iso) {
  return iso ? new Date(iso).toLocaleString('zh-CN') : ''
}
</script>

<template>
  <div class="studio-panel review-panel">
    <div class="panel-head">
      <div class="row" style="gap: 6px; flex-wrap: wrap">
        <span class="badge">评论 {{ reviews.length }}</span>
        <span class="chip tiny rose">未解决 {{ openCount }}</span>
        <select v-model="statusFilter" class="select slim"><option value="">全部</option><option value="open">未解决</option><option value="resolved">已解决</option></select>
        <select v-model="moduleFilter" class="select slim"><option value="">全部模块</option><option v-for="m in MODULES" :key="m" :value="m">{{ m }}</option></select>
      </div>
      <button class="btn sm primary" @click="showNew = !showNew">＋ 新建评论</button>
    </div>

    <div v-if="showNew" class="card" style="padding: 9px">
      <div class="grid grid-3" style="gap: 7px">
        <label class="field"><span class="label">模块</span><select v-model="draft.module" class="select slim"><option v-for="m in MODULES" :key="m" :value="m">{{ m }}</option></select></label>
        <label class="field"><span class="label">实体标签</span><input v-model="draft.entityLabel" class="input slim" placeholder="白鹭的交易" /></label>
        <label class="field"><span class="label">实体 ID（可选）</span><input v-model="draft.entityId" class="input slim" placeholder="n9" /></label>
        <label class="field"><span class="label">作者</span><input v-model="draft.author" class="input slim" /></label>
        <label class="field" style="grid-column: span 2"><span class="label">评论</span><input v-model="draft.text" class="input slim" placeholder="这里需要更明确的代价…" /></label>
      </div>
      <div class="row" style="justify-content: flex-end; gap: 6px; margin-top: 7px">
        <button class="btn sm ghost" @click="showNew = false">取消</button>
        <button class="btn sm primary" :disabled="!draft.text.trim()" @click="add">发布</button>
      </div>
    </div>

    <div class="review-list">
      <article v-for="r in filtered" :key="r.id" class="card review-card" :class="{ resolved: r.status === 'resolved' }">
        <div class="review-head">
          <div>
            <span class="chip tiny cyan">{{ r.module }}</span>
            <b class="small" style="margin-left: 5px">{{ r.entityLabel }}</b>
            <span class="tiny dim"> · {{ r.author }} · {{ fmt(r.createdAt) }}</span>
          </div>
          <button class="btn sm" :class="{ ghost: r.status === 'resolved' }" @click="toggle(r)">{{ r.status === 'resolved' ? '重新打开' : '标记解决' }}</button>
        </div>
        <p class="review-text">{{ r.text }}</p>
        <div v-if="r.replies?.length" class="replies">
          <div v-for="rep in r.replies" :key="rep.id" class="reply-row">
            <span class="tiny cyan">{{ rep.author }}</span>
            <span class="tiny">{{ rep.text }}</span>
            <span class="tiny dim">{{ fmt(rep.createdAt) }}</span>
          </div>
        </div>
        <div class="row" style="gap: 5px; margin-top: 5px">
          <input v-model="replyText[r.id]" class="input slim grow" placeholder="回复…" @keydown.enter="reply(r)" />
          <button class="btn sm ghost" :disabled="!replyText[r.id]?.trim()" @click="reply(r)">回复</button>
        </div>
      </article>
      <div v-if="!filtered.length" class="empty" style="padding: 35px">没有匹配的评论</div>
    </div>
  </div>
</template>

<style scoped>
.review-panel { display: flex; flex-direction: column; gap: 10px; }
.panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
.review-list { display: flex; flex-direction: column; gap: 7px; overflow: auto; }
.review-card { padding: 10px 12px; }
.review-card.resolved { opacity: 0.65; }
.review-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
.review-text { margin: 6px 0; font-size: 12px; line-height: 1.6; }
.replies { border-left: 2px solid var(--line-strong); padding-left: 8px; display: flex; flex-direction: column; gap: 4px; margin: 5px 0; }
.reply-row { display: flex; gap: 6px; align-items: baseline; flex-wrap: wrap; }
</style>
