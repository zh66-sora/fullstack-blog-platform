/**
 * getPubKey.js — 公钥获取路由
 * =========================================================================
 * 职责：向客户端提供 RSA 公钥，用于前端对密码等敏感信息加密
 *
 * 路由：
 *   GET /keys  — 返回公钥信息（_id + keyName）
 *
 * 安全设计：
 *   - 公钥公开分发，前端使用公钥加密密码后传输
 *   - 后端用私钥解密，确保密码在网络传输中不被明文截获
 *   - 仅返回公钥的标识信息，不返回私钥或密钥文件本身
 *
 * 关联：
 *   - app.js 中 /keys 路径配置在白名单，不需要 JWT 鉴权
 *   - models/Key 表存储 RSA 密钥对信息
 */
const router = require('express').Router()
const fs = require('fs').promises
const Key = require('../models/Key')

router.get('/', async (req, res, next) => {
  // 从 Key 集合中查询公钥记录（仅返回标识字段，不返回密钥内容）
  const pubKey = await Key.findOne().select('_id keyName')
  res.send(200, {
    message: 'ok',
    data:
      pubKey
  })
})


module.exports = router