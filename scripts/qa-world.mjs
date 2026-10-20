/** 开放世界 UI 验收：地图渲染、NPC 对话页、聚落状态、全览，与运行时错误收集。 */
import { writeFile } from 'node:fs/promises'

const CDP = process.env.CDP || 'http://127.0.0.1:9333'
const APP = process.env.APP || 'http://127.0.0.1:3087'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const targets = (await (await fetch(`${CDP}/json`)).json()).filter((t) => t.type === 'page')
const target = targets.find((t) => t.url.includes('3087')) || targets[0]
if (!target) throw new Error('没有可用页面')
console.log('target', target.id, target.url)
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
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  await writeFile(`artifacts/${name}.png`, Buffer.from(r.data, 'base64'))
  console.log('shot', name)
}
const errors = () =>
  events
    .filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error'))
    .map((e) => (e.method === 'Runtime.exceptionThrown' ? e.params.exceptionDetails.exception?.description : e.params.entry?.text || e.params.args?.map((a) => a.value ?? a.description).join(' ')))
    .filter(Boolean)

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await send('Page.reload', { ignoreCache: true })
await sleep(3200)
await evaluate(`location.hash = '#/world'`)
await sleep(1800)
const report = {}
report.world = await evaluate(`({
  title: document.querySelector('.card-title')?.textContent,
  listCount: document.querySelectorAll('.el-row').length,
  hasCanvas: !!document.querySelector('.world-canvas-wrap canvas'),
  summary: document.querySelector('.side')?.innerText.slice(0, 260)
})`)
await shot('qa-world-01')

// 选中白鹭 → 对话与任务
report.pickNpc = await evaluate(`(() => {
  const row = [...document.querySelectorAll('.el-row')].find(e => e.textContent.includes('白鹭'))
  if (!row) return 'not found'
  row.click()
  return 'clicked'
})()`)
await sleep(500)
report.dialogueTab = await evaluate(`(() => {
  const tab = [...document.querySelectorAll('.tab')].find(e => e.textContent.includes('对话与任务'))
  if (!tab) return 'no tab'
  tab.click()
  return 'clicked'
})()`)
await sleep(600)
await evaluate(`(() => {
  const items = [...document.querySelectorAll('.dlg-item')]
  if (items[1]) items[1].click()
})()`)
await sleep(400)
report.dialogue = await evaluate(`({
  available: [...document.querySelectorAll('.preview-dlg')].map(e => e.innerText.slice(0, 180)),
  audience: [...document.querySelectorAll('.audience .check')].map(e => e.textContent.trim()),
  hasQuestEditor: !!document.querySelector('.quest-box'),
  questTitle: document.querySelector('.quest-box input')?.value,
  sideTasks: [...document.querySelectorAll('.quest-row')].map(e => e.textContent.trim())
})`)
await shot('qa-world-02-dialogue')

// 选中钟楼集 → 聚落状态
report.pickSettlement = await evaluate(`(() => {
  const row = document.querySelector('[data-element-id="w-set-clock"]')
  if (!row) return 'not found'
  row.click()
  return 'clicked'
})()`)
await sleep(500)
report.settlement = await evaluate(`({
  type: document.querySelector('.type-badge')?.textContent,
  status: document.querySelector('.chip.green,.chip.rose,.chip.amber')?.textContent,
  buffs: [...document.querySelectorAll('.buff-row input')].map(e => e.value),
  safeChecked: [...document.querySelectorAll('.switch-row input')].map(e => e.checked),
  text: document.querySelector('.inspector-scroll')?.innerText.slice(0, 260)
})`)
await shot('qa-world-03-settlement')

// 全览
report.overview = await evaluate(`(() => {
  const btn = [...document.querySelectorAll('.map-tools button')].find(e => e.textContent.includes('全览'))
  if (!btn) return 'not found'
  btn.click()
  return 'clicked'
})()`)
await sleep(600)
await shot('qa-world-04-overview')
report.errors = errors()
console.log(JSON.stringify(report, null, 2))
ws.close()
process.exit(0)
