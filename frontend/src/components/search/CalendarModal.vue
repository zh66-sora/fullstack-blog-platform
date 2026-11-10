<template>
  <!--
    日历模态框 —— 独立组件（只负责「选一个日期」，不知道自己被谁用）

    单选模式
      从「开始日期」按钮打开 → mode='start'，只改 startDate
      从「结束日期」按钮打开 → mode='end'，只改 endDate
      但两端都预填进来，这样范围高亮始终可见，用户能看着当前区间再调其中一端。
  -->
  <el-dialog
    :visible="visible"
    width="420px"
    append-to-body
    :show-close="false"
    :close-on-click-modal="true"
    destroy-on-close
    custom-class="blog-calendar--dialog"
    @close="$emit('close')"
  >
    <div class="blog-calendar_modal--wrap">
      <!-- 头部：上月 / 月份 / 下月 / 关闭 -->
      <div class="blog-calendar_modal--header">
        <span
          class="iconfont icon-right-1-copy blog-calendar--prev"
          title="上一月"
          @click="goMonth(-1)"
        ></span>
        <!-- 月份标题：换月时左右滑动
             ⚠ :key 改成「年-月」—— 同一个节点不重建的话 <transition> 认不出子节点变了，
               不会走 enter/leave；key 一变就换节点，进出动画才触发
             ⚠ 滑动方向由 slideName 决定：下一月从右边进、上一月从左边进 -->
        <span class="blog-calendar--title">
          <transition :name="slideName">
            <span :key="monthKey" class="blog-calendar--title_text">
              {{ calendar.title }}
            </span>
          </transition>
        </span>
        <span
          class="iconfont icon-right-1-copy blog-calendar--next"
          title="下一月"
          @click="goMonth(1)"
        ></span>
        <span
          class="blog-calendar_modal--close"
          title="关闭"
          @click="$emit('close')"
          >&times;</span
        >
      </div>

      <!-- 主体：星期头 + 日期网格 -->
      <div class="blog-calendar_modal--body">
        <ul class="blog-calendar--weekdays">
          <li v-for="w in weekdays" :key="w">{{ w }}</li>
        </ul>

        <div class="blog-calendar--grid">
          <span
            v-for="day in calendar.days"
            :key="day.key"
            class="blog-calendar--day"
            :class="{
              'is-blank': day.blank,
              'is-disabled': day.isDisabled,
              'is-today': day.isToday,
              'is-in-range': day.inRange,
              'is-range-start': day.isRangeStart,
              'is-range-end': day.isRangeEnd,
            }"
            @click="handleSelect(day)"
          >
            {{ day.blank ? "" : day.isToday ? "今天" : day.day }}
          </span>
        </div>
      </div>

      <!-- 底部：当前在编辑哪一端 + 确认 -->
      <div class="blog-calendar_modal--footer">
        <span class="blog-calendar--mode_label">
          {{ mode === "start" ? "选择开始时间" : "选择结束时间" }}
        </span>
        <button class="blog-calendar--submit" @click="handleSubmit">
          确认
        </button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import { buildCalendarData } from "@/utils/calendarUtils";
import { formatDate, parseDate } from "@/utils/dateUtils";

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

export default {
  name: "CalendarModal",
  props: {
    visible: { type: Boolean, default: false },
    /** 编辑模式：'start' 改起始日期 / 'end' 改结束日期 */
    mode: { type: String, default: "start" },
    /** 面板上已有的日期（yyyy-MM-dd），用于打开时预填 + 范围高亮 */
    startDate: { type: String, default: "" },
    endDate: { type: String, default: "" },
  },
  data() {
    return {
      weekdays: WEEKDAYS,
      // 当前展示的月份（锚点）。⚠ 整体替换而不是 setMonth —— Date 是引用类型，
      // 原地改不会触发 Vue 的响应式更新。
      anchor: new Date(),
      rangeStart: null,
      rangeEnd: null,
      // 换月方向：1 = 下一月（标题自右滑入）/ -1 = 上一月（自左滑入）
      // 只驱动标题的滑动动画，不参与任何日期计算
      slideDirection: 1,
    };
  },
  computed: {
    calendar() {
      return buildCalendarData(this.anchor, this.rangeStart, this.rangeEnd);
    },
    // 标题的 transition key：年月一变就换节点
    monthKey() {
      return `${this.calendar.year}-${this.calendar.month}`;
    },
    slideName() {
      return this.slideDirection > 0
        ? "blog-calendar--slide-next"
        : "blog-calendar--slide-prev";
    },
  },
  watch: {
    // 每次打开都重置：锚定回本月、两端按外部现值预填
    visible(isOpen) {
      if (!isOpen) return;
      this.anchor = new Date();
      this.rangeStart = parseDate(this.startDate);
      this.rangeEnd = parseDate(this.endDate);
    },
  },
  methods: {
    /** 切换月份：delta = -1 / +1，跨年由 Date 自己处理（12 月 +1 → 次年 1 月） */
    goMonth(delta) {
      // 先记方向再改月份：两者在同一个 tick 里刷新，
      // <transition> 读到的就是这个方向对应的 name
      this.slideDirection = delta;
      const next = new Date(this.anchor);
      next.setMonth(next.getMonth() + delta);
      this.anchor = next;
    },

    /**
     * 选中某一天：只改 mode 对应的那一端，另一端保持不变
     * 再次点击已选中的那天 = 取消选中（toggle off，与原版一致）
     */
    handleSelect(day) {
      if (day.blank || day.isDisabled) return;
      const clicked = parseDate(day.dateStr);
      if (!clicked) return;

      if (this.mode === "start") {
        this.rangeStart =
          this.rangeStart && formatDate(this.rangeStart) === day.dateStr
            ? null
            : clicked;
      } else {
        this.rangeEnd =
          this.rangeEnd && formatDate(this.rangeEnd) === day.dateStr
            ? null
            : clicked;
      }
    },

    /**
     * 确认：校验 + 把结果抛给父组件
     * 校验失败用 toast 提示（原版也是 throw + Toast.warning），不关闭弹窗
     */
    handleSubmit() {
      if (this.mode === "start") {
        if (!this.rangeStart) {
          this.$toast.warning("请选择起始日期");
          return;
        }
        if (this.rangeEnd && this.rangeStart > this.rangeEnd) {
          this.$toast.warning("起始日期不能晚于结束日期");
          return;
        }
        this.$emit("submit", {
          mode: "start",
          dateStr: formatDate(this.rangeStart),
        });
        this.$emit("close");
        return;
      }

      if (!this.rangeEnd) {
        this.$toast.warning("请选择结束日期");
        return;
      }
      if (this.rangeStart && this.rangeEnd < this.rangeStart) {
        this.$toast.warning("结束日期不能早于起始日期");
        return;
      }
      this.$emit("submit", { mode: "end", dateStr: formatDate(this.rangeEnd) });
      this.$emit("close");
    },
  },
};
</script>

<style lang="stylus">
@import '../../assets/css/themes.styl'

// 日期格高度 / 网格行数（本文件局部常量）
// ⚠ 行数按「大月」定死 6 行：一个月的最大周数就是 6（1 号在周六 + 31 天 = 37 格），
//   最少只有 4 行（28 天且 1 号正好是周日）。
//   原来网格高度跟着月份走 → 弹窗底边来回跳（el-dialog 靠上定位，上边不动、下边动），
//   换个月整个弹窗就「抽」一下。定死之后不论哪个月，日期区恒为 6×40 + 5×2 = 250px。
$cal-day-h = 40px
$cal-rows = 6

// 弹窗外壳：element 的 el-dialog 自带 padding/圆角，日历要自己画，先归零
.blog-calendar--dialog
  background-color rgba(0,0,0,0)
  .el-dialog__header
    padding: 0
  .el-dialog__body
    padding: 0

.blog-calendar_modal--wrap
  display: flex
  flex-direction: column
  width: 100%
  overflow: hidden
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-card)
  box-shadow: $theme-shadows.lg

.blog-calendar_modal--header
  position: relative
  display: flex
  align-items: center
  justify-content: center
  gap: $theme-spacing.base
  padding: $theme-spacing.base
  border-radius: $theme-radius.md $theme-radius.md 0 0
  background-color: var(--theme-bgc-deepBtn)
  color: var(--theme-font-fst)
  font-weight: 700
  font-size: $theme-fz.lg
  flex-shrink: 0

// ===== 月份标题（换月时左右滑动）=====
// ⚠ 外框尺寸必须固定（120×32）+ overflow: hidden：
//   滑动过程中「旧标题 + 新标题」同时挂在 DOM 里，外框要是跟着内容长，
//   左右两个箭头会被挤得左右横跳
.blog-calendar--title
  position: relative
  display: flex
  align-items: center
  justify-content: center
  box-sizing: border-box
  min-width: 120px
  height: 32px
  overflow: hidden

.blog-calendar--title_text
  display: flex
  align-items: center
  justify-content: center
  white-space: nowrap

// 滑动期间：进出两段都脱离文档流，否则 flex 会把它们并排摆开、外框也被撑宽
.blog-calendar--slide-next-enter-active,
.blog-calendar--slide-next-leave-active,
.blog-calendar--slide-prev-enter-active,
.blog-calendar--slide-prev-leave-active
  position: absolute
  top: 0
  left: 0
  right: 0
  bottom: 0
  transition: transform 0.25s ease, opacity 0.25s ease

// 下一月：新标题自右滑入，旧标题向左滑出
.blog-calendar--slide-next-enter
  transform: translateX(100%)
  opacity: 0

.blog-calendar--slide-next-leave-to
  transform: translateX(-100%)
  opacity: 0

// 上一月：方向相反
.blog-calendar--slide-prev-enter
  transform: translateX(-100%)
  opacity: 0

.blog-calendar--slide-prev-leave-to
  transform: translateX(100%)
  opacity: 0

// 上/下月：给成等宽的圆形按钮
// ⚠ 原来靠 padding + hover 改 opacity，点得出但「看不出可点」；
//   换成固定 32px 圆形 + hover 半透明白底，既是对称的（标题能稳稳居中），
//   也和右下角那个白色圆形关闭键是同一套语言
.blog-calendar--prev,
.blog-calendar--next
  display: flex
  align-items: center
  justify-content: center
  box-sizing: border-box
  width: 32px
  height: 32px
  border-radius: 50%
  font-size: $theme-fz.base
  cursor: pointer
  user-select: none
  transition: background-color 0.2s ease

  &:hover
    background-color: rgba(255, 255, 255, 0.6)

.blog-calendar--prev
  transform: rotate(180deg)

.blog-calendar_modal--close
  position: absolute
  right: $theme-spacing.base
  top: 50%
  transform: translateY(-50%)
  display: flex
  align-items: center
  justify-content: center
  width: 36px
  height: 36px
  border-radius: 50%
  // 写死 #fff 在深色下是弹窗头上一块白斑，图标对比度也只有 2.35 → 走主题卡片底
  background-color: var(--theme-bgc-card)
  color: var(--theme-font-fst)
  font-size: $theme-fz.lg
  cursor: pointer
  transition: box-shadow 0.2s, transform 0.2s

  &:hover
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15)
    transform: translateY(-50%) translateY(-1px)

.blog-calendar_modal--body
  flex: 1
  overflow-y: auto
  padding: $theme-spacing.base $theme-spacing.lg

.blog-calendar--weekdays
  display: grid
  grid-template-columns: repeat(7, 1fr)
  margin: 0 0 $theme-spacing.xs 0
  padding: 0
  list-style: none
  text-align: center

  li
    color: var(--theme-font-placeholder)
    font-size: $theme-fz.sm
    // 与日期格等高（原来 36px 对 40px，星期行和第一排日期会差 4px 对不齐）
    line-height: $cal-day-h

.blog-calendar--grid
  display: grid
  grid-template-columns: repeat(7, 1fr)
  // 行数与行高都写死：月份只占 4~6 行，显式声明 6 行后不论哪个月网格都是同一高度
  // （不足 6 行时多出来的行留空，不画任何东西）
  grid-template-rows: repeat($cal-rows, $cal-day-h)
  gap: 2px

.blog-calendar--day
  display: flex
  align-items: center
  justify-content: center
  height: $cal-day-h
  // xxs(2px) 在这个尺寸下几乎是直角；xs(6px) 才有「格子」的观感
  border-radius: $theme-radius.xs
  color: var(--theme-font-light)
  font-size: $theme-fz.sm
  cursor: pointer
  user-select: none
  transition: background-color 0.15s, color 0.15s

  &:hover:not(.is-blank):not(.is-disabled)
    background-color: var(--theme-bgc-lightBtn)

  &.is-blank
    cursor: default

  // 不可选的日子：冷调灰（原来写死的 #ccc 偏暖，在整块冷色里发灰）
  &.is-disabled
    color: var(--theme-font-placeholder)
    cursor: not-allowed

  &.is-today
    color: var(--theme-font-fst)
    font-weight: 700

  // 区间两端：实心主色
  &.is-range-start,
  &.is-range-end
    background-color: var(--theme-font-fst)
    color: #fff

  // 区间内部：浅蓝连成一条带子（圆角归零才连得起来）
  &.is-in-range
    background-color: var(--theme-bgc-deepBtn)
    color: var(--theme-font-fst)
    border-radius: 0

.blog-calendar_modal--footer
  padding: $theme-spacing.base $theme-spacing.lg
  border-top: 1px solid var(--theme-border-light)
  flex-shrink: 0

.blog-calendar--mode_label
  display: block
  margin-bottom: $theme-spacing.sm
  color: var(--theme-font-trd)
  font-size: $theme-fz.sm

// 主操作：实心主色
// ⚠ 原来是「描边幽灵按钮 + hover 才变实心」，等于整张日历的主操作默认是次按钮的样子；
//   圆角也从 md(12px) 统一到项目通用的 xs(6px)
.blog-calendar--submit
  box-sizing: border-box
  width: 100%
  height: 44px
  border: 1px solid var(--theme-font-fst)
  border-radius: $theme-radius.xs
  background-color: var(--theme-font-fst)
  color: #fff
  font-size: $theme-fz.base
  cursor: pointer
  transition: all 0.2s ease

  &:hover
    border-color: var(--theme-font-sec)
    background-color: var(--theme-font-sec)
</style>
