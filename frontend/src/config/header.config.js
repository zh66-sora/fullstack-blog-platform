/**
 * 页头主导航 —— config 层
 *
 * 五条导航：图标字形 + 文案 + 路由。两个宿主读同一份：
 *   · `views/Head.vue` 的大屏导航条（`hidden-xs-only`，<768 就没了）
 *   · `components/head/HeadDrawer.vue` 小屏汉堡抽屉（<768 才出现）
 * 所以文案和路由只能写在这里，两边都别自己写死。
 *
 * ⚠ 第五条原是「个人」→ /info（个人资料编辑页），现改成「关于」→ /about（时间线展示页）。
 *   改的只是这一格的字面与落点，五条的条数、顺序、样式都没动 ——
 *   个人资料编辑页仍在，入口换成侧栏的「页面导航 → 个人中心」。
 */
export default [
  { iconName: 'icon-zhuye', text: '主页', route: { name: 'Index' } },
  { iconName: 'icon-xieboke', text: '博客', route: { name: 'Write' } },
  { iconName: 'icon-Category', text: '板块', route: { name: 'Column' } },
  { iconName: 'icon-pinglun', text: '留言', route: { name: 'Message' } },
  // icon-guanyu 是 iconfont 里现成的「关于」字形（原本的 icon-gerenzhongxin 留给侧栏的个人中心）
  { iconName: 'icon-guanyu', text: '关于', route: { name: 'About' } },
]

/**
 * 汉堡抽屉里「调色盘入口」那一条
 *
 * ⚠ 它不是一条导航：点它是「关掉抽屉 + 唤起页头那个调色盘弹出框」，
 *   所以只有文案和图标 —— 既没有 `route` 也没有 `action`，
 *   不能交给 `mixins/navActions` 的 handleNav 分发（那边的约定是二者必居其一）。
 */
export const DRAWER_PALETTE = { text: '调色盘', iconName: 'icon-yanse' }
