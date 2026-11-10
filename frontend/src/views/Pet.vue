<template>
  <!--
    扩展功能 · 菲比桌宠控件页（/pet）
    =========================================================================
    这一层只做「页面壳」：卡片 + 顶栏（与「修改个人资料」同一套 .blog-write--* 样式），
    表单本体全部在 components/pet/PetSettings.vue 里 ——
    以后「扩展功能」再长别的控件（主题色、背景图…），换个表单组件即可，壳不用动。

    交互：表单里的每一项**点击即生效**（没有编辑态 / 保存按钮），
    配置存在前端本地（store/modules/pet.js ←→ localStorage 的 petConfig）。
  -->
  <el-card class="blog-card blog-write--editor" shadow="never">
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        title="返回主页"
        @click="goBack"
      ></span>
      <h3>扩展功能</h3>
    </div>

    <PetSettings />
  </el-card>
</template>

<script>
import PetSettings from '@/components/pet/PetSettings.vue'

export default {
  name: 'Pet',
  components: { PetSettings },
  methods: {
    // 与 Info.vue 的返回键同一去向：回首页
    goBack () {
      this.$router.push({ name: 'Index' })
    },
  },
}
</script>
