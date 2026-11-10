/**
 * 留言墙视图模型 — utils 层（纯函数）
 *
 * 与 utils/commentUtils.js 同一套写法：后端返回结构原样不动，
 * 这里只把字段名改短、补上模板要用的显示字段。
 *
 * 和评论区有意不同的三点（不是漏迁）：
 *   ① 没有 likeNum / dislikeNum / image —— 留言墙**没有点赞点踩、也不带图**，
 *      视图模型里就不留这些字段，免得模板里到处写 v-if="false"。
 *   ② 权限位（canDelete / canReply）由**后端算好**下发，这里只透传：
 *      「谁能删 / 谁能回」的规则得前后端一致，写在两处迟早对不上；
 *      前端不再拿 currentUserId 自己比一遍。
 *   ③ 回复不分页 —— 能在这条留言下说话的只有板主和作者两个人，
 *      一次性带出来比「查看更多回复」省事（后端同理，见 routes/wall.js）。
 */
import { timeAgo } from './formatters'

/** 留言正文字数上限（与后端 models/WallMessage.js 的 MAX_LEN 同一口径） */
export const WALL_MAX_LEN = 30

/**
 * 字数：按**码点**计数
 * ⚠ 不能用 .length：emoji 是代理对，一个表情会被算成 2 个字，
 *   和后端 `[...content].length` 对不上 → 前端放行的 30 字到后端变成 31 被拒。
 */
export function wallTextLength(s) {
  return [...(s || '')].length
}

/** 展示名：nickname 优先、回退 username（后端 populate 两个字段都给了） */
function displayName(user) {
  return user?.nickname || user?.username || '匿名'
}

function toId(v) {
  if (!v) return ''
  return String(v._id ?? v)
}

/** 留言 / 回复共有的字段 */
function mapBase(d) {
  return {
    id: String(d._id),
    content: d.content || '',
    time: timeAgo(d.createTime),
    author: {
      id: toId(d.author),
      name: displayName(d.author),
      avatar: d.author?.avatar || '',
    },
    canDelete: !!d.canDelete,
  }
}

/** 一条回复（多一个 replyTo 关系，用于「回复 @xxx」） */
function mapReply(r) {
  return {
    ...mapBase(r),
    replyTo: r.replyTo ? { id: toId(r.replyTo), name: displayName(r.replyTo) } : null,
  }
}

/** 板上的一条留言（内嵌它的全部回复） */
function mapMessage(m) {
  return {
    ...mapBase(m),
    replies: (m.replies || []).map(mapReply),
    replyCount: m.replyCount ?? (m.replies || []).length,
    canReply: !!m.canReply,
  }
}

/**
 * 分页 → 列表数据
 * @param {object} raw 后端 data：{ list, page, size, total, pages, hasMore }
 */
export function buildWallListViewModel(raw) {
  const { list = [], total = 0, page = 1, pages = 0, hasMore = false } = raw ?? {}
  return { total, page, pages, hasMore, list: list.map(mapMessage) }
}

/**
 * 刚提交成功的那条
 *
 * POST /api/wall 返回的是**后端 populate 好的完整文档**（不像 bus 的 create 只回 _id），
 * 所以这里不用「拿当前用户自己补一条」，直接过一遍 mapper 即可 ——
 * 时间会显示成「刚刚」，下次重新拉这一页自然对齐。
 */
export function buildPostedWallViewModel(doc) {
  if (!doc) return null
  // ⚠ POST 返回的文档里**没有** canDelete / canReply（后端只在 GET 列表时算这两个位），
  //   直接过 mapper 的话刚发出去的这条一个按钮都没有，看着像「发成功了但动不了」。
  //   这里显式补上：发的人必然是作者 → 可删；作者本人也能在自己这条下接话 → 可回。
  const mine = { ...doc, canDelete: true, canReply: true }
  return doc.parentMessage ? mapReply(mine) : mapMessage(mine)
}

/**
 * 弹幕池 —— 侧栏「弹幕留言墙」随机抽取的来源
 *
 * 一条弹幕只要两样：头像 + 正文（时间、权限位、作者 id 都还用不上）。
 *
 * ⚠ **不取昵称**（需求：「不要留言用户的名字」）——
 *   所以这里连 name 都不映射，别指望组件层去忽略它：
 *   视图模型里留一个没人用的字段，下次改的人会以为它有用。
 * ⚠ **只取顶层留言，不含回复**（需求：「仅初始留言文字消息（不包括回复）」）。
 *   正好不用自己过滤：后端 GET /api/wall/:userId 的 list 本来就只返回顶层留言，
 *   回复是嵌在各自的 replies 里的。
 * ⚠ 头像留空串，由组件回落到默认头像 —— 这里不 require 图片，
 *   纯函数不该依赖构建期的资源解析。
 *
 * @param {object} raw 后端 data：{ list, page, size, total, pages, hasMore }
 */
export function buildDanmakuPool(raw) {
  const { list = [] } = raw ?? {}
  return list
    .filter((m) => m && m.content)
    .map((m) => ({
      avatar: m.author?.avatar || '',
      content: m.content
    }))
}
