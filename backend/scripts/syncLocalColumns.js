/**
 * 用本地固定的 9 个板块替换线上板块，并把现有文章归到 Technology
 * 用法：在 myapp 目录下执行  node scripts/syncLocalColumns.js
 *
 * 背景：线上初始化时错建了一个自造的 Frontend 板块，实际本地板块是固定的 9 个
 *      （Technology / Life / Thoughts / Reading / Product / Design / Startup / Tools / Misc）。
 *      本脚本按本地板块的 _id + name 原样重建，删掉 Frontend，
 *      现有文章（Vue 笔记）全部归入 Technology。
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const mongoose = require('mongoose')
mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
  useUnifiedTopology: true,
  useNewUrlParser: true,
})

const Column = require('../models/Column')
const Article = require('../models/Article')

// 本地 MongoDB 里固定的板块（_id 与本地一致，便于两边对照）
const LAST_UPDATED = new Date('2026-07-18T16:07:09.000Z') // 本地 lastUpdated：2026-07-19 00:07:09 +08:00
const COLUMNS = [
  ['6a5a1b3064e65f517c9056bd', 'Technology'],
  ['6a5a1b3064e65f517c9056c0', 'Life'],
  ['6a5a1b3064e65f517c9056c3', 'Thoughts'],
  ['6a5a1b3064e65f517c9056c6', 'Reading'],
  ['6a5a1b3064e65f517c9056c9', 'Product'],
  ['6a5a1b3064e65f517c9056cc', 'Design'],
  ['6a5a1b3064e65f517c9056cf', 'Startup'],
  ['6a5a1b3064e65f517c9056d2', 'Tools'],
  ['6a5a1b3064e65f517c9056d5', 'Misc'],
]
const TECH_ID = COLUMNS[0][0]

async function main() {
  try {
    const arts = await Article.find().lean()
    console.log(`现有文章: ${arts.length} 篇`)

    // 1. 清掉线上全部板块（含误建的 Frontend），写入本地 9 个
    const before = await Column.find().lean()
    console.log('清理前板块:', before.map((c) => c.name).join(', ') || '(空)')
    await Column.deleteMany({})
    await Column.insertMany(
      COLUMNS.map(([id, name]) => ({
        _id: new mongoose.Types.ObjectId(id),
        name,
        lastUpdated: LAST_UPDATED,
        articles: [],
      }))
    )
    console.log(`✅ 已写入 ${COLUMNS.length} 个板块`)

    // 2. 现有文章全部归入 Technology
    const res = await Article.updateMany({}, { $set: { category: new mongoose.Types.ObjectId(TECH_ID) } })
    // mongoose 5 的 updateMany 返回 { n, nModified, ok }（无 modifiedCount）
    console.log(`✅ ${res.nModified != null ? res.nModified : res.n} 篇文章 category 改为 Technology`)

    // 3. 回填 Technology 的 articles 引用
    await Column.updateOne(
      { _id: TECH_ID },
      { $set: { articles: arts.map((a) => a._id) } }
    )
    console.log(`✅ Technology 文章引用已回填 ${arts.length} 篇`)

    // 4. 校验
    const cols = await Column.find().lean()
    console.log('\n📊 线上板块:')
    cols.forEach((c) => console.log(`   ${c.name} — ${c.articles.length} 篇`))
  } catch (err) {
    console.error('❌ 失败:', err.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

main()
