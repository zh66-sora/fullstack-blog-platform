<template>
  <!--
    侧边浮动按钮组（胶囊形快捷选单）
    配置：config/float.config.js —— 按当前路由决定有哪些按钮
    挂载：Home.vue —— 全站只渲染一次；fixed 定位，不参与布局

    v-if="buttons.length"：当前路由在配置表里没有按钮就整个不渲染
      （根节点 v-if 在 Vue 2 里是允许的，组件会渲染成一个空注释节点）
  -->
  <div
    v-if="buttons.length"
    class="blog-float hidden-md-and-down"
    v-clickoutside="close"
  >
    <!-- 折叠态：圆形开关 -->
    <el-button
      class="blog-float--toggle"
      :class="{ 'is-active': open }"
      circle
      @click="toggle"
    >
      <i class="iconfont icon-shang"></i>
    </el-button>

    <!-- 展开态：胶囊形按钮组（bottom 锚定，向上生长） -->
    <div class="blog-float--menu" :class="{ 'is-visible': open }">
      <el-tooltip
        v-for="btn in buttons"
        :key="btn.key"
        :content="btn.tip"
        placement="left"
        :open-delay="200"
      >
        <el-button class="blog-float--btn" circle @click="handle(btn.key)">
          <!-- icon 是整个 class 串（iconfont 用 'iconfont icon-xxx'、Element 图标用 'el-icon-xxx'），
               两套图标字体各有自己的 class 前缀，配置层决定用哪套 -->
          <i :class="btn.icon"></i>
        </el-button>
      </el-tooltip>
    </div>
  </div>
</template>

<script>
/**
 * Element 内部指令（dropdown / select / popover 都用它实现「点外部关闭」）：
 * 自带 el.contains 判断，unbind 时自动摘监听 —— 比手写 document 监听省心，
 * 也不会有原实现里「$(document).on('click') 注册后永不销毁」的问题。
 *
 * 不想依赖内部 API 的话，换成下面三行等价写法即可：
 *   mounted()  { document.addEventListener('click', this.onDocumentClick) }
 *   beforeDestroy() { document.removeEventListener('click', this.onDocumentClick) }
 *   methods: { onDocumentClick(e) { if (!this.$el.contains(e.target)) this.close() } }
 */
import { mapState } from "vuex";
import Clickoutside from "element-ui/lib/utils/clickoutside";
import floatConfig, { FLOAT_BUTTONS } from "@/config/float.config";
import { scrollToContentTop } from "@/utils/scroll";
import bus, { EVENTS } from "@/utils/eventBus";

export default {
  name: "FloatMenu",
  // Clickoutside 决定了点击外面触发，clickoutside规定了指令名字
  directives: { clickoutside: Clickoutside },

  data() {
    return {
      open: false,
    };
  },

  computed: {
    // 全站的点赞态度都放在 store.article.reactions 里（见 store/modules/article.js）
    ...mapState("article", ["reactions"]),

    /**
     * 当前用户对本文的态度：'liked' | 'disliked' | 'none'
     *
     * 只有文章详情页知道这个值，它把结果写进 store，这里按「当前路由的 id」取。
     * 不再是自己存一份 data 等总线回传 —— 那时换一篇文章要在路由 watch 里手动
     * 复位成 'none'，现在是 computed：$route.params.id 一变就自动重算，天然不会串。
     */
    reaction() {
      const record = this.reactions[this.$route.params.id];
      return (record && record.reaction) || "none";
    },

    /**
     * 当前路由该有哪些按钮 —— 「根据路由读取配置」
     *
     * 用 computed 而不是在 watch 里手动赋值：$route 本身是响应式的，
     * Home.vue 虽然不会因路由切换而重建，但组件里的 $route.name 一变，
     * 这个 computed 会自动重算 —— 不需要额外维护一份「当前按钮列表」的 state。
     * watch 留给「路由变化要产生的副作用」（收起菜单，见下）。
     */
    buttons() {
      const keys = floatConfig[this.$route.name] || [];
      return keys.reduce((list, key) => {
        const meta = FLOAT_BUTTONS[key];
        // 配置表里写了没登记的 key：跳过而不是报错，避免手滑写错字就白屏
        if (!meta) return list;
        list.push({
          key,
          tip: meta.tip,
          // 有 activeIcon 的按钮（点赞）跟随 reaction 切实心 / 描边
          icon:
            meta.activeIcon && this.reaction === "liked"
              ? meta.activeIcon
              : meta.icon,
        });
        return list;
      }, []);
    },
  },

  watch: {
    /**
     * 路由变化：收起菜单
     * 原实现里菜单会跨页保持展开（静态模板不重建，属遗留行为），这里顺手修掉。
     * 点赞态度不用在这里复位 —— reaction 是 computed，跟着路由 id 自动重算。
     */
    $route() {
      this.close();
    },
  },

  methods: {
    toggle() {
      this.open = !this.open;
    },
    close() {
      this.open = false;
    },

    // 按注册表里的 action 名分发到本组件的方法
    handle(key) {
      const meta = FLOAT_BUTTONS[key];
      const fn = meta && this[meta.action];
      if (typeof fn === "function") fn();
    },

    /**
     * 去顶部：滚到正文最上方（Home.vue 的 el-main 顶部），与路由切换归位同一口径
     *
     * ⚠ 与原实现的差异：原实现是 $('html,body').animate({ scrollTop: 0 }, 400)，
     *   滚到的是 window 顶部 —— 那里是整屏横幅，不是内容。
     *   现在全站统一成「el-main 的最上方」（见 utils/scroll.js）。
     */
    goTop() {
      scrollToContentTop({ behavior: "smooth" });
      this.close();
    },

    // 刷新：与原实现一致整页重载（不关菜单，页面马上就没了）
    refresh() {
      window.location.reload();
    },

    /**
     * 点赞 / 评论：不在本组件做，交给文章详情页
     * —— 只有它持有 article 数据、也拿得到 CommentSection 实例
     *
     * 这里只把「要做什么」广播出去（事件总线），详情页 mounted 时订阅、收到后执行。
     * 这是一次性动作、不需要留下任何值，所以走总线而不是 Vuex：
     *   Vuex 里没有「事件」，只能存一个 { seq, type } 靠自增 seq 骗 watch 触发，
     *   而 $emit 天然是一次性的 —— 连点两次点赞就触发两次。
     * （点赞的「结果」仍然是状态，走 store 的 article/syncReaction，见 reactions）
     */
    like() {
      bus.$emit(EVENTS.FLOAT_LIKE);
    },
    comment() {
      bus.$emit(EVENTS.FLOAT_COMMENT);
    },
  },
};
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// ============================================================
// 迁移自 myBlog/src/styl/comment.styl 第 367–438 行（.blog-float--*）
// 视觉与原实现保持一致，只有两处必要改动：
//   ① 原生 button → el-button：要剥掉 Element 的 padding / border /
//      border-radius / 背景 / hover 与 active 的配色（见下面第一节）
//   ② 图标颜色写在 i 上（原实现也是）—— Element 的
//      `.el-button--default:active` 会把按钮 color 改成蓝色，
//      i 自己有 color 就不会被继承污染
//
// ⚠ 声明统一写「属性: 值」带冒号形式：Stylus 对「无冒号 + 值是多段」
//   有歧义，紧跟缩进更深的嵌套块时会被当成选择器解析、整条静默丢失。
// ============================================================

// ===== 公共：剥掉 el-button 的外观 =====
// 权重 (0,3,0)：(0,3,0) > Element 的 `.el-button--small.is-circle` (0,2,0)
// 与 HabitBar 的做法一致（见 assets/css/component.styl 的 .blog-habit--btn）
.blog-float
  .el-button.blog-float--toggle,
  .el-button.blog-float--btn
    margin: 0
    padding: 0
    border: none
    display: flex
    align-items: center
    justify-content: center
    box-shadow: none

    &:hover,
    &:focus,
    &:active
      border: none

// ===== 折叠态：圆形开关 =====
.blog-float .el-button.blog-float--toggle
  opacity: 0.4
  position: fixed
  right: 24px
  bottom: 60px
  width: 46px
  height: 46px
  border-radius: 50%
  background-color: var(--theme-font-fst)
  color: #fff
  font-size: 20px
  box-shadow: $theme-shadows.base
  // 原值是 500 / 499：与 Head 的 500 同层，但两者一个在顶部一个在右下，
  // 实际不会重叠（NProgress 1031、Element 弹窗基数 3000 都在其之上），故沿用原值
  z-index: 500
  transition: transform 0.3s, box-shadow 0.2s

  &.is-active
    transform: rotate(180deg)
    opacity: 1

  // Element 的 hover / active 会把背景与文字色改成主色蓝，这里全部按原样式压回去
  &:hover,
  &:focus,
  &:active
    background-color: var(--theme-font-fst)
    color: #fff

  &:hover
    box-shadow: $theme-shadows.lg

// ===== 展开态：胶囊按钮组 =====
.blog-float .blog-float--menu
  position: fixed
  // 胶囊比圆形开关宽 4px（42 + 左右各 4 内边距 = 50px vs 开关 46px）：
  // 右移 2px 才能与开关同心（两处都写 24px 的话开关会相对胶囊偏右 2px）
  right: 22px
  // 紧贴开关上方：开关占 bottom 60 ~ 106px，这里留 8px 间隙
  //（原样式写 176px —— 比开关顶边还高 70px，视觉上就是「按钮组飘在半空」）
  bottom: 114px
  display: flex
  flex-direction: column
  gap: 4px
  background-color: var(--theme-bgc-card)
  border-radius: 24px
  padding: 4px
  box-shadow: $theme-shadows.lg
  z-index: 499
  opacity: 0
  transform: translateY(8px)
  pointer-events: none
  transition: opacity 0.25s, transform 0.25s

  &.is-visible
    opacity: 1
    transform: translateY(0)
    pointer-events: auto

// ===== 菜单内的圆形按钮 =====
.blog-float .el-button.blog-float--btn
  width: 42px
  height: 42px
  border-radius: 50%
  background: none
  // 未点击状态没有底色（Element 默认是灰底 + 边框）
  &:hover,
  &:focus,
  &:active
    background-color: var(--theme-bgc-deepBtn)

  i
    // 抹平 Element 图标的基础样式：[class^=el-icon-] 会给 24px 宽度，
    // 而 iconfont 的 <i> 是内容宽度。两套图标要长得一样，宽度统一交给 flex 居中
    width: auto
    font-size: 20px
    color: var(--theme-font-light)

  &:hover i,
  &:focus i,
  &:active i
    color: var(--theme-font-fst)
</style>
