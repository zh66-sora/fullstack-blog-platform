/**
 * 文章视图模型构建器 — utils 层（纯函数）
 *
 * 一个文件承载两个页面的 viewModel，与原项目 myBlog/app/utils/ 下的两个文件对应：
 *   buildArticleListViewModel() ← articleListViewModel.js → Index.vue（列表卡片）
 *   buildArticleViewModel()     ← articleViewModel.js     → Article.vue（详情页）
 *
 * 职责：把后端返回的原始数据 → 组件渲染所需的数据结构
 * 数据流向：Index.vue / Article.vue → buildXxxViewModel() → 模板渲染
 *
 * 与原项目的差异：原项目会再查一遍 userReaction（点赞状态）来算 likeIconClass /
 * dislikeActiveClass；现在选中态由 HabitBar.vue 按 userReaction 自己算，
 * viewModel 只透传原始值。
 * userReaction 本身仍是「单独查一次」的（列表接口与详情接口都不带这个字段）：
 *   详情 → Article.vue 并行查后作为第 2 个参数传入
 *   列表 → Index.vue 逐篇查后以 reactionMap 形式传入（同原项目 articleBus 的做法）
 */
import { formatISODate, timeAgo, countWords } from './formatters'
import { getCategoryNameById } from '@/config/category.config'
import { normalizeUser } from './userUtils'

// 摘要截取长度
const SUMMARY_LEN = 80

/**
 * html => 纯文本 (去标签/转义实体/压缩空白)
 * @param {string} html - 带 HTML 标签的内容
 * @returns {string} 纯文本
 */
function htmlToText(html) {
  if (!html) return ''
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&[^;]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 构建文章列表视图模型
 *
 * ① 遍历 list 中的每篇文章，调用 htmlToText 获取纯文本摘要
 * ② 格式化日期/字数/板块名为 info[] 数组结构（与卡片模板的循环渲染对齐）
 * ③ 统计 views/likes/comments 透传至 stats 字段
 * ④ 分页字段透传：total/page/pages 保留给后续分页组件
 * ⑤ 点赞态度由 reactionMap 注入 —— 列表接口本身不返回 userReaction，
 *    调用方（Index.vue）先逐篇查一次 GET /articles/likes/:id 再传进来，
 *    与原项目 articleBus.renderArticleList 的 reactionMap 做法一致
 *
 * @param {object} listData — 后端分页返回的原始数据 { list, total, page, pages }
 * @param {object} [reactionMap] — { [articleId]: 'liked' | 'disliked' | 'none' }
 * @returns {object} 卡片渲染数据
 */
export function buildArticleListViewModel(listData, reactionMap = {}) {
  const { list = [], total = 0, page = 1, pages = 1 } = listData ?? {}

  return {
    // 分页信息透传，供后续分页组件使用
    total,
    page,
    pages,
    list: list.map((item) => {
      const {
        _id,
        title,
        content,
        publishDate,
        date,
        viewNum = 0,
        likeNum = 0,
        commentNum = 0,
        coverImage,
        tags,
        category,
        highlight,
      } = item

      const text = htmlToText(content)
      const tagList = Array.isArray(tags) ? tags.slice(0, 3) : []
      const categoryName = category?.name || getCategoryNameById(category?._id || category) || ''
      const cover = coverImage || ''
      // 只有带关键词搜索时后端才返回 highlight（纯文本 + <mark>，后端已转义）
      const hasHighlight = !!highlight?.snippet

      return {
        id: _id,
        title,
        // 搜索命中时用后端给的高亮标题（含 <mark>），否则用纯文本标题
        titleHtml: highlight?.title || '',
        hasHighlight,
        highlightSnippet: highlight?.snippet || '',
        coverImage: cover,
        // 有封面 → 用 blog-card--pic 那套卡片，无限面 → 用普通卡片
        hasCover: !!cover,
        tags: tagList,
        hasTags: tagList.length > 0,
        // 信息行：发布日 / 板块 / 字数 / 更新日
        info: [
          {
            icon: 'icon-faburiqi',
            label: [{ touch: false, data: formatISODate(publishDate) }],
          },
          {
            icon: 'icon-Category',
            label: [{ touch: true, data: categoryName }],
          },
          {
            icon: 'icon-zishu',
            label: [{ touch: false, data: countWords(content) }],
          },
          {
            icon: 'icon-gengxinriqi',
            label: [{ touch: false, data: timeAgo(date ?? publishDate) }],
          },
        ],
        // 摘要：纯文本截断
        summary: text.length > SUMMARY_LEN ? `${text.slice(0, SUMMARY_LEN)}…` : text,
        stats: { views: viewNum, likes: likeNum, comments: commentNum },
        // 当前用户对这篇的态度 → 列表卡片的点赞图标据此切「已点赞实心 / 未点赞描边」
        userReaction: reactionMap[_id] || 'none',
      }
    }),
  }
}

// ============================================================
// 文章详情页 viewModel（迁移自原项目 app/utils/articleViewModel.js）
// ============================================================

/**
 * 构建文章详情视图模型
 *
 * 把后端 articleDetail 扁平化成 Article.vue 直接可用的结构：
 *   ① 日期：publishDate 用 formatISODate（绝对日期），updateDate（date 字段）用 timeAgo
 *   ② category 兼容 populated 对象 { _id, name } 与纯 _id 字符串两种形态
 *   ③ 标签最多取 3 个，与列表卡片保持一致
 *   ④ 只透传 likeNum / dislikeNum / userReaction —— 「赞/踩长什么样」交给
 *      HabitBar.vue 按 userReaction 自己算（文章详情 / 评论区 / 文章列表共用同一个组件），
 *      viewModel 不再产出 likeIconClass / dislikeActiveClass 这类「图标 class」
 *      （原来那两个字段被 HabitBar 取代后已无人使用，一并删掉）
 *   ⑤ userReaction 由调用方传入 —— 详情接口不返回它，Article.vue 会并行查一次
 *      GET /articles/likes/:id（与原项目 articleBus 先查 reaction 再 buildViewModel 一致）
 *
 * 输入（GET /api/rest/article/:id → res.data）:
 *   { _id, title, content, gitHubUrl, coverImage, category, tags,
 *     viewNum, likeNum, dislikeNum, commentNum, publishDate, date }
 * 输出:
 *   { articleId, title, githubUrl, coverImage, tags, hasTags,
 *     likeNum, dislikeNum, commentNum, userReaction, info[], articleHtml }
 *
 * @param {object} articleDetail — 后端原始文章详情；请求失败时会是 undefined，所以做空值兜底
 * @param {string} [userReaction] — 当前用户的态度 'liked' | 'disliked' | 'none'
 * @returns {object} 详情页渲染数据
 */
export function buildArticleViewModel(articleDetail, userReaction = 'none') {
  const {
    _id = '',
    title = '',
    content = '',
    gitHubUrl = '',
    coverImage = '',
    category,
    tags,
    likeNum = 0,
    dislikeNum = 0,
    commentNum = 0,
    publishDate,
    date,
    author,
  } = articleDetail ?? {}

  // date 是更新时间，后端可能不返回 → 回落到发布时间
  const updateDate = date ?? publishDate
  const tagList = Array.isArray(tags) ? tags.slice(0, 3) : []
  // category 可能是 populated 对象 { _id, name }，也可能是原始 _id 字符串
  const categoryName = category?.name || getCategoryNameById(category?._id || category) || ''

  return {
    articleId: _id,
    title,
    githubUrl: gitHubUrl,
    coverImage,
    tags: tagList,
    hasTags: tagList.length > 0,
    likeNum,
    dislikeNum,
    // 评论数：详情页底部操作栏的「评论」条目要显示（与赞/踩同一套 [图标 文字 数字] 结构）
    commentNum,
    userReaction,
    // 信息行：发布日 / 板块 / 字数 / 更新日 —— 结构与列表卡片完全一致
    info: [
      {
        icon: 'icon-faburiqi',
        label: [{ touch: false, data: formatISODate(publishDate) }],
      },
      {
        icon: 'icon-Category',
        label: [{ touch: true, data: categoryName }],
      },
      {
        icon: 'icon-zishu',
        label: [{ touch: false, data: countWords(content) }],
      },
      {
        icon: 'icon-gengxinriqi',
        label: [{ touch: false, data: timeAgo(updateDate) }],
      },
    ],
    // 正文：后端存的就是富文本 HTML，模板里用 v-html 输出
    articleHtml: content,
    // 作者（他人主页的入口之一），形态与列表卡片一致
    author: normalizeUser(author),
  }
}
