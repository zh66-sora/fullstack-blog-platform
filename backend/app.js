/**
 * app.js — Express 应用入口
 * =========================================================================
 * 职责：应用初始化、中间件注册（CORS / JWT 鉴权 / 日志 / 静态文件）、
 *      路由挂载（通用 CRUD + 专用业务路由）、全局错误处理
 *
 * 架构位置：服务端最顶层，所有请求必经之路
 * ┌─ app.use(cors) ── app.use(expressJwt) ── app.use('/api/rest/:resource', busRoute) ── error handler
 * └─ 其他专用路由（/auth, /upload, /keys, /api/comments ...）
 *
 * JWT 鉴权流程：
 *   ① 从 Authorization header 或 query.token 提取 token
 *   ② 用 RSA 公钥解密 → 得到 payload（含 uid）
 *   ③ isRevoked 回调查 User 表确认用户未注销 → 将 uid 挂到 req.uid
 *   ④ 白名单内的路径（GET /api/rest/...、/auth/* 等）跳过鉴权
 *
 * 错误处理链路：
 *   ⑤ 各路由/中间件通过 next(err) 将错误传递至此
 *   ⑥ 依次尝试：mongoose 校验错误 → 唯一索引冲突 → multer/token 错误码 → 兜底 500
 */
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
// 连接数据库
const { mongoose } = require('./plugins/db')
const cors = require('cors')
const app = express()
// 字典-User数据字段：字段英文名 → 中文名，用于错误提示中友好展示
const QUE_MAP = require('./plugins/QUE_MAP')

// 中间件 nameMiddleware
const resourceMiddleware = require('./middleware/resource')

// 路由 nameRoute
const busRoute = require('./routes/bus')
// const loginRoute = require('./routes/login')
const authRoute = require('./routes/auth')
const adminRoute = require('./routes/admin')
const { effectiveStatus } = require('./core/roles')
const uploadRoute = require('./routes/upload')
const PubKeyRoute = require('./routes/getPubKey')
const searchRoute = require('./routes/search')
const likeRoute = require('./routes/artLikes')
const commentsRoute = require('./routes/comments')
const wallRoute = require('./routes/wall')
const profileRoute = require('./routes/profile')
const timelineRoute = require('./routes/timeline')
const githubRoute = require('./routes/github')
const wechatRoute = require('./routes/wechat')

// 设置跨域
// 使用 cors 中间件放开所有来源的跨域限制：博客前端与后端通常部署在不同端口/域名
app.use(cors({
  "origin": true, //true 设置为 req.origin.url
  "methods": "GET,HEAD,PUT,PATCH,POST,DELETE", //容许跨域的请求方式
  "allowedHeaders": "x-requested-with,Authorization,token, content-type", //跨域请求头
  "preflightContinue": false, // 是否通过next() 传递options请求 给后续中间件
  "maxAge": 1728000, //options预验结果缓存时间 20天
  "credentials": true, //携带cookie跨域
  "optionsSuccessStatus": 200 //options 请求返回状态码
}))

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'))
app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use(cookieParser())
app.use(express.static(path.join(__dirname, 'public')))
app.use(express.static(path.join(__dirname, 'uploads')))



const { expressjwt: expressJwt } = require('express-jwt')
const fs = require('fs');
const User = require('./models/User');

// nickname 字段迁移：为已有用户用 username 补齐 nickname
// 确保作者搜索能匹配到所有用户（idempotent：已有 nickname 的不受影响）
mongoose.connection.once('open', async () => {
  try {
    const result = await User.updateMany(
      { $or: [{ nickname: { $exists: false } }, { nickname: null }, { nickname: '' }] },
      [{ $set: { nickname: '$username' } }]
    )
    if (result.modifiedCount > 0) {
      console.log(`[migration] 已为 ${result.modifiedCount} 个用户补齐 nickname`)
    }
  } catch (err) {
    console.warn('[migration] nickname 迁移失败:', err.message)
  }

  // 全文索引：数据源在这里注入（core 不直接 require models），
  // 订阅文章变更的同步器也在这里挂载（models 只 emit 事件，不认识搜索）
  try {
    const search = require('./core/search')
    const Article = require('./models/Article')
    search.setSource(() => Article.find().select('title content').lean())
    require('./plugins/SEARCH_SYNC').attach()
    await search.rebuild()
    // 每日全量重建兜底：updateMany / 直接改库 这类绕过模型钩子的写法，
    // 增量更新看不到，靠定时重建把索引拉回一致
    search.scheduleAutoRebuild()
  } catch (err) {
    console.warn('[search] 索引构建失败:', err.message)
  }
})

const publicKey = fs.readFileSync('./auth/public.pem', 'utf8')

// JWT 鉴权中间件（express-jwt 6.x 新版写法）
// 使用 RS256 非对称加密：私钥签名（签发 token）、公钥验签（此处验证）
// 选择 RS256 而非 HS256 的原因：公钥可安全分发，多服务共享验签而无需暴露私钥
app.use(
  expressJwt({
    secret: publicKey, // 解密秘钥：使用公钥解密（与签名的私钥配对）
    algorithms: ["RS256"], // 解密算法：6.0.0+ 版本必须明确指定算法
    // 自定义 token 提取函数：优先从 Authorization header 取，兼容 query 参数
    getToken: function fromHeaderOrQuerystring(req) {
      if (req.headers.authorization && req.headers.authorization.split(' ')[0] === 'Bearer') {
        // 从 Authorization 头提取 token
        return req.headers.authorization.split(' ')[1];
      } else if (req.query && req.query.token) {
        // 从 URL 查询参数提取 token（部分场景如图片链接无法携带 header 时使用）
        return req.query.token
      }
      // 未找到 token,返回null,isRevoked不执行;直接让其被错误中间件捕获
      // return null
      throw new Error('No token provided');
    },
    isRevoked: async function (req, jwt) {
      // token 吊销验证回调 (新版本写法)
      // 顺带把 actor 挂上：一次查询同时完成「吊销校验」和「角色/状态注入」，
      // 角色**不放进 token** —— 这样降级/封禁立即生效，不用等 token 过期。
      try {
        const { uid } = jwt.payload
        const user = await User.findById(uid).select('username role status statusUntil').lean()
        if (!user) return true
        req.uid = uid
        req.actor = {
          id: String(uid),
          name: user.username || '',
          role: user.role || 'user',
          status: effectiveStatus(user)
        }
        return false
      } catch (err) { // 出错直接吊销token
        return true
      }
      // express-jwt 新版本会自动调用 next()，无需手动调用
    }
  }).unless({
    path: [
      // 不需要jwt鉴权的路由白名单
      // ① 通用 CRUD 的 GET 请求（查询列表和详情）：公开可读，无需登录
      { url: /^\/api\/rest\/.*/, methods: ['GET'] },

      // ② 管理端认证路由：登录注册尚未拿到 token，自然跳过
      { url: /^\/auth\/.*/ }, // 登录注册

      // ③ 公开路由：密钥、搜索、点赞、GitHub 代理、评论读取
      { url: '/keys' }, // 密钥相关
      { url: '/articles/search' }, // 搜索功能
      { url: /^\/articles\/likes\/.*/, methods: ['GET'] }, // 点赞状态查询（公开读取）
      { url: /^\/api\/github\/.*/ },    // GitHub 仓库信息代理
      { url: /^\/api\/comments\/article\/.*/, methods: ['GET'] }, // 评论查询（公开读取）
      { url: /^\/api\/comments\/replies\/.*/, methods: ['GET'] }, // 回复查询（公开读取）
      { url: /^\/api\/wall\/.*/, methods: ['GET'] },  // 留言墙读取（公开；写操作仍需登录）
      { url: /^\/api\/timeline\/.*/, methods: ['GET'] }, // 时间线读取（公开；保存仍需登录）
      // 他人主页的公开资料（游客可读；保存自己资料仍需登录）
      // ⚠ 必须写成 `/api/profile/` 带后一段：只写 /^\/api\/profile\/.*/ 时，
      //   「GET /api/profile」本身（没有后一段）并不会命中这条正则，
      //   所以「取自己完整资料」依旧要求登录，两条不会互相放行。
      { url: /^\/api\/profile\/.*/, methods: ['GET'] },
      { url: /^\/images\/.*/ },   // 静态资源（头像等）
      { url: /^\/public\/.*/ },   // 兼容旧路径
      { url: /^\/wechat\/.*/ },   // 微信二维码重定向（公开访问）
    ]
  })
)

// 路由

// 资源路由
app.use('/api/rest/:resource', resourceMiddleware(), busRoute)

// 登录注册路由 /auth/login
app.use('/auth', authRoute)


// 文件上传路由 /upload
app.use('/upload', uploadRoute)

// 获取公钥路由 /keys
app.use('/keys', PubKeyRoute)

// 搜索
app.use('/articles/search', searchRoute)

// 点赞
app.use('/articles/likes', likeRoute)

// 评论
app.use('/api/comments', commentsRoute)

// 留言墙
app.use('/api/wall', wallRoute)

// 用户个人资料
app.use('/api/profile', profileRoute)

// 管理端（用户管理 / 禁言封禁 / 角色任命 / 操作记录）
app.use('/api/admin', adminRoute)

// 时间线（「关于」页的展示内容）
app.use('/api/timeline', timelineRoute)

// GitHub 仓库信息代理
app.use('/api/github', githubRoute)

// 微信二维码重定向
app.use('/wechat', wechatRoute)


// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

/**
 * 错误码 → 中文提示映射表
 * 覆盖两类场景：multer 文件大小超限、JWT token 吊销
 * 不在映射表中的 code 会被原样传递到响应
 */
const ERR_DIR = {
  // 各分类的限额不同（见 routes/upload.js 的 LIMIT_MAP），这里只给通用文案，
  // 具体档位由前端按 classify 决定提示
  'LIMIT_FILE_SIZE': '文件大小超出限制',
  'invalid_token': 'token被吊销'
}


/**
 * 全局错误处理中间件
 * =========================================================================
 * 错误类型处理优先级（按匹配顺序）：
 *   ① mongoose 校验错误（err.errors）→ 遍历字段，用 QUE_MAP 转为中文提示
 *   ② MongoDB 唯一索引冲突（err.code === 11000）→ 列出重复字段名
 *   ③ multer / token 吊销等已知错误码（ERR_DIR）→ 映射为友好消息
 *   ④ 兜底：返回 err.status 或 500，message 原样传递
 *
 * 设计决策：为什么不在各路由中分别处理错误？
 *   - 统一出口避免重复代码
 *   - QUE_MAP 集中管理字段中文名，修改一处全局生效
 *   - 校验错误与唯一索引错误的结构由 mongoose/MongoDB 固定，集中处理更可靠
 */
app.use(function (err, req, res, next) {
  // 同day46 test3, 正则校验(先,若正则校验未通过,则之前被捕获) 唯一索引错误错误
  let message
  // validate 校验错误信息打印
  // err.errors { field1:errObject,field2:errObject2 } => '以下字段校验未通过:校验失败字段1;校验失败字段2'
  if (err.errors) {
    console.dir(err.errors)
    message = Object.entries(err.errors).reduce((acc, [key, val]) => {
      acc += `${QUE_MAP[key] || key};`
      return acc
    }, '以下字段校验未通过:').slice(0, -1)
    err.status = 422
    err.message = message
  }

  // unique 唯一索引出错判断
  // err.keyPattern: { field1: 1,field2:1 } => '以下字段值在表内不能重复:不重复字段1;不重复字段2'
  if (err.code === 11000) {
    message = Object.entries(err.keyPattern).reduce((acc, [key, val]) => {
      acc += `${QUE_MAP[key] || key};`
      return acc
    }, '以下字段值在表内不能重复:').slice(0, -1)
    err.status = 422
    err.message = message
  }

  // 处理multer错误对象 - 没有status码
  // 处理token吊销 - 有status,但message需要映射
  if (ERR_DIR[err.code] !== undefined) {
    err.status = err.status || 422
    err.message = ERR_DIR[err.code]
  }

  res.status(err.status || 500).send({
    message: err.message
  });
});

module.exports = app;
