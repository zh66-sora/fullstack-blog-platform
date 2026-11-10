/**
 * resource.js — RESTful 资源名→Model 映射中间件
 * =========================================================================
 * 职责：将 URL 路径中的资源名（:resource）转换为对应的 Mongoose Model
 *       并挂载到 req.Model 上，供下游 bus.js 路由使用
 *
 * 工作流程：
 *   ① 从 req.params.resource 获取资源名（如 "articles"）
 *   ② 使用 inflection.classify 将复数资源名转为单数模型名（如 "articles" → "Article"）
 *   ③ 动态 require 对应的 Model 文件
 *   ④ 挂载到 req.Model，调用 next()
 *
 * 为什么需要这个中间件？
 *   - 通用 CRUD 路由（bus.js）通过 req.Model 操作不同表
 *   - 将"资源名解析"与"业务操作"解耦
 *   - 新增一种资源类型时，只需创建对应的 Model 文件，
 *     路由层无需修改（遵循约定优于配置原则）
 *
 * 使用的库：
 *   inflection — 提供英语单词的单复数转换（classify/camelize/pluralize）
 */
const inflection = require('inflection')
const createError = require('http-errors')
const User = require('../models/User')

module.exports = options => {
  return async (req, res, next) => {
    try {
      // 取app层捕获的resource,用inflection处理为模块名
      // 例如："articles" → "Article", "comments" → "Comment"
      const modelName = inflection.classify(req.params.resource)
      // 将对应数据库接口挂req上,供下一层中间件调用
      req.Model = require(`../models/${modelName}`)
      next()
    } catch (err) {
      // require 失败 → 无对应 Model → 返回 422
      next(createError(422, '集合不存在'))
    }
  }
}