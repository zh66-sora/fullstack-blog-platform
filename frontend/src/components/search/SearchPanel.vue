<template>
  <!--
    搜索控制面板 —— 常驻首页（Index.vue 卡片列表上方）

    迁移自 myBlog/src/template/searchControl.hbs + app/bus/searchBus.js 的 getSearchControlHTML

    ## 它是纯「筛选控件」，不碰数据
      所有筛选值都从 props.filters 进来（父组件用 $route.query 派生），
      所有改动都以 patch 的形式 emit('update') 抛出去，由 Index 统一写进 URL。
      这样面板与取数完全解耦：改任何一个控件 = 改 URL = 首页重新拉数据。

    ## 与 Handlebars 版的差异
      原版因为 Handlebars 没有 helper，selected / has-value 这些布尔值
      必须在 getSearchControlHTML 里预先算好再传给模板；
      Vue 里直接在模板用 :class 算，少了一层「预计算数据」，改起来只看这一处。
  -->
  <div class="blog-search--panel">
    <!-- 头部：整行可点，展开/收起（状态存 Vuex，刷新后保留） -->
    <div class="blog-search--header" @click="togglePanel">
      <span class="blog-search--header_title">添加搜索条件</span>
      <!-- 展开指示：头朝下的「›」形箭头（收起态 = 点我展开），展开时整体转 180° 变头朝上。
           用 element 的箭头图标 —— iconfont 里没有现成的下箭头字形 -->
      <i
        class="el-icon-arrow-down blog-search--toggle"
        :class="{ 'is-expanded': panelOpen }"
      ></i>
    </div>

    <!--
      抽屉主体：展开 / 收起用 element 自带的 el-collapse-transition
      ⚠ 它是全局注册的（plugins/element.js 里 Vue.use(Element) 带的），
        内部按 scrollHeight 精确动画 height + 上下 padding，
        比手写 max-height 靠猜一个数值靠谱
      ⚠ 用 v-show 而不是 v-if：收起要有 DOM 才有的可动；
        Vue 会等 leave 动画结束再挂 display:none
    -->
    <el-collapse-transition>
      <div v-show="panelOpen" class="blog-search--body">
        <!-- 第一行第一个：作者
             ⚠ 他人主页下锁定：占位文字换成被访问用户的昵称、不可改（需求原文）。 -->
        <div class="blog-search--field">
          <span class="blog-search--label">内容作者</span>
          <SearchInput
            v-model="authorDraft"
            class="blog-search--author"
            :placeholder="lockedAuthorName || '匹配作者昵称'"
            :disabled="isAuthorLocked"
            @search="handleAuthorSearch"
          />
        </div>

        <!-- 第一行第二个：发布时间 -->
        <div class="blog-search--field">
          <span class="blog-search--label">内容发布时间</span>
          <div class="blog-search--time_preset">
            <button
              v-for="p in timePresets"
              :key="p.value"
              class="blog-search--btn_short"
              :class="{ selected: p.selected }"
              @click="
                emitUpdate({ timePreset: p.value, startDate: '', endDate: '' })
              "
            >
              {{ p.label }}
            </button>
          </div>
          <div class="blog-search--date_range">
            <button
              class="blog-search--btn_long blog-search--date_start"
              :class="{ 'has-value': !!filters.startDate }"
              @click="openCalendar('start')"
            >
              {{ filters.startDate || "开始日期" }}
            </button>
            <span class="blog-search--date_sep">至</span>
            <button
              class="blog-search--btn_long blog-search--date_end"
              :class="{ 'has-value': !!filters.endDate }"
              @click="openCalendar('end')"
            >
              {{ filters.endDate || "结束日期" }}
            </button>
          </div>
        </div>

        <!-- 第二行第一个：板块 -->
        <div class="blog-search--field">
          <span class="blog-search--label">内容板块</span>
          <ul class="blog-search--category_list">
            <li
              v-for="c in categories"
              :key="c._id"
              :class="{ selected: c.selected }"
              @click="emitUpdate({ category: c._id })"
            >
              {{ c.name }}
            </li>
          </ul>
        </div>

        <!-- 第二行第二个：标签
             ⚠ 只在 URL 上带 tag 时才出现：标签是文章里的自由文本，没有「全量清单」接口，
               所以这里不做可选列表，只把当前生效的那个显示出来、并提供一键清除。
               否则用户点标签跳进来会看到「列表少了东西但不知道哪儿被筛了」。 -->
        <div v-if="filters.tag" class="blog-search--field">
          <span class="blog-search--label">内容标签</span>
          <div class="blog-search--tag_row">
            <span class="blog-search--tag_chip">{{ filters.tag }}</span>
            <button
              class="blog-search--btn_short"
              @click="emitUpdate({ tag: '' })"
            >
              清除
            </button>
          </div>
        </div>

        <!-- 第三行：排列顺序 -->
        <div class="blog-search--field">
          <span class="blog-search--label">内容排列顺序</span>
          <div class="blog-search--sort">
            <button
              v-for="s in sorts"
              :key="s.label"
              class="blog-search--btn_short"
              :class="{ selected: s.selected }"
              @click="emitUpdate({ sortBy: s.sortBy, order: s.order })"
            >
              {{ s.label }}
            </button>
          </div>
        </div>
      </div>
    </el-collapse-transition>

    <!-- 日历：独立组件，只在打开时存在 -->
    <CalendarModal
      :visible="calendarVisible"
      :mode="calendarMode"
      :start-date="filters.startDate"
      :end-date="filters.endDate"
      @submit="handleCalendarSubmit"
      @close="calendarVisible = false"
    />
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import SearchInput from "@/components/search/SearchInput.vue";
import CalendarModal from "@/components/search/CalendarModal.vue";
import CATEGORIES from "@/config/category.config";
import { TIME_PRESETS, hasActiveFilters } from "@/utils/searchParams";
// 「我现在看的是谁的主页」—— 他人主页下锁定作者输入框
import visitContext from "@/mixins/visitContext";

// 时间预设按钮（value 与 utils/searchParams 的 TIME_PRESETS 白名单一致）
const PRESET_LABELS = {
  all: "不限",
  "1d": "一天以内",
  "30d": "一月以内",
  "365d": "一年以内",
};

// 排序按钮（sortBy 受后端 routes/search.js 的 sortMap 约束）
const SORT_OPTIONS = [
  { sortBy: "publishDate", order: "asc", label: "时间升序" },
  { sortBy: "publishDate", order: "desc", label: "时间降序" },
  { sortBy: "likeNum", order: "desc", label: "点赞降序" },
  { sortBy: "commentNum", order: "desc", label: "评论降序" },
];

export default {
  name: "SearchPanel",
  components: { SearchInput, CalendarModal },
  // visitedUserId / visitedProfile / isVisitContext
  mixins: [visitContext],
  props: {
    /** 当前筛选条件（由 Index 从 $route.query 派生后传入） */
    filters: { type: Object, required: true },
  },
  data() {
    return {
      // 作者输入框的草稿值：每敲一个字就改 URL 会产生一串历史记录，
      // 所以「正在输入」是本地态，防抖结束才 emit（SearchInput 内部已处理）
      authorDraft: this.filters.authorName || "",
      calendarVisible: false,
      calendarMode: "start",
    };
  },
  computed: {
    ...mapGetters("search", ["panelOpen"]),

    /** 他人主页下作者输入框锁定（需求原文：内容作者的输入框…不可更改） */
    isAuthorLocked() {
      return !!this.visitedUserId;
    },

    /** 锁定态下作者框的占位文字 = 被访问用户的昵称（资料还没到时就先用空，回落到默认占位） */
    lockedAuthorName() {
      return this.isAuthorLocked ? this.visitedProfile?.nickname || "" : "";
    },

    /** 当前是否存在筛选条件 —— 用来决定面板要不要自动展开 */
    hasActiveFilters() {
      return hasActiveFilters(this.filters);
    },

    timePresets() {
      const current = this.filters.timePreset || "all";
      // 自定义日期激活时（timePreset 为 all 但两端都有值），不选中任何预设
      const hasCustomDate =
        !this.filters.timePreset &&
        !!(this.filters.startDate && this.filters.endDate);
      return TIME_PRESETS.map((value) => ({
        value,
        label: PRESET_LABELS[value],
        selected: hasCustomDate ? false : current === value,
      }));
    },

    categories() {
      const current = String(this.filters.category || "");
      return [
        { _id: "", name: "不限", selected: !current },
        ...CATEGORIES.map((c) => ({
          _id: c._id,
          name: c.name,
          selected: current === String(c._id),
        })),
      ];
    },

    sorts() {
      return SORT_OPTIONS.map((opt) => ({
        ...opt,
        selected:
          (this.filters.sortBy || "publishDate") === opt.sortBy &&
          (this.filters.order || "desc") === opt.order,
      }));
    },
  },
  watch: {
    // URL 上的作者值变了（比如从分享链接进来）→ 回灌输入框
    "filters.authorName"(next) {
      if (next !== this.authorDraft) this.authorDraft = next || "";
    },
    /**
     * 带上筛选条件进首页时自动展开面板。
     *
     * 原版是「搜过一次后面板才出现」；现在面板常驻，但默认收起 ——
     * 用户带着 ?q=xxx 进来却看不见筛选条件在哪，会以为筛选没生效。
     * 只在「从无到有」时展开，用户手动收起后不会再被强行拉开。
     */
    hasActiveFilters: {
      immediate: true,
      handler(active) {
        if (active) this.$store.dispatch("search/setPanelOpen", true);
      },
    },
  },
  methods: {
    togglePanel() {
      this.$store.dispatch("search/togglePanel");
    },

    /**
     * 所有控件唯一的出口：把改动抛给 Index 去写 URL
     * mode 决定 Index 用 push 还是 replace 改历史（默认 'push'）
     */
    emitUpdate(patch, mode = "push") {
      this.$emit("update", patch, mode);
    },

    /**
     * 作者框搜索 —— SearchInput 会把「这次怎么来的」一起带过来：
     *   回车（enter）→ push：用户明确要搜，留一条历史
     *   打字停顿（debounce）/ 清空（clear）→ replace：覆盖当前记录，
     *     否则输一句作者名就会在历史里堆一串中间态，后退要按很多次
     */
    handleAuthorSearch(value, reason) {
      this.emitUpdate(
        { authorName: value },
        reason === "enter" ? "push" : "replace"
      );
    },

    openCalendar(mode) {
      this.calendarMode = mode;
      this.calendarVisible = true;
    },

    /**
     * 日历提交：只回填被编辑的那一端
     * ⚠ 同时把 timePreset 清成空 —— 手选日期与时间预设互斥
     *   （buildQuery 里也有这条规则，这里显式传是为了让 URL 立刻干净）
     */
    handleCalendarSubmit({ mode, dateStr }) {
      this.calendarVisible = false;
      this.emitUpdate(
        mode === "start"
          ? { startDate: dateStr, timePreset: "" }
          : { endDate: dateStr, timePreset: "" }
      );
    },
  },
};
</script>

<style lang="stylus">
@import '../../assets/css/themes.styl'

.blog-search--panel
  overflow: hidden
  margin-bottom: $theme-spacing.lg
  border-radius: $theme-radius.lg
  background-color: var(--theme-bgc-card)
  box-shadow: $theme-shadows.lg
  text-align: left

.blog-search--header
  display: flex
  align-items: center
  justify-content: space-between
  padding: $theme-spacing.base
  border-radius: $theme-radius.md $theme-radius.md 0 0
  background-color: var(--theme-bgc-deepBtn)
  color: var(--theme-font-fst)
  font-weight: 700
  font-size: $theme-fz.lg
  cursor: pointer
  user-select: none

.blog-search--toggle
  font-size: $theme-fz.lg
  cursor: pointer
  transition: transform 0.3s ease

  &.is-expanded
    // 漏斗图标旋转 180° 朝上，表示「收起」
    transform: rotate(180deg)

.blog-search--body
  display: grid
  grid-template-columns: 1fr 1fr
  gap: $theme-spacing.lg
  padding: $theme-spacing.lg
  // 中性描边（原来是 --theme-bgc-deepBtn，跟头部色块同色，等于把边框做成了头部的延续）
  border: 1px solid var(--theme-border)
  border-top: none
  border-radius: 0 0 $theme-radius.md $theme-radius.md
  background-color: var(--theme-bgc-card)

.blog-search--field
  display: flex
  flex-direction: column
  gap: $theme-spacing.sm
  padding: $theme-spacing.base

.blog-search--label
  display: inline-block
  width: fit-content
  flex-shrink: 0
  padding: $theme-spacing.sm $theme-spacing.base
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-deepBtn)
  color: var(--theme-font-fst)
  font-size: $theme-fz.sm
  cursor: default

// 短按钮（时间预设 / 排序）
// ⚠ 原来是 #EEEEEE 底 + #9ca38e 字（暖灰配橄榄灰），和整页冷调蓝是两套色 ——
//   这块面板「看着脏」主要就是它。现在三个状态同一色相、逐档加深：
//     常态 --theme-bgc-chip(#EDF2F7) → hover --theme-bgc-lightBtn(#E2F0FF) → 选中 --theme-bgc-deepBtn(#C6E1FF)
//   chip 那个 token 的亮度是照着原来的 #EEEEEE 定的，所以按钮的「分量」没变，只是换了色相
// ⚠ 必须写 box-sizing：global.styl 的 reset 没有覆盖 button，
//   不写的话这 1px 描边会让它比旁边的日期按钮高 2px
.blog-search--btn_short
  display: inline-block
  box-sizing: border-box
  height: 36px
  padding: 0 $theme-spacing.sm
  border: 1px solid var(--theme-border)
  outline: none
  border-radius: $theme-radius.xs
  background-color: var(--theme-bgc-chip)
  color: var(--theme-font-trd)
  font-size: $theme-fz.sm
  text-align: center
  line-height: 34px
  cursor: pointer
  transition: background-color 0.2s, color 0.2s, border-color 0.2s

  &:hover
    border-color: var(--theme-font-fst)
    background-color: var(--theme-bgc-lightBtn)
    color: var(--theme-font-light)

  &.selected
    border-color: var(--theme-bgc-deepBtn)
    background-color: var(--theme-bgc-deepBtn)
    color: var(--theme-font-fst)

// 长按钮（开始/结束日期）—— 与短按钮统一圆角（原来短的是 xs=6px、长的是 md=12px，
// 同一行里并排看着像两套控件）
.blog-search--btn_long
  display: inline-flex
  align-items: center
  justify-content: center
  flex: 1
  box-sizing: border-box
  height: 36px
  padding: 0 $theme-spacing.base
  border: 1px solid var(--theme-font-fst)
  border-radius: $theme-radius.xs
  background-color: transparent
  color: var(--theme-font-fst)
  font-size: $theme-fz.sm
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis
  cursor: pointer
  transition: all 0.2s ease

  &:hover
    background-color: var(--theme-bgc-lightBtn)

  // 已选日期：实心主色（与短按钮的选中态区分开 —— 这里装着的是「一个值」，
  // 不是「选中了某个选项」，实心更能表达「已填」）
  &.has-value
    border-color: var(--theme-font-fst)
    background-color: var(--theme-font-fst)
    color: #fff

.blog-search--time_preset,
.blog-search--sort
  display: flex
  flex-wrap: wrap
  gap: $theme-spacing.sm

// 标签行：当前标签 chip + 清除按钮
.blog-search--tag_row
  display: flex
  align-items: center
  gap: $theme-spacing.sm

.blog-search--tag_chip
  display: inline-flex
  align-items: center
  box-sizing: border-box
  max-width: 100%
  height: 36px
  padding: 0 $theme-spacing.base
  border-radius: $theme-radius.xs
  background-color: var(--theme-bgc-deepBtn)
  color: var(--theme-font-fst)
  font-size: $theme-fz.sm
  white-space: nowrap
  overflow: hidden
  text-overflow: ellipsis

.blog-search--date_range
  display: flex
  align-items: center
  gap: $theme-spacing.sm

.blog-search--date_sep
  flex-shrink: 0
  color: var(--theme-font-trd)
  font-size: $theme-fz.sm

.blog-search--category_list
  max-height: 150px
  margin: 0
  padding: 0
  overflow-y: auto
  overflow-x: hidden
  border: 1px solid var(--theme-border)
  border-radius: $theme-radius.xs
  // 列表自身白底：它坐在浅冷色的字段面板上，白底才像一份「可选项清单」
  background-color: var(--theme-bgc-input-edit)
  list-style: none
  scrollbar-width: thin
  scrollbar-color: #c1c1c1 transparent

  li
    height: 40px
    border-bottom: 1px solid var(--theme-border-light)
    // 与上面的短按钮同一套三档色阶：常态浅 → hover 中 → 选中深
    background-color: var(--theme-bgc-chip)
    color: var(--theme-font-trd)
    font-size: $theme-fz.sm
    line-height: 40px
    text-align: center
    cursor: pointer
    transition: background-color 0.2s, color 0.2s

    &:last-child
      border-bottom: none

    // hover 给底色（原来只改字色，在一列灰字里几乎看不出反馈）
    &:hover
      background-color: var(--theme-bgc-lightBtn)
      color: var(--theme-font-light)

    &.selected
      background-color: var(--theme-bgc-deepBtn)
      color: var(--theme-font-fst)

// xs：两列挤不下，改单列
@media only screen and (max-width: 767px)
  .blog-search--body
    grid-template-columns: 1fr
</style>
