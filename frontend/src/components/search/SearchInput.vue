<template>
  <!--
    受控搜索输入框
    
    对外契约：
      :value     —— 外部当前值（URL 派生的筛选值），组件只在它变化时回灌输入框
      @input     —— 每次键入（v-model 用）
      @search    —— (value, reason) 防抖结束 / 回车 / 清空时触发（真正该发请求的时机）
                    reason 说明这次是怎么来的，调用方据此决定 push 还是 replace：
                      'enter'    回车 —— 明确动作，适合 push（留一条历史）
                      'debounce' 打字停顿自动 —— 中间态，适合 replace（别塞历史）
                      'clear'    点清空 —— 与 debounce 同理
  -->
  <div class="blog-search--input" :class="{ 'is-disabled': disabled }">
    <input
      ref="input"
      type="text"
      class="blog-search--input_inner"
      :placeholder="placeholder"
      :value="inner"
      :disabled="disabled"
      @input="handleInput"
      @keyup.enter="handleEnter"
      @compositionstart="handleCompositionStart"
      @compositionend="handleCompositionEnd"
    />
    <!-- 清空按钮：原版没有，输入框里打了字没法一键清掉（锁定态不渲染） -->
    <i
      v-if="clearable && inner && !disabled"
      class="iconfont icon-guanbi blog-search--input_clear"
      title="清空"
      @click="handleClear"
    ></i>
  </div>
</template>

<script>
export default {
  name: "SearchInput",
  props: {
    // 外部值（通常是路由 query 派生的筛选值）
    value: { type: String, default: "" },
    placeholder: { type: String, default: "搜索" },
    // 防抖延迟：停止输入多久后触发 search（回车不受它约束，立即触发）
    debounce: { type: Number, default: 500 },
    clearable: { type: Boolean, default: true },
    // 锁定（他人主页下作者框）：禁用输入 + 隐藏清空按钮
    disabled: { type: Boolean, default: false },
  },
  data() {
    return {
      // 输入框的真实内容。刻意与 value 分开：
      // 用户每敲一个字都去改 URL 会产生一串历史记录，所以「正在输入」是本地态，
      // 只有防抖结束 / 回车才上抛给外部去改 URL。
      inner: this.value,
      timer: null,
      // 中文输入法正在拼字（拼音还没上屏）
      composing: false,
    };
  },
  watch: {
    // 外部值变了才回灌 —— 例如从别的页面带着 ?q=xxx 回到首页、或点了「清空筛选」
    // 注意：自己输入导致的 URL 变化回灌回来的是同一个字符串，不会打断输入
    value(next) {
      if (next === this.inner) return;
      this.inner = next;
    },
  },
  beforeDestroy() {
    // 组件销毁时把待执行的防抖一并取消，避免向已销毁的实例回调
    clearTimeout(this.timer);
  },
  methods: {
    handleInput(e) {
      this.inner = e.target.value;
      this.$emit("input", this.inner);
      // 中文输入法拼字过程中**不能搜**：
      //   输入框里是「密桃zai」这种拼音中间态，debounce 一到就会把它当关键词发出去，
      //   搜出来当然是空的（实测日志里 q=密桃zai / q=mi'mi 就是这么来的）。
      //   等 compositionend 拿到上屏后的完整词再搜。
      if (this.composing || e.isComposing) return;
      this.scheduleSearch();
    },

    handleCompositionStart() {
      this.composing = true;
      // 拼字期间已经排队的搜索也取消，避免它带着中间态触发
      clearTimeout(this.timer);
    },

    handleCompositionEnd(e) {
      this.composing = false;
      this.inner = e.target.value;
      this.$emit("input", this.inner);
      // 上屏后才是用户真正想搜的词
      this.scheduleSearch();
    },

    /**
     * 回车：立即搜索，取消还在等的防抖
     * 对应原版 keyup 里 clearTimeout(_timer) 再 callback —— 用户按回车就是不想等
     */
    handleEnter() {
      // 输入法里回车是「选词 / 上屏」，不是搜索
      if (this.composing) return;
      clearTimeout(this.timer);
      this.emitSearch("enter");
    },

    scheduleSearch() {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => {
        this.emitSearch("debounce");
      }, this.debounce);
    },

    /**
     * 唯一的「该搜了」出口 —— 同时告诉调用方这次是怎么来的：
     *   'enter'    回车：用户明确动作，调用方适合 push（历史里留一条）
     *   'debounce' 打字停顿自动触发：中间态，调用方适合 replace（别塞历史）
     *   'clear'    点清空：同 debounce
     * 调用方（Head / SearchPanel）依据它决定用 push 还是 replace 改地址栏。
     */
    emitSearch(reason = "debounce") {
      // 与原版一致：trim 后再交给调用方，避免搜到一堆空格
      this.$emit("search", (this.inner || "").trim(), reason);
    },

    handleClear() {
      clearTimeout(this.timer);
      this.inner = "";
      this.$emit("input", "");
      // 清空是明确的意图，不用再等防抖
      this.$emit("search", "", "clear");
      this.focus();
    },

    // ---- 供父组件通过 ref 调用 ----
    focus() {
      this.$nextTick(() => {
        this.$refs.input && this.$refs.input.focus();
      });
    },
    blur() {
      this.$refs.input && this.$refs.input.blur();
    },
  },
};
</script>

<style lang="stylus">
@import '../../assets/css/themes.styl'

// 只给「输入框这一小块」的通用外观，尺寸/定位交给使用方（头部 vs 面板差很多）
// 配色统一走 themes.styl 的冷调 token（原来是 #ddd / #F5F5F5 / #999 一串暖灰）
.blog-search--input
  position relative
  display flex
  align-items center

  .blog-search--input_inner
    width: 100%
    height: 32px
    box-sizing: border-box
    padding: 0 26px 0 10px
    border: 1px solid var(--theme-border)
    border-radius: $theme-radius.xs
    background-color: var(--theme-bgc-input)
    color: var(--theme-font-light)
    outline: none
    font-size: $theme-fz.sm

    &::placeholder
      color: var(--theme-font-placeholder)

    &:focus
      border-color: var(--theme-font-fst)

  &.is-disabled
    .blog-search--input_inner
      cursor: not-allowed
      // 锁定态用「只读」那一档底色，与可编辑的白底区分开
      background-color: var(--theme-bgc-input)

  .blog-search--input_clear
    position: absolute
    right: 10px
    font-size: $theme-fz.sm
    color: var(--theme-font-placeholder)
    cursor: pointer

    &:hover
      color: var(--theme-font-fst)
</style>
