<template>
  <!--
    评论区主组件（挂载在文章详情页正文卡片之后）

    这里是整个评论功能的**唯一数据源**：
      · 顶层评论列表 + 分页 + 加载状态
      · 「正在回复谁」这个跨组件状态（原来藏在 textarea 的 data-parent-id 属性里）
      · 弹窗打开的是哪条评论
      · 删除确认弹窗的开关与待删目标
      · 所有写操作（发表评论/回复、上传配图、赞/踩、删除）都从这里发请求

    三个子组件：评论输入框 / 单条评论 / 楼中楼弹窗；
    列表卡片（标题、空态、哨兵）留在本组件 —— 空态是「整个评论区」的兜底，不属于任何子组件。
  -->
  <div class="blog-comment--wrap">
    <CommentInput
      ref="input"
      :reply-target="replyTarget"
      :submitting="submitting"
      @submit="handleSubmit"
    />

    <el-card class="blog-card blog-comment--list_card" shadow="never">
      <div slot="header" class="blog-comment--list_header">
        {{ total }} 条评论
      </div>

      <div class="blog-comment--list">
        <CommentItem
          v-for="comment in list"
          :key="comment.id"
          :comment="comment"
          @reply="handleReply"
          @like="handleReaction($event, 'like')"
          @dislike="handleReaction($event, 'dislike')"
          @delete="askDelete"
          @view-all="handleViewAll"
        />
      </div>

      <!-- 没有评论时的兜底内容 -->
      <div v-if="!list.length && !loading" class="blog-comment--empty">
        还没有评论，快来抢沙发吧~
      </div>

      <!--
        下滚懒加载哨兵：只有「还有下一页」时才存在。
        disabled 只跟「加载中」挂钩 —— 加载结束那一刻 InfiniteSentinel 会自动复判一次，
        所以首屏没填满视口时会继续自动加载下一页，直到填满或没有更多
      -->
      <InfiniteSentinel v-if="hasMore" :disabled="loading" @enter="loadMore" />
    </el-card>

    <!--
      弹窗常驻挂载（不 v-if）：el-dialog 的开合动画依赖 visible 从 false 变 true，
      组件一开始就 visible 的话动画不会走。正文由 el-dialog 的 destroy-on-close 销毁，
      所以弹窗里的哨兵照样会随关闭被 disconnect，不需要手动清理
    -->
    <CommentModal
      :visible="modalVisible"
      :comment="activeComment"
      :current-user-id="currentUserId"
      :actor-role="actorRole"
      @close="modalVisible = false"
      @reply="handleReply"
      @like="handleReaction($event, 'like')"
      @dislike="handleReaction($event, 'dislike')"
    />

    <!-- 删除确认：用自己的弹窗而不是 this.$confirm，跟本项目的弹窗风格一致 -->
    <ConfirmModal
      :visible="confirmVisible"
      title="删除评论"
      message="确认删除这条评论？删除后不可恢复。"
      confirm-text="删除"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import store from "store";
import mixins from "@/mixins";
import CommentInput from "./CommentInput.vue";
import CommentItem from "./CommentItem.vue";
import CommentModal from "./CommentModal.vue";
import InfiniteSentinel from "@/components/base/InfiniteSentinel.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import { getScrollTop, setScrollTop } from "@/utils/scroll";
import {
  buildCommentListViewModel,
  buildPostedCommentViewModel,
  buildPostedReplyViewModel,
} from "@/utils/commentUtils";
import { uploadOne } from "@/utils/uploadFile";

// 顶层评论每页条数（与后端 GET /api/comments/article/:id 的默认值一致，显式传以免依赖默认值）
const PAGE_SIZE = 5;

export default {
  name: "CommentSection",
  components: {
    CommentInput,
    CommentItem,
    CommentModal,
    InfiniteSentinel,
    ConfirmModal,
  },
  // 复用项目里的 openDialog（登录框）
  mixins: [mixins],
  props: {
    articleId: { type: String, default: "" },
  },
  data() {
    return {
      // 已加载的顶层评论
      list: [],
      // 评论总数 (评论区显示楼中楼多少评论)
      total: 0,
      // 分页游标
      page: 0,
      hasMore: true,
      // 列表加载中
      loading: false,
      // 提交中（上传配图 + 发评论整段）
      submitting: false,
      // 正在回复谁：{ parentId, replyTo, name } | null
      replyTarget: null,
      // 弹窗打开的是哪条评论（list 里的**同一个对象引用**）
      activeComment: null,
      modalVisible: false,
      // 待删除的那条评论 —— 确认弹窗点「删除」后才真正发请求
      pendingDelete: null,
      confirmVisible: false,
    };
  },
  computed: {
    ...mapGetters("http", ["isLogin", "userInfo"]),
    /**
     * 当前登录用户 id
     * 优先取登录时写进 localStorage 的 uid（刷新后依然在），
     * 兜底用资料接口返回的 _id —— isAuthor（能否看到删除入口）靠它判断
     */
    currentUserId() {
      return store.get("uid") || this.userInfo?.data?._id || null;
    },
    /**
     * 当前登录者的角色 —— 只用来判断「删除入口要不要出现」：
     * 作者本人，或管理端且等级严格高于评论作者（与后端 bus.js 的 DELETE 同一条规则）
     */
    actorRole() {
      return this.userInfo?.data?.role || "user";
    },
  },
  watch: {
    /**
     * 换文章了
     * Article.vue 自己 watch 了 $route.params.id（组件被复用、created 不会再跑），
     * 评论区挂在它下面，必须跟着重置，否则会看到上一篇文章的评论。
     * 原项目每次进详情页都是整页重渲染，不存在这个问题 —— 这是 Vue 版独有的坑。
     */
    articleId() {
      this.reset();
    },
  },
  /**
   * 首屏：先让 currentUserId 就位，再拉列表
   *
   * ⚠ 顺序不能反。`isAuthor`（能否看到删除入口）在 commentUtils 的 mapBase 里
   *   **算一次就写成普通字段**，不是响应式 —— 用户资料晚到也不会让已建好的对象变回来。
   *   如果并发发出（列表 + 资料），列表先回来时资料还在路上，
   *   所有评论的 isAuthor 都会被写成 false，删除入口不出现，
   *   要等手动翻一页重新拉才恢复。
   *
   *   只在真的需要时才等：uid 存在浏览器里（登录/注册时写入）时 currentUserId
   *   立刻可用，这时直接拉列表，不额外多一次串行往返。
   */
  async created() {
    if (this.isLogin && (!this.currentUserId || !this.userInfo?.data?.role)) await this.ensureCurrentUser();
    this.fetchComments(1);
  },
  methods: {
    // ==================== 读：顶层评论列表 ====================

    /**
     * 拉顶层评论
     * @param {number} page 目标页码，从 1 开始
     */
    async fetchComments(page = 1) {
      // loading锁
      if (this.loading) return;
      this.loading = true;
      try {
        // 拉取指定文章一页的评论
        const res = await this.$api({
          type: "getArticleComments",
          params: { articleId: this.articleId },
          data: { page, size: PAGE_SIZE },
        });
        const vm = buildCommentListViewModel(
          res?.data,
          this.currentUserId,
          this.actorRole
        );
        // 第 1 页替换、后续页追加
        this.list = page === 1 ? vm.list : this.list.concat(vm.list);
        this.total = vm.total;
        this.page = vm.page;
        this.hasMore = vm.hasMore;
      } catch (err) {
        // 网络层已统一处理提示（该接口配了 noMessage，失败是静默的），这里只兜底停住分页
        this.hasMore = false;
      } finally {
        this.loading = false;
      }
    },

    loadMore() {
      if (!this.hasMore || this.loading) return;
      this.fetchComments(this.page + 1);
    },

    // ==================== 交互：回复 / 更多回复 / 弹窗 ====================

    /**
     * 开始回复某人：{ parentId, replyTo, name }
     * 弹窗里点回复也要先关掉弹窗 —— 页面上只有一个输入框，这是原项目的做法
     */
    handleReply(target) {
      this.modalVisible = false;
      this.replyTarget = target;
      this.focusInput();
    },

    handleViewAll(comment) {
      // 传引用而不是副本：赞/踩之后弹窗与列表天然同步
      // （原项目是靠 $('[data-comment-id="x"]').each() 手改两处 DOM）
      this.activeComment = comment;
      this.modalVisible = true;
    },

    focusInput() {
      this.$nextTick(() => {
        const input = this.$refs.input;
        if (!input || !input.$el) return;
        // 滚到输入框（顶部留 60px）再聚焦 —— 取/设都走 utils/scroll.js，
        // 与「路由切换归位」「浮动按钮组去顶部」共用同一套判断
        const top = input.$el.getBoundingClientRect().top + getScrollTop() - 60;
        setScrollTop(top, "smooth");
        input.focus();
      });
    },

    // ==================== 写：赞 / 踩 ====================

    async handleReaction(target, type) {
      if (!this.isLogin) {
        this.openDialog("login");
        return;
      }
      const res = await this.$api({
        type: "commentLike",
        params: { commentId: target.id },
        data: { type },
      });
      const data = res?.data;
      if (!data) return;
      this.applyReaction(target, data);
    },

    /**
     * 赞/踩结果落地
     *
     * ⚠ 同一条评论可能同时存在于两处数据里：列表的回复预览（comment.replies）与
     *   弹窗的完整回复列表 —— 它们是两次请求建出来的**不同对象**。
     *   所以既改被点的那个对象，也按 id 把 list 里的副本一起改掉
     *   （原项目是在 DOM 上 $(`[data-comment-id="x"]`).each(...) 手改计数）。
     */
    applyReaction(target, data) {
      const patch = (record) => {
        if (record && record.id === target.id) {
          record.likeNum = data.likeNum;
          record.dislikeNum = data.dislikeNum;
        }
      };
      patch(target);
      this.list.forEach((comment) => {
        patch(comment);
        comment.replies.forEach(patch);
      });
    },

    // ==================== 写：删除（先弹确认）====================

    /** 点删除 → 记下目标并开确认弹窗，不直接发请求 */
    askDelete(target) {
      this.pendingDelete = target;
      this.confirmVisible = true;
    },

    cancelDelete() {
      this.pendingDelete = null;
      this.confirmVisible = false;
    },

    async confirmDelete() {
      const target = this.pendingDelete;
      this.cancelDelete();
      if (!target) return;

      const res = await this.$api({
        type: "deleteResource",
        params: { resource: "comment", id: target.id },
      });
      if (!res) return;
      this.$toast.success("评论已删除");
      // 只有顶层评论有删除入口（回复没有，与原项目一致），所以只处理这一层
      const index = this.list.findIndex((comment) => comment.id === target.id);
      if (index > -1) {
        this.list.splice(index, 1);
        this.total -= 1;
      }
    },

    // ==================== 写：发表评论 / 回复 ====================

    async handleSubmit({ content, file }) {
      if (this.submitting) return;

      if (!this.isLogin) {
        // 原项目靠路由 meta.requiresAuth 拦整页，评论区是局部交互，得就地判断
        this.openDialog("login");
        return;
      }

      const text = (content || "").trim();
      if (!text) {
        this.$toast.warning("评论内容不能为空");
        return;
      }

      // 先记下目标：提交成功后要清掉它，不能在中途被改
      const target = this.replyTarget || {};
      this.submitting = true;
      try {
        // ① 配图：选文件时只暂存 File，此刻才真正上传（与原项目一致）
        //    统一走 uploadOne：同内容第二次直接秒传
        let image = "";
        if (file) {
          image = await uploadOne(this, file, "comment");
          if (!image) {
            this.$toast.error("图片上传失败");
            return;
          }
        }

        // ② 发评论：带 parentComment 就是回复（后端据此归到顶层评论下）
        const res = await this.$api({
          type: "createResource",
          params: { resource: "comment" },
          data: {
            article: this.articleId,
            content: text,
            image,
            ...(target.parentId
              ? { parentComment: target.parentId, replyTo: target.replyTo }
              : {}),
          },
        });
        // 后端只回 { message, _id }，没有完整文档
        if (!res || !res._id) return;

        // ③ 用「当前用户 + 刚输入的内容」把这条评论补出来直接插进列表，
        //    而不是像原项目那样重新拉整块 HTML（那会把已加载页码和滚动位置全冲掉）
        const me = await this.ensureCurrentUser();
        if (target.parentId) {
          this.appendReply(target, res._id, text, image, me);
        } else {
          this.list.unshift(
            buildPostedCommentViewModel(
              { _id: res._id, content: text, image },
              me
            )
          );
          this.total += 1;
        }

        this.$toast.success(target.parentId ? "回复发表成功" : "评论发表成功");
        this.replyTarget = null;
        this.$refs.input.reset();
      } finally {
        this.submitting = false;
      }
    },

    /**
     * 把新回复插进它所属顶层评论的回复预览里
     * @param {object} target 回复目标 { parentId, replyTo, name }
     */
    appendReply(target, id, content, image, user) {
      const parent = this.list.find(
        (comment) => comment.id === target.parentId
      );
      if (!parent) return;
      parent.replies.push(
        buildPostedReplyViewModel({ _id: id, content, image }, user, {
          id: target.replyTo,
          name: target.name,
        })
      );
      parent.replyCount += 1;
    },

    /**
     * 拿当前用户资料：有就返回、没有就拉一次
     *
     * 两个调用方：`created`（要在拉列表之前就位，见那里的注释）与 `handleSubmit`
     * （新评论的作者展示要用）。
     * store 的 `getUserInfo` 本身做了并发去重，所以两处同时要也只会发一个请求。
     */
    async ensureCurrentUser() {
      if (this.userInfo?.data?._id) return this.userInfo.data;
      await this.$store.dispatch("http/getUserInfo");
      return this.$store.getters["http/userInfo"]?.data || null;
    },

    // ==================== 重置 ====================

    /** 换文章时把评论区整体清空重来 */
    reset() {
      this.list = [];
      this.total = 0;
      this.page = 0;
      this.hasMore = true;
      this.loading = false;
      this.submitting = false;
      this.replyTarget = null;
      this.activeComment = null;
      this.modalVisible = false;
      this.pendingDelete = null;
      this.confirmVisible = false;
      this.fetchComments(1);
    },
  },
};
</script>
