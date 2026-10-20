/**
 * 提交前敏感信息自检（无第三方依赖）。
 * 扫描仓库内文本与图片二进制，检查常见密钥、令牌、邮箱、个人绝对路径。
 * 用法：npm run check:sensitive
 */
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SKIP_DIRS = new Set(['node_modules', 'dist', 'data', 'artifacts', '.npm-cache', '.git'])
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.json', '.md', '.vue', '.css', '.html', '.yml', '.yaml', '.txt', '.svg'])
const EMAIL_ALLOW = /@(?:example\.(?:com|org|net)|users\.noreply\.github\.com|game-story\.local)$/i

const checks = [
  { name: '私钥块', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: '平台令牌', re: /\b(?:AKIA[0-9A-Z]{16}|ASIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9]{20,})\b/ },
  { name: '疑似密钥赋值', re: /(?:api[_-]?key|secret|passw(?:or)?d|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']([^"'\s]{8,})["']/i },
  { name: 'Windows 用户目录', re: /[A-Za-z]:\\Users\\[^\\\s"'<>|]+/ },
  { name: 'Unix 用户目录', re: /\/(?:home|Users)\/[A-Za-z0-9._-]+\// },
  { name: '邮箱', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ }
]

const findings = []
const files = []

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(path.join(dir, entry.name))
    } else {
      const file = path.join(dir, entry.name)
      const info = await stat(file)
      if (info.size <= 2 * 1024 * 1024) files.push(file)
    }
  }
}

await walk(ROOT)

for (const file of files) {
  const rel = path.relative(ROOT, file).replaceAll('\\', '/')
  const ext = path.extname(file).toLowerCase()
  const buf = await readFile(file)
  const isText = TEXT_EXT.has(ext) || (!buf.includes(0) && ext !== '.png')
  const content = isText ? buf.toString('utf8') : buf.toString('latin1')
  const lines = content.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    for (const check of checks) {
      const re = new RegExp(check.re.source, check.re.flags.includes('g') ? check.re.flags : `${check.re.flags}g`)
      let m
      while ((m = re.exec(lines[i]))) {
        const value = m[0]
        if (check.name === '邮箱' && EMAIL_ALLOW.test(value)) continue
        findings.push({ file: rel, line: i + 1, rule: check.name, match: value.length > 120 ? `${value.slice(0, 120)}…` : value })
        if (value.length === 0) break
      }
    }
  }
}

if (findings.length) {
  console.error(`✕ 发现 ${findings.length} 处疑似敏感信息：`)
  for (const f of findings) console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.match}`)
  process.exit(1)
}

console.log(`✓ 敏感信息自检通过（扫描 ${files.length} 个文件）`)
