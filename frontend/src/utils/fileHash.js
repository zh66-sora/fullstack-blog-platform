/**
 * 文件内容哈希 —— utils 层
 *
 * 用 js-sha256（纯 JS 实现）而不是 crypto.subtle，原因是后者**只在安全上下文**
 * （HTTPS 或 localhost）下存在。线上若是纯 HTTP（非 localhost / 非 HTTPS），
 * window.crypto.subtle 是 undefined —— 直接调会抛
 * "Cannot read properties of undefined (reading 'digest')"。
 *
 * 性能：纯 JS 算 10MB 约 50~100ms（主线程）。博客单图这个量级可以接受；
 * 真要更大文件，应换 Worker 或上 HTTPS 后用 crypto.subtle。
 */
import { sha256 } from 'js-sha256'

/**
 * @param {File|Blob} file
 * @returns {Promise<string>} 64 位小写十六进制
 */
export async function fileHash(file) {
  const buffer = await file.arrayBuffer()
  return sha256(new Uint8Array(buffer))
}
