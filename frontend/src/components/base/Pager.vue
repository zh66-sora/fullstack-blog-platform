<template>
  <!--
    分页器 —— 文章列表页（Index.vue）的服务端分页控件

      结构：左「上一页」 —— 中间页码按钮 —— 右「下一页」
      数据：page = 当前页（1 起） / pages = 总页数，都由后端分页结果驱动
      事件：change(newPage) 抛给父组件去重新请求，组件本身不碰请求逻辑

    节流：翻页入口统一走 lodash throttle（THROTTLE_MS 窗口，前沿 + 尾沿），
      连点「下一页」不会打出一串请求，且最终一定停在最后点的那一页。

    折叠规则（pagerCount = 7，与 Element el-pagination 一致）：
      总页数 ≤ 7 → 全平铺
      总页数 > 7 → 首页、末页恒显，中段只留当前页 ±2，其余收成省略号
      → 按钮总数有上限，容器宽度稳定，不会因为页数多而抖
  -->
  <div class="blog-pager">
    <!-- 上一页：第 1 页禁用（灰字灰边 + 不可点） -->
    <el-button
      class="blog-pager--btn blog-pager--step"
      :disabled="isFirst"
      @click="go(page - 1)"
    >
      <i class="iconfont icon-huitui"></i>
      <span>上一页</span>
    </el-button>

    <!-- 中间：页码按钮 -->
    <div class="blog-pager--nums">
      <!-- 首页：恒显 -->
      <el-button
        class="blog-pager--btn blog-pager--num"
        :class="{ 'blog-pager--active': page === 1 }"
        @click="go(1)"
        >1</el-button
      >

      <!-- 前段省略号：只有折叠时才出现 -->
      <span v-if="pager.showPrevMore" class="blog-pager--more">…</span>

      <!-- 中段窗口（pageCount ≤ 7 时就是 2 ~ pages-1） -->
      <el-button
        v-for="p in pager.middle"
        :key="p"
        class="blog-pager--btn blog-pager--num"
        :class="{ 'blog-pager--active': page === p }"
        @click="go(p)"
        >{{ p }}</el-button
      >

      <!-- 后段省略号 -->
      <span v-if="pager.showNextMore" class="blog-pager--more">…</span>

      <!-- 末页：恒显（只有 1 页时省掉，避免和首页按钮重复） -->
      <el-button
        v-if="pages > 1"
        class="blog-pager--btn blog-pager--num"
        :class="{ 'blog-pager--active': page === pages }"
        @click="go(pages)"
        >{{ pages }}</el-button
      >
    </div>

    <!-- 下一页：最后一页禁用 -->
    <el-button
      class="blog-pager--btn blog-pager--step"
      :disabled="isLast"
      @click="go(page + 1)"
    >
      <span>下一页</span>
      <i class="iconfont icon-right-1-copy"></i>
    </el-button>
  </div>
</template>

<script>
// 按需引入：只拿 throttle 一个函数，不把整包 lodash（约 70KB gzip）打进产物
import throttle from "lodash/throttle";

// 折叠阈值：页码按钮总数上限（Element 的 el-pagination 默认也是 7，取奇数才能对称）
const PAGER_COUNT = 7;

// 翻页节流窗口（ms）：窗口内的连续点击最多只放两次请求出去（前沿 + 尾沿）
const THROTTLE_MS = 400;

export default {
  name: "Pager",
  props: {
    // 当前页（1 起）
    page: { type: Number, default: 1 },
    // 总页数，来自后端分页结果
    pages: { type: Number, default: 0 },
  },
  created() {
    // ⚠ 节流函数必须"每个组件实例一份"，所以在 created 里现造
    this.throttledGo = throttle(this.emitChange, THROTTLE_MS, {
      // 前沿立即执行：点一下马上有反馈，不用等窗口结束
      leading: true,
      // 尾沿补发：连点「下一页」时最终一定停在最后点的那一页，
      // 而不是丢在窗口中间（实测连点 5 次 → 只执行 2 次，最后一次参数正确）
      trailing: true,
    });
  },
  beforeDestroy() {
    // 真正销毁时取消挂起的尾沿调用
    this.throttledGo.cancel();
  },
  /**
   * ⚠ keep-alive 把 Index 缓存走时，子组件同样会收到 deactivated
   * 缓存且被隐藏时,清空节流栈。防止：
   * 「点了下一页 + 立刻跳去别的路由 → 400ms 后仍补发一次翻页请求」。
   */
  deactivated() {
    this.throttledGo.cancel();
  },
  computed: {
    isFirst() {
      return this.page <= 1;
    },
    isLast() {
      return this.page >= this.pages;
    },
    /**
     * 页码折叠模型 → { showPrevMore, showNextMore, middle[] }
     *
     * 算法与 Element el-pagination 的 pager 一致（这里是纯计算，不改组件状态）：
     *   half = (pagerCount - 1) / 2 = 3   —— 首/末页各占 1 个按钮位后，
     *   当前页离开两端超过 3 页时，那一端才折叠成省略号。
     */
    pager() {
      const pagerCount = PAGER_COUNT;
      const pageCount = this.pages;
      const currentPage = this.page;
      const half = (pagerCount - 1) / 2;

      let showPrevMore = false;
      let showNextMore = false;
      // 总页数没超过阈值时两端都不折叠
      if (pageCount > pagerCount) {
        if (currentPage > pagerCount - half) showPrevMore = true;
        if (currentPage < pageCount - half) showNextMore = true;
      }

      const middle = [];
      if (showPrevMore && !showNextMore) {
        // 只折前段（靠近末页）：中段贴住末页往前排
        const start = pageCount - (pagerCount - 2);
        for (let i = start; i < pageCount; i++) middle.push(i);
      } else if (!showPrevMore && showNextMore) {
        // 只折后段（靠近首页）：中段从第 2 页往后排
        for (let i = 2; i < pagerCount; i++) middle.push(i);
      } else if (showPrevMore && showNextMore) {
        // 两端都折：当前页居中，左右各 offset 个
        const offset = Math.floor(pagerCount / 2) - 1;
        for (let i = currentPage - offset; i <= currentPage + offset; i++) {
          middle.push(i);
        }
      } else {
        // 不折叠（含 pageCount ≤ pagerCount 的情况）：铺满 2 ~ pages-1
        for (let i = 2; i < pageCount; i++) middle.push(i);
      }

      return { showPrevMore, showNextMore, middle };
    },
  },
  methods: {
    /**
     * 模板上绑定的翻页入口（上一页 / 下一页 / 页码都走它）
     * 包一层节流：快速连点只放一到两次请求出去。
     * 若想"只认最后一次点击、绝不重复"，把 throttle 换成 debounce 即可。
     */
    go(target) {
      this.throttledGo(target);
    },

    // 真正的校验 + 抛事件（被节流命中后才会执行）
    emitChange(target) {
      // 越界、原地点击都不触发 —— 请求由父组件负责
      if (target < 1 || target > this.pages || target === this.page) return;
      this.$emit("change", target);
    },
  },
};
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// ============================================================
// 分页器样式
//
// 视觉基线：
//   容器 —— 跟随 .blog-card 的外壳（白底 / 16px 圆角 / lg 阴影）
//     ⚠ 这里显式写一遍，而不是给容器挂 .blog-card：
//       component.styl 里的选择器是 `.el-card.blog-card`，要求元素同时带 el-card 类；
//       而分页器是个普通 div（套 el-card 会多出一层 .el-card__body 影响布局）。
//       与 modal.styl 处理 .blog-modal--wrap 的思路一致。
//   按钮 —— 跟随登录表单 modal.styl 里的 .el-button：
//       常态   = 描边幽灵按钮（透明底 + 半透明主题色描边）
//       上一页 / 下一页 = .blog-btn--submit 那套（实心 --theme-font-fst + 白字 + 投影）
//       当前页 = 同上实心主题色（页码里被选中的那一个）
//       禁用   = 换成中性灰底 --theme-bgc-disabledBtn + 白字，取消手型与 hover 反馈
//
// ⚠ 本文件所有声明统一写成「属性: 值」的带冒号形式 ——
//   Stylus 对「无冒号 + 值是多段」的声明有歧义，紧跟缩进更深的嵌套块时
//   会被当成选择器解析、整条静默丢失（详见 component.styl 顶部说明）。
// ============================================================

.blog-pager
  display: flex
  align-items: center
  margin-top: $theme-spacing.lg
  gap: $theme-spacing.base
  padding: $theme-spacing.base $theme-spacing.lg
  border-radius: $theme-radius.lg
  background-color: var(--theme-bgc-card)
  border: 1px solid var(--theme-border)

// ===== 按钮 =====
// ⚠ 选择器带上 .el-button 且前缀 .blog-pager，权重 (0,3,0) ——
//   必须压过 element 自带的
//     `.el-button`            （padding / font-size / 白底描边）
//     `.el-button--small`     （全局 size: 'small' 给的 padding / 圆角）
//     `.el-button + .el-button`（相邻按钮 margin-left: 10px ← 间距交给 gap，要归零）
//   单写 `.blog-pager--btn` 只有 (0,1,0)，会输给上面几条。
.blog-pager .el-button.blog-pager--btn
  display: inline-flex
  align-items: center
  justify-content: center
  gap: 6px
  margin: 0
  height: 34px
  min-width: 34px
  padding: 0 $theme-spacing.base
  line-height: 1.5
  font-size: $theme-fz.sm
  border: 1px solid rgba(104, 174, 244, 0.45)
  border-radius: $theme-radius.xs
  background-color: transparent
  color: var(--theme-font-fst)
  transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease

  i
    font-size: $theme-fz.sm

  &:hover,
  &:focus
    background-color: var(--theme-bgc-lightBtn)
    border-color: var(--theme-font-fst)
    color: var(--theme-font-fst)

  &:active
    transform: translateY(1px)

  // ---- 上一页 / 下一页：实心主题色（同登录表单的提交按钮 .blog-btn--submit）----
  // ⚠ 必须放在上面那条 `&:hover` 之后：两者权重同为 (0,4,0)，靠源顺序决胜；
  //   反过来会被幽灵按钮的 hover 底色覆盖。这里再单独写一遍 hover/focus，
  //   用 (0,5,0) 把 hover 反馈换成「更深的主题色」。
  &.blog-pager--step
    border-color: var(--theme-font-fst)
    background-color: var(--theme-font-fst)
    color: #fff
    box-shadow: 0 6px 16px rgba(104, 174, 244, 0.32)

    &:hover,
    &:focus
      background-color: var(--theme-font-sec)
      border-color: var(--theme-font-sec)
      color: #fff

  // ---- 当前页：同样是实心主题色（页码里被选中的那一个）----
  &.blog-pager--active
    border-color: var(--theme-font-fst)
    background-color: var(--theme-font-fst)
    color: #fff
    box-shadow: 0 6px 16px rgba(104, 174, 244, 0.32)

    &:hover,
    &:focus
      background-color: var(--theme-font-sec)
      border-color: var(--theme-font-sec)
      color: #fff

  // ---- 禁用（首页的「上一页」/ 末页的「下一页」）----
  // element 默认给 #C0C4CC，与主题的冷调灰不搭，统一换成 --theme-bgc-disabledBtn。
  // 底色换成灰但字仍留白 —— 和上面两个实心按钮是同一套结构，只是换了强调色。
  &.is-disabled,
  &.is-disabled:hover,
  &.is-disabled:focus
    border-color: var(--theme-bgc-disabledBtn)
    background-color: var(--theme-bgc-disabledBtn)
    color: #fff
    box-shadow: none
    transform: none
    cursor: not-allowed

// 页码按钮是方形的（不带左右文字），左右内边距去掉，宽度由 min-width 兜住
.blog-pager .el-button.blog-pager--num
  padding: 0

// ===== 中间区：吃掉左右两侧的剩余空间，让页码整体居中 =====
.blog-pager--nums
  display: flex
  flex: 1 1 auto
  align-items: center
  justify-content: center
  gap: $theme-spacing.sm
  min-width: 0

// ===== 省略号 =====
.blog-pager--more
  padding: 0 $theme-spacing.xs
  line-height: 34px
  font-size: $theme-fz.sm
  color: var(--theme-font-trd)
  user-select: none

// ===== 响应式：xs（< 768px，Element 的 xs 上界 767px）=====
// 窄屏放不下「图标 + 文字」的两侧按钮与一排页码，
// 收紧间距并把页码区改成可换行，避免撑破容器。
@media only screen and (max-width: 767px)
  .blog-pager
    gap: $theme-spacing.sm
    padding: $theme-spacing.base

  .blog-pager .el-button.blog-pager--btn
    padding: 0 $theme-spacing.base

  .blog-pager--nums
    flex-wrap: wrap
    row-gap: $theme-spacing.xs
</style>
