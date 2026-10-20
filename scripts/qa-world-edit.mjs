/** 开放世界编辑验收：空世界、添加元素、绘制河流、聚落敌对/安全区联动。使用临时 QA 企划，结束后删除。 */
import { writeFile } from 'node:fs/promises'

const CDP = process.env.CDP || 'http://127.0.0.1:9333'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const targets = (await (await fetch(`${CDP}/json`)).json()).filter((t) => t.type === 'page')
const target = targets.find((t) => t.url.includes('3087')) || targets[0]
if (!target) throw new Error('no page')
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0
const pending = new Map()
const events = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return }
  if (m.method) events.push(m)
}
const send = (method, params = {}, timeout = 20000) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), timeout)
    pending.set(id, (m) => { clearTimeout(timer); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result) })
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
  return r.result?.value
}
const click = async (x, y, count = 1) => {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: count })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: count })
}
const errors = () => events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')).map((e) => e.message || e.params?.exceptionDetails?.exception?.description || e.params?.entry?.text).filter(Boolean)

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Page.bringToFront')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

// 创建临时 QA 企划
const created = await evaluate(`fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'QA 世界测试', template: 'blank', modules: { world: true, narrative: true, characters: true, stats: true, combat: true, branches: true, blueprint: true, inference: false } }) }).then(r => r.json())`)
const qaId = created.project.id
console.log('qa project', qaId)
await evaluate(`localStorage.setItem('gss.activeProject', ${JSON.stringify(qaId)}); location.reload()`)
await sleep(3000)
await send('Page.bringToFront')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await evaluate(`location.hash = '#/world'`)
await sleep(1600)
const report = {}
report.empty = await evaluate(`({ project: document.querySelector('.project-name')?.textContent, rows: document.querySelectorAll('.el-row').length, emptyText: document.querySelector('.world-canvas-wrap') ? 'canvas' : 'no canvas' })`)

// 添加建筑
await evaluate(`[...document.querySelectorAll('.map-tools button')].find(b => b.textContent.includes('添加元素')).click()`)
await sleep(250)
report.addMenu = await evaluate(`({ open: !!document.querySelector('.add-menu'), items: [...document.querySelectorAll('.add-item')].map(e => e.textContent.trim()) })`)
await evaluate(`[...document.querySelectorAll('.add-item')].find(b => b.textContent.includes('建筑')).click()`)
await sleep(500)
report.afterBuilding = await evaluate(`({ rows: document.querySelectorAll('.el-row').length, type: document.querySelector('.type-badge')?.textContent, name: document.querySelector('.inspector-scroll input')?.value })`)

// 画一条河
await evaluate(`[...document.querySelectorAll('.map-tools button')].find(b => b.textContent.includes('河流')).click()`)
await sleep(250)
const rect = await evaluate(`(() => { const r = document.querySelector('.world-canvas-wrap canvas').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height } })()`)
const pts = [[0.2, 0.35], [0.35, 0.5], [0.55, 0.42], [0.7, 0.6]]
for (const [fx, fy] of pts) {
  await click(Math.round(rect.x + rect.w * fx), Math.round(rect.y + rect.h * fy))
  await sleep(120)
}
await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
await sleep(700)
report.afterRiver = await evaluate(`({ rows: document.querySelectorAll('.el-row').length, riverRow: [...document.querySelectorAll('.el-row')].find(e => e.textContent.includes('河流'))?.textContent.trim(), type: document.querySelector('.type-badge')?.textContent, points: [...document.querySelectorAll('.hint')].map(e => e.textContent).find(t => t.includes('控制点')) })`)

// 添加聚落并切换敌对
await evaluate(`[...document.querySelectorAll('.map-tools button')].find(b => b.textContent.includes('添加元素')).click()`)
await sleep(200)
await evaluate(`[...document.querySelectorAll('.add-item')].find(b => b.textContent.includes('聚落')).click()`)
await sleep(500)
report.settlementBefore = await evaluate(`({ type: document.querySelector('.type-badge')?.textContent, safe: [...document.querySelectorAll('.switch-row input')].map(e => e.checked) })`)
await evaluate(`(() => { const rows = [...document.querySelectorAll('.switch-row')]; const hostile = rows.find(r => r.textContent.includes('敌对聚落')); hostile?.querySelector('input')?.click() })()`)
await sleep(1300)
report.settlementAfter = await evaluate(`({ safe: [...document.querySelectorAll('.switch-row input')].map(e => e.checked), disabled: [...document.querySelectorAll('.switch-row input')].map(e => e.disabled) })`)

// 等自动保存后从接口核对
await sleep(1100)
const saved = await evaluate(`fetch('/api/projects/${qaId}').then(r => r.json())`)
const world = saved.project.world
report.persisted = {
  elements: world.elements.length,
  types: [...new Set(world.elements.map((e) => e.type))],
  riverPoints: world.elements.find((e) => e.type === 'river')?.points?.length || 0,
  hostileSettlement: world.elements.filter((e) => e.type === 'settlement').map((e) => ({ hostile: e.data.hostile, safe: e.data.safeZone }))
}
const shot = await send('Page.captureScreenshot', { format: 'png' })
await writeFile('artifacts/qa-world-edit.png', Buffer.from(shot.data, 'base64'))
report.errors = errors()

// 清理 QA 企划并回到演示企划
await evaluate(`fetch('/api/projects/${qaId}', { method: 'DELETE' }).then(r => r.json())`)
await evaluate(`localStorage.setItem('gss.activeProject', 'proj-mist-harbor'); location.reload()`)
await sleep(2600)
report.cleanup = await evaluate(`({ project: document.querySelector('.project-name')?.textContent, nav: [...document.querySelectorAll('.nav-item')].map(e => e.textContent.trim()) })`)
console.log(JSON.stringify(report, null, 2))
ws.close()
process.exit(0)
