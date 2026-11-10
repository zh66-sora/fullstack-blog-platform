/**
 * POP_POST_MAP.js — 创建资源后置操作映射表
 * =========================================================================
 * 职责：配置在创建资源（POST）后需要执行的关联表更新操作
 *
 * 设计原理：
 *   当通过 bus.js 的 POST 路由创建文章或评论时，不仅要将数据写入当前表，
 *   还需要更新关联表的相关字段。该映射表将"什么资源创建后更新什么表"
 *   这种逻辑从路由层抽离为声明式配置。
 *
 * 工作流程：
 *   ① bus.js POST 路由读取 POP_POST_MAP[modelName]
 *   ② 校验关联字段（_refId）是否存在
 *   ③ 创建资源成功后在 Promise.all 中批量执行更新操作
 *
 * 配置项说明：
 *   _model    — 要更新的目标 Model
 *   queryAct  — Mongoose 操作名（findByIdAndUpdate / updateMany 等）
 *   _refId    — 当前文档中指向目标表的引用字段名
 *   update    — 生成更新操作的函数，接收 (新文档ID, 原始请求体) 返回操作对象
 *   options   — queryAct 的选项参数
 *
 * 当前配置：
 *   Article → Column：创建文章后向板块文章列表 push 文章 ID
 *   Comment → Article：创建评论后增加文章评论计数，顶级评论同时 push 到评论列表
 */
const User = require('../models/User')
const Article = require('../models/Article')
const Column = require('../models/Column')
const Comment = require('../models/Comment')
module.exports = {
  Article: [{
    "_model": Column,
    "queryAct": "findByIdAndUpdate",
    "_refId": "category",
    "update": function (_id) {
      return {
        "$push": {
          "articles": _id
        }
      }
    },
    options: {}
  }],
  Comment: [{
    "_model": Article,
    "queryAct": "findByIdAndUpdate",
    "_refId": "article",
    "update": function (_id, newDoc) {
      const ops = {
        "$inc": { "commentNum": 1 }
      }
      // 只有顶级评论（无 parentComment）才 push 到 Article.comments 数组
      // 嵌套回复只增加 commentNum 计数
      // 原因：Article.comments 数组用于文章详情页展示评论列表，
      // 嵌套回复通过 parentComment 关联而非直接归属于文章
      if (!newDoc || !newDoc.parentComment) {
        ops["$push"] = { "comments": _id }
      }
      return ops
    },
    options: {}
  }],
}

/*
  mongoose.model('Column').findByIdAndUpdate(
    id,           // 第一个参数：要更新的文档ID
    update,       // 第二个参数：更新操作
    options,      // 第三个参数：选项（可选）
    callback      // 第四个参数：回调函数（可选）
  )

  分析要抽离成的数据结构
  为数组,因为后续可能要同时更新多个表数据
  示例:
  {
    Article: [{
      "_model" // 要更新的模块
      "queryAct" // findByIdAndUpdate 后续可能还有updateMany需求
      "_refId" // 当前表存的哪个字段,是关联的别的表中的objectId
      "update":function(_id){  // 对关联的别的表的操作
        return { // 返回要进行的操作对象:比如更新板块下的文章列表,还需要更新板块的更新时间
          "$push":{ // 要执行的的单个操作
            "comments":_id // 插入的文档对应的id
          },
          "set":...
        }
      }
      options:{...} // queryAct 支持的第三个参数
    },{...}]
  }

 */