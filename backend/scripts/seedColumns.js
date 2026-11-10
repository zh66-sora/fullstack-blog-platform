/**
 * 初始化 Column 分类数据
 * 运行: node seed/seedColumns.js
 */
const mongoose = require('mongoose')
const Column = require('../models/Column')

const CATEGORIES = [
  'Technology',
  'Life',
  'Thoughts',
  'Reading',
  'Product',
  'Design',
  'Startup',
  'Tools',
  'Misc',
]

mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
  useUnifiedTopology: true,
  useNewUrlParser: true,
})

const db = mongoose.connection

db.on('error', (err) => {
  console.error('数据库连接失败:', err)
  process.exit(1)
})

db.once('open', async () => {
  console.log('数据库已连接')
  try {
    for (const name of CATEGORIES) {
      // 避免重复插入
      const exists = await Column.findOne({ name })
      if (!exists) {
        await Column.create({ name })
        console.log(`  ✓ 已创建: ${name}`)
      } else {
        console.log(`  - 已存在: ${name}`)
      }
    }
    console.log('分类初始化完成!')
  } catch (err) {
    console.error('初始化失败:', err.message)
  } finally {
    mongoose.disconnect()
  }
})
