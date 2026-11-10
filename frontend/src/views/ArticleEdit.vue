<template>
  <!--
    编辑博客（路由 /write/:id）—— 一个薄壳

    为什么不直接让路由指 Write.vue：
      Write 在 Home.vue 的 keep-alive 的 include 里（"Index,Write"），缓存的是
      **组件实例**。如果编辑也用同一份路由记录，就会和「写博客写到一半的草稿」
      共用同一个实例 —— 点进编辑会把它重置掉，草稿静默消失。

      这里套一层：本组件（name: ArticleEdit）不在 include 名单里，所以
        · /write        渲染 Write       → 走缓存，草稿留着
        · /write/:id    渲染 ArticleEdit  → 不进缓存，里面的 Write 是另一个实例
      两条线互不干扰，Write.vue 那边一行缓存逻辑都不用改。

    ⚠ 只传 id，其余（拉详情、回填、锁标题与板块、保存）全在 Write.vue 的编辑态里 ——
      表单只有一份实现。
  -->
  <Write :article-id="$route.params.id" />
</template>

<script>
import Write from "./Write.vue";

export default {
  name: "ArticleEdit",
  components: { Write },
};
</script>
