<template>
  <div id="home">
    <el-container class="blog-container">
      <!-- 顶部导航（原头部已迁移至 Head.vue） -->
      <Head />

      <!-- 全屏横幅（迁移自原项目 index.html 的 .blog-banner--full） -->
      <section class="blog-banner--full">
        <img :src="bannerSrc" alt="站点横幅" />
      </section>

      <el-container class="blog-middle">
        <el-row type="flex">
          <Aside />
          <!-- 正文列：aside 固定 300px，这一列用 flex 吃掉剩余宽度 -->
          <el-col :span="24" :md="18" class="blog-main-col">
            <el-main class="blog-middle-main">
              <!--
                keep-alive 缓存：Index（列表页）+ Write（写博客页）

                Index：跳去详情页 / 写博客 / 留言，再回 index 时组件不会被销毁，
                  当前页码（listData.page）和已请求到的文章（listData.list）原样保留，
                  created 不会重跑 → 不会重新请求。
                  滚动位置的存取由 Index.vue 的 activated / deactivated 负责。

                Write：写博客是「填一半要走」的页面（去翻篇文章、回个留言再回来接着写），
                  不缓存的话组件被销毁 → form（标题/标签/封面）与编辑器正文全丢。
                  缓存后 RichEditor 的 beforeDestroy 不会跑，wangEditor 实例与正文原地留着。
                  ⚠ 代价是「发表成功」也不会自动复位本页，所以 Write.vue 在提交成功后
                    自己调了清空（原项目靠整页重载天然复位）。

                ⚠ 其余视图（尤其 Article 详情页）不进缓存：
                  详情页每次进入都要重新请求（后端会在 GET 详情时给 viewNum +1），
                  缓存住会让不同文章的阅读量算不对、内容也可能过时。
                  匹配的是「组件的 name 选项」：Index.vue / Write.vue 都已声明 name。
              -->
              <!--
                路由切换的渐入渐出（过渡样式在本文件底部）
                ⚠ 层级顺序必须是 transition 在外、keep-alive 在内 —— 反过来
                   Vue 2 认不出「同一个子节点」，缓存的页面就不会走过渡。
                ⚠ mode="out-in"：先让旧页走完再进新页。卡片式布局里两个页面叠在
                   同一位置，不分开的话会互相穿插、看着很乱。
                   代价是切换期间 router-view 会短暂为空（·18s），
                   滚动归位的补偿逻辑能兜住（见 utils/scroll.js）。
              -->
              <transition name="blog-page--fade" mode="out-in" appear>
                <keep-alive include="Index,Write">
                  <router-view></router-view>
                </keep-alive>
              </transition>
            </el-main>
          </el-col>
        </el-row>
      </el-container>

      <AuthModal />

      <!--
        聊天室（「扩展功能」里的入口打开）
        ⚠ 与 AuthModal 同一层：Home 才是布局宿主
        ⚠ 这里只放「弹窗」；WebSocket 连接跟着登录态走（store/modules/chat.js），
          弹窗开关不影响连接 —— 别人说的话在弹窗关着时也会进 store
      -->
      <ChatRoom />

      <!--
        侧边浮动按钮组（fixed 定位，放在哪一层不影响布局）
        挂这里而不是 App.vue：Home 才是布局宿主，AuthModal 也在这一层。
        按钮随路由变（配置见 config/float.config.js）—— Home 本身不会因路由切换
        而重建，但组件内部读的是响应式的 $route，配置表会跟着路由自动重算。
      -->
      <FloatMenu />

      <!--
        菲比桌宠（左下角，fixed）
        ⚠ 挂在这一层而不是 App.vue：与 FloatMenu / AuthModal 同一个理由 ——
          Home 才是布局宿主，桌宠的显隐跟着「页面级」状态走（开关 + 侧栏是否可见）。
        ⚠ v-if 而不是 v-show：关掉开关要真的把 WebGL 上下文与 24MB 贴图还回去，
          不是单纯藏起来。
      -->
      <BongoCatPet v-if="petEnabled" />

      <el-footer class="blog-footer" height="auto">
        <!-- 页脚三行：版权 / 技术栈 / 联系方式（纯展示，不可点） -->
        <p class="blog-footer__line">© 2026 吴辞清的博客平台</p>
        <p class="blog-footer__line">Powered by Vue / Node.js</p>
        <p class="blog-footer__line">联系方式：QQ 000000000 | 微信 your_wechat</p>
      </el-footer>
    </el-container>
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import AuthModal from "@/components/base/AuthModal.vue";
import ChatRoom from "@/components/chat/ChatRoom.vue";
import FloatMenu from "@/components/base/FloatMenu.vue";
// 菲比桌宠（左下角小窗，由「私有定制」里的开关控制）
import BongoCatPet from "@/components/pet/BongoCatPet.vue";
import Head from "./Head.vue";
import Aside from "./Aside.vue";
import { DEFAULT_BANNER } from "@/config/theme.config";

// 横幅图：用户资料上设过 banner 就用它，否则回落到固定的默认图。
// 原项目是 refreshAuthorCard() 里的 `userData.banner || './public/img/bgc-light.jpg'`，
// 由 jQuery 直接改 img.src；这里是响应式的 —— 在个人中心保存背景图后
// commit 回 store，这条 computed 会自己重算，横幅立刻换掉。
//
// ⚠ 横幅**不跟昼夜模式走**：顶栏那个切换按钮只换登录框的滑块图，
//   不再切大背景图（原先 bgi-light / bgi-dark 两套是跟着 mode 换的）。
//   所以这里取的是固定的 DEFAULT_BANNER，而不是 getThemeImage(mode, 'banner')。
export default {
  components: {
    AuthModal,
    ChatRoom,
    FloatMenu,
    BongoCatPet,
    Head,
    Aside,
  },
  computed: {
    ...mapGetters("http", ["userInfo"]),
    // 「私有定制 → 菲比桌宠」那个开关（默认关；状态在 store/modules/pet.js）
    ...mapGetters({ petEnabled: "pet/isEnabled" }),
    bannerSrc() {
      return this.userInfo?.data?.banner || DEFAULT_BANNER;
    },
  },
  created() {
    // 首屏也同步一次访问对象（watch $route 只在「变化」时触发，首次不算）
    this.syncVisit(this.$route);
  },
  watch: {
    /**
     * 路由一变就把「当前访问对象」同步进 store ——
     *   Head / Aside / router-view 三棵子树都从 store 读资料（见 store/modules/visit.js）。
     * ⚠ 这里只做「路由 → store」这一跳，判据与 mixins/visitContext.js 完全一致：
     *   /user/:id 取 params.id，其余路由取 ?uid=。
     */
    $route(to) {
      this.syncVisit(to);
    },
  },
  methods: {
    syncVisit(route) {
      const id =
        route.name === "UserHome" ? String(route.params.id || "") : String(route.query.uid || "");
      this.$store.dispatch("visit/enter", id);
    },
  },
};
</script>

<style lang='stylus'>

// 全屏背景图（迁移自原项目 index.styl 的 .blog-banner--full）
//
// ⚠ 容器必须锁死比例，不能靠图片自己撑高：
//   横幅换图是运行时的事（用户随时可能在个人中心换背景图），
//   而每张图的宽高比都不一样（默认图 bgi-light 是 3840×2160 = 16:9，
//   用户传上来的裁剪比例则是 2:1）。
//   让 img 用 height: auto 自己撑高的话，横幅高度就等于「容器宽 ÷ 自身宽高比」，
//   一换图整页内容就跟着上下跳。
//   所以容器锁成 16:9（以默认图为准），图片统一 object-fit: cover 填满 + 居中裁切 ——
//   换任何比例的图，占的盒子尺寸都完全一样。
.blog-banner--full
  position relative
  // 容器锁成 16:9（以默认图 bgi-light 为准）
  aspect-ratio: 16 / 9
  overflow hidden
  img
    display block
    // ⚠ 图片必须脱离文档流。它在 flex 列（.el-container）里，flex 项的 min-height:auto
    //   会让「图片自己的固有高度」顶住容器，aspect-ratio 就被忽略了 ——
    //   实测：不脱离时 1.603 比例的图仍按 1440÷1.603 = 898.6 撑高（应为 810）。
    //   绝对定位后容器不再受内容高度影响，比例框才真正生效。
    position absolute
    top 0
    left 0
    width: 100%
    height: 100%
    object-fit: cover

.el-row
  width 100%
  height 100%

.el-col
  height 100%

.blog-middle
  // 对应原项目 main：占满整宽，用 justify-content 居中
  // 原项目 main 没有左右 margin，左右留白完全由内层 .row 的固定宽度产生
  width: 100%
  justify-content: center
  // 上下留 10px（原项目靠 aside/article 的 translateY(-50px) 与横幅重叠，本身没有纵向 margin）
  margin: 10px 0

  // 对应原项目 main > .row：固定 1024px 居中
  // （≤1024px 由下面的媒体查询改成 100%，与原项目 media.styl 一致）
  .el-row
    width: 1024px

  // 正文列：aside 是固定 300px（flex-shrink 0），这里 flex:1 吃掉剩余宽度。
  // 视口变窄时被压缩；aside 在 ≤991px 消失后，这一列自然占满整行。
  // flex-basis 用 0% 而不是 auto，宽度完全由剩余空间决定，不受内容影响。
  .blog-main-col
    flex 1 1 0%
    min-width 0
  // 主渲染容器：原先那圈 1px 占位边框已去掉，现在就是真正的正文区
  .blog-middle-main
    height: auto
    // el-main 默认 padding:20px / overflow:auto：
    // 留白交给卡片自身，滚动交给整页
    padding: 0
    overflow: visible
    // 与横幅图重叠：整体上移 50px（与 aside 保持一致）
    transform: translateY(-50px)
    // ⚠ 正文区至少要有一屏「减去头部和页脚」那么高 —— 「切页面时滚动条会跳」的根治点。
    //   新页面的数据是异步的，刚插进来时文档很矮：实测（400ms 延迟）/column 插入时只有
    //   1309，最大可滚 504，而归位目标在 620 —— 够不着就被浏览器夹断；等数据回来文档长到
    //   1709，再补那一 620，用户看到的就是「页面都淡入完了，滚动条又跳两下」。
    //   撑住这个高度后，目标在切换那一刻就够得着，归位一次到位、之后长度长出来也不用再动。
    //   ⚠ 160 = 头部 90 + 间距 10 + 页脚 60（都是实测值，见 utils/scroll.js 的头部口径）。
    //     头部/页脚日后改高，这里跟着改；不改的代价只是「夹断一点点」，不会崩。
    min-height: calc(100vh - 160px)

// 对应原项目 media.styl：窗口不够宽时 .row 拉满，不再保留固定宽度的左右留白
//
// ⚠ 阈值从原项目的 1024px 挪到了 1280px：全站有 body{zoom:1.25}（见 global.styl），
//   布局视口只有实际窗口的 1/1.25 —— 窗口 1280 时布局才正好 1024。
//   不改的话，窗口落在 1024~1280 这一段时这条媒体查询不触发，.row 仍是写死的
//   1024px，而布局视口只有 819~1024，右侧会凭空多出一段横向滚动。
//   这是 zoom 的配套改动，不是重新设计响应式（其余断点都没动）。
@media only screen and (max-width: 1280px)
  .blog-middle .el-row
    width: 100%

// ============================================================
// ≤991：Aside 下沉到正文之后（需求 todo 2）
//
// 目标形态：小屏下 aside（个人简介 / 页面导航 / 扩展功能）不再占左侧，
// 而是排到正文里的分页器下面，样式参考 fuwari 的小屏布局。
//
// ⚠ 为什么用 flex-direction + order，而不是把 <Aside> 挪进 router-view 后面：
//   ① aside 与 .blog-main-col 本来就是同一个 flex 行里的兄弟 ——
//      行改成纵向、把正文的 order 提到前面，aside 自然落到正文**之后**；
//   ② 正文列里最后一个元素就是 Index.vue 的分页器（#index 网格的最后一项，
//      见 Index.vue 的模板），所以「正文之后」正好等于「分页器下面」；
//   ③ 好处是 Aside 保持全局单实例：不用为小屏再渲染一份（两份会有两套
//      ConfirmModal、两套 store 订阅），也不用把它塞进每个路由视图里。
//
// ⚠ 断点用 991（对齐 Element 的 md=992），不跟汉堡菜单的 767 合并：
//   两者是独立维度 —— 768~991 是「侧栏已下沉、导航仍在 header 里」的区间。
//   这里若也收成 767，那段窗口就会既没有汉堡、侧栏又被藏掉。
//
// ⚠ 原来 Aside.vue 里有一条 `@media(max-width:991px){ #aside{display:none} }`
//   把侧栏整个藏掉，已删除 —— 现在它不再是「藏起来」而是「换个位置显示」。
// ============================================================
@media only screen and (max-width: 991px)
  .blog-middle .el-row
    flex-direction: column

  // 正文提到前面（order 只在 flex 容器里生效）
  //
  // ⚠ 选择器必须写成 `.blog-middle .blog-main-col`（两级），不能只写 `.blog-main-col`：
  //   上面那段基础样式是**嵌套在 .blog-middle 里**写的，编译出来是
  //   `.blog-middle .blog-main-col`（权重 0,2,0）；这里写单级（0,1,0）的话，
  //   媒体查询里改的 order / width 一条都不会生效 —— Stylus 不报错，
  //   表现就是「改了没反应」。（实际踩到过：改完 order 仍是并排，页面看不出任何变化。）
  .blog-middle .blog-main-col
    order: 1
    width: 100%
    // 大屏那条 `flex: 1 1 0%` 是给「横向 flex 行」写的，改纵向后主轴变成竖直，
    // 语义就不对了，这里显式改回「按内容尺寸」。
    // （当前行高完全由内容决定、没有多余空间，所以这条不会改变高度 ——
    //   它只是把语义摆正，免得日后给行设了高度时正文列突然被撑开。）
    flex: 0 0 auto

  #aside
    order: 2
    // 不再是「固定 300px 的侧列」，也不再收窄成一栏 —— 下沉后占满整宽（= 视口宽）
    flex: 0 0 auto
    width: 100%
    // ⚠ 必须显式清掉左右内边距：大屏那 20px 是给「与正文之间的横向间隔」用的，
    //   下沉后它只会让卡片比视口窄 20px，看起来像没对齐
    padding: 0
    // 大屏那句 translateY(-50px) 是为了和横幅重叠；下沉后留着会把整块往上提、
    // 压住上面正文的卡片
    transform: none
    // ⚠ 上间距留 0，不要再额外加：分页器下面本来就有 #index 的 `margin-bottom: 48px`
    //   （那是「列表底部留白」，见 Index.vue 的注释），再加一条就是叠成两倍。
    //   这段视觉空白的构成（布局像素，实测）：
    //     50 ← 正文列那句 translateY(-50px)：正文整体上移，它自己盒子底部就空出 50
    //     48 ← #index 的 margin-bottom（作者有意留的）
    //   两项都是原有设计。若想让 aside 再贴近，在这一段里给 .blog-middle-main
    //   加 `transform: none` 即可省掉那 50（代价是正文不再与横幅重叠）。
    margin-top: 0
    // 只留上间距：一旦写了 margin-left/right，整块就不再是「100% 视口宽」
    margin-left: 0
    margin-right: 0

// ============================================================
// 路由切换的渐入渐出（配合模板里的 <transition name="blog-page--fade">）
//
// ⚠ 只做 opacity + 一点点纵向位移：
//   页面根节点都是 .el-card（带 8px 8px 20px 的大阴影），做 scale 会在动画期间
//   把阴影一起缩放、卡片边缘发虚；位移则不会。
// ⚠ 进出用不同曲线：进慢出快（0.3s / 0.18s）。
//   两边同速时「旧页还没走完、新页已经压上来」的错觉反而更强。
// ============================================================
.blog-page--fade-enter-active
  transition: opacity 0.3s cubic-bezier(0.22, 0.61, 0.36, 1), transform 0.3s cubic-bezier(0.22, 0.61, 0.36, 1)

.blog-page--fade-leave-active
  transition: opacity 0.18s cubic-bezier(0.55, 0.06, 0.68, 0.19), transform 0.18s cubic-bezier(0.55, 0.06, 0.68, 0.19)

.blog-page--fade-enter
  opacity: 0
  // 从下方 12px 浮上来
  transform: translateY(12px)

.blog-page--fade-leave-to
  opacity: 0
  // 向上 8px 淡出（比进场幅度小：离场是「让位」，不该抢戏）
  transform: translateY(-8px)

.blog-footer
  // 高度交给内容（el-footer 默认锁 60px，三行会溢出）
  height auto
  padding 18px 20px 22px
  // 只留上方一条淡灰细线（走弱描边变量，昼夜模式各自自适应）
  border-top 1px solid var(--theme-border-light)
  text-align center
  color var(--theme-font-placeholder)
  font-size 13px
  line-height 1.9
  background transparent

  &__line
    margin 0
</style>
