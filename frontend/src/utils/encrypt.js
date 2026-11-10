/**
 * 使用 RSA-OAEP 加密密码
 *
 * 流程：
 *   ① 检查 store 中是否有缓存的公钥（pubKey），有则直接使用
 *   ② 没有则发送 GET /keys 获取公钥，缓存到 store
 *   ③ 使用 node-forge 的 RSA-OAEP 加密，base64 编码后返回
 *
 * 为什么缓存公钥？
 *   用户可能在登录后短时间内进行注册操作（填写密码），
 *   每次登录/注册都请求密钥是浪费的。缓存到 store 后同一次会话内复用。
 *
 * @param {string} value — 待加密的明文字符串（如密码）
 * @returns {Promise<string|boolean>} 加密后的 base64 字符串，失败返回 false
 */


// 引入 store
import store from 'store'
// 引入 forge
import forge from 'node-forge'
// 循环依赖问题: 只引入http中涉及axios封装的部分
import instance from '../request/api/service'


const pubKeyName = process.env.VUE_APP_BLOG_API_PUBLIC_KEY_NAME
const baseUrl = process.env.VUE_APP_BLOG_API_BASE_URL

async function encrypt(value) {
  let pubKey = store.get(pubKeyName)
  if (!pubKey) {
    // 第一次使用，从后端获取 RSA 公钥
    const res = await instance(`${baseUrl}/keys`)
    pubKey = res.data.keyName
    store.set(pubKeyName, pubKey) // 缓存，后续请求直接使用
  }
  try {
    const publicObj = forge.pki.publicKeyFromPem(pubKey)
    // RSA-OAEP 是更安全的填充方案（相较于 PKCS#1 v1.5）
    const bytes = publicObj.encrypt(value, 'RSA-OAEP')
    return forge.util.encode64(bytes)
  } catch (error) {
    console.error('加密错误:', error)
    return false
  }
}

export default encrypt
