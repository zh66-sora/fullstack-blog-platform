<template>
  <!--
    他人主页（/user/:id）—— 一层薄壳

    ⚠ 为什么不能直接让路由指向 Index.vue：
      Home.vue 里是 `<keep-alive include="Index,Write">`，include 匹配的是**组件的 name 选项**。
      若路由 `/user/:id` 直接渲染 Index（哪怕换了个路由名、换了条记录），
      命中的仍是同一个 name → 与他人主页和自己的 /index **共用同一个缓存实例**：
      页码、已拉到的文章、滚动位置、`filtersAtLeave` 筛选指纹会互相串
      （表现为：从自己的列表进他人主页，看到的还是自己那一页，再返回又串回去）。

      于是照 views/ArticleEdit.vue 那套做法加这层壳：
        · /index      → 渲染 Index       （name 在 include 里，走缓存，滚动位置与页码都能还原）
        · /user/:id   → 渲染 UserHome    （name 不在 include 里，里面的 Index 是**另一个实例**，
                                          不进缓存、不与他人页面共享状态）

    ⚠ 内层 Index 挂 :key="authorId"：
      从 /user/A 切到 /user/B 时，UserHome 这个实例会被 Vue 复用（同一组件、不在 keep-alive 里也一样），
      不给 key 的话内层 Index 不会重建，列表就不会重新取数。
  -->
  <Index :key="authorId" />
</template>

<script>
import Index from "@/views/Index.vue";

export default {
  name: "UserHome",
  components: { Index },
  computed: {
    /**
     * 被访问用户的 id —— 只用来当内层 Index 的 :key（从 /user/A 切到 /user/B 时强制重建，
     * 否则 Vue 复用同一个 Index 实例、列表不会重新取数）。
     * ⚠ 数据本身不靠 prop 传：Index 内部用 mixins/visitContext.js 从 $route 里读同一个 id。
     */
    authorId() {
      return String(this.$route.params.id || "");
    },
  },
};
</script>
