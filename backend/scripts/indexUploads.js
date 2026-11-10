/**
 * 给已有上传文件补 hash 索引（一次性/可重跑）
 * 用法：在 myapp 目录下执行  node scripts/indexUploads.js
 *
 * 背景：
 *   哈希去重上线后，新上传的文件名是 {hash}.ext，会写进 Upload 索引；
 *   但在那之前上传的老文件仍是 原名_时间戳.ext 且没有索引记录 ——
 *   不补的话，用户重传同一张老图不会命中秒传。
 *
 * 设计：
 *   - **只读文件、只写索引，不改名、不动文件** —— 数据库里存的是绝对 URL，
 *     重命名老文件会让已发布的头像/封面全部 404
 *   - 幂等：同 (hash, classify) 已存在就跳过，可反复执行
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const fs = require('fs')
const crypto = require('crypto')
const mongoose = require('mongoose')
mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
  useUnifiedTopology: true,
  useNewUrlParser: true,
})

// ⚠ 必须在 chdir 之后再 require：config 里的 uploadPath 用的是 process.cwd()
const { uploadPath } = require('../config')
const Upload = require('../models/Upload')

const CLASSES = ['user', 'article', 'comment', 'timeline', 'other']

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(absPath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

async function main() {
  const stat = { scanned: 0, added: 0, skipped: 0, failed: 0 }

  try {
    for (const classify of CLASSES) {
      const dir = path.join(uploadPath, classify)
      if (!fs.existsSync(dir)) {
        console.log(`跳过：${classify}/ 不存在`)
        continue
      }

      const names = fs
        .readdirSync(dir)
        .filter((name) => {
          try { return fs.statSync(path.join(dir, name)).isFile() } catch (e) { return false }
        })

      console.log(`扫描 ${classify}/：${names.length} 个文件`)

      for (const name of names) {
        const abs = path.join(dir, name)
        try {
          stat.scanned++
          const hash = await sha256File(abs)
          const exists = await Upload.findOne({ hash, classify }).lean()
          if (exists) {
            stat.skipped++
            continue
          }

          const info = fs.statSync(abs)
          const ext = path.extname(name).toLowerCase()
          await Upload.create({
            hash,
            classify,
            path: `${classify}/${name}`,
            size: info.size,
            mime: MIME_MAP[ext] || '',
          })
          stat.added++
        } catch (err) {
          stat.failed++
          console.warn(`  ⚠ ${classify}/${name} 失败：${err.message}`)
        }
      }
    }

    console.log(`\n📊 完成：扫描 ${stat.scanned} 个，新增 ${stat.added} 条，跳过 ${stat.skipped} 条，失败 ${stat.failed} 条`)
  } catch (err) {
    console.error('❌ 执行失败：', err.message)
    process.exitCode = 1
  } finally {
    await mongoose.disconnect()
  }
}

main()
