<template>
  <!--
    友情链接列表（纯列表块，不含卡片外壳）

    ## 为什么从 Aside.vue 里抽出来
    需求（todo 2）要求小屏下 Aside 下沉时**不带友链**，友链改放进汉堡菜单（todo 4）。
    如果只是把这段 markup 从 Aside 删掉、等做汉堡时再抄一遍，就变成了两处维护；
    所以抽成组件：**谁需要谁挂**，卡片外壳由宿主自己套
    （Aside 里套 el-card，汉堡里套抽屉自己的 section）。

    ## 数据与行为
    数据：登录用户资料上的 friendLinks（GET /api/profile）
    规则：一条都没有 → 整个列表不渲染（v-if），宿主也就不会出现空标题
          超过 collapsedCount 条 → 默认只铺前 N 条，末行是一条横贯整行的
          「点击显示更多」，点开后展开全部、该行消失（单向，不再收起）

    ## 样式依赖（都在全局，见 assets/css/component.styl）
    `.blog-cards--category` / `.blog-friends--more`
    ⚠ 别在这里再写一遍：那是「抽公共样式」而不是复制
  -->
  <div v-if="links.length" class="blog-friend--links">
    <ul class="blog-cards--category">
      <li
        v-for="(item, index) in visibleLinks"
        :key="index"
        @click="openFriend(item)"
      >
        <span class="category-name">{{ item.title }}</span>
        <span class="category-cnt iconfont" :class="card.iconName"></span>
      </li>
      <!-- 「更多」行：横贯整行，展开后由 hasMore 置为 false 自动消失 -->
      <li v-if="hasMore" class="blog-friends--more" @click="expand">
        {{ card.moreText }}
      </li>
    </ul>

    <!--
      打开外链前的确认框
      与「删除自己的评论」用的是同一个 ConfirmModal 组件（同一套弹窗语言）。
      ⚠ 确认框跟着组件走：Aside 和汉堡各有一份实例，但因为同一时刻只会有
        一处友链是可见的（大屏侧栏 / 小屏抽屉），不会出现两个弹窗打架。
    -->
    <ConfirmModal
      :visible="confirmVisible"
      title="打开链接"
      :message="confirmMessage"
      confirm-text="打开"
      @confirm="confirmOpen"
      @cancel="cancelOpen"
    />
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import { ASIDE_FRIENDS } from "@/config/aside.config";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
// 「我现在看的是谁的主页」—— 他人主页下友链换成被访问用户的
import visitContext from "@/mixins/visitContext";

export default {
  name: "FriendLinks",
  components: { ConfirmModal },
  mixins: [visitContext],
  data() {
    return {
      card: ASIDE_FRIENDS,
      // 是否已展开（单向：点过「更多」之后不再收起）
      expanded: false,
      // 待确认打开的外链：{ name, url }
      pendingLink: null,
      confirmVisible: false,
    };
  },
  computed: {
    ...mapGetters("http", ["userInfo"]),
    /**
     * 友情链接：未登录 / 后台还没设过 → 空数组 → 整块不渲染
     * ⚠ 他人主页下读**被访问用户**的 friendLinks，否则读登录用户自己的。
     */
    links() {
      const source = this.isVisitContext ? this.visitedProfile : this.userInfo?.data || {};
      const links = source.friendLinks;
      return Array.isArray(links) ? links : [];
    },
    /** 折叠态只铺前 collapsedCount 条，展开态全部铺出 */
    visibleLinks() {
      return this.expanded
        ? this.links
        : this.links.slice(0, this.card.collapsedCount);
    },
    /** 「更多」行：条数没超阈值、或已经展开过 → 都不再出现 */
    hasMore() {
      return !this.expanded && this.links.length > this.card.collapsedCount;
    },
    // 确认框正文：有站点名就带上，只设了链接的站点也能看清要去哪
    confirmMessage() {
      if (!this.pendingLink) return "";
      const { name, url } = this.pendingLink;
      return name
        ? `即将在新标签页打开「${name}」：${url}`
        : `即将在新标签页打开：${url}`;
    },
  },
  methods: {
    expand() {
      this.expanded = true;
    },

    /** 友情链接点击：先确认再打开（站点建了行但没填 URL 的按「未设置」处理） */
    openFriend(item) {
      const url = item?.url;
      if (!url) return this.$toast.info("ta还没有设置呢~");
      this.pendingLink = { name: item?.title, url };
      this.confirmVisible = true;
    },

    /**
     * 确认打开 —— 与「删除自己的评论」同款顺序：先把目标取到手、立刻关弹窗，再干活
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
