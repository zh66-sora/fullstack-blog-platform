<template>
  <!--
    全局兜底页
      模板：myBlog/src/template/lost.hbs（原项目的「走失页」）
      样式：myBlog/src/styl/index.styl 第 487-569 行

    ⚠ 本组件只有「一套结构 + 一张状态表」，没有任何状态判断：
      插图 / 标题 / 文案 / 按钮去向全部来自 config/lost.config.js，
      想加一个兜底状态就往那张表里加一条，这个文件不用动。

    状态来源（优先级从上到下）：
      ① <Lost state="dev" /> —— 被别的视图当子组件用（比如还没做完的页面）
      ② 路由 query ?state=<key>（如 /lost?state=empty&category=<板块 id>）
      ③ 都没有 → notFound（router 里 path:'*' 走的就是它）
  -->
  <el-card id="lost" class="blog-card blog-lost--wrap" shadow="never">
    <!-- 顶栏：返回键 + 标题 -->
    <div slot="header" class="blog-lost--header">
      <span
        class="blog-lost--back iconfont icon-huitui"
        :title="view.back.tip"
        @click="goBack"
      ></span>
      <h3>{{ view.title }}</h3>
    </div>

    <div class="blog-lost--body">
      <!-- 插图在最上：各状态共用同一个盒子尺寸（见样式里的 aspect-ratio + cover） -->
      <div class="blog-lost--imgCard">
        <img :src="view.img" :alt="view.alt" />
      </div>

      <p class="blog-lost--title">{{ view.main }}</p>
      <p class="blog-lost--subtitle">{{ view.sub }}</p>

      <!--
        主按钮：icon / 文案 / 去向都来自配置表
        ⚠ v-if="view.cta"：有的状态**没有**主按钮（比如「别人的空板块」——你不能替 TA 去写一篇）。
        config 里这类状态会把 cta 设成 null；没有这一行的话，模板读 view.cta.icon 会直接抛错。
      -->
      <button v-if="view.cta" class="blog-lost--writeBtn" @click="handleCta">
        <i :class="view.cta.icon"></i>
        {{ view.cta.text }}
      </button>
    </div>
  </el-card>
</template>

<script>
import { getCategoryNameById } from "@/config/category.config";
import { resolveLostState, DEFAULT_LOST_STATE } from "@/config/lost.config";
// 「我现在看的是谁的主页」—— 兜底页的返回/主按钮在访问上下文下也要保持访问对象
import visitContext from "@/mixins/visitContext";

export default {
  name: "Lost",
  mixins: [visitContext],
  props: {
    /**
     * 兜底状态 key（见 config/lost.config.js 的 LOST_STATES）
     * 不传就读路由 query 的 ?state=；两者都没有 → 默认 notFound
     * 留着这个 prop 是为了同一个组件既能当路由页、也能被别的视图直接渲染
     */
    state: { type: String, default: "" },
  },
  computed: {
    // 当前状态 key（resolveLostState 内部还有一层白名单兜底）
    stateKey() {
      return this.state || this.$route.query.state || DEFAULT_LOST_STATE;
    },
    // 文案函数可能用到的动态字段
    ctx() {
      const categoryId = this.$route.query.category || "";
      return {
        categoryId,
        categoryName: categoryId
          ? getCategoryNameById(categoryId) || "未知"
          : "",
        // searchEmpty 状态用它拼「没有找到与「XX」相关的博客」
        keyword: this.$route.query.q || "",
      };
    },
    /**
     * 当前状态下「可以直接渲染」的成品：
     * 配置项里的 title / main / sub 允许写成函数，这里统一求值成字符串，
     * 模板里就不用再管「这个字段是函数还是字符串」。
     */
    view() {
      const cfg = resolveLostState(this.stateKey);
      const pick = (v) => (typeof v === "function" ? v(this.ctx) : v);
      return {
        img: cfg.img,
        alt: cfg.alt,
        title: pick(cfg.title),
        main: pick(cfg.main),
        sub: pick(cfg.sub),
        cta: cfg.cta,
        back: cfg.back,
      };
    },
  },
  methods: {
    // 顶栏返回键
    goBack() {
      this.runAction(this.view.back);
    },
    // 主按钮
    handleCta() {
      this.runAction(this.view.cta);
    },

    /**
     * 声明式动作分发 —— 配置表里那些 type 的唯一出口
     *   route   跳路由；keepQuery 把当前 URL 上的指定参数带过去（如 category）
     *   retry   路由跳回 from（出事那一页）重跑请求 —— 「加载失败」用，不会白屏
     *   reload  整页重载（会白屏闪一下，慎用；要重置整个应用状态时才用）
     *   back    返回上一页
     *   login   弹登录框（复用 mixins / store.modal 那套，与 Header 一致）
     */
    runAction(action = {}) {
      switch (action.type) {
        case "route": {
          const query = {};
          (action.keepQuery || []).forEach((key) => {
            if (this.$route.query[key]) query[key] = this.$route.query[key];
          });
          // ⚠ 访问上下文下用 visitRoute 改写落点（Index→/user/:id、Column/Message/About→?uid=），
          //   否则「返回板块导航 / 看全部文章」这类按钮会把访问对象丢掉
          this.$router.push(this.visitRoute({ name: action.name, query }));
          break;
        }
        case "retry": {
          // 「重试」= 用路由跳回出事那个页面，让它的首屏请求重跑一遍。
          //
          // ⚠ 刻意不用 window.location.reload()：
          //   整页重载一定会白屏闪一下（首页、板块页都一样，与目标无关），
          //   而且重载等于「整站重启」，用户看到的是一次抖动、不像「重试」；
          //   换成路由回去 = 组件重新挂载并重新请求（Index 有 activated 补拉兜着），
          //   失败就再次落回本页 —— 全程没有白屏。
          //   真要「整页重载」的场景（比如想重置整个应用状态）用下面的 reload 分支。
          const from = this.$route.query.from;
          this.$router.replace(from || { name: "Index" });
          break;
        }
        case "reload": {
          // 整页重载（会白屏闪一下，慎用）。⚠ 必须先把地址改回 from，否则重载的
          const from = this.$route.query.from;
          if (from) {
            // 必须用 history.replaceState，不能用 location.replace(...#from)
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${window.location.search}#${from}`
            );
          } else {
            // 没带 from（比如手输 /lost?state=loadFailed，或调用方漏传）：
            // 没有可重试的目标，退化成回主页
            this.$router.replace({ name: "Index" });
            return;
          }
          window.location.reload();
          break;
        }
        case "back":
          this.$router.back();
          break;
        case "login":
          this.$store.dispatch("modal/open", "login");
          break;
        default:
          // 配置表里 type 写错时留个痕迹，但不让页面崩
          console.warn("[Lost] 未识别的 action.type:", action.type);
      }
    },
  },
};
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// ===== 卡片：顶栏要「贴边整条色块」 =====
// el-card 默认给 header/body 各留 24px 内边距，顶栏就贴不到卡片边缘（原项目是 .blog-card 的 padding:0）
.el-card.blog-card.blog-lost--wrap
  .el-card__header
    padding: 0
  .el-card__body
    padding: 0

#lost
  margin-bottom: $theme-spacing['2xl']

// ===== 顶栏：返回键 + 标题 =====
.blog-lost--header
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

.blog-lost--back
  display: flex
  align-items: center
  justify-content: center
  width: 36px
  height: 36px
  margin-right: $theme-spacing.base
  border-radius: 50%
  // 同 Column.vue 的 .blog-column--back：写死 #fff 在深色下是顶栏上的一块白斑
  background-color: var(--theme-bgc-card)
  color: var(--theme-font-fst)
  cursor: pointer
  transition: all 0.2s ease

  &:hover
    box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.2)
    transform: translateY(-2px)

// ===== 主体 =====
.blog-lost--body
  display: flex
  flex-direction: column
  align-items: center
  padding: 48px $theme-spacing.base
  gap: $theme-spacing.lg

.blog-lost--title
  font-size: $theme-fz.xl
  font-weight: 700
  color: var(--theme-font-fst)
  text-align: center

.blog-lost--subtitle
  font-size: $theme-fz.base
  color: var(--theme-font-light)
  text-align: center

// ===== 插图卡片 =====
.blog-lost--imgCard
  background-color: var(--theme-bgc-card)
  border-radius: $theme-radius.md
  padding: $theme-spacing.base
  box-shadow: $theme-shadows.base

  img
    display: block
    width: 70%
    max-width: 360px
    // ⚠ cover 会裁掉超出比例的部分：比例越极端的图裁得越多
    // 若发现内容被裁，把 object-fit 换成 contain 即可（白底图 + 白卡片，留白看不出来）。
    aspect-ratio: 16 / 9
    object-fit: cover
    object-position: center
    margin: 0 auto
    border-radius: $theme-radius.xs

// ===== 主 CTA =====
// 与 Write.vue 的 .blog-write--btn 同一套做法：用原生 button 而不是 el-button，
// 省掉与 element 默认 padding/边框/配色的对抗
.blog-lost--writeBtn
  display: inline-flex
  align-items: center
  gap: $theme-spacing.sm
  padding: $theme-spacing.base $theme-spacing.xl
  border: none
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-deepBtn)
  color: var(--theme-font-fst)
  font-size: $theme-fz.lg
  cursor: pointer
  transition: all 0.2s ease

  &:hover
    background-color: var(--theme-font-sec)
    color: #fff
    box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.15)
    transform: translateY(-2px)

  // 按钮内图标尺寸（原来挂在 .blog-lost--writeIcon 上，但那个静态类会破坏
  // Element 图标的 [class^=el-icon-] 匹配，所以改成打在后代 i 上）
  i
    font-size: $theme-fz.lg
</style>
