const CDP = 'http://127.0.0.1:9333'
const APP = 'http://127.0.0.1:3087'
const route = process.argv[2] || 'narrative'
const out = process.argv[3] || `artifacts/final-${route}.png`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const targets = (await (await fetch(`${CDP}/json`)).json()).filter((t) => t.type === 'page' && t.url.startsWith(APP))
const target = targets.find((t) => t.url.includes(`#/${route}`)) || targets[0]
if (!target) throw new Error('no target')
console.log('target', target.id, target.url)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j })
let seq = 0
const pending = new Map()
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data)
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id) }
}
const send = (method, params = {}, timeout = 20000) => new Promise((resolve, reject) => {
  const id = ++seq
  const timer = setTimeout(() => reject(new Error('timeout ' + method)), timeout)
  pending.set(id, (m) => { clearTimeout(timer); m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result) })
  ws.send(JSON.stringify({ id, method, params }))
})
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false })
await sleep(2200)
if (!target.url.includes(`#/${route}`)) {
  await send('Runtime.evaluate', { expression: `location.hash = ${JSON.stringify('#/' + route)}` })
  await sleep(1800)
}
const r = await send('Page.captureScreenshot', { format: 'png' })
const { writeFile } = await import('node:fs/promises')
await writeFile(out, Buffer.from(r.data, 'base64'))
console.log('saved', out)
ws.close()
process.exit(0)
