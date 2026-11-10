<template>
  <!--
    留言墙页（路由 /message，meta.requiresAuth）

    ⚠ 板主不再是写死的「当前登录用户」：他人主页下（/message?uid=xxx）展示
      被访问用户的留言板，其余（/message）是自己的。判据统一走 mixins/visitContext.js，
      其余逻辑（权限位由后端按登录用户下发）不用动 —— 这就是当初那句
      「等他人主页做了，这里只要把 wallOwnerId 换成路由参数里的 id 即可」。

    ⚠ 权限不在这里判断：谁能回复、谁能删，一律以后端下发的 canReply / canDelete 为准。
      前端只负责「按位显示按钮」—— 规则写在两处迟早对不上。
  -->
  <div class="blog-wall">
    <WallInput
      ref="input"
      :reply-target="replyTarget"
      :submitting="submitting"
      @submit="handleSubmit"
      @cancel-reply="replyTarget = null"
    />

    <el-card class="blog-card blog-wall--card" shadow="never">
      <div slot="header" class="blog-card--header">
        <h3>留言墙（{{ total }}）</h3>
      </div>

      <WallItem
        v-for="message in list"
        :key="message.id"
        :message="message"
        :owner-id="wallOwnerId"
        @reply="handleReply"
        @delete="askDelete"
      />

      <!-- 空态 -->
      <div v-if="!list.length && !loading" class="blog-comment--empty">
        还没有人留言，来说第一句吧~
      </div>

      <!-- 下滚懒加载：与评论区同一个哨兵组件 -->
      <InfiniteSentinel v-if="hasMore" :disabled="loading" @enter="loadMore" />
    </el-card>

    <!-- 删除确认：与删除评论同一套弹窗 -->
    <ConfirmModal
      :visible="confirmVisible"
      title="删除留言"
      message="确认删除这条留言？删除后不可恢复。"
      confirm-text="删除"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </div>
</template>

<script>
import { mapGetters, mapActions } from "vuex";
import store from "store";
import mixins from "@/mixins";
import WallInput from "@/components/wall/WallInput.vue";
import WallItem from "@/components/wall/WallItem.vue";
import InfiniteSentinel from "@/components/base/InfiniteSentinel.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import {
  buildWallListViewModel,
  buildPostedWallViewModel,
} from "@/utils/wallUtils";
// 「我现在看的是谁的主页」—— 留言板主人改成「被访问用户 / 自己」
import visitContext from "@/mixins/visitContext";

// 每页条数：留言比评论短，一次多给点
const PAGE_SIZE = 10;

// 「回复 @昵称: 」前缀：提交前要剥掉 —— 关系由 parentMessage / replyTo 携带，
// 留在正文里会白吃掉 30 字的额度
const PREFIX_RE = /^回复 @[^:：]+[:：]\s*/;

export default {
  name: "Message",
  components: { WallInput, WallItem, InfiniteSentinel, ConfirmModal },
  // openDialog（登录框）+ visitedUserId / isVisitContext
  mixins: [mixins, visitContext],
  data() {
    return {
      list: [],
      total: 0,
      page: 0,
      hasMore: true,
      loading: false,
      submitting: false,
      // 正在回复谁：{ parentId, replyTo, name } | null
      replyTarget: null,
      // 待删除的留言/回复 + 确认框
      pendingDelete: null,
      confirmVisible: false,
    };
  },
  computed: {
    ...mapGetters("http", ["isLogin", "userInfo"]),
    /**
     * 当前用户 id：优先取 localStorage 的 uid（刷新后还在），回退 userInfo
     * （与 CommentSection 同一口径）
     */
    currentUserId() {
      return store.get("uid") || this.userInfo?.data?._id || null;
    },
    // 留言板主人：他人主页下是被访问用户（?uid=），否则是自己
    wallOwnerId() {
      const target = this.visitedUserId || this.currentUserId;
      return target ? String(target) : "";
    },
  },
  watch: {
    /**
     * 从「自己的留言板」切到「某个人的留言板」（或反过来）时路由名不变、组件不重建，
     * 所以要 watch 访问对象自己重拉一遍 —— 与 Article.vue watch $route.params.id 同理。
     */
    visitedUserId() {
      this.list = [];
      this.total = 0;
      this.page = 0;
      this.hasMore = true;
      this.fetchMessages(1);
    },
  },
  async mounted() {
    // 刷新后 userInfo 是空的（内存态），先把 uid 补出来才能定板主；
    // 他人主页（有 visitedUserId）则不需要等 userInfo
    if (!this.visitedUserId && !this.currentUserId && this.isLogin) await this.getUserInfo();
    this.fetchMessages(1);
  },
  methods: {
    ...mapActions("http", ["getUserInfo"]),

    // ==================== 读 ====================

    async fetchMessages(page = 1) {
      if (this.loading || !this.wallOwnerId) return;
      this.loading = true;
      try {
        const res = await this.$api({
          type: "getWallMessages",
          params: { userId: this.wallOwnerId },
          data: { page, size: PAGE_SIZE },
        });
        const vm = buildWallListViewModel(res?.data);
        this.list = page === 1 ? vm.list : this.list.concat(vm.list);
        this.total = vm.total;
        this.page = vm.page;
        this.hasMore = vm.hasMore;
      } catch {
        // 接口配了 noMessage，失败是静默的；这里只停住分页，避免哨兵反复触发
        this.hasMore = false;
      } finally {
        this.loading = false;
      }
    },

    loadMore() {
      if (!this.hasMore || this.loading) return;
      this.fetchMessages(this.page + 1);
    },

    // ==================== 写 ====================

    handleReply(target) {
      if (!this.isLogin) {
        this.openDialog("login");
        return;
      }
      this.replyTarget = target;
      this.$refs.input && this.$refs.input.focus();
    },

    async handleSubmit({ content }) {
      if (this.submitting) return;
      if (!this.isLogin) {
        this.openDialog("login");
        return;
      }
      const target = this.replyTarget || {};
      // 剥掉「回复 @xxx: 」前缀再计入正文（字数上限只针对真正要说的话）
      const raw = (content || "").trim();
      const text = target.parentId ? raw.replace(PREFIX_RE, "") : raw;
      if (!text) {
        this.$toast.warning("留言内容不能为空");
        return;
      }

      this.submitting = true;
      try {
        const res = await this.$api({
          type: "createWallMessage",
          data: {
            wall: this.wallOwnerId,
            content: text,
            ...(target.parentId
              ? { parentMessage: target.parentId, replyTo: target.replyTo }
              : {}),
          },
        });
        const created = buildPostedWallViewModel(res?.data);
        if (!created) return;

        if (target.parentId) {
          const parent = this.list.find((m) => m.id === target.parentId);
          if (parent) {
            parent.replies.push(created);
            parent.replyCount += 1;
          }
        } else {
          this.list.unshift(created);
          this.total += 1;
        }

        this.replyTarget = null;
        this.$refs.input && this.$refs.input.reset();
        this.$toast.success(target.parentId ? "回复成功" : "留言成功");
      } catch {
        // 失败提示由网络层统一处理（字数超限、无权限都会带后端 message 回来）
      } finally {
        this.submitting = false;
      }
    },

    // ==================== 删 ====================

    askDelete(record) {
      this.pendingDelete = record;
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
        type: "deleteWallMessage",
        params: { id: target.id },
      });
      if (!res) return;
      this.$toast.success("留言已删除");

      // ① 先按「是一条回复」处理：从它所属留言的 replies 里摘掉
      const parent = this.list.find((m) =>
        (m.replies || []).some((r) => r.id === target.id)
      );
      if (parent) {
        parent.replies = parent.replies.filter((r) => r.id !== target.id);
        parent.replyCount = Math.max(0, parent.replyCount - 1);
        return;
      }
      // ② 否则是一条顶层留言 —— 后端已级联删掉它的回复，这里整条摘掉即可
      const index = this.list.findIndex((m) => m.id === target.id);
      if (index > -1) {
        this.list.splice(index, 1);
        this.total = Math.max(0, this.total - 1);
      }
    },
  },
};
</script>
