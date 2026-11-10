/**
 * 第二轮前端骨架冒烟测试
 * 验证：评论 API 数据 → ViewModel → 模板渲染链路
 * 用法：
 *   1. 启动后端: cd myapp && npm start
 *   2. 启动前端: cd myBlog && npm start
 *   3. 运行本脚本: node scripts/smokeFrontend.js
 */
const http = require('http')
const mongoose = require('mongoose')

const API = 'http://127.0.0.1:3000'
const WEB = 'http://localhost:8080'
const DB = 'mongodb://127.0.0.1:27017/test_db'

async function get(path, base) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base)
    http.get({ hostname: url.hostname, port: url.port, path: url.pathname + url.search, timeout: 5000 }, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d.substring(0, 200) }) }
      })
    }).on('error', reject)
  })
}

async function main() {
  console.log('═══ 第二轮前端骨架冒烟测试 ═══\n')

  // ── 1. 检查服务 ──
  let apiOk = false, webOk = false
  try { await get('/keys', API); apiOk = true; console.log('✅ 后端已启动') }
  catch { console.log('❌ 后端未启动 (cd myapp && npm start)') }

  try { await get('/', WEB); webOk = true; console.log('✅ 前端已启动') }
  catch { console.log('❌ 前端未启动 (cd myBlog && npm start)') }

  if (!apiOk || !webOk) { process.exit(1) }

  // ── 2. 从 DB 取文章 ID ──
  console.log('\n── 数据链路检查 ──')
  await mongoose.connect(DB, { useUnifiedTopology: true, useNewUrlParser: true })
  const Article = require('../models/Article')
  const article = await Article.findOne().sort({ _id: -1 }).lean()
  await mongoose.disconnect()

  if (!article) { console.log('❌ DB 无文章'); process.exit(1) }
  const articleId = String(article._id)
  console.log(`📄 文章: ${articleId}`)

  // ── 3. 检查评论 API ──
  const r = await get(`/api/comments/article/${articleId}?page=1&size=3`, API)
  if (r.status === 200 && r.data?.data) {
    const d = r.data.data
    console.log(`✅ 评论API: total=${d.total} list=${d.list?.length} hasMore=${d.hasMore}`)
  } else {
    console.log(`❌ 评论API: status=${r.status}`)
  }

  // ── 4. 检查前端页面是否包含评论骨架 ──
  const page = await get(`/article/${articleId}`, WEB)
  // 前端是 SPA(sme-router)，/article/:id 走前端路由，但首次访问需要 index.html
  // 改为检查 index.html + 构建产物
  const html = await get('/', WEB)
  if (html.status === 200) {
    const hasCommentJs = typeof html.data === 'string' && html.data.includes('main.')
    console.log(`✅ 前端页面可访问 (index.html 含构建JS引用: ${hasCommentJs})`)
  }

  // ── 5. 检查构建产物中是否包含评论相关类名 ──
  const fs = require('fs')
  const path = require('path')
  const distDir = path.join(__dirname, '..', '..', 'myBlog', 'dist')
  const files = fs.readdirSync(distDir)
  const mainJs = files.find(f => f.startsWith('main.') && f.endsWith('.js'))
  if (mainJs) {
    const js = fs.readFileSync(path.join(distDir, mainJs), 'utf8')
    const checks = [
      'blog-comment--wrap',
      'blog-comment--mount',
      'blog-comment--input_card',
      'blog-comment--list_card',
      'blog-comment--item',
      'blog-comment--replies',
      'blog-comment_modal--wrap',
      'blog-article--actions',
    ]
    console.log('\n── 构建产物中评论类名检查 ──')
    let found = 0
    checks.forEach(cls => {
      if (js.includes(cls)) { console.log(`  ✅ ${cls}`); found++ }
      else console.log(`  ❌ ${cls} (未找到)`)
    })
    console.log(`\n类名覆盖: ${found}/${checks.length}`)
  } else {
    console.log('❌ 未找到 main.*.js (需先 npm run build)')
  }

  console.log('\n═══ 测试完成 ═══')
}

main().catch(e => { console.error(e); process.exit(1) })
