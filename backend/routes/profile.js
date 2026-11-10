/**
 * profile.js — 用户个人资料路由
 *
 * 路由清单：
 *   GET  /api/profile          — 取**当前登录用户**自己的完整资料（需登录）
 *   PUT  /api/profile          — 更新当前登录用户资料（含改密 + 旧密码校验）
 *   GET  /api/profile/:userId  — 取**某个用户**的公开资料（**游客可读**，他人主页用）
 *
 * ⚠ 前两条不在 JWT 白名单里，由 express-jwt 自动校验；
 *   第三条已在 app.js 的 .unless() 里放行 GET —— 见下面那段注释。
 */
const express = require('express')
const router = express.Router()
const createError = require('http-errors')
const User = require('../models/User')
const assert = require('http-assert')
const { decryptSync } = require('../core/util/util.js')

const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

/**
 * 「他人主页」能拿到的公开字段白名单
 *
 * ⚠ 这份名单是**安全边界**，不是「顺手少传几个字段」：
 *   User 集合里的文档带 `email`（库里实测存在），而通用 CRUD 的
 *   `GET /api/rest/users/:id` 是白名单放行的公开读 —— 实测它**会把 email 一起吐出来**。
 *   他人主页不能走那条路，也不能 `select('-password')` 了事（漏不掉 email），
 *   所以这里改成**显式列举允许出去的字段**（正向白名单），以后 User 新增敏感字段也不会被带出去。
 */
const PUBLIC_FIELDS = '_id nickname username avatar bio socialLinks friendLinks'

// GET /api/profile — 获取当前用户完整资料
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.uid)
    assert(user, 404, '用户不存在')
    res.send(200, { data: user })
  } catch (err) {
    next(err)
  }
})

/**
 * GET /api/profile/:userId — 取某个用户的公开资料（他人主页用）
 *
 * 为什么单独开这一条，而不是让前端去打 `GET /api/rest/users/:id`：
 *   ① 那条是通用 CRUD，返回整个文档（含 email，见 PUBLIC_FIELDS 上的说明）；
 *   ② 这里的语义是「公开展示用的档案」，字段集应当是这个模块自己说了算，
 *      不该被 User 模型的字段增删牵着走。
 *
 * ⚠ 404 与 422 都要显式区分：前端拿 404 去兜底页，拿 422 只当参数错。
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    assert(OBJECT_ID_RE.test(userId), 422, '用户ID格式错误')

    const user = await User.findById(userId).select(PUBLIC_FIELDS).lean()
    assert(user, 404, '用户不存在')

    res.send({ message: 'ok', data: user })
  } catch (err) {
    next(err.status ? err : createError(422, '查询用户资料失败'))
  }
})

// PUT /api/profile — 更新当前用户资料（含密码修改 + 旧密码验证）
router.put('/', async (req, res, next) => {
  try {
    const { oldPassword, ...fields } = req.body
    const revisable = ['password', 'nickname', 'avatar', 'bio', 'banner', 'socialLinks', 'friendLinks']

    // 过滤可修改字段
    const updates = {}
    for (const key of revisable) {
      if (key in fields) updates[key] = fields[key]
    }
    assert(Object.keys(updates).length, 400, '没有有效修改字段')

    // 密码修改需验证旧密码
    if ('password' in updates) {
      assert(oldPassword, 422, '修改密码需要提供旧密码')
      const user = await User.findById(req.uid).select('+password')
      assert(user, 404, '用户不存在')
      const storedPlain = decryptSync(user.password)
      const oldPlain = decryptSync(oldPassword)
      assert.equal(oldPlain, storedPlain, 422, '旧密码错误')
      // 通过 save() 触发 setter → 解密→校验→加密管道
      Object.assign(user, updates)
      updates.date = new Date().toISOString()
      await user.save()
    } else {
      updates.date = new Date().toISOString()
      await User.findByIdAndUpdate(req.uid, updates)
    }

    res.send(200, { message: '修改成功' })
  } catch (err) {
    next(err)
  }
})

module.exports = router
module.exports.PUBLIC_FIELDS = PUBLIC_FIELDS
