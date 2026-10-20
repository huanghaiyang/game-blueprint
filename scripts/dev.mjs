/** 同时启动 API（3087）与 Vite（5173）。子进程继承 stdio，避免受限沙箱的管道限制。 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url))

const children = []
let shuttingDown = false

function run(name, args) {
  console.log(`\n▶ ${name}`)
  const child = spawn(process.execPath, args, { cwd: ROOT, stdio: 'inherit', env: process.env })
  children.push(child)
  child.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`✕ ${name} 已退出（code ${code}）`)
      shutdown(code ?? 1)
    }
  })
}

function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) {
    try {
      c.kill()
    } catch {
      /* ignore */
    }
  }
  setTimeout(() => process.exit(code), 200)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

run('api', ['server/index.js'])
run('web', [viteBin, '--config', 'web/vite.config.js', '--configLoader', 'runner'])

console.log('\n  API  → http://127.0.0.1:3087/api\n  Web  → http://localhost:5173\n  Ctrl+C 退出\n')
