import instance from './service'
import REQUEST_MAP from '@/config/api.config.js'
import encrypt from '@/utils/encrypt'
import store from 'store'
// 登录态失效时要顺手断掉聊天室的 WebSocket（否则它会一直带着废 token 重连）
import { close as closeChatSocket } from '@/utils/chatSocket'

const tokenName = process.env.VUE_APP_BLOG_API_TOKEN_NAME

// 401 只排一次重载：同一批请求（getProfile / 点赞 / 评论…）可能一起 401，
// 每个都排一次会让页面连刷好几下
let reloadScheduled = false


/**
 * 清掉登录态 —— 持久化存储 + vuex 必须一起清
 *
 * ⚠ 只清 localStorage 的话 state.token 还在 → isLogin 依旧为 true：
 *   界面停留在「已登录」外壳里（显示头像位），但所有需要鉴权的接口都 401，
 *   头像/昵称这类只能一直空着，而且不会给任何提示。
 *
 * vm 是从调用方（this.$vm.$api）透进来的根实例，拿不到时退化成只清存储。
 */
function clearAuth(vm) {
  store.remove(tokenName)
  store.remove('uid')
  vm?.$store?.commit('http/SET_TOKEN', '')
  vm?.$store?.commit('http/SET_USERINFO', {})
}


/**
 * 登录态失效后的收尾：清干净 + 整页重载
 *
 * 为什么光清 state 不够：已经渲染出来的这一屏是按「已登录」画好的
 * （头像/昵称、侧栏导航卡片、评论区里的本人身份…），清 state 只会让后面的渲染变，
 * 不会把画好的 DOM 收回去 —— 就会出现「token 都清了，页面还停在登录时的样子」。
 * 整页重载后 isLogin 为 false，整站从零按未登录形态重建，前后才真正一致。
 *
 * ⚠ 不会死循环：重载后本地已经没有 token，不会再发带鉴权的请求。
 *   （没有 token 时后端返回的是 500「No token provided」，不是 401）
 */
function reloadAfterClear(vm) {
  if (reloadScheduled) return
  reloadScheduled = true
  // 先提示再重载：立刻 reload 会把提示一起刷掉，用户不知道页面为什么跳回未登录形态。
  // 800ms 是「够看清」与「别磨蹭」之间的折中
  if (vm && vm.$toast) vm.$toast.error('登录已失效，请重新登录')
  setTimeout(() => window.location.reload(), 800)
}


export default async function Http({ type, data = {}, params = {} } = {}) {
  // 拦截非REQUEST_MAP路由：防止拼写错误导致发送到错误的 URL
  const route = REQUEST_MAP[type]
  if (!route) {
    throw new Error(`未知请求类型: ${type}`)
  }

  const { url, method, rsaKey, setToken, noMessage } = route

  // ① 替换 URL 中的 {param} 占位符
  const finalUrl = url.replace(/\{(\w+)\}/g, (_, key) => params[key] ?? '')

  // ② RSA 加密（仅当配置了 rsaKey 且 data 中存在对应字段）
  // rsaKey 支持单个字符串或多个字段数组
  let finalData = data
  if (rsaKey && data !== undefined) {
    const keys = Array.isArray(rsaKey) ? rsaKey : [rsaKey]
    for (const key of keys) {
      if (key in finalData) {
        finalData = { ...finalData, [key]: await encrypt(finalData[key]) }
      }
    }
  }

  // ③ method 适配：GET 时 data 应作为查询参数而非请求体
  const requestData = method === 'GET' ? { params: finalData } : finalData

  // ④ 发送请求
  try {
    const res = await instance[method.toLowerCase()](finalUrl, requestData);
    // ⑤ setToken：登录/注册后自动存储 token（通过请求拦截器注入）
    if (setToken) {
      const { token, uid } = res?.data || {}
      if (token) {
        store.set(tokenName, token)
        if (uid) store.set('uid', uid)
      }
    }

    return res
  } catch (error) {
    // ⑥ 401 = 登录态失效（token 过期 / 被吊销 / 非法）：清掉本地登录态 + 整页重载
    //    （光清 state 收不回已经画好的那一屏，见 reloadAfterClear 的说明）
    if (error.response?.status === 401) {
      clearAuth(this)
      closeChatSocket()
      reloadAfterClear(this)
      // 页面马上要重载了，后面的 toast 不用弹（弹了也会被刷掉）
      return
    }

    // ⑦ 错误处理：noMessage 时静默（如评论列表 GET 失败不需要弹窗），否则弹 toast
    if (error.response) {
      // 错误响应:（4xx/5xx）
      const msg = error.response.data?.message || '网络请求失败'
      if (!noMessage) {
        this.$toast.error(msg)
      }
    } else {
      // 错误请求:网络错误（断网/超时等）
      if (!noMessage) {
        this.$toast.error('网络请求失败')
      }
    }
    // Promise.reject(error)
  }
}
