/**
 * 初始化公钥记录（空库部署用）
 * 用法：在 myapp 目录下执行  node scripts/seedKey.js
 *
 * 说明：前端 encrypt.js 通过 GET /keys 拿 data.keyName（即公钥 PEM 内容）
 *      来加密密码。Key 集合为空时 /keys 返回 data:null，登录/注册会失败，
 *      所以必须插入一条 keyName = auth/public.pem 内容的记录。
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const fs = require('fs')
const mongoose = require('mongoose')
mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
  useUnifiedTopology: true,
  useNewUrlParser: true,
})

const Key = require('../models/Key')

async function seed() {
  try {
    const exists = await Key.findOne()
    if (exists) {
      console.log('⚠️ Key 记录已存在，跳过')
      return
    }
    const pubKey = fs.readFileSync('./auth/public.pem', 'utf8')
    await Key.create({ keyName: pubKey })
    console.log('✅ 公钥记录已写入 Key 集合')
  } catch (err) {
    console.error('❌ 失败:', err.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

seed()
