<template>
  <div class="blog-nav-btn">
    <!-- 登录：icon-denglu（与原头部一致），点击弹登录表单 -->
    <i
      class="iconfont icon-denglu blog-nav-login"
      title="登录"
      @click="openDialog('login')"
    ></i>
  </div>
</template>

<script>
import mixins from '../../mixins/index';

export default {
  mixins:[mixins]
}
</script>

<style lang='stylus'>
.blog-nav-btn
  display flex
  align-items center
  justify-content center
  gap 12px

  i
    font-size 20px
    cursor pointer
    color var(--theme-font-light)
    transition color 0.2s

    &:hover
      color var(--theme-font-fst)
</style>
