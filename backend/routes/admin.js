/**
 * admin.js — 管理端接口
 * =========================================================================
 * 权限模型（唯一规则）：actor.level > target.level
 *   owner(3) > admin(2) > user(1)
 *   · 管理员只能操作普通用户；站长能操作管理员，但动不了自己（同级不满足 >）
 *   · 账号级操作（改角色 / 注销账号）只认 owner
 *
 * 路由：
 *   GET    /api/admin/users              用户列表（admin+）
 *   PATCH  /api/admin/users/:id/status   禁言 / 封禁 / 解禁（admin+）
 *   PATCH  /api/admin/users/:id/role     任命 / 撤销管理员（owner）
 *   PATCH  /api/admin/users/:id/password 重置他人登录密码（owner）
 *   DELETE /api/admin/users/:id          注销账号（owner，软删）
 *   GET    /api/admin/logs               最近操作记录（admin+）
 *
 * ⚠ 所有「账号级」写入都不经过通用 CRUD：routes/bus.js 已经禁止删除 User，
 *   注册接口也只接受 username/password/nickname，role 无法从客户端写进来。
 */
const express = require('express')
const router = express.Router()
const assert = require('http-assert')
const User = require('../models/User')
const AdminLog = require('../models/AdminLog')
const { requireManager, requireOwner, assertCanManage } = require('../middleware/authz')
const { effectiveStatus } = require('../core/roles')

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
const MAX_BAN_DAYS = 30
const DEFAULT_BAN_DAYS = 7

// 整个管理端至少管理员（具体到 owner 的操作在各路由上再拦一道）
router.use(requireManager)

// 只对外暴露必要字段：password 默认 select:false，这里再显式挑一遍防止以后加敏感字段
const USER_FIELDS = 'username nickname avatar role status statusUntil statusAt +statusReason date'

function assertUserId(id) {
  assert(OBJECT_ID_RE.test(String(id)), 422, '用户ID格式错误')
}

async function writeLog(req, { action, targetType, targetId, targetName, detail }) {
  try {
    await AdminLog.create({
      actor: req.actor.id,
      actorName: req.actor.name || '',
      action,
      targetType,
      targetId,
      targetName: targetName || '',
      detail: detail || '',
      ip: req.ip || ''
    })
  } catch (err) {
    // 审计失败不影响主操作
    console.warn('[admin] 操作日志写入失败:', err.message)
  }
}

/** 取出目标用户并校验「等级严格更低」，同时禁止操作自己 */
async function loadManageableTarget(req) {
  const { id } = req.params
  assertUserId(id)
  assert(String(id) !== String(req.actor.id), 403, '不能操作自己')

  const target = await User.findById(id).select(USER_FIELDS)
  assert(target, 404, '用户不存在')
  assertCanManage(req.actor, target.role || 'user')
  return target
}

// ===== 用户列表 =====
router.get('/users', async (req, res, next) => {
  try {
    const { keyword = '', role = '', status = '', page = 1, size = 20 } = req.query
    const query = {}

    if (keyword.trim()) {
      const reg = new RegExp(keyword.trim(), 'i')
      query.$or = [{ username: reg }, { nickname: reg }]
    }
    if (role) query.role = role
    if (status) query.status = status

    const pageNum = Math.max(1, Number(page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(size) || 20))

    const [list, total] = await Promise.all([
      User.find(query)
        .select(USER_FIELDS)
        .sort({ date: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      User.countDocuments(query)
    ])

    res.send({
      message: 'ok',
      data: {
        list: list.map((u) => ({
          ...u,
          role: u.role || 'user',
          // 到期后按 active 展示（惰性过期，不改库）
          effectiveStatus: effectiveStatus(u)
        })),
        total,
        page: pageNum,
        size: pageSize,
        // 前端据此决定按钮显隐；真正的判断在服务端
        actor: { id: req.actor.id, role: req.actor.role }
      }
    })
  } catch (err) {
    next(err)
  }
})

// ===== 禁言 / 封禁 / 解禁 =====
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    const { status, days, reason = '' } = req.body
    assert(['active', 'muted', 'banned'].includes(status), 422, '状态只能是 active/muted/banned')

    const target = await loadManageableTarget(req)
    const before = effectiveStatus(target)

    if (status === 'active') {
      target.status = 'active'
      target.statusUntil = null
      target.statusReason = ''
    } else {
      // 默认一周，最长一个月
      const span = Math.min(MAX_BAN_DAYS, Math.max(1, Number(days) || DEFAULT_BAN_DAYS))
      target.status = status
      target.statusUntil = new Date(Date.now() + span * 24 * 3600 * 1000)
      target.statusReason = String(reason).slice(0, 100)
    }
    target.statusBy = req.actor.id
    target.statusAt = new Date()
    await target.save()

    const actionMap = {
      muted: 'user.mute',
      banned: 'user.ban',
      active: before === 'banned' ? 'user.unban' : 'user.unmute'
    }
    await writeLog(req, {
      action: actionMap[status],
      targetType: 'user',
      targetId: target._id,
      targetName: target.username,
      detail: status === 'active'
        ? '解除限制'
        : `${status === 'muted' ? '禁言' : '封禁'}至 ${target.statusUntil.toISOString().slice(0, 10)}${reason ? '（' + reason + '）' : ''}`
    })

    res.send({
      message: status === 'active' ? '已解除限制' : (status === 'muted' ? '已禁言' : '已封禁'),
      data: {
        _id: target._id,
        username: target.username,
        role: target.role,
        status: target.status,
        statusUntil: target.statusUntil,
        effectiveStatus: effectiveStatus(target)
      }
    })
  } catch (err) {
    next(err)
  }
})

// ===== 任命 / 撤销管理员（仅站长） =====
router.patch('/users/:id/role', requireOwner, async (req, res, next) => {
  try {
    const { role } = req.body
    assert(['admin', 'user'].includes(role), 422, '只能设为 admin 或 user')

    const { id } = req.params
    assertUserId(id)
    assert(String(id) !== String(req.actor.id), 403, '不能修改自己的角色')

    const target = await User.findById(id).select(USER_FIELDS)
    assert(target, 404, '用户不存在')
    assert((target.role || 'user') !== 'owner', 403, '不能修改站长的角色')

    const before = target.role || 'user'
    target.role = role
    await target.save()

    await writeLog(req, {
      action: 'user.role',
      targetType: 'user',
      targetId: target._id,
      targetName: target.username,
      detail: `${before} → ${role}`
    })

    res.send({ message: role === 'admin' ? '已任命为管理员' : '已撤销管理员', data: { _id: target._id, role } })
  } catch (err) {
    next(err)
  }
})

// ===== 重置他人密码（仅站长） =====
/**
 * 站长可以给「任何人（除站长自己）」重置登录密码 —— 属于账号级操作，不看等级差。
 * 自己的密码走个人中心（要验旧密码，见 bus.js 的 PUT /api/rest/users/:id）：
 * 管理端这条**不需要旧密码**，所以只能由站长用，且不允许改自己。
 *
 * 密码在 User 的 setter 里完成「RSA 解密 → 校验格式 → 加密存储」，
 * 所以这里直接把前端传来的密文赋进去、save() 就够了，不要自己 decrypt。
 */
router.patch('/users/:id/password', requireOwner, async (req, res, next) => {
  try {
    const { password } = req.body
    assert(password, 422, '新密码必填')

    const { id } = req.params
    assertUserId(id)
    assert(String(id) !== String(req.actor.id), 403, '自己的密码请到个人中心修改')

    const target = await User.findById(id).select('username role status')
    assert(target, 404, '用户不存在')
    assert((target.role || 'user') !== 'owner', 403, '不能修改站长的密码')

    // 赋值即触发 setter（解密 / 校验 / 加密）；格式不合规会在 save 时抛校验错误
    target.password = password
    await target.save()

    await writeLog(req, {
      action: 'user.password',
      targetType: 'user',
      targetId: target._id,
      targetName: target.username,
      detail: '重置登录密码'
    })

    res.send({ message: '密码已重置', data: { _id: target._id } })
  } catch (err) {
    next(err)
  }
})

// ===== 注销账号（仅站长，软删） =====
router.delete('/users/:id', requireOwner, async (req, res, next) => {
  try {
    const { id } = req.params
    assertUserId(id)
    assert(String(id) !== String(req.actor.id), 403, '不能注销自己的账号')

    const target = await User.findById(id).select(USER_FIELDS)
    assert(target, 404, '用户不存在')
    assert((target.role || 'user') !== 'owner', 403, '不能注销站长账号')

    // 软删：只改状态，文章/评论/留言都留着（作者信息还在，不会出现空洞）
    target.status = 'deleted'
    target.statusUntil = null
    target.statusReason = String(req.body.reason || '').slice(0, 100)
    target.statusBy = req.actor.id
    target.statusAt = new Date()
    await target.save()

    await writeLog(req, {
      action: 'user.delete',
      targetType: 'user',
      targetId: target._id,
      targetName: target.username,
      detail: '账号已注销（内容保留）'
    })

    res.send({ message: '账号已注销', data: { _id: target._id, status: 'deleted' } })
  } catch (err) {
    next(err)
  }
})

// ===== 最近操作记录（管理员 + 站长都能看） =====
router.get('/logs', async (req, res, next) => {
  try {
    const pageNum = Math.max(1, Number(req.query.page) || 1)
    const pageSize = Math.min(100, Math.max(1, Number(req.query.size) || 30))

    // 可选筛选：action（如 user.ban）/ targetType（article/comment/wall/user）
    const query = {}
    if (req.query.action) query.action = String(req.query.action)
    if (req.query.targetType) query.targetType = String(req.query.targetType)

    const [list, total] = await Promise.all([
      AdminLog.find(query)
        .sort({ createdAt: -1 })
        .skip((pageNum - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      AdminLog.countDocuments(query)
    ])

    res.send({ message: 'ok', data: { list, total, page: pageNum, size: pageSize } })
  } catch (err) {
    next(err)
  }
})

module.exports = router
