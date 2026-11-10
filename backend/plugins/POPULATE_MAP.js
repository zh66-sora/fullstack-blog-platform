/**
 * POPULATE_MAP.js — populate 关联查询配置映射表
 * =========================================================================
 * 职责：集中定义 mongoose populate 配置，供 bus.js 和 pagination 工具使用
 *
 * 设计原理：
 *   各模型间的关联关系（如 Article 引用 author、category、comments）
 *   以声明式配置集中管理，避免在路由层每次查询时重复编写 populate 链
 *
 * 配置项说明：
 *   path     — 要 populate 的字段名
 *   select   — 返回的字段白名单（减小编译体积，不返回敏感或无用字段）
 *   populate — 嵌套 populate（用于 populate 后的文档再次 populate）
 *
 * 模型关系：
 *   Article → User (author)         ：文章作者，select 头像和昵称
 *   Article → Column (category)     ：所属板块，select 板块名
 *   Article → Comment (comments)    ：评论列表，嵌套 populate 评论作者
 *   Comment → User (author/replyTo) ：评论作者和回复目标，select 头像和用户名
 *   Comment → Article (article)     ：所属文章，select 标题
 *   Column  → Article (articles)    ：板块下文章列表，嵌套 populate 文章作者
 */
module.exports = {
  "Article": [{
    path: "author",
    // role 是给管理端删内容用的：管理员 / 站长能不能删「这一篇」，取决于作者等级
    // （规则同 myapp/core/roles.js 的 canManage，前端只是照着画按钮，服务端还会再判一次）
    select: "avatar nickname role"
  }, {
    path: "category",
    select: "name"
  }, {
    path: "comments",
    select: "content commentTime author",
    populate: {
      path: "author",
      select: "avatar nickname role"
    }
  }],
  "Comment": [{
    path: "author",
    select: "avatar username nickname role"
  }, {
    path: "replyTo",
    select: "avatar username nickname role"
  }, {
    path: "article",
    select: "title"
  }],
  "Column": [{
    path: "articles",
    select: "title coverImage commentNum likeNum viewNum publishDate author category",
    populate: {
      path: "author",
      select: "avatar nickname role"
    }
  }]
}