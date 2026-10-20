#!/usr/bin/env node
/**
 * Game Story Studio · MCP stdio 服务（零第三方依赖）。
 * 通过本地 REST API 操作企划、世界地图、聚落、NPC 对话与任务。
 *
 * 环境变量：
 *   GAME_STORY_API=http://127.0.0.1:3087  （默认）
 */
import readline from 'node:readline'
import { TOOLS, runTool } from './tools.mjs'

const VERSION = '1.0.0'
const log = (...args) => process.stderr.write(`[game-story-mcp] ${args.join(' ')}\n`)

let chain = Promise.resolve()
function enqueue(fn) {
  const next = chain.then(fn)
  chain = next.catch(() => {})
  return next
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`)
}

function sendResult(id, result) {
  send({ jsonrpc: '2.0', id, result })
}

function sendError(id, code, message, data = undefined) {
  const error = { code, message }
  if (data !== undefined) error.data = data
  send({ jsonrpc: '2.0', id, error })
}

async function toolCall(id, params) {
  const name = params?.name
  const args = params?.arguments || {}
  if (!name) {
    sendError(id, -32602, '缺少工具名')
    return
  }
  await enqueue(async () => {
    try {
      const result = await runTool(name, args)
      sendResult(id, {
        content: [{ type: 'text', text: result.text }],
        structuredContent: result.structured,
        isError: false
      })
    } catch (err) {
      log(`tool ${name} failed:`, err?.message || err)
      sendResult(id, {
        content: [{ type: 'text', text: err?.message || String(err) }],
        isError: true
      })
    }
  })
}

async function handleMessage(msg) {
  if (msg === null || typeof msg !== 'object' || Array.isArray(msg)) {
    sendError(null, -32600, '无效的 JSON-RPC 消息')
    return
  }
  const { id, method, params } = msg
  const isNotification = id === undefined || id === null

  if (method === 'initialize') {
    const requested = params?.protocolVersion
    const protocolVersion = typeof requested === 'string' && requested ? requested : '2024-11-05'
    sendResult(id, {
      protocolVersion,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'game-story-mcp', version: VERSION },
      instructions:
        '操作本地 Game Story Studio。先用 api_status 确认服务可达，project_list 找 projectId，world_get 读地图。写操作会立即保存并递增 revision；运行中的应用若持有旧 revision 会自动提示冲突。'
    })
    return
  }

  if (method === 'notifications/initialized' || method === 'initialized') return
  if (method === 'ping') {
    if (!isNotification) sendResult(id, {})
    return
  }
  if (method === 'tools/list') {
    sendResult(id, { tools: TOOLS })
    return
  }
  if (method === 'tools/call') {
    await toolCall(id, params)
    return
  }
  if (method === 'logging/setLevel') {
    if (!isNotification) sendResult(id, {})
    return
  }
  if (method === 'shutdown') {
    if (!isNotification) sendResult(id, null)
    setTimeout(() => process.exit(0), 10)
    return
  }

  if (!isNotification) sendError(id, -32601, `不支持的方法：${method || '(missing)'}`)
}

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })
rl.on('line', (line) => {
  const text = line.trim()
  if (!text) return
  let msg
  try {
    msg = JSON.parse(text)
  } catch (err) {
    sendError(null, -32700, `JSON 解析失败：${err.message}`)
    return
  }
  handleMessage(msg).catch((err) => {
    log('unhandled:', err?.stack || err)
    if (msg?.id !== undefined && msg?.id !== null) sendError(msg.id, -32603, err?.message || '内部错误')
  })
})
rl.on('close', async () => {
  // stdin 关闭后仍等待已排队的写操作完成，避免最后一条 tools/call 被截断。
  try {
    await chain
  } finally {
    process.exit(0)
  }
})

process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))
log(`v${VERSION} ready · API=${process.env.GAME_STORY_API || 'http://127.0.0.1:3087'}`)
