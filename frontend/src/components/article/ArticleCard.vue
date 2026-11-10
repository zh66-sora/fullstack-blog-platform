<template>
  <!-- 文章卡片 · 无封面版（原项目 .blog-card，操作按钮嵌在 info 区内） -->
  <!-- 迁移自 myBlog/src/template/articleList.hbs 的 unless coverImage 分支 -->
  <!--
    整张卡片可点 → 进入文章详情，对应原项目的 data-route="article/{{id}}"
    （原项目只在右侧箭头按钮和评论按钮上挂了 route，小屏把箭头隐藏后就没有入口了；
      这里把整卡做成入口，卡片内部未实现的交互按钮用 .stop 拦住）
  -->
  <el-card class="blog-card" shadow="never" @click.native="goDetail">
    <!-- 卡片头部：标题。用 el-card 的 header 插槽，渲染成 .el-card__header -->
    <div slot="header" class="blog-card--header">
      <!-- 命中关键词时用后端高亮的标题（纯文本 + <mark>，后端已转义） -->
      <h3 v-if="article.hasHighlight" v-html="article.titleHtml"></h3>
      <h3 v-else>{{ article.title }}</h3>
    </div>

    <!-- 卡片信息区（无封面时占满整行） -->
    <div class="blog-card--info">
      <!-- 信息行：发布日 / 板块 / 字数 / 更新日 -->
      <div class="blog-article--info">
        <span
          v-for="(item, i) in article.info"
          :key="i"
          class="blog-article--info_item"
        >
          <i class="iconfont" :class="item.icon"></i>
          <span v-for="(label, j) in item.label" :key="j">
            <!-- 板块名可点（原项目留的入口，跳板块页待做）→ 用 .stop 挡住卡片跳转 -->
            <a v-if="label.touch" href="javascript:void(0)" @click.stop>{{ label.data }}</a>
            <template v-else>{{ label.data }}</template>
          </span>
        </span>
      </div>

      <!-- 标签 chips（最多 3 个）—— 点标签跳首页并按该标签筛选 -->
      <div v-if="article.hasTags" class="blog-article--tags">
        <i class="iconfont icon-biaoqian"></i>
        <a
          v-for="(tag, i) in article.tags"
          :key="i"
          class="blog-tag--chip_display"
          href="javascript:void(0)"
          @click.stop="goTag(tag)"
        >{{ tag }}</a>
      </div>

      <!-- 摘要：搜索命中时用「围绕命中词截取的片段 + <mark>」，否则用普通纯文本摘要 -->
      <p
        v-if="article.hasHighlight"
        class="blog-introduction--article"
        v-html="article.highlightSnippet"
      ></p>
      <p v-else class="blog-introduction--article">{{ article.summary }}</p>

      <!-- 操作按钮：无封面时嵌在 info 区内 -->
      <div class="blog-btn--actions">
        <!--
          点赞：与文章详情 / 评论区共用 HabitBar。
          文章列表只有赞、没有踩 —— 不传 dislikes，组件就只渲染赞（这就是「靠数据判断有没有踩」）。
          active 由列表数据带过来的 userReaction 决定（已赞实心 / 未赞描边）。
          show-text：文字「赞」+ 数字（原来只有数字，光看图标分不清赞还是踩）
          .stop 挡住整卡跳转；点赞交给 Index.vue 处理（它持有列表数据与登录态）
        -->
        <span class="blog-btn--habit blog-btn--like" @click.stop>
          <HabitBar
            :likes="article.stats.likes"
            :active="article.userReaction"
            show-text
            @like="$emit('like')"
          />
        </span>
        <!-- 评论：原项目就是跳详情页，所以不拦，跟着卡片一起跳
             ⚠ 图标 / 文字 / 数字各占一个元素（文字也包一层 span），间距统一由父级 gap 给 -->
        <span class="blog-btn--habit blog-btn--favorite">
          <span class="habit-info">
            <a href="javascript:void(0)">
              <i class="iconfont icon-pinglun"></i>
              <span class="habit-label">评论</span>
            </a>
          </span>
          <span class="habit-cnt">{{ article.stats.comments }}</span>
        </span>
        <!-- 浏览：纯展示型元数据，不是可点项 —— 不用 <a>、也不拦事件，
             点它跟卡片走（进详情页）；样式上无手型、无 hover 反馈 -->
        <span class="blog-btn--habit blog-btn--view">
          <span class="habit-info">
            <i class="iconfont icon-yuedu"></i>
            <span class="habit-label">浏览</span>
          </span>
          <span class="habit-cnt">{{ article.stats.views }}</span>
        </span>
      </div>
    </div>

    <!-- 无限面时右侧的箭头按钮（绝对定位）—— 点它同样进详情 -->
    <span class="blog-btn--read_icon">
      <a href="javascript:void(0)">
        <i class="iconfont icon-right-1-copy"></i>
      </a>
    </span>

    <!-- 小屏卡片合并时的分隔线 -->
    <span class="blog-card--underLine"></span>
  </el-card>
</template>

<script>
import HabitBar from "@/components/base/HabitBar.vue";

export default {
  name: "ArticleCard",
  components: { HabitBar },
  props: {
    // buildArticleListViewModel 产出的一篇文章
    article: {
      type: Object,
      required: true,
    },
  },
  methods: {
    // 进入文章详情页 /article/:id
    goDetail() {
      this.$router.push({ name: "Article", params: { id: this.article.id } });
    },

    /**
     * 点标签 → 跳首页并按该标签筛选
     *
     * 只带 tag 一个 query：从列表里点标签的语义是「看这个标签的全部文章」，
     * 把上一轮的 q/category/时间等条件一起带过去只会让人以为没生效。
     * 写在 query 上的 tag 会被 Index 的 parseFilters 收进 filters，
     * 再由 toRequestParams 拼成后端 /articles/search?tag=xxx。
     */
    goTag(tag) {
      if (!tag) return;
      this.$router.push({ name: "Index", query: { tag: String(tag) } });
    },
  },
};
</script>
