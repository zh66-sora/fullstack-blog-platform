<template>
  <div id="index">
    <!-- 搜索面板：常驻首页。改任何一项 = 改 URL query = 首页重新取数，
         所以它和下面的卡片列表永远看的是同一份筛选条件 -->
    <SearchPanel :filters="filters" @update="handleFilterUpdate" />

    <!-- 文章列表：有封面 → ArticleCardPic（封面在右），无封面 → ArticleCard -->
    <!-- 两种卡片就是原模板里 if/else coverImage 的两条分支 -->
    <component
      v-for="item in list"
      :is="item.hasCover ? 'ArticleCardPic' : 'ArticleCard'"
      :key="item.id"
      :article="item"
      @like="handleLike(item)"
    />

    <!-- 加载中占位：切换板块时旧卡片已被清掉，用一张等宽卡片顶着，页面不会「空一下再长出来」 -->
    <!-- ⚠ 本页**不再有空态卡片**：「一篇文章都没有」交给全局兜底页的 empty 状态
         （见 fetchArticleList 末尾的 goLost），避免请求失败时静默渲染成「暂无文章」 -->
    <el-card v-if="loading && !list.length" class="blog-card" shadow="never">
      <div slot="header" class="blog-card--header">
        <h3>加载中</h3>
      </div>
      <div class="blog-card--info">
        <p class="blog-introduction--article">正在加载文章…</p>
      </div>
    </el-card>

    <!-- 分页器：列表网格的最后一项，与卡片同宽对齐（宽度由 #index 的 1 列网格决定）
         只有 1 页时不渲染 —— 翻页没有意义，也避免「共 1 页」的空控件 -->
    <Pager
      v-if="pages > 1"
      :page="page"
      :pages="pages"
      @change="handlePageChange"
    />
  </div>
</template>

<script>
import ArticleCard from "@/components/article/ArticleCard.vue";
import ArticleCardPic from "@/components/article/ArticleCardPic.vue";
import Pager from "@/components/base/Pager.vue";
import SearchPanel from "@/components/search/SearchPanel.vue";
import mixins from "@/mixins";
// 「我现在看的是谁的主页」—— 他人主页下列表只显示 TA 的博客
import visitContext from "@/mixins/visitContext";
import { mapGetters, mapState } from "vuex";
import { buildArticleListViewModel } from "@/utils/articleUtils";
import {
  parseFilters,
  toRequestParams,
  buildQuery,
  filterKey as filterKeyOf,
  hasActiveFilters,
} from "@/utils/searchParams";
import {
  getScrollTop,
  setScrollTop,
  scrollToContentTop,
  afterPageSwap,
} from "@/utils/scroll";
import { goLost } from "@/utils/lost";

// 每页条数：服务端真分页，由这个常量透传给后端（?size=5）
const PAGE_SIZE = 5;

export default {
  name: "Index",
  components: { ArticleCard, ArticleCardPic, Pager, SearchPanel },
  // 复用项目里的 openDialog（未登录点赞时弹登录框）+ visitedUserId / isVisitContext
  mixins: [mixins, visitContext],
  data() {
    return {
      // 分页信息 + 卡片列表（list 只是「当前页」的那几条，不再是一次性全量）
      listData: { total: 0, page: 1, pages: 1, list: [] },
      // 每页条数，随请求发给后端
      pageSize: PAGE_SIZE,
      // 加载中：用来兜住空态 —— 首次进入时 list 还是空的，
      // 不挡一下会先闪一张「暂无文章」再被真实数据替换
      loading: false,
      // 离开列表页时的纵向滚动位置。
      // 存 → beforeRouteLeave（拿得到真值），取 → activated（keep-alive 的进入钩子）；
      // 和 listData 一样，靠组件实例被缓存下来而"活过"路由切换。
      scrollTop: 0,
      // 是否已经历过首次 activated（首次那次不还原滚动位置，见 activated 里的说明）
      firstActivated: false,
      // 上次「落定」时的筛选指纹 —— 用来判断这次进入列表页内容是不是换了一批
      // （换了 → 归位到正文顶；没换 → 还原 scrollTop），详见 syncEnterScroll
      filtersAtLeave: "",
    };
  },
  computed: {
    ...mapGetters("http", ["isLogin"]),
    // 详情页写进来的点赞结果（见 store/modules/article.js）
    ...mapState("article", ["reactions"]),
    /**
     * 当前筛选条件：来自路由 query
     *
     * 板块导航点进来 → ?category=<id>；头部搜索 → ?q=<关键词>；
     * 搜索面板改条件 → 同一批 query 键。三种入口最终都汇到这里，
     * 所以「板块过滤」和「搜索」在本页是同一件事：一批过滤条件。
     *
     * 直接从 $route 派生，不再另存一份 state —— 路由一变它自己就变。
     */
    filters() {
      return parseFilters(this.$route.query);
    },
    /**
     * 筛选指纹：watch 用它判断「条件换没换」
     * filters 每次都是新对象（computed 重算），直接 watch 它要开 deep，
     * 而这里只需要一个「变/没变」的信号 —— 拼成字符串最省也最好调试。
     * ⚠ 追加访问对象：从 /user/A 切到 /user/B 时 query 没变，但内容该换了，
     *   不把 uid 拼进来这个 watch 就感知不到。
     */
    filterKey() {
      return `${filterKeyOf(this.filters)}|uid:${this.visitedUserId}`;
    },
    list() {
      return this.listData.list;
    },
    // 当前页 / 总页数 —— 都以后端分页结果为准，交给 Pager 渲染
    page() {
      return this.listData.page;
    },
    pages() {
      return this.listData.pages;
    },
  },
  created() {
    // ⚠ 只在「首次创建」时跑一次。
    //   Home.vue 用 <keep-alive include="Index"> 把本组件缓存住了，
    //   离开列表页只是 deactivated、并不销毁 → 回来时 created 不会重跑，
    //   也就不会重新请求：「已经请求到的文章」正是这么保留下来的。
    this.fetchArticleList(1);
  },

  watch: {
    /**
     * 筛选条件变化 → 重新拉第 1 页
     *
     * ⚠ 必须有这条：本页被 keep-alive 缓存（Home.vue 的 include="Index,Write"），
     *   从 ?category=A 切到别的板块、改关键词、换排序……组件实例都不会重建、
     *   created 不会重跑 —— 不 watch 的话会一直显示上一次的结果。
     *
     * 页码一律回到第 1 页：过滤换了就是换了一批内容，
     * 沿用旧页码还有可能越界（过滤后总页数变少）。
     */
    filterKey() {
      // ⚠ 先把上一次的结果清掉，再发请求。
      this.listData = { total: 0, page: 1, pages: 1, list: [] };
      this.fetchArticleList(1);
      this.syncEnterScroll();
    },

    /**
     * 详情页赞 / 踩之后回到列表，这一页被 keep-alive 缓存着、不会重新请求，
     * 全靠这条 watch 把对应那张卡片的图标与计数改对（原来靠总线 article:reaction）。
     *
     * 浅 watch 就够：SET_REACTION 每次都整体替换一个新对象（见 store/modules/article.js），
     * 引用变了必然触发 —— 不需要 deep，新增记录也不会漏掉。
     */
    reactions() {
      this.syncCards();
    },
  },

  // ===== 滚动位置的存 / 取 =====

  /**
   * 离开列表页：存下这一刻的滚动位置。
   *
   * ⚠ 必须写在「路由守卫」里，不能放进 deactivated —— 实测（Chrome + puppeteer）：
   *   走到 deactivated 时，DOM 早被新路由替换完了，document 高度从 2095 掉到 700，
   *   浏览器已经把滚动位置夹断成 0，这时读到的是 0 而不是真实值 1200。
   *   而 beforeRouteLeave 在导航被确认之前执行：旧 DOM 还在、高度还是 2095、
   *   scrollY 就是 1200 —— 这是唯一能拿到真值的时机。
   *   （也不能在 deactivated 里"顺手兜底再存一次"：它比守卫晚，会把真值覆盖成 0。）
   */
  beforeRouteLeave(to, from, next) {
    this.scrollTop = getScrollTop();
    // 同时记下「离开时看的是哪一批筛选」——回来时据此判断这次要不要还原位置
    this.filtersAtLeave = this.filterKey;
    next();
  },

  /**
   * 回到列表页：把滚动位置还原（keep-alive 的「进入」钩子）。
   *
   * ⚠ 首次挂载后也会触发一次（keep-alive 的既有行为），此时 scrollTop 还是初始值 0，
   *   等价于「进列表页从头看」—— 从滚到一半的详情页点回主页时正是要这个效果。
   */
  activated() {
    /**
     * ⚠ 首次激活（页面刚加载完那一次）**不动**滚动位置。
     *
     * keep-alive 在首次挂载后也会触发一次 activated，此时 this.scrollTop 还是初始值 0，
     * 我们 setScrollTop(0) 会把页面拽到 window 顶部（那张整屏横幅）；
     * 而浏览器随后还要执行「恢复上一次的滚动位置」（刷新 / 重载的默认行为）—— 又拽回去。
     * 一先一后，就是进页面时「先跳到顶部、再回到原处」的那下闪烁。
     *
     * 刷新（F5、兜底页的「重新加载」）时把位置交给浏览器，才是用户预期的行为；
     * 我们这套「存 / 取」只负责站内跳转（详情页 ↔ 列表页）。
     */
    if (!this.firstActivated) {
      this.firstActivated = true;
      return;
    }
    // ⚠ 本页被 keep-alive 缓存：回来时组件不重建、created 不重跑，也就不会重新请求。
    //   上一次进来若是失败的（列表为空），就会一直停在那时的状态 —— 点「首页」看到的
    //   还是旧的空白/空态。这里补拉一次，让「点首页」和「刷新」表现一致
    //   （再失败会走 goLost → 兜底页）。
    if (!this.listData.list.length) this.fetchArticleList(1);
    // 该滚到哪交给 syncEnterScroll 统一决定（它和 filterKey watcher 谁先跑都不影响结果）
    this.syncEnterScroll();
  },
  methods: {
    /**
     * 拉取某一页的文章列表：GET /articles/search?q=&authorName=&category=&…&page=&size=
     *
     * ## 为什么统一走搜索接口，不再用通用 CRUD 的列表接口
     *   首页的「列表」和「搜索」本质是同一件事：按一批条件取一页文章。
     *   原先分两条路（板块过滤 → /api/rest/article，关键词 → /articles/search）
     *   会让「点板块」和「搜关键词」出现两套分页口径和两套排序，
     *   而搜索接口支持全部筛选项（q / authorName / category / 日期 / 排序）+ 真分页，
     *   一个条件都不传时就是「全量列表」，正好覆盖原先的列表场景。
     *   代价只有一个：默认排序从「自然顺序」变成 publishDate 倒序（后端默认值）。
     *
     * ## 参数
     *   toRequestParams 负责筛选 → 接口参数（含 timePreset → 具体日期的换算）
     *   page / size 由分页状态给；⚠ size 必须显式传 —— 后端默认 100，
     *   不传会一次拉 100 条，Pager 的页数和滚动体验全对不上。
     *
     * 接口不返回「当前用户的点赞态度」，所以拿到文章后还要再补一轮
     * （见 fetchReactionMap）—— 顺序是：先文章、再态度、最后一次性 buildViewModel，
     * 避免卡片先渲染成描边再跳成实心。
     *
     * @param {number} page — 目标页码，从 1 开始
     */
    async fetchArticleList(page = 1) {
      this.loading = true;
      try {
        // ⚠ 他人主页下把访问对象作为 authorId 精确过滤（不是 authorName 模糊匹配），
        //   见 Manage.vue 里那条「昵称互为子串会串号」的实测注释。
        const params = toRequestParams(this.filters, {
          page,
          size: this.pageSize,
        });
        if (this.visitedUserId) params.authorId = String(this.visitedUserId);

        const res = await this.$api({
          type: "searchArticles",
          data: params,
        });
        // ⚠ http.js 的失败分支**不 reject**（那行 `Promise.reject(error)` 是注释掉的），
        //   失败时 $api 会 resolve 出 undefined —— 所以「拿不到 data」要自己判成失败，
        //   否则会静默渲染成「暂无文章」空态，兜底页永远不触发。
        if (!res?.data) return this.handleFetchFailed(page);
        // res 是后端信封 { message, data }，data 才是分页对象 { list, total, page, pages }
        const reactionMap = await this.fetchReactionMap(res.data.list);
        this.listData = buildArticleListViewModel(res.data, reactionMap);
        // ⚠ 请求成功但一条都没有 → 交给兜底页
        //   （本页已经没有「暂无文章」空态卡片了，不能在这里静默留白）
        if (!this.listData.list.length) this.handleEmptyResult();
      } catch (err) {
        // 兜底：万一将来 http.js 改成正常 reject，这里也接得住
        this.handleFetchFailed(page);
      } finally {
        this.loading = false;
      }
    },

    /**
     * 进入列表页时该滚到哪 —— **全页唯一决定滚动的地方**
     *
     *   筛选变了（板块页点进来、改了搜索条件、或从带筛选的列表点「首页」）
     *     → 内容整批换了，旧位置没意义 → 正文最上方
     *   筛选没变（详情页返回列表）→ 还原上次离开时的位置
     *
     * ⚠ 必须幂等：keep-alive 下 `activated` 与 `filterKey` watcher 的先后顺序不确定，两边都会调它 ——
     *   所以「目标」在这里**同步**算好（同一次进入里两次调用读到的是同一个基准），
     *   基准的更新放进 nextTick（等两个调用都过去了才改）。
     *   于是无论谁先谁后，滚到的都是同一个位置，不会再出现「先跳到 A、再跳到 B」的两段滚动。
     */
    syncEnterScroll() {
      const changed = this.filterKey !== this.filtersAtLeave;
      this.$nextTick(() => {
        // ⚠ 还要等旧页面退场结束（afterPageSwap）：本方法会被 filterKey watcher 与 activated
        //   各调一次，其中 watcher 那次落在退场帧上 —— 那一帧旧页面还在、透明度还是 1，
        //   在这里还原/归位，用户看到的就是「滚动条先跳一下，再淡出淡入」。
        //   实测（headless Chrome 逐帧采样，/article/1080 → 带筛选列表）：不改的话
        //   t=14ms 就跳了；改完变成新页面插入那一帧（opacity 还是 0）才动。
        afterPageSwap(() => {
          this.filtersAtLeave = this.filterKey;
          if (changed) {
            // 正文最上方 = el-main 的顶（口径见 utils/scroll.js），不是 window 顶部（那里是整屏横幅）
            scrollToContentTop();
          } else {
            setScrollTop(this.scrollTop);
          }
        });
      });
    },

    /**
     * 列表拉取失败的统一出口
     *   首屏（第 1 页、且还没拿到任何数据）→ 整页兜底（loadFailed，能重试）
     *   翻页失败 → 留在原地（保留当前这一页，别清空 —— 本页已经没有空态卡片了）
     * @param {number} page — 本次请求的目标页码
     */
    handleFetchFailed(page) {
      if (page === 1 && !this.listData.list.length) {
        goLost(this, "loadFailed");
        return;
      }
      // 翻页失败：留着当前这一页（网络层已弹提示）。
      // ⚠ 不要清空 —— 本页已经没有空态卡片了，清空只会变成一片空白
    },

    /**
     * 请求成功、但一条都没有 —— 按「用户有没有设筛选」分流兜底文案
     *
     *   有筛选 → searchEmpty：「没搜到」是筛选太窄，用户还要回去改条件
     *   没筛选 → empty：板块下没文章 / 全站还没文章（带上 category 才能显示「XX 板块」）
     *
     * ⚠ 两者都走 utils/lost.js 的 goLost（replace + from），
     *   所以兜底页的「返回」能回到出事前的那个地址。
     */
    handleEmptyResult() {
      if (hasActiveFilters(this.filters)) {
        goLost(this, "searchEmpty", { q: this.filters.q || "" });
        return;
      }
      // 他人主页下：没有「去写一篇」这回事（你不能替 TA 写），走无 CTA 的 emptyOther
      if (this.visitedUserId) {
        goLost(
          this,
          "emptyOther",
          this.filters.category ? { category: this.filters.category } : {}
        );
        return;
      }
      goLost(
        this,
        "empty",
        this.filters.category ? { category: this.filters.category } : {}
      );
    },

    /**
     * 搜索面板改了某一项 → 写进 URL query
     *
     * ⚠ 这里不发请求：query 一变，`filterKey` watcher 会接管重新取数。
     *   让「改条件」只有一个出口（URL），避免出现「面板改了但列表没刷新」这类分叉。
     *
     * mode（第二个参数，默认 'push'）：
     *   'push'    点按钮 / 回车这类明确动作 → 留一条历史，方便后退
     *   'replace' 面板作者框的防抖自动搜 → 覆盖当前记录
     *             （不覆盖的话，输一串作者名会在历史里堆一串中间态）
     * ⚠ catch：连点同一个按钮会撞 vue-router 3 的 NavigationDuplicated（重复导航），
     *   不拦会在控制台抛未捕获的 rejection。
     */
    handleFilterUpdate(patch, mode = "push") {
      const go = mode === "replace" ? this.$router.replace : this.$router.push;
      // ⚠ 不能写死 name: "Index"：他人主页下本组件是 UserHome 渲染的，
      //   此时 $route.name 是 "UserHome"，写死 Index 会把访问上下文丢掉（跳回全站列表）。
      //   用当前路由名 + 现有 params，query 走 buildQuery（只留筛选白名单里的键）。
      go.call(this.$router, {
        name: this.$route.name,
        params: this.$route.params,
        query: buildQuery(this.$route.query, patch),
      }).catch(() => {});
    },

    /**
     * 批量查当前页每篇文章的点赞态度 → { [id]: 'liked' | 'disliked' | 'none' }
     *
     * 为什么必须单独查：GET /api/rest/article 是通用 CRUD，不带用户维度的字段。
     * 原项目也是这么干的（articleBus.renderArticleList 里 Promise.allSettled 逐个查
     * getArticleReaction，拼成 reactionMap 再交给 viewModel）。
     *
     * 未登录时后端统一按匿名返回 'none'，所有图标本来就该是描边的 —— 直接跳过，
     * 省下「每页 5 个」的无用请求。
     *
     * @param {Array} list — 后端返回的原始文章数组
     * @returns {Promise<object>} reactionMap
     */
    async fetchReactionMap(list = []) {
      if (!this.isLogin || !list.length) return {};
      const results = await Promise.allSettled(
        list.map((item) =>
          this.$api({ type: "getArticleReaction", params: { id: item._id } })
        )
      );
      return results.reduce((map, r, i) => {
        // 单个失败不影响整页：那一条按 'none' 处理
        if (r.status === "fulfilled") {
          map[list[i]._id] = r.value?.data?.userReaction || "none";
        }
        return map;
      }, {});
    },

    /**
     * 列表卡片点赞：POST /articles/likes/:id
     * 后端 toggle 后回 { likeNum, dislikeNum, userReaction }，
     *
     * 结果不在这里直接改 item，而是和详情页走同一条链路写进 store
     * （article/syncReaction）—— 上面 watch 到 store 变了再回写卡片。
     * 好处是「谁赞的、赞成了什么样」全站只有一个来源；代价是多绕一跳，
     * 但这一跳是同步的，用户看不出差别。
     *
     * 对应原实现 actionControl 的 ⑭ [data-action="like-article-list"]
     */
    async handleLike(item) {
      if (!this.isLogin) {
        this.openDialog("login");
        return;
      }
      const res = await this.$api({
        type: "likeArticle",
        params: { id: item.id },
        data: { type: "like" },
      });
      const data = res?.data;
      if (!data) return;
      this.$store.dispatch("article/syncReaction", {
        id: item.id,
        reaction: data.userReaction,
        likeNum: data.likeNum,
      });
    },

    /**
     * 文章详情页点赞后同步本页卡片（详见上面 watch 的说明）
     * 只改「列表里有记录的」那几条：找不到（比如赞的是别的页的文章）就跳过
     */
    syncCards() {
      this.listData.list.forEach((item) => {
        const record = this.reactions[item.id];
        if (!record) return;
        item.userReaction = record.reaction || "none";
        if (typeof record.likeNum === "number")
          item.stats.likes = record.likeNum;
      });
    },

    // 分页器抛出的换页事件 → 重新请求目标页
    handlePageChange(next) {
      if (next === this.page) return;
      this.fetchArticleList(next);
    },

    // ---- 滚动位置存取 ----
    // 整页滚动（Home.vue 把 el-main 设成了 overflow: visible，滚动条在 window 上），
    // 取和还都走 utils/scroll.js —— 与路由切换的归位共用同一个口径
    // （本页是路由归位的唯一例外：router/index.js 的 afterEach 会跳过 Index）
  },
};
</script>

<style lang='stylus'>
@import '../assets/css/themes.styl'

// ============================================================
// 文章列表（迁移自原项目 src/styl/index.styl + article.styl）
//
// ⚠ 本文件所有声明统一写成「属性: 值」的带冒号形式。
// Stylus 对「无冒号 + 值是多段」的声明有歧义：若紧跟缩进更深的嵌套块，
// 会被当成选择器解析、整条静默丢失（编译不报错）。
//
// ⚠ 断点：原项目用 ≤768px，新项目统一到 Element 的断点 ——
// Element 的 xs 是 max-width:767px，所以下面用 767px。
// ============================================================

// ===== 列表容器（取代原项目 main > .row > article）=====
#index
  display: grid
  grid-template-columns: 1fr
  gap: $theme-spacing.base
  align-items: start
  align-content: start
  text-align: left
  // 列表（含末尾分页器）底部的留白：
  // el-main 的 padding 已被 Home.vue 归零，底部间距只能由这里给，
  // 否则最后一张卡片 / 分页器会直接贴到 footer 上
  margin-bottom: $theme-spacing['2xl']

  // 整张卡片可点进详情页，所以给个手型光标
  // （标题上的 cursor: pointer 见下面 #index .blog-card--header）
  .blog-card
    cursor: pointer

// ===== 卡片头部：文章标题 =====
// 基样式在 assets/css/component.styl，这里是列表页专属的覆盖，
// 用 #index 限定作用域，避免影响到 Aside 里同样用 .blog-card--header 的卡片
#index .blog-card--header

  h3
    font-size: $theme-fz.xl
    font-weight: 700

// ===== 卡片信息区 =====
.blog-card--info
  display: grid
  grid-template-columns: 1fr
  gap: $theme-spacing.sm
  padding: $theme-spacing.base 42px 0 $theme-spacing.xl * 0.5

// 信息行 / 标签 chips 的样式已上移到 assets/css/component.styl ——
// Article.vue 的详情页也要用同一套（.blog-article--info / --tags / .blog-tag--chip_display）

// ===== 操作按钮行 =====
.blog-btn--actions
  display: flex
  justify-content: end

  .blog-btn--habit
    color: var(--theme-font-trd)
    margin-right: $theme-spacing.base

// 可交互项 —— 手型 + hover 跟随主题色
// 「评论」的文字与图标包在 <a> 里，所以 hover 要高亮那一层；
// 「浏览」没有 <a>（纯展示），下面的 .blog-btn--view 里把光标改回默认
.habit-info
  cursor: pointer

  &:hover a
    color: var(--theme-font-fst)

// 浏览：纯展示型元数据，不是按钮 —— 没有 <a>、无手型、也不做 hover 反馈
.blog-btn--view
  .habit-info
    cursor: default

// ===== 无限面卡片：右侧箭头按钮（绝对定位在卡片内）=====
.blog-btn--read_icon
  position: absolute
  top: 50%
  right: $theme-spacing.sm
  width: $theme-spacing.lg * 2
  height: 90%
  transform: translateY(-50%)
  border-radius: $theme-radius.md
  line-height: 100%
  font-weight: 700
  background-color: var(--theme-bgc-lightBtn)
  outline: none

  &:hover
    background-color: var(--theme-bgc-deepBtn)

  a
    outline: none
    display: flex
    align-items: center
    justify-content: center
    height: 100%
    color: var(--theme-font-fst)

// ===== 带封面卡片 =====
.blog-card--pic
  .blog-card--info
    // 右侧留出 256px 给封面图
    padding: $theme-spacing.base $theme-spacing.xl * 8 0 $theme-spacing.xl * 1
    // 封面是绝对定位的：top 30px + height 160px → 下沿在卡片顶部往下 190px。
    // 而操作行（点赞/评论/浏览）紧跟在信息区之后，是普通流里的下一个兄弟。
    // 内容短的时候（没有标签 + 摘要只有一行），操作行会升到 190px 以内，
    // 就被封面（有 z-index: 1）压住了 —— 有标签时内容更高才刚好躲开。
    // 给信息区一个最小高度，把操作行顶到封面下沿之外：
    //   信息区起点 ≈ 24(卡片内边距) + 35(单行标题) ≈ 59
    //   59 + 150 = 209 > 190 ✓ 还留约 19px 间隙
    min-height: 150px
    // 内容不足 150px 时，让几行保持内容高度、多余空白留在底部；
    // 否则 grid 默认的 align-content: stretch 会把这几个行拉开
    align-content: start

  // 封面卡片的信息区更窄（右侧让出 256px），恒为两列 ——
  // 选择器权重高于上面那条 ≥1200px 的媒体查询（媒体查询不增加权重），所以宽屏也不变
  .blog-article--info
    grid-template-columns: repeat(2, minmax(0, 1fr))

  .blog-btn--read_link
    position: absolute
    right: 10px
    top: 76px
    width: 300px
    height: 160px
    border-radius: 20px
    overflow: hidden
    cursor: pointer
    z-index: 1

    &:hover .blog-mask--article
      opacity: 1

  .blog-btn--read_img
    display: block
    width: 100%
    height: 100%

    img
      display: block
      width: 100%
      height: 100%
      // 原项目没写 object-fit，图片比例与容器不符时会被拉伸；这里补上
      object-fit: cover

  .blog-mask--article
    position: absolute
    display: flex
    justify-content: center
    align-items: center
    top: 0
    right: 0
    width: 100%
    height: 100%
    background-color: rgba(0, 0, 0, 0.45)
    backdrop-filter: blur(8px)
    font-size: $theme-fz.xl
    opacity: 0
    transition: opacity 0.3s ease

    i
      font-size: 26px
      color: #fff
      transition: transform 0.3s ease

  // 封面卡片的操作行需要左右留白，与 info 区对齐
  .blog-btn--actions_out
    padding-left: $theme-spacing.xl
    padding-right: $theme-spacing.xl

// 小屏卡片合并时的分隔线
.blog-card--underLine
  display: none
  width: 100%
  padding: $theme-spacing.xs
  border-bottom: 1px dashed var(--theme-font-trd)

// ===== 响应式：md / sm（768 ~ 1279px）—— 封面提前切成小屏那种「顶部横条」=====
// 为什么不在这段里「把封面缩一点、信息区让一点」，而是直接换形态：
//   992 起 el-col-md-18 生效、aside（flex: 0 0 300px）突然回到行内，而行宽只有 窗口/1.25，
//   于是正文列在 992 时只剩 493.6px —— 比 ≤991（aside 已消失、正文列 614px）**还窄**，
//   是整条响应式曲线上的一处断崖。
//   侧边封面占 10 + 300 = 310px（卡片宽的 63%），信息区只剩 157.6px：
//   元信息两列要 ≈268px 放不下（列内还是 white-space: nowrap，会直接溢出到封面底下），
//   摘要（80 字）要折 9 行，变成一根竖条。
//   ⚠ 而且这条约束是随窗口**线性**变化的（正文列 = 0.8×窗口 − 300），
//     用固定值去调永远只在某个宽度刚好、旁边就崩 —— 所以这里选择换形态。
//   上界取 1280：正是 Home.vue 把 .el-row 从固定 1024px 放开成 100% 的地方；
//     1280 以上行宽回到固定 1024、正文列 724、信息区 388，侧边封面重新放得下。
//   下界 768：≤767 交给下面的 xs 段（那一套还额外做了卡片合并）。
@media only screen and (min-width: 768px) and (max-width: 1279px)
  #index .blog-card--pic
    // ⚠ 封面横条的高度与 header 的顶部留白是一对，改一个必须改另一个：
    //   留白 = 24(横条上偏移) + 96(横条高) + 24(间隙) = 144 → 正好是 lg * 6，而横条高 = lg * 4
    .el-card__header
      padding-top: $theme-spacing.lg * 6

    .blog-card--info
      // 封面不再占右侧 → 取消 256px 让位；那个「把操作行顶出封面下沿」的 min-height 补丁也不需要了
      padding-right: $theme-spacing.xl
      min-height: 0

    .blog-btn--read_link
      top: 0
      left: $theme-spacing.lg
      // 覆盖基样的 right: 10px，避免 left/right/width 三个值同时存在（虽然 LTR 下 right 会被忽略）
      right: auto
      transform: translate(0, $theme-spacing.lg)
      width: 92%
      height: $theme-spacing.lg * 4

// ===== 响应式：xs（< 768px，Element 的 xs 上界 767px）=====
// 原项目 media.styl 的 ≤768px 段
@media only screen and (max-width: 767px)
  // 小屏不放右侧箭头按钮，改由底部标题点击进入
  .blog-btn--read_icon
    display: none

  // 分节虚线：横贯卡片整宽 + 压在卡片下沿（也就是两张卡的交界线上）
  #index .blog-card--underLine
    display: block
    padding: 0
    // ⚠ 这里必须是 width: auto，不能写 100%：
    //   块级盒靠**负外边距**才能撑出 body 的 padding 区；写了 100% 宽度就是定值，
    //   负外边距只会把它整体左移 24px，右边照样差 24px，虚线仍不顶到卡片边
    width: auto
    margin-left: $theme-spacing.lg * -1
    margin-right: $theme-spacing.lg * -1
    // ⚠ 负的下外边距抵消 .el-card__body 的 24px padding-bottom：
    //   虚线才会落到卡片**下沿**。原来它缩在卡片内部（离接缝还有 24px），
    //   看着像「卡片里的一条短虚线」，而不是「两张卡的分界」
    margin-bottom: $theme-spacing.lg * -1
    // 与上方「赞 / 评论 / 浏览」那一行拉开距离。
    //   ⚠ 只能加 margin-top，不能靠 padding / 把线往下挪：
    //     这条线是**钉在卡片下沿**的（靠上面那条负 margin-bottom）——
    //     元素自身变高、或线往下移，都会让它脱离卡片下沿，不再落在两张卡的交界上。
    //     加 margin-top 是把卡片撑高，线跟着下沿一起走，留白才长在「行与线之间」。
    margin-top: $theme-spacing.base
    // 虚线用「强描边」档：1px 虚线自带断口、显色本就比实线浅，
    //   原来的 --theme-border(#D6E0EA) 小屏下几乎看不见；
    //   但也不回到 --theme-font-trd(#7F7F7F) 那么重的深灰，
    //   深灰和卡片头部那条渐隐细线不是一路
    border-bottom: 1px dashed var(--theme-border-strong)

  #index
    // ===== 卡片合并成一份「文档」=====
    // 思路：把「外壳」（白底 / 圆角 / 阴影）从每个子块挪到容器上，子块一律拍平 ——
    //   这样卡与卡之间**根本不存在**接缝，不需要再靠位移去遮圆角和阴影。
    //   原来那套 `translateY(-20px)` 就是干这个的，但它只能遮住下半边，
    //   左右两侧的圆角缺口（露出页面底色）和阴影晕开照旧；而且 transform 不参与布局，
    //   容器底部会凭空多出 20px 空白。
    gap: 0
    background-color: var(--theme-bgc-card)
    border-radius: $theme-radius.lg
    box-shadow: $theme-shadows.lg
    // ⚠ 这一条是给分节虚线收尾的：虚线压在容器下沿，而容器底部两角是 16px 圆角 ——
    //   不裁的话，虚线两端会「探出」圆角、画到页面底色上（像两根小短线支棱出来）。
    //   这一层里没有需要外溢的东西（封面的 hover 遮罩、置顶的绝对定位横条都在卡片内部），
    //   所以裁掉是安全的。
    overflow: hidden

    // ⚠ 用 `> *` 而不是逐个点名：这一层里不止文章卡片 ——
    //   搜索面板（.blog-search--panel）/ 分页器（.blog-pager）/ 加载占位卡片
    //   各自都带 16px 圆角 + 白底 + 同一套阴影，只拍卡片的话接缝会换个地方再冒出来
    > *
      background-color: transparent
      border-radius: 0
      box-shadow: none

    // 带封面的卡片：封面改为整宽置顶
    .blog-card--pic
      // 封面是绝对定位的，卡片必须自己把这块高度空出来，否则标题会被封面盖住。
      // 24px(顶部间隙) + 96px(封面高) + 24px(余量) = 144px
      //
      // ⚠ 必须打在 .el-card__header 上，不能打在 .el-card__body 上 ——
      //   标题已经在 header 插槽里了，往 body 上加 padding 只能推开 body 的内容，
      //   推不动 header 里的标题，结果就是标题停在 24px 处、正好落在封面(24~120px)下。
      //
      //   原项目是 `.blog-card--pic { padding-top: 144px }`（打在卡片自己身上），
      //   因为那时标题就是卡片的直接子元素；换成 el-card 后标题进了 header，
      //   所以要打到 header 上才是等效的。
      //
      //   ⚠ 权重：这条要压过 component.styl 的
      //     `.blog-card .el-card__header { padding: 24px 24px 0 }`（同为 (0,2,0)），
      //     而 component.styl 在 main.js 里比路由（视图组件）更晚引入、样式后注入
      //     → 同权重时它会赢。加 #index 提到 (1,2,0)。
      .el-card__header
        padding-top: $theme-spacing.lg * 6

      .blog-card--info
        padding-right: $theme-spacing.xl
        // xs 下封面已经改到卡片顶部，不再需要给它让出下方空间
        min-height: 0

      .blog-btn--read_link
        position: absolute
        top: 0
        left: $theme-spacing.lg
        transform: translate(0, $theme-spacing.lg)
        width: 92%
        height: $theme-spacing.lg * 4
        overflow: hidden

      .blog-btn--read_img
        display: block
        width: 100%
        height: 100%

        // ⚠ 小屏的封面容器是「宽 92% × 高 96px」的细长条。
        //   原来这里写 height: auto —— 图片按自身比例撑开后的高度远大于 96px，
        //   容器 overflow: hidden 一裁，露出来的是图片的**顶部一条**（从上往下截），
        //   主体内容经常正好在下面被切掉。
        //
        //   改成铺满容器 + 居中裁切（cover）：
        //     ① 等比缩放到「短边刚好盖住容器」（不会变形）
        //     ② 多出来的长边从两端等量裁掉
        //     ③ object-position: center → 裁的是上下两端，留下画面正中那一块
        img
          display: block
          width: 100%
          height: 100%
          object-fit: cover
          // 居中取景。想把主体取偏上（人像 / 标题在上面的图）就写 center 35%
          object-position: center

  // 信息行：base 已经是两列（2 行 2 列），这里不需要再改
</style>
