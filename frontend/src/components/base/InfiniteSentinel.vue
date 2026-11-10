<template>
  <!-- 下滚懒加载哨兵：本身只是 1px 高的占位元素，进入视野就抛 enter -->
  <div class="blog-sentinel"></div>
</template>

<script>
/**
 * InfiniteSentinel — 下滚懒加载哨兵（评论区 / 楼中楼弹窗共用）
 *
 * 为什么不用 element 自带的 v-infinite-scroll：
 *   它的 handleScroll 第一件事是 container.getBoundingClientRect()，而
 *   getScrollContainer 在「找不到可滚动祖先」时会返回 window —— window 上没有这个
 *   方法，整页滚动时会直接抛 TypeError。
 *   （element-ui 2.15.14 packages/infinite-scroll/src/main.js:89-96 与 utils/dom.js:199）
 *   评论区正是整页滚动（Home.vue 把 el-main 设成了 overflow: visible），所以不能用。
 */
export default {
  name: "InfiniteSentinel",
  props: {
    // 加载中 / 已无更多 → 传 true，拦掉一切触发
    disabled: { type: Boolean, default: false },
    // 提前量（px）：距容器底部还有这么多就开始加载。
    distance: { type: Number, default: 200 },
    /**
     * 滚动容器：不传 = 整页滚动（root 传 null 即 viewport）
     * 弹窗里传 () => 弹窗正文元素。
     * 用函数而不是直接传 Element —— 弹窗正文会被 el-dialog 的 destroy-on-close 重建，
     * 函数式取值天然拿到当下最新那个节点。
     */
    getRoot: { type: Function, default: null },
  },
  watch: {
    /**
     * 加载结束后自动复判 —— 这是替代原项目那套「unobserve 当互斥锁」的地方
     *
     * IntersectionObserver 只在状态**跨过阈值**时回调。追加完一页内容后，哨兵如果
     * 被推出了阈值区，就不会再有回调；但要是这一页没把哨兵推出去（最后一页只剩 1 条、
     * 或首屏内容还没填满视口），列表就会永远停在原地。
     * 「加载中 → false」正是复判的时机，于是内容会自动加载到填满视口或没有更多为止。
     */
    disabled(val) {
      if (!val) this.$nextTick(this.judge);
    },
  },
  mounted() {
    // 浏览器原生观察器
    this.observer = new IntersectionObserver(
      // IO 只负责「提醒该复判了」，判不判由 judge 按实时几何量决定
      () => this.judge(),
      {
        root: this.getRoot ? this.getRoot() : null,
        // 把检测区往外扩 distance，等价于「距容器底部还有 distance 时就认为到达」
        // （与 judge() 里那套几何判定保持同一个语义）
        rootMargin: `${this.distance}px`,
        threshold: 0,
      }
    );
    this.observer.observe(this.$el);
  },
  beforeDestroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  },
  methods: {
    /**
     * 哨兵是否已经「快到」容器底部
     *
     * ⚠ 这里用实时几何量算，而不是缓存 IO 回调里的 isIntersecting —— 实测过：
     *   IO 回调是异步的（浏览器在「更新渲染」步骤里才计算交叉状态），
     *   而「一页加载完 → disabled 变 false → 复判」走的是 Vue 的 nextTick（微任务），
     *   那一刻 IO 还没把新状态递过来，缓存值必然是过期的 true。
     *   后果：用户滚到底一次，剩余所有页会被连着全部加载完
     *   （哨兵明明已经被新内容推到视口外了）。
     *   改成本方法后，复判读的是「DOM 补丁之后」的真实位置，一次只加载一页。
     */
    isNearBottom() {
      const root = this.getRoot ? this.getRoot() : null;
      const bottom = root
        ? root.getBoundingClientRect().bottom
        : window.innerHeight || document.documentElement.clientHeight;
      // 哨兵顶部还没离开容器底边 distance 以上 → 该加载了
      // （内容不足一屏时 elTop 远小于 bottom，同样成立，起到「自动填满」的作用）
      return this.$el.getBoundingClientRect().top - bottom <= this.distance;
    },
    judge() {
      if (this.disabled) return;
      if (!this.isNearBottom()) return;
      this.$emit("enter");
    },
  },
};
</script>

<style lang='stylus'>
// 只负责「被观察到」，不参与布局表现
.blog-sentinel
  width: 100%
  height: 1px
</style>
