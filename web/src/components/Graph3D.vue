<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  edges: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  startId: { type: String, default: '' },
  acts: { type: Array, default: () => [] }
})
const emit = defineEmits(['select'])

const host = ref(null)
const hover = ref(null)
const autoRotate = ref(true)
const showAllLabels = ref(true)
const TYPE_COLOR = { scene: '#7dd3fc', choice: '#fbbf24', combat: '#fb7185', ending: '#86efac', hub: '#c084fc' }
const TYPE_NAME = { scene: '场景', choice: '抉择', combat: '对抗', ending: '结局', hub: '枢纽' }

let renderer = null
let scene = null
let camera = null
let controls = null
let raf = 0
let resizeObs = null
let raycaster = null
let pointerVec = null
let nodeMeshes = []
let textures = []
let dust = null
let pointerDown = null
let rebuildTimer = 0
let lastHover = 0
let disposed = false

function actList() {
  if (props.acts && props.acts.length) return props.acts
  const seen = new Map()
  for (const n of props.nodes) {
    const id = n.act || 'none'
    if (!seen.has(id)) seen.set(id, { id, name: id === 'none' ? '未分幕' : id })
  }
  return [...seen.values()]
}

function computeLayout() {
  const acts = actList()
  const maxCount = Math.max(1, ...acts.map((a) => props.nodes.filter((n) => (n.act || 'none') === a.id).length))
  const width = Math.max(14, maxCount * 5.6)
  const tierGap = acts.length > 1 ? 10 : 0
  const positions = new Map()
  const actCenters = new Map()
  acts.forEach((act, i) => {
    const group = props.nodes.filter((n) => (n.act || 'none') === act.id)
    const y = (i - (acts.length - 1) / 2) * tierGap
    actCenters.set(act.id, { y, z: 0, radius: width / 2 })
    group.forEach((node, j) => {
      const spread = group.length <= 1 ? 0 : (j - (group.length - 1) / 2) * 5.6
      const jitterZ = Math.sin((node.id.charCodeAt(0) || 7) + j * 2.3) * 1.1
      const jitterY = Math.cos((node.id.charCodeAt(1) || 3) + j * 1.7) * 0.3
      const stagger = group.length > 2 ? (j % 2 === 0 ? 1.5 : -1.5) : 0
      const tensionLift = ((Number(node.tension) || 40) - 45) * 0.012
      positions.set(node.id, new THREE.Vector3(spread + jitterZ * 0.35, y + stagger + tensionLift + jitterY, jitterZ + (j % 2) * 0.6))
    })
  })
  return { positions, acts, actCenters }
}

function makeLabel(text, color, opts = {}) {
  const dpr = 2
  const pad = 14
  const fontSize = opts.size || 26
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = `600 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  const width = Math.ceil(ctx.measureText(text).width) + pad * 2
  const height = fontSize + pad * 2
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx.scale(dpr, dpr)
  ctx.font = `600 ${fontSize}px "PingFang SC", "Microsoft YaHei", sans-serif`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'center'
  const r = 12
  ctx.beginPath()
  ctx.moveTo(r, 1)
  ctx.arcTo(width - 1, 1, width - 1, height - 1, r)
  ctx.arcTo(width - 1, height - 1, 1, height - 1, r)
  ctx.arcTo(1, height - 1, 1, 1, r)
  ctx.arcTo(1, 1, width - 1, 1, r)
  ctx.closePath()
  ctx.fillStyle = 'rgba(3, 8, 18, 0.72)'
  ctx.fill()
  ctx.strokeStyle = color + '88'
  ctx.lineWidth = 1.5
  ctx.stroke()
  ctx.fillStyle = '#e6f6ff'
  ctx.fillText(text, width / 2, height / 2 + 1)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.minFilter = THREE.LinearFilter
  textures.push(texture)
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })
  const sprite = new THREE.Sprite(material)
  const scale = opts.scale || 0.032
  sprite.scale.set(width * scale, height * scale, 1)
  return sprite
}

function disposeObject(root) {
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose()
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material]
      for (const m of mats) {
        for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k]) m[k].dispose()
        m.dispose()
      }
    }
  })
  for (const t of textures) t.dispose()
  textures = []
}

function buildScene() {
  if (!renderer) return
  const prevCam = camera ? camera.position.clone() : null
  const prevTarget = controls ? controls.target.clone() : null

  if (scene) {
    disposeObject(scene)
    scene.clear()
  }
  scene = new THREE.Scene()
  scene.fog = new THREE.FogExp2(0x050a14, 0.011)

  scene.add(new THREE.AmbientLight(0x94a3b8, 0.85))
  const dir = new THREE.DirectionalLight(0xdbeafe, 1.15)
  dir.position.set(12, 22, 16)
  scene.add(dir)
  const p1 = new THREE.PointLight(0x67e8f9, 90, 70)
  p1.position.set(-16, 8, 14)
  scene.add(p1)
  const p2 = new THREE.PointLight(0xa78bfa, 70, 70)
  p2.position.set(14, -10, -16)
  scene.add(p2)

  const grid = new THREE.GridHelper(90, 45, 0x1e3a5f, 0x0f1c2e)
  grid.position.y = -16
  grid.material.transparent = true
  grid.material.opacity = 0.3
  scene.add(grid)

  const { positions, actCenters } = computeLayout()
  const missing = new Set()
  const geometry = new THREE.IcosahedronGeometry(0.62, 0)
  nodeMeshes = []

  for (const node of props.nodes) {
    const pos = positions.get(node.id)
    if (!pos) continue
    const color = node.color || TYPE_COLOR[node.type] || '#94a3b8'
    const fanout = props.edges.filter((e) => e.from === node.id).length
    const size = node.type === 'ending' ? 1.0 : 0.62 + Math.min(fanout, 4) * 0.11
    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.42,
      metalness: 0.3,
      roughness: 0.34,
      flatShading: true
    })
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.position.copy(pos)
    mesh.scale.setScalar(size)
    mesh.userData.node = node
    scene.add(mesh)

    // 光晕
    const haloCanvas = document.createElement('canvas')
    haloCanvas.width = 128
    haloCanvas.height = 128
    const hctx = haloCanvas.getContext('2d')
    const grad = hctx.createRadialGradient(64, 64, 2, 64, 64, 62)
    grad.addColorStop(0, color + 'cc')
    grad.addColorStop(0.35, color + '55')
    grad.addColorStop(1, color + '00')
    hctx.fillStyle = grad
    hctx.fillRect(0, 0, 128, 128)
    const tex = new THREE.CanvasTexture(haloCanvas)
    tex.colorSpace = THREE.SRGBColorSpace
    textures.push(tex)
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
    halo.position.copy(pos)
    halo.scale.setScalar(2.4 + size * 0.6)
    halo.userData.baseScale = halo.scale.x
    scene.add(halo)

    // 标签
    const label = makeLabel(node.title, color, { size: 21, scale: 0.023 })
    label.position.copy(pos).add(new THREE.Vector3(0, 0.95 + size * 0.5, 0))
    scene.add(label)

    if (node.id === props.startId) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95 + size * 0.3, 0.035, 8, 48),
        new THREE.MeshBasicMaterial({ color: 0x67e8f9, transparent: true, opacity: 0.85 })
      )
      ring.position.copy(pos)
      ring.rotation.x = Math.PI / 2.6
      ring.userData.spin = true
      scene.add(ring)
    }

    nodeMeshes.push({ mesh, halo, label, node, color, size })
  }

  const edgeGroup = new THREE.Group()
  for (const edge of props.edges) {
    const a = positions.get(edge.from)
    const b = positions.get(edge.to)
    if (!a || !b) {
      missing.add(edge.id)
      continue
    }
    const isChoice = edge.type === 'choice'
    const isCond = edge.type === 'conditional'
    const color = isCond ? 0xa78bfa : isChoice ? 0xfbbf24 : 0x94a3b8
    const mat = isCond
      ? new THREE.LineDashedMaterial({ color, transparent: true, opacity: 0.7, dashSize: 0.45, gapSize: 0.28 })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity: isChoice ? 0.5 : 0.4 })
    const geo = new THREE.BufferGeometry().setFromPoints([a, b])
    const line = new THREE.Line(geo, mat)
    if (isCond) line.computeLineDistances()
    edgeGroup.add(line)

    // 方向箭头
    const direction = new THREE.Vector3().subVectors(b, a)
    const len = direction.length()
    if (len > 1.6) {
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.26, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7 }))
      cone.position.copy(a).addScaledVector(direction, 0.82)
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize())
      edgeGroup.add(cone)
    }
  }
  scene.add(edgeGroup)

  // 分幕标签
  const acts = actList()
  acts.forEach((act) => {
    const c = actCenters.get(act.id)
    if (!c) return
    const label = makeLabel(act.name || act.id, '#7dd3fc', { size: 21, scale: 0.026 })
    label.position.set(-(c.radius - 1.2), c.y - 2.6, 0)
    scene.add(label)
  })

  // 雾尘
  const count = 380
  const pts = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    pts[i * 3] = (Math.random() - 0.5) * 58
    pts[i * 3 + 1] = (Math.random() - 0.5) * 34
    pts[i * 3 + 2] = (Math.random() - 0.5) * 46
  }
  const pg = new THREE.BufferGeometry()
  pg.setAttribute('position', new THREE.BufferAttribute(pts, 3))
  dust = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0x7dd3fc, size: 0.1, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }))
  scene.add(dust)

  if (!camera) camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400)
  camera.aspect = host.value ? host.value.clientWidth / host.value.clientHeight : 1.7
  camera.updateProjectionMatrix()

  if (!controls) {
    controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.075
    controls.minDistance = 8
    controls.maxDistance = 140
    controls.autoRotateSpeed = 0.45
    controls.target.set(0, 0, 0)
  }
  controls.autoRotate = autoRotate.value

  if (prevCam) {
    camera.position.copy(prevCam)
    if (prevTarget) controls.target.copy(prevTarget)
  } else {
    camera.position.set(0, 6, 40)
    controls.target.set(0, 0, 0)
  }
  controls.update()
  updateHighlight()

  // 尺寸
  handleResize()
}

function updateHighlight() {
  for (const item of nodeMeshes) {
    const selected = item.node.id === props.selectedId
    item.mesh.scale.setScalar(item.size * (selected ? 1.45 : 1))
    item.halo.scale.setScalar((item.halo.userData.baseScale || 2.4) * (selected ? 1.6 : 1))
    item.mesh.material.emissiveIntensity = selected ? 1.5 : 0.42
    item.mesh.material.opacity = 1
  }
  updateLabels()
}

function updateLabels() {
  for (const item of nodeMeshes) {
    const on = showAllLabels.value || item.node.id === props.selectedId || item.node.id === props.startId || item.node.type === 'ending'
    item.label.visible = on
  }
}

function handleResize() {
  if (!host.value || !renderer || !camera) return
  const w = Math.max(200, host.value.clientWidth)
  const h = Math.max(200, host.value.clientHeight)
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function resetView() {
  if (!camera || !controls) return
  camera.position.set(0, 6, 40)
  controls.target.set(0, 0, 0)
  controls.update()
}

function setAutoRotate(v) {
  autoRotate.value = v
  if (controls) controls.autoRotate = v
}

function pick(event) {
  if (!renderer || !camera) return null
  const rect = renderer.domElement.getBoundingClientRect()
  pointerVec.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1)
  raycaster.setFromCamera(pointerVec, camera)
  const hits = raycaster.intersectObjects(nodeMeshes.map((n) => n.mesh), false)
  return hits.length ? hits[0].object.userData.node : null
}

function onPointerDown(event) {
  pointerDown = { x: event.clientX, y: event.clientY, t: performance.now() }
}
function onPointerMove(event) {
  const now = performance.now()
  if (now - lastHover < 55) return
  lastHover = now
  const node = pick(event)
  if (node) {
    const rect = host.value.getBoundingClientRect()
    hover.value = {
      title: node.title,
      type: node.type,
      tension: node.tension,
      summary: node.summary,
      x: event.clientX - rect.left + 14,
      y: event.clientY - rect.top + 12
    }
    if (renderer) renderer.domElement.style.cursor = 'pointer'
  } else {
    hover.value = null
    if (renderer) renderer.domElement.style.cursor = 'grab'
  }
}
function onPointerLeave() {
  hover.value = null
}
function onPointerUp(event) {
  if (!pointerDown) return
  const dist = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y)
  const dt = performance.now() - pointerDown.t
  pointerDown = null
  if (dist > 5 || dt > 500) return
  const node = pick(event)
  if (node) emit('select', node.id)
}

function animate() {
  raf = requestAnimationFrame(animate)
  if (!renderer || !scene || !camera) return
  const t = performance.now() / 1000
  if (controls) controls.update()
  if (dust) dust.rotation.y = t * 0.012
  scene.traverse((obj) => {
    if (obj.userData && obj.userData.spin) obj.rotation.z = t * 0.6
  })
  for (const item of nodeMeshes) {
    const selected = item.node.id === props.selectedId
    if (selected) {
      const k = 1 + Math.sin(t * 3) * 0.06
      item.halo.scale.setScalar(item.halo.userData.baseScale * 1.6 * k)
    }
  }
  renderer.render(scene, camera)
}

watch(
  () => [props.nodes, props.edges, props.acts],
  () => {
    clearTimeout(rebuildTimer)
    rebuildTimer = setTimeout(() => {
      if (!disposed) buildScene()
    }, 80)
  },
  { deep: true }
)
watch(
  () => props.selectedId,
  () => updateHighlight()
)
watch(showAllLabels, () => updateLabels())
watch(autoRotate, (v) => {
  if (controls) controls.autoRotate = v
})

onMounted(() => {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setClearColor(0x000000, 0)
  host.value.appendChild(renderer.domElement)
  renderer.domElement.style.cursor = 'grab'
  raycaster = new THREE.Raycaster()
  pointerVec = new THREE.Vector2()
  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerleave', onPointerLeave)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  resizeObs = new ResizeObserver(handleResize)
  resizeObs.observe(host.value)
  buildScene()
  animate()
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf)
  clearTimeout(rebuildTimer)
  if (resizeObs) resizeObs.disconnect()
  if (controls) controls.dispose()
  if (scene) disposeObject(scene)
  if (renderer) {
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerleave', onPointerLeave)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.dispose()
    if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement)
  }
  renderer = null
  scene = null
  camera = null
})
</script>

<template>
  <div ref="host" class="graph-wrap graph-host">
    <div class="graph-hud">
      <button class="btn sm ghost" @click="setAutoRotate(!autoRotate)">{{ autoRotate ? '⏸ 停转' : '▶ 旋转' }}</button>
      <button class="btn sm ghost" @click="resetView">⌖ 重置视角</button>
      <button class="btn sm ghost" @click="showAllLabels = !showAllLabels">{{ showAllLabels ? '标签全显' : '标签聚焦' }}</button>
      <span class="badge">{{ nodes.length }} 节点 · {{ edges.length }} 连线</span>
    </div>
    <div class="graph-legend">
      <div class="legend-row"><span class="legend-dot" style="background: #7dd3fc"></span>场景</div>
      <div class="legend-row"><span class="legend-dot" style="background: #fbbf24"></span>抉择</div>
      <div class="legend-row"><span class="legend-dot" style="background: #fb7185"></span>对抗</div>
      <div class="legend-row"><span class="legend-dot" style="background: #c084fc"></span>枢纽</div>
      <div class="legend-row"><span class="legend-dot" style="background: #86efac"></span>结局</div>
    </div>
    <div v-if="hover" class="graph-tooltip" :style="{ left: hover.x + 'px', top: hover.y + 'px' }">
      <div class="tt-title">{{ hover.title }}</div>
      <div class="tt-meta">{{ TYPE_NAME[hover.type] || hover.type }} · 张力 {{ hover.tension ?? '—' }}</div>
      <div v-if="hover.summary" class="tt-summary">{{ hover.summary }}</div>
    </div>
  </div>
</template>

<style scoped>
.graph-tooltip { position: absolute; z-index: 40; max-width: 250px; padding: 8px 10px; border-radius: 8px; background: rgba(3, 8, 18, 0.92); border: 1px solid rgba(103, 232, 249, 0.3); box-shadow: 0 10px 30px rgba(2, 6, 23, 0.6); pointer-events: none; }
.tt-title { font-size: 12px; font-weight: 600; color: #e6f6ff; }
.tt-meta { font-size: 10.5px; color: #64748b; margin-top: 2px; }
.tt-summary { font-size: 11px; color: #94a3b8; margin-top: 4px; line-height: 1.5; }
</style>
