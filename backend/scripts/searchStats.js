/**
 * 搜索索引体检脚本
 * 用法：在 myapp 目录下执行  node scripts/searchStats.js
 *
 * 作用：
 *   ① 用库里的文章离线重建一份索引，打印「篇数 / 词数 / 平均长度 / 构建耗时 / 估算内存」
 *      —— 这几个数就是阶段 4 压测表的实测口径，换数据量重跑即可
 *   ② 和服务启动日志里的 `[search] 索引构建完成：N 篇 / M 个词` 对比，
 *      两边对不上说明增量更新有漂移
 *
 * ⚠ 它是独立进程，**不能改线上正在跑的索引**。
 *   要让线上立刻全量重建，用 `pm2 restart myapp`（启动时会 rebuild）。
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const mongoose = require('mongoose')
const { buildIndex } = require('../core/search')

function mb(bytes) {
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

;(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  })

  const t0 = Date.now()
  // ⚠ 直接读 collection，不走 models/Article：
  //   Article 模型里 require 了 ../app，会把整个 express 应用连带起来（还会注册
  //   「连接打开就 rebuild」的回调，脚本一 disconnect 就打出假的构建失败日志）。
  const articles = await mongoose.connection.db
    .collection('articles')
    .find({}, { projection: { title: 1, content: 1 } })
    .toArray()
  const builtAt = Date.now()
  const index = buildIndex(articles)
  const builtMs = Date.now() - builtAt

  console.log('===== 索引体检 =====')
  console.log(`文章数      ${index.docCount}`)
  console.log(`词表大小    ${index.postings.size}`)
  console.log(`平均文档词数 ${Math.round(index.avgDocLen)}`)
  console.log(`全量构建    ${builtMs} ms（读取库 ${builtAt - t0} ms）`)

  // 粗略内存：tf 表 + 词表 + 文档长度表。只用于估算量级，不是精确 RSS。
  let postingEntries = 0
  for (const bucket of index.postings.values()) postingEntries += bucket.size
  const roughBytes =
    postingEntries * 64 + // 每个 (docId, tf) 条目
    index.postings.size * 80 + // 每个词条
    index.docLen.size * 40
  console.log(`倒排条目    ${postingEntries}`)
  console.log(`估算内存    ${mb(roughBytes)}（进程实际 RSS 见 process.memoryUsage）`)
  console.log(`进程 RSS    ${mb(process.memoryUsage().rss)}`)

  console.log('\n===== 排名前 10 的高频词 =====')
  ;[...index.postings.entries()]
    .map(([term, bucket]) => [term, bucket.size])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .forEach(([term, df], i) => console.log(`  ${String(i + 1).padStart(2)}. ${term}  df=${df}`))

  // 启动时那份索引的 stats 在服务进程里，这里只能提示怎么比
  console.log('\n对比线上：pm2 logs myapp --lines 50 | grep "索引构建完成"')

  await mongoose.disconnect()
  process.exit(0)
})().catch((err) => {
  console.error('失败:', err.message)
  process.exit(1)
})
