/**
 * AdminLog —— 管理操作审计
 * =========================================================================
 * 谁、对谁、做了什么、什么时候。只记录「管理端动作」：
 *   内容删除（管理员删他人内容）、禁言/解禁、封禁/解封、角色变更、注销账号。
 *
 * 为什么要有：管理员能删别人的文章、能封人，出问题时必须能追到人和时间；
 * 也是「操作记录」页面的唯一数据源。
 */
const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  actor: { type: mongoose.SchemaTypes.ObjectId, ref: 'User', required: true, index: true },
  actorName: { type: String, default: '' },
  // 动作：article.delete / comment.delete / wall.delete /
  //       user.mute / user.unmute / user.ban / user.unban /
  //       user.role / user.password / user.delete
  action: { type: String, required: true, index: true },
  targetType: { type: String, enum: ['article', 'comment', 'wall', 'user'], required: true },
  targetId: { type: mongoose.SchemaTypes.ObjectId, required: true, index: true },
  targetName: { type: String, default: '' },
  detail: { type: String, default: '' },
  ip: { type: String, default: '' },
  createdAt: { type: mongoose.SchemaTypes.Date, default: Date.now, index: true }
})

module.exports = mongoose.model('AdminLog', schema)
