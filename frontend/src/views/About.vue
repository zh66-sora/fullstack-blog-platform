<template>
  <!--
    关于（/about）—— 当前用户的「时间线」展示页

    需求来源：Desktop/todo/计划.md 第 61-80 行「时间线模块」
      页头的「个人」这一格换成「关于」，点击后显示当前用户的时间轴。

    三档布局（断点与 Home.vue 的两条媒体查询严格互补，见 NARROW_QUERY 的注释）：
      · 大屏   >1280   ：main 最宽（≈724 布局像素）→ 左右交替双列，中线在正中
      · 中屏   992~1280：main 被 aside 挤压（最窄 ≈460）→ 线移到左侧、单列、
                        标题单独一行插在「年份」与「月日」之间
      · 小屏   ≤991    ：aside 下沉、main 重新变宽 → 回到双列
    ⚠ 为什么「中屏单列」由 JS（isNarrow）而不是纯 CSS 媒体查询决定：
      两种形态的**节点结构不一样**（双列时标题在另一侧、单列时标题在内容区里），
      不是同一棵 DOM 换几行样式就行 —— 用 CSS 硬做要渲染两份标题再按断点藏一份。

    滚动：滚动条在卡片**内部**（.blog-about--viewport 固定高 + overflow-y:auto）。
      「正在显示」= 离视口中线最近的那一个节点：它不透明、内容区上移让年份压住图片底边；
      其余节点降透明度。判定与过渡全在 about.styl 里，JS 只负责算出 activeIndex。
  -->
  <el-card id="about" class="blog-card blog-about--wrap" shadow="never">
    <!-- 顶栏：返回键 + 标题（复用全局 .blog-write--header，与博客管理/个人中心同款） -->
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        :title="text.backTip"
        @click="goBack"
      ></span>
      <h3>{{ text.title }}</h3>
    </div>

    <!--
      ⚠ 背景图要放在**滚动容器外面**（这一层 stage 才是 overflow:hidden 的那个）：
        放进 .blog-about--viewport 里的话，它是滚动内容的一部分 —— 往下滚背景就跟着走了。
        放外面 + 绝对定位铺满，视觉上等同于「背景跟着视口走」。
    -->
    <div class="blog-about--stage">
      <!-- 整页面背景图（作用域 = main 里的这块视口，不盖页头/横幅/侧栏） -->
      <div
        v-if="backgroundImage"
        class="blog-about--backdrop"
        :style="{ backgroundImage: `url(${backgroundImage})` }"
      ></div>

      <!-- 时间线视口：内置滚动条，滚动事件只在这一层 -->
      <div
        ref="viewport"
        class="blog-about--viewport"
        :class="{ 'is-narrow': isNarrow }"
        @scroll.passive="onScroll"
      >
        <ul class="blog-about--track">
          <li
            v-for="(node, index) in nodes"
            :key="index"
            class="blog-about--node"
            :class="[
              index % 2 === 0 ? 'is-left' : 'is-right',
              { 'is-active': index === activeIndex },
            ]"
          >
            <!-- 主轴：图片在上、内容区在下（左右交替的那一半） -->
            <div class="blog-about--main">
              <div class="blog-about--figure">
                <!-- 图挂了（URL 失效 / 文件被删）时给块占位，别让页面中间立一个破图标 -->
                <div v-if="broken[index]" class="blog-about--figure_fallback">
                  <i class="iconfont icon-picfill"></i>
                </div>
                <img
                  v-else
                  :src="node.backgroundImage"
                  :alt="node.title"
                  @error="onImgError(index)"
                >
              </div>

              <div class="blog-about--content">
                <!-- 年份：大字号。当前节点整体上移，让它一半压在图片下沿上 -->
                <div class="blog-about--year">{{ node.year }}</div>

                <!-- 中屏：标题单独一行，插在年份与月日之间 -->
                <div v-if="isNarrow" class="blog-about--title_inline">{{ node.title }}</div>

                <div class="blog-about--monthday">{{ node.monthDay }}</div>
                <p class="blog-about--desc">{{ node.description }}</p>
              </div>
            </div>

            <!-- 对侧：标题居中（只在双列形态出现） -->
            <div v-if="!isNarrow" class="blog-about--aside">
              <h4 class="blog-about--title">{{ node.title }}</h4>
            </div>

            <!-- 中线上的节点圆点 -->
            <span class="blog-about--dot"></span>
          </li>
        </ul>
      </div>
    </div>
  </el-card>
</template>

<script>
import throttle from "lodash/throttle";
import { mapGetters, mapActions } from "vuex";
import store from "store";
import { TIMELINE_TEXT } from "@/config/timeline.config";
import { buildTimelineNodes } from "@/utils/timelineUtils";
import { goLost } from "@/utils/lost";
// 「我现在看的是谁的主页」—— 时间线看「被访问用户 / 自己」
import visitContext from "@/mixins/visitContext";

/**
 * 「单列」这档的宽度区间。
 *
 * ⚠ 这两个数字不是拍出来的，是 Home.vue 那两条媒体查询的补集：
 *     `max-width: 1280px` → .el-row 从固定 1024 变成 100%，main 开始被 aside 挤压
 *     `max-width: 991px`  → aside 下沉到正文之后，main 重新占满整行
 *   所以「被挤压」正好就是 992~1280 这一段。
 *   body 有 min-width 兜着，991 以下不会再窄回「单列」的区间。
 */
const NARROW_QUERY = "(min-width: 992px) and (max-width: 1280px)";

/** 滚动判定节流窗口（ms）：比一帧长一点，滚动过程中不重算太多次 */
const SCROLL_THROTTLE = 80;

export default {
  name: "About",
  // visitedUserId / isVisitContext / isLogin 等
  mixins: [visitContext],
  data() {
    return {
      text: TIMELINE_TEXT.about,

      /** 整页面背景图 URL */
      backgroundImage: "",
      /** 节点列表（已按年月日升序，且带 year / monthDay） */
      nodes: [],

      /** 离视口中线最近的那个节点 */
      activeIndex: 0,
      /** 图片加载失败的节点下标（key 是下标 → 用对象当 Set，Vue 2 直接改数组下标不响应） */
      broken: {},

      /** 当前是否处于「中屏单列」形态 */
      isNarrow: false,
    };
  },
  computed: {
    ...mapGetters("http", ["userInfo"]),
    /**
     * 要读谁的时间线：优先 localStorage 的 uid（刷新后还在），回退 userInfo
     * —— 与 Manage.vue / CommentSection 同一口径
     */
    currentUserId() {
      return store.get("uid") || this.userInfo?.data?._id || null;
    },
    /**
     * 展示对象：他人主页下是被访问用户（?uid=），否则是登录用户自己。
     * 取不到（游客直接访问 /about 且没带 ?uid=）→ 空串 → 落到兜底页。
     */
    targetId() {
      return this.visitedUserId || this.currentUserId || "";
    },
  },
  watch: {
    /**
     * 访问对象变了（/about ↔ /about?uid=xxx，路由名不变、组件不重建）→ 重拉一遍。
     * ⚠ 这里只盯 visitedUserId，不盯 currentUserId：后者「刷新后 uid 后到」的情况
     *   由 mounted 里的 `await getUserInfo()` 兜住，两个一起盯会双发一次请求。
     */
    visitedUserId() {
      this.resetAndFetch();
    },
    /** 形态切换会改布局（一半的节点结构都换了），要重新算一次当前节点 */
    isNarrow() {
      this.$nextTick(this.updateActive);
    },
  },
  async mounted() {
    // 滚动监听：节流 + 尾沿触发，停下来能算最后一次
    this.throttledUpdate = throttle(this.updateActive, SCROLL_THROTTLE);
    window.addEventListener("resize", this.handleResize);

    // 形态判定用 matchMedia 而不是「监听 resize 后自己比宽度」——
    // 前者与 CSS 媒体查询同源，不会出现两边算歪
    this.mq = window.matchMedia(NARROW_QUERY);
    this.isNarrow = this.mq.matches;
    this.mqHandler = (event) => {
      this.isNarrow = event.matches;
    };
    // Safari 14 以下只有旧的 addListener
    if (this.mq.addEventListener) this.mq.addEventListener("change", this.mqHandler);
    else this.mq.addListener(this.mqHandler);

    // ⚠ 刷新后 userInfo 是空的，先把 uid 补出来（顺序不能反，否则这一页会空跑一次请求）
    if (!this.targetId && this.isLogin) await this.getUserInfo();
    // 游客直接访问 /about（没带 ?uid=）→ 没有可展示的对象，落到兜底页
    if (!this.targetId) return goLost(this, "notFound");

    await this.fetchTimeline(this.targetId);
  },
  beforeDestroy() {
    window.removeEventListener("resize", this.handleResize);
    if (this.throttledUpdate) this.throttledUpdate.cancel();
    if (this.mq) {
      if (this.mq.addEventListener) this.mq.removeEventListener("change", this.mqHandler);
      else this.mq.removeListener(this.mqHandler);
    }
  },
  methods: {
    ...mapActions("http", ["getUserInfo"]),

    // ═══════════ 数据 ═══════════

    /**
     * 拉某用户的时间线（GET /api/timeline/:userId，公开可读）
     *
     * 三种「没内容」的区分（后端刻意做成不同的返回，见 routes/timeline.js 的说明）：
     *   请求成功但 items 为空 + 是本人 → timelineEmpty     （带「去时间线管理」）
     *   请求成功但 items 为空 + 是别人 → timelineEmptyOther（别人没配过，不能替 TA 去管理）
     *   请求失败                         → loadFailed       （带「重试」）
     */
    async fetchTimeline(uid) {
      const res = await this.$api({ type: "getTimeline", params: { userId: String(uid) } });
      if (!res?.data) return goLost(this, "loadFailed");

      const nodes = buildTimelineNodes(res.data);
      if (!nodes.length) {
        return goLost(this, res.data.isSelf ? "timelineEmpty" : "timelineEmptyOther");
      }

      this.backgroundImage = res.data.backgroundImage || "";
      this.nodes = nodes;
      this.activeIndex = 0;
      this.broken = {};

      // 等 DOM 铺好再算「当前是哪个节点」，否则量到的都是 0
      this.$nextTick(this.updateActive);
    },

    /** 访问对象切换时：清掉旧数据再重拉（见 watch visitedUserId） */
    resetAndFetch() {
      this.nodes = [];
      this.backgroundImage = "";
      this.broken = {};
      if (this.targetId) this.fetchTimeline(this.targetId);
    },

    // ═══════════ 滚动 → 当前节点 ═══════════

    onScroll() {
      this.throttledUpdate();
    },

    handleResize() {
      this.throttledUpdate();
    },

    /**
     * 找出「离视口中线最近」的节点
     *
     * 量的是节点**整体**的中心（图片 + 内容区）而不是图片的：内容区也有高度，
     * 只看图片的话，「图刚露头、文字还在屏幕外」时就会被判成当前节点。
     */
    updateActive() {
      const viewport = this.$refs.viewport;
      if (!viewport) return;

      const box = viewport.getBoundingClientRect();
      const middle = box.top + box.height / 2;

      const els = viewport.querySelectorAll(".blog-about--node");
      if (!els.length) return;

      let best = 0;
      let bestDistance = Infinity;
      els.forEach((el, index) => {
        const rect = el.getBoundingClientRect();
        const distance = Math.abs(rect.top + rect.height / 2 - middle);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      this.activeIndex = best;
    },

    onImgError(index) {
      this.$set(this.broken, index, true);
    },

    // ═══════════ 其它 ═══════════

    // 返回主页（与板块页 / 写博客页的返回键一致）
    // ⚠ 他人主页下返回的是「被访问用户的列表页」，不是自己的首页（visitRoute 见 mixins/visitContext.js）
    goBack() {
      this.$router.push(this.visitRoute({ name: "Index" }));
    },
  },
};
</script>

<style lang='styl'>
// 时间线的样式只在这一页用，跟着组件注入，不进 main.js 的全局层
// （与 Info.vue 引 profile.styl 同一个做法）
@import '../assets/css/about.styl'
</style>
