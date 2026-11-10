/**
 * POP_PUT_MAP.js — 更新资源权限控制映射表
 * =========================================================================
 * 职责：配置各表允许修改的字段和鉴权方式，用于 PUT 路由的权限控制
 *
 * 安全机制：
 *   ① 只有在此映射表中配置了 revisable 数组的资源才能被修改
 *   ② 修改时根据 authField 验证当前用户是否为资源所有者
 *   ③ 即使 token 鉴权通过，也只能修改 revisable 白名单内的字段
 *
 * 配置项说明：
 *   revisable  — 允许前端修改的字段名数组（不在其中的字段会被过滤掉）
 *   authField  — 用于验证作者身份的字段名（_id 表示用户自己可修改自己的某些字段）
 *
 * 为什么 Column 不在映射表中？
 *   板块分类由管理员直接通过数据库维护，不暴露给普通用户，
 *   防止分类被随意创建或修改导致混乱
 *
 * ⚠ Article 的 revisable 里**没有** category / publishDate：
 *   板块与发布时间不允许改（POST 建文章时能传，之后锁死），PUT 会把它们过滤掉。
 *   这正是「编辑页锁定板块」的第二道保险 —— 前端锁 UI，后端锁字段。
 */
const Article = require('../models/Article')
module.exports = {
  Article: {
    // ⚠ gitHubUrl 原来不在这份白名单里：POST 建文章时它写得进去（POST 没有字段白名单，
    //   见 bus.js），但 PUT 更新时会被静默过滤 —— 表现是「编辑页改了 github 链接、
    //   保存后却没变」。所以这里必须带上它，编辑功能才是完整的。
    'revisable': ['title', 'content', 'coverImage', 'tags', 'gitHubUrl'],
    'authField': 'author'
  },
  Comment: {
    'revisable': ['content'],
    'authField': 'author'
  },
  User: {
    'revisable': ['password', 'email', 'nickname', 'avatar', 'bio', 'banner', 'socialLinks', 'friendLinks'],
    'authField': '_id'
  }
}