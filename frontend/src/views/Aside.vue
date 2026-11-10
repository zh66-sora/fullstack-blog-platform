<template>
  <!--
    侧边栏：个人简介卡片 + 管理导航 / 扩展功能卡片 + 弹幕留言墙卡片 + 友情链接卡片

    ## 两个形态（断点 991，切换规则在 Home.vue）
      ≥992：左侧固定 300px 的列，与正文并排（el-row 的 flex 行内）
      ≤991：变成整宽区块，排在正文之后 —— 正文列里最后一个元素就是 Index 的分页器，
            所以视觉上正好落在「分页器下面」（见 Home.vue 的说明）
    本组件是**全局单实例**：不靠渲染两份来适配，两种形态由 CSS 换顺序实现。

    ## 下沉的形态只带前两张（简介 + 导航/扩展）
      友链改由汉堡菜单承载，但**只在 <768 收起来**（见文件末尾的媒体查询）——
      768~991 那段没有汉堡，侧栏这份必须留着兜底。
      弹幕留言墙也在 ≤991 收起（需求：「小屏不会跟着 aside 其他部分下沉」）——
      它是纯装饰 + 一个入口，下沉后只会把小屏本就很长的页面再拉长一屏。
  -->
  <aside id="aside" class="blog-sliderbar--profile">
    <!-- ① 个人简介卡片 -->
    <el-card class="blog-card blog-cards--author" shadow="never">
      <div class="author-avator">
        <!-- 与 UserAvator.vue 一致：el-image + fit="cover" -->
        <el-image
          :src="avatarSrc"
          fit="cover"
          class="blog-author--avatar"
        ></el-image>

        <!-- hover 遮罩：个人介绍入口 -->
        <div class="blog-mask--avatar">
          <i class="blog-href--about iconfont icon-shenfen">
            <a href=""></a>
          </i>
        </div>
      </div>

      <!-- 昵称 / 个签：原项目由 refreshAuthorCard 动态填充，此处先留空占位 -->
      <h2>{{ nickname }}</h2>
      <p class="blog-introduction--motto">{{ motto }}</p>

      <!--
        社交跳转：bilibili / 微信 / github
        数据来自资料上的 socialLinks（GET /api/profile）。
        ⚠ 原项目是 refreshAuthorCard 里按平台逐个绑 onclick；Vue 里改成数据驱动：
           没设过 → toast「ta还没有设置呢~」（原项目的 _notSet）
           设过了 → 弹确认框，确认后新标签页打开
        ⚠ @click.prevent 必须加在 li 上：里面的 <a href=""> 被点到会整页跳走，
           preventDefault 写在冒泡阶段一样能取消它的默认行为
      -->
      <ul v-if="isLogin" class="blog-redirect">
        <li
          v-for="item in iconList"
          :key="item.id"
          class="iconfont"
          :class="item.iconClass"
          :title="item.label"
          @click.prevent="openSocial(item)"
        >
          <a href=""><span></span></a>
        </li>
      </ul>
    </el-card>

    <!--
      ② 管理导航 / 私有定制（两张「条目型」卡片，中间不夹别的卡片）
         · 管理导航：迁移自 myBlog 的 #blog-aside--nav 卡片骨架
           （index.html 78-92 行）+ 进 /info 时切换出来的三条导航
           （app/routerControl.js 138-179 行）；原项目那两条写死的「目录 cate1/cate2」
           就是被这张卡片替换掉的。
         · 私有定制：新增，现在只有「菲比桌宠」一条（/pet 桌宠开关页）。

      两张卡结构完全一样，所以用一段 v-for 铺开（列表来自 computed 的 navCards）：
      条目 / 文案 / 图标全部来自 config/aside.config.js，组件只管渲染，
      加一张卡 = 往配置里加一条（连 markup 都不用动）。
    -->
    <el-card
      v-for="card in navCards"
      :key="card.key || card.title"
      :id="card.id"
      class="blog-card"
      shadow="never"
    >
      <div slot="header" class="blog-card--header">
        <h3>{{ card.title }}</h3>
      </div>
      <ul class="blog-cards--category">
        <li
          v-for="item in card.items"
          :key="item.key"
          :class="[item.itemClass, { 'is-active': isNavActive(item) }]"
          @click="handleNav(item)"
        >
          <span class="category-name">{{ item.text }}</span>
          <span class="category-cnt iconfont" :class="item.iconName"></span>
        </li>
      </ul>
    </el-card>

    <!--
      ③ 弹幕留言墙卡片（需求：放在「扩展功能」下方）

      内容与调度全部收在 components/wall/WallDanmaku.vue —— 它自己要拉数据
      （我的留言板顶层留言）、自己排发射节奏、自己处理「点卡片跳留言板」，
      这里只负责给它一个位置、并决定它什么时候不出现（见 computed 的 showDanmaku）。

      ⚠ 两个「不出现」的条件：
        未登录       —— 弹幕池就是「我的留言板」，未登录既没有 uid 也没有可看的板
        当前在留言路由 —— 这张卡展示的就是那一页的内容，停在那页时它是重复的；
                       而且整张卡可点、点了就是跳留言板，站在留言板上点它等于白点
      ⚠ 顺带的好处：离开 / 回到留言板页会销毁、重建本组件，池子自然是新的 ——
        不需要再拿事件总线去通知它重拉（那套已删）。
    -->
    <WallDanmaku v-if="showDanmaku" />

    <!--
      ④ 友情链接卡片
      数据与行为都收进了 components/aside/FriendLinks.vue（列表块 + 外链确认框）——
      需求 todo 2 要求小屏下 Aside 下沉时不带友链，友链改由汉堡菜单承载（todo 4），
      所以这块 markup 必须能被两个宿主复用，不能再写死在 Aside 里。

      ⚠ 这里保留 el-card 外壳（组件本身只出列表块），所以要在外面判一次空：
        FriendLinks 内部也有同样的 v-if，但那是管列表的，管不到这层卡片壳 ——
        不判的话没设过友链时会留下一张空标题的卡片。
      ⚠ ≤767 时这份友链由 CSS 收起（见文件末尾媒体查询）：
        那个宽度以下汉堡菜单才出现，友链交给它，避免两处同时出现。
    -->
    <el-card
      v-if="hasFriendLinks"
      id="blog-aside--friends"
      class="blog-card"
      shadow="never"
    >
      <div slot="header" class="blog-card--header">
        <h3>{{ friendCard.title }}</h3>
      </div>
      <FriendLinks />
    </el-card>

    <!--
      打开外链前的确认框
      与「删除自己的评论」用的是同一个 ConfirmModal 组件（同一套弹窗语言），
      社媒图标和友情链接共用这一个实例：pendingLink 记着这次要打开的是谁
    -->
    <ConfirmModal
      :visible="confirmVisible"
      title="打开链接"
      :message="confirmMessage"
      confirm-text="打开"
      @confirm="confirmOpen"
      @cancel="cancelOpen"
    />
  </aside>
</template>

<script>
import { mapGetters } from "vuex";
import {
  ASIDE_NAV,
  ASIDE_ADMIN,
  ASIDE_PRIVATE,
  ASIDE_FRIENDS,
} from "@/config/aside.config";
// 平台 value → 中文名的映射复用个人中心那份：社交链接本来就是资料上的字段，
// 两份配置各写一遍「github/wechat/bilibili」迟早会对不上
import { SOCIAL_PLATFORMS } from "@/config/profile.config";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
// 友情链接列表块（小屏下沉时不带它 —— 改由汉堡菜单挂同一个组件）
import FriendLinks from "@/components/aside/FriendLinks.vue";
// 弹幕留言墙（扩展功能下面那张卡；自己拉数据、自己排节奏、自己跳留言板）
import WallDanmaku from "@/components/wall/WallDanmaku.vue";
// 导航条目的分发逻辑（route 跳转 / action 分发 / 退出登录）——
// 与汉堡抽屉共用同一份，别在这里再写一遍
import navActions from "@/mixins/navActions";
// 「我现在看的是谁的主页」—— 见 mixins/visitContext.js 的口径说明
import visitContext from "@/mixins/visitContext";

// 默认头像：未登录、或用户没有设置头像时的兜底
// 资源来自原项目 public/img/avator-wheel.jpg
const DEFAULT_AVATAR = require("@/assets/images/avator-default.jpg");
const DEFAULT_NICKNAME = "游客";
const DEFAULT_MOTTO = "这个用户很懒,还什么都没有写！";

/**
 * 社交图标表
 * ⚠ platform 的取值必须与后端 myapp/models/User.js 的 socialLinks.platform
 *   enum ['github', 'wechat', 'bilibili'] 对齐 —— 它是取链接的 key
 *
 * ⚠ 展示顺序沿用了迁移时 iconList 的既有顺序（bilibili / 微信 / github）。
 *   原项目 index.html 的 .blog-redirect 是 bilibili / github / 微信 ——
 *   当年迁移时就对不上，本次没动（改顺序属于视觉变更，需要你点头）。
 */
const SOCIAL_ICONS = [
  { id: 0, platform: "bilibili", iconClass: "icon-bilibili-line" },
  { id: 1, platform: "wechat", iconClass: "icon-wechat-fill" },
  { id: 2, platform: "github", iconClass: "icon-github" },
];

export default {
  name: "Aside",
  components: { ConfirmModal, FriendLinks, WallDanmaku },
  // isNavActive / handleNav / logout / chat + visitedUserId / isVisitContext / visitedProfile
  mixins: [navActions, visitContext],
  data() {
    return {
      // 图标 + 平台名（title 悬浮提示用），平台中文名从 SOCIAL_PLATFORMS 取
      iconList: SOCIAL_ICONS.map((icon) => ({
        ...icon,
        label: this.platformLabel(icon.platform),
      })),
      // 「我的」/「管理导航」/「扩展功能」三张卡片的配置（显隐见 computed 的 navCards）
      navCard: ASIDE_NAV,
      adminCard: ASIDE_ADMIN,
      privateCard: ASIDE_PRIVATE,
      // 友链卡片的标题配置（列表本身由 FriendLinks 组件渲染）
      friendCard: ASIDE_FRIENDS,
      // 待确认打开的外链：{ name, url }；confirmVisible 控制确认框显隐
      // ⚠ 这份只服务社交图标了；友链的确认框跟着 FriendLinks 走
      pendingLink: null,
      confirmVisible: false,
    };
  },
  computed: {
    ...mapGetters("http", ["userInfo", "isLogin"]),
    /**
     * 个人信息卡这一整块读的「谁」
     *
     *   他人主页 → 被访问用户的公开资料（store/modules/visit.js 的缓存）
     *   自己的主页 → 当前登录用户（userInfo）
     *
     * ⚠ 被访问用户的资料是异步拉的，没到手时是空对象 —— 各字段各有兜底，
     *   所以这里直接返回空对象也行（头像回落到默认图、昵称回落到「游客」）。
     */
    profileSource() {
      return this.isVisitContext ? this.visitedProfile : this.userInfo?.data || {};
    },
    /**
     * 「条目型」卡片列表：管理导航 + 私有定制
     * 两张卡结构完全一样（标题 + 一组「文字 + 图标」条目），模板 ② 用一段 v-for 铺开 ——
     * 加一张卡只需要往这里加一条配置，不用再抄一遍卡片 markup。
     * ⚠ 未登录时返回空数组：卡里的入口（个人中心 / 写博客 / 桌宠）都要登录才能用，
     *   与原来单张卡片上的 v-if="isLogin" 行为一致。
     * ⚠ 他人主页下「管理导航仅剩退出登录」（需求原文），扩展功能照旧 ——
     *   桌宠 / 聊天室操作的**仍是当前登录用户**，不是被访问用户。
     * ⚠ 管理导航按 roles 过滤：普通用户整张卡都不出现，管理员看不到「账号管理」。
     *   这里只管显隐；进不进得去由路由守卫和服务端 authz 决定。
     */
    navCards() {
      if (!this.isLogin) return [];
      // 他人主页下：只剩「退出登录」（需求原文），管理端那几条也不该出现
      if (this.isVisitContext) {
        const onlyLogout = this.navCard.items.filter((item) => item.action === "logout");
        return [{ ...this.navCard, items: onlyLogout }, this.privateCard];
      }
      const cards = [
        { ...this.navCard, items: this.navCard.items.filter((item) => this.canSeeNav(item)) }
      ];
      // 「管理导航」整张卡按角色显隐：普通用户一条都看不到时，卡片本身也不出现
      const adminItems = this.adminCard.items.filter((item) => this.canSeeNav(item));
      if (adminItems.length) cards.push({ ...this.adminCard, items: adminItems });
      cards.push(this.privateCard);
      return cards;
    },
    /** 当前登录账号的角色：刷新后 userInfo 还没到手时按普通用户处理（保守） */
    role() {
      return this.userInfo?.data?.role || "user";
    },
    // 登录后取 vuex 里的真实头像，否则回落到默认头像
    avatarSrc() {
      return this.profileSource.avatar || DEFAULT_AVATAR;
    },
    nickname() {
      return this.profileSource.nickname || DEFAULT_NICKNAME;
    },
    motto() {
      return this.profileSource.bio || DEFAULT_MOTTO;
    },
    /**
     * 弹幕留言墙卡片要不要渲染
     *
     * 两个条件缺一不可（需求原话：「如果当前是留言路由则不显示」）：
     *   isLogin                     —— 弹幕池就是「我的留言板」，未登录没有 uid、也没有可看的板
     *   $route.name !== 'Message'   —— 这一页展示的就是留言板本身，卡片与之重复
     *
     * ⚠ 顺带解决了「数据新鲜度」：从留言板页离开 / 回到首页，本组件会被销毁再重建
     *   （v-if 跟着路由翻转），池子重新拉一次 —— 所以那个「留言成功后广播一次」
     *   的事件总线就不需要了，已连同 utils/eventBus.js 里的 WALL_CHANGED 一起删掉。
     */
    showDanmaku() {
      return this.isLogin && this.$route.name !== "Message";
    },
    /**
     * 是否渲染友链卡片（列表内容由 FriendLinks 自己判空）
     * 这里判的是**外层 el-card 要不要出现** —— 一张空标题的卡片比不出现更难看
     * ⚠ 他人主页下改成判**被访问用户**的友链（需求原文：「外链改为当前访问用户的」）
     */
    hasFriendLinks() {
      const links = this.profileSource.friendLinks;
      return Array.isArray(links) && links.length > 0;
    },
    /**
     * 资料上的社交链接，整理成 platform → url 的查找表
     * （原项目在 refreshAuthorCard 里是同一个做法：socialLinks.forEach 建 socialMap）
     */
    socialMap() {
      const links = this.profileSource.socialLinks;
      return (Array.isArray(links) ? links : []).reduce((map, link) => {
        if (link.platform) map[link.platform] = link.url;
        return map;
      }, {});
    },
    // 确认框正文：有站点名/平台名就带上，只设了链接的站点也能看清要去哪
    confirmMessage() {
      if (!this.pendingLink) return "";
      const { name, url } = this.pendingLink;
      return name
        ? `即将在新标签页打开「${name}」：${url}`
        : `即将在新标签页打开：${url}`;
    },
  },
  methods: {
    // 导航条目对当前角色是否可见（配置里不写 roles = 所有登录用户可见）
    canSeeNav(item) {
      return !item.roles || item.roles.indexOf(this.role) !== -1;
    },
    // 平台 value → 中文名（github → GitHub / wechat → 微信 / bilibili → B站）
    platformLabel(platform) {
      const found = SOCIAL_PLATFORMS.find((item) => item.value === platform);
      return found ? found.label : platform;
    },

    // ═══════════ 外链：先确认，再新标签页打开 ═══════════

    /**
     * 社交图标点击（对应原项目 refreshAuthorCard 里的 _bind）
     *   没设过 → 原样照搬原项目的「ta还没有设置呢~」
     *   设过了 → 交给确认框
     * ⚠ 友链的同类逻辑已随列表一起搬进 FriendLinks.vue，这里只剩社交图标
     */
    openSocial(item) {
      this.requestOpen(
        this.platformLabel(item.platform),
        this.socialMap[item.platform]
      );
    },

    /** 暂存目标并弹确认框；没链接的（站点建了行但没填 URL）按「未设置」处理 */
    requestOpen(name, url) {
      if (!url) return this.$toast.info("ta还没有设置呢~");
      this.pendingLink = { name, url };
      this.confirmVisible = true;
    },

    /**
     * 确认打开 —— 与「删除自己的评论」同款顺序：先把目标取到手、立刻关弹窗，再干活
     * （CommentSection.confirmDelete 就是这么写的，关窗和请求互不阻塞）
     */
    confirmOpen() {
      const target = this.pendingLink;
      this.cancelOpen();
      if (target) window.open(target.url, "_blank", "noopener");
    },

    cancelOpen() {
      this.pendingLink = null;
      this.confirmVisible = false;
    },
  },
};
</script>

<style lang='stylus'>
@import '../assets/css/themes.styl'

// ============================================================
// 侧边栏（迁移自原项目 src/styl/index.styl 的 aside 规则）
// 卡片改用 el-card，视觉按原 .blog-card 还原
//
// ⚠ 本文件所有声明统一写成「属性: 值」的带冒号形式。
// Stylus 对「无冒号 + 值是多段」的声明有歧义：如果紧跟其后的是
// 一个缩进更深的嵌套块（如 &__header），该声明会被当成选择器解析，
// 整条规则被静默丢弃（编译不报错，CSS 里出现 `xx box-shadow $var` 这种选择器）。
// 原项目 index.styl 里也踩过同样的坑。
// ============================================================

#aside
  display: grid
  // minmax(0, 1fr) 而不是 1fr：1fr 等价于 minmax(auto, 1fr)，列不会窄于内容的最小宽度。
  // 固定 280px 的卡片区目前放得下 `longlogglongglongglong` 这种超长标签，
  // 用 minmax(0, …) 是保险 —— 内容变宽时是换行，而不是把卡片顶出去。
  grid-template-columns: minmax(0, 1fr)
  gap: 20px
  box-sizing: border-box
  // 固定宽度，不随视口缩放：300 = 卡片区 280 + 与正文的间隔 20
  // 对应原项目 aside{flex:0 0 280px} + article{margin-left:20px}
  // flex-shrink 为 0：视口变窄时只压缩正文，aside 在消失前尺寸恒定
  flex: 0 0 300px
  width: 300px
  // 间隔用 padding 而不是 margin：border-box 下 padding 含在这 300px 里；
  // 换成 margin 会变成 300px + 20px，把正文挤到下一行
  padding: 0 20px 0 0
  text-align: center
  color: var(--theme-font-trd)
  // 与横幅图重叠：整体上移 50px
  transform: translateY(-50px)
  // Home.vue 给 .el-col 设了 height:100%，不加这句三张卡片会被拉伸填满整列
  align-content: start

  // ===== 卡片：视觉由全局 .blog-card 提供，这里只写 aside 专属的布局 =====
  // （边框/圆角/白底/阴影/overflow，以及 header / body 的内边距拆分，
  //   全部见 assets/css/component.styl —— 那边用的是 `.el-card.blog-card`，
  //   权重 (0,2,0)，稳压 element 自带的 `.el-card` (0,1,0)，与注入顺序无关。
  //   这里不再重复写圆角，跟随 .blog-card 的 16px，与原项目一致）
  .el-card
    display: grid
    grid-template-columns: minmax(0, 1fr)
    gap: $theme-spacing.base
    // grid item 默认 min-width: auto，同样会被内容最小宽度撑开
    min-width: 0

    &__body
      display: grid
      grid-template-columns: minmax(0, 1fr)
      gap: $theme-spacing.base
      min-width: 0

  h2
    font-weight: 700
    font-size: $theme-fz.lg
    color: var(--theme-font-fst)

  // ===== 头像区 =====
  .author-avator
    position: relative
    border-radius: $theme-radius.md
    overflow: hidden

    // el-image 渲染出来是个 div，默认 inline-block 会把宽度交给图片自身
    .el-image
      display: block
      width: 100%

    img
      display: block
      width: 100%
      height: auto

    .blog-mask--avatar
      position: absolute
      opacity: 0
      width: 100%
      height: 100%
      top: 0
      right: 0
      border-radius: $theme-radius.md
      background-color: rgba(0, 0, 0, 0.3)
      transition: .5s

      i
        position: absolute

      .blog-href--about
        font-size: 60px
        // 原来是写死的 #68AEF4（正好等于默认主题色）—— 换成变量，
        // 调色盘换色相 / 切深色模式时这里才会跟着走
        color: var(--theme-font-fst)
        top: 50%
        left: 50%
        transform: translate(-50%, -50%)

        a
          font-size: $theme-spacing['2xl']

    &:hover .blog-mask--avatar
      opacity: 1

  // ===== 社交跳转 =====
  .blog-cards--author
    ul
      display: flex
      justify-content: center
      // 同上：写死的 #68AEF4 → 主题强调色
      color: var(--theme-font-fst)

      li
        font-size: 24px
        padding: 0 10px
        // 这三个图标现在可点了（原项目是 refreshAuthorCard 里逐个 $li.style.cursor）
        cursor: pointer

        a
          color: var(--theme-font-fst)
          font-size: $theme-fz.lg

.blog-mask--avatar
  a
    color: var(--theme-font-sec)

// 卡片头部「.blog-card--header」已移到 assets/css/component.styl —— 文章卡片也要用

// ===== 条目行样式已移到 assets/css/component.styl =====
// `.blog-cards--category`（导航行 / 友链行共用）、`.blog-aside--logout`、
// `.blog-friends--more` 三段挪去了全局 —— 友链被抽成 FriendLinks.vue、
// 后面还要进汉堡菜单，留在 Aside 里会变成「靠 Aside 恰好没写 scoped 才生效」的隐性依赖。

// ===== 响应式 =====
//
// ① ≤991：Aside 从「左侧固定 300px 的列」改成「正文之后的整宽区块」
//    具体的 flex-direction / order / width 写在 **Home.vue**（那才是布局宿主，
//    .el-row 与 .blog-main-col 都定义在那儿，三处规则放一起才不会各改一半）。
//    ⚠ 这里原来有一条 `#aside { display: none !important }` 把 ≤991 的侧栏整个藏掉，
//      已删除 —— 现在它不再是「藏起来」而是「换个位置显示」。
//
// ② ≤991：头像收成 200×200 的方图
//    大屏时卡片只有 280px 宽，头像是「撑满卡片宽度」的一张图（原项目就是这做法）；
//    下沉后卡片变成整视口宽，再让它撑满就会被拉成一条巨幅横图，所以要定成方图。
//    ⚠ 200 是**布局像素**（全站尺寸都写布局像素，见 global.styl 的 zoom 说明），
//      在 zoom:1.25 下实际渲染 250×250。若要「浏览器量出来正好 200」，
//      这里应该写 160。
//    ⚠ object-fit: cover 必须有：封面图默认是竖图，不裁的话会被压扁变形。
//
// ③ ≤991：弹幕留言墙不跟着下沉
//    需求原话「小屏也不会跟着 aside 其他部分下沉」。
//    ⚠ 断点用 991（Aside 下沉的那个断点，见 Home.vue），不是汉堡菜单的 767 ——
//      这张卡不收的原因是「不跟着下沉」，而下沉正是发生在 991。
//    ⚠ 不收进「条目型卡片」那套显隐里：它是独立卡片，规则也独立。
//    ⚠⚠ 选择器必须写成 `#aside #blog-aside--danmaku`（两个 id，权重 2,0,0）。
//      只写 `#blog-aside--danmaku`（1,0,0）看着够了，其实会被同一份样式里
//      那条 `#aside .el-card { display: grid }`（1,1,0）压掉 ——
//      实测过：断点明明命中，卡片却照旧显示，正是因为这条。
//      这里不需要 !important，两个 id 已经稳超它，与注入顺序无关。
@media only screen and (max-width: 991px)
  #aside .author-avator
    width: 150px
    height: 150px
    // #aside 整体是 text-align: center，但这是个块级盒子，得靠 auto 外边距居中
    margin-left: auto
    margin-right: auto

    .el-image
      height: 100%

    img
      // 覆盖大屏那条 height: auto（那会让高度跟着原图比例走，撑破这 200px 的方框）
      height: 100%
      object-fit: cover

  #aside #blog-aside--danmaku
    display: none

// ④ ≤767：这份友链收起来
//    根因是「谁在小屏承载友链」必须唯一：汉堡菜单用 hidden-sm-and-up，只在 <768 出现；
//    如果侧栏这份不关，768 以下会出现两处友链。
//    ⚠ 反过来说：768~991 这段没有汉堡、Aside 又已经下沉，所以那份友链必须留着
//      （这就是为什么这里收的断点是 767 而不是 991）——
//      否则窗口在 768~991 之间时友链会彻底没有入口。
@media only screen and (max-width: 767px)
  #aside .blog-friend--links
    display: none !important

  // ⑤ ≤767：「退出登录」这一行也收起来 —— 汉堡抽屉的最下方有一条同样的
  //    （需求：登出收进抽屉后，页面导航里那条要消失）。
  //    ⚠ 只收这一行，不整张卡收掉：个人中心 / 博客管理 在小屏仍然只有这一处入口
  //      （header 那五个导航项里虽然有「个人」，但抽屉里的「博客管理」没有别的落点）。
  #aside .blog-aside--logout
    display: none !important
</style>
