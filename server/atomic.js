/** Windows 下偶发 EPERM/EBUSY 的原子写入：重试 rename，最终回退直接写。 */
import { writeFile, rename, rm } from 'node:fs/promises'

const RETRYABLE = new Set(['EPERM', 'EACCES', 'EBUSY'])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, data, 'utf8')
  for (let i = 0; i < 8; i++) {
    try {
      await rename(tmp, file)
      return
    } catch (err) {
      if (!RETRYABLE.has(err.code)) {
        await rm(tmp, { force: true })
        throw err
      }
      await sleep(20 * (i + 1))
    }
  }
  // 最后手段：直接覆盖，随后清理临时文件（极端文件锁场景下避免丢失版本）。
  await writeFile(file, data, 'utf8')
  await rm(tmp, { force: true })
}
