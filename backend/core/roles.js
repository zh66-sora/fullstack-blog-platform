/**
 * 角色与账号状态 —— 纯函数
 * =========================================================================
 * 三级角色 owner(站长) > admin(管理员) > user(普通用户)，站长唯一。
 *
 * 唯一的权限规则：
 *   能操作某个人（或其内容） ⇔ actor.level > target.level
 * 所以：管理员只能动普通用户；站长能动管理员，但动不了自己（同级不满足 >）。
 *
 * 账号级操作（删号 / 改用户名密码 / 任命管理员）不看 level，只认 owner，
 * 由 routes/admin.js 单独判断。
 */

const LEVEL = { user: 1, admin: 2, owner: 3 }

function levelOf(role) {
  return LEVEL[role] || LEVEL.user
}

/**
 * 账号的有效状态
 * muted / banned 带 statusUntil 时，过期即视为 active（惰性判断，不跑定时任务）
 */
function effectiveStatus(user) {
  if (!user) return 'deleted'
  const status = user.status || 'active'
  if (status !== 'muted' && status !== 'banned') return status
  if (!user.statusUntil) return status
  return new Date(user.statusUntil).getTime() <= Date.now() ? 'active' : status
}

/** 能不能管理目标角色（严格大于） */
function canManage(actorRole, targetRole) {
  return levelOf(actorRole) > levelOf(targetRole)
}

/** 是否属于管理端（能进管理导航） */
function isManager(role) {
  return role === 'admin' || role === 'owner'
}

/** 禁言/封禁是否允许写入（评论、留言、聊天、发文） */
function canWrite(user) {
  const status = effectiveStatus(user)
  return status === 'active'
}

module.exports = { LEVEL, levelOf, effectiveStatus, canManage, isManager, canWrite }
