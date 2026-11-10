/**
 * 滚动工具 — utils 层
 *
 * 全站「回到最上方」只有一个口径：**正文容器（Home.vue 的 el-main）的最上方**，
 * 再往上让出固定头部导航的高度（否则卡片顶栏会被压在导航栏底下）。
 *
 * 为什么不是 window 顶部：
 *   Home.vue 在正文上方还有一张整屏横幅（.blog-banner--full），把 window 滚到 0
 *   看到的是横幅而不是内容；而 el-main 本身还带 translateY(-50px) 与横幅重叠 ——
 *   「内容的最上面」只能是 el-main 的顶部，不能靠一个写死的数值猜。
 *
 * ⚠ 为什么不用 vue-router 的 scrollBehavior：
 *   它只在 history 模式下生效，本项目是 hash 模式。所以路由切换的归位写在
 *   router/index.js 的 afterEach 里（那是全站唯一的路由出口）。
 *
 * ⚠ 坐标口径：本文件里的数值全部来自 getBoundingClientRect() + window.scrollY，
 *   两者在同一坐标系里（body 上挂了 zoom:1.25，实测 rect 与 scrollY 仍然自洽，
 *   滚到 rect+scrollY 的位置元素就正好落在视口 0）。所以偏移量不要写死 72px，
 *   一律靠**实测**头部元素的高度，免得日后改头部高度或改缩放倍率就错位。
 *
 * 使用方：
 *   router/index.js            —— 每次路由切换（Index 除外）归位
 *   components/base/FloatMenu  —— 「去顶部」按钮
 *   views/Index.vue            —— 列表页自己的滚动位置记录（唯一例外：不归位，要还原）
 *   components/comment/CommentSection.vue —— 滚到评论输入框（目标位置自己算）
 */

// Home.vue 里包着 router-view 的那个 el-main
const MAIN_SELECTOR = '.blog-middle-main'

// 固定头部导航（Home.vue 的 <Head/>）
const HEAD_SELECTOR = '.blog-head'

// 正文顶部与头部导航之间额外留的间距（与 rect 同一坐标系）
const HEAD_GAP = 10

// 内容异步长高后的补偿窗口：超过这个时间就不再纠缠
const STICKY_MS = 1500

// 补偿令牌：后一次归位会让前一次的补偿立刻失效
let stickySeq = 0

// 标准属性是 window.scrollY；老 WebKit 只认 pageYOffset
export function getScrollTop() {
  return window.scrollY ?? window.pageYOffset ?? 0
}

/**
 * 滚动到指定位置
 * @param {number} top — 目标位置（文档坐标）
 * @param {string} behavior — 'auto' 立即 / 'smooth' 平滑
 */
export function setScrollTop(top = 0, behavior = 'auto') {
  window.scrollTo({ top, behavior })
}

/**
 * 正文容器顶部距文档顶部的偏移
 * 拿不到容器时回落 0（等价于 window 顶部，至少不会不滚）
 */
export function getContentTop() {
  const el = document.querySelector(MAIN_SELECTOR)
  if (!el) return 0
  // el-main 带 transform: translateY(-50px)，getBoundingClientRect 拿到的
  // 正是变换之后的实际位置，不用再手动补那 50px
  return Math.max(el.getBoundingClientRect().top + getScrollTop(), 0)
}

/**
 * 固定头部导航占掉的高度（+ 一点间距）
 *
 * 头部是 position: fixed; top: 0，所以它的 rect.bottom 就是它盖住的视口高度 ——
 * 用实测值而不是写死的 72px：改头部高度、改 zoom 倍率都不用回来动这里。
 */
export function getHeadOffset() {
  const el = document.querySelector(HEAD_SELECTOR)
  if (!el) return 0
  return el.getBoundingClientRect().bottom + HEAD_GAP
}

// 页面切换过渡的名字 —— 必须与 Home.vue 里 <transition name="..."> 一致。
// 只用来判断「旧页面还在不在退场」（下面 afterPageSwap 里查 -leave-active 类）
const PAGE_FADE_NAME = 'blog-page--fade'

// 等退场结束的兜底上限：正常 0.18s 就完了；等不到（类名没被摘掉、过渡被打断）就不再等
const SWAP_WAIT_MS = 500

/**
 * 等「旧页面退场」结束再执行 —— 路由切换引起的滚动归位必须挂在它里面
 *
 * 为什么不能直接做：afterEach 里的 nextTick 落在旧页面刚开始 leave 的那一帧 ——
 * 那一帧旧页面还在、透明度还是 1，此时改滚动位置，用户看到的就是
 * 「滚动条先跳一下，然后旧内容才淡出、新内容再淡入」。
 *  实测（headless Chrome 逐帧采样，/index scrollY=900 → 点卡片进详情）：
 *    t=16ms  900 → 620（过渡态 leave，旧页面可见）  ← 毛病就在这一帧
 *    t=231ms 新页面 enter
 * out-in 模式下新页面是 leave 结束之后才插进来的，而它进场的第一帧是 opacity:0，
 * 所以改到那一刻再动滚动，两端都看不见，滚动条怎么动都不露痕迹。
 *
 * 没有过渡（同一个组件换路由参数，如 /article/1 → /article/2）时旧元素上没有 leave 类，
 * 这种情况立刻执行，不白等。
 *
 * @param {Function} fn — 退场结束后要做的事（通常是 scrollToContentTop 或还原位置）
 */
export function afterPageSwap(fn) {
  const LEAVE_CLASS = `${PAGE_FADE_NAME}-leave-active`
  if (!document.querySelector(`.${LEAVE_CLASS}`)) {
    fn()
    return
  }
  const deadline = performance.now() + SWAP_WAIT_MS
  const tick = () => {
    if (!document.querySelector(`.${LEAVE_CLASS}`) || performance.now() > deadline) {
      fn()
      return
    }
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

/**
 * 滚到正文最上方（让出固定头部的高度）
 *
 * @param {object} [options]
 * @param {string} [options.behavior='auto'] — 'auto' / 'smooth'
 *
 * ⚠ 为什么不是「滚一下就完事」：
 *   非 Index 页的正文是异步取数后才有高度的。afterEach 那一帧里，新页面才刚挂上、
 *   列表还是空的，文档还很矮 —— 目标位置会被浏览器按「最大可滚距离」**夹断**。
 *   实测（未加补偿前）：/column 目标 753、当时文档 1224/视口 805，最大只能滚 419，
 *   于是停在 419；等数据回来文档长到 1546，那个位置就永远错了。
 *   所以滚完之后还要盯一会儿文档高度，长高了就按新高度重新对齐。
 *
 * ⚠ 用户一旦自己滚动（滚轮 / 触摸），立刻放弃补偿 —— 不能跟用户抢滚动条。
 *   用 wheel / touchstart 而不是 scroll 事件：scroll 只能区分「滚了」，
 *   而我们的补偿本身也会触发 scroll，用它会自己把自己掐掉。
 */
export function scrollToContentTop(options = {}) {
  const behavior = options.behavior || 'auto'
  const seq = ++stickySeq
  let finished = false

  const target = () => Math.max(getContentTop() - getHeadOffset(), 0)
  const apply = () => {
    if (finished || seq !== stickySeq) return
    setScrollTop(target(), behavior)
  }

  apply()

  const cleanup = () => {
    clearTimeout(timer)
    window.removeEventListener('wheel', onUserScroll)
    window.removeEventListener('touchstart', onUserScroll)
    if (observer) observer.disconnect()
  }
  const release = () => {
    if (finished) return
    finished = true
    cleanup()
  }
  const onUserScroll = (e) => {
    // 只认真实用户操作：代码里 dispatch 出来的合成事件不算
    if (e.isTrusted) release()
  }

  window.addEventListener('wheel', onUserScroll, { passive: true })
  window.addEventListener('touchstart', onUserScroll, { passive: true })

  // 内容长高（异步数据到位、图片撑开等）→ 按新高度重新对齐
  // 观察 body 而不是 el-main：横幅、aside、footer 的变化同样会改变可滚范围
  let observer = null
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(apply)
    observer.observe(document.body)
  }

  const timer = setTimeout(release, STICKY_MS)
}
