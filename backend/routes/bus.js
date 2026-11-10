/**
 * bus.js — 通用 CRUD 路由
 * =========================================================================
 * 职责：提供 RESTful 资源操作入口，所有通过 /api/rest/:resource 的请求
 *       都由此路由处理，根据 method 自动分发到 Create / Read / Update / Delete
 *
 * 架构说明：
 *   通过 resourceMiddleware（middleware/resource.js）将 URL 中的 :resource
 *   参数映射到对应的 Mongoose Model，挂载到 req.Model 上
 *   bus.js 的各 handler 通过 req.Model 统一操作，无需关心具体是哪个表
 *
 * 路由设计：
 *   POST   /api/rest/:resource        — 创建资源（含预处理、校验、后置操作）
 *   GET    /api/rest/:resource        — 查询资源列表（分页）
 *   GET    /api/rest/:resource/:id    — 查询资源详情（含 populate、viewNum+1）
 *   PUT    /api/rest/:resource/:id    — 更新资源（权限校验+字段过滤）
 *   DELETE /api/rest/:resource/:id    — 删除资源
 *
 * 扩展机制：
 *   各表差异化逻辑通过 plugins 目录下的映射表（POP_*_MAP / VALIDATE_MAP）配置化实现
 */
const express = require('express')
const router = express.Router()
const createError = require('http-errors')
const POPULATE_MAP = require('../plugins/POPULATE_MAP')
const POP_POST_MAP = require('../plugins/POP_POST_MAP')
const POP_GET_MAP = require('../plugins/POP_GET_MAP')
const POP_PUT_MAP = require('../plugins/POP_PUT_MAP')
const VALIDATE_MAP = require('../plugins/VALIDATE_MAP')
// 权限：禁言/封禁闸门、管理员管辖判断、操作审计
const { assertWritable } = require('../middleware/authz')
const { canManage } = require('../core/roles')
const AdminLog = require('../models/AdminLog')
// 注册模型（确保各 model 被 mongoose 加载，否则关联查询时找不到 ref）
const User = require('../models/User')
const Article = require('../models/Article')
const Column = require('../models/Column')
const Comment = require('../models/Comment')
// 断言
const assert = require('http-assert')
// 密码加解密（User 密码修改时验证旧密码）
const { decryptSync } = require('../core/util/util.js')
// 关联、分页函数
const { populate, pagination } = require('../core/util/util')

/*
  API 设计
    method  路由路径	               操作	        对应CRUD
    POST	  /api/rest/:resource	    创建资源	    Create
    GET	    /api/rest/:resource	    查询资源列表	 Read
    GET	    /api/rest/:resource/:id	查询资源详情	 Read
    PUT	    /api/rest/:resource/:id	更新资源	    Update
    DELETE	/api/rest/:resource/:id 删除资源      Delete

  - 进入不同的路由,对应mongoose的CURD操作
*/


// 创建资源
router.post('/', async (req, res, next) => {
  let newDoc = req.body
  try {
    const modelName = req.Model.modelName

    // 板块是固定字典（前端写死 9 个 _id），不允许通过通用 CRUD 创建
    assert(modelName !== 'Column', 403, '板块是固定字典，不能通过接口创建')
    // 禁言 / 封禁 / 注销用户不能发内容（文章、评论都走这条）
    assertWritable(req, '发布内容')

    // ===== ① 预处理：字符串字段转为 ObjectId（必须在关联字段校验之前） =====
    // 若 token 有效，将 author 设为当前登录用户（覆盖前端传值/schema默认值）
    // 安全考量：不允许前端指定 author 防止越权发表
    if (req.uid) {
      newDoc.author = req.uid
    }

    // category 处理：若已是合法 ObjectId 则直接校验存在性；否则按名称查 Column 表转为 _id
    // 兼容两种前端行为：新前端传 ObjectId，旧版前端传板块名称字符串
    if (newDoc.category && modelName === 'Article') {
      const Column = require('../models/Column')
      const mongoose = require('mongoose')
      // 判断是否为合法 MongoDB ObjectId（24 位十六进制字符串）
      const isValidObjectId = mongoose.Types.ObjectId.isValid(newDoc.category)
        && /^[0-9a-fA-F]{24}$/.test(newDoc.category)

      let col
      if (isValidObjectId) {
        // 前端已传入 _id，直接按 _id 查找
        col = await Column.findById(newDoc.category)
        assert(col, 422, `分类 _id "${newDoc.category}" 不存在`)
      } else {
        // 兼容旧版：按板块名称查找
        col = await Column.findOne({ name: newDoc.category })
        assert(col, 422, `分类 "${newDoc.category}" 不存在`)
        newDoc.category = col._id
      }
    }

    // ===== ② 嵌套评论预处理：继承 article + 自动设置 replyTo =====
    if (modelName === 'Comment' && newDoc.parentComment) {
      const Comment = require('../models/Comment')
      const parent = await Comment.findById(newDoc.parentComment)
      assert(parent, 422, '父评论不存在')
      // 从父评论继承 article（如果前端未传），保证嵌套回复的 article 与父评论一致
      if (!newDoc.article) newDoc.article = parent.article
      // 如果没有指定 replyTo 且父评论有作者，默认回复父评论作者
      if (!newDoc.replyTo && parent.author) newDoc.replyTo = parent.author
    }

    // 从 req.ip 提取 IP 属地（简化处理）
    if (modelName === 'Comment' && !newDoc.ipLocation) {
      newDoc.ipLocation = '广东'
    }

    // ===== ③ 关联字段校验（此时 category 已是 ObjectId） =====
    let updateHandlers = [] // 更新批处理数组
    if (modelName in POP_POST_MAP) {
      const operates = POP_POST_MAP[modelName]
      for (let operate of operates) {
        let { _model, queryAct, _refId, update, options } = operate
        // 更新refId
        let refId = newDoc[_refId]
        // 创建需检查是否提供了关联字段
        assert(refId, 422, `${_refId}为无默认值关联字段,必须填写`)
        // 将校验通过的操作存储
        updateHandlers.push({
          _model, queryAct, refId, update, options
        })
      }
    }

    // ===== ④ 模型创建校验（配置化，与前端 bus 校验对齐） =====
    if (modelName in VALIDATE_MAP) {
      VALIDATE_MAP[modelName](newDoc)
    }

    // ===== ⑤ 创建资源 =====
    const result = await req.Model.create(newDoc)

    // ===== ⑥ 后置操作：更新关联表数据（先更新关联再返回）=====
    // 校验通过 && 创建成功; 批处理更新操作
    await Promise.all(updateHandlers.map(async (cur) => {
      const { _model, queryAct, refId, update, options } = cur
      await _model[queryAct](refId, update(result['_id'], newDoc), options)
    }))

    console.log(result)

    // 新增: 创建完资源后返回id
    res.send(200, {
      message: '创建成功',
      _id: result['_id']
    })
  } catch (err) {
    next(err || createError(400))
  }
})


// 查询资源列表
// 使用mongoose-sex-page进行分页,前端自行指定搜索配置项
// 执行流程：① 解析 query/options/size/page（query string 与 body 都支持） → ② 查 POPULATE_MAP 决定是否 populate → ③ pagination 分页查询 → ④ 返回
router.get('/', async (req, res, next) => {
  try {
    // 参数来源：合并 req.body 与 req.query（query 优先）
    // 原因：前端 request/api/http.js 对 GET 会把 data 拼进 query string，
    //      只读 req.body 的话 page/size 永远是默认值（100/1），前端传参等于无效。
    // 兼容性：旧调用方继续用 body 传参不受影响；query string 里的值经 Number 兜底后
    //        才交给 mongoose-sex-page，避免字符串页码被当成非法值。
    const src = Object.assign({}, req.body, req.query)
    const query = (src.query && typeof src.query === 'object') ? src.query : {}
    const options = (src.options && typeof src.options === 'object') ? src.options : {}
    const size = Number(src.size) || 100
    const page = Number(src.page) || 1
    const dis = Number(src.dis) || 8
    const modelName = req.Model.modelName
    // 根据数据结构选择是否对queries进行populate处理
    const pop = (modelName in POPULATE_MAP) ? POPULATE_MAP[modelName] : {}
    let result = await pagination({ model: req.Model, query, options, size, page, dis, populate: pop })
    res.send({
      message: 'ok',
      data: result
    })
  } catch (err) {
    next(createError(422, "请求发生错误"))
  }
})

// 查询资源详情
// 执行流程：① 查 POPULATE_MAP → ② populate 查询 → ③ 返回结果 → ④ 后置操作（viewNum+1）
// 设计说明：获取详情后异步执行 viewNum 自增，不阻塞响应返回
router.get('/:id', async (req, res, next) => {
  try {
    const modelName = req.Model.modelName
    const docId = req.params.id
    let queries = req.Model.findById(docId)
    // 根据数据结构选择是否对queries进行populate处理
    const pop = (modelName in POPULATE_MAP) ? POPULATE_MAP[modelName] : {}
    let result = await populate(queries, pop).exec()

    res.send({
      message: 'ok',
      data: result ? result : {}
    })

    // 更新点击量（后置操作，在 res.send 之后执行以优化感知速度）
    // ⚠ 带 `?skipView=1` 时不计数：这是给「编辑页回填正文」用的 ——
    //   那是作者在读自己的稿子，不是读者在看文章，不挡的话每点一次编辑
    //   都会给自己刷一次浏览量（而这个数字就显示在博客管理列表里，一眼能看出来）。
    if (modelName in POP_GET_MAP && req.query.skipView !== '1') {
      const operate = POP_GET_MAP[modelName]
      let { queryAct, update, options } = operate
      await req.Model[queryAct](docId, update(), options)
    }
  } catch (err) {
    console.log('查询资源详情出错', err.message)
    next(createError(422, "请求发生错误"))
  }
})

// 更新资源
// 执行流程：① 鉴权（token + POP_PUT_MAP 白名单）→ ② 查资源是否存在 → ③ 验证作者身份 → ④ 过滤可修改字段 → ⑤ 更新 → ⑥ 返回
// 安全机制：
//   - 只有 POP_PUT_MAP 中配置了 revisable 字段的资源才可修改
//   - authField 验证当前用户是否为资源所有者，防止越权修改
router.put('/:id', async (req, res, next) => {
  let queryId = req.params.id // 查询资源id
  let newDoc = req.body
  const modelName = req.Model.modelName
  let userId = req.uid

  try {
    // ① 验证修改权限: 在允许更新范围内 (走到这里说明token没被吊销,鉴权通过)
    let verified = (modelName in POP_PUT_MAP)
    assert(verified, 400, '无权修改')
    // ② 验证查询结果
    const result = await req.Model.findById(queryId)
    assert(result, 400, '资源不存在')
    // ③ 验证是否是资源作者
    console.log(userId)
    let { revisable, authField } = POP_PUT_MAP[modelName]
    assert.equal(userId, result?.[authField], 400, '无权修改')
    // ④ 根据允许修改字段,过滤修改数据（防止前端传入不应修改的字段）
    // 先提取 oldPassword（非模型字段，不被 revisable 包含，过滤前取出）
    const oldPassword = newDoc.oldPassword
    newDoc = Object.entries(newDoc).filter(([key, val]) => {
      return revisable.indexOf(key) !== -1
    })
    // 验证是否存在有效修改数据
    assert(newDoc.length, 400, '修改失败')
    // 获取更新数据、统一并增加最后修改时间
    newDoc = Object.fromEntries(newDoc)
    newDoc['date'] = new Date().toISOString()

    // ⑤ 更新
    // User 密码必须通过 save() 更新：findByIdAndUpdate 绕过 schema setter
    // setter 负责 RSA解密→校验格式→RSA加密 完整管道
    if (modelName === 'User' && 'password' in newDoc) {
      // 验证旧密码
      assert(oldPassword, 422, '修改密码需要提供旧密码')
      const user = await req.Model.findById(queryId).select('+password')
      assert(user, 400, '用户不存在')
      const storedPlain = decryptSync(user.password)
      const oldPlain = decryptSync(oldPassword)
      assert.equal(oldPlain, storedPlain, 422, '旧密码错误')
      Object.assign(user, newDoc)
      await user.save()
    } else {
      await req.Model.findByIdAndUpdate(queryId, newDoc)
    }
    res.send(200, {
      message: '修改成功'
    })

    // Q
  } catch (err) {
    console.log(err.stack)
    next(err)
  }
})

// 删除资源
/**
 * DELETE /api/rest/:resource/:id
 *
 * ⚠ 归属校验是后补的（原来直接把 id 丢给 findByIdAndDelete，谁拿到 id 谁就能删）。
 *   规则与 PUT 一致：**只在 POP_PUT_MAP 里配了 authField 的资源才校验**，
 *   没配的资源（如 Column）保持原行为 —— 不在这轮扩大改动面。
 *   已覆盖 Article(author) / Comment(author) / User(_id) 三类。
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const queryId = req.params.id
    const modelName = req.Model.modelName

    // 账号只能由站长在管理端「注销」（软删），不走通用 CRUD
    assert(modelName !== 'User', 403, '账号只能由站长在管理端注销')
    // 板块是固定字典，不允许删除
    assert(modelName !== 'Column', 403, '板块是固定字典，不能删除')

    const doc = await req.Model.findById(queryId)
    assert(doc, 400, '资源不存在')

    const conf = POP_PUT_MAP[modelName]
    const authorField = conf && conf.authField
    const isAuthor = authorField && String(req.uid) === String(doc[authorField])

    // 管理员 / 站长可以删「等级更低的人」的内容；同级（管理员之间、站长自己）不行
    let byModeration = false
    if (!isAuthor && authorField && req.actor && ['admin', 'owner'].includes(req.actor.role)) {
      const author = await User.findById(doc[authorField]).select('role').lean()
      byModeration = !!author && canManage(req.actor.role, author.role || 'user')
    }
    assert(isAuthor || byModeration, 400, '无权删除')

    const result = await req.Model.findByIdAndDelete(queryId)

    // 管理端删除留痕（作者删自己的不记）
    if (byModeration) {
      await AdminLog.create({
        actor: req.uid,
        actorName: req.actor.name || '',
        action: `${modelName.toLowerCase()}.delete`,
        targetType: modelName === 'Comment' ? 'comment' : 'article',
        targetId: doc._id,
        targetName: doc.title || String(doc.content || '').slice(0, 30),
        detail: `${req.actor.role === 'owner' ? '站长' : '管理员'}删除他人内容`,
        ip: req.ip || ''
      })
    }

    res.send(result)
  } catch (err) {
    next(err)
  }
})

module.exports = router
