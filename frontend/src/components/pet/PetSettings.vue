<template>
  <!--
    菲比桌宠 · 控件表单（被 views/Pet.vue 当正文使用）
    =========================================================================
    一张表驱动的表单：分组 / 选项 / 候选全部来自 config/pet.config.js，
    这里只负责「渲染 + 改值」，一个写死的选项文案都没有 —— 加选项 = 改配置表。

    交互口径（需求明确要求）：
      · **点击即生效**，没有编辑态、没有保存按钮；
      · 配置全部落在前端本地（localStorage 一份 petConfig），刷新/重开都记得住；
      · 「定制化形象」是**触发按钮 / 开关**：点一下直接在运行中的桌宠身上做一次，
        同时把选择记下来（下次进站重放）。所以它走事件总线（一次性动作），
        而记录本身走 Vuex —— 与 FLOAT_* 同一判断口径。
  -->
  <div class="blog-profile--body">
    <!-- ═══════════ 桌宠 ═══════════ -->
    <h4 class="blog-form--section_title">桌宠</h4>

    <div class="blog-write--field">
      <label class="blog-write--label">菲比桌宠</label>
      <div class="bp-control">
        <el-switch :value="enabled" @change="onEnabled"></el-switch>
        <span class="bp-state">{{ enabled ? '已开启' : '已关闭' }}</span>
      </div>
    </div>

    <div class="blog-write--field">
      <label class="blog-write--label">大小</label>
      <div class="bp-control">
        <el-radio-group :value="size" @input="onSize">
          <el-radio-button
            v-for="opt in SIZE_OPTIONS"
            :key="opt.value"
            :label="opt.value"
          >{{ opt.label }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- ═══════════ 表情 ═══════════ -->
    <h4 class="blog-form--section_title">表情</h4>

    <div class="blog-write--field">
      <label class="blog-write--label">表情</label>
      <div class="bp-control">
        <el-radio-group :value="expression" @input="onExpression">
          <el-radio-button
            v-for="name in EXPRESSION_OPTIONS"
            :key="name"
            :label="name"
          >{{ name }}</el-radio-button>
        </el-radio-group>
      </div>
    </div>

    <!-- ═══════════ 定制化形象 ═══════════ -->
    <h4 class="blog-form--section_title">定制化形象</h4>

    <!-- ① 墨镜：一件配饰的三个状态，做成三个互斥按钮 -->
    <div class="blog-write--field">
      <label class="blog-write--label">{{ LOOK_MIRROR.title }}</label>
      <div class="bp-control">
        <button
          v-for="code in LOOK_MIRROR.codes"
          :key="code"
          class="bp-look"
          :class="{ 'is-active': look.mirror === code }"
          @click="onMirror(code)"
        >{{ labelOf(code) }}</button>
      </div>
    </div>

    <!-- ② 其它形象：表格，一行两个；每项一个开关，两端就是出现 / 消失 -->
    <div class="blog-write--field">
      <label class="blog-write--label">其它形象</label>
      <div class="bp-table">
        <div
          v-for="(row, rowIndex) in lookRows"
          :key="rowIndex"
          class="bp-table--row bp-table--look"
        >
          <!-- 一行两格：每格「名称 + 出现/消失开关」，两格之间一条竖细线（样式见 .bp-table--look）
               ⚠ 这里刻意**不用**内层 v-for + 模板字符串 key：Vue 2 下
                 `<template v-for>` 里给子节点拼 key 容易被 lint/vetur 标红，
                 而且每行固定两格，直接写出来更好读（奇数时第二格自动不渲染） -->
          <div class="bp-look_cell">
            <span class="bp-look_name">{{ row[0].label }}</span>
            <el-switch
              :value="isOn(row[0])"
              active-text="出现"
              inactive-text="消失"
              @change="onLookItem(row[0], $event)"
            ></el-switch>
          </div>

          <div v-if="row[1]" class="bp-look_cell">
            <span class="bp-look_name">{{ row[1].label }}</span>
            <el-switch
              :value="isOn(row[1])"
              active-text="出现"
              inactive-text="消失"
              @change="onLookItem(row[1], $event)"
            ></el-switch>
          </div>
        </div>
      </div>
    </div>

    <!-- ═══════════ 动作选单 ═══════════ -->
    <h4 class="blog-form--section_title">动作选单</h4>

    <div class="blog-write--field">
      <div class="bp-table">
        <div class="bp-table--row bp-table--head bp-table--quick">
          <span class="bp-quick_name">动作</span>
          <span class="bp-quick_no">按钮</span>
          <span class="bp-quick_op">操作</span>
        </div>
        <div
          v-for="code in QUICK_ACTION_CANDIDATES"
          :key="code"
          class="bp-table--row bp-table--quick"
        >
          <span class="bp-quick_name">{{ labelOf(code) }}</span>
          <span class="bp-quick_no">{{ buttonNo(code) }}</span>
          <span class="bp-quick_op">
            <button
              v-if="isPicked(code)"
              class="bp-op"
              @click="removeAction(code)"
            >移除</button>
            <button
              v-else
              class="bp-op"
              :disabled="isFull"
              @click="addAction(code)"
            >添加</button>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapActions } from 'vuex'
import {
  SIZE_OPTIONS,
  EXPRESSION_OPTIONS,
  LOOK_MIRROR,
  LOOK_TABLE,
  QUICK_ACTION_CANDIDATES,
  QUICK_ACTION_MAX,
  labelOf,
} from '@/config/pet.config'
import bus, { EVENTS } from '@/utils/eventBus'

// 「一行两个」的表格：先把配置切成两两一组（8 项 → 4 行）
function chunk (list, size) {
  const rows = []
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size))
  return rows
}

export default {
  name: 'PetSettings',

  data () {
    return {
      // 配置表在这里落到模板上（只读，页面里不再写死任何选项）
      SIZE_OPTIONS,
      EXPRESSION_OPTIONS,
      LOOK_MIRROR,
      QUICK_ACTION_CANDIDATES,
      QUICK_ACTION_MAX,
      lookRows: chunk(LOOK_TABLE, 2),
    }
  },

  computed: {
    ...mapGetters('pet', ['isEnabled', 'size', 'expression', 'quickActions', 'look']),
    enabled () {
      return this.isEnabled
    },
    isFull () {
      return this.quickActions.length >= QUICK_ACTION_MAX
    },
  },

  methods: {
    ...mapActions('pet', [
      'setEnabled',
      'setSize',
      'setExpression',
      'addQuickAction',
      'removeQuickAction',
      'setLookMirror',
      'setLookItem',
    ]),

    labelOf,

    onEnabled (value) {
      this.setEnabled(value)
    },
    onSize (value) {
      this.setSize(value)
    },
    onExpression (value) {
      this.setExpression(value)
    },

    /**
     * 形象类操作：先记到 store（持久化 + 高亮/开关状态），
     * 再走总线让运行中的桌宠立刻做一次。
     * 桌宠没开时没人接总线 —— 没关系，下次加载会按存下来的这份重放
     */
    onMirror (code) {
      this.setLookMirror(code)
      bus.$emit(EVENTS.PET_MOTION, code)
    },
    onLookItem (item, value) {
      const state = value ? 'on' : 'off'
      this.setLookItem({ key: item.key, value: state })
      bus.$emit(EVENTS.PET_MOTION, state === 'on' ? item.on : item.off)
    },

    /** 形象表格里某一项现在是不是「出现」态（没动过 = 关 = 消失，也就是模型的自然状态）*/
    isOn (item) {
      return !!item && this.look.items[item.key] === 'on'
    },

    isPicked (code) {
      return this.quickActions.includes(code)
    },
    /** 已选动作在悬浮按钮上的编号（1 起）；没选返回占位符 */
    buttonNo (code) {
      const i = this.quickActions.indexOf(code)
      return i < 0 ? '—' : i + 1
    },
    addAction (code) {
      this.addQuickAction(code)
    },
    removeAction (code) {
      this.removeQuickAction(code)
    },
  },
}
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// ============================================================
// 控件行：顶替 .blog-write--input 的位置
// 沿用输入框那套「1px 边框 + 上沿不留边（跟 label 色块拼在一起）+ 下面三个圆角」，
// 于是这一行和资料表单里的输入行长得一模一样 —— 这是本组表单唯一需要补的样式，
// 其余（卡片壳 / 顶栏 / 分区标题 / 字段标签）全部复用 form.styl、profile.styl
// ============================================================
.bp-control
  display flex
  align-items center
  flex-wrap wrap
  // ⚠ gap 必须带冒号：无冒号写法会被这份 Stylus 当成选择器（见 .bp-table--look 的说明）
  gap: $theme-spacing.sm $theme-spacing.base
  box-sizing border-box
  width 100%
  min-height 46px
  padding 6px $theme-spacing.base
  border 1px solid var(--theme-border)
  border-top none
  border-radius 0 $theme-radius.xs $theme-radius.xs $theme-radius.xs
  // 与编辑态输入框同色：白底 = 这里能改
  background-color var(--theme-bgc-input-edit)

.bp-state
  font-size $theme-fz.sm
  color var(--theme-font-light)

// 字段说明：常显的小字（form.styl 里的 .blog-profile--input_hint 默认 display:none、
// 只在校验失败时显示，不能拿来当说明用）
.bp-hint
  margin-top $theme-spacing.sm
  font-size $theme-fz.sm
  line-height 1.7
  color var(--theme-font-light)

  kbd
    padding 0 4px
    border-radius 4px
    background-color var(--theme-bgc-deepBtn)
    color var(--theme-font-fst)

// ===== 墨镜组：一排触发按钮（点一下立刻生效）=====
.bp-look
  padding 4px 10px
  border 1px solid var(--theme-border)
  border-radius $theme-radius.xs
  background-color var(--theme-bgc-card)
  color var(--theme-font-light)
  font-size $theme-fz.sm
  cursor pointer
  transition all .15s ease

  &:hover
    border-color var(--theme-font-fst)
    color var(--theme-font-fst)

  &.is-active
    border-color var(--theme-font-fst)
    background-color var(--theme-bgc-deepBtn)
    color var(--theme-font-fst)

// ===== 表格：两块共用（其它形象 / 动作选单）=====
// 用 div 网格而不是 <table>：要和上面那些控件行的边框/圆角语言一致，
// 也想让它跟着容器宽度走（窄屏时文字列自动收窄）
.bp-table
  box-sizing border-box
  width 100%
  border 1px solid var(--theme-border)
  border-radius $theme-radius.xs
  background-color var(--theme-bgc-input-edit)
  overflow hidden

.bp-table--row
  display flex
  align-items center
  padding 8px $theme-spacing.base
  font-size $theme-fz.sm
  color var(--theme-font-light)

  & + .bp-table--row
    border-top 1px solid var(--theme-border)

.bp-table--head
  background-color var(--theme-bgc-deepBtn)
  color var(--theme-font-fst)

// ── 其它形象：一行两个「名称 + 开关」，两格之间一条竖细线 ──
.bp-table--look
  position relative
  display grid
  // 两半等宽；分隔线由 ::before 画，左右间隔由两格各自的 padding 给
  grid-template-columns 1fr 1fr
  // ⚠ 这份 Stylus **不认 `gap` 属性名**：无冒号的 `gap 6px …` 会被当成选择器 ——
  //   不只这一行失效，紧随其后的规则还会被拼成无效选择器、整条被浏览器丢掉
  //   （本文件里凡是 gap 都写成带冒号的，与 form.styl 的 `gap:` 一致）

  // 左右分区的分隔线：与边框同色，绝对定位钉在行正中
  // （不靠某一格的 border：两格内容宽度怎么变都不会歪）
  &::before
    content ''
    position absolute
    left 50%
    top 8px
    bottom 8px
    width 1px
    background-color var(--theme-border)

// 每一格（名称 + 出现/消失开关）
.bp-look_cell
  display flex
  align-items center
  gap: $theme-spacing.base
  min-width 0

  // 分隔线两侧各留一段空白 —— 这就是「左右分区的间隔」
  &:first-child
    padding-right $theme-spacing.lg

  &:last-child
    padding-left $theme-spacing.lg

.bp-look_name
  // 撑满整格：开关于是贴在每一格的右端，两半各自纵向对齐
  flex 1
  min-width 0
  color var(--theme-font-fst)

// ── 动作选单：动作 / 按钮 / 操作 三列 ──
.bp-quick_name
  flex 1
  min-width 0

.bp-quick_no
  width 56px
  text-align center

.bp-quick_op
  width 72px
  text-align right

.bp-op
  padding 2px 10px
  border 1px solid var(--theme-border)
  border-radius $theme-radius.xs
  background-color var(--theme-bgc-card)
  color var(--theme-font-light)
  font-size $theme-fz.sm
  cursor pointer

  &:hover:not(:disabled)
    border-color var(--theme-font-fst)
    color var(--theme-font-fst)

  &:disabled
    opacity .45
    cursor not-allowed
</style>
