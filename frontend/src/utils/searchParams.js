/**
 * 搜索筛选参数 — utils 层（纯函数）
 *
 * 三个函数的分工
 *   parseFilters(query)       URL      → 筛选对象（补默认值、做白名单校验）
 *   buildQuery(base, patch)   筛选对象 → URL（去空值、处理预设与自定义日期互斥）
 *   toRequestParams(filters)  筛选对象 → 接口参数（timePreset → 具体日期）
 */

import { getDateRangeFromPreset } from "./dateUtils";

/** 允许出现在 URL 上的筛选键（白名单，防止乱传参数被带进请求） */
export const FILTER_KEYS = [
  "q",
  "authorName",
  "category",
  "tag",
  "timePreset",
  "startDate",
  "endDate",
  "sortBy",
  "order",
];

/** 时间预设白名单（与搜索面板的按钮一一对应） */
export const TIME_PRESETS = ["all", "1d", "30d", "365d"];

/** 排序白名单（后端 routes/search.js 的 sortMap 只认这几项） */
export const SORT_FIELDS = ["publishDate", "likeNum", "viewNum", "commentNum"];

/** 筛选默认值 —— 同时也是「无任何筛选」的基准，hasActiveFilters 拿它做对比 */
export function defaultFilters() {
  return {
    q: "",
    authorName: "",
    category: "",
    // 标签筛选：由文章卡片 / 详情页的标签 chip 点击写入（?tag=xxx），精确匹配
    tag: "",
    timePreset: "all",
    startDate: "",
    endDate: "",
    sortBy: "publishDate",
    order: "desc",
  };
}

/**
 * URL query → 筛选对象
 *
 * ① 只认白名单里的键（URL 上手敲 ?foo=bar 会被忽略）
 * ② 缺失的键补默认值
 * ③ 枚举类的值做白名单校验，非法值回退默认（防止手改 URL 把请求打歪）
 *
 * @param {object} [query] — this.$route.query
 * @returns {object} 筛选对象（所有键都有值，可能是空字符串）
 */
export function parseFilters(query = {}) {
  const filters = defaultFilters();
  FILTER_KEYS.forEach((key) => {
    const raw = query[key];
    if (raw == null || raw === "") return;
    filters[key] = String(raw);
  });

  if (!TIME_PRESETS.includes(filters.timePreset)) filters.timePreset = "all";
  if (!SORT_FIELDS.includes(filters.sortBy)) filters.sortBy = "publishDate";
  if (filters.order !== "asc" && filters.order !== "desc") filters.order = "desc";

  return filters;
}

/**
 * 生成新的 URL query —— 在现有 query 上打一个补丁
 *
 * 顺带处理两处互斥 / 清理规则（原版散在 actionControl 的 DOM 操作里，这里收口）：
 *   ① 空值不进 URL（?authorName= 这种除了让地址变长没有任何作用）
 *   ② 选了时间预设 → 清掉自定义日期；手选了日期 → 预设回落到 all（两者互斥）
 *   ③ timePreset === 'all' 不进 URL（等价于「没选」）
 *
 * @param {object} [baseQuery] — 现有 query（通常是 this.$route.query）
 * @param {object} patch — 要改的字段（值为 '' / undefined 表示删除该条件）
 * @returns {object} 新的 query 对象
 */
export function buildQuery(baseQuery = {}, patch = {}) {
  const merged = { ...baseQuery, ...patch };

  FILTER_KEYS.forEach((key) => {
    if (merged[key] === undefined || merged[key] === null || merged[key] === "") {
      delete merged[key];
    }
  });

  // 预设与自定义日期互斥：留谁取决于这次改的是谁
  if (merged.timePreset && merged.timePreset !== "all") {
    delete merged.startDate;
    delete merged.endDate;
  } else {
    delete merged.timePreset; // 'all' 或空 → 不进 URL
  }

  return merged;
}

/**
 * 筛选对象 → 搜索接口参数（含分页）
 *
 * timePreset 在这里才换算成具体日期（原版 searchBus._buildSearchParams 的逻辑）：
 *   - 预设激活（非 all）→ 用预设算出的日期，覆盖面板上残留的旧日期
 *   - 预设为 all 或空     → 用显式存储的 startDate/endDate
 *
 * 空值在这里再滤一次：后端虽然都有默认值，但 ?authorName=&category= 这样的空串
 * 会让 query 构造出多余条件（后端 `if (authorName)` 能挡住，但 URL 没必要脏）。
 *
 * @param {object} filters — parseFilters 的产物
 * @param {object} [paging] — { page, size }
 * @returns {object} 直接交给 http.js 的 data（GET → query string）
 */
export function toRequestParams(filters = {}, paging = {}) {
  const { page = 1, size = 5 } = paging;
  const s = { ...defaultFilters(), ...filters };

  let startDate = s.startDate || "";
  let endDate = s.endDate || "";
  if (s.timePreset && s.timePreset !== "all") {
    const range = getDateRangeFromPreset(s.timePreset);
    startDate = range.startDate;
    endDate = range.endDate;
  }

  const raw = {
    q: s.q,
    authorName: s.authorName,
    category: s.category,
    tag: s.tag,
    startDate,
    endDate,
    sortBy: s.sortBy,
    order: s.order,
    page,
    size,
  };

  // 谁离 HTTP 近谁负责净化（原版 V11 修复的约定）：空值不发给后端
  const clean = {};
  Object.entries(raw).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== "") clean[k] = v;
  });
  return clean;
}

/**
 * 筛选对象的「变化指纹」
 *
 * Index.vue 用它做 watch 目标：对象是引用类型，直接 watch 需要 deep，
 * 而这里只需要「筛选变没变」这一个信号 —— 拼成字符串最省事也最好调试。
 *
 * @param {object} filters
 * @returns {string}
 */
export function filterKey(filters = {}) {
  return FILTER_KEYS.map((k) => filters[k] ?? "").join("|");
}

/**
 * 当前是否存在「用户主动设置的」筛选条件（用来决定空结果走哪种兜底文案）
 *
 * 排序不算：sortBy/order 有默认值，出现它们不代表用户筛过东西。
 *
 * @param {object} filters
 * @returns {boolean}
 */
export function hasActiveFilters(filters = {}) {
  const s = { ...defaultFilters(), ...filters };
  return Boolean(
    s.q || s.authorName || s.category || s.tag || s.startDate || s.endDate ||
      (s.timePreset && s.timePreset !== "all")
  );
}
