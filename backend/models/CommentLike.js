/**
 * CommentLike 评论赞/踩记录模型
 * =========================================================================
 * 职责：记录用户对评论的点赞或点踩操作，用于去重和状态切换（toggle）
 *
 * 设计原理：
 *   每条记录存储 (user + comment + type) 三元组
 *   type 枚举 'like' / 'dislike'，没有记录表示未操作
 *
 * 为什么单独建表而不在 Comment 内嵌数组？
 *   - 内嵌数组会随评论文档一起加载，增加传输体积
 *   - 每次点赞需要遍历数组判断是否存在，写入时 MongoDB 需要移动整个文档
 *   - 单独建表配合 unique 联合索引，查询和 toggle 更高效
 *
 * 联合唯一索引 { user: 1, comment: 1 } 的作用：
 *   ① 防止同一用户对同一评论重复点赞（幂等性）
 *   ② toggle 逻辑的依据：存在记录 → 取消或切换；不存在 → 新建
 */
const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  user: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: "User",
    required: true
  },
  comment: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: "Comment",
    required: true
  },
  type: {
    type: String,
    enum: ['like', 'dislike'],
    required: true
  },
  date: {
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  }
})

// 同一用户对同一评论只有一条记录
// 联合唯一索引确保 (user, comment) 不重复，实现「一人一票」
schema.index({ user: 1, comment: 1 }, { unique: true })

module.exports = mongoose.model('CommentLike', schema)
