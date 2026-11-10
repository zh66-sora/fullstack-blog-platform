/**
 * 设定站长（唯一）
 * 用法：
 *   node scripts/setOwner.js           查看当前角色分布
 *   node scripts/setOwner.js <用户名>   把该账号设为站长（其他站长降为管理员）
 *
 * 为什么要有这个脚本：注册接口只允许写 username/password/nickname，
 * role 只能由运维在服务端设定 —— 否则谁都能把自己注册成站长。
 * 站点约定：owner 只能有一个，这里会自动把旧的 owner 降为 admin。
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const mongoose = require('mongoose')
const User = require('../models/User')

;(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  })

  const username = process.argv[2]

  if (!username) {
    const users = await User.find().select('username nickname role status').lean()
    console.log('===== 当前账号 =====')
    users.forEach((u) =>
      console.log(
        `  ${String(u.username).padEnd(10)} ${String(u.nickname || '-').padEnd(10)} ` +
        `role=${u.role || 'user'}  status=${u.status || 'active'}`
      )
    )
    console.log('\n用法：node scripts/setOwner.js <username>')
    await mongoose.disconnect()
    process.exit(0)
  }

  const target = await User.findOne({ username })
  if (!target) {
    console.error(`❌ 找不到用户 ${username}`)
    process.exit(1)
  }

  // 旧站长降级（保证 owner 唯一）
  const others = await User.find({ role: 'owner', _id: { $ne: target._id } })
  for (const u of others) {
    u.role = 'admin'
    await u.save()
    console.log(`↩️  原站长 ${u.username} 已降为管理员`)
  }

  target.role = 'owner'
  target.status = 'active'
  target.statusUntil = null
  await target.save()

  console.log(`✅ ${username} 已是站长（owner 全局唯一）`)
  await mongoose.disconnect()
  process.exit(0)
})().catch((err) => {
  console.error('失败:', err.message)
  process.exit(1)
})
