/**
 * 博客管理页 viewModel — utils 层（纯函数）
 *
 * 数据流向：views/Manage.vue → buildManageListViewModel() → ManageItem 渲染
 *
 * 与 buildArticleListViewModel（首页卡片）的区别：
 *   那边是「摘要卡片」——要 coverImage / summary / 信息行 info[] / 点赞态度；
 *   这边是「管理条目」——要的是板块（名字 + 图标）、发布时间、三个计数，
 *   以及一个能跳走的 id。两者的字段交集只有 id / title / tags，
 *   硬塞进同一个构建器会让两边都长出一堆用不上的字段，所以各写一份。
 *
 * 输入（GET /articles/search?authorId=… → res.data）：
 *   { list: [{ _id, title, content, category, tags, publishDate,
 *              likeNum, commentNum, viewNum }], total, page, pages }
 *
 * 输出：
 *   { total, page, pages, list: [{ id, title, categoryId, categoryName,
 *                                 categoryIcon, publishDate, timeAgo,
 *                                 likeNum, commentNum, viewNum }] }
 */
import { formatISODate, timeAgo } from './formatters'
import CATEGORIES from '@/config/category.config'

// 配置表里没匹配到 _id 时的图标兜底（与 columnUtils.js 用同一枚字形，两处保持一致）
const FALLBACK_ICON = 'icon-android-chrome-512x512'
// 配置表与后端都没给名称时的兜底文案（与 columnUtils.js 一致）
const FALLBACK_NAME = '(未分类)'

/**
 * 构建博客管理列表视图模型
 *
 * ⚠ 板块名与图标**只能走前端配置表**：后端 GET /articles/search 返回的
 *   `category.name` 是英文（库里存的是 "Technology" 这种 key 名），
 *   中文名与 iconfont 字形的映射只存在于 `config/category.config.js`
 *   （那是全系统唯一知道 _id ↔ 中文名的地方）。
 *   优先级与 columnUtils 一致：配置表 → 后端字段 → 兜底。
 *
 * ⚠ category 兼容两种形态：populate 后的 `{ _id, name }` 与裸 `_id` 字符串。
 *
 * @param {object} listData — 后端分页返回的原始数据 { list, total, page, pages }
 * @returns {object} 管理列表渲染数据
 */
export function buildManageListViewModel(listData) {
  const { list = [], total = 0, page = 1, pages = 1 } = listData ?? {}

  return {
    total,
    page,
    pages,
    list: list.map((item) => {
      const {
        _id,
        title,
        category,
        publishDate,
        likeNum = 0,
        commentNum = 0,
        viewNum = 0,
      } = item

      const categoryId = String(category?._id ?? category ?? '')
      const cfg = CATEGORIES.find((c) => c._id === categoryId) || {}

      return {
        id: String(_id),
        title,
        categoryId,
        categoryName: cfg.name || category?.name || FALLBACK_NAME,
        categoryIcon: cfg.icon || FALLBACK_ICON,
        // 展开行第一项：发布时间（绝对日期，与列表卡片同一口径）
        publishDate: formatISODate(publishDate),
        // 悬停 title 用：相对时间，一眼知道是「几天前写的」
        timeAgo: timeAgo(publishDate),
        likeNum,
        commentNum,
        viewNum,
      }
    }),
  }
}
