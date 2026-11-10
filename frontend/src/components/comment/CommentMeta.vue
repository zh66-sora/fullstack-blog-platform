<template>
  <!--
    评论 / 回复的元信息行：昵称 + 「回复 @xxx」+ 删除按钮 + IP 属地
    顶层评论与回复共用，靠 variant 切换类名（两套字号/配色不同），
    靠 showIp / deletable 控制详略 —— 这正是原项目 mapReply 与 mapReplyForModal 分家的原因，
    在 Vue 里退化成一个 prop。
  -->
  <div :class="metaClass">
    <div class="blog-comment--meta_top">
      <span :class="nicknameClass">{{ record.author.name }}</span>

      <!-- 「回复 @xxx」：列表预览里只有回复对象不是楼主才显示；弹窗扁平列表里只要有 replyTo 就显示 -->
      <template v-if="record.isNestedReply">
        <span class="blog-comment--reply_at">回复</span>
        <span class="blog-comment--reply_at_name">@{{ record.replyTo.name }}</span>
      </template>

      <!-- 删除：原项目只给顶层评论留了入口，回复没有，这里保持一致 -->
      <el-button
        v-if="showDelete"
        class="blog-comment--delete"
        title="删除"
        @click="$emit('delete')"
      >
        <i class="iconfont icon-guanbi"></i>
      </el-button>
    </div>

    <span v-if="showIp" class="blog-comment--ip">{{ record.ipLocation }}</span>
  </div>
</template>

<script>
export default {
  name: "CommentMeta",
  props: {
    // 评论 / 回复的 viewModel（buildComment*ViewModel 的产物）
    record: { type: Object, required: true },
    // 'comment' | 'reply' —— 决定用哪套类名
    variant: { type: String, default: "comment" },
    // 列表里的回复预览不显示 IP；弹窗里显示
    showIp: { type: Boolean, default: true },
    // 是否允许删除。不传 → 跟随 variant（只有顶层评论可删，与原项目一致）；
    // 弹窗里的父评论要显式传 false（原项目那边只给了赞/踩）
    deletable: { type: Boolean, default: null },
  },
  computed: {
    metaClass() {
      return this.variant === "reply"
        ? "blog-comment--reply_meta"
        : "blog-comment--meta";
    },
    nicknameClass() {
      return this.variant === "reply"
        ? "blog-comment--reply_nickname"
        : "blog-comment--nickname";
    },
    showDelete() {
      const allowed = this.deletable === null ? this.variant === "comment" : this.deletable;
      // canDelete 已把「作者本人」和「管理端删更低等级者」两种情况算在一起（见 commentUtils.mapBase）；
      // 老数据没有这个字段时回退到 isAuthor
      const permitted = this.record.canDelete ?? this.record.isAuthor;
      return allowed && permitted;
    },
  },
};
</script>
