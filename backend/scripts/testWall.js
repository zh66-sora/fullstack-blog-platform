/**
 * 留言墙接口冒烟测试
 * =========================================================================
 * 用法：先启动后端（npm start），再运行 `node scripts/testWall.js`
 *
 * 三个角色（从库里取前三个用户）：
 *   A = 板主（留言板主人）
 *   B = 在 A 板上留言的人
 *   C = 第三人（既不是板主也不是留言作者）
 *
 * 覆盖的规则：
 *   ① 正文 30 字通过 / 31 字被拒（**后端侧**的字数校验，与前端计数器互为冗余）
 *   ② 只有板主和留言作者可以互相回复 —— C 回复被拒
 *   ③ 删除：只有板主和作者 —— C 删被拒
 *   ④ 删顶层留言时级联删掉它的回复
 *
 * ⚠ token 是用 auth/private.pem 现签的（payload 只要 { uid }），
 *   不走 /auth/login 的 RSA 加密流程 —— 这里要验的是留言墙自己的权限，
 *   不是登录。
 */
const fs = require('fs')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')

const API = 'http://127.0.0.1:3000'
const privateKey = fs.readFileSync('./auth/private.pem', 'utf8')
const tokenFor = (uid) => jwt.sign({ uid: String(uid) }, privateKey, { algorithm: 'RS256' })

async function call(method, path, token, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  let data
  try { data = await res.json() } catch { data = {} }
  return { status: res.status, data }
}

let pass = 0, fail = 0
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name} ${extra}`) }
}

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
    useUnifiedTopology: true, useNewUrlParser: true,
  })
  const User = require('../models/User')
  const WallMessage = require('../models/WallMessage')
  const users = await User.find({}).select('_id username nickname').limit(3).lean()
  // ⚠ 全程保持连接：脚本后面还要直接查 WallMessage 数「级联删除后剩几条」，
  //   中途 disconnect 会让后面的操作卡在 buffering 直到超时

  if (users.length < 3) { console.log('库里至少要 3 个用户'); process.exit(1) }
  const [A, B, C] = users
  const tA = tokenFor(A._id), tB = tokenFor(B._id), tC = tokenFor(C._id)
  console.log(`板主 A=${A.nickname}(${A._id})  留言者 B=${B.nickname}  第三人 C=${C.nickname}\n`)

  // 清掉这个板上的旧数据，保证每次跑都是干净的
  await WallMessage.deleteMany({ wall: A._id })

  console.log('── ① 字数上限 ──')
  const s30 = '一二三四五六七八九十一二三四五六七八九十一二三四五六七八九十' // 30 字
  const s31 = s30 + '一'
  console.log(`  30 字样本长度=${[...s30].length}，31 字样本长度=${[...s31].length}`)

  let r = await call('POST', '/api/wall', tB, { wall: String(A._id), content: s31 })
  check('31 字被拒', r.status === 422, `→ ${r.status} ${r.data?.message}`)
  console.log(`     后端提示：${r.data?.message}`)

  r = await call('POST', '/api/wall', tB, { wall: String(A._id), content: s30 })
  check('30 字通过', r.status === 200 && !!r.data?.data?._id, `→ ${r.status} ${r.data?.message}`)
  const msgId = r.data?.data?._id

  r = await call('POST', '/api/wall', null, { wall: String(A._id), content: '没登录' })
  check('未登录不能留言', r.status !== 200, `→ ${r.status}`)

  console.log('\n── ② 回复权限 ──')
  r = await call('POST', '/api/wall', tC, {
    wall: String(A._id), content: '第三人插一句', parentMessage: msgId,
  })
  check('第三人不能回复别人的留言', r.status === 422, `→ ${r.status} ${r.data?.message}`)
  console.log(`     后端提示：${r.data?.message}`)

  r = await call('POST', '/api/wall', tA, {
    wall: String(A._id), content: '板主回复', parentMessage: msgId,
  })
  check('板主可以回复', r.status === 200, `→ ${r.status} ${r.data?.message}`)

  r = await call('POST', '/api/wall', tB, {
    wall: String(A._id), content: '作者再回一句', parentMessage: msgId,
  })
  check('留言作者可以回复', r.status === 200, `→ ${r.status} ${r.data?.message}`)

  console.log('\n── ③ 列表与权限位 ──')
  r = await call('GET', `/api/wall/${A._id}?page=1&size=10`, tA)
  const list = r.data?.data?.list || []
  check(`列表返回留言（total=${r.data?.data?.total}）`, list.length >= 1, `→ ${r.status}`)
  const first = list[0]
  check('附带上回复（replyCount=2）', first?.replyCount === 2, `→ ${first?.replyCount}`)
  check('板主视角 canDelete=true', first?.canDelete === true)
  check('板主视角 canReply=true', first?.canReply === true)

  r = await call('GET', `/api/wall/${A._id}?page=1&size=10`, tC)
  const cFirst = (r.data?.data?.list || [])[0]
  check('第三人视角 canDelete=false', cFirst?.canDelete === false)
  check('第三人视角 canReply=false', cFirst?.canReply === false)

  console.log('\n── ④ 删除权限 ──')
  r = await call('DELETE', `/api/wall/${msgId}`, tC)
  check('第三人不能删', r.status === 422, `→ ${r.status} ${r.data?.message}`)

  r = await call('DELETE', `/api/wall/${msgId}`, tA)
  check('板主可以删', r.status === 200, `→ ${r.status} ${r.data?.message}`)

  const left = await WallMessage.countDocuments({ wall: A._id })
  check('回复被级联删除（板上已清空）', left === 0, `→ 还剩 ${left} 条`)

  // 清理
  await WallMessage.deleteMany({ wall: A._id })
  mongoose.disconnect()

  console.log(`\n═══ 通过 ${pass} / 失败 ${fail} ═══`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
