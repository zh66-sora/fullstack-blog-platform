const jwt = require('jsonwebtoken')
const { getPrivateKey } = require('../core/rsaControl')


async function getToken({
  uid = 'ffffffffffffffffffffffff', // 默认为不存在的uid
  exp = ~~((Date.now() / 1000) + 24 * 3600 * 3),// 当前时间戳 + 3天的秒数
  algorithm = 'RS256'// 使用 RSA SHA256 算法签名
} = {}) {
  let privateKey = await getPrivateKey()

  // 成功,签发jwt
  return jwt.sign({ uid, exp }, privateKey, {
    algorithm: 'RS256'
  })
}

module.exports = { getToken }
