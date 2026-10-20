/** 多企划 & 可选推理模块的浏览器验收：新建企划、隐藏/开启推理、空态创建案件。 */
import { mkdir, writeFile } from 'node:fs/promises'

const CDP = process.env.CDP || 'http://127.0.0.1:9333'
const APP = process.env.APP || 'http://127.0.0.1:3087'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = 'artifacts'
await mkdir(OUT, { recursive: true })

const targets = (await (await fetch(`${CDP}/json`)).json()).filter((t) => t.type === 'page')
const target = targets.find((t) => t.url.startsWith(APP)) || targets[0]
if (!target) throw new Error('没有可用的页面')
console.log('target', target.id, target.url)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => {
  ws.onopen = r
  ws.onerror = j
})
let seq = 0
const pending = new Map()
const events = []
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) {
    pending.get(m.id)(m)
    pending.delete(m.id)
    return
  }
  if (m.method) events.push(m)
}
const send = (method, params = {}, timeout = 20000) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    const timer = setTimeout(() => reject(new Error(`timeout ${method}`)), timeout)
    pending.set(id, (m) => {
      clearTimeout(timer)
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
    })
    ws.send(JSON.stringify({ id, method, params }))
  })
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''))
  return r.result?.value
}
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' })
  const file = `${OUT}/${name}.png`
  await writeFile(file, Buffer.from(r.data, 'base64'))
  console.log('shot', file)
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
await sleep(1800)

const report = {}
report.initialNav = await evaluate(`[...document.querySelectorAll('.nav-item')].map(e=>e.textContent.trim())`)
await shot('qa-01-switcher')

// 打开新建企划弹窗
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='＋ 新建企划').click()`)
await sleep(350)
await shot('qa-02-new-modal')
report.modalFields = await evaluate(`({ title: document.querySelector('.modal-title')?.textContent, modules: [...document.querySelectorAll('.module-check')].map(e=>e.textContent.trim()) })`)

// 填写名称并创建空白企划
await evaluate(`(() => {
  const input = document.querySelector('.modal input.input')
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  setter.call(input, 'QA 空白企划')
  input.dispatchEvent(new Event('input', { bubbles: true }))
})()`)
await sleep(200)
await evaluate(`[...document.querySelectorAll('.modal-foot button')].find(b=>b.textContent.includes('创建并进入')).click()`)
await sleep(1800)
report.blank = await evaluate(`({ project: document.querySelector('.project-name')?.textContent, nav: [...document.querySelectorAll('.nav-item')].map(e=>e.textContent.trim()), nodes: document.querySelectorAll('.node-item').length })`)
await shot('qa-03-blank-dashboard')

// 在总览开启推理模块
report.toggled = await evaluate(`(() => {
  const label = [...document.querySelectorAll('.module-toggle')].find(e=>e.textContent.includes('推理'))
  if (!label) return 'no toggle'
  label.querySelector('input').click()
  return 'clicked'
})()`)
await sleep(700)
report.afterToggleNav = await evaluate(`[...document.querySelectorAll('.nav-item')].map(e=>e.textContent.trim())`)
await evaluate(`location.hash = '#/inference'`)
await sleep(1400)
report.inferenceEmpty = await evaluate(`({ text: document.querySelector('.content')?.innerText.slice(0, 220), hasCreate: [...document.querySelectorAll('button')].some(b=>b.textContent.includes('创建示例案件')) })`)
await shot('qa-04-inference-empty')
await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('创建示例案件'))?.click()`)
await sleep(1600)
report.inferenceCreated = await evaluate(`({ question: document.querySelector('.case-question')?.textContent, hasResult: !!document.querySelector('.verdict-name'), text: document.querySelector('.content')?.innerText.slice(0, 200) })`)
await shot('qa-05-inference-case')

// 清理 QA 企划并回到演示企划
report.cleanup = await evaluate(`(async () => {
  const r = await fetch('/api/projects').then(r=>r.json())
  const qa = r.projects.filter(p=>p.name.startsWith('QA '))
  for (const p of qa) await fetch('/api/projects/'+p.id, { method: 'DELETE' })
  localStorage.setItem('gss.activeProject', 'proj-mist-harbor')
  return qa.map(p=>p.id)
})()`)
await sleep(300)
await evaluate(`location.reload()`)
await sleep(2600)
report.afterCleanup = await evaluate(`({ project: document.querySelector('.project-name')?.textContent, nav: [...document.querySelectorAll('.nav-item')].map(e=>e.textContent.trim()) })`)
report.errors = errors()
console.log(JSON.stringify(report, null, 2))
ws.close()
process.exit(0)
