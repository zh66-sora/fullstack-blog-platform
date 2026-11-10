<template>
  <!--
    下拉选择 —— 替代原生 <select>
    =======================================================================
    为什么不用原生 select：它的弹层由操作系统绘制，颜色、圆角、字体都跟本站
    「浅色卡片 + 主题色」那一套对不上（深色模式下尤其突兀）。这里用按钮 + 浮层
    自绘，全部走 --theme-* 变量，切主题色 / 昼夜时能一起变。

    用法（与 v-model 同构）：
      <BlogSelect v-model="filters.role" :options="[{value:'',label:'全部角色'}]" />

    行为：
      · 点按钮展开 / 收起，点外面或按 Esc 收起
      · 选中项高亮，展开时打勾
      · 只做单选；placeholder 在未选中（value 为空串）时显示
  -->
  <div ref="wrap" class="blog-select" :class="{ 'is-open': open, 'is-disabled': disabled }">
    <button
      type="button"
      class="blog-select--trigger"
      :disabled="disabled"
      @click.stop="toggle"
    >
      <span class="blog-select--label" :class="{ 'is-placeholder': !current }">
        {{ current ? current.label : placeholder }}
      </span>
      <i class="iconfont icon-shang blog-select--arrow"></i>
    </button>

    <transition name="blog-select">
      <ul v-if="open" class="blog-select--panel">
        <li
          v-for="opt in options"
          :key="String(opt.value)"
          class="blog-select--item"
          :class="{ 'is-active': opt.value === value }"
          @click="pick(opt)"
        >
          <span class="blog-select--text">{{ opt.label }}</span>
          <!-- 选中标记用一个小圆点：iconfont 里没有对勾字形，
               拿 icon-right-1-copy（右箭头）当勾会被误读成「进下一级」 -->
          <span v-if="opt.value === value" class="blog-select--dot"></span>
        </li>
      </ul>
    </transition>
  </div>
</template>

<script>
export default {
  name: "BlogSelect",
  props: {
    // 当前值（v-model）
    value: { type: [String, Number], default: "" },
    // [{ value, label }]
    options: { type: Array, default: () => [] },
    placeholder: { type: String, default: "请选择" },
    disabled: { type: Boolean, default: false },
  },
  data() {
    return { open: false };
  },
  computed: {
    current() {
      return this.options.find((opt) => opt.value === this.value) || null;
    },
  },
  mounted() {
    document.addEventListener("click", this.close);
    document.addEventListener("keydown", this.onKey);
  },
  beforeDestroy() {
    document.removeEventListener("click", this.close);
    document.removeEventListener("keydown", this.onKey);
  },
  methods: {
    toggle() {
      if (this.disabled) return;
      this.open = !this.open;
    },
    pick(opt) {
      // 关面板放在 emit 前：父组件更新 value 会触发重渲染，先关避免闪一下
      this.open = false;
      if (opt.value !== this.value) this.$emit("input", opt.value);
      this.$emit("change", opt.value);
    },
    close() {
      this.open = false;
    },
    onKey(e) {
      if (e.key === "Escape") this.open = false;
    },
  },
};
</script>
