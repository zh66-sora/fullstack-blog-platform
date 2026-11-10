/**
 * upload.js — 文件上传路由（内容寻址 + 秒传）
 * =========================================================================
 * 职责：处理前端文件上传（头像 / 文章封面与插图 / 评论配图 / 时间线图），
 *      按内容 SHA-256 去重，并提供秒传预检接口
 *
 * 路由：
 *   POST /upload/check          — 秒传预检：带 hash 查是否已存在，命中直接返回 URL
 *   POST /upload/:classify      — 上传文件（FormData 的 file 字段，最多 10 个）
 *
 * 存储策略（内容寻址）：
 *   - 文件先落到 uploads/.tmp/（避免半成品混进正式目录）
 *   - **服务端**用 crypto 流式重算 sha256（前端传来的 hash 只用于预检，不参与落库决策，
 *     防止有人改个 hash 就把别人的文件「认领」走）
 *   - 命中索引 → 删临时文件，直接复用已有路径（秒传）
 *   - 未命中 → rename 到 uploads/{classify}/{hash}{ext}，并写入 Upload 索引
 *
 * 与旧实现的区别：
 *   - 旧：文件名 = 原名_时间戳，同一张图传 N 次就存 N 份
 *   - 新：文件名 = 内容 hash，同内容同分类只存一份
 *   - **老文件保持原名不动**（数据库里存的是绝对 URL，改名会 404）；
 *     它们由 scripts/indexUploads.js 补录索引，之后同样能被秒传命中
 *
 * 大小限制：
 *   - 按分类分级（user/comment 5MB、article/timeline 10MB），替代原来被注释掉的全局限制
 *   - 超限由 multer 抛 LIMIT_FILE_SIZE，app.js 统一映射为中文提示
 */
const express = require('express')
const router = express.Router()
const createError = require('http-errors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const assert = require('http-assert')
const { uploadPath } = require('../config')
const Upload = require('../models/Upload')

// 允许存储的文件分类白名单（防止前端传入任意路径导致目录穿越）
const ALLOW_PATH = {
  'user': 'user',
  'article': 'article',
  'comment': 'comment',
  // 时间线（「关于」页的整页面背景图 + 各节点配图）
  'timeline': 'timeline'
}

// 各分类的大小上限：头像/评论配图 5MB，文章封面与时间线背景 10MB
const LIMIT_MAP = {
  user: 5 * 1024 * 1024,
  comment: 5 * 1024 * 1024,
  article: 10 * 1024 * 1024,
  timeline: 10 * 1024 * 1024,
  other: 5 * 1024 * 1024
}

// 临时落盘目录：算完 hash 再决定「复用」还是「搬进正式目录」
const TMP_DIR = path.join(uploadPath, '.tmp')

function ensureDir(dir) {
  // 左侧为 true 短路右侧：存在就不建
  fs.existsSync(dir) || fs.mkdirSync(dir, { recursive: true })
}

function safeUnlink(p) {
  return fs.promises.unlink(p).catch(() => {})
}

// 启动时清一次 .tmp：清理上次异常中断留下的半成品
// （multer 自身在超限/出错时会删已接收的文件，这里只是兜底）
try {
  if (fs.existsSync(TMP_DIR)) {
    fs.readdirSync(TMP_DIR).forEach((name) => {
      try { fs.unlinkSync(path.join(TMP_DIR, name)) } catch (e) { /* 忽略单个失败 */ }
    })
  }
} catch (e) { /* 目录不存在或权限问题：忽略 */ }

// 统一先落临时目录；正式文件名在 handler 里按 hash 决定
const storage = multer.diskStorage({
  destination(req, file, cb) {
    ensureDir(TMP_DIR)
    cb(null, TMP_DIR)
  },
  filename(req, file, cb) {
    // 临时名只要唯一即可，与最终文件名无关
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 10)}${path.extname(file.originalname)}`)
  }
})

// multer 的 fileSize 在创建实例时固定，所以按分类各建一个（缓存复用）
const uploaderCache = new Map()
function uploaderFor(classify) {
  if (!uploaderCache.has(classify)) {
    uploaderCache.set(
      classify,
      multer({
        storage,
        limits: { fileSize: LIMIT_MAP[classify] || LIMIT_MAP.other }
      }).array('file', 10)
    )
  }
  return uploaderCache.get(classify)
}

// 分类守卫 + 选对应限额的 multer（替代原来固定的 upload.array）
function parseUpload(req, res, next) {
  const classify = String(req.params.classify || '').trim()
  if (!ALLOW_PATH[classify]) {
    return next(createError(422, '文件上传需指定正确的分类'))
  }
  uploaderFor(classify)(req, res, next)
}

// 流式计算 sha256：大文件也不会把内容读进内存
function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256')
    fs.createReadStream(absPath)
      .on('data', (chunk) => hash.update(chunk))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject)
  })
}

// 按**当前请求**的 Host 拼绝对 URL，而不是写死 config.uploadURL：
//   - 本地开发（127.0.0.1:3000）→ 返回 http://127.0.0.1:3000/user/…
//   - 线上经 nginx（proxy_set_header Host $host）→ 返回 http://example.com/user/…
// 这样同一份代码在本地和线上都能直接预览，不用靠环境变量切地址。
function publicUrl(req, relPath) {
  const origin = `${req.protocol}://${req.get('host')}`
  return `${origin}/${String(relPath || '').replace(/^\/+/, '')}`
}

// ============================================================
// 秒传预检
// ⚠ 必须注册在 /:classify 之前，否则 "check" 会被当成一个分类
// ============================================================
router.post('/check', async (req, res, next) => {
  try {
    const body = req.body || {}
    const classify = String(body.classify || '').trim()
    const hash = String(body.hash || '').trim().toLowerCase()

    assert(ALLOW_PATH[classify], 422, '文件上传需指定正确的分类')
    assert(/^[a-f0-9]{64}$/.test(hash), 422, '文件哈希格式错误')

    const doc = await Upload.findOne({ hash, classify }).lean()
    res.send(200, {
      message: 'ok',
      data: doc
        ? { exists: true, filePath: publicUrl(req, doc.path), filename: path.basename(doc.path) }
        : { exists: false }
    })
  } catch (err) {
    next(err)
  }
})

// ============================================================
// 上传
// ============================================================
router.post('/:classify', parseUpload, async (req, res, next) => {
  const classify = ALLOW_PATH[String(req.params.classify).trim()]
  const files = req.files || []

  try {
    assert(files.length > 0, 422, '没有收到文件')

    const result = []
    for (const file of files) {
      const tmpPath = file.path
      try {
        const hash = await sha256File(tmpPath)

        let doc = await Upload.findOne({ hash, classify })

        if (doc) {
          // 命中：已经有了，丢掉临时文件（这就是「秒传」在服务端的落点）
          await safeUnlink(tmpPath)
        } else {
          const ext = (path.extname(file.originalname) || '').toLowerCase()
          let rel = `${classify}/${hash}${ext}`
          let abs = path.join(uploadPath, rel)

          // 极小概率：同 hash 同分类但后缀不同（同内容不同扩展名）→ 避免覆盖
          if (fs.existsSync(abs)) {
            rel = `${classify}/${hash}_${Date.now()}${ext}`
            abs = path.join(uploadPath, rel)
          }

          ensureDir(path.dirname(abs))
          await fs.promises.rename(tmpPath, abs)
          doc = await Upload.create({
            hash,
            classify,
            path: rel,
            size: file.size,
            mime: file.mimetype || ''
          })
        }

        result.push({
          filePath: publicUrl(req, doc.path),
          filename: path.basename(doc.path)
        })
      } catch (e) {
        // 单个文件失败：清掉它自己的临时文件，整体仍按失败处理
        await safeUnlink(tmpPath)
        throw e
      }
    }

    // 顺序与上传的 file 顺序一致 —— 调用方可以按下标配对
    res.send(200, { message: '文件上传成功', data: result })
  } catch (err) {
    // 兜底：把本请求还没收尾的临时文件清掉（已 rename 的路径不存在，unlink 会静默失败）
    files.forEach((f) => f.path && safeUnlink(f.path))
    next(err)
  }
})

module.exports = router
