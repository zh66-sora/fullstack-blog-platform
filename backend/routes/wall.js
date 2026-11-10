/**
 * 留言墙专用路由
 * =========================================================================
 * 职责：留言板上的「留言 / 回复 / 删除」
 *
 * 为什么不放进通用 CRUD（bus.js）？
 *   bus.js 的 DELETE 没有归属校验（谁都能删），POST 也没有模型白名单；
 *   而留言墙的两条核心规则恰好都是权限规则：
 *     ① 谁能删  —— 只有板主和这条留言的作者
 *     ② 谁能回  —— 只有板主和这条留言的作者（第三人不能在别人的留言下插话）
 *   所以它跟评论一样走专用路由，规则写在一处。
 *
 * 路由清单：
 *   GET    /api/wall/:userId              — 某块板的留言（分页，每条附全部回复）
 *   POST   /api/wall                      — 留言 / 回复（需登录，正文 ≤ 30 字，不带图）
 *   DELETE /api/wall/:id                  — 删除（需登录；删留言时回复一起删）
 */
const express = require('express')
const router = express.Router()
const createError = require('http-errors')
const assert = require('http-assert')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const WallMessage = require('../models/WallMessage')
const User = require('../models/User')
const AdminLog = require('../models/AdminLog')
const { assertWritable } = require('../middleware/authz')
const { canManage } = require('../core/roles')

const { MAX_LEN } = WallMessage
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

/**
 * 取当前登录者 uid
 *
 * ⚠ 不能只读 req.uid：GET 这条进了 JWT 白名单（游客也能看留言板），
 *   express-jwt 对白名单路径**整个跳过**，req.uid 根本不会被赋值 ——
 *   于是带 token 的访问者也算不出 canDelete / canReply，权限位恒为 false。
 *   所以白名单路径上自己解一次：解不出来就是游客，按游客处理（不报错）。
 */
const publicKey = fs.readFileSync('./auth/public.pem', 'utf8')
function currentUid(req) {
  if (req.uid) return String(req.uid)
  let token = ''
  const auth = req.headers.authorization
  if (auth && auth.split(' ')[0] === 'Bearer') token = auth.split(' ')[1]
  else if (req.query && req.query.token) token = req.query.token
  if (!token) return null
  try {
    const payload = jwt.verify(token, publicKey, { algorithms: ['RS256'] })
    return payload?.uid ? String(payload.uid) : null
  } catch {
    return null
  }
}

// populate 的字段必须带 nickname：前端展示名取「nickname 优先、回退 username」
// role 带出来是为了「管理员 / 站长能不能删这条」—— 与文章、评论同一套等级规则
const POP_AUTHOR = { path: 'author', select: 'avatar username nickname role' }
const POP_REPLY_TO = { path: 'replyTo', select: 'avatar username nickname role' }

/** 计数用码点：emoji 是代理对，.length 会把一个表情算成两个字 */
const len = (s) => [...(s || '')].length

/** 删权限：板主 或 这条留言的作者 */
const canDelete = (doc, uid) =>
  !!uid && (String(doc.wall) === String(uid) || String(doc.author) === String(uid))

/**
 * 取当前登录者的角色
 *
 * ⚠ GET /api/wall/:userId 在 JWT 白名单里（游客可看），`req.actor` 是空的，
 *   只能按 uid 自己再查一次。每条留言都查会很蠢，所以调用方在请求入口查一次往下传。
 *   用途只有一个：判断「管理员 / 站长能不能删这条别人的留言」。
 */
async function currentActorRole(uid) {
  if (!uid) return null
  const me = await User.findById(uid).select('role').lean()
  return me ? (me.role || 'user') : null
}

/** 管理端删留言：等级严格高于留言作者（板主 / 作者本人不算管理端，走 canDelete） */
function canModerate(actorRole, authorRole) {
  if (!actorRole || (actorRole !== 'admin' && actorRole !== 'owner')) return false
  return canManage(actorRole, authorRole || 'user')
}

/**
 * GET /api/wall/:userId
 * 取某块板上的留言（分页），每条附它的全部回复
 * Query: ?page=1&size=10
 *
 * ⚠ 回复不单独分页：能在这条留言下说话的只有板主和作者两个人，量级很小，
 *   一次性带出来比「点开查看更多」省事。真出现长对话再拆。
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    const page = parseInt(req.query.page) || 1
    const size = parseInt(req.query.size) || 10

    assert(OBJECT_ID_RE.test(userId), 422, '用户ID格式错误')

    const uid = currentUid(req)
    const actorRole = await currentActorRole(uid)
    const query = { wall: userId, parentMessage: null }
    const total = await WallMessage.countDocuments(query)

    const topMessages = await WallMessage.find(query)
      .sort({ createTime: -1 })
      .skip((page - 1) * size)
      .limit(size)
      .populate(POP_AUTHOR)
      .lean()

    const list = await Promise.all(
      topMessages.map(async (m) => {
        const replies = await WallMessage.find({ parentMessage: m._id })
          .sort({ createTime: 1 })
          .populate(POP_AUTHOR)
          .populate(POP_REPLY_TO)
          .lean()

        return {
          ...m,
          replies,
          replyCount: replies.length,
          // 带 token 进来才算得出权限位；游客一律 false（前端此时也不给按钮）
          // 三段：板主 / 我发的 / 我是管理端且对方等级更低
          canDelete: canDelete(m, uid) || canModerate(actorRole, m.author?.role),
          // 能不能在这条留言下接话：板主 或 这条留言的作者
          canReply:
            !!uid && (String(userId) === uid || String(m.author) === uid),
          replies: replies.map((r) => ({
            ...r,
            canDelete: canDelete(r, uid) || canModerate(actorRole, r.author?.role),
          })),
        }
      })
    )

    const pages = Math.ceil(total / size)

    res.send({
      message: 'ok',
      data: { list, page, size, total, pages, hasMore: page < pages },
    })
  } catch (err) {
    next(err.status ? err : createError(422, '查询留言失败'))
  }
})

/**
 * POST /api/wall
 * 留言 / 回复（需登录）
 * Body: { wall, content, parentMessage?, replyTo? }
 *
 * 校验顺序（先 cheap 后 expensive）：
 *   ① 登录 → ② 板主存在 → ③ 正文非空且 ≤ 30 字 → ④ 回复时校验父留言 + 回复权限
 * ⚠ 回复权限是这条业务的核心：第三人不能在别人的留言下插话。
 *   顶层留言不设限 —— 谁都能在别人的板上留一句。
 */
router.post('/', async (req, res, next) => {
  try {
    const uid = req.uid
    const { wall, content } = req.body
    const { parentMessage } = req.body

    assert(uid, 422, '请先登录')
    // 禁言 / 封禁用户不能留言
    assertWritable(req, '留言')
    assert(OBJECT_ID_RE.test(wall), 422, '留言板ID格式错误')
    assert(content && content.trim(), 422, '留言内容不能为空')
    assert(len(content) <= MAX_LEN, 422, `留言最多 ${MAX_LEN} 个字`)

    // 回复：继承板主、校验权限、默认回复父留言的作者
    let inherit = {}
    if (parentMessage) {
      assert(OBJECT_ID_RE.test(parentMessage), 422, '留言ID格式错误')
      const parent = await WallMessage.findById(parentMessage)
      assert(parent, 422, '留言不存在')

      const isWallOwner = String(parent.wall) === String(uid)
      const isMessageAuthor = String(parent.author) === String(uid)
      assert(isWallOwner || isMessageAuthor, 422, '只有板主和留言作者可以互相回复')

      inherit = {
        parentMessage: parent._id,
        // 没指定 replyTo 就默认回父留言的作者（与 bus.js 里评论的处理一致）
        replyTo: req.body.replyTo || parent.author,
      }
    }

    const created = await WallMessage.create({
      wall,
      author: uid,
      content: content.trim(),
      ...inherit,
    })

    // 返回完整文档（含 populate 的 author），前端直接过一遍视图模型即可，
    // 不必像评论区那样「拿 _id 自己补一条」
    const doc = await WallMessage.findById(created._id)
      .populate(POP_AUTHOR)
      .populate(POP_REPLY_TO)
      .lean()

    res.send({ message: 'ok', data: doc })
  } catch (err) {
    next(err.status ? err : createError(422, '留言失败'))
  }
})

/**
 * DELETE /api/wall/:id
 * 删除留言或回复（需登录）
 *
 * 权限：板主 或 这条留言的作者。
 * ⚠ 删顶层留言时**级联删掉它的回复**：回复脱离了父留言就没有落点，
 *   留在库里只会变成永远查不到的孤儿数据（量级很小，级联的代价可以忽略）。
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const uid = req.uid
    const { id } = req.params

    assert(uid, 422, '请先登录')
    assert(OBJECT_ID_RE.test(id), 422, '留言ID格式错误')

    const doc = await WallMessage.findById(id)
    assert(doc, 422, '留言不存在')

    const isAuthorOrOwner = canDelete(doc, uid)
    // 管理员 / 站长可以删等级更低者的留言（与文章、评论同一套规则）
    let byModeration = false
    if (!isAuthorOrOwner && req.actor && ['admin', 'owner'].includes(req.actor.role)) {
      const author = await User.findById(doc.author).select('role').lean()
      byModeration = !!author && canManage(req.actor.role, author.role || 'user')
    }
    assert(isAuthorOrOwner || byModeration, 422, '只有板主和留言作者可以删除')

    await WallMessage.findByIdAndDelete(id)
    // 顶层留言：顺带清掉挂在它下面的回复
    if (!doc.parentMessage) {
      await WallMessage.deleteMany({ parentMessage: id })
    }

    if (byModeration) {
      await AdminLog.create({
        actor: uid,
        actorName: req.actor.name || '',
        action: 'wall.delete',
        targetType: 'wall',
        targetId: doc._id,
        targetName: String(doc.content || '').slice(0, 30),
        detail: `${req.actor.role === 'owner' ? '站长' : '管理员'}删除他人留言`,
        ip: req.ip || ''
      })
    }

    res.send({ message: 'ok', data: { id } })
  } catch (err) {
    next(err.status ? err : createError(422, '删除留言失败'))
  }
})

module.exports = router
