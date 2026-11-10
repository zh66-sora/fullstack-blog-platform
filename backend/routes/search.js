/**
 * search.js — 文章搜索路由
 * =========================================================================
 * 职责：提供文章多条件搜索接口，支持文本搜索 + 作者/板块/时间筛选 + 排序
 *
 * 搜索流程：
 *   ① 从 query 中取所有筛选参数
 *   ② 文本搜索（q）：走内存倒排（剥 HTML → 分词 → BM25 排序），附带高亮摘要
 *   ③ 作者搜索（authorName）：先查 User.nickname → distinct _id → $in 精确匹配
 *   ③b 作者精确搜索（authorId）：直接按 User._id 匹配
 *   ④ 板块筛选（category）：ObjectId 精确匹配
 *   ⑤ 标签筛选（tag）：tags 数组的「元素精确匹配」
 *   ⑥ 时间范围（startDate/endDate）：publishDate 区间
 *   ⑦ 排序（sortBy/order）：publishDate/likeNum/viewNum/commentNum + asc/desc
 *   ⑧ populate + 分页 → 响应
 *
 * 路由：
 *   GET /articles/search?q=关键词&authorName=昵称&authorId=用户id&category=id&tag=标签&startDate=&endDate=&sortBy=&order=&page=&size=
 *
 * ⚠ authorName 与 authorId 是两件事，不要混用：
 *   authorName 是 **昵称子串模糊匹配**（`new RegExp(name,'i')`），昵称互为子串时会串号
 *   （实测库里 uha2n / wuha2n：「查 uha2n」会把 wuha2n 的文章一起带出来）。
 *   「只看我自己的文章」这类场景必须用 authorId（_id 精确）。两者同时传时以 authorId 为准。
 */
const router = require('express').Router()
const assert = require('http-assert')
const Article = require('../models/Article')
const User = require('../models/User')
const { pagination } = require('../core/util/util')
const POPULATE_MAP = require('../plugins/POPULATE_MAP')
// 全文索引：倒排召回 + BM25 相关度排序 + 高亮摘要
const {
  getIndex,
  query: queryIndex,
  stripHtml,
  extractKeywords,
  markKeywords,
  buildSnippet,
} = require('../core/search')

// ObjectId 格式（24 位十六进制）——authorId 是外部传进来的，先挡一道再进查询
const OBJECT_ID_RE = /^[0-9a-fA-F]{24}$/

router.get('/', async (req, res, next) => {
  try {
    // ① 从 query 取所有参数
    const {
      q = '',
      authorName = '',
      authorId = '',
      category = '',
      tag = '',
      startDate = '',
      endDate = '',
      sortBy = 'publishDate',
      order = 'desc',
      page = 1,
      size = 100,
    } = req.query

    let query = {}
    // 走倒排索引时，命中的 docId 列表与分数（null = 没走索引，按原来的 Mongo 查询）
    let searchHits = null

    // ② 文本搜索：倒排索引召回（替代原来的正则扫 HTML）
    //    为什么换：正则扫的是 content 原文（HTML），搜 "div"/"h2" 命中的是标签名；
    //    而且前缀不确定的正则用不了索引，只能全表扫。
    //    倒排这边先剥 HTML、分词、建「词 → 文档」，查询时按同口径分词再查。
    if (q) {
      const index = await getIndex()
      const { hits } = queryIndex(index, q)

      if (!hits.length) {
        // 一个词都没命中，别再查库
        return res.send(200, {
          message: '查询成功',
          data: { count: 0, page: Number(page), size: Number(size), total: 0, list: [], pages: 0, display: 0 },
        })
      }

      searchHits = hits
      query._id = { $in: hits.map((hit) => hit.docId) }
    }

    // ③ 作者搜索：先查 User → distinct _id → $in
    if (authorName) {
      const userIds = await User.find({
        nickname: new RegExp(authorName, 'i'),
      }).distinct('_id')
      if (userIds.length > 0) {
        query.author = { $in: userIds }
      } else {
        // 没有匹配的用户，直接返回空结果
        return res.send(200, {
          message: '查询成功',
          data: { count: 0, page: Number(page), size: Number(size), total: 0, list: [], pages: 0, display: 0 },
        })
      }
    }

    // ③b 作者精确搜索：直接按 _id 匹配
    // ⚠ 与 authorName **不要同时传**：authorName 那边「一个用户都匹配不到」时会提前
    //   返回空结果（见上），根本走不到这里。两个参数是给两种场景用的，
    //   各自的调用方只传一个。
    if (authorId) {
      assert(OBJECT_ID_RE.test(authorId), 422, '作者ID格式错误')
      query.author = authorId
    }

    // ④ 板块筛选（单选精确匹配）
    if (category) {
      query.category = category
    }

    // ⑤ 标签筛选
    // Article.tags 是字符串数组，Mongo 对数组字段做「标量相等」判断时，
    // 语义就是「数组里是否含有这个元素」—— 所以直接赋值即可精确命中。
    // ⚠ 这里不用正则：用正则会把 'Vue' 匹配到 'Vuex'，标签筛选要的是精确的那个词。
    if (tag) {
      query.tags = tag
    }

    // ⑥ 时间范围：用 new Date(y,m,d) 构造本地时间的日期边界
    // 与文章 publishDate（Date.now/本地时间）的存储时区对齐
    if (startDate || endDate) {
      query.publishDate = {}
      if (startDate) {
        const [y, m, d] = startDate.split('-').map(Number)
        query.publishDate.$gte = new Date(y, m - 1, d)
      }
      if (endDate) {
        const [y, m, d] = endDate.split('-').map(Number)
        query.publishDate.$lte = new Date(y, m - 1, d, 23, 59, 59, 999)
      }
    }

    // ⑦ 排序
    const sortMap = {
      publishDate: order === 'asc' ? 1 : -1,
      likeNum: order === 'asc' ? 1 : -1,
      viewNum: order === 'asc' ? 1 : -1,
      commentNum: order === 'asc' ? 1 : -1,
    }
    const sort = {}
    if (sortBy && sortMap[sortBy] !== undefined) {
      sort[sortBy] = sortMap[sortBy]
    } else {
      sort.publishDate = -1 // 默认按发布时间倒序
    }

    // ⑧ Populate 配置（复用 POPULATE_MAP）
    const pop = POPULATE_MAP['Article'] || {}
    const dis = 8

    // ⑧b 走倒排的查询：相关度优先，所以不用 Mongo 的 sort / 分页
    //     倒排已经把候选收窄到「命中的那几篇」，这里查完在内存里按分数排 + 切片
    if (searchHits) {
      const scoreMap = new Map(searchHits.map((hit) => [hit.docId, hit.score]))

      let findQuery = Article.find(query)
      // pop 是数组：[{path, select}, …]，逐个应用（mongoose 5 支持链式 populate）
      for (const item of pop) findQuery = findQuery.populate(item)
      const docs = await findQuery.lean()

      docs.sort(
        (a, b) => (scoreMap.get(String(b._id)) || 0) - (scoreMap.get(String(a._id)) || 0)
      )

      // ⑧d 显式排序优先于相关度：前端默认传 publishDate（等价于「不排序」），
      //     只有用户主动选了点赞/浏览/评论排序才覆盖 BM25 —— 否则「按点赞排」这个开关会静默失效。
      if (sortBy && sortBy !== 'publishDate' && sortMap[sortBy] !== undefined) {
        const dir = sortMap[sortBy]
        docs.sort((a, b) => ((a[sortBy] || 0) - (b[sortBy] || 0)) * dir)
      }

      const pageNum = Number(page) || 1
      const pageSize = Number(size) || 100
      const total = docs.length
      const list = docs.slice((pageNum - 1) * pageSize, pageNum * pageSize)

      // ⑧c 高亮：只对当前页的这几条做，没必要为整页候选都生成摘要
      //     ⚠ 在「剥完标签的纯文本」上标亮，不在原 HTML 上 replace（否则标签会被劈开）
      const keywords = extractKeywords(q)
      const hitList = list.map((doc) => ({
        ...doc,
        score: Math.round((scoreMap.get(String(doc._id)) || 0) * 1000) / 1000,
        highlight: {
          title: markKeywords(doc.title || '', keywords),
          snippet: buildSnippet(stripHtml(doc.content), keywords),
        },
      }))

      return res.send(200, {
        message: '查询成功',
        data: {
          count: hitList.length,
          page: pageNum,
          size: pageSize,
          total,
          list: hitList,
          pages: Math.ceil(total / pageSize) || 0,
          display: dis,
        },
      })
    }

    // ⑨ 分页查询（无关键词时走原来的 Mongo 查询，筛选/排序能力完全保留）
    const result = await pagination({
      model: Article,
      query,
      options: {},
      populate: pop,
      sort,
      size: Number(size),
      page: Number(page),
      dis,
    })

    // ⑩ 响应
    res.send(200, {
      message: '查询成功',
      data: result,
    })
  } catch (err) {
    console.log(err.stack)
    next(err)
  }
})

module.exports = router
