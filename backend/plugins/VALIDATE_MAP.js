/**
 * VALIDATE_MAP.js — 创建资源校验规则映射表
 * =========================================================================
 * 职责：为不同模型提供创建时的校验逻辑，与前端 bus 层的校验规则对齐
 *
 * 设计原理：
 *   mongoose Schema 层的 required 和 validate 只能做字段级校验，
 *   但有些业务规则需要在文档级别校验（如"内容不能是纯空白"、"评论必须关联文章"）
 *   此映射表将这些业务规则集中定义，在 bus.js POST 时统一调用
 *
 * 当前校验规则：
 *   Article：
 *     - 标题不能为空
 *     - 板块必选
 *     - 内容解码后去除HTML标签和空白，不可为空
 *   Comment：
 *     - 评论内容不能为空
 *     - 必须关联文章
 *
 * 与前端对齐：
 *   - Article 校验逻辑与前端 articleBus.validateArticle 方法保持一致
 *   - 既是后端安全校验，也是后端对前端校验的冗余保护
 */
const assert = require('http-assert')

module.exports = {
  Article(doc) {
    // 标题必填
    assert(doc.title?.trim(), 422, '标题不能为空')
    // 板块必填
    assert(doc.category, 422, '请选择文章板块')
    // 内容必填（content 可能是 URI 编码的 HTML，解码后去除标签和空白）
    let raw = doc.content || ''
    try { raw = decodeURIComponent(raw) } catch { /* 非编码格式，直接使用 */ }
    const text = raw.replace(/<[^>]*>/g, '').replace(/\s/g, '')
    assert(text, 422, '文章内容不能为空')
  },
  Comment(doc) {
    // 评论内容必填
    assert(doc.content?.trim(), 422, '评论内容不能为空')
    // 必须关联文章
    assert(doc.article, 422, '评论必须关联文章')
  },
}
