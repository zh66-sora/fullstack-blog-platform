/**
 * 跳到全局兜底页 — utils 层
 *
 * 只有一件事要做对：**把出事前的地址带上**（query.from）。
 * 兜底页里「重新加载」那颗按钮是整页 reload，而那一刻地址栏已经是 `/lost?state=...` ——
 * 没有 from 的话 reload 只会把兜底页自己再加载一遍，回不到出问题的页面。
 *
 * 这个约定横跨两个文件，所以收进这里，两边都引用它：
 *   写 → 本函数（跳转方）
 *   读 → components/column/Lost.vue 的 runAction('reload')
 *
 * ⚠ 只在「整页赖以存在的那一次请求」失败时调用（首屏列表、板块列表、文章详情）。
 *   局部 / 静默请求失败不要跳 —— 点赞、评论列表、点赞态度查询（api.config 里那些
 *   noMessage: true 的）本来就是「失败也无所谓」，一跳就会变成
 *   「点个赞失败被人弹出当前页面」。
 *
 * ⚠ 用 replace 而不是 push：兜底页不该进历史记录，
 *   这样兜底页的「返回上一页」能回到出事前的那个页面，而不是又绕回兜底页。
 *
 * @param {Vue} vm — 调用方组件实例（需要 vm.$router / vm.$route）
 * @param {string} state — 兜底状态 key（见 config/lost.config.js），如 'loadFailed'
 * @param {object} [extraQuery] — 额外要带过去的参数（如 { category: 板块 _id }，
 *                 让兜底页的 empty 状态能显示「XX 板块」而不是通用文案）
 *
 * ⚠ 访问上下文透传：调用方若混入了 mixins/visitContext.js（有 vm.visitedUserId），
 *   这里把 uid 一起带过去 —— 否则兜底页的 $route.query 里没有 uid，
 *   Head / Aside 会掉回「登录用户自己」的状态（需求：访问没写过博客的用户时也要保持访问 TA）。
 */
export function goLost(vm, state, extraQuery = {}) {
  const uid = vm.visitedUserId || ''
  vm.$router.replace({
    name: 'Lost',
    query: {
      state,
      from: vm.$route.fullPath,
      ...(uid ? { uid } : {}),
      ...extraQuery,
    },
  })
}
