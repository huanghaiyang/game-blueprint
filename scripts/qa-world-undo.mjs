/** 开放世界撤销/重做验收：添加、重命名、键盘快捷键。使用临时 QA 企划，结束后删除。 */
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
const key = async (k, code, modifiers = 0) => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: k, code, modifiers, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, modifiers, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) })
}
const errors = () => events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')).map((e) => e.params?.exceptionDetails?.exception?.description || e.params?.entry?.text).filter(Boolean)

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Page.bringToFront')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

await send('Page.navigate', { url: 'http://127.0.0.1:3087/' })
await sleep(1800)
const created = await (await fetch('http://127.0.0.1:3087/api/projects', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'QA 撤销测试', template: 'blank', modules: { world: true, narrative: true, characters: true, stats: true, combat: true, branches: true, blueprint: true, inference: false } })
})).json()
const qaId = created.project.id
await evaluate(`localStorage.setItem('gss.activeProject', ${JSON.stringify(qaId)}); location.reload()`)
await sleep(3000)
await send('Page.bringToFront')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await evaluate(`location.hash = '#/world'`)
await sleep(1500)
const report = {}

// 添加建筑
await evaluate(`[...document.querySelectorAll('.map-tools button')].find(b => b.textContent.includes('添加元素')).click()`)
await sleep(200)
await evaluate(`[...document.querySelectorAll('.add-item')].find(b => b.textContent.includes('建筑')).click()`)
await sleep(700)
report.afterAdd = await evaluate(`({ rows: document.querySelectorAll('.el-row').length, undoDisabled: document.querySelector('[aria-label="撤销"]')?.disabled, name: document.querySelector('.inspector-scroll input')?.value })`)

// 撤销 / 重做添加
await evaluate(`document.querySelector('[aria-label="撤销"]').click()`)
await sleep(500)
report.afterUndoAdd = await evaluate(`({ rows: document.querySelectorAll('.el-row').length, redoDisabled: document.querySelector('[aria-label="重做"]')?.disabled })`)
await evaluate(`document.querySelector('[aria-label="重做"]').click()`)
await sleep(500)
report.afterRedoAdd = await evaluate(`({ rows: document.querySelectorAll('.el-row').length, undoDisabled: document.querySelector('[aria-label="撤销"]')?.disabled })`)

// 选中并重命名
await evaluate(`document.querySelector('.el-row')?.click()`)
await sleep(350)
const originalName = await evaluate(`document.querySelector('.inspector-scroll input')?.value`)
await evaluate(`(() => {
  const input = [...document.querySelectorAll('.inspector-scroll input')].find(i => i.type !== 'number' && i.type !== 'color')
  if (!input) return 'no input'
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, '重命名测试')
  input.dispatchEvent(new Event('input', { bubbles: true }))
  return input.value
})()`)
await sleep(750)
report.afterRename = await evaluate(`({ name: document.querySelector('.inspector-scroll input')?.value, row: document.querySelector('.el-row')?.textContent.trim().slice(0, 60) })`)

// 按钮撤销重命名
await evaluate(`document.querySelector('[aria-label="撤销"]').click()`)
await sleep(500)
report.afterUndoRename = await evaluate(`document.querySelector('.inspector-scroll input')?.value`)
await evaluate(`document.querySelector('[aria-label="重做"]').click()`)
await sleep(500)
report.afterRedoRename = await evaluate(`document.querySelector('.inspector-scroll input')?.value`)

// 键盘 Ctrl+Z / Ctrl+Y
await evaluate(`document.querySelector('.world-canvas-wrap canvas')?.focus()`)
await key('z', 'KeyZ', 2)
await sleep(500)
report.afterKeyboardUndo = await evaluate(`document.querySelector('.inspector-scroll input')?.value`)
await key('y', 'KeyY', 2)
await sleep(500)
report.afterKeyboardRedo = await evaluate(`document.querySelector('.inspector-scroll input')?.value`)

// 删除 → 撤销恢复
await evaluate(`window.confirm = () => true`)
await evaluate(`[...document.querySelectorAll('.inspector-scroll button')].find(b => b.textContent.includes('从地图删除'))?.click()`)
await sleep(650)
report.afterDelete = await evaluate(`document.querySelectorAll('.el-row').length`)
await evaluate(`document.querySelector('[aria-label="撤销"]').click()`)
await sleep(500)
report.afterUndoDelete = await evaluate(`({ rows: document.querySelectorAll('.el-row').length, name: document.querySelector('.inspector-scroll input')?.value })`)
await evaluate(`document.querySelector('[aria-label="重做"]').click()`)
await sleep(500)
report.afterRedoDelete = await evaluate(`document.querySelectorAll('.el-row').length`)
report.originalName = originalName
report.errors = errors()

const shot = await send('Page.captureScreenshot', { format: 'png' })
await writeFile('artifacts/qa-world-undo.png', Buffer.from(shot.data, 'base64'))

await evaluate(`localStorage.setItem('gss.activeProject', 'proj-mist-harbor'); location.reload()`)
await sleep(2600)
await fetch(`http://127.0.0.1:3087/api/projects/${qaId}`, { method: 'DELETE' })
report.cleanupProject = await evaluate(`document.querySelector('.project-name')?.textContent`)
console.log(JSON.stringify(report, null, 2))
ws.close()
process.exit(0)
