<script setup>
import { computed, ref } from 'vue'
import EmojiPicker from './EmojiPicker.vue'
import { resolveCategoryId } from '../worldTypes'

const props = defineProps({
  categories: { type: Array, default: () => [] },
  customTypes: { type: Array, default: () => [] },
  elements: { type: Array, default: () => [] }
})
const emit = defineEmits(['close', 'create-category', 'delete-category', 'create-type', 'update-type', 'delete-type'])

const tab = ref('categories')
const picker = ref('')
const editingTypeId = ref('')
const catName = ref('')
const catEmoji = ref('📁')
const typeName = ref('')
const typeIcon = ref('✨')
const typeCategory = ref(props.categories.find((c) => c.id === 'content')?.id || props.categories[0]?.id || 'content')
const typeColor = ref('#67e8f9')
const typeRadius = ref(0)
const typeDesc = ref('')

const counts = computed(() => {
  const map = Object.fromEntries(props.categories.map((c) => [c.id, 0]))
  for (const el of props.elements) {
    const id = resolveCategoryId(el, props.categories, props.customTypes)
    map[id] = (map[id] || 0) + 1
  }
  return map
})

const typeUsage = computed(() => {
  const map = {}
  for (const el of props.elements) if (el.type === 'custom') map[el.customTypeId] = (map[el.customTypeId] || 0) + 1
  return map
})

const typeCatUsage = computed(() => {
  const map = {}
  for (const t of props.customTypes) map[t.categoryId] = (map[t.categoryId] || 0) + 1
  return map
})

function addCategory() {
  const name = catName.value.trim()
  if (!name) return
  emit('create-category', { name, emoji: catEmoji.value.trim() || '📁' })
  catName.value = ''
  catEmoji.value = '📁'
  picker.value = ''
}

function addType() {
  const name = typeName.value.trim()
  if (!name) return
  const payload = {
    name,
    icon: typeIcon.value.trim() || '✨',
    categoryId: typeCategory.value,
    color: typeColor.value,
    radius: Number(typeRadius.value) || 0,
    description: typeDesc.value.trim()
  }
  if (editingTypeId.value) emit('update-type', { id: editingTypeId.value, ...payload })
  else emit('create-type', payload)
  resetTypeForm()
}

function resetTypeForm() {
  editingTypeId.value = ''
  typeName.value = ''
  typeIcon.value = '✨'
  typeCategory.value = props.categories.find((c) => c.id === 'content')?.id || props.categories[0]?.id || 'content'
  typeColor.value = '#67e8f9'
  typeRadius.value = 0
  typeDesc.value = ''
  picker.value = ''
}

function startEdit(t) {
  editingTypeId.value = t.id
  typeName.value = t.name
  typeIcon.value = t.icon || '✨'
  typeCategory.value = t.categoryId || 'content'
  typeColor.value = t.color || '#67e8f9'
  typeRadius.value = t.radius || 0
  typeDesc.value = t.description || ''
  tab.value = 'types'
  picker.value = ''
}

function removeCategory(c) {
  if (c.builtin) return
  if ((counts.value[c.id] || 0) > 0) return
  if (confirm(`删除分类「${c.name}」？`)) emit('delete-category', c.id)
}

function removeType(t) {
  if ((typeUsage.value[t.id] || 0) > 0) return
  if (confirm(`删除自定义类型「${t.name}」？`)) emit('delete-type', t.id)
}

function onPick(emoji) {
  if (picker.value === 'category') catEmoji.value = emoji
  if (picker.value === 'type') typeIcon.value = emoji
  picker.value = ''
}
</script>

<template>
  <div class="modal-overlay" @click.self="emit('close')">
    <div class="modal-card catalog-card">
      <div class="modal-head">
        <div>
          <div class="modal-title">自定义元素与分类</div>
          <div class="tiny dim">新建分类、自定义元素类型，并把地图元素重新归类。</div>
        </div>
        <button class="btn sm ghost" @click="emit('close')">✕</button>
      </div>
      <div class="modal-tabs">
        <button class="tab" :class="{ active: tab === 'categories' }" @click="tab = 'categories'">分类</button>
        <button class="tab" :class="{ active: tab === 'types' }" @click="tab = 'types'">自定义元素类型</button>
      </div>

      <div v-if="tab === 'categories'" class="modal-body catalog-body">
        <div class="catalog-create">
          <div class="row" style="gap: 6px">
            <input v-model="catName" class="input grow" placeholder="新分类名称，例如：遗迹、势力、任务点" @keydown.enter="addCategory" />
            <button class="btn sm" :disabled="!catName.trim()" @click="addCategory">＋ 新建分类</button>
          </div>
          <div class="row" style="gap: 6px; margin-top: 6px">
            <button class="btn sm ghost emoji-btn" @click="picker = picker === 'category' ? '' : 'category'">{{ catEmoji }} 选择分类图标</button>
            <span class="tiny dim">分类会出现在地图筛选、添加菜单和元素归类下拉框中</span>
          </div>
          <EmojiPicker v-if="picker === 'category'" :model-value="catEmoji" @update:model-value="onPick" />
        </div>

        <div class="catalog-list">
          <div v-for="c in categories" :key="c.id" class="catalog-row">
            <span class="catalog-emoji">{{ c.emoji || '📁' }}</span>
            <span class="grow">
              <b class="small">{{ c.name }}</b>
              <span class="tiny dim">{{ counts[c.id] || 0 }} 个元素 · {{ typeCatUsage[c.id] || 0 }} 个类型 · {{ c.builtin ? '内置分类' : '自定义分类' }}</span>
            </span>
            <span v-if="c.builtin" class="chip tiny">内置</span>
            <button v-else class="btn sm ghost danger" :disabled="(counts[c.id] || 0) > 0 || (typeCatUsage[c.id] || 0) > 0" :title="(counts[c.id] || 0) > 0 || (typeCatUsage[c.id] || 0) > 0 ? '分类下还有元素或类型，不能删除' : '删除分类'" @click="removeCategory(c)">删除</button>
          </div>
        </div>
      </div>

      <div v-else class="modal-body catalog-body">
        <div class="catalog-create">
          <div class="grid grid-2">
            <label class="field"><span class="label">类型名称</span><input v-model="typeName" class="input" placeholder="例如：遗迹、宝箱、任务点" /></label>
            <label class="field"><span class="label">归类</span>
              <select v-model="typeCategory" class="select">
                <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.emoji }} {{ c.name }}</option>
              </select>
            </label>
          </div>
          <div class="row" style="gap: 6px; margin-top: 6px">
            <button class="btn sm ghost emoji-btn" @click="picker = picker === 'type' ? '' : 'type'">{{ typeIcon }} 选择 Emoji 图标</button>
            <input v-model="typeColor" type="color" class="input color-input" style="width: 46px; padding: 2px" title="颜色" />
            <input v-model.number="typeRadius" type="number" min="0" step="10" class="input slim mono" style="width: 90px" placeholder="范围半径" />
            <span class="tiny dim">半径 &gt; 0 时绘制为区域</span>
          </div>
          <EmojiPicker v-if="picker === 'type'" :model-value="typeIcon" @update:model-value="onPick" />
          <label class="field" style="margin-top: 7px"><span class="label">说明（可选）</span><input v-model="typeDesc" class="input" placeholder="这个元素代表什么？" /></label>
          <div class="row" style="justify-content: flex-end; margin-top: 7px; gap: 6px">
            <button v-if="editingTypeId" class="btn ghost" @click="resetTypeForm">取消编辑</button>
            <button class="btn primary" :disabled="!typeName.trim()" @click="addType">{{ editingTypeId ? '保存修改' : '＋ 创建类型' }}</button>
          </div>
          <div class="hint">创建后可在「添加元素」菜单中无限放置该类型；实例会保存自己的名称、坐标与备注。</div>
        </div>

        <div class="catalog-list">
          <div v-for="t in customTypes" :key="t.id" class="catalog-row">
            <span class="catalog-emoji">{{ t.icon || '✨' }}</span>
            <span class="grow">
              <b class="small">{{ t.name }}</b>
              <span class="tiny dim">{{ categories.find((c) => c.id === t.categoryId)?.name || '内容' }} · {{ typeUsage[t.id] || 0 }} 个实例</span>
            </span>
            <button class="btn sm ghost" @click="startEdit(t)">编辑</button>
            <button class="btn sm ghost danger" :disabled="(typeUsage[t.id] || 0) > 0" :title="(typeUsage[t.id] || 0) > 0 ? '仍有实例使用，不能删除' : '删除类型'" @click="removeType(t)">删除</button>
          </div>
          <div v-if="!customTypes.length" class="empty" style="padding: 18px">还没有自定义类型。创建后即可从添加菜单放置。</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.modal-overlay { position: fixed; inset: 0; background: rgba(2, 6, 23, 0.74); backdrop-filter: blur(6px); z-index: 60; display: grid; place-items: center; padding: 20px; }
.modal-card { background: #0d1626; border: 1px solid var(--line-strong); border-radius: 16px; box-shadow: 0 30px 90px rgba(2, 6, 23, 0.8); overflow: hidden; }
.catalog-card { width: min(720px, calc(100vw - 40px)); max-height: min(760px, calc(100vh - 60px)); display: flex; flex-direction: column; z-index: 30; }
.modal-head { display: flex; align-items: flex-start; justify-content: space-between; padding: 15px 17px 10px; }
.modal-tabs { display: flex; gap: 2px; padding: 0 17px; border-bottom: 1px solid var(--line); }
.catalog-body { overflow: auto; padding: 12px 17px 18px; display: flex; flex-direction: column; gap: 12px; }
.catalog-create { border: 1px solid var(--line); background: rgba(2, 6, 23, 0.3); border-radius: 10px; padding: 10px; }
.catalog-list { display: flex; flex-direction: column; gap: 4px; }
.catalog-row { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border: 1px solid var(--line); border-radius: 8px; background: rgba(2, 6, 23, 0.22); }
.catalog-emoji { width: 30px; text-align: center; font-size: 20px; font-family: "Segoe UI Emoji", "Apple Color Emoji", sans-serif; flex: 0 0 30px; }
.emoji-btn { font-size: 16px; font-family: "Segoe UI Emoji", "Apple Color Emoji", sans-serif; }
@media (max-width: 700px) { .catalog-card { width: calc(100vw - 20px); } }
</style>
