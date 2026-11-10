<template>
  <!--
    小屏汉堡抽屉（<768 才出现，触发器是 Head.vue 的 .blog-head--menu）

    内容（需求 todo 4 原话：把 header 里那五个导航和调色盘收进来，登出放最下方、和上面隔开）：
      ① 五个导航      —— 与页头大屏导航**同一份配置**（config/header.config.js）
      ② 调色盘入口    —— 点它关掉抽屉、唤起页头那个弹出框（不另写一套 UI）
      ③ 友情链接      —— 与侧栏挂的是**同一个组件**（折叠规则 / 外链确认框都跟着它走）
      ④ 退出登录      —— 单独一块，与上面留间距；此时侧栏「管理导航」里那条已被 CSS 收起

    ⚠ 遮罩与面板都从**页头下沿**（top: 72px）开始，不盖住顶栏：
      它是挂在 .blog-head 里面的（Vue 2 单根节点的要求），盖住顶栏的话
      汉堡图标自己也会被遮罩挡住，再点一次关不掉。
  -->
  <transition name="blog-drawer" appear>
    <div v-if="visible" class="blog-drawer">
      <div class="blog-drawer--mask" @click="$emit('close')"></div>

      <aside class="blog-drawer--panel">
        <!-- 可滚动区：导航 + 调色盘入口 + 友链。
             与「退出登录」分开，是为了让登出**始终钉在面板底部**（见下面 foot 的注释） -->
        <div class="blog-drawer--body">
          <!-- ① 五个导航 + ② 调色盘入口：同一列，外观复用侧栏那套「文字 + 图标方块」 -->
          <ul class="blog-cards--category blog-drawer--list">
            <!-- 他人主页的返回键（与页头大屏那个返回键同一件事，只是落在抽屉里） -->
            <li
              v-if="isVisitContext"
              class="blog-drawer--back"
              @click="onBack"
            >
              <span class="category-name">返回我的主页</span>
              <span class="category-cnt iconfont icon-huitui"></span>
            </li>
            <li
              v-for="item in navList"
              :key="item.text"
              :class="{ 'is-active': isNavActive(item) }"
              @click="goNav(item)"
            >
              <span class="category-name">{{ item.text }}</span>
              <span class="category-cnt iconfont" :class="item.iconName"></span>
            </li>
            <!--
              ⚠ 必须 .stop，否则面板开了也会在同一次点击里被关掉：
              ① 本行 handler → Head 置 colorShow=true
              ② 浏览器在每个监听器返回后都会跑一次微任务检查点（事件从事件循环派发、
                 JS 栈是空的），所以冒泡到 document 之前 Vue 已经把面板渲染出来、
                 $refs.colorPanel 也有值了
              ③ document 上的 handleOutsideClick 于是判定「点击目标不在面板内」→ 关掉
            -->
            <li class="blog-drawer--palette" @click.stop="$emit('open-palette')">
              <span class="category-name">{{ paletteItem.text }}</span>
              <span
                class="category-cnt iconfont"
                :class="paletteItem.iconName"
              ></span>
            </li>
          </ul>

          <!-- ③ 友情链接：一条都没有时连标题一起不渲染（否则是个空标题） -->
          <div v-if="hasFriendLinks" class="blog-drawer--section">
            <h3 class="blog-drawer--title">{{ friendCard.title }}</h3>
            <FriendLinks />
          </div>
        </div>

        <!-- ④ 退出登录：钉在面板最下方，与上面留间距 -->
        <div v-if="isLogin" class="blog-drawer--foot">
          <ul class="blog-cards--category">
            <li :class="logoutItem.itemClass" @click="onLogout">
              <span class="category-name">{{ logoutItem.text }}</span>
              <span
                class="category-cnt iconfont"
                :class="logoutItem.iconName"
              ></span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </transition>
</template>

<script>
import { mapGetters } from "vuex";
import headerConfig, { DRAWER_PALETTE } from "@/config/header.config";
import { ASIDE_FRIENDS, ASIDE_NAV } from "@/config/aside.config";
import navActions from "@/mixins/navActions";
// 「我现在看的是谁的主页」—— 见 mixins/visitContext.js
import visitContext from "@/mixins/visitContext";
import FriendLinks from "@/components/aside/FriendLinks.vue";

// 「退出登录」那一条不重新写文案/图标 —— 从侧栏那份配置里按 action 名取出来复用，
// 两边以后改文案、改图标字形只会改一处。
const LOGOUT_ITEM = ASIDE_NAV.items.find((item) => item.action === "logout");

export default {
  name: "HeadDrawer",
  components: { FriendLinks },
  // isNavActive / handleNav / logout + visitedUserId / isVisitContext / backToSelfHome
  mixins: [navActions, visitContext],
  props: {
    // 抽屉是否展开。开关状态放在 Head.vue —— 它是触发器的所有者
    visible: { type: Boolean, default: false },
  },
  data() {
    return {
      paletteItem: DRAWER_PALETTE,
      friendCard: ASIDE_FRIENDS,
      logoutItem: LOGOUT_ITEM,
    };
  },
  computed: {
    ...mapGetters("http", ["isLogin", "userInfo"]),
    // 与 Aside 同一口径：判的是「要不要渲染这一块 + 它的标题」，列表自己也会判一次
    hasFriendLinks() {
      const links = this.userInfo?.data?.friendLinks;
      return Array.isArray(links) && links.length > 0;
    },
    /**
     * 导航条目 —— 与 Head.vue 同一个 computed：
     * 他人主页下隐藏「写博客」那一条（按 route.name 定位，不按下标）。
     */
    navList() {
      const base = this.isVisitContext
        ? headerConfig.filter((item) => item.route?.name !== "Write")
        : headerConfig;
      // 访问上下文下：主页/板块/留言/关于的落点要带着被访问用户（与 Head.vue 同一条规则）
      return base.map((item) => ({ ...item, route: this.visitRoute(item.route) }));
    },
  },
  methods: {
    /** 导航：切走之后抽屉要收起来（已经在那一页时 handleNav 会早退，同样要收） */
    goNav(item) {
      this.handleNav(item);
      this.$emit("close");
    },
    /** 他人主页的返回键：回自己主页 + 关抽屉（与 goNav 一致，切走就收） */
    onBack() {
      this.backToSelfHome();
      this.$emit("close");
    },
    /** 退出登录：登出后如果本来就在首页，路由不会变，所以这里显式关一次 */
    onLogout() {
      this.logout();
      this.$emit("close");
    },
  },
};
</script>

<style lang="stylus">
@import '../../assets/css/themes.styl'

// 遮罩层：只盖页头以下
.blog-drawer--mask
  position: fixed
  top: 72px
  left: 0
  right: 0
  bottom: 0
  z-index: 900
  // 与 el-dialog 的 .v-modal 同款做法（半透明黑）
  background-color: rgba(0, 0, 0, 0.4)

// 面板：贴右侧、满高（页头以下）
// ⚠ 竖排 flex + 自身不滚：滚动交给中间的 body —— 这样 footer（退出登录）
//   能一直钉在面板底部，内容再长也不会把登出顶到屏幕外（需求：登出在最下方）
.blog-drawer--panel
  position: fixed
  border 1px solid var(--theme-border)
  top: 72px
  right: 0
  bottom: 0
  z-index: 901
  // 窄屏不铺满：留一条缝能看见后面，用户知道「这是浮层」
  width: 78%
  max-width: 320px
  padding: $theme-spacing.base
  display: flex
  flex-direction: column
  overflow: hidden
  text-align: left
  background-color: var(--theme-bgc-main)
  box-shadow: $theme-shadows.lg

// 可滚动区：导航 + 调色盘入口 + 友链
.blog-drawer--body
  flex: 1 1 auto
  min-height: 0
  overflow-y: auto

// 展开 / 收起：遮罩淡入淡出，面板右进右出
.blog-drawer-enter-active,
.blog-drawer-leave-active
  transition: opacity 0.2s ease

  .blog-drawer--panel
    transition: transform 0.24s ease

.blog-drawer-enter,
.blog-drawer-leave-to
  opacity: 0

  .blog-drawer--panel
    transform: translateX(100%)

// 导航那一列：与卡片之间留一点空隙
.blog-drawer--list
  padding: $theme-spacing.xs
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-card)

// 调色盘入口：与上面五条同一列，但它是「动作」不是「导航」，
// 用一条上边线把它和导航隔开（视觉上分组，不必另起一张卡）
.blog-drawer--palette
  margin-top: $theme-spacing.xs
  border-top: 1px solid var(--theme-border-light)

// 友链：与列表之间隔开
.blog-drawer--section
  margin-top: $theme-spacing.base
  padding: $theme-spacing.xs
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-card)

.blog-drawer--title
  padding: 0 $theme-spacing.xs $theme-spacing.xs
  font-size: $theme-fz.base
  font-weight: 700
  color: var(--theme-font-trd)

// 退出登录：钉在面板最下方，与上面拉开距离（需求：登出在最下方、和其他有间隔）。
// ⚠ 它是 .blog-drawer--body 的兄弟、不在滚动区里，所以这个 32px 是一条**常驻**的间隔。
.blog-drawer--foot
  flex: 0 0 auto
  margin-top: $theme-spacing.xl
  padding: $theme-spacing.xs
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-card)
</style>
