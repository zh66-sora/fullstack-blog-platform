/**
 * timeline.js — 时间线专用路由
 * =========================================================================
 * 职责：「关于」页那条时间线的读写。
 *
 * 路由清单：
 *   GET /api/timeline/:userId  — 取某用户的时间线（**公开读**，按年月日升序）
 *   PUT /api/timeline          — 保存当前用户的时间线（需登录，整体覆盖式 upsert）
 *
 * 为什么走专用路由而不是通用 CRUD（bus.js）？
 *   ① 通用 CRUD 的 PUT/DELETE 没有归属校验，谁都能改别人的文档；
 *      而时间线有明确的归属规则（只能写自己那条）；
 *   ② 「每条记录的四个字段都必填」这条规则要给出「第 N 条 ×× 不能为空」的提示，
 *      通用 CRUD 那套 VALIDATE_MAP 表达不了；
 *   ③ 保存是「整条时间线一次性覆盖」，不是逐字段 PATCH，
 *      与通用 CRUD 的「按字段过滤更新」语义不同。
 *   与 comments.js / wall.js / profile.js 是同一套做法（它们也都有专用路由）。
 *
 * 为什么不拆 service 层？
 *   本项目的分层是 routes（流程 + 规则）→ models（结构）→ plugins（声明式映射），
 *   没有 service/repository 层（见 app.js 顶部的架构说明与 bus.js 的做法）。
 *   时间线的规则量很小、也没有第二个调用方，硬抽一层只会多一个空转文件。
 */
const express = require('express')
const router = express.Router()
const createError = require('http-errors')
const assert = require('http-assert')
const jwt = require('jsonwebtoken')
const fs = require('fs')
const Timeline = require('../models/Timeline')

const { ITEM_MAX } = Timeline
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 取当前登录者 uid
 *
 * ⚠ 不能只读 req.uid：GET 这条进了 JWT 白名单（下一步的「他人主页」要能匿名看别人的时间线），
 *   express-jwt 对白名单路径**整个跳过**，req.uid 根本不会被赋值。
 *   与 wall.js / artLikes.js 同一套补救：白名单路径上自己解一次 token，
 *   解不出来就是游客 —— 而本模块的读接口对游客和登录者返回完全一样的内容，
 *   所以这里目前只用它做「是不是本人」的判断（保留能力，为下一步铺路）。
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

/** 计数用码点：emoji 是代理对，.length 会把一个表情算成两个字（同 wall.js） */
const len = (s) => [...(s || '')].length

/**
 * 年月日升序
 * ⚠ date 存的是定长补零的 'YYYY-MM-DD'，字典序就是时间序 ——
 *   直接比较字符串，不用 new Date()（后者在 ES 里会按 UTC 解析，东八区下差一天）
 */
const byDateAsc = (a, b) => String(a.date).localeCompare(String(b.date))

/** 统一的对外结构：只回前端要的字段，顺带过滤脏数据 */
function toView(doc) {
  if (!doc) return { backgroundImage: '', items: [] }
  const items = (doc.items || [])
    .map((it) => ({
      backgroundImage: it.backgroundImage || '',
      title: it.title || '',
      date: it.date || '',
      description: it.description || ''
    }))
    .sort(byDateAsc)
  return { backgroundImage: doc.backgroundImage || '', items }
}

/**
 * GET /api/timeline/:userId
 * 取某用户的时间线（公开读）
 *
 * ⚠ 没配置过也返回 200 + 空结构，而不是 404：
 *   前端要区分「请求失败」（跳兜底页的重试态）与「还没配过」（跳空态）——
 *   把「没配过」做成 404 会让这两件事在 axios 里长得一样。
 */
router.get('/:userId', async (req, res, next) => {
  try {
    const { userId } = req.params
    assert(OBJECT_ID_RE.test(userId), 422, '用户ID格式错误')

    const doc = await Timeline.findOne({ owner: userId }).lean()

    res.send({
      message: 'ok',
      data: {
        owner: userId,
        ...toView(doc),
        // 是不是本人（前端据此决定要不要给「去时间线管理」的引导按钮）
        isSelf: currentUid(req) === String(userId)
      }
    })
  } catch (err) {
    next(err.status ? err : createError(422, '查询时间线失败'))
  }
})

/**
 * PUT /api/timeline
 * 保存当前用户的时间线（需登录）
 * Body: { backgroundImage: String, items: [{ backgroundImage, title, date, description }] }
 *
 * 校验顺序（先 cheap 后 expensive）：登录 → 列表非空 → 逐条四个字段
 * ⚠ 逐条校验带序号：提示要能让用户直接对上界面上的第几条，而不是一句笼统的「参数错误」
 *
 * 保存语义：**整体覆盖**。前端提交的就是保存后要看到的样子，
 * 后端不保留任何没提交的旧节点（时间线的「增删」全在前端那张表上完成）。
 */
router.put('/', async (req, res, next) => {
  try {
    const uid = req.uid
    assert(uid, 422, '请先登录')

    const { backgroundImage, items } = req.body

    assert(Array.isArray(items) && items.length, 422, '时间轴至少要有一条记录')

    const cleanItems = items
      .map((item, index) => {
        const no = index + 1
        const backgroundImageOfItem = String(item?.backgroundImage || '').trim()
        const title = String(item?.title || '').trim()
        const date = String(item?.date || '').trim()
        const description = String(item?.description || '').trim()

        assert(backgroundImageOfItem, 422, `第 ${no} 条的图片不能为空`)
        assert(title, 422, `第 ${no} 条的标题不能为空`)
        assert(date, 422, `第 ${no} 条的年月日不能为空`)
        assert(DATE_RE.test(date), 422, `第 ${no} 条的年月日格式不正确，应为 YYYY-MM-DD`)
        assert(description, 422, `第 ${no} 条的说明文字不能为空`)
        assert(len(title) <= ITEM_MAX.title, 422, `第 ${no} 条的标题最多 ${ITEM_MAX.title} 个字`)
        assert(
          len(description) <= ITEM_MAX.description,
          422,
          `第 ${no} 条的说明文字最多 ${ITEM_MAX.description} 个字`
        )

        return { backgroundImage: backgroundImageOfItem, title, date, description }
      })
      // 先排好再落库：库里天然是升序，读接口就不用每次再排一遍
      .sort(byDateAsc)

    const bg = String(backgroundImage || '').trim()
    assert(bg, 422, '整页面背景图不能为空')

    // upsert 的键就是 owner 上的唯一索引（见 models/Timeline.js 的说明）
    const doc = await Timeline.findOneAndUpdate(
      { owner: uid },
      { $set: { backgroundImage: bg, items: cleanItems, date: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean()

    res.send({ message: 'ok', data: toView(doc) })
  } catch (err) {
    next(err.status ? err : createError(422, '保存时间线失败'))
  }
})

module.exports = router
