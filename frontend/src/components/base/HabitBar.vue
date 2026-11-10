<template>
  <!--
    赞 / 踩 复用组件
    三处使用，靠数据决定「有没有踩」：
      博客文章（Article.vue）    —— 赞 + 踩
      评论 / 回复（评论区）      —— 赞 + 踩
      文章列表（ArticleCard*）   —— 只传 likes，不传 dislikes → 只渲染赞
    ⚠ 是否渲染「踩」完全由 dislikes 传没传决定，不靠 variant，避免各处再传一堆开关。
  -->
  <div class="blog-habit--bar" :class="{ 'blog-habit--bar_single': !hasDislike }">
    <el-button
      class="blog-habit--btn blog-habit--like"
      :class="{ 'is-active': active === 'liked' }"
      :title="likeText"
      @click="$emit('like')"
    >
      <i class="iconfont" :class="likeIconClass"></i>
      <span v-if="showText" class="blog-habit--label">{{ likeText }}</span>
      <span class="blog-habit--cnt">{{ likes }}</span>
    </el-button>

    <el-button
      v-if="hasDislike"
      class="blog-habit--btn blog-habit--dislike"
      :class="{ 'is-active': active === 'disliked' }"
      :title="dislikeText"
      @click="$emit('dislike')"
    >
      <i class="iconfont" :class="dislikeIconClass"></i>
      <span v-if="showText" class="blog-habit--label">{{ dislikeText }}</span>
      <span class="blog-habit--cnt">{{ dislikes }}</span>
    </el-button>
  </div>
</template>

<script>
export default {
  name: "HabitBar",
  props: {
    // 赞数
    likes: { type: Number, default: 0 },
    /**
     * 踩数。传 null / undefined / 不传 → 不渲染踩（文章列表就是这个用法）
     * 文章列表只有「点赞」统计，没有点踩，所以不能写死成 0 去判断
     */
    dislikes: { type: Number, default: null },
    /**
     * 当前用户的态度：'liked' | 'disliked' | ''
     * 决定图标用实心还是描边（后端 comments/like 会回 userAction，
     * 但列表接口不带这个状态，所以这里允许为空 —— 空就是不高亮）
     */
    active: { type: String, default: "" },
    likeText: { type: String, default: "赞" },
    dislikeText: { type: String, default: "踩" },
    /**
     * 是否把文字标签（赞 / 踩）渲染出来，默认不渲染（只留图标 + 数字）
     *
     * 文章列表卡片与详情页底部要开（原文只有数字，光看图标不容易分辨赞还是踩），
     * 评论区不开 —— 那里一行里挤了「赞 12 踩 0 回复」，再加文字会太满
     */
    showText: { type: Boolean, default: false },
  },
  computed: {
    hasDislike() {
      return this.dislikes !== null && this.dislikes !== undefined;
    },
    // 点赞图标：已赞用实心 icon-xihuan，未赞用描边 icon-xihuan1
    // （与原项目 buildArticleViewModel 的 likeIconClass 同一套）
    likeIconClass() {
      return this.active === "liked" ? "icon-xihuan" : "icon-xihuan1";
    },
    // iconfont 里只有 dislike-fill 一个点踩图标（没有描边版本），
    // 所以踩的选中/未选中只靠 .is-active 换颜色，不换图标
    dislikeIconClass() {
      return "icon-dislike-fill";
    },
  },
};
</script>
