import { init, resetDemo } from './store.js'

await init()
const record = await resetDemo()
console.log(`已恢复演示企划：${record.project.name}（revision ${record.revision}）`)
