<script setup>
import { computed } from 'vue'

const props = defineProps({
  series: { type: Array, default: () => [] }, // [{ name, color, values:number[] }]
  labels: { type: Array, default: () => [] },
  height: { type: Number, default: 200 },
  yMax: { type: Number, default: null },
  yMin: { type: Number, default: 0 },
  unit: { type: String, default: '' },
  fill: { type: Boolean, default: true }
})

const W = 640
const H = computed(() => props.height)
const pad = { l: 44, r: 14, t: 14, b: 26 }

const bounds = computed(() => {
  const all = props.series.flatMap((s) => s.values.filter((v) => typeof v === 'number' && Number.isFinite(v)))
  const max = props.yMax != null ? props.yMax : Math.max(1, ...all) * 1.1
  const min = props.yMin
  return { min, max: max === min ? min + 1 : max }
})

function x(i) {
  const n = Math.max(1, (props.labels.length || props.series[0]?.values.length || 1) - 1)
  return pad.l + (i / n) * (W - pad.l - pad.r)
}
function y(v) {
  const { min, max } = bounds.value
  return H.value - pad.b - ((v - min) / (max - min)) * (H.value - pad.t - pad.b)
}

const gridLines = computed(() => {
  const { min, max } = bounds.value
  return [0, 0.25, 0.5, 0.75, 1].map((t) => {
    const value = min + (max - min) * t
    return { value, y: y(value) }
  })
})

function pathOf(values) {
  return values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
}
function areaOf(values) {
  if (!values.length) return ''
  return `${pathOf(values)} L${x(values.length - 1).toFixed(1)},${H.value - pad.b} L${pad.l},${H.value - pad.b} Z`
}
const lastIndex = computed(() => (props.labels.length || props.series[0]?.values.length || 1) - 1)
</script>

<template>
  <div class="chart">
    <svg :viewBox="`0 0 ${W} ${H}`" width="100%" preserveAspectRatio="xMidYMid meet" role="img">
      <g>
        <line v-for="(g, i) in gridLines" :key="i" :x1="pad.l" :x2="W - pad.r" :y1="g.y" :y2="g.y" stroke="rgba(148,163,184,0.12)" stroke-width="1" />
        <text v-for="(g, i) in gridLines" :key="'t' + i" :x="pad.l - 8" :y="g.y + 3.5" text-anchor="end" font-size="9.5" fill="#64748b" font-family="monospace">{{ Math.round(g.value * 10) / 10 }}</text>
      </g>
      <g>
        <text v-for="(l, i) in labels" :key="'x' + i" :x="x(i)" :y="H - 8" text-anchor="middle" font-size="9.5" fill="#64748b">{{ l }}</text>
      </g>
      <g v-for="(s, si) in series" :key="si">
        <path v-if="fill" :d="areaOf(s.values)" :fill="s.color" opacity="0.09" />
        <path :d="pathOf(s.values)" fill="none" :stroke="s.color" stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round" />
        <circle :cx="x(lastIndex)" :cy="y(s.values[lastIndex])" r="3.2" :fill="s.color" />
      </g>
      <line v-if="!series.length" :x1="pad.l" :x2="W - pad.r" :y1="H / 2" :y2="H / 2" stroke="rgba(148,163,184,0.2)" stroke-dasharray="3 4" />
    </svg>
    <div class="legend">
      <span v-for="(s, i) in series" :key="i" class="legend-item"><i :style="{ background: s.color }"></i>{{ s.name }}</span>
    </div>
  </div>
</template>

<style scoped>
.chart { width: 100%; }
.legend { display: flex; flex-wrap: wrap; gap: 12px; padding: 2px 8px 0; }
.legend-item { display: inline-flex; align-items: center; gap: 5px; font-size: 10.5px; color: var(--muted); }
.legend-item i { width: 8px; height: 8px; border-radius: 2px; display: inline-block; }
</style>
