/**
 * Article 文章模型
 * =========================================================================
 * 职责：定义博客文章的数据结构与存储规则，是系统的核心内容模型
 *
 * 字段分类：
 *   - 必填字段：title（标题）、content（内容）— 创建时必须提供
 *   - 可选字段：coverImage（封面图）、tags（标签）、gitHubUrl（关联仓库）
 *   - 业务元数据：commentNum/likeNum/viewNum（计数统计）、publishDate/date（时间线）
 *   - 关联字段：author（作者 → User）、comments（评论 → Comment）、category（板块 → Column）
 *
 * 与其他模型的关系：
 *   Article ← User        (author 外键)
 *   Article ← Column      (category 外键)
 *   Article → Comment     (comments 一对多)
 *
 * 特殊设计：
 *   - content setter 使用 decodeURI 解码：前端可能对富文本内容做了 URI 编码才传输
 *   - 各计数字段默认为 0 而非 undefined，避免前端做空值判断
 *   - 评论集合（comments）存储评论的 ObjectId 数组，配合 POP_POST_MAP 在创建评论时自动 push
 */
const mongoose = require('mongoose')
// 只依赖「事件总线」这个通用设施，不认识搜索/缓存等具体消费者
const events = require('../core/events')
const schema = new mongoose.Schema({
  // ========== 必填字段 ==========
  title: { // 标题
    type: String,
    required: [true, '标题必填']
  },
  content: { // 文章内容（富文本 HTML）
    type: String,
    required: [true, '内容必填'],
    set(val) {
      // 兼容前端 URI 编码后的内容：一些富文本编辑器在提交前会对 HTML 做 encodeURI
      return decodeURI(val)
    }
  },

  // ========== 可选字段 ==========
  coverImage: { // 封面图
    type: String //URL
  },
  tags: { // 标签列表
    type: [String],
    default: []
  },
  gitHubUrl: {
    type: String // URL
  },
  // ========== 业务元数据字段 ==========
  commentNum: { // 评论数量（冗余设计：避免每次查询都要 countDocuments）
    type: Number,
    default: 0
  },
  likeNum: { // 喜欢数量
    type: Number,
    default: 0
  },
  dislikeNum: { // 点踩数量
    type: Number,
    default: 0
  },
  viewNum: { // 点击数量
    type: Number,
    default: 0
  },
  publishDate: { // 发布日期（首次发布时设置，与 date 区分）
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  },
  date: { // 最后编辑日期（每次更新时由路由层刷新）
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  },
  // ========== 关联字段 ==========
  author: { // 作者
    type: mongoose.SchemaTypes.ObjectId,
    ref: "User",
    default: "692c8ca89bdc3508cbd797da"
  },
  comments: [ // 评论集合（子文档引用数组，不嵌入全文评论以保持文档轻量）
    {
      type: mongoose.SchemaTypes.ObjectId,
      ref: "Comment"
    }
  ],
  category: { // 所属板块
    type: mongoose.SchemaTypes.ObjectId,
    ref: "Column",
    default: '692c96c18e66b34d97908c5a'
  }
})

// ============================================================
// 变更广播（模型层只做「通知」，不关心谁在听）
// ------------------------------------------------------------
// 为什么是事件而不是直接调搜索索引：
//   models 的职责只有 Schema；直接 require 搜索服务会让「数据层 → 领域服务」反向依赖，
//   并且脚本 require 一次模型就把整个搜索模块（含 jieba 词典）拖起来。
//   这里只广播「文章保存 / 正文变了 / 被删了」，订阅方（plugins/SEARCH_SYNC）由 app.js 挂载。
// ============================================================
schema.post('save', function (doc) {
  events.emit('article:saved', doc)
})

// findByIdAndUpdate / findOneAndUpdate（bus 的 PUT 走这条）
// ⚠ 默认 new:false 时 post 收到的是**更新前**的文档，所以只在这里判断「该不该通知」，
//   真正的最新内容由订阅方自己重查；浏览量 +1 这种高频更新不该触发重新分词。
schema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() || {}
  const fields = new Set()
  for (const [key, value] of Object.entries(update)) {
    if (key.startsWith('$') && value && typeof value === 'object') {
      Object.keys(value).forEach((field) => fields.add(field))
    } else {
      fields.add(key)
    }
  }
  this._contentChanged = fields.has('title') || fields.has('content')
})

schema.post('findOneAndUpdate', function (doc) {
  if (doc && this._contentChanged) events.emit('article:contentChanged', doc._id)
})

schema.post('findOneAndDelete', function (doc) {
  if (doc) events.emit('article:deleted', doc._id)
})

module.exports = mongoose.model('Article', schema)