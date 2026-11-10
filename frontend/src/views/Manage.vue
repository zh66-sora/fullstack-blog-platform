<template>
  <!--
    博客管理页（路由 /manage，meta.requiresAuth）

    骨架参考板块页（views/Column.vue）：卡片 + 贴边顶栏（返回键 + 标题）+ 卡内列表。
    区别在于内容：那边是「所有板块」，这边是「当前用户发表过的博客」，按时间倒序。

    数据：GET /articles/search?authorId=<自己的 _id>&page=&size=20
      ⚠ 必须走 authorId 而不是 authorName —— 后者是**昵称子串模糊匹配**，
        昵称互为子串时会串号（实测：查 uha2n 会把 wuha2n 的文章一起带出来）。

    写操作只有「删除」一件：列表本身是只读的，编辑跳去写博客页的编辑态。
  -->
  <el-card id="manage" class="blog-card blog-manage--wrap" shadow="never">
    <!-- 顶栏：返回 + 标题（复用 form.styl 里那套全局的卡片顶栏） -->
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        title="返回主页"
        @click="goBack"
      ></span>
      <h3>博客管理</h3>
    </div>

    <!-- 列表：一页最多 20 条
         ⚠ 本页没有空态：「一篇都没写过」交给全局兜底页的 empty 状态
           （见 fetchList 末尾的 goLost），避免请求失败时静默渲染成「暂无数据」 -->
    <ul class="blog-manage--list">
      <ManageItem
        v-for="item in list"
        :key="item.id"
        :item="item"
        @edit="handleEdit"
        @delete="askDelete"
      />
    </ul>

    <!-- 分页器：复用文章列表那一个；只有 1 页时不渲染 -->
    <div v-if="pages > 1" class="blog-manage--pager">
      <Pager :page="page" :pages="pages" @change="handlePageChange" />
    </div>

    <!-- 删除确认：与删评论 / 删留言同一套弹窗 -->
    <ConfirmModal
      :visible="confirmVisible"
      title="删除博客"
      :message="confirmMessage"
      confirm-text="删除"
      @confirm="confirmDelete"
      @cancel="cancelDelete"
    />
  </el-card>
</template>

<script>
import { mapGetters, mapActions } from "vuex";
import store from "store";
import ManageItem from "@/components/manage/ManageItem.vue";
import Pager from "@/components/base/Pager.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import { buildManageListViewModel } from "@/utils/manageUtils";
import { goLost } from "@/utils/lost";

// 需求：一页最多 20 条
const PAGE_SIZE = 20;

export default {
  name: "Manage",
  components: { ManageItem, Pager, ConfirmModal },
  data() {
    return {
      listData: { total: 0, page: 1, pages: 1, list: [] },
      loading: false,
      // 待删除的那条 + 确认框
      pendingDelete: null,
      confirmVisible: false,
    };
  },
  computed: {
    ...mapGetters("http", ["isLogin", "userInfo"]),
    list() {
      return this.listData.list;
    },
    page() {
      return this.listData.page;
    },
    pages() {
      return this.listData.pages;
    },
    /**
     * 当前用户 id：优先取 localStorage 的 uid（刷新后还在），回退 userInfo
     * —— 与 CommentSection / Message / WallDanmaku 同一口径
     */
    currentUserId() {
      return store.get("uid") || this.userInfo?.data?._id || null;
    },
    confirmMessage() {
      const title = this.pendingDelete?.title || "";
      return `确认删除《${title}》？删除后不可恢复。`;
    },
  },
  async mounted() {
    // ⚠ 刷新后 userInfo 是空的（内存态），先把 uid 补出来才能问「我的文章」
    //   （与 Message.vue 同一处理；顺序不能反，不然这一页会空跑一次请求）
    if (!this.currentUserId && this.isLogin) await this.getUserInfo();
    this.fetchList(1);
  },
  methods: {
    ...mapActions("http", ["getUserInfo"]),

    // ==================== 读 ====================

    /**
     * 拉当前用户发表的文章（按发布时间倒序 —— 后端 sortBy 默认就是 publishDate desc）
     *
     * ⚠ 只传 authorId，**不要**同时传 authorName：
     *   后端在 authorName 匹配不到任何用户时会提前返回空结果，authorId 根本轮不到生效。
     */
    async fetchList(page = 1) {
      if (this.loading) return;
      const uid = this.currentUserId;
      if (!uid) return goLost(this, "loadFailed");

      this.loading = true;
      try {
        const res = await this.$api({
          type: "searchArticles",
          data: { authorId: String(uid), page, size: PAGE_SIZE },
        });
        if (!res?.data) return goLost(this, "loadFailed");
        this.listData = buildManageListViewModel(res.data);
        // 请求成功但一篇都没有（且是第一页）→ 兜底页的 empty 状态
        if (!this.listData.list.length && page === 1) goLost(this, "empty");
      } catch (err) {
        // 整页就靠这一次请求 —— 失败就直接去兜底页（能重试）
        goLost(this, "loadFailed");
      } finally {
        this.loading = false;
      }
    },

    handlePageChange(target) {
      if (target === this.page) return;
      this.fetchList(target);
    },

    // ==================== 删除 ====================

    askDelete(item) {
      this.pendingDelete = item;
      this.confirmVisible = true;
    },

    cancelDelete() {
      this.pendingDelete = null;
      this.confirmVisible = false;
    },

    /**
     * 点「删除」才真发请求（命令式 $confirm 会把「意图」和「执行」绑死，
     * 拆开之后每一步都可测 —— 与评论区的删除同一个模式）
     */
    async confirmDelete() {
      const target = this.pendingDelete;
      this.cancelDelete();
      if (!target) return;

      const res = await this.$api({
        type: "deleteResource",
        params: { resource: "articles", id: target.id },
      });
      if (!res) return;
      this.$toast.success("删除成功");

      // ⚠ 删完这一页可能就空了（比如第 2 页只剩 1 条）——
      //   这时退回上一页，否则用户会停在一个空列表上以为全没了
      const remain = this.list.length - 1;
      const next = remain === 0 && this.page > 1 ? this.page - 1 : this.page;
      this.fetchList(next);
    },

    // ==================== 跳转 ====================

    /** 编辑：跳写博客页的编辑态（独立的组件实例，不碰 /write 那份草稿） */
    handleEdit(item) {
      this.$router.push({ name: "ArticleEdit", params: { id: item.id } });
    },

    // 返回主页（与板块页 / 写博客页的返回键一致）
    goBack() {
      this.$router.push({ name: "Index" });
    },
  },
};
</script>
