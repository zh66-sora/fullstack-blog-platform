/**
 * 他人主页 · 公开资料接口冒烟测试
 * =========================================================================
 * 用法：先启动后端（npm start），再运行 `node scripts/testUserProfile.js`
 *
 * 覆盖的规则：
 *   ① GET /api/profile/:userId 游客可读（200）
 *   ② 只吐 PUBLIC_FIELDS 白名单里的字段 —— **绝不吐 email / password / __v / banner**
 *      （email 是本条接口存在的原因：通用 CRUD 那条路会把它一起吐出来，见下面的对照测试）
 *   ③ 非法 id → 422；不存在的合法 id → 404
 *   ④ GET /api/profile（取自己完整资料）依旧**要求登录**，没有被上面的白名单顺带放行
 *
 * ⚠ token 是用 auth/private.pem 现签的（payload 只要 { uid }），不走登录流程。
 */
const fs = require('fs')
const http = require('http')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')

const API = 'http://127.0.0.1:3000'
const privateKey = fs.readFileSync('./auth/private.pem', 'utf8')
const tokenFor = (uid) => jwt.sign({ uid: String(uid) }, privateKey, { algorithm: 'RS256' })

function call(method, urlPath, token) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: 3000,
        path: urlPath,
        method,
        timeout: 15000,
        headers: token ? { Authorization: 'Bearer ' + token } : {},
      },
      (res) => {
        let raw = ''
        res.on('data', (c) => (raw += c))
        res.on('end', () => {
          let json = null
          try { json = JSON.parse(raw) } catch { json = raw }
          resolve({ status: res.statusCode, body: json })
        })
      }
    )
    req.on('error', (e) => resolve({ status: 0, body: e.message }))
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, body: 'timeout' }) })
    req.end()
  })
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
  const users = await User.find({}).select('_id nickname username').limit(2).lean()
  if (users.length < 2) { console.log('库里至少要 2 个用户'); process.exit(1) }
  const [A, B] = users
  const tokenA = tokenFor(A._id)
  console.log(`A=${A.nickname}(${A._id})  B=${B.nickname}(${B._id})\n`)

  // ── ① 游客可读 ─────────────────────────────────────────────
  console.log('── ① 游客（无 token）也能读公开资料 ──')
  let r = await call('GET', `/api/profile/${A._id}`)
  check('游客读他人资料 200', r.status === 200, `→ ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`)
  const data = r.body?.data || {}

  // ── ② 字段白名单（这一条是本接口存在的理由）──────────────────
  console.log('\n── ② 字段白名单：敏感字段一个都不许出去 ──')
  const keys = Object.keys(data).sort()
  console.log(`     实际返回的字段：${JSON.stringify(keys)}`)
  const allowed = ['_id', 'avatar', 'bio', 'friendLinks', 'nickname', 'socialLinks', 'username']
  check('字段集 == 白名单', JSON.stringify(keys) === JSON.stringify(allowed), `→ ${JSON.stringify(keys)}`)
  ;['email', 'password', '__v', 'date', 'banner'].forEach((bad) => {
    check(`不含 ${bad}`, !(bad in data), `→ 泄漏了 ${bad} = ${data[bad]}`)
  })

  // 对照：通用 CRUD 那条路确实会吐 email —— 所以他人主页不能走它
  const crud = await call('GET', `/api/rest/users/${A._id}`)
  const crudKeys = Object.keys(crud.body?.data || {})
  console.log(`     对照 GET /api/rest/users/:id 的字段：${JSON.stringify(crudKeys.sort())}`)
  check('对照成立：通用 CRUD 确实带 email（这就是不能走它的原因）',
    crudKeys.includes('email'), `→ ${JSON.stringify(crudKeys.sort())}`)

  // ── ③ 参数错误的两种返回 ───────────────────────────────────
  console.log('\n── ③ 参数错误 ──')
  r = await call('GET', '/api/profile/not-an-id')
  check('非法 id → 422', r.status === 422, `→ ${r.status} ${r.body?.message}`)

  r = await call('GET', '/api/profile/000000000000000000000000')
  check('不存在的合法 id → 404', r.status === 404, `→ ${r.status} ${r.body?.message}`)

  // ── ④ 取自己完整资料依旧要登录 ─────────────────────────────
  console.log('\n── ④ 自己的完整资料没有被白名单顺带放行 ──')
  r = await call('GET', '/api/profile')
  check('无 token 读 /api/profile → 非 200', r.status !== 200, `→ ${r.status}`)

  r = await call('GET', '/api/profile', tokenA)
  const mine = r.body?.data || {}
  check('带 token 读 /api/profile → 200', r.status === 200, `→ ${r.status}`)
  check('自己的资料是完整文档（含 email，因为有 token）',
    Object.keys(mine).length > Object.keys(data).length, `→ 字段数 ${Object.keys(mine).length} vs 公开版 ${Object.keys(data).length}`)

  // ── ⑤ 换个用户读得到（不是写死当前用户）─────────────────────
  console.log('\n── ⑤ 按 id 取的是「那个人」 ──')
  r = await call('GET', `/api/profile/${B._id}`)
  check(`读到的是 B（${B.nickname}）`, r.body?.data?.nickname === B.nickname, `→ ${r.body?.data?.nickname}`)

  mongoose.disconnect()
  console.log(`\n═══ 通过 ${pass} / 失败 ${fail} ═══`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
