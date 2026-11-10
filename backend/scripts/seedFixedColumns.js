/**
 * 按前端固定配置初始化本地板块（9 个）
 * 用法：node scripts/seedFixedColumns.js
 *
 * 为什么必须有这个脚本：
 *   前端 `config/category.config.js` 里写死了 9 个板块的 _id，发文章时直接把这个 _id
 *   传给后端；后端 `routes/bus.js` 会去 columns 集合核对，不存在就报「分类 _id 不存在」。
 *   空库（或只跑过 seedVueNotes 的库）里没有这些 _id，于是**发文章必失败**。
 *
 * 做的事：
 *   ① 按固定 _id upsert 9 个板块（_id 与前端配置一致）
 *   ② 把「不在固定列表里」的板块（如 seedVueNotes 建的 Frontend）下的文章
 *      迁到 Technology，并同步 Column.articles 引用
 *   ③ 删掉这些临时板块
 *
 * 幂等：重复执行不会重复创建，也不会重复迁移。
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const mongoose = require('mongoose')

// 板块固定字典放进 config.js 统一维护（与前端 category.config.js 一一对应）
const { categories: FIXED } = require('../config')

;(async () => {
  await mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
    useUnifiedTopology: true,
    useNewUrlParser: true,
  })
  const db = mongoose.connection.db
  const columns = db.collection('columns')
  const articles = db.collection('articles')

  // ① upsert 固定板块
  for (const item of FIXED) {
    await columns.updateOne(
      { _id: new mongoose.Types.ObjectId(item._id) },
      {
        $set: { name: item.name },
        $setOnInsert: { lastUpdated: new Date(), articles: [] },
      },
      { upsert: true }
    )
  }
  console.log(`① 固定板块已就绪：${FIXED.length} 个`)

  // ② 多余板块下的文章迁到 Technology
  const techId = new mongoose.Types.ObjectId(FIXED[0]._id)
  const fixedIds = FIXED.map((c) => new mongoose.Types.ObjectId(c._id))
  const extras = await columns.find({ _id: { $nin: fixedIds } }).toArray()

  if (!extras.length) {
    console.log('② 没有多余板块，跳过迁移')
  }

  for (const col of extras) {
    const moved = await articles
      .find({ category: col._id })
      .project({ _id: 1 })
      .toArray()
    const ids = moved.map((a) => a._id)

    if (ids.length) {
      await articles.updateMany({ _id: { $in: ids } }, { $set: { category: techId } })
      await columns.updateOne({ _id: techId }, { $addToSet: { articles: { $each: ids } } })
      // 把这些文章从旧板块的引用里摘掉
      await columns.updateOne({ _id: col._id }, { $pull: { articles: { $in: ids } } })
    }
    console.log(`② 板块 ${col.name}(${String(col._id).slice(-6)}) 下 ${ids.length} 篇文章 → Technology`)

    // ③ 清理：旧板块没有文章了才删
    const left = await articles.countDocuments({ category: col._id })
    if (left === 0) {
      await columns.deleteOne({ _id: col._id })
      console.log(`③ 已删除临时板块 ${col.name}(${String(col._id).slice(-6)})`)
    } else {
      console.log(`③ ${col.name} 仍有 ${left} 篇，保留`)
    }
  }

  // 收尾：把 Technology.articles 补齐（历史数据里可能没回填）
  const techArticleIds = await articles.find({ category: techId }).project({ _id: 1 }).toArray()
  await columns.updateOne(
    { _id: techId },
    { $addToSet: { articles: { $each: techArticleIds.map((a) => a._id) } } }
  )

  const finalCols = await columns.find({}).sort({ _id: 1 }).toArray()
  const counts = await articles
    .aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }])
    .toArray()
  const countMap = new Map(counts.map((c) => [String(c._id), c.n]))

  console.log('\n===== 结果 =====')
  for (const c of finalCols) {
    console.log(`  ${c.name.padEnd(12)} ${String(c._id)}  ${countMap.get(String(c._id)) || 0} 篇`)
  }
  console.log(`  板块总数 ${finalCols.length}，文章总数 ${await articles.countDocuments()}`)

  await mongoose.disconnect()
  process.exit(0)
})().catch((err) => {
  console.error('失败:', err.message)
  process.exit(1)
})
