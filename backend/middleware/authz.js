/**
 * authz —— 权限判断中间件（唯一出口）
 * =========================================================================
 * 所有「能不能做」的判断都收在这里，路由里不再散写 if：
 *   requireManager  至少管理员（admin / owner）
 *   requireOwner    仅站长
 *   assertWritable  禁言/封禁用户不能写入（评论、留言、聊天、发文）
 *   assertCanManage 角色等级严格大于目标（管理员只能动普通用户）
 *
 * req.actor 由 app.js 的 express-jwt isRevoked 注入：{ id, role, status }
 * （角色不放 token，降级立即生效）
 */
const assert = require('http-assert')
const { canManage, effectiveStatus, isManager } = require('../core/roles')

function currentActor(req) {
  assert(req.actor, 401, '请先登录')
  return req.actor
}

function requireManager(req, res, next) {
  try {
    const actor = currentActor(req)
    assert(isManager(actor.role), 403, '需要管理员权限')
    assert(actor.status === 'active', 403, '账号状态异常，无法使用管理功能')
    next()
  } catch (err) {
    next(err)
  }
}

function requireOwner(req, res, next) {
  try {
    const actor = currentActor(req)
    assert(actor.role === 'owner', 403, '只有站长可以执行该操作')
    assert(actor.status === 'active', 403, '账号状态异常，无法使用管理功能')
    next()
  } catch (err) {
    next(err)
  }
}

/** 写入闸门：禁言 / 封禁 / 注销都不允许发内容 */
function assertWritable(req, action = '发言') {
  const actor = currentActor(req)
  const status = effectiveStatus({ status: actor.status })
  if (status === 'active') return
  if (status === 'banned') assert(false, 403, '账号已被封禁，无法' + action)
  if (status === 'deleted') assert(false, 403, '账号已注销')
  assert(false, 403, '你已被禁言，无法' + action)
}

/** 管理员只能操作等级比自己低的人（普通用户） */
function assertCanManage(actor, targetRole) {
  assert(actor, 401, '请先登录')
  assert(
    canManage(actor.role, targetRole || 'user'),
    403,
    '不能操作同级或更高级别的账号（管理员只能操作普通用户）'
  )
}

module.exports = { currentActor, requireManager, requireOwner, assertWritable, assertCanManage }
