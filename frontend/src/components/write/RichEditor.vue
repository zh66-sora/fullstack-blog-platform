<template>
  <!-- 工具栏 + 编辑区：都交给 wangEditor 自己往里渲染 -->
  <div class="rich-editor">
    <div ref="toolbar" class="rich-editor--toolbar"></div>
    <div ref="editor" class="rich-editor--area"></div>
  </div>
</template>

<script>
import { createEditor, createToolbar } from "@wangeditor/editor";
import "@wangeditor/editor/dist/css/style.css";
import { looksLikeMarkdown, markdownToHtml } from "@/utils/markdownUtils";

/**
 * 富文本编辑器子组件（wangEditor v5）
 * 1 实例的创建 / 销毁 —— SPA 里必须手动 destroy：原项目整页重载天然释放，
 * 说明:这里不销毁会残留 DOM 与事件，二次进页面会挂出两个编辑器
 * 2 图片暂存：customUpload 里只生成本地 blob 预览、把 File 攒进 pendingFiles，提交时由父级 getPendingFiles() 取走一次性上传（原项目同一套机制）
 *
 * 对外接口：
 *   props    value —— html 内容（v-model）
 *   ref 方法 getHtml() / setHtml(html) / getPendingFiles() / clearPendingFiles()
 *   ⚠ 图片暂存不参与 v-model：全量双向绑定会在每次输入时回灌 setHtml，光标会跳
 */
export default {
  name: "RichEditor",
  props: {
    value: { type: String, default: "<p><br></p>" },
    placeholder: { type: String, default: "Type here..." },
  },
  /**
   * ⚠ editor / toolbar / pendingFiles 都不能放进 data：
   *   Vue 2 会把 data 里的对象递归响应式化，而 wangEditor 实例内部会大量读写自己的属性，
   *   一旦这些属性被 Vue 换成响应式 getter / dev 下的代理，调用 editor.getHtml() 就会抛
   *   `Cannot perform 'get' on a proxy that has been revoked`（实测踩过）。
   *   放普通实例属性上，完全不参与响应式 —— 父级用 ref 方法取
   */
  created() {
    this.editor = null;
    this.toolbar = null;
    // 待上传图片：{ blobUrl, file }
    this.pendingFiles = [];
  },
  watch: {
    // 只处理「外部把内容整个换掉」（例如点清空）：内容一致就不动，避免光标乱跳
    value(next) {
      if (this.editor && next !== this.editor.getHtml())
        this.editor.setHtml(next);
    },
  },
  mounted() {
    this.editor = createEditor({
      // 传 DOM 元素而不是 '#id'：id 选择器在多实例/热更新下容易选错容器
      selector: this.$refs.editor,
      html: this.value,
      mode: "default",
      config: {
        placeholder: this.placeholder,
        /**
         * 粘贴处理
         * 自己把 markdown 转成 HTML 再插。防止格式丢失
         */
        customPaste: (editor, event) => {
          const clipboard = event.clipboardData;
          if (!clipboard) return true;
          if (clipboard.getData("text/html")) return true;
          const text = clipboard.getData("text/plain");
          if (!text || !looksLikeMarkdown(text)) return true;
          editor.dangerouslyInsertHtml(markdownToHtml(text));
          return false;
        },
        MENU_CONF: {
          uploadImage: {
            // 不实际上传：先要一个本地地址做预览，File 攒起来等提交
            customUpload: (file, insertFn) => {
              const blobUrl = URL.createObjectURL(file);
              this.pendingFiles.push({ blobUrl, file });
              insertFn(blobUrl, file.name, blobUrl);
            },
          },
        },
      },
    });

    this.toolbar = createToolbar({
      editor: this.editor,
      selector: this.$refs.toolbar,
      mode: "default",
      config: {
        excludeKeys: [
          "fullScreen", // 全屏
          "bold", // 加粗
          "underline", // 下划线
          "group-video", // 上传视频
          "fontFamily", // 字体
          "lineHeight", // 行高
        ],
      },
    });
  },
  beforeDestroy() {
    // 释放 blob + 销毁实例，顺序：先放掉暂存区的 URL，再销毁编辑器
    this.clearPendingFiles();
    if (this.toolbar) {
      this.toolbar.destroy();
      this.toolbar = null;
    }
    if (this.editor) {
      this.editor.destroy();
      this.editor = null;
    }
  },
  methods: {
    getHtml() {
      return this.editor ? this.editor.getHtml() : "";
    },
    setHtml(html) {
      if (this.editor) this.editor.setHtml(html);
    },
    // 浅拷贝返回：外部只读，别让调用方顺手改到内部数组
    getPendingFiles() {
      return [...this.pendingFiles];
    },
    // 编辑器 HTML 里的 blob 地址已替换成真实 URL 后再调：释放内存并清空暂存区
    clearPendingFiles() {
      this.pendingFiles.forEach((item) => URL.revokeObjectURL(item.blobUrl));
      this.pendingFiles = [];
    },
  },
};
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// 迁移自原项目 src/styl/write.styl 的 #editor—wrapper / #toolbar-container / #editor-container
// 描边改用主题 token（原 #ccc），与表单其它控件的描边同色
.rich-editor
  border: 1px solid var(--theme-border)

  &--toolbar
    border-bottom: 1px solid var(--theme-border)

  &--area
    height: 500px

// ===== 内容区：把 global.styl 的 reset 抹掉的原生样式补回来 =====
// markdown.styl 只补了文章正文（.markdown-body），编辑器里没人补：
//   reset 的 `font-weight: normal` + `font: inherit` 会把 <strong>/<em> 抹平，
//   于是粘进来的 **粗体** 看着一点都不粗。
// 列表圆点在 wangEditor 里是它自己渲染的 "•" 字符（data-w-e-reserve），不受影响，
// 这里顺手把 li 的标记也补上 —— 以后若有别的途径插进真实 ul/li，也有圆点。
.rich-editor--area .w-e-text-container [data-slate-editor]
  strong, b
    font-weight: 700

  em, i
    font-style: italic

  ul > li
    list-style: disc

  ol > li
    list-style: decimal

// ===== 深色模式：换掉 wangEditor 自带的那套浅色变量 =====
// 它默认白底黑字（.w-e-text-container / .w-e-bar 实测 rgb(255,255,255)），
// 深色下是整页最大的一块亮斑。它自己暴露了 --w-e-* 变量，逐个换掉即可。
:root[data-theme='dark']
  --w-e-toolbar-bg-color: var(--theme-bgc-card)
  --w-e-toolbar-color: var(--theme-font-trd)
  --w-e-toolbar-active-bg-color: var(--theme-bgc-lightBtn)
  --w-e-toolbar-active-color: var(--theme-font-fst)
  --w-e-toolbar-disabled-color: var(--theme-font-placeholder)
  --w-e-toolbar-border-color: var(--theme-border)
  --w-e-textarea-bg-color: var(--theme-bgc-card)
  --w-e-textarea-color: var(--theme-font-light)
  --w-e-textarea-border-color: var(--theme-border)
  --w-e-textarea-slight-border-color: var(--theme-border-light)
  --w-e-textarea-slight-color: var(--theme-font-trd)
  --w-e-textarea-slight-bg-color: var(--theme-bgc-chip)
  --w-e-textarea-selected-border-color: var(--theme-font-fst)
  --w-e-textarea-handler-bg-color: var(--theme-font-fst)

// ⚠ wangEditor 在 .w-e-text-container / .w-e-bar 上又各自声明了一遍这两个变量，
//   优先级比 :root 高 —— 只改 :root 的话编辑区和工具栏仍是白的，必须再压一层
:root[data-theme='dark'] .w-e-text-container,
:root[data-theme='dark'] .w-e-bar
  --w-e-textarea-bg-color: var(--theme-bgc-card)
  --w-e-textarea-color: var(--theme-font-light)
  --w-e-toolbar-bg-color: var(--theme-bgc-card)
  --w-e-toolbar-color: var(--theme-font-trd)
</style>
