/** 历史版本/对比/回退与 .gstory 导出 UI 验收（临时企划，结束后删除）。 */
import { writeFile } from 'node:fs/promises'

const CDP = 'http://127.0.0.1:9333'
const APP = 'http://127.0.0.1:3087'
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
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
  return r.result?.value
}
const errors = () => events.filter((e) => e.method === 'Runtime.exceptionThrown' || (e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error') || (e.method === 'Log.entryAdded' && e.params.entry.level === 'error')).map((e) => e.params?.exceptionDetails?.exception?.description || e.params?.entry?.text).filter(Boolean)
const json = async (method, path, body) => {
  const r = await fetch(APP + '/api' + path, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined })
  const t = await r.text()
  let d
  try { d = JSON.parse(t) } catch { d = t }
  if (!r.ok) throw new Error(`${path} ${r.status} ${t.slice(0, 200)}`)
  return d
}

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Page.bringToFront')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

const created = await json('POST', '/projects', { name: 'QA 历史 UI 初始', template: 'blank' })
const qaId = created.project.id
const p1 = created.project
p1.name = 'QA 历史 UI 第二版'
p1.meta.genre = '历史测试'
p1.meta.modules.inference = true
p1.world.elements.push({ id: 'w-qa', type: 'building', name: '历史测试建筑', x: 10, y: 20, color: '#67e8f9', data: { function: '测试' } })
await json('PUT', `/projects/${qaId}`, { project: p1, baseRevision: 1 })
const p2 = structuredClone(p1)
p2.characters[0].base.atk = Number(p2.characters[0].base.atk || 0) + 10
await json('PUT', `/projects/${qaId}`, { project: p2, baseRevision: 2 })

await ev(`localStorage.setItem('gss.activeProject', ${JSON.stringify(qaId)}); location.reload()`)
await sleep(3000)
await send('Page.bringToFront')
await send('Emulation.setFocusEmulationEnabled', { enabled: true })
await ev(`location.hash = '#/history'`)
await sleep(1600)
const report = {}
report.history = await ev(`({
  versionRows: document.querySelectorAll('.version-row').length,
  summaryCards: [...document.querySelectorAll('.summary-card')].map(e => e.innerText.replace(/\\n/g,' ')),
  changedModules: [...document.querySelectorAll('.module-card.changed .module-title')].map(e => e.textContent),
  impactNotes: document.querySelectorAll('.impact-note').length,
  restoreDisabled: [...document.querySelectorAll('.compare-actions button')].find(b => b.textContent.includes('回退到 B'))?.disabled
})`)
let shot = await send('Page.captureScreenshot', { format: 'png' })
await writeFile('artifacts/qa-history.png', Buffer.from(shot.data, 'base64'))

// 创建检查点
await ev(`(() => { const i = document.querySelector('.head-actions input'); i.value = 'UI 检查点'; i.dispatchEvent(new Event('input',{bubbles:true})); })()`)
await ev(`[...document.querySelectorAll('.head-actions button')].find(b => b.textContent.includes('创建检查点')).click()`)
await sleep(1200)
report.checkpoint = await ev(`({ rows: document.querySelectorAll('.version-row').length, hasManual: [...document.querySelectorAll('.version-row')].some(e => e.textContent.includes('UI 检查点')) })`)

// 目标切到 r1 并回退
await ev(`document.querySelector('[data-version-id="v-000001"]')?.click()`)
await sleep(800)
report.beforeRestore = await ev(`({ target: document.querySelectorAll('.compare-selects select')[1]?.selectedOptions?.[0]?.textContent, disabled: [...document.querySelectorAll('.compare-actions button')].find(b => b.textContent.includes('回退到 B'))?.disabled })`)
await ev(`window.confirm = () => true`)
await ev(`[...document.querySelectorAll('.compare-actions button')].find(b => b.textContent.includes('回退到 B'))?.click()`)
await sleep(2200)
report.afterRestore = await ev(`({ project: document.querySelector('.project-name')?.textContent, versions: document.querySelectorAll('.version-row').length, hasRestore: [...document.querySelectorAll('.version-row')].some(e => e.textContent.includes('回退到')) })`)

// 导出页
await ev(`location.hash = '#/transfer'`)
await sleep(1400)
await ev(`[...document.querySelectorAll('.head-actions button')].find(b => b.textContent.includes('导出当前企划'))?.click()`)
await sleep(1500)
report.transfer = await ev(`({
  title: document.querySelector('.page-title')?.textContent,
  exportNotice: document.querySelector('.export-card .notice')?.innerText,
  dropZone: document.querySelector('.drop-zone')?.innerText.slice(0,120)
})`)
shot = await send('Page.captureScreenshot', { format: 'png' })
await writeFile('artifacts/qa-transfer.png', Buffer.from(shot.data, 'base64'))
report.errors = errors()

await ev(`localStorage.setItem('gss.activeProject', 'proj-mist-harbor'); location.reload()`)
await sleep(2200)
await fetch(`${APP}/api/projects/${qaId}`, { method: 'DELETE' })
report.cleanup = await ev(`document.querySelector('.project-name')?.textContent`)
console.log(JSON.stringify(report, null, 2))
ws.close()
process.exit(0)
