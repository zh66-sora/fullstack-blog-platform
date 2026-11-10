/**
 * 日期工具函数 — utils 层（纯函数）
 * =========================================================================
 * 迁移自 myBlog/app/utils/dateUtils.js（原 searchBus 里的日期计算被 V10 抽到这里）
 *
 * 职责：搜索面板的「时间预设 → 起止日期」换算 + yyyy-MM-dd 格式化。
 * 纯函数、无副作用、不依赖 DOM —— 与后端 routes/search.js 的日期口径对齐：
 *   - 只传日期字符串，不含时分秒
 *   - 后端解析 endDate 时自己补 23:59:59.999（见 routes/search.js 第 80-83 行）
 */

/**
 * 将 Date 对象格式化为 yyyy-MM-dd 字符串
 *
 * 为什么不直接用 toISOString().slice(0,10)？
 *   toISOString 返回 UTC 时间，北京时区（UTC+8）下 2026-01-01 00:00 本地时间
 *   会变成 2025-12-31T16:00:00.000Z，slice 后得到 "2025-12-31" —— 差一天。
 *   这里用 getFullYear/getMonth/getDate 读本地时间，无时区偏移问题。
 *
 * @param {Date} d — 日期对象
 * @returns {string} yyyy-MM-dd，如 "2026-07-24"
 */
export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * 把 yyyy-MM-dd 字符串解析成本地时间的 Date 对象
 *
 * ⚠ 不用 new Date('2026-07-24')：ES 规范里这种「日期-only」格式被当成 UTC 解析
 *   （等价于 2026-07-24T00:00:00Z），东八区下 getDate() 会拿到 24 但 getHours() 是 8，
 *   与日历里 new Date(y, m-1, d) 造出来的本地零点比较时会错。
 *   手动按位构造，保证与 formatDate 互为逆运算。
 *
 * @param {string} dateStr — yyyy-MM-dd
 * @returns {Date|null} 解析失败（空串 / 格式不对）返回 null
 */
export function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
  const [y, m, d] = parts;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
}

/**
 * 根据时间预设计算起止日期范围
 *
 * 边界规则（与原版一致）：
 *   - "all" / 无效 preset → 都是空字符串（不限日期）
 *   - "1d" / "30d" / "365d" → 从 N 天前 到 今天
 *
 * 为什么 start 用 setDate() 而不是减毫秒？
 *   setDate() 自动处理跨月/跨年边界；直接减毫秒在夏令时切换日可能偏差 1 小时。
 *
 * @param {string} preset — 'all' | '1d' | '30d' | '365d'
 * @returns {{ startDate: string, endDate: string }}
 */
export function getDateRangeFromPreset(preset) {
  if (preset === "all") return { startDate: "", endDate: "" };

  const now = new Date();
  const endStr = formatDate(now);

  let start = new Date(now);
  switch (preset) {
    case "1d":
      start.setDate(start.getDate() - 1);
      break;
    case "30d":
      start.setDate(start.getDate() - 30);
      break;
    case "365d":
      start.setDate(start.getDate() - 365);
      break;
    default:
      return { startDate: "", endDate: "" };
  }
  return { startDate: formatDate(start), endDate: endStr };
}
