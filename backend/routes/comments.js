/**
 * 评论专用路由
 * =========================================================================
 * 职责：处理评论区的前后端交互，包括查询和点赞/踩操作
 *
 * 路由设计说明：
 *   评论业务较为复杂（两级嵌套、分页、赞/踩 toggle），不适合放在通用 CRUD 路由（bus.js）中，
 *   故独立为专用路由，实现更精细的控制
 *
 * 路由清单：
 *   GET  /api/comments/article/:articleId        — 文章顶层评论（分页，每条含赞数最高 2 条回复）
 *   GET  /api/comments/replies/:commentId         — 某条评论的全部回复（分页，模态框内用）
 *   POST /api/comments/like/:commentId            — 评论赞/踩 toggle（需登录）
 *
 * 嵌套评论数据模型：
 *   顶层评论：parentComment=null，replyTo=null
 *   嵌套回复：parentComment=顶层评论ID，replyTo=被回复的用户ID
 *   → 至多两级嵌套，避免无限递归
 */
const express = require('express')
const router = express.Router()
const createError = require('http-errors')
const assert = require('http-assert')
const Comment = require('../models/Comment')
const CommentLike = require('../models/CommentLike')

/**
 * GET /api/comments/article/:articleId
 * 获取文章顶层评论（分页），每条含赞数最高的至多 2 条回复
 * Query: ?page=1&size=5
 *
 * 执行流程：
 *   ① 校验 articleId 格式（24位 hex）
 *   ② 查顶层评论（parentComment=null），按时间倒序分页
 *   ③ 对每条顶层评论并行查询：回复总数 + 赞数最高的 2 条回复
 *   ④ 组装 replyCount / hasMoreReplies 等字段返回
 *
 * 设计决策：
 *   - 每条顶层评论附带 2 条"精选回复"（按赞数排序），
 *     既让用户预览讨论热度，又不一次性加载全部回复
 *   - 使用 lean() 而非完整 populate，因为回复已在手动查询中 populate 并组装
 *   - 回复总数（replyCount）和 hasMoreReplies 字段告知前端是否需要显示"查看全部回复"按钮
 *   - populate 的字段里必须带上 nickname：前端展示名取「nickname 优先、回退 username」，
 *     如果只给 username，"回复 @xxx" 里的名字会和评论作者名对不上
 *     （用户 有昵称"小明"、用户名 abc123 时，作者显示小明、@ 却显示 abc123）
 */
router.get('/article/:articleId', async (req, res, next) => {
  try {
    const { articleId } = req.params
    const page = parseInt(req.query.page) || 1
    const size = parseInt(req.query.size) || 5

    // ① 验证 articleId 格式
    assert(articleId && /^[0-9a-fA-F]{24}$/.test(articleId), 422, '文章ID格式错误')

    // ② 查顶层评论总数 + 分页数据
    const query = { article: articleId, parentComment: null }
    const total = await Comment.countDocuments(query)

    const topComments = await Comment.find(query)
      .sort({ commentTime: -1 })
      .skip((page - 1) * size)
      .limit(size)
      .populate('author', 'avatar username nickname role')
      .lean()

    // ③ 对每条顶层评论：查回复总数 + 赞数最高的至多 2 条回复
    const list = await Promise.all(topComments.map(async (comment) => {
      const replyQuery = { article: articleId, parentComment: comment._id }
      const replyCount = await Comment.countDocuments(replyQuery)
      const replies = await Comment.find(replyQuery)
        .sort({ likeNum: -1, commentTime: -1 })
        .limit(2)
        .populate('author', 'avatar username nickname role')
        .populate('replyTo', 'avatar username nickname role')
        .lean()

      return {
        ...comment,
        replyCount,
        replies,
        hasMoreReplies: replyCount > 2 // 前端据此决定是否显示"查看全部回复"
      }
    }))

    // ④ 组装分页元数据
    const pages = Math.ceil(total / size)

    res.send({
      message: 'ok',
      data: {
        list,
        page,
        size,
        total,
        pages,
        hasMore: page < pages
      }
    })
  } catch (err) {
    next(err.status ? err : createError(422, '查询评论失败'))
  }
})

/**
 * GET /api/comments/replies/:commentId
 * 获取某条评论的全部回复（分页，模态框内懒加载用）
 * Query: ?page=1&size=20
 *
 * 执行流程：
 *   ① 校验 commentId 格式
 *   ② 查父评论获取 article 字段（嵌套回复的查询依赖 article+parentComment 复合索引）
 *   ③ 按时间正序分页查询所有回复
 *   ④ 组装分页数据返回
 *
 * 设计决策：
 *   - 按时间正序排列回复（最旧的在前），符合阅读对话流的习惯
 *   - 分页条数较多（默认 20 条），因为模态框空间大，希望减少翻页次数
 *   - 需要先查父评论获取 article 的原因：复合索引的前缀是 article，
 *     如果直接用 parentComment 查，无法利用索引，会导致全表扫描
 */
router.get('/replies/:commentId', async (req, res, next) => {
  try {
    const { commentId } = req.params
    const page = parseInt(req.query.page) || 1
    const size = parseInt(req.query.size) || 20

    assert(commentId && /^[0-9a-fA-F]{24}$/.test(commentId), 422, '评论ID格式错误')

    // ① 先查父评论获取 article（复合索引依赖）
    const parent = await Comment.findById(commentId).select('article').lean()
    assert(parent, 422, '评论不存在')

    // ② 利用复合索引 { article, parentComment } 查询
    const query = { article: parent.article, parentComment: commentId }
    const total = await Comment.countDocuments(query)

    const replies = await Comment.find(query)
      .sort({ commentTime: 1 })
      .skip((page - 1) * size)
      .limit(size)
      .populate('author', 'avatar username nickname role')
      .populate('replyTo', 'avatar username role')
      .lean()

    const pages = Math.ceil(total / size)

    res.send({
      message: 'ok',
      data: {
        list: replies,
        page,
        size,
        total,
        pages,
        hasMore: page < pages
      }
    })
  } catch (err) {
    next(err.status ? err : createError(422, '查询回复失败'))
  }
})

/**
 * POST /api/comments/like/:commentId
 * 评论赞/踩 toggle（需登录）
 * Body: { type: 'like' | 'dislike' }
 * 返回: { likeNum, dislikeNum, userAction }
 *
 * Toggle 逻辑（三种状态切换）：
 *   ① 无记录 → 创建记录，对应计数 +1
 *   ② 同类型（再次点击） → 删除记录，取消操作，对应计数 -1
 *   ③ 不同类型（从赞切踩或反之） → 更新记录类型，两计数分别 ±1
 *
 * 为什么用单独表存赞踩关系？
 *   - 见 models/CommentLike.js 的注释说明
 *   - 原子性操作：先查 CommentLike → 计算 delta → 同时更新 Comment 计数器
 *   - 不在此处使用事务，因为 delta 是精确计算的，且 CommentLike 唯一索引保证不会产生重复记录
 */
router.post('/like/:commentId', async (req, res, next) => {
  try {
    const { commentId } = req.params
    const { type } = req.body
    const userId = req.uid

    // 参数校验
    assert(userId, 422, '请先登录')
    assert(['like', 'dislike'].includes(type), 422, '操作类型错误')
    assert(commentId && /^[0-9a-fA-F]{24}$/.test(commentId), 422, '评论ID格式错误')

    // 确认评论存在
    const comment = await Comment.findById(commentId)
    assert(comment, 422, '评论不存在')

    // 查询已有赞踩记录（利用 user+comment 唯一索引，最多一条）
    const existing = await CommentLike.findOne({ user: userId, comment: commentId })

    let userAction     // 返回给前端：'liked' | 'disliked' | 'none'
    let likeDelta = 0      // 点赞数的变化值
    let dislikeDelta = 0   // 点踩数的变化值

    if (existing) {
      if (existing.type === type) {
        // ② 同类型 → 取消操作（删除记录，对应计数 -1）
        await CommentLike.deleteOne({ _id: existing._id })
        if (type === 'like') likeDelta = -1
        else dislikeDelta = -1
        userAction = 'none'
      } else {
        // ③ 不同类型 → 切换（更新记录类型，两计数分别 ±1）
        existing.type = type
        existing.date = new Date()
        await existing.save()
        if (type === 'like') { likeDelta = 1; dislikeDelta = -1 }
        else { likeDelta = -1; dislikeDelta = 1 }
        userAction = type === 'like' ? 'liked' : 'disliked'
      }
    } else {
      // ① 无记录 → 新建
      await CommentLike.create({ user: userId, comment: commentId, type })
      if (type === 'like') likeDelta = 1
      else dislikeDelta = 1
      userAction = type === 'like' ? 'liked' : 'disliked'
    }

    // 更新 Comment 文档中的计数（注意：comment.likeNum 是查询时的旧值，叠加 delta 后写入）
    const update = {}
    if (likeDelta !== 0) update.likeNum = comment.likeNum + likeDelta
    if (dislikeDelta !== 0) update.dislikeNum = comment.dislikeNum + dislikeDelta

    if (Object.keys(update).length) {
      await Comment.findByIdAndUpdate(commentId, { $set: update })
    }

    res.send({
      message: 'ok',
      data: {
        likeNum: (comment.likeNum || 0) + likeDelta,
        dislikeNum: (comment.dislikeNum || 0) + dislikeDelta,
        userAction
      }
    })
  } catch (err) {
    next(err.status ? err : createError(422, '操作失败'))
  }
})

module.exports = router
