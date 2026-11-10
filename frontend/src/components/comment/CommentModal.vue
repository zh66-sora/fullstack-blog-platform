<template>
  <!--
    楼中楼弹窗：父评论 + 全部回复（分页 + 下滚懒加载）
    用 el-dialog 承载 —— 遮罩、开关动画、滚动锁定、z-index 都由它负责，
    视觉由 comment.styl 的 `.el-dialog.blog-comment_modal--dialog` 削平。
    （原项目是往一个共用容器 $('.blog-modal') 里塞字符串再 removeClass('dp-none')，
      数据/DOM/状态三件事耦在一起；这里关掉即销毁正文，无需手动清理 Observer）

    ⚠ 弹窗只「读」（拉回复列表），不写：赞/踩/回复都抛给 CommentSection 统一处理。
  -->
  <el-dialog
    :visible="visible"
    width="700px"
    top="5vh"
    append-to-body
    :show-close="false"
    destroy-on-close
    custom-class="blog-comment_modal--dialog"
    @close="$emit('close')"
  >
    <!-- 头部：原项目是一整块主题色背景 + 圆形关闭按钮 -->
    <div slot="title" class="blog-comment_modal--header">
      <span>评论详情</span>
      <button
        type="button"
        class="blog-comment_modal--close"
        @click="$emit('close')"
      >
        <i class="iconfont icon-guanbi"></i>
      </button>
    </div>

    <div v-if="comment" ref="body" class="blog-comment_modal--body">
      <!-- 父评论：完整显示，但不给回复/删除入口（原项目那边只有赞/踩） -->
      <div class="blog-comment_modal--parent">
        <CommentItem
          :comment="comment"
          variant="modal"
          @like="$emit('like', $event)"
          @dislike="$emit('dislike', $event)"
        />
        <div class="blog-comment_modal--divider"></div>
      </div>

      <!-- 全部回复：扁平列表，每条都显示 IP 属地 -->
      <div class="blog-comment_modal--replies">
        <ReplyItem
          v-for="reply in replies"
          :key="reply.id"
          :reply="reply"
          show-ip
          @reply="$emit('reply', replyTargetOf(reply))"
          @like="$emit('like', $event)"
          @dislike="$emit('dislike', $event)"
        />

        <div v-if="!replies.length && !loading" class="blog-comment--empty">
          还没有回复
        </div>

        <!--
          弹窗内的哨兵：滚动容器是弹窗正文，必须把 root 指过去，
          否则会一路找到 window，弹窗里滚动永远不触发
          （原项目 _setupModalRepliesObserver 的注释里踩过同一个坑）
        -->
        <InfiniteSentinel
          v-if="hasMore"
          :disabled="loading"
          :get-root="getRoot"
          @enter="loadMore"
        />
      </div>
    </div>
  </el-dialog>
</template>

<script>
import CommentItem from "./CommentItem.vue";
import ReplyItem from "./ReplyItem.vue";
import InfiniteSentinel from "@/components/base/InfiniteSentinel.vue";
import { buildReplyListViewModel } from "@/utils/commentUtils";

// 后端 replies 接口的默认每页条数，这里显式传，避免依赖后端默认值
const REPLY_PAGE_SIZE = 20;

export default {
  name: "CommentModal",
  components: { CommentItem, ReplyItem, InfiniteSentinel },
  props: {
    visible: { type: Boolean, default: false },
    // 被打开的顶层评论（是 CommentSection 里 list 上的**同一个对象**，不是副本）
    comment: { type: Object, default: null },
    // isAuthor 判断用；由 Section 传下来，弹窗自己不碰 store
    currentUserId: { type: [String, Number], default: null },
    // 当前登录者角色（删除入口判据的一部分，见 commentUtils.mapBase）
    actorRole: { type: String, default: "user" },
  },
  data() {
    return {
      replies: [],
      total: 0,
      page: 0,
      hasMore: false,
      loading: false,
    };
  },
  watch: {
    visible(val) {
      // 每次打开都从第 1 页重新拉：弹窗正文被 destroy-on-close 销毁了，
      // 但本组件的 data 还在，不重置会看到上一次打开的残留
      if (val) this.start();
    },
  },
  methods: {
    start() {
      this.replies = [];
      this.total = 0;
      this.page = 0;
      this.hasMore = true;
      this.fetchReplies(1);
    },
    async fetchReplies(page = 1) {
      if (!this.comment || this.loading) return;
      this.loading = true;
      try {
        const res = await this.$api({
          type: "getCommentReplies",
          params: { commentId: this.comment.id },
          data: { page, size: REPLY_PAGE_SIZE },
        });
        const vm = buildReplyListViewModel(
          res?.data,
          this.currentUserId,
          this.actorRole
        );
        this.replies = page === 1 ? vm.list : this.replies.concat(vm.list);
        this.total = vm.total;
        this.page = vm.page;
        this.hasMore = vm.hasMore;
      } catch (err) {
        // 网络层已统一提示（该接口配了 noMessage，失败是静默的），这里只兜底停止加载
        this.hasMore = false;
      } finally {
        this.loading = false;
      }
    },
    loadMore() {
      if (!this.hasMore || this.loading) return;
      this.fetchReplies(this.page + 1);
    },
    // 弹窗里的回复要回复谁：parentId 恒为父评论，replyTo 才是具体的人
    replyTargetOf(reply) {
      return {
        parentId: this.comment.id,
        replyTo: reply.author.id,
        name: reply.author.name,
      };
    },
    // 延迟取滚动容器：正文元素会被 destroy-on-close 重建，函数式取到的一定是最新节点
    getRoot() {
      return this.$refs.body || null;
    },
  },
};
</script>
