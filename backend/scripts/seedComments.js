/**
 * 灌入评论测试数据（含嵌套回复）
 * 用法: node scripts/seedComments.js
 */
const http = require('http')
const path = require('path')
const fsSync = require('fs')
const mongoose = require('mongoose')

const API = 'http://127.0.0.1:3000'
const DB = 'mongodb://127.0.0.1:27017/test_db'

function request(method, path, { body, token } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, API)
    const payload = body ? JSON.stringify(body) : null
    const opts = {
      method, hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
      headers: { 'Content-Type': 'application/json' },
      timeout: 8000,
    }
    if (payload) opts.headers['Content-Length'] = Buffer.byteLength(payload)
    if (token) opts.headers['Authorization'] = `Bearer ${token}`
    const req = http.request(opts, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d.substring(0, 200) }) }
      })
    })
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

function rsaEncrypt(value) {
  const NodeRSA = require('node-rsa')
  const keyPath = path.join(__dirname, '..', 'auth', 'public.pem')
  const pubKey = fsSync.readFileSync(keyPath, 'utf8')
  const nodersa = new NodeRSA(pubKey)
  nodersa.setOptions({
    encryptionScheme: { scheme: 'pkcs1_oaep', hash: 'sha1', mgf: 'mgf1', mgf1Hash: 'sha1' }
  })
  return nodersa.encrypt(value, 'base64')
}

async function main() {
  console.log('═══ 灌入评论测试数据 ═══\n')

  // 查文章（取标题最长的正常文章）
  await mongoose.connect(DB)
  const Article = require('../models/Article')
  const articles = await Article.find().sort({ _id: 1 }).lean()
  const article = articles.sort((a, b) => (b.title || '').length - (a.title || '').length)[0]
  if (!article) { console.log('❌ 无文章'); process.exit(1) }
  const articleId = String(article._id)
  console.log(`📄 ${article.title} (${articleId})`)

  // 清空旧评论
  const Comment = require('../models/Comment')
  await Comment.deleteMany({})
  await Article.updateMany({}, { $set: { comments: [], commentNum: 0 } })
  await mongoose.disconnect()
  console.log('🧹 已清空旧评论\n')

  // 注册用户
  const ts = Date.now().toString(36).slice(-5)
  const pwd = rsaEncrypt('Abc12345')
  const r1 = await request('POST', '/auth/register', { body: { username: `s1${ts}`.slice(0, 8), password: pwd } })
  const r2 = await request('POST', '/auth/register', { body: { username: `s2${ts}`.slice(0, 8), password: pwd } })
  const tok1 = r1.data?.data?.token; const tok2 = r2.data?.data?.token
  const uid1 = r1.data?.data?.userId; const uid2 = r2.data?.data?.userId
  if (!tok1 || !tok2) { console.log('❌ 注册失败'); process.exit(1) }
  console.log('✅ 2个测试用户\n')

  // 7条顶层评论：先创建6条无回复的，最后创建1条带回复的（让它排第一）
  const textsNoReply = [
    '有个问题想请教，文中的API在生产环境兼容性如何？',
    '收藏了 👍 期待更多好文',
    '能出一篇性能优化的续集吗？',
    '代码示例清晰，直接跑通',
    '这个方案我司也在用，很稳',
    '正好需要，感谢分享！',
  ]
  const cids = []
  for (const t of textsNoReply) {
    const r = await request('POST', '/api/rest/comments', { body: { content: t, article: articleId }, token: tok1 })
    if (r.data?._id) { cids.push(r.data._id); console.log(`  💬 ${t}`) }
  }

  // 最后创建带回复的评论（时间最新→排第一，一眼看到嵌套回复）
  const mainR = await request('POST', '/api/rest/comments', {
    body: { content: '写得太好了，深入浅出！', article: articleId }, token: tok1,
  })
  const mainId = mainR.data?._id
  if (mainId) { cids.push(mainId); console.log(`  💬 写得太好了，深入浅出！⭐(有回复)`) }
  console.log(`\n✅ ${cids.length} 条顶层评论\n`)

  // 给最后那条（mainId）创建5条嵌套回复
  // 用token1和token2交替，模拟不同用户
  const replyData = [
    { content: '谢谢支持！API兼容性没问题', tok: tok2 },
    { content: '赞同，深入浅出确实难得', tok: tok1 },
    { content: '一起学习进步~', tok: tok2 },
    { content: '+1，期待续集', tok: tok1 },
    { content: '很高兴对你有帮助！', tok: tok2 },
  ]
  const rids = []
  for (const r of replyData) {
    const res = await request('POST', '/api/rest/comments', {
      body: { content: r.content, article: articleId, parentComment: mainId, replyTo: uid1 },
      token: r.tok,
    })
    if (res.data?._id) { rids.push(res.data._id); console.log(`  ↩ ${r.content}`) }
  }
  console.log(`\n✅ ${rids.length} 条嵌套回复\n`)

  // 点赞(让前2条回复赞数最高，确保预览中可见)
  await request('POST', `/api/comments/like/${mainId}`, { body: { type: 'like' }, token: tok1 })
  await request('POST', `/api/comments/like/${mainId}`, { body: { type: 'like' }, token: tok2 })
  if (rids[0]) { await request('POST', `/api/comments/like/${rids[0]}`, { body: { type: 'like' }, token: tok1 }); await request('POST', `/api/comments/like/${rids[0]}`, { body: { type: 'like' }, token: tok2 }) }
  if (rids[1]) await request('POST', `/api/comments/like/${rids[1]}`, { body: { type: 'like' }, token: tok1 })
  console.log('✅ 点赞数据已写入\n')

  // 验证API
  const check = await request('GET', `/api/comments/article/${articleId}?page=1&size=5`)
  const d = check.data?.data
  console.log(`═══ 验证 ═══`)
  console.log(`API返回: ${d?.list?.length}条顶层, 第1条下${d?.list?.[0]?.replies?.length}条回复, hasMoreReplies=${d?.list?.[0]?.hasMoreReplies}`)
  console.log(`\n打开 http://localhost:8080 → 进入文章详情 → 查看文章: ${article.title}`)
}

main().catch(e => { console.error(e); process.exit(1) })
