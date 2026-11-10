/**
 * Column 板块模型
 * =========================================================================
 * 职责：定义博客板块/分类的数据结构，用于对文章进行归类组织
 *
 * 业务场景：
 *   - 前端导航栏根据板块列表渲染标签页
 *   - 每篇文章属于一个板块（category 字段引用 Column）
 *   - 板块下维护文章列表（articles 数组），在创建文章时由 POP_POST_MAP 自动更新
 *
 * 与其他模型的关系：
 *   Column → Article  (articles 一对多引用)
 *
 * 设计说明：
 *   - 不暴露创建/修改接口给普通用户（POP_PUT_MAP 中未配置 Column），
 *     板块由管理员通过数据库直接维护，避免分类混乱
 *   - articles 数组为冗余设计，既可以通过 Column.articles 正向查询板块下文章列表，
 *     也可以通过 Article.category 反向查询所属板块
 */
const mongoose = require('mongoose')
const schema = new mongoose.Schema({
  // ========== 必填字段 ==========
  name: { // 板块名
    type: String,
    required: [true, '板块名必填']
  },
  // ========== 业务元数据字段 ==========
  lastUpdated: { // 分区最后更新时间
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  },
  // ========== 关联字段 ==========
  articles: [{ // 文章列表（冗余存储，创建文章时自动 push）
    type: mongoose.SchemaTypes.ObjectId,
    ref: "Article"
  }]
})

module.exports = mongoose.model('Column', schema)