/**
 * 应用全局配置
 * 集中管理路径、端口、文件大小限制等常量，避免硬编码散落各处
 */
const path = require("path")

module.exports = {
  // 占位域名：部署时换成你自己的域名 / IP
  host: 'example.com',
  root: process.cwd(),
  port: 3000,

  // ===== RSA 密钥对 =====
  // 私钥用于 JWT 签发 (core/getToken.js)
  // 公钥用于 JWT 验证 (app.js express-jwt) + 前端密码加密 (Http.js RSA)
  keyPath: path.join(process.cwd(), '/auth'),
  pubKeyPath: path.join(process.cwd(), '/auth/public.pem'),
  priKeyPath: path.join(process.cwd(), '/auth/private.pem'),

  // ===== 用户数据 =====
  userPath: path.join(process.cwd(), '/user/user.json'),

  // ===== 板块（固定字典）=====
  // ⚠ 必须与前端 vue-blog/src/config/category.config.js 的 _id 一一对应：
  //   前端发文时直接把这些 _id 传给后端，对不上就报「分类 _id 不存在」。
  //   两个仓库之间只能靠人工同步，改动时两边一起改。
  categories: [
    { _id: '6a5a1b3064e65f517c9056bd', name: 'Technology' },
    { _id: '6a5a1b3064e65f517c9056c0', name: 'Life' },
    { _id: '6a5a1b3064e65f517c9056c3', name: 'Thoughts' },
    { _id: '6a5a1b3064e65f517c9056c6', name: 'Reading' },
    { _id: '6a5a1b3064e65f517c9056c9', name: 'Product' },
    { _id: '6a5a1b3064e65f517c9056cc', name: 'Design' },
    { _id: '6a5a1b3064e65f517c9056cf', name: 'Startup' },
    { _id: '6a5a1b3064e65f517c9056d2', name: 'Tools' },
    { _id: '6a5a1b3064e65f517c9056d5', name: 'Misc' },
  ],

  // ===== 文件上传 =====
  uploadPath: path.join(process.cwd(), '/uploads'),   // 本地存储目录
  // ⚠ 已废弃：上传限额改为按分类分级，见 routes/upload.js 的 LIMIT_MAP
  maxFileSize: 102400,
  // ⚠ 已不再使用：返回给前端的 URL 改为按请求 Host 动态拼
  //    （见 routes/upload.js 的 publicUrl —— 本地/线上同一份代码都能正确预览）
  uploadURL: 'http://example.com/'
}