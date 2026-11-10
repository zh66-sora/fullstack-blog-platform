/**
 * 留言墙配置 — config 层
 * =========================================================================
 *
 * 留言墙这条线一共有三份「配置」性质的东西，各归各的：
 *   · 正文长度上限 `WALL_MAX_LEN` → utils/wallUtils.js
 *     （输入框的实时计数器要用它，跟「视图模型」是同一件事，放那边更近）
 *   · 留言/回复接口 → config/api.config.js
 *   · 侧栏那张「弹幕留言墙」卡片的参数与文案 → **本文件**（WALL_DANMAKU）
 *
 * ⚠ 本文件只放「不依赖运行时的声明」：轨道数、时长、间隔、文案。
 *   抽哪一条、什么时候发是运行时逻辑，在 components/wall/WallDanmaku.vue 里。
 */

/**
 * 弹幕留言墙（侧栏「扩展功能」下面那张卡片）
 *
 * 形态参考手机版 QQ 空间的留言板：五条轨道，一条条弹幕从右往左飞过，
 * 每条 = 圆形头像 + 一段留言正文（**不带留言者的名字**）。
 *
 * ⚠ 这张卡的两个「不出现」条件写在 views/Aside.vue 的 showDanmaku 里
 *   （未登录、或当前就在留言路由上），不属于这里的配置。
 *
 *   title        卡片标题
 *   entry        标题右侧的入口提示（整张卡片都可点，这只是个明示）
 *   empty        一条留言都没有时的占位文案
 *   trackCount   轨道数（需求指定 5 条）
 *   poolSize     一次拉到本地多少条留言当「弹幕池」（每次发射都从这里随机抽）
 *   flyDuration  单条弹幕的飞行时长（秒，闭区间内随机）
 *                每条都随机一点，否则五条轨道像方阵一样齐步走
 *   trackGap     同一条轨道上「上一条飞完之后」再空多久才发下一条（毫秒，闭区间随机）
 *   stagger      轨道之间的错峰步长（毫秒）——第 n 条轨道的首发延迟 ≈ n × stagger
 */
export const WALL_DANMAKU = {
  title: '弹幕留言墙',
  entry: '留言板',
  empty: '还没有人留言，去留第一句吧~',
  trackCount: 5,
  poolSize: 50,
  flyDuration: [9, 13],
  trackGap: [200, 1400],
  stagger: 1500
}

export default {
  danmaku: WALL_DANMAKU
}
