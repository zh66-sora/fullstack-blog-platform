/**
 * Message 聊天室消息模型
 * =========================================================================
 * 职责：存储聊天室的公共频道消息（单频道设计，不做房间/私聊）
 *
 * 与 Comment 的差异：
 *   - 没有 parentComment / replyTo：聊天室不做楼中楼，@ 只是正文的一部分
 *   - 没有 likeNum / dislikeNum / image：需求里只要求纯文本消息
 *   - 多了 date 单字段索引：聊天室只展示「最近一个月」，且上滑按 _id 倒序翻页
 *
 * 索引设计：
 *   { date: -1 } → 覆盖「取最近一个月」的范围扫描（date: { $gte: since }）
 *   翻页游标用 _id（ObjectId 自带时间序），与 date 单调一致，无需额外索引
 *
 * ⚠ 系统提示（xx 加入了聊天室 / xx 离开了聊天室）**不落库**：
 *   否则上滑一个月历史会全是进出记录，聊天内容被淹没。
 *   它们是纯实时的，由 core/chatSocket.js 直接广播。
 */
const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  // ========== 必填字段 ==========
  content: { // 消息正文（纯文本，长度上限在 chatSocket 里校验）
    type: String,
    required: [true, '消息内容必填']
  },
  // ========== 关联字段 ==========
  author: { // 发送者
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'User',
    required: [true, '发送者必填']
  },
  // ========== 元信息 ==========
  date: { // 发送时间（也是「最近一个月」的筛选依据）
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  }
})

schema.index({ date: -1 })

module.exports = mongoose.model('Message', schema)
