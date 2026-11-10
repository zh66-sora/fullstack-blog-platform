
const fs = require('fs').promises // 使用fs promise版本,搭配await使用
const fsSync = require('fs')
const { pubKeyPath, priKeyPath } = require('../config')
const { generateKeys } = require('./util/util')

module.exports = {
  async getPublicKey() {
    let key
    try {
      key = await fs.readFile(pubKeyPath, 'utf8')
    } catch (err) {
      generateKeys()
      key = await fs.readFile(pubKeyPath, 'utf8')
    }
    return key
  },
  async getPrivateKey() {
    let key
    try {
      key = await fs.readFile(priKeyPath, 'utf8')
    } catch (err) {
      generateKeys()
      key = await fs.readFile(priKeyPath, 'utf8')
    }
    return key
  }
}
