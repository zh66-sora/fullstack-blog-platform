/**
 * 格式化工具集 — utils 层
 *
 * 迁移自原项目 myBlog/app/utils/formatters.js
 * 只移植纯函数；原文件里依赖 jQuery 的 serializeObject / jsonArrToJson 未迁（本项目用不上）。
 *
 * 所有函数均为纯函数（输入→输出，无副作用），不依赖 DOM 或业务状态。
 */

/**
 * 将 ISO 日期字符串格式化为 yyyy-MM-dd
 * @param {string} isoString - ISO 格式的日期字符串，如 "2026-07-17T13:37:56.322Z"
 * @returns {string} 格式化后的日期，如 "2026-07-17"
 * @example
 * formatISODate("2026-07-17T13:37:56.322Z") // "2026-07-17"
 * formatISODate("2026-07-17") // "2026-07-17"
 * formatISODate(null) // ""
 */
export function formatISODate(isoString) {
  if (!isoString) return ''

  // 如果已经是 yyyy-MM-dd 格式，直接返回
  // 避免重复 new Date() 导致的时区偏移问题
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoString)) return isoString

  const date = new Date(isoString)
  if (isNaN(date.getTime())) return ''

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

/**
 * 相对时间展示：基于 Date.now() 计算与目标时间的差值
 * < 1小时 → "n分钟前"
 * < 1天   → "n小时前"
 * < 7天   → "n天前"
 * ≥ 7天   → 回退到 yyyy-MM-dd 绝对日期
 *
 * @param {string} isoString - ISO 日期字符串
 * @returns {string}
 */
export function timeAgo(isoString) {
  if (!isoString) return ''
  const now = Date.now()
  const target = new Date(isoString).getTime()
  if (isNaN(target)) return ''
  const diff = now - target
  // 未来时间（如已发布的文章 publishDate 晚于当前时间）直接展示绝对日期
  if (diff < 0) return formatISODate(isoString)
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 7) return `${days}天前`
  return formatISODate(isoString)
}

/**
 * 统计不含 HTML 标签的纯文本词数
 * ① 去除所有 HTML 标签（<...>）
 * ② 将 HTML 实体（如 &amp;）替换为空格
 * ③ 按空白字符分词计数
 *
 * @param {string} html - 带 HTML 标签的内容
 * @returns {string} 如 "747 words"
 */
export function countWords(html) {
  if (!html) return '0 words'
  const text = html
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return '0 words'
  const words = text.split(/\s+/).length
  return `${words} words`
}
