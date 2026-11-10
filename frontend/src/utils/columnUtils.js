/**
 * 板块视图模型构建器 — utils 层（纯函数）
 *
 * 数据流向：Column.vue → buildColumnViewModel() → 模板渲染
 *
 * 输入（GET /api/rest/columns → res.data）：
 *   { list: [{ _id, name, articles: [...] }], total, page, pages }
 *   ⚠ Column.articles 是 ObjectId 引用数组（models/Column.js），后端已按
 *     plugins/POPULATE_MAP.js 的配置 populate 过 —— 所以「篇数」= articles.length
 *     就在手上，不需要像原项目那样点一次板块再查一次详情（articleBus.js 332-349）。
 * 输出：
 *   { list: [{ id, name, icon, count, ratioPercent, fillOpacity }], hasData }
 */
import CATEGORIES from '@/config/category.config'

// 配置表里没匹配到 _id 时的图标兜底（该字形在新 iconfont 里确认存在）
const FALLBACK_ICON = 'icon-android-chrome-512x512'
// 配置表与后端都没给名称时的兜底文案（与原项目一致）
const FALLBACK_NAME = '(未分类)'

/**
 * 构建板块视图模型
 *
 * ① 先算总文章数（占比的分母）
 * ② 逐条算：count（篇数）/ ratioPercent（占比，展示用）/ fillOpacity（填充条透明度）
 *    并匹配中文名与图标（_id 可能是 ObjectId，需转字符串比较）
 * ③ 按文章数降序 —— 文章最多的板块排最前
 *
 * @param {object} listData — 后端分页返回的原始数据 { list, total, page, pages }
 * @param {string} [authorId] — 按作者过滤计数（他人主页 / 自己的板块导航）；
 *                              空串 = 全站统计（现状）
 * @returns {object} { list, hasData } —— hasData 供页面区分「空态」与「加载中」
 */
export function buildColumnViewModel(listData, authorId = '') {
  const columns = listData?.list ?? []

  /**
   * 一个板块的篇数
   *
   * ⚠ 传了 authorId 时按作者过滤：populate 出来的每篇文章都带 `author._id`
   *   （POPULATE_MAP.Column 的 select 里有 author，见 myapp/plugins/POPULATE_MAP.js），
   *   所以「按人统计」在后端零改动的前提下、在前端就能算出来。
   *
   * ⚠ 两个已知的精度来源（都是**既有**问题，不是这次引入的）：
   *   ① Column.articles 是冗余数组，删文章时后端没有 $pull，可能留悬空 id；
   *   ② populate 对悬空 id 的处理 —— 两者都会让 `length` 略偏大。
   *   想彻底根治得走后端聚合（Article.aggregate 按 category 分组），那是另一条路径，
   *   等文章量上来再切。这里先保证「口径与现状一致、且能按人过滤」。
   */
  const countOf = (col) => {
    const articles = col.articles ?? []
    if (!authorId) return articles.length
    return articles.filter((a) => String(a?.author?._id ?? '') === String(authorId)).length
  }

  // ① 总文章数（同样按 authorId 过滤，保证占比分母与分子同口径）
  const totalArticles = columns.reduce((sum, col) => sum + countOf(col), 0)

  // ② 逐条构建展示数据
  const list = columns.map((col) => {
    const count = countOf(col)
    const ratio = totalArticles > 0 ? count / totalArticles : 0
    const cfg = CATEGORIES.find((c) => c._id === String(col._id)) || {}

    return {
      id: String(col._id),
      // 名称优先级与原项目一致：配置表 → 后端字段 → 兜底
      name: cfg.name || col.name || FALLBACK_NAME,
      icon: cfg.icon || FALLBACK_ICON,
      count,
      // 占比（展示用，保留 1 位小数）
      ratioPercent: (ratio * 100).toFixed(1),
      // 填充条透明度：占比越高越不透明，视觉上突出热门板块
      // 原公式 0.3 + ratio * 1.2，上限 0.95
      fillOpacity: Math.min(0.3 + ratio * 1.2, 0.95).toFixed(2),
    }
  })

  // ③ 文章数降序
  list.sort((a, b) => b.count - a.count)

  return { list, hasData: list.length > 0 }
}
