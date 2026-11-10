/**
 * 用户工具函数 — utils 层（纯函数）
 * =========================================================================
 * 「他人主页」做出来的直接产物：五个入口（文章列表 / 详情 / 评论 / 留言 / 聊天室）
 * 都要把「头像 + 昵称 + id」交给同一个组件，而这五处的 author 形态本来就**不一致**：
 *
 *   · 文章（列表 / 详情）  author = { _id, avatar, nickname }      ← 后端 populate 的 select
 *   · 评论 / 留言          author = { id,   name,   avatar }       ← 已被各自 utils 规范化过
 *   · 聊天室               author = { _id,  nickname, avatar }     ← socket 事件，用 _id 且没规范化
 *
 * 以前三处各写一份「取 id / 取显示名」，口径分散在 commentUtils / wallUtils / chat 里，
 *   chat 里还额外有「我对他的备注名」这一层。
 * 这里提供一份**统一的读法**，让入口组件只认 `normalizeUser()` 的产出。
 *
 * ⚠ 纯函数、无副作用、不依赖 DOM 与 store —— 可脱离浏览器直接测。
 */

/** 没设头像时的兜底图（与 Aside.vue / ChatBubble.vue / WallDanmaku.vue 用的是同一张） */
import defaultAvatar from '@/assets/images/avator-default.jpg'

/**
 * 展示名优先级：昵称 > 用户名 > 匿名
 * （与 utils/commentUtils.js 里那份 displayName 同一口径，只是挪到这里共用）
 */
export function displayName(user) {
  return user?.nickname || user?.username || '匿名'
}

/**
 * 把任意形态的「作者」读成一个固定结构
 *
 * @param {*} raw — 可能是：
 *   { id, name, avatar }      （评论 / 留言已规范化的形态）
 *   { _id, nickname, avatar } （后端 populate 的形态）
 *   裸 ObjectId 字符串
 *   null / undefined
 * @returns {{ id: string, name: string, avatar: string }}
 *   id      空串表示「拿不到这个人」—— 调用方据此决定**不可点击**
 *   avatar  空串时由调用方换成兜底图（这里不给，因为有的地方要判空）
 */
export function normalizeUser(raw) {
  if (!raw) return { id: '', name: '匿名', avatar: '' }

  // 已经规范化过的形态（评论 / 留言）优先 —— 它的 name 可能来自「备注」等前端加工，
  // 用 nickname/username 重算会把它冲掉
  if (typeof raw === 'object' && 'name' in raw) {
    return {
      id: String(raw.id ?? raw._id ?? ''),
      name: raw.name || '匿名',
      avatar: raw.avatar || '',
      // role 只有管理端要用（判断能不能删别人的内容），没有就是普通用户
      role: raw.role || 'user',
    }
  }

  const id = typeof raw === 'object' ? String(raw._id ?? raw.id ?? '') : String(raw)
  return {
    id,
    name: displayName(raw),
    avatar: raw.avatar || '',
    role: (typeof raw === 'object' && raw.role) || 'user',
  }
}

/** 头像地址：没设就给兜底图 */
export function avatarOf(avatar) {
  return avatar || defaultAvatar
}

/**
 * 两个 id 是不是同一个人
 * ⚠ 一律按字符串比：populate 出来的 _id 是 ObjectId，裸传的是字符串，=== 会永远不等
 */
export function isSameUser(a, b) {
  const left = String(a ?? '')
  const right = String(b ?? '')
  return !!left && left === right
}
