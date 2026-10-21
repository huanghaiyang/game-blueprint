/**
 * 用 Chrome DevTools Protocol 逐路由截图并收集运行时报错。
 * 用法：node scripts/audit.mjs [url=http://127.0.0.1:3087] [cdp=http://127.0.0.1:9333]
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const APP = process.argv[2] || 'http://127.0.0.1:3087'
const CDP = process.argv[3] || 'http://127.0.0.1:9333'
const OUT = path.join(ROOT, 'artifacts')
const ROUTES = ['dashboard', 'narrative', 'characters', 'stats', 'combat', 'branches', 'world', 'inference', 'blueprint', 'studio', 'history', 'transfer']

await mkdir(OUT, { recursive: true })

const targets = await (await fetch(`${CDP}/json`)).json()
const matches = targets.filter((t) => t.type === 'page' && t.url.startsWith(APP))
const preferred = process.env.TARGET_ID ? matches.find((t) => t.id === process.env.TARGET_ID) : null
const target = preferred || matches[matches.length - 1]
if (!target) throw new Error(`未找到 ${APP} 的页面，请先在 Chrome 打开该地址`)
console.log('[audit] target', target.id, target.url)

const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((resolve, reject) => {
  ws.onopen = resolve
  ws.onerror = reject
})

let seq = 0
const pending = new Map()
const events = []
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    if (msg.error) reject(new Error(JSON.stringify(msg.error)))
    else resolve(msg.result)
  } else if (msg.method) {
    events.push(msg)
    if (msg.method === 'Page.javascriptDialogOpening') {
      send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {})
    }
  }
}

function send(method, params = {}) {
  const id = ++seq
  ws.send(JSON.stringify({ id, method, params }))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`CDP timeout: ${method}`))
    }, 15000)
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        resolve(v)
      },
      reject: (e) => {
        clearTimeout(timer)
        reject(e)
      }
    })
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

await send('Page.enable')
await send('Runtime.enable')
await send('Log.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })

function collectErrors(fromIndex) {
  const out = []
  for (const e of events.slice(fromIndex)) {
    if (e.method === 'Runtime.exceptionThrown') {
      const d = e.params.exceptionDetails
      out.push({ kind: 'exception', text: d.exception?.description || d.text, url: d.url, line: d.lineNumber })
    } else if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
      out.push({ kind: e.params.type, text: e.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ') })
    } else if (e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level)) {
      out.push({ kind: `log-${e.params.entry.level}`, text: e.params.entry.text, url: e.params.entry.url })
    } else if (e.method === 'Network.loadingFailed' && !e.params.canceled) {
      out.push({ kind: 'network', text: `${e.params.errorText} ${e.params.type}` })
    }
  }
  return out
}

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' })
  const file = path.join(OUT, `${name}.png`)
  await writeFile(file, Buffer.from(data, 'base64'))
  return file
}

async function gotoHash(hash) {
  await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify(hash)}` })
  await sleep(1600)
}

const report = []
const start = events.length
await sleep(1200)
report.push({ route: 'load', errors: collectErrors(start), shot: await shot('00-load') })

for (let i = 0; i < ROUTES.length; i++) {
  const route = ROUTES[i]
  console.log(`[audit] ${route}`)
  const from = events.length
  await gotoHash(`#/${route}`)
  const errors = collectErrors(from)
  const file = await shot(`${String(i + 1).padStart(2, '0')}-${route}`)
  report.push({ route, errors, shot: path.relative(ROOT, file) })
}

// 交互冒烟：战斗页跑一次演算
const start2 = events.length
await gotoHash('#/combat')
await send('Runtime.evaluate', { expression: `document.querySelectorAll('button')[0]?.click()` })
await sleep(1200)
report.push({ route: 'combat-interaction', errors: collectErrors(start2), shot: path.relative(ROOT, await shot('08b-combat-click')) })

console.log(JSON.stringify(report, null, 2))
ws.close()
setTimeout(() => process.exit(0), 150)
