<template>
  <el-header class="blog-head" height='72px'>
    <el-row type="flex" align="middle" class="blog-head--row">
      <!-- head-logo — 站点图标，返回首页 -->
      <el-col :xs="8" :sm="4" :md="4" class="blog-head--logo">
        <a href="#">
          <i class="iconfont icon-android-chrome-512x512"></i>
        </a>
      </el-col>
      <!-- head-logo -->

      <!-- head-nav — 主导航，xs 小屏隐藏 -->
      <el-col :span="10" class="hidden-xs-only">
        <nav class="blog-head--nav">
          <ul class="blog-nav--list">
            <!--
              他人主页的返回键（需求原文：「在主页按钮左加一个返回的按钮，
              点击返回当前登录用户主页」）
              ⚠ 挂在 ul 的最前面 = 排在所有导航项（第一个是「主页」）的**左边**；
              只在「有访问对象」时出现，自己的主页上不显示。
            -->
            <li v-if="isVisitContext" class="blog-nav--back_item">
              <span
                class="blog-nav--back iconfont icon-huitui"
                title="返回我的主页"
                @click="backToSelfHome"
              ></span>
            </li>
            <li v-for="(item, index) in navList" :key="index">
              <router-link
                :to="item.route"
                class="iconfont"
                :class="item.iconName"
              >
                <el-col class="hidden-md-and-down" >
                  <span>{{ item.text }}</span>
                </el-col>
              </router-link>
            </li>
          </ul>
        </nav>
      </el-col>
      <!-- head-nav -->

      <!-- head-search — 搜索框：md+ 常驻显示，xs/sm 收成图标，点图标展开的是同一个框 -->
      <el-col :xs="10" :sm="4" :md="4">
        <div ref="searchBox" class="blog-head--search">
          <SearchInput
            ref="searchInput"
            class="blog-head--input"
            :class="{ 'is-expanded': inputShow }"
            :value="keyword"
            placeholder="搜索"
            @search="handleSearch"
          />
          <el-col class="hidden-md-and-up">
            <i class="iconfont icon-sousuo" @click="toggleInput"></i>
          </el-col>
        </div>
      </el-col>
      <!-- head-search -->

      <!-- head-login — 登录入口 / 用户信息（复用 Home.vue 的组件切换链路） -->
      <el-col :xs="2" :sm="3" :md="3">
        <div class="blog-head--login">
          <component :is="activeUserComponent"></component>
        </div>
      </el-col>
      <!-- head-login -->

      <!-- head-colorPicker — 颜色选择器（xs 隐藏） -->
      <el-col :span="1" class="hidden-xs-only blog-head--iconcol">
        <i
          ref="colorTrigger"
          class="blog-btn--colorPicker iconfont icon-yanse"
          :title="colorShow ? '收起调色盘' : '换个主题色'"
          @click="toggleColor"
        ></i>
      </el-col>
      <!-- head-colorPicker -->

      <!-- head-theme — 白天/夜间切换
           ⚠ 它切的是**整套配色**：store 的 toggleMode 改 mode → 列表页/详情页/弹窗一起翻，
             并挂 data-theme 让 themes.styl 的深色块接管中性色。
             登录/注册弹窗的滑块图（bgi-slider-light / dark）也跟着 mode 走，
             但那只是顺带的一处，不是它的全部作用。
           ⚠ 大背景图（.blog-banner--full）**不跟模式**：由用户资料上的 banner 决定。 -->
      <el-col :xs="2" :sm="2" :md="2" class="blog-head--iconcol">
        <i
          class="blog-btn--theme iconfont"
          :class="isDark ? 'icon-shense' : 'icon-qianse'"
          :title="isDark ? '切换到白天模式' : '切换到夜间模式'"
          @click="toggleMode"
        ></i>
      </el-col>
      <!-- head-theme -->

      <!-- head-menu — 小屏汉堡菜单（仅 xs 显示）
           装的是：五个导航 + 调色盘入口 + 友链 + 最下方的登出（详见 HeadDrawer.vue）。
           ⚠ 图标是「汉堡 ⇄ 关闭」互换：抽屉展开时得让用户知道再点一次是关。 -->
      <el-col :xs="2" class="hidden-sm-and-up blog-head--iconcol">
        <i
          class="blog-head--menu iconfont"
          :class="drawerShow ? 'icon-guanbi' : 'icon-caidan'"
          :title="drawerShow ? '收起菜单' : '打开菜单'"
          @click="toggleDrawer"
        ></i>
      </el-col>
      <!-- head-menu -->
    </el-row>

    <!--
      调色盘面板：直接挂在 .blog-head 下，不放进 el-row ——
      这样定位祖先永远是这条 fixed 头部，不必依赖「把 el-row 的 position 清掉」
      （那条只在 <992 的媒体查询里写了，≥992 时 el-row 仍是 relative，面板会跑偏）
    -->
    <div v-if="colorShow" ref="colorPanel" class="blog-head--colorPanel">
      <ColorPicker />
    </div>

    <!-- 小屏汉堡抽屉
         ⚠ 挂在 el-header 里面是因为 Vue 2 的单根节点限制（Home 才是布局宿主，
            但它拿不到页头内部的开关状态）。遮罩与面板都从页头下沿开始，
            所以顶栏（含这个汉堡图标）不会被自己盖住 —— 见 HeadDrawer.vue 的注释。 -->
    <HeadDrawer
      :visible="drawerShow"
      @close="drawerShow = false"
      @open-palette="openPaletteFromDrawer"
    />

  </el-header>
</template>

<script>
import { mapGetters, mapActions } from "vuex";
import headerConfig from "@/config/header.config";
import UserLogin from "@/components/user/UserLogin.vue";
import UserAvator from "@/components/user/UserAvator.vue";
import SearchInput from "@/components/search/SearchInput.vue";
import ColorPicker from "@/components/theme/ColorPicker.vue";
import HeadDrawer from "@/components/head/HeadDrawer.vue";
import { buildQuery } from "@/utils/searchParams";
// 「我现在看的是谁的主页」—— 见 utils 之外 mixins/visitContext.js 的口径说明
import visitContext from "@/mixins/visitContext";

export default {
  name: "Head",
  components: { UserLogin, UserAvator, SearchInput, ColorPicker, HeadDrawer },
  // 提供 visitedUserId / isVisitContext / backToSelfHome 等
  mixins: [visitContext],
  data() {
    return {
      // 小屏下搜索框是否展开（点搜索图标切换）
      inputShow: false,
      // 调色盘面板是否展开（点调色盘图标切换）
      colorShow: false,
      // 汉堡抽屉是否展开（点汉堡图标切换）
      drawerShow: false,
    };
  },
  computed: {
    ...mapGetters("http", ["isLogin","userInfo"]),
    ...mapGetters("theme", ["isDark"]),
    /**
     * 导航条目
     *
     * ⚠ 这里从 data 改成 computed：他人主页下要**隐藏「写博客」**那一条
     *   （需求原文：「头部 header 写博客消失」）。写死成 data 的话路由变了它不会重算。
     *
     * ⚠ 用 `route.name !== 'Write'` 定位，不按下标 —— 配置表改顺序也不会点到隔壁。
     */
    navList() {
      const base = this.isVisitContext
        ? headerConfig.filter((item) => item.route?.name !== "Write")
        : headerConfig;
      // 访问上下文下：主页/板块/留言/关于的落点要带着被访问用户，
      // 否则点导航会掉回登录用户自己的主页（visitRoute 见 mixins/visitContext.js）
      return base.map((item) => ({ ...item, route: this.visitRoute(item.route) }));
    },
    activeUserComponent() {
      return this.isLogin ? "UserAvator" : "UserLogin";
    },
    /**
     * 输入框的当前值 —— 只在首页才从 URL 上取。
     * 别的路由（文章详情、写博客）URL 里的 query 与本页无关，取了会串。
     */
    keyword() {
      return this.$route.name === "Index" ? this.$route.query.q || "" : "";
    },
  },
  watch: {
    /**
     * 路由一变就收起抽屉
     * 抽屉里那五条导航跳走之后必须自动关掉 —— 否则页面已经切了、抽屉还挡在上面。
     * ⚠ 只靠「点条目时 emit close」不够：从别处（比如页脚 / 兜底页）触发的跳转
     *   抽屉那边根本不知道，所以这里再兜一道。
     */
    $route() {
      this.drawerShow = false;
    },
  },
  mounted() {
    if (this.isLogin) this.getUserInfo()
    // 小屏展开后的关闭时机：点页面别处 / 按 Esc / 窗口变宽（变宽后常驻输入框会自己出现）
    document.addEventListener("click", this.handleOutsideClick)
    document.addEventListener("keydown", this.handleEsc)
    window.addEventListener("resize", this.handleResize)
  },
  beforeDestroy() {
    document.removeEventListener("click", this.handleOutsideClick)
    document.removeEventListener("keydown", this.handleEsc)
    window.removeEventListener("resize", this.handleResize)
  },
  methods: {
    ...mapActions("http", ["getUserInfo"]),
    ...mapActions("theme", ["toggleMode"]),

    /** 小屏：切换展开，展开后聚焦输入框（原版 .is-visible 后 focus 的行为） */
    toggleInput() {
      this.inputShow = !this.inputShow;
      if (this.inputShow) this.$refs.searchInput && this.$refs.searchInput.focus();
    },

    /**
     * 搜索：把关键词写进首页的 URL，由 Index 统一取数
     *
     * ⚠ 用 buildQuery 而不是手拼 —— 时间预设与自定义日期互斥、空值不进 URL
     *   这些规则都收在它里面，头部不该知道这些细节。
     * ⚠ 按 reason（SearchInput 的第二个参数）决定怎么改历史：
     *   已经在首页时：回车 = 明确动作 → push；防抖 / 清空 = 自动触发 → replace
     *     （不 replace 的话，慢一点敲 "vue" 会在历史里留下 ?q=v、?q=vu、?q=vue
     *       三条，要按三次后退才出得去）
     *   不在首页时（比如在文章详情页搜）：这是「跳页」→ 一律 push，
     *     用 replace 会把来源页从历史里顶掉，后退就回不去详情页了。
     * ⚠ catch：连续搜同一个词会撞 vue-router 3 的 NavigationDuplicated（重复导航），
     *   不拦会在控制台抛未捕获的 rejection。
     */
    handleSearch(value, reason) {
      const onIndex = this.$route.name === "Index";
      const base = onIndex ? this.$route.query : {};
      const go =
        onIndex && reason !== "enter" ? this.$router.replace : this.$router.push;
      go.call(this.$router, {
        name: "Index",
        query: buildQuery(base, { q: value }),
      }).catch(() => {});
      this.inputShow = false;
    },

    /** 调色盘：开关面板。两个浮层（搜索框 / 调色盘）同时开会叠在一起，开一个就关另一个 */
    toggleColor() {
      this.colorShow = !this.colorShow;
      if (this.colorShow) this.inputShow = false;
    },

    /** 汉堡：开关抽屉。同样与搜索浮层互斥（三者共用右下角那一片） */
    toggleDrawer() {
      this.drawerShow = !this.drawerShow;
      if (this.drawerShow) this.inputShow = false;
    },

    /**
     * 抽屉里的「换个主题色」
     * 关掉抽屉 + 打开调色盘 —— 唤起的是**同一个** .blog-head--colorPanel，
     * 不另写一套 UI（调色盘图标在 <768 本来就隐藏了，抽屉是它那时唯一的入口）
     */
    openPaletteFromDrawer() {
      this.drawerShow = false;
      this.colorShow = true;
    },

    handleOutsideClick(e) {
      const box = this.$refs.searchBox;
      if (this.inputShow && box && !box.contains(e.target)) this.inputShow = false;

      const panel = this.$refs.colorPanel;
      const trigger = this.$refs.colorTrigger;
      if (
        this.colorShow &&
        panel &&
        !panel.contains(e.target) &&
        !(trigger && trigger.contains(e.target))
      ) {
        this.colorShow = false;
      }
    },

    handleEsc(e) {
      if (e.key !== "Escape") return;
      this.inputShow = false;
      this.colorShow = false;
      this.drawerShow = false;
    },

    /**
     * 窗口变宽时的退场时机
     * ① ≥992：Element 的 md 断点，常驻输入框出现 → 展开态要退场
     * ② >767：汉堡是 `hidden-sm-and-up` 的，图标一消失抽屉就没了触发器 ——
     *   不主动收起来的话，用户只能靠 Esc 或点遮罩才关得掉
     */
    handleResize() {
      if (window.innerWidth >= 992) this.inputShow = false;
      if (window.innerWidth > 767) this.drawerShow = false;
    },
  },
};
</script>

<style lang="stylus">
@import '../assets/css/themes.styl'

.blog-head
  position fixed
  top 0
  left 5%
  width 90%
  padding 10px 20px
  border 1px solid #ccc
  border-radius 0 0 15px 15px
  line-height 50px
  min-width 375px
  text-align center
  background-color var(--theme-bgc-card)
  z-index 500

  .router-link-active
    color var(--theme-font-fst)

  .el-row
    height 100%

  .el-col
    height 100%

  a
    color var(--theme-font-light)

  .iconfont
    font-size 20px

.blog-head--nav
  height 100%

// 主导航
.blog-nav--list
  display flex
  justify-content space-around
  align-items center
  height 100%

  li
    a
      display flex
      align-items center
      justify-content center
      line-height 1.3
      .iconfont
        font-size 20px
      span
        font-size $theme-fz.sm
        margin-left 6px

// 他人主页的返回键：与导航项同一行的圆形按钮（比导航条目的图标略小一点，
// 免得跟「主页」抢主次），hover 与卡片上的返回键同一套反馈
.blog-nav--back
  display flex
  align-items center
  justify-content center
  width 32px
  height 32px
  border-radius 50%
  background-color var(--theme-bgc-chip)
  color var(--theme-font-fst)
  cursor pointer
  transition all 0.2s ease

  &:hover
    background-color var(--theme-font-sec)
    color #fff
    box-shadow 4px 4px 12px rgba(0, 0, 0, 0.15)

// 搜索框：md+ 常驻显示；xs/sm 收成图标，点图标后同一个框变成展开面板
.blog-head--search
  // ⚠ 这里**不能**设 position: relative：
  //   小屏展开的浮层是 absolute，要挂在 .blog-head（position: fixed）上，
  //   一旦这里成为定位祖先，right / bottom / width 就都按这个窄列的盒子算，
  //   面板会缩成一小条并贴在错误的高度上。
  display: flex
  justify-content: flex-end
  align-items: center
  height: 100%
  padding-right: 20px

  // 聚焦时变宽（原来这个动画打在原生 input 上，现在外层是 SearchInput 的壳）
  .blog-head--input
    width: 80%
    transition: width 0.2s

    &:focus-within
      width: 100%

  > i
    font-size: 20px
    cursor: pointer

// logo
.blog-head--logo
  position relative
  overflow visible

  a
    display block
    height 100%

  i
    position absolute
    left 0
    top 50%
    transform translateY(-50%)
    font-size 88px !important
    line-height 1
    color var(--theme-font-fst)

// 登录区
.blog-head--login
  display flex
  align-items center
  justify-content center
  height 100%

  // 已登录：圆形头像
  .el-image__inner
    width 40px
    height 40px
    transform: translateY(4px)
    border-radius 50%
    overflow hidden
    border 2px solid #333
    img
      width 100%
      height 100%
      object-fit cover

// 颜色选择器 / 昼夜切换 / 汉堡菜单（所在列 flex 居中）
.blog-head--iconcol
  display flex
  align-items center
  justify-content center

.blog-btn--colorPicker,
.blog-btn--theme,
.blog-head--menu
  font-size 20px
  cursor pointer
  // 这两个图标（调色盘 / 昼夜）与汉堡菜单是「中性工具图标」，
  // 跟导航区那几个主题色图标不是一类。
  // ⚠ 以前这里没写颜色 —— 于是它们继承到浏览器默认的纯黑：
  //   深色模式下就是黑图标压在深底上（对比度 1.33，等于看不见）。
  //   挂 --theme-font-light：浅色下是 #333（和原来的黑肉眼无差），深色下变近白。
  color var(--theme-font-light)

.hidden-md-and-up
  position relative
  .icon-sousuo
    position absolute
    right 0


// 小屏（< md，即 < 992px）：常驻输入框收起，点搜索图标后展开成浮层
// ⚠ 展开的是同一个 SearchInput，不是另起一个 DOM —— 也就不用再维护两份输入值
// 声明统一写「属性: 值」带冒号形式 —— Stylus 对「无冒号 + 值是多段」有歧义，
// 紧跟缩进更深的嵌套块时会被当成选择器解析、整条静默丢失（编译不报错）。
@media only screen and (max-width: 991px)
  // element 的 el-row 默认 position: relative，会抢走浮层的定位祖先。
  // 老项目 .blog-bar--search 直接挂在 .blog-head 下，浮层相对整条头部定位；
  // 这里必须先把 el-row 的 position 清掉，否则 right/width 都按行算，面板会偏到中间。
  .blog-head--row
    position: static

  .blog-head--search
    .blog-head--input
      display: none

    // 浮层：对应老项目的 .blog-bar--search.is-visible
    // 定位祖先是 .blog-head（position: fixed），右侧一半、贴头部右边缘
    .blog-head--input.is-expanded
      display: block
      position: absolute
      right: 0
      bottom: -80px
      width: 50%
      height: 70px
      padding: $theme-spacing.sm
      border-radius: 10px
      background-color: var(--theme-bgc-card)
      box-shadow: $theme-shadows.lg
      z-index: 600

      .blog-search--input_inner
        height: 100%

// ===== 调色盘面板 =====
// 与搜索浮层同一套思路：绝对定位挂 .blog-head（那条 fixed 头部），贴右边缘、压在头部下方。
// 只做两种形态（需求）：半宽 / 全宽 —— 不跟随输入框的「常驻」态。
.blog-head--colorPanel
  position: absolute
  // 搜索浮层用的是 bottom: -80px（它自带 70px 高，正好落在头部下方 10px）；
  // 调色盘高度不固定，用 top: 100% 更稳（内容变高也不会往上顶进头部里）
  top: calc(100% + 10px)
  right: 0
  width: 50%
  padding: $theme-spacing.sm
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-card)
  box-shadow: $theme-shadows.lg
  z-index: 600

@media screen and (max-width: 768px)
  .blog-head
    left 0
    width 100%

  .blog-head--search
    // 老项目 media.styl：小屏下面板宽度铺满
    .blog-head--input.is-expanded
      width: 100%

  .blog-head--colorPanel
    // 小屏同样铺满（与搜索浮层的「全宽」态一致）
    width: 100%
</style>
