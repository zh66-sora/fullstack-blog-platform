/**
 * 兜底页状态表 — config 层
 * =========================================================================
 * Lost.vue 的「插图 / 文案 / 按钮去向」全部由这张表驱动，组件里不再有任何
 * if/else —— 加一个兜底状态 = 往这张表里加一条。
 *
 * 状态从哪来（优先级：state prop > 路由 query > 默认值）：
 *   ① 路由 query   /lost?state=empty&category=<板块 _id>
 *   ② 父组件传参   <Lost state="dev" />（比如 Message.vue / Info.vue 还没做完时）
 *   ③ 都没有       → DEFAULT_LOST_STATE（notFound）
 *   配置表里查不到 → 同样回退默认值（等于白名单：query 里乱传也炸不了）
 *
 * 字段说明：
 *   img    插图 —— ⚠ **必须静态 require**，不能拼路径：
 *          `require('@/assets/images/lost/' + name + '.jpg')` 在 webpack 下
 *          要么解析不出来、要么把整个目录都打进包。要按文件名取就用 require.context。
 *   alt    插图的替代文本（各状态不同，别再写死 alt="404"）
 *   title / main / sub   三行文案 —— 字符串，或 ({ categoryId, categoryName }) => string
 *          （「XX 板块」这种要读参数的文案就写成函数；type 见 Lost.vue 的 ctx）
 *   cta    页面下方那颗主按钮 —— 声明式动作
 *   back   顶栏返回键 —— 同一个动作结构（用 tip 作悬浮提示）
 *
 * 动作结构（Lost.vue#runAction 只认这四种 type）：
 *   { type: 'route',  name: 'Index', keepQuery?: ['category'] }  跳路由
 *   { type: 'reload' }                                           整页重载（「加载失败」专用）
 *   { type: 'back' }                                             返回上一页
 *   { type: 'login' }                                            弹登录框
 */

export const LOST_STATES = {
  // ── 地址 / 路由没匹配上（router 里 path:'*' 的兜底）────────────────────
  notFound: {
    img: require('@/assets/images/lost/notFound.jpg'),
    alt: '页面走丢了',
    title: () => '页面走丢了',
    main: () => '哎呀,这个页面走丢了~',
    sub: () => '也许当前页面被站长养的猫吃掉了!',
    cta: { type: 'route', name: 'Index', icon: 'iconfont icon-zhuye', text: '返回主页' },
    back: { type: 'route', name: 'Index', tip: '返回主页' },
  },

  // ── 内容为空：板块下没有文章 / 列表为空 ───────────────────────────────
  // 带 ?category=<id> 时标题显示「XX 板块」，文案也走分类那一套；
  // 不带参数就是通用空态（比如将来的「一个板块都没有」）
  empty: {
    img: require('@/assets/images/lost/empty.jpg'),
    alt: '这里还没有内容',
    title: ({ categoryName }) => (categoryName ? `${categoryName} 板块` : '这里空空如也'),
    main: ({ categoryName }) =>
      categoryName ? '哎呀,当前分类还没有博客呢~' : '哎呀,这里还没有内容~',
    sub: ({ categoryName }) =>
      categoryName ? '也许这里的博客都被站长养的猫吃掉了!' : '先去写一篇,把这里填满吧!',
    // keepQuery：把当前 URL 上的板块 id 带过去，写页据此预选 + 锁定板块
    cta: {
      type: 'route',
      name: 'Write',
      icon: 'iconfont icon-aa',
      text: '去写一篇',
      keepQuery: ['category'],
    },
    back: { type: 'route', name: 'Column', tip: '返回板块导航' },
  },

  // ── 别人的空板块：板块导航点进某人的一个空板块 ───────────────────────
  // 与 empty 的区别只在**主按钮**：empty 是「自己的/全站」的板块，给「去写一篇」；
  // 这一条是「别人的」，你不能替 TA 写，所以没有 cta（Lost.vue 里 cta 为 null 时整颗按钮不渲染）。
  emptyOther: {
    img: require('@/assets/images/lost/empty.jpg'),
    alt: '这里还没有内容',
    title: ({ categoryName }) => (categoryName ? `${categoryName} 板块` : '这里空空如也'),
    main: ({ categoryName }) =>
      categoryName ? '哎呀,这个分类下还没有 TA 的博客~' : '哎呀,这里还没有内容~',
    sub: () => '也许 TA 还没有在这里写过博客。',
    cta: null,
    back: { type: 'route', name: 'Column', tip: '返回板块导航' },
  },

  // ── 时间线还没配过：进「关于」页时一条记录都没有 ─────────────────────
  // 与 empty 的区别：empty 是「这里本来就没内容」，这一条是「**你自己的**还没开始记」，
  // 所以按钮给的是「去时间线管理」而不是「去写一篇」。
  // ⚠ 后端把「没配过」做成 200 + 空结构（不是 404），就是为了能落到这里 ——
  //   见 myapp/routes/timeline.js 的 GET 说明。
  timelineEmpty: {
    img: require('@/assets/images/lost/empty.jpg'),
    alt: '时间线还是空的',
    title: () => '时间线还是空的',
    main: () => '哎呀,这条时间线上还没有任何记录~',
    sub: () => '去「时间线管理」把重要的日子一条条记下来吧!',
    cta: {
      type: 'route',
      name: 'Timeline',
      icon: 'iconfont icon-riqi',
      text: '去时间线管理',
    },
    back: { type: 'route', name: 'Index', tip: '返回主页' },
  },

  // ── 别人的时间线还没配过（他人主页下的「关于」）────────────────────
  // 同上，但你不能替 TA 去「时间线管理」，所以没有 cta。
  timelineEmptyOther: {
    img: require('@/assets/images/lost/empty.jpg'),
    alt: '时间线还是空的',
    title: () => '时间线还是空的',
    main: () => '哎呀,这条时间线上还没有任何记录~',
    sub: () => '也许 TA 还没有在这里记下什么。',
    cta: null,
    back: { type: 'route', name: 'Index', tip: '返回主页' },
  },

  // ── 搜索无结果：筛选条件太窄，一条都没命中 ──────────────────────────
  // 与 empty 的区别：empty 是「这里本来就没内容」，searchEmpty 是「有内容但被筛掉了」
  // —— 所以按钮给的是「放宽条件 / 看全部」，而不是「去写一篇」
  // ctx.keyword 来自 URL 的 ?q=（见 Lost.vue 的 ctx）
  searchEmpty: {
    img: require('@/assets/images/lost/empty.jpg'),
    alt: '没有找到相关内容',
    title: () => '没有找到相关内容',
    main: ({ keyword }) =>
      keyword ? `没有找到与「${keyword}」相关的博客` : '哎呀,没有符合条件的博客~',
    sub: () => '换个关键词,或者把筛选条件放宽一点试试。',
    // 不带任何 query 地跳回首页 = 清掉所有筛选条件
    cta: { type: 'route', name: 'Index', icon: 'iconfont icon-zhuye', text: '看全部文章' },
    back: { type: 'back', tip: '返回上一页' },
  },

  // ── 首屏加载失败（5xx / 超时 / 断网）─────────────────────────────────
  // 唯一「按钮变重试」的状态
  loadFailed: {
    img: require('@/assets/images/lost/loadFailed.jpg'),
    alt: '加载失败',
    title: () => '内容没加载出来',
    main: () => '哎呀,加载失败了~',
    sub: () => '可能是网络抖了一下,点下面重试试试。',
    // ⚠ 用 retry（路由跳回出事那页、重跑请求）而不是 reload（整页重载）——
    //   整页重载一定白屏闪一下，见 Lost.vue#runAction 里的说明
    cta: { type: 'retry', icon: 'el-icon-refresh', text: '重试' },
    back: { type: 'back', tip: '返回上一页' },
  },

  // ── 无权访问 / 需要登录 ─────────────────────────────────────────────
  forbidden: {
    img: require('@/assets/images/lost/forbidden.jpg'),
    alt: '无权访问',
    title: () => '进不去这道门',
    main: () => '哎呀,这里需要先登录~',
    sub: () => '登录之后再来看看吧。',
    cta: { type: 'login', icon: 'iconfont icon-denglu', text: '去登录' },
    back: { type: 'route', name: 'Index', tip: '返回主页' },
  },

  // ── 已登录但角色不够（管理端三个页面用）──────────────────────────────
  // 与 forbidden 的区别：那个是「没登录」，这个是「登录了但不是管理员 / 站长」——
  // 文案必须分开，否则管理员看到「请先登录」会以为自己的登录掉了。
  noPermission: {
    img: require('@/assets/images/lost/forbidden.jpg'),
    alt: '无权访问',
    title: () => '这里只对管理员开放',
    main: () => '当前账号没有权限进入这一页~',
    sub: () => '管理功能需要管理员或站长身份,需要的话请联系站长。',
    cta: { type: 'route', name: 'Index', icon: 'iconfont icon-zhuye', text: '返回主页' },
    back: { type: 'route', name: 'Index', tip: '返回主页' },
  },

  // ── 功能还没做完 ────────────────────────────────────────────────────
  // 现成用途：Message.vue / Info.vue 目前还是 <p>占位</p>
  dev: {
    img: require('@/assets/images/lost/dev.jpg'),
    alt: '功能建设中',
    title: () => '这块还在施工',
    main: () => '哎呀,这个功能还没做完~',
    sub: () => '站长正在加班敲代码,敬请期待!',
    cta: { type: 'route', name: 'Index', icon: 'iconfont icon-zhuye', text: '返回主页' },
    back: { type: 'route', name: 'Index', tip: '返回主页' },
  },
}

// 没传 / 查不到时的落点（path:'*' 走的就是它）
export const DEFAULT_LOST_STATE = 'notFound'

/**
 * 取状态配置 —— 查不到回退默认值
 * @param {string} key — 状态 key（如 'empty'）
 * @returns {object} 该状态的配置项（保证有值）
 */
export function resolveLostState(key) {
  return LOST_STATES[key] || LOST_STATES[DEFAULT_LOST_STATE]
}
