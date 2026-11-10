/**
 * Upload 文件索引模型
 * =========================================================================
 * 职责：记录「内容哈希 → 磁盘文件」的映射，用于上传去重与秒传
 *
 * 设计说明：
 *   - 去重维度是 (hash, classify)，不是全局：同一张图在评论区和文章里各传一次，
 *     URL 分别是 /comment/… 和 /article/…，语义更直观
 *   - path 存**相对路径**（如 user/3f2a….jpg），不含域名；拼 URL 时再前缀 uploadURL，
 *     换域名/IP 只改一处
 *   - 老文件（hash 命名规则之前上传的）也走这张表，只是 path 仍是原名
 *     （由 scripts/indexUploads.js 补录，不改名以免已存 URL 失效）
 *   - 本版**不做引用计数**：只负责「同内容只存一份」，不做删除回收
 */
const mongoose = require('mongoose')

const schema = new mongoose.Schema({
  // SHA-256 十六进制（64 位小写）
  hash: { type: String, required: true },

  // 上传分类：user / article / comment / timeline / other
  classify: { type: String, required: true },

  // 相对 uploads 的路径，如 user/3f2a….jpg
  path: { type: String, required: true },

  size: { type: Number, default: 0 },
  mime: { type: String, default: '' },

  createdAt: { type: mongoose.SchemaTypes.Date, default: Date.now }
})

// 同一分类下同内容只允许一条；也是秒传查询的索引
schema.index({ hash: 1, classify: 1 }, { unique: true })

module.exports = mongoose.model('Upload', schema)
