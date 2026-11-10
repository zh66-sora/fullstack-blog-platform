/**
 * SEARCH_SYNC —— 订阅文章变更事件，把改动同步进内存搜索索引
 * =========================================================================
 * 依赖方向：plugins → core/events + core/search + models
 *   模型那边只负责 emit，不认识搜索；谁订阅、订阅后做什么，全在这里。
 *   由 app.js 启动时调用 attach() 挂载 —— **不要**在 models 里 require 本文件，
 *   否则又会变成「模型依赖搜索」。
 *
 * 为什么订阅模型事件而不是挂 bus 路由：
 *   文章的写入不止 POST/PUT /api/rest/articles —— 后台脚本、其他路由、以后可能加的
 *   导入功能都会直接写 Article。挂路由一定漏，挂模型事件覆盖面最大。
 *
 * ⚠ 单进程内有效。pm2 cluster / 多实例时别的进程收不到事件，
 *   所以 app.js 里那条「每日全量重建」始终要保留。
 */
const events = require('../core/events')
const Article = require('../models/Article')
const { indexArticle, unindexArticle } = require('../core/search')

// 索引失败只打日志、不抛：搜索坏了不该让「保存文章」失败
function syncIndexSafely(promise) {
  Promise.resolve(promise).catch((err) =>
    console.warn('[search] 索引增量更新失败:', err.message)
  )
}

let attached = false

function attach() {
  if (attached) return
  attached = true

  // 新建 / save()：create() 内部也是 save
  events.on('article:saved', (doc) => syncIndexSafely(indexArticle(doc)))

  // 标题/正文变更：事件只带 id，最新内容在这里重查
  // （findOneAndUpdate 默认返回更新前的文档，不能直接用）
  events.on('article:contentChanged', (id) =>
    syncIndexSafely(
      Article.findById(id)
        .lean()
        .then((fresh) => fresh && indexArticle(fresh))
    )
  )

  events.on('article:deleted', (id) => syncIndexSafely(unindexArticle(id)))
}

module.exports = { attach }
