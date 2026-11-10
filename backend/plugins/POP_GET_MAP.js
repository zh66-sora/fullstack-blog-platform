/**
 * POP_GET_MAP.js — 查询资源后置操作映射表
 * =========================================================================
 * 职责：配置在查询资源详情（GET /:id）后需要执行的关联更新
 *
 * 设计原理：
 *   读取操作通常不应修改数据，但"点击量 +1"是一个例外——
 *   每次查看文章详情都应增加一次浏览计数。
 *   此映射表将该逻辑从路由层抽离为声明式配置。
 *
 * 工作流程：
 *   ① bus.js GET /:id 查询资源详情并返回
 *   ② 响应发送后（不阻塞前端），执行 POP_GET_MAP 中的更新操作
 *   ③ 当前仅 Article 有 viewNum +1 的后置操作
 *
 * 为什么在 res.send 之后执行？
 *   - 浏览计数增加不应影响响应时间
 *   - 即使更新失败，也不影响用户正常查看文章
 *   - 后置执行减少了请求感知延迟
 */
const Article = require('../models/Article')
module.exports = {
  Article: {
    "queryAct": "findByIdAndUpdate",
    "update": function () {
      return {
        "$inc": {
          "viewNum": 1
        }
      }
    },
    options: {}
  }
}