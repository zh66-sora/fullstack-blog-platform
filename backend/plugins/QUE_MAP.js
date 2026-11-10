/**
 * QUE_MAP.js — 字段名中文映射表
 * =========================================================================
 * 职责：提供英文字段名到中文名的映射，用于错误提示中友好展示
 *
 * 使用场景：
 *   在 app.js 全局错误处理中，当 mongoose 校验失败（err.errors）
 *   或唯一索引冲突（err.code === 11000）时，
 *   将字段英文名替换为中文名，使错误提示对用户更友好
 *
 * 示例：
 *   "title" → "标题"
 *   "content" → "内容"
 *
 * 覆盖范围：
 *   当前映射覆盖 User、Article、Column、Key、Comment 的表关键字段
 *   新增字段时需同步添加映射，否则错误提示会显示英文名
 */
module.exports = {
  // User
  "username": "用户名",
  "password": "密码",
  "email": "邮箱",
  "nickname": "昵称",
  "avatar": "头像",
  "banner": "背景图",
  "bio": "个签",
  "socialLinks": "社交媒体",
  "friendLinks": "友情链接",
  // Article
  "title": "标题",
  "content": "内容",
  "coverImage": "封面图",
  "gitHubUrl": "GitHub链接",
  "publishDate": "发布日期",
  "category": "所属板块",
  "author": "作者",
  // Column
  "name": "板块名",
  // Key
  "keyName": "Key名",
  // Comment
  "article": "所属文章",
  // Timeline
  "owner": "归属用户",
  "backgroundImage": "背景图",
  "items": "时间轴列表",
  "description": "说明文字"
}