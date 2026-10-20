<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { WORLD_TYPES, isPathType, isAreaType } from '../worldTypes'

const props = defineProps({
  elements: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  visibleTypes: { type: Array, default: () => Object.keys(WORLD_TYPES) },
  snap: { type: Boolean, default: true },
  drawMode: { type: String, default: '' },
  viewerName: { type: String, default: '' }
})
const emit = defineEmits(['select', 'move', 'path-complete', 'path-cancel'])

const wrapRef = ref(null)
const canvasRef = ref(null)
const coords = ref({ x: 0, y: 0 })
const zoomRef = ref(0.5)
const hover = ref(null)

const GRID = 20
const MIN_ZOOM = 0.12
const MAX_ZOOM = 3
const DRAW_ORDER = ['region', 'river', 'road', 'mountain', 'tree', 'building', 'settlement', 'stronghold', 'bulletin', 'sign', 'portal', 'collectible', 'character']

let ctx = null
let dpr = 1
let W = 0
let H = 0
let cam = { x: 0, y: 0, zoom: 0.5 }
let raf = 0
let drag = null
const drawing = ref([])
let pointer = { x: 0, y: 0, inside: false }
let didFit = false
let minimapDrag = false
let resizeObserver = null
let lastElementsKey = ''

const visibleSet = computed(() => new Set(props.visibleTypes))
const drawModeLabel = computed(() => (props.drawMode ? WORLD_TYPES[props.drawMode]?.label : ''))

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const TYPE_GLYPH = { region: '◌', river: '≈', road: '╌', mountain: '⛰', tree: '♣', building: '⌂', settlement: '⬢', stronghold: '♜', bulletin: '▤', sign: '➤', portal: '◎', collectible: '◆', character: '◉' }

function cssVar(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function hexToRgba(hex, alpha) {
  if (!hex) return `rgba(148,163,184,${alpha})`
  let h = String(hex).replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h, 16)
  if (!Number.isFinite(n)) return `rgba(148,163,184,${alpha})`
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

function sx(x) { return (x - cam.x) * cam.zoom + W / 2 }
function sy(y) { return (y - cam.y) * cam.zoom + H / 2 }
function wx(px) { return (px - W / 2) / cam.zoom + cam.x }
function wy(py) { return (py - H / 2) / cam.zoom + cam.y }
function snapVal(v) { return props.snap ? Math.round(v / GRID) * GRID : Math.round(v) }

function elementPos(el) {
  if (drag && drag.mode === 'element' && drag.id === el.id && drag.preview) return drag.preview
  return { x: Number(el.x) || 0, y: Number(el.y) || 0 }
}

function absPoints(el, pos = elementPos(el)) {
  return (el.points || []).map((p) => ({ x: pos.x + Number(p.x || 0), y: pos.y + Number(p.y || 0) }))
}

function pathPointsScreen(pts, pos) {
  return pts.map((p) => ({ x: sx(pos.x + p.x), y: sy(pos.y + p.y) }))
}

function boundsOf(elements) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x, y, r = 0) => {
    minX = Math.min(minX, x - r)
    minY = Math.min(minY, y - r)
    maxX = Math.max(maxX, x + r)
    maxY = Math.max(maxY, y + r)
  }
  for (const el of elements) {
    const x = Number(el.x) || 0
    const y = Number(el.y) || 0
    add(x, y, Number(el.radius) || 0)
    for (const p of el.points || []) add(x + Number(p.x || 0), y + Number(p.y || 0), 20)
  }
  if (!Number.isFinite(minX)) return { minX: -600, minY: -400, maxX: 600, maxY: 400 }
  return { minX, minY, maxX, maxY }
}

function fit() {
  if (!W || !H) return
  const b = boundsOf(props.elements)
  const pad = 90
  const bw = Math.max(200, b.maxX - b.minX)
  const bh = Math.max(200, b.maxY - b.minY)
  // 无限画布也让首屏可读：最低 32%，宁可裁掉边缘也保证图标与标签可辨认
  cam.zoom = clamp(Math.min((W - pad * 2) / bw, (H - pad * 2) / bh), 0.32, 1.5)
  if (cam.zoom === 0.32) {
    const focus = props.elements.filter((el) => ['settlement', 'stronghold', 'character'].includes(el.type))
    if (focus.length) {
      cam.x = focus.reduce((s, el) => s + (Number(el.x) || 0), 0) / focus.length
      cam.y = focus.reduce((s, el) => s + (Number(el.y) || 0), 0) / focus.length
    } else {
      cam.x = (b.minX + b.maxX) / 2
      cam.y = (b.minY + b.maxY) / 2
    }
  } else {
    cam.x = (b.minX + b.maxX) / 2
    cam.y = (b.minY + b.maxY) / 2
  }
  zoomRef.value = cam.zoom
  didFit = true
}

function focusOn(el) {
  if (!el) return
  cam.x = Number(el.x) || 0
  cam.y = Number(el.y) || 0
  cam.zoom = Math.max(cam.zoom, 0.7)
  zoomRef.value = cam.zoom
}

function getCenter() { return { x: cam.x, y: cam.y } }

function overview() {
  if (!W || !H) return
  const b = boundsOf(props.elements)
  const pad = 40
  cam.zoom = clamp(Math.min((W - pad * 2) / Math.max(200, b.maxX - b.minX), (H - pad * 2) / Math.max(200, b.maxY - b.minY)), MIN_ZOOM, 1.5)
  cam.x = (b.minX + b.maxX) / 2
  cam.y = (b.minY + b.maxY) / 2
  zoomRef.value = cam.zoom
}

function zoomBy(factor, centerPx = null) {
  const cx = centerPx?.x ?? W / 2
  const cy = centerPx?.y ?? H / 2
  const before = { x: wx(cx), y: wy(cy) }
  cam.zoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM)
  cam.x = before.x - (cx - W / 2) / cam.zoom
  cam.y = before.y - (cy - H / 2) / cam.zoom
  zoomRef.value = cam.zoom
}

function resize() {
  const wrap = wrapRef.value
  const canvas = canvasRef.value
  if (!wrap || !canvas) return
  W = Math.max(120, wrap.clientWidth)
  H = Math.max(120, wrap.clientHeight)
  dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  canvas.style.width = `${W}px`
  canvas.style.height = `${H}px`
  if (!didFit && props.elements.length) fit()
}

/* ---------------- 绘制 ---------------- */

function drawGrid() {
  const base = 20
  let step = base
  while (step * cam.zoom < 16) step *= 2
  while (step * cam.zoom > 120) step /= 2
  const left = cam.x - W / 2 / cam.zoom
  const right = cam.x + W / 2 / cam.zoom
  const top = cam.y - H / 2 / cam.zoom
  const bottom = cam.y + H / 2 / cam.zoom
  const startX = Math.floor(left / step) * step
  const startY = Math.floor(top / step) * step

  ctx.fillStyle = 'rgba(148,163,184,0.22)'
  for (let x = startX; x <= right; x += step) {
    const px = sx(x)
    for (let y = startY; y <= bottom; y += step) {
      const py = sy(y)
      ctx.fillRect(px, py, 1, 1)
    }
  }

  ctx.strokeStyle = 'rgba(148,163,184,0.08)'
  ctx.lineWidth = 1
  const major = step * 5
  for (let x = Math.floor(left / major) * major; x <= right; x += major) {
    ctx.beginPath()
    ctx.moveTo(sx(x), 0)
    ctx.lineTo(sx(x), H)
    ctx.stroke()
  }
  for (let y = Math.floor(top / major) * major; y <= bottom; y += major) {
    ctx.beginPath()
    ctx.moveTo(0, sy(y))
    ctx.lineTo(W, sy(y))
    ctx.stroke()
  }

  const ox = sx(0)
  const oy = sy(0)
  ctx.strokeStyle = 'rgba(103,232,249,0.16)'
  ctx.lineWidth = 1.2
  if (ox >= 0 && ox <= W) { ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox, H); ctx.stroke() }
  if (oy >= 0 && oy <= H) { ctx.beginPath(); ctx.moveTo(0, oy); ctx.lineTo(W, oy); ctx.stroke() }
}

function tracePath(pts) {
  if (!pts.length) return
  ctx.beginPath()
  ctx.moveTo(pts[0].x, pts[0].y)
  if (pts.length === 2) {
    ctx.lineTo(pts[1].x, pts[1].y)
    return
  }
  for (let i = 1; i < pts.length - 1; i++) {
    const midX = (pts[i].x + pts[i + 1].x) / 2
    const midY = (pts[i].y + pts[i + 1].y) / 2
    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY)
  }
  const last = pts[pts.length - 1]
  ctx.lineTo(last.x, last.y)
}

function drawPathElement(el, pos, selected) {
  const pts = pathPointsScreen(el.points || [], pos)
  if (pts.length < 2) return
  const rawW = Number(el.data?.width) || (el.type === 'river' ? 20 : 6)
  const width = clamp(rawW * cam.zoom, el.type === 'river' ? 2 : 1.4, el.type === 'river' ? 60 : 22)
  ctx.save()
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (el.type === 'river') {
    ctx.strokeStyle = hexToRgba(el.color || '#38bdf8', 0.18)
    ctx.lineWidth = width + 12 * cam.zoom
    tracePath(pts)
    ctx.stroke()
    ctx.strokeStyle = hexToRgba(el.color || '#38bdf8', 0.95)
    ctx.lineWidth = width
    tracePath(pts)
    ctx.stroke()
    ctx.strokeStyle = 'rgba(224,242,254,0.35)'
    ctx.lineWidth = Math.max(0.8, width * 0.18)
    tracePath(pts)
    ctx.stroke()
  } else {
    ctx.strokeStyle = selected ? 'rgba(103,232,249,0.9)' : hexToRgba(el.color || '#a8a29e', 0.7)
    ctx.lineWidth = Math.max(1.2, width)
    ctx.setLineDash(selected ? [] : [10 * cam.zoom, 7 * cam.zoom])
    tracePath(pts)
    ctx.stroke()
  }
  ctx.restore()

  const mid = pts[Math.floor(pts.length / 2)]
  const label = el.name || ''
  drawLabel(label, mid.x, mid.y - 8, el.color, selected, el.type === 'river')
  if (selected) {
    for (const p of pts) {
      ctx.beginPath()
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2)
      ctx.fillStyle = '#67e8f9'
      ctx.fill()
    }
  }
}

function drawArea(el, x, y, size, status) {
  const r = (Number(el.radius) || 0) * cam.zoom
  if (r < 2) return
  ctx.save()
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fillStyle = hexToRgba(status.color, el.type === 'settlement' ? 0.08 : 0.055)
  ctx.fill()
  ctx.setLineDash(el.type === 'settlement' ? [] : [7, 7])
  ctx.strokeStyle = hexToRgba(status.color, el.type === 'settlement' ? 0.55 : 0.35)
  ctx.lineWidth = el.type === 'settlement' ? 1.6 : 1.1
  ctx.stroke()
  ctx.restore()
}

function drawLabel(text, x, y, color, selected, big = false) {
  if (!text) return
  if (cam.zoom < 0.26 && !selected) return
  const label = text.length > 12 ? `${text.slice(0, 11)}…` : text
  const fs = clamp(big ? 12 * cam.zoom : 11 * cam.zoom, 10, big ? 16 : 13)
  ctx.save()
  ctx.font = `500 ${fs}px "PingFang SC","Microsoft YaHei",system-ui,sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const tw = ctx.measureText(label).width
  const padX = 6
  const h = fs + 8
  roundRect(x - tw / 2 - padX, y, tw + padX * 2, h, 5)
  ctx.fillStyle = selected ? 'rgba(8,47,73,0.92)' : 'rgba(3,8,18,0.72)'
  ctx.fill()
  if (selected) {
    ctx.strokeStyle = 'rgba(103,232,249,0.55)'
    ctx.lineWidth = 1
    ctx.stroke()
  }
  ctx.fillStyle = selected ? '#e6fbff' : 'rgba(226,232,240,0.9)'
  ctx.fillText(label, x, y + h / 2)
  ctx.restore()
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + rr, y)
  ctx.arcTo(x + w, y, x + w, y + h, rr)
  ctx.arcTo(x + w, y + h, x, y + h, rr)
  ctx.arcTo(x, y + h, x, y, rr)
  ctx.arcTo(x, y, x + w, y, rr)
  ctx.closePath()
}

function statusOf(el) {
  if (el.type === 'settlement') {
    const hostile = !!el.data?.hostile
    const safe = !!el.data?.safeZone
    return { color: hostile ? '#fb7185' : safe ? '#86efac' : '#fbbf24', text: hostile ? '敌对' : safe ? '安全区' : '中立' }
  }
  if (el.type === 'region') return { color: el.color || '#4ade80', text: el.data?.regionType || '区域' }
  return { color: el.color || '#94a3b8', text: '' }
}

function drawElement(el) {
  const visible = visibleSet.value.has(el.type)
  if (!visible) return
  const pos = elementPos(el)
  const x = sx(pos.x)
  const y = sy(pos.y)
  const selected = el.id === props.selectedId
  const hovered = hover.value?.id === el.id
  const size = clamp(19 * cam.zoom, 11, 42)
  const status = statusOf(el)

  if (el.type === 'region' || el.type === 'settlement' || el.type === 'mountain') drawArea(el, x, y, size, status)
  if (el.type === 'river' || el.type === 'road') { drawPathElement(el, pos, selected); return }

  if (x < -120 || x > W + 120 || y < -120 || y > H + 120) return
  if (selected) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, size + 9, 0, Math.PI * 2)
    ctx.setLineDash([5, 4])
    ctx.strokeStyle = 'rgba(103,232,249,0.95)'
    ctx.lineWidth = 1.6
    ctx.stroke()
    ctx.restore()
  }
  if (hovered) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(x, y, size + 5, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.stroke()
    ctx.restore()
  }

  const color = el.color || WORLD_TYPES[el.type]?.color || '#94a3b8'
  ctx.save()
  ctx.translate(x, y)
  ctx.lineJoin = 'round'
  const fill = hexToRgba(color, 0.22)
  const stroke = color

  if (el.type === 'character') {
    const r = size * 0.55
    ctx.beginPath()
    ctx.arc(0, 0, r, 0, Math.PI * 2)
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = el.data?.hostile ? '#fb7185' : stroke
    ctx.lineWidth = selected ? 2.4 : 1.8
    ctx.stroke()
    ctx.fillStyle = '#e6fbff'
    ctx.font = `600 ${Math.max(9, r * 0.95)}px "PingFang SC","Microsoft YaHei",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText((el.name || '?').slice(0, 1), 0, 1)
    if (el.data?.player) {
      ctx.beginPath()
      ctx.arc(0, -r - 7, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#67e8f9'
      ctx.fill()
    }
    if (el.data?.hostile) {
      ctx.beginPath()
      ctx.arc(0, 0, r + 4, 0, Math.PI * 2)
      ctx.strokeStyle = 'rgba(251,113,133,0.6)'
      ctx.lineWidth = 1.2
      ctx.stroke()
    }
  } else if (el.type === 'settlement') {
    const r = size * 0.72
    ctx.beginPath()
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6
      const px = Math.cos(a) * r
      const py = Math.sin(a) * r
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = status.color
    ctx.lineWidth = selected ? 2.4 : 1.9
    ctx.stroke()
    ctx.fillStyle = '#e6fbff'
    ctx.font = `600 ${Math.max(8, r * 0.6)}px "PingFang SC","Microsoft YaHei",sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('⌂', 0, 1)
    const buffs = el.data?.buffs?.length || 0
    if (buffs) {
      ctx.beginPath()
      ctx.arc(r * 0.96, -r * 0.96, 7, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(3,8,18,0.9)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(251,191,36,0.7)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = '#fde68a'
      ctx.font = '9px monospace'
      ctx.fillText(`✦${buffs}`, r * 0.96, -r * 0.96 + 0.5)
    }
  } else if (el.type === 'stronghold') {
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.6
    ctx.beginPath()
    ctx.rect(-size * 0.42, -size * 0.2, size * 0.84, size * 0.8)
    ctx.fill()
    ctx.stroke()
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.rect(-size * 0.42 + i * size * 0.3, -size * 0.42, size * 0.18, size * 0.22)
      ctx.fillStyle = hexToRgba(color, 0.5)
      ctx.fill()
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.moveTo(size * 0.28, -size * 0.2)
    ctx.lineTo(size * 0.28, -size * 0.72)
    ctx.strokeStyle = '#fbbf24'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(size * 0.3, -size * 0.72)
    ctx.lineTo(size * 0.7, -size * 0.6)
    ctx.lineTo(size * 0.3, -size * 0.48)
    ctx.closePath()
    ctx.fillStyle = '#fbbf24'
    ctx.fill()
  } else if (el.type === 'building') {
    ctx.fillStyle = fill
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.rect(-size * 0.45, -size * 0.05, size * 0.9, size * 0.68)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-size * 0.58, -size * 0.05)
    ctx.lineTo(0, -size * 0.62)
    ctx.lineTo(size * 0.58, -size * 0.05)
    ctx.closePath()
    ctx.fillStyle = hexToRgba(color, 0.4)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#0b1220'
    ctx.fillRect(-size * 0.11, size * 0.22, size * 0.22, size * 0.41)
  } else if (el.type === 'tree') {
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = Math.max(1.4, size * 0.13)
    ctx.beginPath()
    ctx.moveTo(0, size * 0.55)
    ctx.lineTo(0, size * 0.05)
    ctx.stroke()
    ctx.fillStyle = hexToRgba(color, 0.55)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(0, -size * 0.7)
    ctx.lineTo(size * 0.55, size * 0.2)
    ctx.lineTo(-size * 0.55, size * 0.2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
  } else if (el.type === 'mountain') {
    const peaks = clamp(Number(el.data?.peaks) || 3, 2, 5)
    const step = (size * 1.4) / peaks
    for (let i = 0; i < peaks; i++) {
      const px = -size * 0.7 + step * i + step / 2
      const ph = size * (0.55 + ((i * 37) % 30) / 100)
      ctx.beginPath()
      ctx.moveTo(px - step * 0.65, size * 0.5)
      ctx.lineTo(px, size * 0.5 - ph)
      ctx.lineTo(px + step * 0.65, size * 0.5)
      ctx.closePath()
      ctx.fillStyle = hexToRgba(color, 0.32 + i * 0.05)
      ctx.fill()
      ctx.strokeStyle = hexToRgba(color, 0.7)
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(px - step * 0.16, size * 0.5 - ph * 0.62)
      ctx.lineTo(px, size * 0.5 - ph)
      ctx.lineTo(px + step * 0.16, size * 0.5 - ph * 0.62)
      ctx.strokeStyle = 'rgba(241,245,249,0.65)'
      ctx.stroke()
    }
  } else if (el.type === 'region') {
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2)
    ctx.fillStyle = hexToRgba(color, 0.28)
    ctx.fill()
    ctx.strokeStyle = hexToRgba(color, 0.8)
    ctx.lineWidth = 1.2
    ctx.stroke()
    ctx.fillStyle = hexToRgba(color, 0.9)
    ctx.font = `600 ${Math.max(8, size * 0.4)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('◌', 0, 1)
  } else if (el.type === 'collectible') {    const r = size * 0.52
    ctx.beginPath()
    ctx.moveTo(0, -r)
    ctx.lineTo(r * 0.8, 0)
    ctx.lineTo(0, r)
    ctx.lineTo(-r * 0.8, 0)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2)
    ctx.fillStyle = hexToRgba(color, 0.65)
    ctx.fill()
  } else if (el.type === 'bulletin') {
    ctx.fillStyle = hexToRgba(color, 0.18)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.rect(-size * 0.55, -size * 0.45, size * 1.1, size * 0.7)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(-size * 0.32, -size * 0.3, size * 0.26, size * 0.36)
    ctx.fillRect(size * 0.06, -size * 0.3, size * 0.26, size * 0.28)
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(-size * 0.4, size * 0.25)
    ctx.lineTo(-size * 0.4, size * 0.62)
    ctx.moveTo(size * 0.4, size * 0.25)
    ctx.lineTo(size * 0.4, size * 0.62)
    ctx.stroke()
  } else if (el.type === 'sign') {
    ctx.strokeStyle = '#a16207'
    ctx.lineWidth = Math.max(1.4, size * 0.12)
    ctx.beginPath()
    ctx.moveTo(0, size * 0.6)
    ctx.lineTo(0, 0)
    ctx.stroke()
    ctx.fillStyle = hexToRgba(color, 0.3)
    ctx.strokeStyle = stroke
    ctx.lineWidth = 1.4
    ctx.beginPath()
    ctx.moveTo(-size * 0.55, -size * 0.35)
    ctx.lineTo(size * 0.45, -size * 0.35)
    ctx.lineTo(size * 0.68, -size * 0.05)
    ctx.lineTo(size * 0.45, size * 0.25)
    ctx.lineTo(-size * 0.55, size * 0.25)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#f8fafc'
    ctx.font = `600 ${Math.max(8, size * 0.34)}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(el.data?.direction || '→', 0, -size * 0.05)
  } else if (el.type === 'portal') {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.ellipse(0, 0, size * (0.28 + i * 0.15), size * (0.5 + i * 0.12), 0, 0, Math.PI * 2)
      ctx.strokeStyle = hexToRgba(color, 0.75 - i * 0.16)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
    ctx.beginPath()
    ctx.arc(0, 0, size * 0.14, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  ctx.restore()

  const labelY = y + size + 6
  const big = el.type === 'settlement' || el.type === 'stronghold' || el.type === 'region'
  const labelThreshold = big ? 0.3 : el.type === 'character' ? 0.42 : 0.55
  if (selected || cam.zoom >= labelThreshold) drawLabel(el.name, x, labelY, color, selected, big)
  if (el.type === 'settlement') {
    const buffs = el.data?.buffs?.length || 0
    const meta = `${status.text}${buffs ? ` · ✦${buffs}` : ''}`
    if (selected || cam.zoom >= 0.38) drawSubLabel(meta, x, labelY + clamp(11 * cam.zoom, 11, 14) + 4, status.color)
  }
  if (el.type === 'character' && el.data?.characterId) {
    const lvl = el.data?.level
    if (lvl && (selected || cam.zoom >= 0.55)) drawSubLabel(`Lv${lvl}`, x, labelY + 24, 'rgba(148,163,184,0.9)')
  }
}

function drawSubLabel(text, x, y, color) {
  const fs = clamp(9 * cam.zoom, 8, 10)
  ctx.save()
  ctx.font = `500 ${fs}px monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.globalAlpha = 0.9
  ctx.fillText(text, x, y)
  ctx.restore()
}

function drawMinimap() {
  const pad = 12
  const mw = 168
  const mh = 112
  const mx = W - mw - pad
  const my = H - mh - pad
  const b = boundsOf(props.elements)
  const worldW = Math.max(400, b.maxX - b.minX)
  const worldH = Math.max(300, b.maxY - b.minY)
  const scale = Math.min((mw - 16) / worldW, (mh - 16) / worldH)
  const offsetX = mx + 8 + (mw - 16 - worldW * scale) / 2
  const offsetY = my + 8 + (mh - 16 - worldH * scale) / 2
  const mapX = (x) => offsetX + (x - b.minX) * scale
  const mapY = (y) => offsetY + (y - b.minY) * scale

  ctx.save()
  roundRect(mx, my, mw, mh, 8)
  ctx.fillStyle = 'rgba(3,8,18,0.82)'
  ctx.fill()
  ctx.strokeStyle = 'rgba(148,163,184,0.25)'
  ctx.lineWidth = 1
  ctx.stroke()

  for (const el of props.elements) {
    if (!visibleSet.value.has(el.type)) continue
    const color = el.type === 'settlement' ? statusOf(el).color : el.color || '#94a3b8'
    const px = mapX(Number(el.x) || 0)
    const py = mapY(Number(el.y) || 0)
    if (el.type === 'settlement' || el.type === 'region') {
      ctx.beginPath()
      ctx.arc(px, py, Math.max(1.5, (Number(el.radius) || 0) * scale), 0, Math.PI * 2)
      ctx.fillStyle = hexToRgba(color, 0.18)
      ctx.fill()
      ctx.strokeStyle = hexToRgba(color, 0.5)
      ctx.lineWidth = 0.8
      ctx.stroke()
    } else if (el.type === 'river' || el.type === 'road') {
      const pts = absPoints(el)
      if (pts.length < 2) continue
      ctx.beginPath()
      pts.forEach((p, i) => (i ? ctx.lineTo(mapX(p.x), mapY(p.y)) : ctx.moveTo(mapX(p.x), mapY(p.y))))
      ctx.strokeStyle = hexToRgba(color, 0.8)
      ctx.lineWidth = el.type === 'river' ? 1.6 : 0.6
      ctx.stroke()
    } else {
      ctx.beginPath()
      ctx.arc(px, py, el.type === 'character' ? 2 : 1.4, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
    }
  }

  const vx = mapX(cam.x - W / 2 / cam.zoom)
  const vy = mapY(cam.y - H / 2 / cam.zoom)
  const vw = (W / cam.zoom) * scale
  const vh = (H / cam.zoom) * scale
  ctx.strokeStyle = 'rgba(103,232,249,0.95)'
  ctx.lineWidth = 1.2
  ctx.strokeRect(vx, vy, vw, vh)
  ctx.fillStyle = 'rgba(103,232,249,0.07)'
  ctx.fillRect(vx, vy, vw, vh)

  ctx.fillStyle = 'rgba(148,163,184,0.75)'
  ctx.font = '9px monospace'
  ctx.textAlign = 'left'
  ctx.fillText('MAP', mx + 8, my + 14)
  ctx.restore()
  return { mx, my, mw, mh, mapX, mapY, scale }
}

function drawDrawing() {
  if (!props.drawMode || !drawing.value.length) return
  const pts = drawing.value.map((p) => ({ x: sx(p.x), y: sy(p.y) }))
  const color = WORLD_TYPES[props.drawMode]?.color || '#67e8f9'
  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 2
  ctx.setLineDash([6, 4])
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  ctx.stroke()
  ctx.setLineDash([])
  for (const p of pts) {
    ctx.beginPath()
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#0b1220'
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 1.5
    ctx.stroke()
  }
  const last = pts[pts.length - 1]
  ctx.beginPath()
  ctx.moveTo(last.x, last.y)
  ctx.lineTo(pointer.x, pointer.y)
  ctx.strokeStyle = hexToRgba(color, 0.45)
  ctx.setLineDash([3, 4])
  ctx.stroke()
  ctx.restore()
}

function render() {
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#060b15')
  bg.addColorStop(0.55, '#07101c')
  bg.addColorStop(1, '#04070d')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, W, H)
  drawGrid()
  for (const type of DRAW_ORDER) {
    for (const el of props.elements) if (el.type === type) drawElement(el)
  }
  // 其他未知类型兜底
  for (const el of props.elements) if (!DRAW_ORDER.includes(el.type)) drawElement(el)
  drawDrawing()
  drawMinimap()

  if (!props.elements.length) {
    ctx.fillStyle = 'rgba(148,163,184,0.55)'
    ctx.font = '13px "PingFang SC","Microsoft YaHei",sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('世界还是空的。用上方「添加」放下第一个元素，或从左侧开始选择。', W / 2, H / 2)
  }
}

function loop() {
  render()
  raf = requestAnimationFrame(loop)
}

/* ---------------- 交互 ---------------- */

function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  if (dx === 0 && dy === 0) return Math.hypot(px - a.x, py - a.y)
  const t = clamp(((px - a.x) * dx + (py - a.y) * dy) / (dx * dx + dy * dy), 0, 1)
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

function hitTest(px, py) {
  let best = null
  let bestDist = Infinity
  const order = [...DRAW_ORDER].reverse()
  for (const type of order) {
    for (const el of props.elements) {
      if (el.type !== type || !visibleSet.value.has(el.type)) continue
      const pos = elementPos(el)
      if (isPathType(el.type)) {
        const pts = absPoints(el, pos).map((p) => ({ x: sx(p.x), y: sy(p.y) }))
        for (let i = 1; i < pts.length; i++) {
          const d = distanceToSegment(px, py, pts[i - 1], pts[i])
          if (d < Math.max(10, (Number(el.data?.width) || 10) * cam.zoom * 0.6 + 6) && d < bestDist) {
            best = el
            bestDist = d
          }
        }
        continue
      }
      const ex = sx(pos.x)
      const ey = sy(pos.y)
      const d = Math.hypot(px - ex, py - ey)
      const size = clamp(19 * cam.zoom, 11, 42)
      if (d < size * 0.85 + 6 && d < bestDist) {
        best = el
        bestDist = d
      }
    }
  }
  if (best) return best
  // 区域兜底：点击空白区域时选中面积最小的区域/聚落
  const areas = props.elements
    .filter((el) => (el.type === 'region' || el.type === 'settlement') && visibleSet.value.has(el.type))
    .filter((el) => Math.hypot(px - sx(el.x), py - sy(el.y)) < (Number(el.radius) || 0) * cam.zoom)
    .sort((a, b) => (Number(a.radius) || 0) - (Number(b.radius) || 0))
  return areas[0] || null
}

function localPoint(e) {
  const rect = canvasRef.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function insideMinimap(px, py) {
  const mw = 168
  const mh = 112
  const mx = W - mw - 12
  const my = H - mh - 12
  return px >= mx && px <= mx + mw && py >= my && py <= my + mh
}

function jumpMinimap(px, py) {
  const b = boundsOf(props.elements)
  const worldW = Math.max(400, b.maxX - b.minX)
  const worldH = Math.max(300, b.maxY - b.minY)
  const mw = 168
  const mh = 112
  const scale = Math.min((mw - 16) / worldW, (mh - 16) / worldH)
  const offsetX = W - mw - 12 + 8 + (mw - 16 - worldW * scale) / 2
  const offsetY = H - mh - 12 + 8 + (mh - 16 - worldH * scale) / 2
  cam.x = b.minX + (px - offsetX) / scale
  cam.y = b.minY + (py - offsetY) / scale
}

function onPointerDown(e) {
  const p = localPoint(e)
  pointer = { ...p, inside: true }
  if (insideMinimap(p.x, p.y)) {
    minimapDrag = true
    jumpMinimap(p.x, p.y)
    try { canvasRef.value.setPointerCapture(e.pointerId) } catch {}
    return
  }
  if (e.button === 2 || e.button === 1) {
    drag = { mode: 'pan', startX: p.x, startY: p.y, camX: cam.x, camY: cam.y, moved: false }
    try { canvasRef.value.setPointerCapture(e.pointerId) } catch {}
    return
  }
  if (e.button !== 0) return
  if (props.drawMode) {
    const wp = { x: snapVal(wx(p.x)), y: snapVal(wy(p.y)) }
    drawing.value.push(wp)
    try { canvasRef.value.setPointerCapture(e.pointerId) } catch {}
    return
  }
  const hit = hitTest(p.x, p.y)
  if (hit) {
    emit('select', hit.id)
    drag = {
      mode: 'element',
      id: hit.id,
      startX: p.x,
      startY: p.y,
      elX: Number(hit.x) || 0,
      elY: Number(hit.y) || 0,
      preview: null,
      moved: false
    }
  } else {
    drag = { mode: 'pan', startX: p.x, startY: p.y, camX: cam.x, camY: cam.y, moved: false, empty: true }
    emit('select', null)
  }
  try { canvasRef.value.setPointerCapture(e.pointerId) } catch {}
}

function onPointerMove(e) {
  const p = localPoint(e)
  pointer = { ...p, inside: true }
  coords.value = { x: cam.x + (p.x - W / 2) / cam.zoom, y: cam.y + (p.y - H / 2) / cam.zoom }
  if (minimapDrag) {
    jumpMinimap(p.x, p.y)
    return
  }
  if (drag?.mode === 'pan') {
    const dx = (p.x - drag.startX) / cam.zoom
    const dy = (p.y - drag.startY) / cam.zoom
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true
    cam.x = drag.camX - dx
    cam.y = drag.camY - dy
    return
  }
  if (drag?.mode === 'element') {
    const dx = (p.x - drag.startX) / cam.zoom
    const dy = (p.y - drag.startY) / cam.zoom
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) drag.moved = true
    drag.preview = { x: snapVal(drag.elX + dx), y: snapVal(drag.elY + dy) }
    coords.value = drag.preview
    return
  }
  const hit = props.drawMode ? null : hitTest(p.x, p.y)
  if (hit) {
    hover.value = { id: hit.id, name: hit.name, type: hit.type, x: Math.round(hit.x), y: Math.round(hit.y), px: p.x, py: p.y }
    canvasRef.value.style.cursor = props.drawMode ? 'crosshair' : 'pointer'
  } else {
    hover.value = null
    canvasRef.value.style.cursor = props.drawMode ? 'crosshair' : drag ? 'grabbing' : 'grab'
  }
}

function onPointerUp(e) {
  const p = localPoint(e)
  if (minimapDrag) {
    minimapDrag = false
    try { canvasRef.value.releasePointerCapture?.(e.pointerId) } catch {}
    return
  }
  if (props.drawMode) {
    try { canvasRef.value.releasePointerCapture?.(e.pointerId) } catch {}
    return
  }
  if (drag?.mode === 'element' && drag.moved && drag.preview) {
    emit('move', { id: drag.id, x: drag.preview.x, y: drag.preview.y })
  }
  drag = null
  try { canvasRef.value.releasePointerCapture?.(e.pointerId) } catch {}
}

function onWheel(e) {
  e.preventDefault()
  const p = localPoint(e)
  zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, p)
}

function finishPath() {
  if (!props.drawMode) return
  let pts = drawing.value.slice()
  if (pts.length >= 2) {
    const a = pts[pts.length - 1]
    const b = pts[pts.length - 2]
    if (Math.hypot(a.x - b.x, a.y - b.y) < 8) pts = pts.slice(0, -1)
  }
  if (pts.length < 2) return
  emit('path-complete', { type: props.drawMode, points: pts })
  drawing.value = []
}

function cancelPath() {
  drawing.value = []
  emit('path-cancel')
}

function onDoubleClick() {
  if (props.drawMode) finishPath()
}

function onKey(e) {
  if (!props.drawMode) return
  if (e.key === 'Escape') cancelPath()
  if (e.key === 'Enter') finishPath()
}

watch(() => props.drawMode, (v) => {
  drawing.value = []
  if (canvasRef.value) canvasRef.value.style.cursor = v ? 'crosshair' : 'grab'
})
watch(() => props.elements.length, () => {
  if (!didFit && props.elements.length) fit()
}, { immediate: true })

onMounted(() => {
  ctx = canvasRef.value.getContext('2d')
  resize()
  const canvas = canvasRef.value
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('dblclick', onDoubleClick)
  canvas.addEventListener('contextmenu', (e) => e.preventDefault())
  window.addEventListener('keydown', onKey)
  const ro = new ResizeObserver(() => resize())
  ro.observe(wrapRef.value)
  resizeObserver = ro
  loop()
  nextTick(() => {
    if (props.elements.length) fit()
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  if (resizeObserver) resizeObserver.disconnect()
  window.removeEventListener('keydown', onKey)
})

defineExpose({ fit, focusOn, getCenter, zoomBy, overview })
</script>

<template>
  <div ref="wrapRef" class="world-canvas-wrap">
    <canvas ref="canvasRef"></canvas>
    <div v-if="drawMode" class="wc-drawbar">
      <span class="wc-dot"></span>
      正在绘制{{ drawModeLabel }}：点击加点，双击 / Enter 完成，Esc 取消
      <span class="badge">{{ drawing.length }} 点</span>
    </div>
    <div class="wc-coords mono">x {{ Math.round(coords.x) }} · y {{ Math.round(coords.y) }} · {{ Math.round(zoomRef * 100) }}%</div>
    <div class="wc-zoom">
      <button title="放大" @click.stop="zoomBy(1.25)">＋</button>
      <button title="缩小" @click.stop="zoomBy(1 / 1.25)">－</button>
      <button title="适应全部" @click.stop="fit()">⤢</button>
    </div>
    <div v-if="hover" class="wc-tooltip" :style="{ left: hover.px + 14 + 'px', top: hover.py + 12 + 'px' }">
      <div class="wc-tt-name">{{ hover.name }}</div>
      <div class="wc-tt-meta">{{ WORLD_TYPES[hover.type]?.label || hover.type }} · ({{ hover.x }}, {{ hover.y }})</div>
      <div v-if="viewerName" class="wc-tt-meta">当前视角：{{ viewerName }}</div>
    </div>
  </div>
</template>

<style scoped>
.world-canvas-wrap { position: relative; width: 100%; height: 100%; overflow: hidden; background: #060b15; cursor: grab; }
canvas { display: block; touch-action: none; }
.wc-drawbar { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 8px; padding: 7px 12px; border-radius: 999px; border: 1px solid rgba(103, 232, 249, 0.35); background: rgba(3, 8, 18, 0.88); font-size: 11.5px; color: #cffafe; box-shadow: 0 8px 24px rgba(2, 6, 23, 0.5); z-index: 3; pointer-events: none; white-space: nowrap; }
.wc-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); box-shadow: 0 0 8px var(--cyan); }
.wc-coords { position: absolute; left: 12px; bottom: 10px; font-size: 10.5px; color: rgba(148, 163, 184, 0.75); background: rgba(3, 8, 18, 0.6); border: 1px solid var(--line); border-radius: 6px; padding: 4px 7px; pointer-events: none; z-index: 2; }
.wc-zoom { position: absolute; right: 194px; bottom: 12px; display: flex; flex-direction: column; gap: 4px; z-index: 3; }
.wc-zoom button { width: 28px; height: 28px; border-radius: 7px; border: 1px solid var(--line-strong); background: rgba(3, 8, 18, 0.8); color: var(--muted); cursor: pointer; font-size: 13px; line-height: 1; }
.wc-zoom button:hover { color: #e6fbff; border-color: rgba(103, 232, 249, 0.5); }
.wc-tooltip { position: absolute; z-index: 4; pointer-events: none; padding: 7px 9px; border-radius: 7px; border: 1px solid rgba(103, 232, 249, 0.3); background: rgba(3, 8, 18, 0.94); box-shadow: 0 8px 24px rgba(2, 6, 23, 0.6); max-width: 220px; }
.wc-tt-name { font-size: 12px; color: #e6fbff; font-weight: 600; }
.wc-tt-meta { font-size: 10.5px; color: var(--dim); margin-top: 2px; }
</style>


