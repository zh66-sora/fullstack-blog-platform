/**
 * artLikes.js — 文章点赞/点踩路由
 * =========================================================================
 *
 * 路由：
 *   GET  /articles/likes/:id          — 查询当前用户对某篇文章的反应状态
 *   POST /articles/likes/:id          — 点赞/点踩 toggle
 *
 * Toggle 逻辑（与 CommentLike 一致）：
 *   ① 无记录 → 创建，对应计数 +1
 *   ② 同类型（再点） → 删除，取消操作，对应计数 -1
 *   ③ 不同类型（从赞切踩或反之） → 更新类型，两计数分别 ±1
 *
 * 返回：{ likeNum, dislikeNum, userReaction: 'liked' | 'disliked' | 'none' }
 */
const express = require('express')
const router = express.Router()
const createError = require('http-errors')
const assert = require('http-assert')
const Article = require('../models/Article')
const ArticleLike = require('../models/ArticleLike')

// GET /articles/likes/:id — 查询当前用户对该文章的反应
// 注意：此路由在 JWT unless 白名单中（methods: ['GET']），req.uid 不会被 express-jwt 设置
// 需要手动从 Authorization header 解析 token 获取 userId
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    assert(id && /^[0-9a-fA-F]{24}$/.test(id), 422, '文章ID格式错误')

    // 手动解析 token（此路由跳过 JWT 中间件，需自行提取）
    let userId = null
    const authHeader = req.headers.authorization || req.query.token
    if (authHeader) {
      try {
        const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader
        const jwt = require('jsonwebtoken')
        const fs = require('fs')
        const publicKey = fs.readFileSync('./auth/public.pem', 'utf8')
        const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
        userId = decoded.uid
      } catch (e) { /* token 无效，按匿名用户处理 */ }
    }

    let userReaction = 'none'
    if (userId) {
      const record = await ArticleLike.findOne({ user: userId, article: id }).select('type').lean()
      if (record) userReaction = record.type === 'like' ? 'liked' : 'disliked'
    }

    res.send({ message: 'ok', data: { userReaction } })
  } catch (err) {
    next(err.status ? err : createError(422, '查询失败'))
  }
})

// POST /articles/likes/:id — 点赞/点踩 toggle
router.post('/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    const { type } = req.body      // 'like' | 'dislike'
    const userId = req.uid

    assert(userId, 422, '请先登录')
    assert(['like', 'dislike'].includes(type), 422, '操作类型错误')
    assert(id && /^[0-9a-fA-F]{24}$/.test(id), 422, '文章ID格式错误')

    const article = await Article.findById(id)
    assert(article, 422, '文章不存在')

    // 查询已有记录
    const existing = await ArticleLike.findOne({ user: userId, article: id })

    let userReaction
    let likeDelta = 0
    let dislikeDelta = 0

    if (existing) {
      if (existing.type === type) {
        // ② 同类型 → 取消（删除记录，计数 -1）
        await ArticleLike.deleteOne({ _id: existing._id })
        if (type === 'like') likeDelta = -1
        else dislikeDelta = -1
        userReaction = 'none'
      } else {
        // ③ 不同类型 → 切换（更新记录，两计数分别 ±1）
        existing.type = type
        existing.date = new Date()
        await existing.save()
        if (type === 'like') { likeDelta = 1; dislikeDelta = -1 }
        else { likeDelta = -1; dislikeDelta = 1 }
        userReaction = type === 'like' ? 'liked' : 'disliked'
      }
    } else {
      // ① 无记录 → 新建
      await ArticleLike.create({ user: userId, article: id, type })
      if (type === 'like') likeDelta = 1
      else dislikeDelta = 1
      userReaction = type === 'like' ? 'liked' : 'disliked'
    }

    // 更新 Article 计数
    const update = {}
    if (likeDelta !== 0) update.likeNum = (article.likeNum || 0) + likeDelta
    if (dislikeDelta !== 0) update.dislikeNum = (article.dislikeNum || 0) + dislikeDelta
    if (Object.keys(update).length) {
      await Article.findByIdAndUpdate(id, { $set: update })
    }

    res.send({
      message: 'ok',
      data: {
        likeNum: (article.likeNum || 0) + likeDelta,
        dislikeNum: (article.dislikeNum || 0) + dislikeDelta,
        userReaction,
      }
    })
  } catch (err) {
    next(err.status ? err : createError(422, '操作失败'))
  }
})

module.exports = router
