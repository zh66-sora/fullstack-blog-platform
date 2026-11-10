/**
 * 评论视图模型构建器 — utils 层（纯函数）
 *
 * 迁移自原项目 myBlog/app/utils/commentViewModel.js。
 * 原文件把同一份数据切成了三份（mapComment / mapReply / mapReplyForModal），
 * 差异只有「该不该显示 回复 @xxx」和元信息详略 —— 这里合并为 mapBase + 一个开关：
 *   传 rootAuthorId → 跟楼主比对，只有回复对象不是楼主时才显示「回复 @xxx」（列表预览语义）
 *   传 null         → 只要有 replyTo 就显示（弹窗扁平列表语义）
 *
 * 数据来源：
 *   GET /api/comments/article/:articleId  → 顶层评论分页，每条附 replyCount 与最多 2 条精选回复
 *   GET /api/comments/replies/:commentId  → 某条评论的全部回复（弹窗用，扁平列表）
 *
 * 与原项目的有意差异（不是漏迁）：
 *   ① 不再输出 author.level —— User 模型里没有 level 字段，后端也不会 populate 它。
 *      原项目那个恒为 Lv.0 的徽章是从 DOM 里 parseInt 反读回来的，属无效信息。
 *   ② 字段名统一改短（_id→id / commentTime→time / author.nickname→author.name），
 *      让组件模板好读；后端返回结构本身不做改动。
 */
import { timeAgo } from './formatters'
// 管理端能不能删这条评论：等级严格高于作者即可（与后端 bus.js 的 DELETE 同一条规则）
import { canManage } from '@/config/admin.config'

/** 展示名：后端 populate 的是 username（nickname 可能为空） */
function displayName(user) {
  return user?.nickname || user?.username || '匿名'
}

/**
 * 取_id
 * 适配:
 * 1 populate 过的纯对象
 * 2 未 populate 的裸 ObjectId */
function toId(v) {
  if (!v) return ''
  return String(v._id ?? v)
}

/**
 * 评论 / 回复共有的字段
 * （两者的结构差异只有 replies、replyTo 与显示上的详略）
 */
function mapBase(d, currentUserId, actorRole) {
  const authorId = toId(d.author)
  const isAuthor = !!currentUserId && authorId === String(currentUserId)
  return {
    id: d._id,
    content: d.content || '',
    image: d.image || '',
    time: timeAgo(d.commentTime),
    likeNum: d.likeNum || 0,
    dislikeNum: d.dislikeNum || 0,
    author: {
      id: authorId,
      name: displayName(d.author),
      avatar: d.author?.avatar || '',
    },
    // 只有当前用户就是作者时才显示删除按钮
    isAuthor,
    /**
     * 删除入口的**唯一**判据：作者本人，或「管理端且等级严格高于作者」。
     * 管理员删不了另一个管理员的评论，站长可以删管理员的 —— 与后端完全一致。
     */
    canDelete: isAuthor || canManage(actorRole, d.author?.role || 'user'),
    ipLocation: d.ipLocation || '',
  }
}

/**
 * 单条回复
 * @param {object} r 原始回复
 * @param {string|number|null} currentUserId 当前登录用户 id
 * @param {string|null} rootAuthorId 所属顶层评论的作者 id（null = 弹窗扁平语义）
 */
function mapReply(r, currentUserId, rootAuthorId = null, actorRole = null) {
  const replyTo = r.replyTo
    ? { id: toId(r.replyTo), name: displayName(r.replyTo) }
    : null
  return {
    ...mapBase(r, currentUserId, actorRole),
    replyTo,
    isNestedReply: !!replyTo && (rootAuthorId === null || replyTo.id !== rootAuthorId),
  }
}

/** 单条顶层评论（内嵌最多 2 条精选回复预览） */
function mapComment(c, currentUserId, actorRole = null) {
  const rootAuthorId = toId(c.author)
  return {
    ...mapBase(c, currentUserId, actorRole),
    replies: (c.replies || []).map((r) => mapReply(r, currentUserId, rootAuthorId, actorRole)),
    replyCount: c.replyCount || 0,
    // 后端按 replyCount > 2 判定，控制「查看更多回复」按钮
    hasMoreReplies: !!c.hasMoreReplies,
  }
}

/**
 * 顶层评论分页 → 列表页数据
 * @param {object} raw 后端 data：{ list, page, size, total, pages, hasMore }
 * @param {string|null} currentUserId
 */
export function buildCommentListViewModel(raw, currentUserId, actorRole = null) {
  const { list = [], total = 0, page = 1, pages = 0, hasMore = false } = raw ?? {}
  return {
    total,
    page,
    pages,
    hasMore,
    list: list.map((c) => mapComment(c, currentUserId, actorRole)),
  }
}

/** 回复分页 → 弹窗回复列表数据 */
export function buildReplyListViewModel(raw, currentUserId, actorRole = null) {
  const { list = [], total = 0, page = 1, pages = 0, hasMore = false } = raw ?? {}
  return {
    total,
    page,
    pages,
    hasMore,
    list: list.map((r) => mapReply(r, currentUserId, null, actorRole)),
  }
}

/**
 * 刚提交成功的那条评论
 *
 * POST /api/rest/comment 只回 { _id }，拿不到后端 populate 好的 author / commentTime，
 * 所以用「当前用户 + 刚输入的内容」补出来，直接 unshift 进列表 ——
 * 原项目是「重新拉整块 HTML + .html() + 重建 Observer」，副作用是已加载的页码和滚动位置全丢，
 * 这里不重复那个代价。
 *
 * ⚠ 补出来的对象有两个字段是近似的：ipLocation（后端写入的属地，这里拿不到）与 time（固定「刚刚」）。
 *   下次重新拉这一页时会自然对齐。
 *
 * @param {object} created 后端返回的 { _id }
 * @param {object} content 原样输入的正文
 * @param {string} image 已上传的配图 URL
 * @param {object|null} currentUser 当前用户资料（userInfo.data）
 */
export function buildPostedCommentViewModel({ _id, content, image }, currentUser) {
  return {
    id: _id,
    content,
    image: image || '',
    time: '刚刚',
    likeNum: 0,
    dislikeNum: 0,
    author: {
      id: toId(currentUser),
      name: displayName(currentUser),
      avatar: currentUser?.avatar || '',
      role: currentUser?.role || 'user',
    },
    // 刚发出来的必然是自己的
    isAuthor: true,
    canDelete: true,
    ipLocation: '',
    replies: [],
    replyCount: 0,
    hasMoreReplies: false,
  }
}

/** 刚提交成功的那条回复（多一个 replyTo 关系） */
export function buildPostedReplyViewModel({ _id, content, image }, currentUser, replyTo) {
  return {
    id: _id,
    content,
    image: image || '',
    time: '刚刚',
    likeNum: 0,
    dislikeNum: 0,
    author: {
      id: toId(currentUser),
      name: displayName(currentUser),
      avatar: currentUser?.avatar || '',
      role: currentUser?.role || 'user',
    },
    isAuthor: true,
    canDelete: true,
    ipLocation: '',
    replyTo: replyTo ? { id: replyTo.id, name: replyTo.name } : null,
    isNestedReply: !!replyTo,
  }
}
