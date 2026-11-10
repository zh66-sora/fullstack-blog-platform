/**
 * 创建管理员账号脚本（空库部署用）
 * 用法：在 myapp 目录下执行  node scripts/createAdmin.js <用户名> <密码>
 *
 * 说明：模拟前端注册流程 —— 用 RSA 公钥加密明文密码，交给 User 模型的
 *       setter 自动「解密 → 校验 → 再加密」入库，与正常注册行为完全一致，
 *       登录时 decrypt 比对才能对上。
 *
 * ⚠ 用户名与密码由运行者通过命令行传入，脚本不内置任何默认值。
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const mongoose = require('mongoose')
mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
  useUnifiedTopology: true,
  useNewUrlParser: true,
})

const User = require('../models/User')
const { encryptSync } = require('../core/util/util')

const USERNAME = process.argv[2]
const PASSWORD = process.argv[3]

if (!USERNAME || !PASSWORD) {
  console.error('用法: node scripts/createAdmin.js <用户名> <密码>')
  mongoose.disconnect().then(() => process.exit(1))
} else {
  create()
}

async function create() {
  try {
    const exists = await User.findOne({ username: USERNAME })
    if (exists) {
      console.log(`⚠️ 用户已存在: ${USERNAME} (${exists._id})`)
      return
    }
    const encPwd = encryptSync(PASSWORD)
    const user = await User.create({ username: USERNAME, password: encPwd })
    console.log(`✅ 管理员账号创建成功: ${USERNAME} (${user._id})`)
  } catch (err) {
    console.error('❌ 创建失败:', err.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}
