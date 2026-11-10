<template>
  <!--
    板块导航页（/column）
      模板：myBlog/src/template/columnNav.hbs
      样式：myBlog/src/styl/index.styl 第 387-485 行

    数据：GET /api/rest/columns（后端已按 POPULATE_MAP populate 了 articles，
          「篇数」直接取数组长度，不需要像原项目那样点一次再查一次详情）
    跳转：有文章 → 文章列表并按板块过滤；没有 → 兜底页（走失页）
  -->
  <el-card id="column" class="blog-card blog-column--wrap" shadow="never">
    <!-- 顶栏：返回 + 标题。放 el-card 的 header 插槽，做成贴着卡片上沿的整条色块 -->
    <div slot="header" class="blog-column--header">
      <span
        class="blog-column--back iconfont icon-huitui"
        title="返回主页"
        @click="goBack"
      ></span>
      <h3>板块导航</h3>
    </div>

    <!-- 板块列表：按文章数降序，每行一个 ColumnItem
         ⚠ 本页**没有空态**了：「一个板块都没有」交给全局兜底页的 empty 状态
           （见 fetchColumns 末尾的 goLost），避免请求失败时静默渲染成「暂无板块数据」 -->
    <ul v-if="hasData" class="blog-column--list">
      <ColumnItem
        v-for="item in list"
        :key="item.id"
        :item="item"
        @select="handleSelect"
      />
    </ul>
  </el-card>
</template>

<script>
import ColumnItem from "@/components/column/ColumnItem.vue";
import { buildColumnViewModel } from "@/utils/columnUtils";
import { goLost } from "@/utils/lost";
// 「我现在看的是谁的主页」—— 板块数量按「当前访问用户」统计
import visitContext from "@/mixins/visitContext";

export default {
  name: "Column",
  components: { ColumnItem },
  mixins: [visitContext],
  data() {
    return {
      // buildColumnViewModel 的产出（初值空：请求回来前只有卡片壳和顶栏）
      columnsData: { list: [], hasData: false },
    };
  },
  computed: {
    list() {
      return this.columnsData.list;
    },
    hasData() {
      return this.columnsData.hasData;
    },
    /**
     * 板块数量统计对象（需求原文：「板块导航全部改为，当前访问用户的板块数量统计」）：
     *   他人主页 → 被访问用户
     *   自己的主页 → 登录用户自己（这也是「当前访问用户」）
     *   游客、无访问对象 → 空串 = 全站统计
     *
     * ⚠ 想改回「只在他人主页按 TA 统计、自己/游客仍全站」的话，
     *   把这一行改成 `return this.visitedUserId || ""` 即可（单点切换）。
     */
    ownerId() {
      return this.visitedUserId || (this.isLogin ? String(this.selfUserId) : "");
    },
  },
  created() {
    // ⚠ Home.vue 的 keep-alive 只缓存 Index / Write —— 本页每次进入都会重建，
    //   所以数据每次都重拉，不存在「缓存住不更新」的问题
    this.fetchColumns();
  },
  methods: {
    /**
     * 拉取全部板块：GET /api/rest/columns?size=100
     *
     * 通用 REST 类型就够用（params.resource 替换 URL 里的 {resource} 占位符），
     * config/api.config.js 不需要新增类型。
     * 后端默认 size 也是 100，显式写出来是为了将来板块变多时不会静默截断。
     */
    async fetchColumns() {
      try {
        const res = await this.$api({
          type: "queryResourceList",
          params: { resource: "columns" },
          data: { size: 100 },
        });
        // 跳转兜底页
        if (!res?.data) return goLost(this, "loadFailed");
        this.columnsData = buildColumnViewModel(res.data, this.ownerId);
        // 请求成功、但一个板块都没有 → 兜底页的 empty 状态（本页已经没有空态了）
        if (!this.columnsData.hasData) goLost(this, "empty");
      } catch (err) {
        // 兜底：万一将来 http.js 改成正常 reject，这里也接得住
        // 整页就靠这一次请求 —— 失败就直接去兜底页（能重试）
        goLost(this, "loadFailed");
      }
    },

    /**
     * 点某个板块：有文章 → 文章列表（带板块过滤）；没有 → 兜底页
     *
     * 原项目 navigateFromColumn 会再查一次板块详情来判断篇数
     * （articleBus.js 332-349）；列表接口已经把 articles 带回来了，
     * 篇数就在 item.count 上 —— 这一步直接省掉。
     *
     * ⚠ 他人主页下点板块要**保持访问上下文**：跳 /user/:id?category=xx，
     *   而不是 /index（那会回到全站列表）。
     */
    handleSelect(item) {
      const query = { category: item.id };
      if (item.count > 0) {
        if (this.visitedUserId) {
          this.$router.push({ name: "UserHome", params: { id: this.visitedUserId }, query });
        } else {
          this.$router.push({ name: "Index", query });
        }
        return;
      }
      // 该板块下（对该访问对象）没有文章 → 兜底页。
      // 自己 → empty（有「去写一篇」）；别人 → emptyOther（没有，你不能替 TA 写）
      // ⚠ 走 goLost（带 uid + from）：访问上下文下兜底页的 Head/Aside 才不丢访问对象
      goLost(this, this.visitedUserId ? "emptyOther" : "empty", { category: item.id });
    },

    // 返回主页（原项目是 data-route="index" → 路由跳转）
    // ⚠ 他人主页下返回的是「被访问用户的列表页」，不是自己的首页
    goBack() {
      if (this.visitedUserId) {
        this.$router.push({ name: "UserHome", params: { id: this.visitedUserId } });
        return;
      }
      this.$router.push({ name: "Index" });
    },
  },
};
</script>

<style lang='stylus'>
@import '../assets/css/themes.styl'

// ============================================================
// 板块导航页（迁移自 myBlog/src/styl/index.styl 第 387-485 行）
//
// ⚠ 声明统一写「属性: 值」带冒号形式 —— Stylus 对「无冒号 + 值是多段」有歧义：
//   紧跟缩进更深的嵌套块时会被当成选择器解析、整条静默丢失（详见 component.styl 顶部）。
//
// ⚠ 原项目那段选择器带着 `article` 前缀（`article .blog-column--wrap`），
//   因为当时渲染在 <article class="blog-article"> 里；新项目没有这个容器，
//   容器身份由本组件自己承担（#column），前缀一并去掉。
// ============================================================

// ===== 卡片：顶栏要「贴边整条色块」 =====
// el-card 默认给 header/body 各留 24px 内边距，顶栏就贴不到卡片边缘（原项目是 .blog-card 的 padding:0）
// ⚠ 权重写到 4 个类：要压过 component.styl 的 `.el-card.blog-card .el-card__header`
//   （同权重时看注入顺序，靠不住）
.el-card.blog-card.blog-column--wrap
  .el-card__header
    padding: 0
  .el-card__body
    padding: 0

#column
  // 原项目是 `height:100%; overflow-y:auto` —— 那是给「固定高的渲染容器」用的。
  // 新项目整页滚动（Home.vue 把 el-main 设成了 overflow: visible，滚动条在 window 上），
  // 照搬会得到一个高度不知从哪来的嵌套滚动区。改成与 #index 同款：不锁高，底部留白。
  margin-bottom: $theme-spacing['2xl']

// ===== 顶栏：返回键 + 标题 =====
.blog-column--header
  display: flex
  align-items: center
  padding: $theme-spacing.base
  background-color: var(--theme-bgc-deepBtn)
  color: var(--theme-font-fst)
  // 原项目写的是 md(12px)，而卡片圆角是 lg(16px) —— 与 Write.vue 统一成 lg，四角才严丝合缝
  border-radius: $theme-radius.lg $theme-radius.lg 0 0

  h3
    font-size: $theme-fz.lg
    font-weight: 700

.blog-column--back
  display: flex
  align-items: center
  justify-content: center
  width: 36px
  height: 36px
  margin-right: $theme-spacing.base
  border-radius: 50%
  // 底色不能写死 #fff：深色模式下它会变成顶栏上的一块白斑，
  // 里面的图标（--theme-font-fst）在白底上也只有 2.35 的对比度。
  // 走 --theme-bgc-card：浅色下仍是白（视觉零变化），深色下是比顶栏更暗的一档
  background-color: var(--theme-bgc-card)
  color: var(--theme-font-fst)
  cursor: pointer
  transition: all 0.2s ease

  &:hover
    box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.2)
    transform: translateY(-2px)

// ===== 列表（行本身在 components/column/ColumnItem.vue 里）=====
.blog-column--list
  display: flex
  flex-direction: column
  gap: $theme-spacing.base
  padding: $theme-spacing.xl
</style>
