/**
 * chatSocket.js — 聊天室 Socket.IO 服务
 * =========================================================================
 * 职责：
 *   ① 握手鉴权（复用 app.js 那一套 RS256 + User 回查）
 *   ② 在线会话表（进程内存 Map）—— 单点登录/顶号的唯一依据
 *   ③ 消息收发：send / history / status 三个上行事件
 *   ④ 广播：message / system / users / init / kicked 五个下行事件
 *
 * 为什么是「临时内存」而不是落库：
 *   需求明确「这个记录单个账号已经登录的临时数据，先由后端临时数据保存」。
 *   进程重启即清空，多实例部署会各记一份 —— 本项目的部署形态就是单进程，够用。
 *
 * 与 Express 的关系：
 *   Socket.IO 自己接管 http.Server 的 request / upgrade 事件（只认 /socket.io 前缀），
 *   所以聊天室的握手**不经过** app.js 里的 express-jwt 中间件 ——
 *   不用往 JWT unless 白名单里加任何东西，鉴权完全由下面的 authenticate 负责。
 *
 * 挂载方式（bin/www）：
 *   const server = http.createServer(app)
 *   require('../core/chatSocket').attach(server)   ← 必须在 listen 之前
 */

const { Server } = require('socket.io')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const { pubKeyPath } = require('../config')
const User = require('../models/User')
const Message = require('../models/Message')
const { effectiveStatus } = require('./roles')

// ===== 业务常量 =====
const HISTORY_DAYS = 30        // 只展示最近一个月
const PAGE_SIZE = 30           // 每次上滑加载的条数
const MAX_CONTENT = 200        // 单条消息长度上限
const STATUSES = ['online', 'dnd']   // 可主动切换的状态（offline 由连接状态决定）
const STATUS_ORDER = { online: 0, dnd: 1, offline: 2 }
const OID_RE = /^[0-9a-fA-F]{24}$/

// 公钥只读一次（对齐 app.js 的做法；rsaControl.js 每次都读盘是历史遗留）
const publicKey = fs.readFileSync(pubKeyPath, 'utf8')

/**
 * 在线会话表：uid → { socket, status, user }
 * ⚠ 只有「当前有效」的连接才会留在表里 —— 被顶号的旧连接会立刻被新连接覆盖，
 *   旧连接的 disconnect 回调靠 socket 引用比对自己退场（见 handleDisconnect）。
 */
const sessions = new Map()

let io = null

// ===== 工具函数 =====

/** 昵称兜底口径与前端一致：nickname → username → 匿名 */
function displayName(user) {
  return user.nickname || user.username || '匿名'
}

/** 抹掉 password 等敏感字段后的「我」 */
function meOf(user) {
  return {
    _id: String(user._id),
    nickname: user.nickname || user.username || '匿名',
    username: user.username,
    avatar: user.avatar || ''
  }
}

/** 统一 ack 回执：{ ok, message, data } */
function reply(ack, ok, message, data) {
  if (typeof ack === 'function') {
    ack({ ok, message: message || '', data: data || null })
  }
}

/**
 * 全部注册用户 + 实时状态（左侧列表的数据源）
 * 在线优先、其次勿扰、最后离线；同状态按昵称排
 */
async function userList() {
  const users = await User.find().select('nickname username avatar').lean()
  return users
    .map((user) => {
      const uid = String(user._id)
      const session = sessions.get(uid)
      return {
        _id: uid,
        nickname: displayName(user),
        username: user.username,
        avatar: user.avatar || '',
        status: session ? session.status : 'offline'
      }
    })
    .sort((a, b) => {
      const diff = STATUS_ORDER[a.status] - STATUS_ORDER[b.status]
      return diff !== 0 ? diff : a.nickname.localeCompare(b.nickname, 'zh')
    })
}

/** 把最新的用户列表推给所有人（人数不多，全量推比增量合并简单且不会算错） */
async function broadcastUsers() {
  if (!io) return
  io.emit('users', await userList())
}

/**
 * 取历史消息（最近一个月内）
 * @param {string|null} before 游标 —— 当前最早一条的 _id，取它之前的一页
 * 倒序多取一条判断 hasMore，再反转成正序返回（前端直接 append 到顶部）
 */
async function fetchHistory(before) {
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 3600 * 1000)
  const query = { date: { $gte: since } }
  if (before) query._id = { $lt: before }

  const docs = await Message.find(query)
    .sort({ _id: -1 })
    .limit(PAGE_SIZE + 1)
    .populate('author', 'avatar username nickname')
    .lean()

  const hasMore = docs.length > PAGE_SIZE
  return { list: docs.slice(0, PAGE_SIZE).reverse(), hasMore }
}

// ===== 握手鉴权 =====

/**
 * 前端用 socket.io 的 auth 字段传 token（浏览器 WebSocket 没法自定义 header）：
 *   io(url, { auth: { token } })
 * 校验口径与 app.js 的 express-jwt 一致：RS256 验签 → 回查 User
 */
async function authenticate(socket, next) {
  try {
    const token =
      (socket.handshake.auth && socket.handshake.auth.token) ||
      socket.handshake.query.token
    if (!token) return next(new Error('未登录'))

    const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
    const user = await User.findById(decoded.uid)
      .select('nickname username avatar status statusUntil')
      .lean()
    if (!user) return next(new Error('登录状态已失效'))

    // 封禁 / 注销：连读都不让读
    const status = effectiveStatus(user)
    if (status === 'banned') return next(new Error('账号已被封禁'))
    if (status === 'deleted') return next(new Error('登录状态已失效'))

    socket.data.user = user
    next()
  } catch (err) {
    // 签名不对 / 过期 / uid 不存在：一律按「登录状态已失效」处理，不泄露细节
    next(new Error('登录状态已失效'))
  }
}

// ===== 事件处理 =====

/** send：发一条消息 → 落库 → 原样广播给所有人（含发送者，前端不做乐观渲染） */
async function handleSend(socket, payload, ack) {
  const content = String((payload && payload.content) || '').trim()
  if (!content) return reply(ack, false, '消息不能为空')
  if (content.length > MAX_CONTENT) return reply(ack, false, `消息不能超过 ${MAX_CONTENT} 个字符`)

  try {
    // 禁言可能在连接建立之后才生效：每条消息都按最新状态判断
    const fresh = await User.findById(socket.data.user._id).select('status statusUntil').lean()
    if (!fresh || effectiveStatus(fresh) !== 'active') {
      const msg = !fresh ? '登录状态已失效' : effectiveStatus(fresh) === 'muted' ? '你已被禁言' : '账号已被封禁'
      return reply(ack, false, msg)
    }

    const created = await Message.create({
      content,
      author: socket.data.user._id,
      date: new Date()
    })
    const message = await Message.findById(created._id)
      .populate('author', 'avatar username nickname')
      .lean()

    io.emit('message', { message })
    reply(ack, true)
  } catch (err) {
    reply(ack, false, '消息发送失败')
  }
}

/** history：上滑加载更早的一页（仅回给请求方，用 ack 回执避免与广播串台） */
async function handleHistory(socket, payload, ack) {
  try {
    const before = payload && payload.before
    if (before && !OID_RE.test(String(before))) return reply(ack, false, '分页游标格式错误')

    reply(ack, true, null, await fetchHistory(before || null))
  } catch (err) {
    reply(ack, false, '加载历史消息失败')
  }
}

/** status：切换在线/勿扰 */
function handleStatus(socket, payload, ack) {
  const status = payload && payload.status
  if (STATUSES.indexOf(status) < 0) return reply(ack, false, '不支持的状态')

  const session = sessions.get(socket.data.uid)
  if (!session || session.socket !== socket) return reply(ack, false, '会话已失效')

  session.status = status
  reply(ack, true, null, { status })
  broadcastUsers()
}

/** disconnect：关闭页面 / 退出登录 / 断网 */
function handleDisconnect(socket, uid) {
  const session = sessions.get(uid)
  // ⚠ 被顶号时表里已经是新连接了，这里必须退场，否则会把新会话误删
  if (!session || session.socket !== socket) return

  sessions.delete(uid)
  socket.broadcast.emit('system', {
    text: `${displayName(session.user)} 离开了聊天室`,
    kind: 'leave',
    date: Date.now()
  })
  broadcastUsers()
}

/** connection：顶号 → 建会话 → 下发 init → 广播加入 */
async function onConnection(socket) {
  const { user } = socket.data
  const uid = String(user._id)
  socket.data.uid = uid

  // ===== 单点登录（顶号）=====
  // ⚠ 顺序必须是「先占位、再断开旧的」：
  //   反过来的话，旧连接的 disconnect 回调会在 sessions 还没写入新连接时把 uid 删掉，
  //   新连接就成了没有会话记录的孤儿（收不到广播、也切不了状态）。
  const previous = sessions.get(uid)
  sessions.set(uid, { socket, status: 'online', user })
  if (previous && previous.socket.id !== socket.id) {
    // 先发 kicked 让旧端 toast + 强制退出，稍后再断开（立刻断会把还没送达的包丢掉）
    previous.socket.emit('kicked')
    setTimeout(() => previous.socket.disconnect(true), 100)
  }

  socket.on('send', (payload, ack) => handleSend(socket, payload, ack))
  socket.on('history', (payload, ack) => handleHistory(socket, payload, ack))
  socket.on('status', (payload, ack) => handleStatus(socket, payload, ack))
  socket.on('disconnect', () => handleDisconnect(socket, uid))

  // ===== 首屏：我是谁 + 用户列表 + 最近一页消息 =====
  let data = { me: meOf(user), users: [], list: [], hasMore: false }
  try {
    const [users, page] = await Promise.all([userList(), fetchHistory(null)])
    data = { me: meOf(user), users, list: page.list, hasMore: page.hasMore }
  } catch (err) {
    console.warn('[chat] 初始化数据失败:', err.message)
  }
  socket.emit('init', data)

  // ===== 通知其他人 =====
  socket.broadcast.emit('system', {
    text: `${displayName(user)} 加入了聊天室`,
    kind: 'join',
    date: Date.now()
  })
  broadcastUsers()
}

/**
 * 把聊天室挂到已有的 http.Server 上（bin/www 调用）
 * @param {import('http').Server} server
 */
function attach(server) {
  io = new Server(server, {
    // 与 app.js 的 cors 口径一致：前端 dev server 是 8080，与后端 3000 不同源
    cors: { origin: true, credentials: true },
    // 单条消息上限，防超大包（正文另有 200 字业务校验）
    maxHttpBufferSize: 1e5
  })

  io.use(authenticate)
  io.on('connection', onConnection)
  console.log('[chat] 聊天室 Socket.IO 已挂载，路径 /socket.io')
  return io
}

module.exports = { attach, HISTORY_DAYS, PAGE_SIZE, MAX_CONTENT }
