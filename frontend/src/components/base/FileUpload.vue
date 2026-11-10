<template>
  <!--
    文件选择子组件
    职责边界：只做「点按钮 → 选文件 → 把 File 交给父级」，**不发请求** ——
              什么时候传、传给哪个接口由调用方决定（写博客页要和编辑器里的图片
              合并成一次 FormData，所以这里必须只暂存）。
    用法：<FileUpload v-model="coverFile" button-text="上传封面图" />
         编辑态（已经有一张封面了）：<FileUpload v-model="coverFile" :existing-value="coverUrl" … />
  -->
  <div class="file-upload">
    <input
      ref="input"
      class="file-upload--input"
      type="file"
      :accept="accept"
      @change="handleChange"
    >
    <!-- 原生 button 而非 el-button：样式沿用原项目 .blog-write--cover_btn 那套幽灵按钮 -->
    <button
      type="button"
      class="file-upload--btn"
      :class="{ 'is-selected': isSelected }"
      @click="openPicker"
    >
      {{ isSelected ? selectedText : buttonText }}
    </button>
  </div>
</template>

<script>
/**
 * 选完文件后只 emit，不碰接口：
 *   ① 选中的 File 通过 v-model 回给父级暂存；
 *   ② 每次选完把 input.value 清掉 —— 否则「再选同一个文件」不会再触发 change，
 *      想换一张同名的图就换不动了。
 */
export default {
  name: "FileUpload",
  props: {
    // 已选中的文件（v-model），null = 没选
    // ⚠ 类型要写 File 而不是 Object：File 不是 plain object，写 Object 会报
    //   `Invalid prop: type check failed for prop "value". Expected Object, got File`
    value: { type: File, default: null },
    /**
     * 「外面已经有一份值了」—— 编辑态回填的封面 URL。
     *
     * ⚠ 不要把它塞进 value：value 的类型就是 File，传字符串会触发上面那条 prop 类型告警
     *   （URL 和 File 是两种东西，不该挤进同一个 prop）。
     *   它只负责让按钮进入「已选择」态；要换图仍然点按钮选一个新文件。
     */
    existingValue: { type: String, default: "" },
    accept: { type: String, default: "image/*" },
    buttonText: { type: String, default: "选择文件" },
    selectedText: { type: String, default: "✓ 已选择" },
  },
  computed: {
    // 本次选了文件、或外面已经有一份值（编辑态回填）→ 都算「已选择」
    isSelected() {
      return !!this.value || !!this.existingValue;
    },
  },
  methods: {
    openPicker() {
      this.$refs.input.click();
    },
    handleChange(event) {
      const file = event.target.files && event.target.files[0];
      if (file) this.$emit("input", file);
      event.target.value = "";
    },
  },
};
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// 迁移自原项目 src/styl/write.styl 的 .blog-write--cover（封面图上传）
.file-upload
  display: flex
  align-items: center

  &--input
    display: none

  &--btn
    display: inline-flex
    align-items: center
    justify-content: center
    gap: 6px
    box-sizing: border-box
    width: 130px
    height: 36px
    padding: 0
    border: 1px solid var(--theme-font-fst)
    border-radius: $theme-radius.md
    background-color: transparent
    color: var(--theme-font-fst)
    font-size: $theme-fz.sm
    white-space: nowrap
    cursor: pointer
    transition: all 0.2s ease

    &:hover
      background-color: var(--theme-bgc-lightBtn)

    // 已选：按钮变实心，代替原项目「按钮文案换成 ✓ 已选择」的状态提示
    &.is-selected
      border: none
      background-color: var(--theme-font-fst)
      color: #fff

      &:hover
        background-color: var(--theme-font-sec)
</style>
