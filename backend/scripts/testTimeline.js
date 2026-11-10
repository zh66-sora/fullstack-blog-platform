/**
 * 时间线接口冒烟测试
 * =========================================================================
 * 用法：先启动后端（npm start），再运行 `node scripts/testTimeline.js`
 *
 * 覆盖的规则：
 *   ① POST /upload/timeline  —— 新增的 timeline 分类真的能落盘（不被兜到 other/）
 *   ② PUT  /api/timeline     —— 未登录被拒 / 列表为空被拒 /
 *                               逐条四字段必填（提示带「第 N 条」）/ 年月日格式校验
 *   ③ PUT  /api/timeline     —— 落库时按年月日升序排好
 *   ④ GET  /api/timeline/:id —— 游客可读（公开）、isSelf 位正确
 *   ⑤ upsert —— 同一个用户反复保存只留一条文档，且是整体覆盖（不是追加）
 *
 * ⚠ token 是用 auth/private.pem 现签的（payload 只要 { uid }），
 *   不走 /auth/login 的 RSA 加密流程 —— 这里要验的是时间线自己的规则，不是登录。
 */
const fs = require('fs')
const path = require('path')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')

const API = 'http://127.0.0.1:3000'
const privateKey = fs.readFileSync('./auth/private.pem', 'utf8')
const tokenFor = (uid) => jwt.sign({ uid: String(uid) }, privateKey, { algorithm: 'RS256' })

async function call(method, urlPath, token, body, options = {}) {
  const headers = { ...(options.headers || {}) }
  // FormData 自己带 boundary，不能手写 Content-Type
  if (!options.formData) headers['Content-Type'] = 'application/json'
  if (token) headers.Authorization = 'Bearer ' + token
  const res = await fetch(API + urlPath, {
    method,
    headers,
    ...(body ? { body: options.formData ? body : JSON.stringify(body) } : {}),
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

/** 一张最小的合法 PNG（1×1 透明），用来验上传通路 */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
)

const img = (name) => `${API}/timeline/${name}.jpg`

async function main() {
  await mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
    useUnifiedTopology: true, useNewUrlParser: true,
  })
  const User = require('../models/User')
  const Timeline = require('../models/Timeline')
  const users = await User.find({}).select('_id username nickname').limit(2).lean()
  if (users.length < 2) { console.log('库里至少要 2 个用户'); process.exit(1) }
  const [A, B] = users
  const tA = tokenFor(A._id), tB = tokenFor(B._id)
  console.log(`A=${A.nickname}(${A._id})  B=${B.nickname}(${B._id})\n`)

  // 干净起点：A 的时间线先清掉（B 的不要碰，脚本不假设 B 没配过）
  await Timeline.deleteMany({ owner: A._id })

  // ────────────────────────────────────────────────────────────
  console.log('── ① 上传分类 timeline ──')
  const fd = new FormData()
  fd.append('file', new Blob([TINY_PNG], { type: 'image/png' }), 'smoke.png')
  let r = await call('POST', '/upload/timeline', tA, fd, { formData: true })
  const filePath = r.data?.data?.[0]?.filePath || ''
  check('POST /upload/timeline 返回 200', r.status === 200, `→ ${r.status} ${r.data?.message}`)
  check('落到了 timeline/ 目录（不是 other/）', filePath.includes('/timeline/'), `→ ${filePath}`)
  console.log(`     filePath = ${filePath}`)
  // 顺手把这张测试图删掉，不给 uploads 留垃圾
  if (filePath) {
    const local = path.join(__dirname, '..', 'uploads', 'timeline', path.basename(filePath))
    try { fs.unlinkSync(local) } catch { /* 已不在就算了 */ }
  }

  // ────────────────────────────────────────────────────────────
  console.log('\n── ② 保存接口的校验 ──')
  const goodItem = (date, title) => ({
    backgroundImage: img(date), title, date, description: `关于 ${title} 的一段说明`,
  })

  r = await call('PUT', '/api/timeline', null, { backgroundImage: img('bg'), items: [goodItem('2001-01-01', '一')] })
  check('未登录不能保存', r.status !== 200, `→ ${r.status}`)

  r = await call('PUT', '/api/timeline', tA, { backgroundImage: img('bg'), items: [] })
  check('空列表被拒', r.status === 422, `→ ${r.status} ${r.data?.message}`)
  console.log(`     后端提示：${r.data?.message}`)

  r = await call('PUT', '/api/timeline', tA, { backgroundImage: img('bg'), items: [{ backgroundImage: img('x'), date: '2001-01-01', description: 'd' }] })
  check('缺标题被拒', r.status === 422, `→ ${r.status} ${r.data?.message}`)
  check('提示带「第 1 条」', String(r.data?.message || '').includes('第 1 条'), `→ ${r.data?.message}`)
  console.log(`     后端提示：${r.data?.message}`)

  r = await call('PUT', '/api/timeline', tA, { backgroundImage: img('bg'), items: [goodItem('2001-01-01', '一'), { ...goodItem('2002-01-01', '二'), description: '' }] })
  check('缺说明被拒且序号是「第 2 条」', r.status === 422 && String(r.data?.message).includes('第 2 条'), `→ ${r.status} ${r.data?.message}`)
  console.log(`     后端提示：${r.data?.message}`)

  r = await call('PUT', '/api/timeline', tA, { backgroundImage: img('bg'), items: [{ ...goodItem('2001-01-01', '一'), date: '2001/01/01' }] })
  check('年月日格式不对被拒', r.status === 422, `→ ${r.status} ${r.data?.message}`)
  console.log(`     后端提示：${r.data?.message}`)

  r = await call('PUT', '/api/timeline', tA, { backgroundImage: '', items: [goodItem('2001-01-01', '一')] })
  check('缺整页面背景图被拒', r.status === 422, `→ ${r.status} ${r.data?.message}`)
  console.log(`     后端提示：${r.data?.message}`)

  // ────────────────────────────────────────────────────────────
  console.log('\n── ③ 保存成功 + 落库即升序 ──')
  // ⚠ 故意倒着提交：2012 → 2005 → 2001，保存后应该是 2001 → 2005 → 2012
  r = await call('PUT', '/api/timeline', tA, {
    backgroundImage: img('bg-main'),
    items: [
      goodItem('2012-05-12', '第三件'),
      goodItem('2005-03-08', '第二件'),
      goodItem('2001-11-02', '第一件'),
    ],
  })
  check('保存返回 200', r.status === 200, `→ ${r.status} ${r.data?.message}`)
  const savedDates = (r.data?.data?.items || []).map((it) => it.date)
  check('返回体里已按年月日升序', JSON.stringify(savedDates) === JSON.stringify(['2001-11-02', '2005-03-08', '2012-05-12']), `→ ${JSON.stringify(savedDates)}`)
  check('整页面背景图存下来了', r.data?.data?.backgroundImage === img('bg-main'), `→ ${r.data?.data?.backgroundImage}`)

  const inDb = await Timeline.findOne({ owner: A._id }).lean()
  const dbDates = (inDb?.items || []).map((it) => it.date)
  check('库里也是升序（先排好再落库）', JSON.stringify(dbDates) === JSON.stringify(['2001-11-02', '2005-03-08', '2012-05-12']), `→ ${JSON.stringify(dbDates)}`)

  // ────────────────────────────────────────────────────────────
  console.log('\n── ④ 读接口：游客可读 + isSelf ──')
  r = await call('GET', `/api/timeline/${A._id}`, null)
  check('游客（无 token）能读到', r.status === 200 && (r.data?.data?.items || []).length === 3, `→ ${r.status} ${r.data?.message}`)
  check('游客视角 isSelf=false', r.data?.data?.isSelf === false, `→ ${r.data?.data?.isSelf}`)

  r = await call('GET', `/api/timeline/${A._id}`, tA)
  check('本人视角 isSelf=true', r.data?.data?.isSelf === true, `→ ${r.data?.data?.isSelf}`)

  r = await call('GET', `/api/timeline/${A._id}`, tB)
  check('他人视角 isSelf=false', r.data?.data?.isSelf === false, `→ ${r.data?.data?.isSelf}`)

  r = await call('GET', '/api/timeline/not-an-id', null)
  check('非法 userId 被拒', r.status === 422, `→ ${r.status} ${r.data?.message}`)

  // 没配过的用户：200 + 空结构（不是 404）
  await Timeline.deleteMany({ owner: B._id })
  r = await call('GET', `/api/timeline/${B._id}`, null)
  check('没配过返回 200 + 空结构', r.status === 200 && Array.isArray(r.data?.data?.items) && r.data.data.items.length === 0, `→ ${r.status}`)

  // ────────────────────────────────────────────────────────────
  console.log('\n── ⑤ upsert：只留一条 + 整体覆盖 ──')
  r = await call('PUT', '/api/timeline', tA, {
    backgroundImage: img('bg-2'),
    items: [goodItem('2020-01-01', '只剩这一条')],
  })
  check('二次保存返回 200', r.status === 200, `→ ${r.status} ${r.data?.message}`)

  const count = await Timeline.countDocuments({ owner: A._id })
  check('同一用户只有一条文档', count === 1, `→ ${count} 条`)

  r = await call('GET', `/api/timeline/${A._id}`, null)
  const after = r.data?.data?.items || []
  check('是整体覆盖（不是追加）', after.length === 1 && after[0].title === '只剩这一条', `→ ${JSON.stringify(after.map((i) => i.title))}`)

  // 清理
  await Timeline.deleteMany({ owner: A._id })
  mongoose.disconnect()

  console.log(`\n═══ 通过 ${pass} / 失败 ${fail} ═══`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error('FATAL', e.message); process.exit(1) })
