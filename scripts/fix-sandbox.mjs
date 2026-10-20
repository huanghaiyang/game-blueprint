/** 沙箱修复：跳过 Vite 的 Windows `net use` 探测（会 spawn 子进程，受限环境 EPERM）。 */
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CHUNK_DIR = path.join(ROOT, 'node_modules', 'vite', 'dist', 'node', 'chunks')

let files = []
try {
  files = (await readdir(CHUNK_DIR)).filter((f) => f.endsWith('.js'))
} catch {
  console.error('未找到 vite 安装，请先 npm install')
  process.exit(1)
}

let patched = 0
for (const name of files) {
  const file = path.join(CHUNK_DIR, name)
  const src = await readFile(file, 'utf8')
  if (!src.includes('exec("net use"') || src.includes('void 0 && exec("net use"')) continue
  const out = src.replace('exec("net use"', 'void 0 && exec("net use"')
  await writeFile(file, out, 'utf8')
  patched++
  console.log(`patched ${name}`)
}
console.log(patched ? `完成：${patched} 个文件` : '无需修复（可能已打过补丁或 Vite 版本不同）')
