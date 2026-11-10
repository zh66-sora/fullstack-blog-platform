/**
 * chatUtils.js — 聊天室的展示层小工具（纯函数）
 * =========================================================================
 * 为什么不复用 utils/dateUtils.js：那边是搜索面板的「日期区间」口径（只有 yyyy-MM-dd），
 * 聊天室要的是「今天只显时分、昨天带前缀、跨年补年份」这种对话式时间戳 —— 用途不同，
 * 混在一起只会让两边都难读。
 */

const pad = (n) => String(n).padStart(2, '0')

/** 同一天（按本地时区比较） */
function isSameDay(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/**
 * 对话式时间戳
 *   今天       → 14:05
 *   昨天       → 昨天 14:05
 *   今年其他天 → 07-24 14:05
 *   跨年       → 2025-12-31 14:05
 *
 * @param {Date|string|number} input
 * @returns {string} 解析失败返回空串（气泡上的时间行直接不渲染）
 */
export function formatChatTime(input) {
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return ''

  const now = new Date()
  const hm = `${pad(date.getHours())}:${pad(date.getMinutes())}`
  if (isSameDay(date, now)) return hm

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (isSameDay(date, yesterday)) return `昨天 ${hm}`

  const monthDay = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  if (date.getFullYear() === now.getFullYear()) return `${monthDay} ${hm}`

  return `${date.getFullYear()}-${monthDay} ${hm}`
}

/** 在线状态的中文名（后端只回 online / dnd / offline 三个值） */
export const CHAT_STATUS_TEXT = {
  online: '在线',
  dnd: '勿扰',
  offline: '离线'
}

/** 连接状态的中文提示（空串 = 正常，不显示提示条） */
export const CHAT_CONNECT_TEXT = {
  open: '',
  reconnecting: '连接已断开，正在重连…',
  closed: '聊天室已断开'
}
