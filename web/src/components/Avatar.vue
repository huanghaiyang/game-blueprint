<script setup>
import { computed } from 'vue'

const props = defineProps({
  name: { type: String, default: '?' },
  color: { type: String, default: '#67e8f9' },
  size: { type: Number, default: 42 }
})

function hash(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const art = computed(() => {
  const seed = hash(props.name || 'anon')
  let state = seed
  const rnd = () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 4294967296
  }
  const shapes = []
  for (let i = 0; i < 5; i++) {
    const kind = Math.floor(rnd() * 3)
    if (kind === 0) shapes.push({ t: 'c', cx: 20 + rnd() * 60, cy: 20 + rnd() * 60, r: 8 + rnd() * 24, o: 0.18 + rnd() * 0.5 })
    else if (kind === 1) shapes.push({ t: 'l', x1: rnd() * 100, y1: rnd() * 100, x2: rnd() * 100, y2: rnd() * 100, o: 0.25 + rnd() * 0.5 })
    else shapes.push({ t: 'r', x: 12 + rnd() * 50, y: 12 + rnd() * 50, w: 16 + rnd() * 40, h: 16 + rnd() * 40, o: 0.12 + rnd() * 0.3, rot: rnd() * 90 })
  }
  const initial = (props.name || '?').trim().slice(0, 1)
  return { shapes, initial, seed }
})
</script>

<template>
  <div class="avatar" :class="{ lg: size >= 60 }" :style="{ background: `radial-gradient(circle at 30% 25%, ${color}33, #060b14 70%)`, borderColor: color + '55' }">
    <svg viewBox="0 0 100 100" width="100%" height="100%" :aria-label="name">
      <defs>
        <linearGradient :id="`g-${art.seed}`" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.95" />
          <stop offset="100%" :stop-color="color" stop-opacity="0.25" />
        </linearGradient>
      </defs>
      <g>
        <template v-for="(s, i) in art.shapes" :key="i">
          <circle v-if="s.t === 'c'" :cx="s.cx" :cy="s.cy" :r="s.r" fill="none" :stroke="color" :stroke-opacity="s.o" stroke-width="3" />
          <line v-else-if="s.t === 'l'" :x1="s.x1" :y1="s.y1" :x2="s.x2" :y2="s.y2" :stroke="color" :stroke-opacity="s.o" stroke-width="3" />
          <rect v-else :x="s.x" :y="s.y" :width="s.w" :height="s.h" :rx="4" fill="none" :stroke="color" :stroke-opacity="s.o" stroke-width="2.5" :transform="`rotate(${s.rot} ${s.x + s.w / 2} ${s.y + s.h / 2})`" />
        </template>
      </g>
      <text x="50" y="58" text-anchor="middle" font-size="34" font-weight="700" :fill="`url(#g-${art.seed})`" opacity="0.92" style="font-family: 'PingFang SC', 'Microsoft YaHei', sans-serif">{{ art.initial }}</text>
    </svg>
  </div>
</template>
