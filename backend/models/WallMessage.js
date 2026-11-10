/**
 * WallMessage 留言墙模型
 * =========================================================================
 * 职责：存储「留言板」上的留言与回复（每个用户一块板）
 *
 * 为什么新建一张表，而不是复用 Comment 或 Message？
 *   · Comment：plugins/VALIDATE_MAP.js 里硬断言「评论必须关联文章」，
 *     留言挂在用户上、没有 article，走不通；而且留言不带图、不点赞踩，
 *     硬塞进 Comment 会给评论区带进一堆用不上的字段与分支。
 *   · Message：被 core/chatSocket.js 独占（聊天室公共大厅），
 *     没有 board / parentMessage / replyTo，也没有「谁可以删」的依据。
 *
 * 两级结构与 Comment 同构（至多两级，不做递归）：
 *   parentMessage = null     → 板上的一条留言
 *   parentMessage = ObjectId → 这条留言下的回复
 *   replyTo = UserId         → 回复的具体对象（前端显示「回复 @xxx」）
 *
 * ⚠ wall 是「板主」，author 是「写字的人」——两者都必填：
 *     删权限要拿 wall 判板主、拿 author 判作者；
 *     回复权限要判「当前用户是不是板主，或是不是这条留言的作者」。
 */
const mongoose = require('mongoose')

// 留言正文字数上限（与前端输入框的计数器同一口径）
// ⚠ 用「码点」计数（[...str].length）：emoji 是代理对，用 .length 会把一个表情算成 2 个字
const MAX_LEN = 30

const schema = new mongoose.Schema({
  content: { // 留言正文
    type: String,
    required: [true, '留言内容必填'],
    validate: {
      validator(v) {
        return [...(v || '')].length <= MAX_LEN
      },
      message: `留言最多 ${MAX_LEN} 个字`,
    },
  },
  // ========== 关联字段 ==========
  wall: { // 留言板主人（哪块板）
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'User',
    required: [true, '留言必须归属到某块留言板'],
  },
  author: { // 留言者
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'User',
  },
  // ========== 两级 ==========
  parentMessage: { // 所属留言（null = 板上的一条留言本身）
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'WallMessage',
    default: null,
  },
  replyTo: { // 回复的目标用户
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'User',
    default: null,
  },
  // ========== 时间 ==========
  createTime: {
    type: mongoose.SchemaTypes.Date,
    default: Date.now,
  },
  date: { // 最后编辑日期（与其余表保持一致）
    type: mongoose.SchemaTypes.Date,
    default: Date.now,
  },
})

// 复合索引：按板查留言 + 时间倒序；前缀相同，回复（parentMessage）也能复用
schema.index({ wall: 1, parentMessage: 1, createTime: -1 })

module.exports = mongoose.model('WallMessage', schema)
module.exports.MAX_LEN = MAX_LEN
