<template>
  <!--
    调色盘面板（挂在页头的调色盘图标下，定位容器由 Head.vue 提供）

    只有一行：色带 + 重置。
      色带 —— 0~355 每 5 一档（共 72 档，见 themeRuntime 的 HUE_STOPS），可点可拖，带滑块
      重置 —— 回到默认色相

    为什么是「一根渐变条 + 滑块」而不是 72 个按钮：
      72 个 5px 宽的小格子既点不准也看不清；渐变条 + 档位吸附（每 5° 一格）
      手感更好，档位数量还是 72。
    位置 / 尺寸不在这里管 —— 由 Head.vue 决定（它才是那个 fixed 容器的使用者）。

    ⚠ 这里刻意**没有**「当前色相 210°」那行文字和 5 个色块预览：
      站点本身会实时变色，预览是多余的；度数对用户也没有意义。
  -->
  <div class="blog-color--panel">
    <div
      ref="band"
      class="blog-color--band"
      @mousedown="startDrag"
      @click="pickFromEvent"
    >
      <span class="blog-color--thumb" :style="thumbStyle"></span>
    </div>

    <!--
      重置：直接复用项目通用的实心主按钮 `.blog-btn--submit`
      （主题色底 + 白字 + 柔光，与登录框「登录」、评论「发布」同一个语言），
      只在下面把尺寸压小一号 —— 弹层里不需要页面按钮那么大的体量。
    -->
    <el-button
      class="blog-btn--submit blog-color--reset"
      :disabled="isDefaultHue"
      @click="resetHue"
    >重置</el-button>
  </div>
</template>

<script>
import { mapGetters } from "vuex";
import { HUE_STOPS, HUE_STEP } from "@/utils/themeRuntime";

/**
 * 滑块直径（px）
 * ⚠ 必须与样式里 .blog-color--thumb 的 width / height 一致 ——
 *   滑块的「可移动区间」= 色带宽度 − 滑块直径，两边对不上就会有一侧露到色带外。
 */
const THUMB_SIZE = 16;

export default {
  name: "ColorPicker",

  data() {
    return {
      // 拖动中：期间只改本地色相，松手才写 store（避免拖一次塞几十条 localStorage 写入）
      dragging: false,
      draftHue: null,
    };
  },

  computed: {
    ...mapGetters("theme", ["hue", "isDefaultHue"]),

    /** 拖动中用草稿值，否则用 store 里的值 */
    shownHue() {
      return this.draftHue === null ? this.hue : this.draftHue;
    },

    /**
     * 滑块位置：left = 色相占比 × (色带宽度 − 滑块直径)
     *
     * ⚠ 不能写成 `left: hue/360*100%` 再配 `margin-left: -8px`（原来的写法）：
     *   那是拿「滑块中心」去对齐色带两端，色相为 0 时滑块左半边露在色带外，
     *   355 时右半边露在右边。改成「滑块左边缘只在 [0, 宽−直径] 区间内移动」
     *   之后，两个端点上滑块都完整落在色带里。
     *
     * ⚠ 滑块本体是**纯白实心**（见样式），这里不给它上色：
     *   试过「填充当前主题色」，但色带本身就是那个颜色 ——
     *   滑块滑到自己的色相上时和色带糊成一片，看着跟原来的空心圈一模一样。
     */
    thumbStyle() {
      const ratio = Math.min(1, Math.max(0, this.shownHue / 360));
      return { left: `calc(${ratio.toFixed(4)} * (100% - ${THUMB_SIZE}px))` };
    },
  },

  methods: {
    /**
     * 由鼠标横坐标算出色相（吸附到 5° 档）
     *
     * ⚠ 上限必须夹住：
     *   原实现是 `Math.floor(ratio * 360) % 360` —— 拖到最右端时 ratio 正好为 1，
     *   floor(360) = 360，`% 360` 又把它绕回 0，于是滑块从最右瞬移到最左
     *   （就是「把按钮拉到最右侧、继续拉就回到开头」）。
     *   现在改成用档位下标直接夹上限，最多到 355，不会再绕。
     */
    hueFromEvent(e) {
      const rect = this.$refs.band.getBoundingClientRect();
      // 以「滑块中心」对齐鼠标 → 先把鼠标横坐标扣掉半个滑块
      const x = e.clientX - rect.left - THUMB_SIZE / 2;
      const travel = Math.max(1, rect.width - THUMB_SIZE);
      const ratio = Math.min(1, Math.max(0, x / travel));
      const stop = Math.min(
        HUE_STOPS.length - 1,
        Math.round((ratio * 360) / HUE_STEP)
      );
      return HUE_STOPS[stop];
    },
    pickFromEvent(e) {
      this.$store.dispatch("theme/setHue", this.hueFromEvent(e));
    },

    // ---- 拖动：按下 → 跟随 → 松手落库 ----
    startDrag(e) {
      e.preventDefault();
      this.dragging = true;
      this.draftHue = this.hueFromEvent(e);
      window.addEventListener("mousemove", this.onDrag);
      window.addEventListener("mouseup", this.endDrag);
    },
    onDrag(e) {
      if (!this.dragging) return;
      this.draftHue = this.hueFromEvent(e);
    },
    endDrag() {
      if (!this.dragging) return;
      this.dragging = false;
      window.removeEventListener("mousemove", this.onDrag);
      window.removeEventListener("mouseup", this.endDrag);
      if (this.draftHue !== null && this.draftHue !== this.hue) {
        this.$store.dispatch("theme/setHue", this.draftHue);
      }
      this.draftHue = null;
    },
    resetHue() {
      this.$store.dispatch("theme/resetHue");
    },
  },

  beforeDestroy() {
    window.removeEventListener("mousemove", this.onDrag);
    window.removeEventListener("mouseup", this.endDrag);
  },
};
</script>

<style lang="stylus">
@import '../../assets/css/themes.styl'

// 色带的彩虹底色
// ⚠ 饱和度和明度压到 72% / 58%，和 themeRuntime 里主题色的柔化保持同一档观感：
//   原来的 hsl(·, 86%, 68%) 本身就是一条很刺眼的彩虹，
//   「颜色太鲜艳刺眼」的第一眼印象就来自它。
$rainbow = linear-gradient(to right, hsl(0, 72%, 58%) 0%, hsl(60, 72%, 58%) 17%, hsl(120, 72%, 58%) 33%, hsl(180, 72%, 58%) 50%, hsl(240, 72%, 58%) 67%, hsl(300, 72%, 58%) 83%, hsl(360, 72%, 58%) 100%)

.blog-color--panel
  display: flex
  align-items: center
  gap: $theme-spacing.base
  padding: $theme-spacing.xs 0
  text-align: left

.blog-color--band
  position: relative
  flex: 1
  height: 16px
  border-radius: 8px
  background: $rainbow
  cursor: pointer
  touch-action: none

.blog-color--thumb
  position: absolute
  top: 50%
  // ⚠ 宽高必须与 script 里的 THUMB_SIZE 一致
  width: 16px
  height: 16px
  border: 2px solid #fff
  border-radius: 50%
  // 实心：纯白圆点 + 外圈细描边
  // （原来只有 2px 白环、内部透明 —— 色带的颜色从圈里透出来，看着就是个空心圈）
  background-color: #fff
  box-shadow: 0 0 0 1px var(--theme-border), 0 1px 3px rgba(0, 0, 0, 0.3)
  transform: translateY(-50%)
  pointer-events: none
  // 不加 transition —— 拖动时位置要即时跟随，加过渡反而显得粘手

// 重置按钮
// 底色 / 白字 / 柔光 / 圆角全部继承 .blog-btn--submit（那就是「本项目常见的主题色按钮」），
// 这里只压尺寸 + 补禁用态。
// ⚠ 选择器写成「容器 + el-button + 自有类」= (0,3,0)，
//   才能压过 component.styl 里 .el-button.blog-btn--submit 的 (0,2,0)，
//   与样式注入顺序无关。
.blog-color--panel .el-button.blog-color--reset
  flex: 0 0 auto
  height: 28px
  padding: 0 $theme-spacing.base
  font-size: $theme-fz.sm

// 已在默认色相上 → 按钮置灰（用项目里的禁用按钮底，和别处的禁用态一个灰）
.blog-color--panel .blog-color--reset:disabled,
.blog-color--panel .blog-color--reset.is-disabled
  border-color: var(--theme-bgc-disabledBtn)
  background-color: var(--theme-bgc-disabledBtn)
  color: #fff
  box-shadow: none
</style>
