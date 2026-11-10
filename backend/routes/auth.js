/**
 * auth.js — 登录注册路由
 * =========================================================================
 * 职责：处理用户认证流程（登录和注册），签发 JWT
 *
 * 路由：
 *   POST /auth/login     — 登录：校验用户名+密码 → 签发 JWT
 *   POST /auth/register  — 注册：创建用户 → 签发 JWT
 *
 * 认证流程：
 *   ① 前端 RSA 公钥加密密码传输 → ② 后端 decrypt 解密 → ③ 校验格式 →
 *   ④ 登录：比对数据库密文 / 注册：写入数据库 → ⑤ 使用 RS256 私钥签发 JWT
 *
 * 安全设计：
 *   - 密码在网络传输和数据库存储中均非明文（双重加密）
 *   - JWT 签发使用 getToken 工具函数，统一 token 生成逻辑
 *   - 登录/注册复用同一个路由，通过 URL 参数 classify 区分
 */
const router = require('express').Router()
// 断言
const assert = require('http-assert')
// User模型
const User = require('../models/User')
// 解密
const { decrypt } = require('../core/util/util')
// 签发token
const { getToken } = require('../core/getToken')
const { effectiveStatus } = require('../core/roles')

const CLASSIFY = {
  'login': "login",
  'register': "register"
}

router.post('/:classify', async (req, res, next) => {
  console.log(req.url)
  // 获取数据
  // TODO 前端接口需要修改！
  const { username, password } = req.body
  const { classify } = req.params
  // 判断路由类型（login / register）
  let isClassPath = classify in CLASSIFY
  assert(isClassPath, 404, '无效的访问路由')
  let user
  try {
    // ① 参数判空
    if (!username || username?.trim()?.length === 0 || !password || password?.trim()?.length === 0) {
      assert(false, 422, "账号密码必填")
    }

    if (classify === 'login') {
      // ② 登录流程
      // 查询用户（需显式 select('+password') 因为 schema 中 password 默认为 select: false）
      user = await User.findOne({ username }).select('+password')
      // 若用户不存在,result为null,隐式转换为false
      assert(user, 422, "用户不存在")

      // 校验 password：前端发来的密码经过 RSA 加密，需要解密后比对
      // user.password 是从数据库取出的密文，也需要解密（二次解密后比对原始值）
      assert.equal(await decrypt(password), await decrypt(user.password), 422, "密码错误")

      // 账号状态闸门：注销了的查无此人，封禁中的明确告知解封时间
      // ⚠ 禁言（muted）允许登录，只拦写入（见 routes/bus.js / wall / chat）
      const status = effectiveStatus(user)
      assert(status !== 'deleted', 422, '账号已注销')
      if (status === 'banned') {
        const until = user.statusUntil
          ? `，解封时间 ${new Date(user.statusUntil).toLocaleDateString('zh-CN')}`
          : ''
        assert(false, 403, `账号已被封禁${until}`)
      }
    }

    if (classify === 'register') {
      // ③ 注册流程：只取允许的字段 —— 不能让客户端塞 role/status 把自己注册成站长
      const { username, password, nickname } = req.body
      user = await User.create({ username, password, nickname })
    }

    // ④ 签发 JWT（payload 包含 uid，RS256 私钥签名）
    let token = await getToken({
      uid: user._id
    })

    // ⑤ 响应
    res.send(200, {
      message: (classify === 'login') ? '登录成功' : '注册成功',
      data: {
        userId: user._id,
        token: token
      }
    })

  } catch (err) {
    next(err)
  }
})

module.exports = router