/**
 * ArticleLike 文章点赞/点踩记录模型
 * =========================================================================
 * 职责：记录用户对文章的赞/踩行为，支持 toggle 操作
 *
 * 设计对照 CommentLike：
 *   - user + article 复合唯一索引，保证同一用户对同一文章只有一条记录
 *   - type 字段：'like' | 'dislike'
 *   - 独立的记录表，便于查询用户对文章的互动状态
 *
 * 为什么不把赞/踩计数直接嵌入 User 或 Article？
 *   - 点赞/点踩是轻量交互，频繁更新主文档会导致碎片化
 *   - 独立表支持高效查询"用户是否已点赞某文章"
 *   - 复合唯一索引天然防止重复操作
 */
const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  user: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
  },
  article: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'Article',
    required: true,
  },
  type: {
    type: String,
    enum: ['like', 'dislike'],
    required: true,
  },
  date: {
    type: mongoose.SchemaTypes.Date,
    default: Date.now,
  },
})

// 复合唯一索引：同一用户对同一文章只有一条记录
schema.index({ user: 1, article: 1 }, { unique: true })

module.exports = mongoose.model('ArticleLike', schema)
