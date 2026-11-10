/**
 * 浮动按钮组配置 — config 层
 * =========================================================================
 *
 * 分两部分：
 *   FLOAT_BUTTONS —— 按钮注册表：一个按钮「长什么样 + 点了干什么」
 *                    （action 写的是 FloatMenu.vue 里 methods 的名字）
 *   default       —— 路由 → 按钮列表：按 router/index.js 里的「路由 name」取值
 *
 * 读取规则（见 FloatMenu.vue 的 computed buttons）：
 *   ① 当前路由 name 能在这张表里查到 → 按数组顺序渲染表里的按钮
 *   ② 查不到（或数组为空）         → 整个浮动按钮组不渲染，连圆形开关都不出现
 *
 * 所以「某个页面不要浮动按钮」= 这张表里不写它（例如 Write 写博客页就没写 ——
 * 长文编辑时浮动按钮会压住编辑器右下角）。
 * 要加/减按钮只改这张表；要加一个全新按钮，先在 FLOAT_BUTTONS 里登记，
 * 再到 FloatMenu.vue 里补一个同名方法。
 */

/**
 * 按钮注册表：key → { icon, activeIcon?, tip, action }
 *
 *   icon       常态图标 —— **完整 class 字符串**（可能含多个类，模板直接 :class 用）
 *   activeIcon 选中态图标 —— 只有「有状态」的按钮才需要（点赞：未赞描边 / 已赞实心）
 *   tip        悬浮提示文案（el-tooltip 的内容）
 *   action     FloatMenu.vue 的 methods 名，点击时按名字分发
 *
 * ⚠ icon 一定要写全「用哪套字体」的类名，两套图标字体不能混用：
 *   项目自带的 iconfont   → 'iconfont icon-xxx'（字形在 assets/fonts/iconfont.css）
 *   Element 自带图标字体 → 'el-icon-xxx'
 *   Element 的 `[class^=el-icon-]` 是按「类名以 el-icon- 开头」匹配的，
 *   所以 Element 图标不能和 iconfont 类写在一起（会匹配不上、显示成方框）。
 *
 * 为什么「刷新」用的是 Element 的图标：
 *   项目自带的 iconfont 里没有「刷新 / 循环箭头」字形（最接近的 icon-huitui 是「回退」，
 *   看着像返回上一页）。Element 的 el-icon-refresh 就是标准的刷新图标，且字体已随
 *   element-ui 一起打包，不用再加资源。尺寸与颜色仍由 FloatMenu.vue 的
 *   `.blog-float--btn i` 统一控制（font-size: 20px / color: var(--theme-font-light)），
 *   与其它按钮完全一致。
 *   若之后往 iconfont 里补了一个刷新字形，把这里换回 'iconfont icon-xxx' 即可。
 */
export const FLOAT_BUTTONS = {
  goTop: { icon: 'iconfont icon-shang', tip: '去顶部', action: 'goTop' },
  refresh: { icon: 'el-icon-refresh', tip: '刷新', action: 'refresh' },
  like: {
    icon: 'iconfont icon-xihuan1',
    activeIcon: 'iconfont icon-xihuan',
    tip: '点赞',
    action: 'like'
  },
  comment: { icon: 'iconfont icon-pinglun', tip: '评论', action: 'comment' }
}

/**
 * 路由 name → 按钮 key 列表
 * 键必须与 router/index.js 里的 name 完全一致（没有 name 的路由用不上本组件）
 */
export default {
  // 主页：文章列表
  Index: ['goTop', 'refresh'],
  // 板块快捷导航页
  Column: ['goTop', 'refresh'],
  // 留言页
  Message: ['goTop', 'refresh'],
  // 个人介绍页
  Info: ['goTop', 'refresh'],
  // 文章详情页：在通用两个之外多「点赞 / 评论」
  // （原项目靠 .blog-float--article-only + .is-article 类控制显隐，这里直接由配置决定）
  Article: ['goTop', 'refresh', 'like', 'comment']
}
