<template>
  <!--
    留言输入卡片

    与评论输入框（components/comment/CommentInput.vue）的关系：**共用同一套样式类**，
    但逻辑是各写一份 —— 留言墙的规则跟评论区差得太多：
      ① 纯文字：没有图片上传入口（需求「不允许留言带图片」）
      ② 有字数上限 30，且要实时计数、超限拦住提交
      ③ 没有表情面板（一期不做；要加就照 CommentInput 那段搬过来）
    反过来，两边都是「受控采集端」：自己只管输入内容，提交一律抛给父级。

    ⚠ 字数按**码点**算（wallTextLength），与后端 `[...content].length` 同一口径 ——
      用 .length 的话一个 emoji 会算成 2 个字，前端放行的 30 字到后端变 31 被拒。
  -->
  <el-card class="blog-card blog-comment--input_card" shadow="never">
    <div class="blog-comment--input_header">
      留下一句想说的话吧，会显示在 TA 的留言板上
    </div>

    <el-input
      ref="input"
      v-model="content"
      class="blog-comment--textarea"
      type="textarea"
      :rows="3"
      resize="none"
      :placeholder="placeholder"
    ></el-input>

    <div class="blog-comment--input_footer">
      <!-- 左：回复目标提示 / 右：字数 + 提交（评论区这边是「表情 + 图片」，这里换成计数） -->
      <div class="blog-wall--input_tools">
        <span v-if="replyTarget" class="blog-wall--replying">
          正在回复
          <b>@{{ replyTarget.name }}</b>
          <el-button class="blog-wall--cancel" @click="$emit('cancel-reply')">
            取消
          </el-button>
        </span>
        <span v-else class="blog-wall--tip">仅文字，最多 {{ maxLen }} 个字</span>
      </div>

      <div class="blog-wall--submit_group">
        <span class="blog-wall--counter" :class="{ 'is-over': overLimit }">
          {{ textLength }}/{{ maxLen }}
        </span>
        <el-button
          class="blog-btn--submit"
          :disabled="!canSubmit"
          :loading="submitting"
          @click="handleSubmit"
        >
          {{ replyTarget ? "回复" : "发表留言" }}
        </el-button>
      </div>
    </div>
  </el-card>
</template>

<script>
import { WALL_MAX_LEN, wallTextLength } from "@/utils/wallUtils";

// 「回复 @昵称: 」前缀：与 CommentInput 同一套处理（切换回复对象不冲掉草稿）
const PREFIX_RE = /^回复 @[^:：]+[:：]\s*/;
const prefixOf = (name) => `回复 @${name}: `;

export default {
  name: "WallInput",
  props: {
    // 正在回复的目标：{ parentId, replyTo, name } | null
    replyTarget: { type: Object, default: null },
    // 提交中 → 按钮转 loading 并拦重复提交
    submitting: { type: Boolean, default: false },
  },
  data() {
    return {
      content: "",
      maxLen: WALL_MAX_LEN,
    };
  },
  computed: {
    textLength() {
      return wallTextLength(this.content);
    },
    overLimit() {
      return this.textLength > this.maxLen;
    },
    canSubmit() {
      return !!this.content.trim() && !this.overLimit && !this.submitting;
    },
    placeholder() {
      return `最多 ${this.maxLen} 个字~`;
    },
  },
  watch: {
    replyTarget(target) {
      if (!target) return;
      this.content = `${prefixOf(target.name)}${this.content.replace(PREFIX_RE, "")}`;
      this.focus();
    },
  },
  methods: {
    handleSubmit() {
      if (!this.canSubmit) {
        // 超限给一句提示：按钮是禁用的，但用户可能还在打字，得知道为什么发不出去
        if (this.overLimit) this.$toast.info(`留言最多 ${this.maxLen} 个字`);
        return;
      }
      this.$emit("submit", { content: this.content });
    },
    // ---- 供父级通过 ref 调用 ----
    reset() {
      this.content = "";
    },
    focus() {
      this.$nextTick(() => {
        if (this.$refs.input) this.$refs.input.focus();
      });
    },
  },
};
</script>
