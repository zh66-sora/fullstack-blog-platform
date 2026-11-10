/**
 * chatSocket.js — 聊天室 Socket.IO 客户端（单例）
 * =========================================================================
 * 只做「连接 + 收发 + 本地派发」三件事，不含任何业务状态：
 *   业务状态全部收在 store/modules/chat.js，本文件通过 on() 把服务端事件
 *   转发过去（store 不能反过来被 import，否则会形成循环依赖）。
 *
 * 鉴权：token 走 socket.io 的 auth 字段（浏览器 WebSocket 没法自定义 header），
 *   对应后端 core/chatSocket.js 的 authenticate（RS256 验签 + 回查 User）。
 *
 * 连接时机（对齐需求「登录后到关页面/退出登录为止」）：
 *   登录成功 / 刷新时本地已有 token → connect()
 *   主动退出登录 / 401 被动失效 / 被顶号 → close()
 *   弹窗开关**不**影响连接。
 *
 * 重连：交给 socket.io 自带的 reconnection（指数退避 1s→10s）。
 *   ⚠ 被顶号时服务端发的是 `io server disconnect`，socket.io 客户端
 *     **不会**自动重连 —— 正是我们要的（顶号后由 store 强制退出）。
 */
import { io } from 'socket.io-client'

// 与 VUE_APP_BLOG_API_BASE_URL 同源（后端 3000），只是协议走 ws
const WS_URL = process.env.VUE_APP_BLOG_WS_URL || 'http://127.0.0.1:3000'

// 服务端 → 客户端的事件白名单：只有这些会被派发到本地监听
const SERVER_EVENTS = ['init', 'message', 'system', 'users', 'kicked']

// 握手阶段的失败文案（后端 authenticate 里抛的），属于「不该重连」的错误
const AUTH_ERRORS = ['未登录', '登录状态已失效']

let socket = null
const listeners = Object.create(null)

/** 注册本地监听（名字与 socket.io 的 on 一致，但作用在本地派发器上） */
export function on(event, handler) {
  if (!listeners[event]) listeners[event] = []
  listeners[event].push(handler)
}

function dispatch(event, payload) {
  const handlers = listeners[event]
  if (handlers) handlers.forEach((handler) => handler(payload))
}

/** 当前连接是否可用（能发消息） */
export function isConnected() {
  return Boolean(socket && socket.connected)
}

/** 握手失败是否属于「登录态问题」（这类不重连，直接提示重新登录） */
export function isAuthError(message) {
  return AUTH_ERRORS.indexOf(message) > -1
}

/**
 * 建立连接（已存在实例时只刷新 token 并确保处于连接态）
 * @param {string} token
 */
export function connect(token) {
  if (socket) {
    socket.auth = { token }
    if (!socket.connected) socket.connect()
    return socket
  }

  socket = io(WS_URL, {
    auth: { token },
    // 优先 websocket；不支持时回落到 polling（默认就是这两档，显式写出来便于排查）
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    timeout: 8000
  })

  socket.on('connect', () => dispatch('connect'))
  socket.on('disconnect', (reason) => dispatch('disconnect', reason))
  socket.on('connect_error', (err) => dispatch('connect_error', err || new Error('连接失败')))
  SERVER_EVENTS.forEach((event) => {
    socket.on(event, (payload) => dispatch(event, payload))
  })

  return socket
}

/** 主动关闭（退出登录 / 失效 / 被顶号）；会同步派发一次断线事件让 store 复位 */
export function close() {
  if (!socket) return
  socket.removeAllListeners()
  socket.disconnect()
  socket = null
  dispatch('disconnect', 'io client disconnect')
}

/**
 * 上行请求统一走 ack 回执：{ ok, message, data }
 * ⚠ 用 socket.timeout() 包一层，服务端不响应时不会永久挂住 Promise
 */
function call(event, payload) {
  return new Promise((resolve) => {
    if (!isConnected()) return resolve({ ok: false, message: '连接已断开' })
    socket.timeout(8000).emit(event, payload, (err, res) => {
      if (err) return resolve({ ok: false, message: '服务器无响应，请稍后重试' })
      resolve(res || { ok: true, message: '', data: null })
    })
  })
}

export const sendMessage = (content) => call('send', { content })
export const loadHistory = (before) => call('history', { before })
export const setMyStatus = (status) => call('status', { status })
