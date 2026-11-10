<template>
  <!--
    评论输入卡片
    纯受控的「采集端」：自己只管输入内容与待上传的文件，不碰任何接口 ——
    上传和提交都由 CommentSection 统一做（对外只抛 submit）。
    「正在回复谁」由父级通过 replyTarget 传进来，不藏在 textarea 的属性里
    （原项目用 textarea 的 data-parent-id / data-reply-to，并且靠 $('.blog-comment--textarea')
     全局选择器取值，页面上有第二个输入框就会串）。
  -->
  <el-card class="blog-card blog-comment--input_card" shadow="never">
    <div class="blog-comment--input_header">良言一句三冬暖，恶语伤人六月寒</div>

    <!-- 输入框：el-input 的 textarea 形态（样式打在 .el-textarea__inner 上，见 comment.styl） -->
    <el-input
      ref="input"
      v-model="content"
      class="blog-comment--textarea"
      type="textarea"
      :rows="3"
      resize="none"
      placeholder="发一条友善的评论吧~"
    ></el-input>

    <div class="blog-comment--input_footer">
      <div class="blog-comment--input_tools">
        <!--
          表情：面板与聊天室共用 components/base/EmojiPanel.vue
          ⚠ 「触发按钮 + 面板」必须一起包进 .blog-emoji--wrap：
            面板靠 absolute 定位在它上面弹出，wrap 同时也是「点外面收起」的判定边界
            （只判面板自己会把点按钮也当成点外面，面板就永远打不开）
        -->
        <span class="blog-emoji--wrap">
          <el-button
            class="blog-comment--tool_btn"
            :class="{ 'is-active': showEmoji }"
            title="表情"
            @click="showEmoji = !showEmoji"
          >
            <i class="iconfont icon-biaoqing"></i>
          </el-button>
          <EmojiPanel
            :visible="showEmoji"
            @select="insertEmoji"
            @close="showEmoji = false"
          />
        </span>

        <!--
          图片：el-upload 只当「打开文件选择器」的壳（auto-upload=false、不显示文件列表），
          选中的文件先暂存，等提交时由 CommentSection 统一上传
          on-change 是 el-upload 组件的一个回调函数，作用是：当文件状态发生改变时（选中文件、上传成功、上传失败），它都会被调用。
        -->
        <el-upload
          class="blog-comment--tool_upload"
          action="#"
          accept="image/*"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="handlePickImage"
        >
          <el-button class="blog-comment--tool_btn" title="上传图片">
            <i class="iconfont icon-picfill"></i>
          </el-button>
        </el-upload>

        <span v-if="pendingFile" class="blog-comment--pic_name">
          {{ pendingFile.name }}
        </span>
      </div>

      <!-- 发表按钮用全局的 .blog-btn--submit（与登录表单、确认弹窗同一套） -->
      <el-button
        class="blog-btn--submit"
        :loading="submitting"
        @click="handleSubmit"
      >
        发表评论
      </el-button>
    </div>
  </el-card>
</template>

<script>
// 表情面板与聊天室共用（配置见 config/emoji.config.js，样式见 assets/css/emoji.styl）
import EmojiPanel from "@/components/base/EmojiPanel.vue";

// 「回复 @昵称: 」前缀的识别与生成
// 原项目是直接 $textarea.val('回复 @xxx: ') —— 会把用户已经打好的草稿整个冲掉；
// 这里保留同样的可见行为，但改成「剥掉旧前缀再套新前缀」，切换回复对象不会丢草稿
const PREFIX_RE = /^回复 @[^:：]+[:：]\s*/;
const prefixOf = (name) => `回复 @${name}: `;

export default {
  name: "CommentInput",
  components: { EmojiPanel },
  props: {
    // 正在回复的目标：{ parentId, replyTo, name } | null
    replyTarget: { type: Object, default: null },
    // 提交中（图片上传 + 发评论整段时间）→ 按钮转 loading 并拦重复提交
    submitting: { type: Boolean, default: false },
  },
  data() {
    return {
      content: "",
      // 暂存选中的文件，提交时才上传
      pendingFile: null,
      // 表情面板开关
      showEmoji: false,
    };
  },
  watch: {
    replyTarget(target) {
      if (!target) return;
      this.content = `${prefixOf(target.name)}${this.content.replace(
        PREFIX_RE,
        ""
      )}`;
      this.focus();
    },
  },
  methods: {
    handlePickImage(file) {
      // el-upload 的 file 是它自己包装过的对象，raw 才是原生 File
      if (!file || !file.raw) return;
      this.pendingFile = file.raw;
    },
    handleSubmit() {
      if (this.submitting) return;
      // 内容合法性判断交给 CommentSection（提示语和登录判断都在那边，只留一处）
      this.$emit("submit", { content: this.content, file: this.pendingFile });
    },
    /**
     * 在光标处插入表情
     * ⚠ 不能用 content += emoji：v-model 只管值、不维护光标，直接拼串会把表情
     *   丢到末尾 —— 用户正在句子中间打字时会跑到最后去。
     *   el-input(textarea) 的原生节点在 $refs.input.$refs.textarea 上。
     */
    insertEmoji(emoji) {
      const native = this.$refs.input && this.$refs.input.$refs.textarea;
      if (!native) {
        this.content += emoji;
        return;
      }

      const start =
        native.selectionStart == null ? this.content.length : native.selectionStart;
      const end = native.selectionEnd == null ? start : native.selectionEnd;
      this.content =
        this.content.slice(0, start) + emoji + this.content.slice(end);

      // DOM 更新后再落光标，否则 setSelectionRange 会被 Vue 的 patch 冲掉
      this.$nextTick(() => {
        native.focus();
        const pos = start + emoji.length;
        native.setSelectionRange(pos, pos);
      });
    },
    // ---- 供 CommentSection 通过 ref 调用 ----
    reset() {
      this.content = "";
      this.pendingFile = null;
      this.showEmoji = false;
    },
    // 点击评论icon自动聚焦到输入框
    focus() {
      // el-input 自带 focus()，但要在 DOM 更新后调（回复目标变化会触发重新渲染）
      this.$nextTick(() => {
        if (this.$refs.input) this.$refs.input.focus();
      });
    },
  },
};
</script>
