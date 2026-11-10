/**
 * 评论系统 API 端到端测试
 * 用法: 先启动后端，然后 node scripts/testComments.js
 * 直接用 mongoose 连 DB 取测试数据，避免依赖 GET+body 的可靠性问题
 */
const http = require('http')
const path = require('path')
const fsSync = require('fs')
const mongoose = require('mongoose')

const BASE = 'http://127.0.0.1:3000'
const DB = 'mongodb://127.0.0.1:27017/test_db'

let TOKEN = '', UID = ''
let ARTICLE_ID = ''
let TOP_COMMENT_ID = '', REPLY_ID = ''
let SECOND_TOKEN = '', SECOND_UID = ''

const passed = [], failed = []

// ===== HTTP =====
function request(method, urlPath, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE)
    const payload = body ? JSON.stringify(body) : null
    const options = {
      method, hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    }
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload)
    if (token) options.headers['Authorization'] = `Bearer ${token}`

    const req = http.request(options, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d), _raw: d }) }
        catch { resolve({ status: res.statusCode, data: null, _raw: d }) }
      })
    })
    req.on('error', e => reject(e))
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')) })
    if (payload) req.write(payload)
    req.end()
  })
}
const GET = (p, o) => request('GET', p, o)
const POST = (p, o) => request('POST', p, o)
const DELETE = (p, o) => request('DELETE', p, o)

function ok(name, cond, detail = '') {
  if (cond) { passed.push(name); console.log(`  ✅ ${name}`) }
  else { failed.push(`${name} ${detail}`); console.log(`  ❌ ${name} ${detail}`) }
}

// ===== RSA =====
function rsaEncrypt(value) {
  const NodeRSA = require('node-rsa')
  const keyPath = path.join(__dirname, '..', 'auth', 'public.pem')
  if (!fsSync.existsSync(keyPath)) throw new Error(`公钥不存在: ${keyPath}`)
  const pubKey = fsSync.readFileSync(keyPath, 'utf8')
  const nodersa = new NodeRSA(pubKey)
  nodersa.setOptions({
    encryptionScheme: { scheme: 'pkcs1_oaep', hash: 'sha1', mgf: 'mgf1', mgf1Hash: 'sha1' }
  })
  return nodersa.encrypt(value, 'base64')
}

// ===== 主流程 =====
async function main() {
  console.log('══════════════════════════════════════')
  console.log('  评论系统 API 端到端测试')
  console.log('══════════════════════════════════════\n')

  // ── 0. 连通性 ──
  try { await GET('/keys'); console.log('✅ 后端已连接') }
  catch { console.log('❌ 后端未启动 (npm start)'); process.exit(1) }

  // ── 1. 用 mongoose 连 DB 取测试数据 ──
  console.log('  连 MongoDB...')
  try {
    await mongoose.connect(DB, { useUnifiedTopology: true, useNewUrlParser: true })
    console.log('✅ MongoDB 已连接')
  } catch (e) {
    console.log(`❌ MongoDB 连接失败: ${e.message}`)
    process.exit(1)
  }

  // 查文章
  const Article = require('../models/Article')
  const article = await Article.findOne().sort({ _id: -1 }).lean()
  if (article) {
    ARTICLE_ID = String(article._id)
    console.log(`📄 文章: ${(article.title || '').substring(0, 40)} (${ARTICLE_ID})`)
  } else {
    console.log('⚠️ DB 中无文章')
  }

  // 查一个已有用户（用于如果注册失败时的回退登录）
  const User = require('../models/User')
  const existingUser = await User.findOne().lean()

  await mongoose.disconnect()
  console.log('')

  // ── 2. 注册测试用户 ──
  console.log('── [2] 注册测试用户 ──')
  // 用户名规则: 6-8位纯字母数字混合 (不能全数字或全字母)
  function genUser(prefix) {
    const ts = Date.now().toString(36).slice(-3)   // 3位, 至少含数字(因为时间戳)
    const rnd = Math.floor(Math.random() * 90 + 10) // 2位数字, 保证混合
    return (prefix + ts + rnd).slice(0, 8)
  }
  let encPwd
  try {
    encPwd = rsaEncrypt('Abc12345')
    console.log('  RSA 加密成功')
  } catch (e) {
    console.log(`  ❌ RSA 加密失败: ${e.message}`)
    process.exit(1)
  }

  // 用户A
  const nameA = genUser('tA')
  try {
    const r = await POST('/auth/register', { body: { username: nameA, password: encPwd } })
    console.log(`  A 注册(${nameA}): status=${r.status}`)
    if (r.status === 200 && r.data?.data?.token) {
      TOKEN = r.data.data.token; UID = r.data.data.userId
      console.log(`  👤 A: ${UID}`)
    } else {
      console.log(`  ⚠️ 注册失败: ${r._raw.substring(0, 200)}`)
    }
  } catch (e) { console.log(`  ❌ A 异常: ${e.message}`) }

  // 用户B
  const nameB = genUser('tB')
  try {
    const r = await POST('/auth/register', { body: { username: nameB, password: encPwd } })
    console.log(`  B 注册(${nameB}): status=${r.status}`)
    if (r.status === 200 && r.data?.data?.token) {
      SECOND_TOKEN = r.data.data.token; SECOND_UID = r.data.data.userId
      console.log(`  👤 B: ${SECOND_UID}`)
    } else {
      console.log(`  ⚠️ 注册失败: ${r._raw.substring(0, 200)}`)
    }
  } catch (e) { console.log(`  ❌ B 异常: ${e.message}`) }

  // 如果注册失败，尝试用已有用户登录
  if (!TOKEN && existingUser) {
    console.log('\n  ⚠️ 注册失败，尝试用已有用户登录...')
    try {
      // 已有用户的密码我们不知道，无法测试
      console.log('  无法获取已有用户密码，跳过')
      // 实际上我们需要知道密码...这个路径走不通
    } catch {}
  }

  if (!TOKEN) {
    console.log('\n❌ 无法获取 token。请检查:')
    console.log('  1. auth/ 目录下是否有 public.pem 和 private.pem')
    console.log('  2. 后端控制台是否有错误日志')
    process.exit(1)
  }

  // ── 3. 准备文章（如果 DB 没有就创建一篇）──
  if (!ARTICLE_ID) {
    console.log('\n── [3] 创建测试文章 ──')
    try {
      const r = await POST('/api/rest/article', {
        body: {
          title: '【测试】评论API测试文章',
          content: encodeURI('<p>自动化测试用</p>'),
          publishDate: new Date(),
        },
        token: TOKEN,
      })
      console.log(`  创建文章: status=${r.status}`)
      if (r.status === 200 && r.data?._id) {
        ARTICLE_ID = r.data._id
        console.log(`  📄 ${ARTICLE_ID}`)
      } else {
        console.log(`  ⚠️ 创建失败: ${r._raw.substring(0, 300)}`)
      }
    } catch (e) { console.log(`  ❌ 异常: ${e.message}`) }
  }

  if (!ARTICLE_ID) {
    console.log('❌ 无文章可用，终止')
    process.exit(1)
  }

  // ==============================================================
  console.log('\n══════════════════════════════════════')
  console.log(`  开始测试: ARTICLE_ID=${ARTICLE_ID}`)
  console.log(`  TOKEN=${TOKEN ? TOKEN.substring(0,20)+'...' : '(无)'}`)
  console.log('══════════════════════════════════════')

  // ── Phase 1: 创建评论 ──
  console.log('\n── Phase 1: 创建评论 ──')

  try {
    const r = await POST('/api/rest/comments', {
      body: { content: '【测试】顶层评论', article: ARTICLE_ID }, token: TOKEN,
    })
    ok('1.1 创建顶层评论', r.status === 200 && !!r.data?._id,
      `s=${r.status} r=${r._raw.substring(0,120)}`)
    TOP_COMMENT_ID = r.data?._id || ''
  } catch (e) { ok('1.1 异常', false, e.message) }

  if (TOP_COMMENT_ID) {
    try {
      const r = await GET(`/api/rest/article/${ARTICLE_ID}`)
      const art = r.data?.data
      const inArr = (art?.comments || []).some(c => String(c._id || c) === TOP_COMMENT_ID)
      ok('1.2 comment入Article.comments', inArr, `num=${art?.commentNum}`)
      ok('1.2 commentNum≥1', (art?.commentNum || 0) >= 1, `n=${art?.commentNum}`)
    } catch (e) { ok('1.2 异常', false, e.message) }
  }

  if (TOP_COMMENT_ID) {
    try {
      const r = await POST('/api/rest/comments', {
        body: { content: '【测试】首轮回复', article: ARTICLE_ID, parentComment: TOP_COMMENT_ID },
        token: TOKEN,
      })
      ok('1.3 首轮回复', r.status === 200 && !!r.data?._id, `s=${r.status}`)
      REPLY_ID = r.data?._id || ''
    } catch (e) { ok('1.3 异常', false, e.message) }
  }

  if (SECOND_TOKEN && TOP_COMMENT_ID && UID) {
    try {
      const r = await POST('/api/rest/comments', {
        body: {
          content: '【测试】深层回复(应显示@用户A)',
          article: ARTICLE_ID, parentComment: TOP_COMMENT_ID, replyTo: UID,
        },
        token: SECOND_TOKEN,
      })
      ok('1.4 深层回复(replyTo)', r.status === 200 && !!r.data?._id, `s=${r.status}`)
    } catch (e) { ok('1.4 异常', false, e.message) }
  }

  if (REPLY_ID) {
    try {
      const r = await GET(`/api/rest/article/${ARTICLE_ID}`)
      const arr = r.data?.data?.comments || []
      ok('1.5 回复不在Article.comments', !arr.some(c => String(c._id || c) === REPLY_ID))
    } catch (e) { ok('1.5 异常', false, e.message) }
  }

  // ── Phase 2: 查询 ──
  console.log('\n── Phase 2: 评论查询 API ──')
  if (ARTICLE_ID) {
    try {
      const r = await GET(`/api/comments/article/${ARTICLE_ID}?page=1&size=5`)
      const d = r.data?.data
      ok('2.1 status=200', r.status === 200, `s=${r.status}`)
      ok('2.1 list数组', Array.isArray(d?.list), `t=${typeof d?.list}`)
      if (d) {
        ok('2.1 分页完整', 'page' in d && 'total' in d && 'hasMore' in d,
          `p=${d.page} t=${d.total} hm=${d.hasMore}`)
        const our = d.list?.find(c => String(c._id) === TOP_COMMENT_ID)
        if (our) {
          ok('2.1 评论在列表中', true)
          ok('2.1 author已populate', !!our.author?.username, JSON.stringify(our.author))
          ok('2.1 含replyCount', 'replyCount' in our, `rc=${our.replyCount} rpl=${our.replies?.length}`)
        }
      }
    } catch (e) { ok('2.1 异常', false, e.message) }
  }

  if (TOP_COMMENT_ID) {
    try {
      const r = await GET(`/api/comments/replies/${TOP_COMMENT_ID}?page=1&size=20`)
      const d = r.data?.data
      ok('2.2 status=200', r.status === 200, `s=${r.status}`)
      ok('2.2 list数组', Array.isArray(d?.list), `len=${d?.list?.length}`)
      ok('2.2 回复≥1', (d?.list?.length || 0) >= 1)
      const deep = d?.list?.find(r => r.replyTo?.username)
      if (deep) ok('2.2 replyTo populated', !!deep.replyTo.username)
    } catch (e) { ok('2.2 异常', false, e.message) }
  }

  // ── Phase 3: 赞/踩 ──
  console.log('\n── Phase 3: 赞/踩 toggle ──')
  if (TOP_COMMENT_ID) {
    const id = TOP_COMMENT_ID
    try {
      const r1 = await POST(`/api/comments/like/${id}`, { body: { type: 'like' }, token: TOKEN })
      ok('3.1 点赞→liked', r1.data?.data?.userAction === 'liked',
        `act=${r1.data?.data?.userAction} like=${r1.data?.data?.likeNum}`)
      ok('3.1 likeNum=1', r1.data?.data?.likeNum === 1)

      const r2 = await POST(`/api/comments/like/${id}`, { body: { type: 'like' }, token: TOKEN })
      ok('3.2 再次→取消', r2.data?.data?.userAction === 'none')
      ok('3.2 likeNum=0', r2.data?.data?.likeNum === 0)

      const r3 = await POST(`/api/comments/like/${id}`, { body: { type: 'dislike' }, token: TOKEN })
      ok('3.3 切换踩', r3.data?.data?.userAction === 'disliked', `act=${r3.data?.data?.userAction}`)
      ok('3.3 like=0 dislike=1', r3.data?.data?.likeNum===0 && r3.data?.data?.dislikeNum===1)

      const r4 = await POST(`/api/comments/like/${id}`, { body: { type: 'dislike' }, token: TOKEN })
      ok('3.4 取消踩', r4.data?.data?.userAction === 'none')
    } catch (e) { ok('Phase3 异常', false, e.message) }
  }

  // ── Phase 4: 边界 ──
  console.log('\n── Phase 4: 边界测试 ──')
  if (ARTICLE_ID && TOKEN) {
    try {
      const r = await POST('/api/rest/comments', {
        body: { content: '   ', article: ARTICLE_ID }, token: TOKEN,
      })
      ok('4.1 空内容→422', r.status === 422, `s=${r.status}`)
    } catch (e) {}
    try {
      const r = await POST('/api/rest/comments', {
        body: { content: 'x', article: ARTICLE_ID, parentComment: '692c96c18e66b34d97908c51' },
        token: TOKEN,
      })
      ok('4.2 假父评论→422', r.status === 422, `s=${r.status}`)
    } catch (e) {}
    try {
      const r = await POST('/api/rest/comments', { body: { content: 'x' }, token: TOKEN })
      ok('4.5 缺article→非200', r.status !== 200, `s=${r.status}`)
    } catch (e) {}
  }
  if (TOP_COMMENT_ID) {
    try {
      const r = await POST(`/api/comments/like/${TOP_COMMENT_ID}`, { body: { type: 'like' } })
      ok('4.3 未登录点赞→非200', r.status !== 200, `s=${r.status}`)
    } catch (e) {}
  }
  if (ARTICLE_ID) {
    try {
      const r = await GET(`/api/comments/article/${ARTICLE_ID}?page=1&size=1`)
      ok('4.4 GET免登录→200', r.status === 200, `s=${r.status}`)
    } catch (e) {}
  }

  // ── 清理 ──
  console.log('\n── 清理 ──')
  if (REPLY_ID) { try { await DELETE(`/api/rest/comments/${REPLY_ID}`, { token: TOKEN }) } catch {} }
  if (TOP_COMMENT_ID) { try { await DELETE(`/api/rest/comments/${TOP_COMMENT_ID}`, { token: TOKEN }) } catch {} }

  // ── 结果 ──
  console.log(`\n✅ ${passed.length}  ❌ ${failed.length}`)
  if (failed.length) failed.forEach(f => console.log(`  ❌ ${f}`))
  console.log('')
  process.exit(failed.length > 0 ? 1 : 0)
}

main().catch(e => { console.error('FATAL:', e); process.exit(1) })
