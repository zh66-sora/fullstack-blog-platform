<template>
  <!--
    板块导航页的单个板块行
      模板：myBlog/src/template/columnNav.hbs 的 <li class="blog-column--item">
      样式：myBlog/src/styl/index.styl 第 430-469 行

    三块内容：绝对定位的占比填充条（底层） + 图标/名称（内容层） + 右侧「N 篇」
    点整行 → emit('select', item)；跳文章列表还是兜底页由父级（Column.vue）决定，
    所以本组件不认识 $router，也不认识「有没有文章」这件事。
  -->
  <li
    class="blog-column--item"
    :style="{
      '--column-fill': item.ratioPercent + '%',
      '--column-fill-opacity': item.fillOpacity,
    }"
    @click="$emit('select', item)"
  >
    <!-- 占比填充条 —— 宽度/透明度由行上的 CSS 变量给（见下方样式说明） -->
    <span class="blog-column--fill"></span>

    <div class="blog-column--content">
      <i class="iconfont blog-column--icon" :class="item.icon"></i>
      <span class="blog-column--name">{{ item.name }}</span>
    </div>

    <span class="blog-column--count">{{ item.count }} 篇</span>
  </li>
</template>

<script>
export default {
  name: "ColumnItem",
  props: {
    // buildColumnViewModel 产出的一条：{ id, name, icon, count, ratioPercent, fillOpacity }
    item: { type: Object, required: true },
  },
};
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// ============================================================
// ⚠ 声明统一写「属性: 值」带冒号形式 —— Stylus 对「无冒号 + 值是多段」有歧义：
//   紧跟缩进更深的嵌套块时会被当成选择器解析、整条静默丢失（详见 component.styl 顶部）。

.blog-column--item
  position: relative
  display: flex
  align-items: center
  justify-content: space-between
  padding: $theme-spacing.base $theme-spacing.lg
  border-radius: $theme-radius.xs
  // 原项目写的是 $theme-colors.bgc-linkCard（#F7F7F7）
  background-color: var(--theme-bgc-linkCard)
  overflow: hidden
  cursor: pointer
  transition: box-shadow 0.2s ease

  // hover：淡阴影 + 填充条铺满整行
  &:hover
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1)

    .blog-column--fill
      width: 100%

// ===== 占比填充条（底层）=====
.blog-column--fill
  position: absolute
  top: 0
  left: 0
  width: var(--column-fill, 0%)
  height: 100%
  opacity: var(--column-fill-opacity, 0.3)
  // 原项目此处硬编码 #C6E1FF，正好等于主题的 bgc-deepBtn —— 换成变量后主题切换才跟得上
  background-color: var(--theme-bgc-deepBtn)
  border-radius: $theme-radius.xs
  transition: width 0.2s ease
  z-index: 0

// ===== 内容层（压在填充条上方）=====
.blog-column--content
  position: relative
  z-index: 1
  display: flex
  align-items: center
  gap: $theme-spacing.sm

.blog-column--icon
  font-size: 20px
  color: var(--theme-font-fst)

.blog-column--name
  font-size: $theme-fz.base
  color: var(--theme-font-light)

.blog-column--count
  position: relative
  z-index: 1
  font-size: $theme-fz.sm
  color: var(--theme-font-trd)
</style>
