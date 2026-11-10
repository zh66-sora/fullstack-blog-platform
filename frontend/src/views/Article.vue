<template>
  <div id="article">
    <!-- 文章详情：外壳用 el-card，对应原项目 .blog-article--container.blog-card
         （结构照搬 myBlog/src/template/markdown.hbs） -->
    <el-card class="blog-card blog-article--container" shadow="never">
      <!-- 标题：左侧竖条 + 28px 粗体（原 .blog-article--title）
           右侧「删除」只对管理端出现，且必须等级严格高于作者：
           管理员能删普通用户的文章、删不了另一个管理员的，站长能删管理员的 ——
           作者本人走「博客管理」页删，这里不重复放按钮（与后端 bus.js 的 DELETE 同一规则）。 -->
      <div class="blog-article--title_row">
        <div class="blog-article--title">{{ article.title }}</div>
        <button
          v-if="canDeleteArticle"
          type="button"
          class="blog-article--delete"
          title="删除这篇文章"
          @click="askDelete"
        >
          删除
        </button>
      </div>

      <!--
        发表者：头像 + 昵称 → 进 TA 的主页（他人主页的入口之一）
        ⚠ 详情页这一行没有父级点击（卡片本身不可点），所以不需要额外挡冒泡，
          但 UserLink 内部本来就带 .stop，行为与列表卡片一致。
      -->
      <UserLink
        v-if="article.author"
        class="blog-article--author"
        :user="article.author"
        show-name
        size="md"
      />

      <!-- 信息行：发布日 / 板块 / 字数 / 更新日 -->
      <div class="blog-article--info">
        <span
          v-for="(item, i) in article.info"
          :key="i"
          class="blog-article--info_item"
        >
          <i class="iconfont" :class="item.icon"></i>
          <span v-for="(label, j) in item.label" :key="j">
            <a v-if="label.touch" href="javascript:void(0)">{{ label.data }}</a>
            <template v-else>{{ label.data }}</template>
          </span>
        </span>
      </div>

      <!-- 标签 chips（最多 3 个）—— 点标签跳首页并按该标签筛选 -->
      <div v-if="article.hasTags" class="blog-article--tags">
        <i class="iconfont icon-biaoqian"></i>
        <a
          v-for="(tag, i) in article.tags"
          :key="i"
          class="blog-tag--chip_display"
          href="javascript:void(0)"
          @click.stop="goTag(tag)"
          >{{ tag }}</a
        >
      </div>

      <!-- GitHub 仓库卡片：默认占位 / 卡片加载中 / 真实仓库卡片 三种状态
           都由组件自己按 url 处理（三态尺寸统一，切换时不跳动） -->
      <GitHubCard :url="article.githubUrl" />

      <!-- 正文：后端存的就是富文本 HTML -->
      <div class="markdown-body" v-html="article.articleHtml"></div>

      <!-- 底部操作栏：赞/踩 用公共组件（与评论区、文章列表是同一个 HabitBar）
           show-text → 三项都渲染成 [图标 文字 数字]，与列表卡片元信息行共用同一套尺寸规范
           （尺寸由 assets/css/component.styl 的 --habit-* token 统一控制） -->
      <div class="blog-article--actions">
        <HabitBar
          :likes="article.likeNum"
          :dislikes="article.dislikeNum"
          :active="article.userReaction"
          show-text
          @like="handleArticleReaction('like')"
          @dislike="handleArticleReaction('dislike')"
        />
        <!-- 评论：滚到下方评论输入框并聚焦
             （对应原项目的 data-action="scroll-to-comments" + _scrollToCommentInput）
             结构对齐赞 / 踩：图标 + 文字 + 数字 -->
        <span
          class="blog-article--action_item"
          title="评论"
          @click="scrollToComments"
        >
          <i class="iconfont icon-pinglun"></i>
          <span class="blog-article--action_label">评论</span>
          <span class="blog-article--action_cnt">{{ article.commentNum }}</span>
        </span>
      </div>
    </el-card>

    <!-- 评论区：输入卡片 + 列表卡片 + 楼中楼弹窗，整块都由 CommentSection 编排 -->
    <CommentSection ref="comments" :article-id="$route.params.id" />

    <!-- 管理端删文章前的确认（与删评论 / 删留言同一套弹窗） -->
    <ConfirmModal
      :visible="confirmVisible"
      title="删除文章"
      :message="confirmMessage"
      confirm-text="删除"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import mixins from "@/mixins";
import { buildArticleViewModel } from "@/utils/articleUtils";
import { goLost } from "@/utils/lost";
import GitHubCard from "@/components/article/GitHubCard.vue";
import CommentSection from "@/components/comment/CommentSection.vue";
import HabitBar from "@/components/base/HabitBar.vue";
// 发表者：头像 + 昵称 → 进 TA 的主页（他人主页的入口之一）
import UserLink from "@/components/user/UserLink.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
// 「管理端能不能删这篇」与后端同一条规则：等级严格高于作者
import { canManage } from "@/config/admin.config";
import bus, { EVENTS } from "@/utils/eventBus";

export default {
  name: "Article",
  components: { GitHubCard, CommentSection, HabitBar, UserLink, ConfirmModal },
  // 复用项目里的 openDialog（未登录点赞时弹登录框）
  mixins: [mixins],
  data() {
    return {
      // 先用空结构占位：模板里读 article.title 之类不会碰到 undefined
      article: buildArticleViewModel(null),
      // 管理端删除文章的确认框
      confirmVisible: false,
    };
  },
  computed: {
    ...mapGetters("http", ["isLogin", "userInfo"]),
    myRole() {
      return this.userInfo?.data?.role || "user";
    },
    /**
     * 「删除」入口要不要出现
     * 作者本人不在这里删（去博客管理页），所以要求严格高于作者 ——
     * 管理员看不见管理员的文章删除键，站长看得见管理员的
     */
    canDeleteArticle() {
      if (!this.isLogin || !this.article.author?.id) return false;
      return canManage(this.myRole, this.article.author.role || "user");
    },
    confirmMessage() {
      return `确认删除《${this.article.title}》？删除后不可恢复。`;
    },
  },
  watch: {
    // 详情页之间互跳（/article/A → /article/B）时组件会被复用、created 不再执行，
    // 所以要盯着路由参数重新取数
    "$route.params.id"() {
      this.fetchArticleDetail();
    },

    /**
     * 点赞态度一有变化就写进 store，两个读取方：
     *   ① 侧边浮动按钮组（FloatMenu）→ 按当前路由 id 取，点赞图标切实心 / 描边
     *   ② 文章列表（Index，被 keep-alive 缓存着）→ watch store，更新对应那张卡片的图标与计数
     *
     * 为什么用 watch 而不是在方法里补一句 dispatch：
     *   取详情、点赞两条路径都会改 userReaction，watch 只写一次就都覆盖了。
     *
     * 为什么要把 id 和 likeNum 一起带上：
     *   列表页需要知道「是哪一篇、赞数变成了多少」才能就地改那张卡片；
     *   不带的话，从详情页赞完再返回列表，那张卡片还是旧的描边图标和旧计数
     *   （原项目不存在这个问题 —— 它回列表页会整页重新请求，而这里刻意 keep-alive 了）
     */
    "article.userReaction"(reaction) {
      this.$store.dispatch("article/syncReaction", {
        id: this.article.articleId,
        reaction,
        likeNum: this.article.likeNum,
      });
    },
  },

  created() {
    this.fetchArticleDetail();
  },

  /**
   * 订阅浮动按钮组的「点赞 / 评论」
   *
   * 只有本页持有 article 数据与评论区实例，挂在 Home 上的浮动按钮组够不着它们，
   * 所以它通过事件总线把「要做什么」广播出来，这里收到之后照做
   * （总线是一次性事件，连点两次点赞就触发两次，不需要像 Vuex 那样用 seq 骗 watch）。
   */
  mounted() {
    bus.$on(EVENTS.FLOAT_LIKE, this.handleFloatLike);
    bus.$on(EVENTS.FLOAT_COMMENT, this.scrollToComments);
  },

  // 与上面的 $on 成对：总线是全局单例、活得比本组件久，不摘的话反复进出文章页
  // 会攒下重复回调，点一次赞触发 N 次（详见 utils/eventBus.js 顶部说明）
  beforeDestroy() {
    bus.$off(EVENTS.FLOAT_LIKE, this.handleFloatLike);
    bus.$off(EVENTS.FLOAT_COMMENT, this.scrollToComments);
  },

  methods: {
    // ==================== 管理端：删除他人文章 ====================

    askDelete() {
      this.confirmVisible = true;
    },

    cancelDelete() {
      this.confirmVisible = false;
    },

    /**
     * 真删：DELETE /api/rest/article/:id
     * 只有作者或「管理端 + 等级更高」能过（服务端还会再判一次，这里挡的是 UI）
     */
    async confirmDelete() {
      this.cancelDelete();
      const id = this.article.articleId || this.$route.params.id;
      if (!id) return;

      const res = await this.$api({
        type: "deleteResource",
        params: { resource: "article", id },
      });
      if (!res) return;
      this.$toast.success("文章已删除");
      // 文章没了，留在详情页只会是空白 —— 回首页（列表重新拉，被删的那条自然消失）
      this.$router.push({ name: "Index" });
    },

    /**
     * 点标签 → 跳首页并按该标签筛选
     *
     * 与列表卡片（ArticleCard / ArticleCardPic）同一口径：只带 tag 一个 query。
     * 详情页没有整卡跳转，所以 .stop 只是顺手（防止外层再挂点击时串事件）。
     */
    goTag(tag) {
      if (!tag) return;
      this.$router.push({ name: "Index", query: { tag: String(tag) } });
    },

    /**
     * 拉取文章详情：GET /api/rest/article/:id
     *
     * 同时并行取一次「当前用户的点赞态度」：详情接口不返回这个字段，
     * 匿名访问返回 userReaction: 'none'；api.config 里已配 noMessage，失败不弹窗）。
     * 两者都拿到再渲染，避免图标先描边再跳成实心。
     */
    async fetchArticleDetail() {
      const id = this.$route.params.id;
      if (!id) return;

      try {
        const [detailRes, reactionRes] = await Promise.all([
          this.$api({
            type: "queryResourceDetail",
            params: { resource: "article", id },
          }),
          this.$api({ type: "getArticleReaction", params: { id } }),
        ]);
        // 跳转加载失败兜底页
        if (!detailRes?.data) return goLost(this, "loadFailed");

        this.article = buildArticleViewModel(
          detailRes.data,
          reactionRes?.data?.userReaction
        );
      } catch (err) {
        // 兜底：万一将来 http.js 改成正常 reject，这里也接得住
        // （带上 from，兜底页的「重新加载」才能回到本页重试）
        goLost(this, "loadFailed");
      }
    },

    // 底部操作栏的评论图标 → 滚到评论输入框并聚焦
    // 具体滚动逻辑由 CommentSection 负责（它才知道输入框在哪），这里只转一道
    // 浮动按钮组的「评论」也走这里（总线的 float:comment 事件直接接到本方法上）
    scrollToComments() {
      if (this.$refs.comments) this.$refs.comments.focusInput();
    },

    /**
     * 浮动按钮组的「点赞」：与底部点赞图标走完全相同的一条链路。
     * （总线 float:like 事件直接接到本方法上，所以两条入口天然共用同一份数据与计数）
     *
     * ⚠ 不做「先滚到页面底部」—— 原实现滚到底是为了让用户看见底部操作栏的反馈，
     *   但现在浮动按钮自己就会即刻变实心，滚动反而变成每点一次页面抖一下。
     */
    async handleFloatLike() {
      await this.handleArticleReaction("like");
    },

    /**
     * 文章赞 / 踩：POST /articles/likes/:id
     * 后端 toggle 后回 { likeNum, dislikeNum, userReaction }，直接写回本地数据即可
     * （选中态由 HabitBar 根据 userReaction 自己判断，不用再算 icon class）
     *
     * 改完 userReaction 后由上面的 watch 广播给浮动按钮组 —— 浮动按钮与底部 HabitBar
     * 的数字、图标因此天然同步（原实现只改了图标 class，底部计数是旧的）。
     *
     * 未登录直接弹登录框（点赞接口需要 JWT；不拦的话用户只会看到一句「请先登录」的报错）
     */
    async handleArticleReaction(type) {
      if (!this.isLogin) {
        this.openDialog("login");
        return;
      }
      const res = await this.$api({
        type: "likeArticle",
        params: { id: this.$route.params.id },
        data: { type },
      });
      const data = res?.data;
      if (!data) return;
      this.article.likeNum = data.likeNum;
      this.article.dislikeNum = data.dislikeNum;
      this.article.userReaction = data.userReaction;
    },
  },
};
</script>

<style lang='stylus'>
@import '../assets/css/themes.styl'

// ============================================================
// 文章详情页
//   结构：myBlog/src/template/markdown.hbs
//   样式：myBlog/src/styl/article.styl
//         （comment.styl 顶部那两个小节是文章操作栏，已并入本文件；
//           评论区的样式在 assets/css/comment.styl）
//
// ⚠ 本文件所有声明统一写成「属性: 值」的带冒号形式。
// Stylus 对「无冒号 + 值是多段」的声明有歧义：紧跟缩进更深的嵌套块时
// 会被当成选择器解析、整条静默丢失（详见 component.styl 顶部说明）。
//
// ⚠ 信息行 / 标签 chips（.blog-article--info / --tags / .blog-tag--chip_display）
//   的样式在 assets/css/component.styl —— 列表页也用同一套，这里只写详情页的覆盖。
// ============================================================

// 详情页整体：文章卡片 + 评论区上下排列。
// margin-bottom 与列表页 #index 对齐 —— 正文列底部要留白，
// 否则最后一张卡片（现在是评论区列表卡片）会直接贴到 footer 上
#article
  margin-bottom: $theme-spacing['2xl']

// 卡片内容纵向排布
// （原项目 .blog-article--container 自带 flex column，因为那时所有内容都是卡片的
//   直接子元素；换成 el-card 后内容都装进了 .el-card__body，所以 flex 要加在这一层）
.blog-article--container
  .el-card__body
    display: flex
    flex-direction: column

// 标题行：标题占满宽度，右侧留给「删除」（管理端才出现）
.blog-article--title_row
  display: flex
  align-items: flex-start
  gap: $theme-spacing.base

  .blog-article--title
    flex: 1
    min-width: 0

// 管理端删文章：幽灵样式 + 警示红，与账号管理的「注销」同一套语义
.blog-article--delete
  flex: 0 0 auto
  margin-top: $theme-spacing.xs
  padding: $theme-spacing.xs $theme-spacing.base
  border: 1px solid rgba(217, 83, 79, 0.4)
  border-radius: $theme-radius.xs
  background-color: rgba(217, 83, 79, 0.08)
  color: #d9534f
  font-size: $theme-fz.sm
  cursor: pointer
  transition: all 0.2s ease

  &:hover
    background-color: #d9534f
    border-color: #d9534f
    color: #fff

// 文章标题：左侧竖条 + 大号粗体
.blog-article--title
  position: relative
  font-size: $theme-fz.xl
  font-weight: 700
  // 竖条距卡片左内边距 24px，加上 .blog-card 自身的 24px，
  // 标题文字距卡片左边 48px（与原项目一致）
  padding-left: $theme-spacing.base
  // 底部留出细线的位置，竖条用 bottom 让开这段 padding
  // （与 modal 的 head、component.styl 的 .blog-card--header 同一套写法）
  padding-bottom: $theme-spacing.base

  &::before
    position: absolute
    height: 40%
    left: 0
    top: 18%
    bottom: $theme-spacing.base
    content: ''
    width: 4px
    border-radius: $theme-radius.xxs
    background-color: var(--theme-font-fst)

  // 标题下沿的渐隐细线：与左侧竖条凑成一套
  // （同款见 assets/css/modal.styl 的 .blog-modal--element .blog-modal--head::after
  //   和 assets/css/component.styl 的 .blog-card--header::after）
  &::after
    position: absolute
    left: 0
    right: 0
    bottom: 0
    height: 1px
    content: ''
    background: linear-gradient(to right, rgba(104, 174, 244, 0.42) 0%, rgba(104, 174, 244, 0.1) 62%, rgba(104, 174, 244, 0) 100%)

// 详情页信息行：卡片宽度固定（正文列 724px），恒为四列
// 覆盖 component.styl 的两列默认值与 ≥1200px 的媒体查询（媒体查询不增加权重）
#article .blog-article--info
  grid-template-columns: repeat(4, minmax(0, 1fr))

// GitHub 仓库卡片的样式已抽到 components/article/GitHubCard.vue
// （默认占位 / 加载中 / 真实卡片三态，以及三态尺寸统一，都由那个组件负责）

// ===== 正文 =====
// markdown 正文排版（.markdown-body）抽到了 assets/css/markdown.styl ——
// global.styl 的 reset 把 h1~h6 / p / code / pre / ul / strong / em / table 的原生样式
// 都清掉了（font: inherit + margin: 0 + list-style: none），那边补了一整套：
// 标题层级、段落间距、行内代码与代码块、列表标记、引用、表格、图片。
// 这里的 border-top 虚线分隔也一并放过去了，在 main.js 里全局引入。

// ===== 底部操作栏 =====
.blog-article--actions
  display: flex
  justify-content: flex-end
  gap: $theme-spacing.lg
  padding: $theme-spacing.lg 0
  margin-top: $theme-spacing.lg
  // 分隔线用「强描边」档：1px 虚线显色本来就比实线浅一档
  border-top: 1px dashed var(--theme-border-strong)

.blog-article--action_item
  cursor: pointer

  // ⚠ 字号不写死在这里 —— 由 component.styl 的 --habit-icon / --habit-text 统一给，
  //   这样赞 / 踩 / 评论 三项才真正同尺寸（原来写死 22px，被 HabitBar 的 15px 规则压过，
  //   结果赞/踩的图标比评论小一号）
  i
    color: var(--theme-font-light)
    transition: color 0.2s, transform 0.2s

  &:hover i
    color: var(--theme-font-fst)
    transform: scale(1.15)

// ===== 响应式：xs（< 768px，Element 的 xs 上界 767px）=====
@media only screen and (max-width: 767px)
  // 信息行回到两列，与列表卡片一致
  #article .blog-article--info
    grid-template-columns: repeat(2, minmax(0, 1fr))
</style>
