/**
 * 统一的上传入口 —— utils 层
 *
 * 为什么要抽这一层：四个地方（头像/背景、文章封面与插图、评论配图、时间线图）
 * 各自手写 FormData 的话，「算 hash → 预检 → 上传」这套流程要抄四遍，
 * 将来改协议（分片、并发、进度）就得改四处。
 *
 * 流程：
 *   ① 算内容 SHA-256
 *   ② POST /upload/check 预检 —— 命中直接返回已有 URL，**文件体根本不发**（秒传）
 *   ③ 未命中原样上传，FormData 里额外带 hash（后端只把它当提示，落库以服务端重算为准）
 *
 * ⚠ 第一个参数要传**组件实例**（vm）而不是 `this.$api`：
 *   `$api` 内部会用 this.$toast 弹错误，把函数单独传出去会丢 this。
 */
import { fileHash } from './fileHash'

/**
 * 上传单个文件
 * @param {object} vm Vue 组件实例（用它的 $api）
 * @param {File|Blob} file
 * @param {'user'|'article'|'comment'|'timeline'} classify
 * @returns {Promise<string>} 成功返回 filePath，失败返回空串
 */
export async function uploadOne(vm, file, classify) {
  const hash = await fileHash(file)

  // ① 秒传预检
  const probe = await vm.$api({
    type: 'uploadCheck',
    data: { classify, hash },
  })
  if (probe && probe.data && probe.data.exists && probe.data.filePath) {
    return probe.data.filePath
  }

  // ② 未命中：正常上传（带上 hash，后端会重算校验）
  const formData = new FormData()
  formData.append('file', file)
  formData.append('hash', hash)

  const res = await vm.$api({
    type: 'upload',
    params: { classify },
    data: formData,
  })

  return (res && res.data && res.data[0] && res.data[0].filePath) || ''
}

/**
 * 批量上传（带并发上限）
 *
 * 逐个上传的意义：一个请求只处理一个文件，返回值天然与入参一一对应，
 * 不会出现「部分秒传导致返回数组变短、按下标配对就错位」的问题。
 * 并发上限是为了多图时不至于同时开十几个请求把上传接口打满。
 *
 * @param {object} vm
 * @param {Array<File|Blob>} files
 * @param {string} classify
 * @param {number} concurrency 同时进行的请求数，默认 3
 * @returns {Promise<string[]>} 顺序与 files 一致（失败的为 ''）
 */
export async function uploadMany(vm, files, classify, concurrency = 3) {
  const list = Array.from(files || [])
  const results = new Array(list.length).fill('')
  if (!list.length) return results

  let cursor = 0
  const worker = async () => {
    while (cursor < list.length) {
      const index = cursor++
      results[index] = await uploadOne(vm, list[index], classify)
    }
  }

  const workerCount = Math.min(concurrency, list.length)
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results
}
