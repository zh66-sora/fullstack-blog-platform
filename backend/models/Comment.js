/**
 * Comment 评论模型
 * =========================================================================
 * 职责：存储文章评论数据，支持两级嵌套（顶层评论 + 嵌套回复）
 *
 * 嵌套评论设计：
 *   - parentComment = null     → 顶层评论（直接挂在文章下）
 *   - parentComment = ObjectId → 该评论的嵌套回复（至多两级）
 *   - replyTo = UserId         → 回复目标用户（前端显示"回复 @username"标签用）
 *
 * 为什么不支持多级嵌套（三层及以上）？
 *   - 避免无限递归的查询复杂度，两级嵌套在 UI 上可折叠展示，体验足够
 *   - 嵌套评论在查询时通过 parentComment 字段统一查找，而非递归遍历
 *
 * 索引设计说明：
 *   复合索引 { article: 1, parentComment: 1, likeNum: -1 }
 *     → 覆盖"按文章查顶层评论并按点赞数排序"的业务场景
 *   复合索引 { article: 1, parentComment: 1, commentTime: -1 }
 *     → 覆盖"按文章查顶层评论并按时间排序"的业务场景
 *   两索引的前缀相同（article + parentComment），MongoDB 可复用索引前缀，
 *   将排序字段作为第三项分别建索引，避免为每个排序方向单独建索引的存储开销
 */
const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  // ========== 必填字段 ==========
  content: { // 评论内容
    type: String,
    required: [true, '评论内容必填']
  },
  // ========== 业务元数据 ==========
  commentTime: { // 评论时间
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  },
  date: { // 最后编辑日期
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  },
  // ========== 关联字段 ==========
  author: { // 作者ID
    type: mongoose.SchemaTypes.ObjectId,
    ref: "User"
  },
  article: { // 评论文章ID
    type: mongoose.SchemaTypes.ObjectId,
    ref: "Article"
  },
  // ========== 嵌套评论 ==========
  parentComment: { // 所属顶层评论（null = 顶层评论本身）
    type: mongoose.SchemaTypes.ObjectId,
    ref: "Comment",
    default: null
  },
  replyTo: { // 回复的目标用户（用于生成"回复 @用户"标签）
    type: mongoose.SchemaTypes.ObjectId,
    ref: "User",
    default: null
  },
  // ========== 互动 ==========
  likeNum: { // 点赞数
    type: Number,
    default: 0
  },
  dislikeNum: { // 点踩数
    type: Number,
    default: 0
  },
  // ========== 内容扩展 ==========
  image: { // 评论配图（至多一张）
    type: String,
    default: ''
  },
  // ========== 元信息 ==========
  ipLocation: { // IP属地
    type: String,
    default: ''
  }
})

// ========== 复合索引 ==========
// 1. 按文章查顶级评论 + 按赞数排序嵌套回复
// 场景：文章评论区首页 → 展示顶层评论，其下按赞数展示至多 2 条回复
schema.index({ article: 1, parentComment: 1, likeNum: -1 })
// 2. 按文章查顶级评论 + 按时间排序
// 场景：文章评论区按时间线浏览
schema.index({ article: 1, parentComment: 1, commentTime: -1 })

module.exports = mongoose.model('Comment', schema)