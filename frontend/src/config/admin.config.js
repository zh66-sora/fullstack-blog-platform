/**
 * 管理端配置 — config 层
 * =========================================================================
 * 三个管理页（处罚管理 / 账号管理 / 操作记录）共用的文案与枚举都收在这里：
 *   角色、账号状态、封禁时长、操作类型的显示名。
 *
 * ⚠ 这里的取值必须与后端对齐，改任何一项都要两边一起改：
 *   角色      myapp/core/roles.js 的 LEVEL（owner / admin / user）
 *   状态      myapp/models/User.js 的 status enum（active / muted / banned / deleted）
 *   封禁时长  myapp/routes/admin.js 的 DEFAULT_BAN_DAYS(7) / MAX_BAN_DAYS(30)
 *   操作类型  myapp/models/AdminLog.js 注释里列的那串 action
 */

// 角色等级：与后端 LEVEL 同值，前端只用来决定按钮显隐（真正的判断在服务端）
export const ROLE_LEVEL = { user: 1, admin: 2, owner: 3 }

export const ROLE_LABEL = { owner: '站长', admin: '管理员', user: '普通用户' }

// 角色筛选下拉（处罚管理页的工具栏）
export const ROLE_OPTIONS = [
  { value: '', label: '全部角色' },
  { value: 'user', label: '普通用户' },
  { value: 'admin', label: '管理员' },
  { value: 'owner', label: '站长' }
]

export const STATUS_LABEL = {
  active: '正常',
  muted: '禁言',
  banned: '封禁',
  deleted: '已注销'
}

export const STATUS_OPTIONS = [
  { value: '', label: '全部状态' },
  { value: 'active', label: '正常' },
  { value: 'muted', label: '禁言' },
  { value: 'banned', label: '封禁' },
  { value: 'deleted', label: '已注销' }
]

/**
 * 封禁 / 禁言时长
 *   需求：默认一周，可选半个月、一个月，最多一个月
 *   7 / 15 / 30 天 —— 上限由后端再拦一道（MAX_BAN_DAYS）
 */
export const DURATION_OPTIONS = [
  { value: 7, label: '一周' },
  { value: 15, label: '半个月' },
  { value: 30, label: '一个月' }
]

export const DEFAULT_DURATION = 7

/**
 * 密码格式 —— 与后端 User 模型 setter 里的那条正则**逐字一致**，
 * 也与 config/validate.config.js 的登录/注册规则同源。
 * 前端先拦一道只是省一次往返，真正的校验在服务端。
 */
export const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d!.#*?&]{8,12}$/

/**
 * 操作记录的类型显示名
 *   action 的前缀就是 targetType，所以筛选下拉按「动作」分组列
 */
export const ACTION_LABEL = {
  'article.delete': '删除文章',
  'comment.delete': '删除评论',
  'wall.delete': '删除留言',
  'user.mute': '禁言用户',
  'user.unmute': '解除禁言',
  'user.ban': '封禁用户',
  'user.unban': '解除封禁',
  'user.role': '变更角色',
  'user.password': '重置密码',
  'user.delete': '注销账号'
}

export const ACTION_OPTIONS = [
  { value: '', label: '全部操作' },
  ...Object.entries(ACTION_LABEL).map(([value, label]) => ({ value, label }))
]

/** 兜底：后端以后加了新 action，前端没同步时至少别显示成空白 */
export function actionLabel(action) {
  return ACTION_LABEL[action] || action
}

/** 当前登录账号能不能管理目标账号（与服务端 canManage 同一条规则：等级严格大于） */
export function canManage(actorRole, targetRole) {
  return (ROLE_LEVEL[actorRole] || 1) > (ROLE_LEVEL[targetRole] || 1)
}

export default {
  ROLE_LEVEL,
  ROLE_LABEL,
  ROLE_OPTIONS,
  STATUS_LABEL,
  STATUS_OPTIONS,
  DURATION_OPTIONS,
  DEFAULT_DURATION,
  PASSWORD_RE,
  ACTION_LABEL,
  ACTION_OPTIONS,
  actionLabel,
  canManage
}
