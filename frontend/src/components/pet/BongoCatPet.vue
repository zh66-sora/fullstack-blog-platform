<template>
  <!--
    菲比桌宠 —— 视图组件（唯一碰 DOM / Pixi 生命周期的地方）
    挂载点：Home.vue（`v-if="petEnabled"`），与 FloatMenu / AuthModal 同一层。
    定位：视口左下角，left/bottom 各 20px（尺寸来自「私有定制 → 大小」，见 computed）。

    ⚠ 容器本身**不画任何东西**：没有底色、没有加载占位、没有边框 ——
      加载期间就是一块完全透明的区域，模型画上来了才看得见东西
      （需求明确：加载完成前不要任何占位内容）。
    ⚠ 整只桌宠是装饰件：容器 pointer-events: none，不接收点击，
      只有右侧那排动作按钮单独把事件打开（见 .blog-pet--action）。
  -->
  <div class="blog-pet" :class="{ 'is-hidden': hidden }" :style="petStyle">
    <canvas ref="canvas" class="blog-pet--canvas"></canvas>

    <!-- 动作选单：菲比右侧的 1/2/3 悬浮按钮，点一下触发一次动作 -->
    <div v-if="quickActions.length" class="blog-pet--actions">
      <button
        v-for="(code, index) in quickActions"
        :key="code"
        class="blog-pet--action"
        :title="labelOf(code)"
        @click="triggerQuick(code)"
      >{{ index + 1 }}</button>
    </div>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'
import bus, { EVENTS } from '@/utils/eventBus'
import { labelOf, LOOK_TABLE } from '@/config/pet.config'
import { FEIBI } from './config/feibi'
import { createParams } from './core/params'
import { createStage } from './core/stage'
import { createHandOverlay } from './core/handOverlay'
import { createVoice } from './core/voice'
import { createActions } from './core/actions'
import { createKeyboard } from './input/keyboard'
import { createMouse } from './input/mouse'

/**
 * 侧栏消失的断点 —— 与 Aside.vue 里那条 `@media (max-width: 991px) { #aside { display:none } }`
 * 是同一个值（el-col-md 的断点）。桌宠要「侧栏消失时一起消失」，而 #aside 带 transform，
 * 把 fixed 容器塞进它里面会以它为包含块、定位就跑了 —— 所以改成这里跟同一个断点。
 * ⚠ 改 Aside 的断点时这里要一起改。
 */
const ASIDE_HIDE_MAX_WIDTH = 991

/**
 * 「定制化形象」重放时的间隔（ms）
 * ⚠ 23 个动作全在同一个动作组（CAT_motion_lock）里、priority 是 FORCE：
 *   同一帧连着放两个会互相打断，前一个根本走不到曲线末值。
 *   两个组各重放一次，错开这个间隔就够了（单条动作约 0.47s）。
 */
const LOOK_REPLAY_GAP_MS = 700

/**
 * 焦点是否在可编辑控件里 —— 决定打字键要不要 preventDefault
 * （桌宠嵌在博客里，键盘是全局的，用户随时可能在搜索框/编辑器里打字）
 */
function isTypingTarget (e) {
  const el = e && e.target
  if (!el || !el.tagName) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

export default {
  name: 'BongoCatPet',

  data () {
    return {
      // 内部状态：只用于 console 与调试（**不渲染任何占位**，见模板注释）
      status: 'loading',
      // 窄屏（侧栏已消失）：藏起来 + 停帧 + 摘掉键盘鼠标监听
      hidden: false,
    }
  },

  computed: {
    ...mapGetters('pet', ['sizePx', 'expression', 'quickActions', 'look']),
    // 尺寸的唯一来源：store 的 sizePx（配置页切大/中/小）
    petStyle () {
      const size = `${this.sizePx}px`
      return { width: size, height: size }
    },
  },

  watch: {
    // 配置页改大小 → 画布与模型缩放一起跟着变（点击即生效）
    sizePx (value) {
      if (this.pet) this.pet.stage.resize(value)
    },
    // 配置页改表情 → 直接置成那个表情（不是切换语义）
    expression (value) {
      if (this.pet) this.pet.actions.apply(value)
    },
  },

  mounted () {
    // ⚠ 所有 window/document 访问都在 mounted 之后（SSR / 预渲染下这个钩子不跑）
    this.torn = false
    this.lookTimers = []
    this.setupNarrowWatcher()
    this.setupGlobalReset()
    // 控件页的「定制化形象」按钮 → 立刻在桌宠身上做一次（一次性动作，走总线）
    this.onPetMotion = (code) => {
      if (this.pet && this.pet.stage.model) this.pet.actions.motion(code)
    }
    bus.$on(EVENTS.PET_MOTION, this.onPetMotion)
    this.boot()
  },

  beforeDestroy () {
    this.torn = true
    bus.$off(EVENTS.PET_MOTION, this.onPetMotion)
    this.lookTimers.forEach(clearTimeout)
    this.lookTimers = []
    this.teardownNarrowWatcher()
    if (this.onWindowBlur) window.removeEventListener('blur', this.onWindowBlur)
    if (this.onVisibility) document.removeEventListener('visibilitychange', this.onVisibility)
    this.teardownModules()
  },

  methods: {
    labelOf,

    /**
     * 组装全部模块并跑起来
     * ⚠ 模块实例挂在 this.pet 上（**不在 data 里**）：Pixi 的 app/model 是重型对象，
     *   放进响应式会被深代理，渲染异常或帧率暴跌。
     */
    async boot () {
      const params = createParams(() => this.pet && this.pet.stage.model)
      const stage = createStage({
        canvas: this.$refs.canvas,
        size: this.sizePx,
        fitScale: FEIBI.view.fitScale,
        onStatus: (s) => this.handleStatus(s),
      })
      const voice = createVoice({ profile: FEIBI, setParam: params.set })
      const hand = createHandOverlay({ profile: FEIBI, setParam: params.set })
      const actions = createActions({
        profile: FEIBI,
        getModel: () => stage.model,
        setParam: params.set,
        voice,
      })

      this.pet = {
        params,
        stage,
        voice,
        hand,
        actions,
        keyboard: createKeyboard({ profile: FEIBI, hand, actions, isTypingTarget }),
        mouse: createMouse({ profile: FEIBI, params }),
      }

      await stage.init()
      if (this.torn) return

      // 帧循环：鼠标阻尼（每帧写参数）与口型。⚠ 必须是「直接操作 coreModel」的普通函数，
      // 不要包成 Vue 的响应式/计算属性
      stage.addFrame((dt) => this.pet.mouse.step(dt))
      stage.addFrame(() => this.pet.voice.step())

      const model = await stage.load(FEIBI.modelPath)
      if (this.torn || !model) return

      // 换模型 → 参数量程缓存必须清（鼠标跟随按量程映射）
      params.clearRanges()

      if (FEIBI.capabilities.handOverlay) {
        // 异步逐张加载手图，加载完自己会 apply 一次（期间保持 Live2D 手可见）
        this.pet.hand.init(model)
      }

      this.applyConfigToModel()
      this.syncRunState()
    },

    /**
     * 把「私有定制」里的配置贴到刚加载好的模型上
     * （表情直接置；形象按存的记录重放一次 —— 下次进站形象跟上次一致）
     */
    applyConfigToModel () {
      const pet = this.pet
      if (!pet) return
      pet.actions.apply(this.expression)

      // 只重放「要出现」的那几个：
      //   表格项里 'off'（消失）**就是模型的自然状态**，不需要播任何动作；
      //   墨镜组记的是「最后一个选择」，照它放一次就回到当时的样子。
      // 这样重放的条数通常只有 0~3 条，不会一进站就演上一长串动作。
      const codes = []
      if (this.look.mirror) codes.push(this.look.mirror)
      LOOK_TABLE.forEach((item) => {
        if (this.look.items[item.key] === 'on') codes.push(item.on)
      })

      codes.forEach((code, index) => {
        if (index === 0) pet.actions.motion(code)
        else this.lookTimers.push(setTimeout(() => pet.actions.motion(code), index * LOOK_REPLAY_GAP_MS))
      })
    },

    /** 点右侧悬浮按钮：触发对应的动作 */
    triggerQuick (code) {
      if (this.pet && this.pet.stage.model) this.pet.actions.motion(code)
    },

    handleStatus ({ status, error }) {
      this.status = status
      if (status === 'error') console.warn('[pet] 模型加载失败：', error)
    },

    /** 窄屏 = 侧栏消失 = 桌宠消失：藏起来 + 停帧 + 摘监听（⚠ 绝不能继续吞键盘）*/
    setupNarrowWatcher () {
      const mq = window.matchMedia(`(max-width: ${ASIDE_HIDE_MAX_WIDTH}px)`)
      this.mediaQuery = mq
      this.onMediaChange = () => {
        this.hidden = mq.matches
        this.syncRunState()
      }
      this.onMediaChange()
      // 老 Safari 只有 addListener
      if (mq.addEventListener) mq.addEventListener('change', this.onMediaChange)
      else mq.addListener(this.onMediaChange)
    },

    teardownNarrowWatcher () {
      const mq = this.mediaQuery
      if (!mq || !this.onMediaChange) return
      if (mq.removeEventListener) mq.removeEventListener('change', this.onMediaChange)
      else mq.removeListener(this.onMediaChange)
      this.mediaQuery = null
    },

    /** 失焦 / 切标签页：把按下状态复位，否则手会卡在按下、口型停在那 */
    setupGlobalReset () {
      this.onWindowBlur = () => this.resetInput()
      this.onVisibility = () => {
        if (document.hidden) this.resetInput()
      }
      window.addEventListener('blur', this.onWindowBlur)
      document.addEventListener('visibilitychange', this.onVisibility)
    },

    resetInput () {
      if (!this.pet) return
      this.pet.keyboard.reset()
      this.pet.mouse.reset()
      this.pet.voice.reset()
    },

    /** 按「是否可见」统一开关渲染与输入 */
    syncRunState () {
      const pet = this.pet
      if (!pet || this.torn) return
      const run = !this.hidden
      pet.stage.setPaused(!run)
      if (run) {
        pet.keyboard.attach()
        pet.mouse.attach()
      } else {
        pet.keyboard.detach()
        pet.mouse.detach()
        this.resetInput()
      }
    },

    /** 卸载：逐一归还 —— 监听、帧回调、纹理、WebGL 上下文都要收 */
    teardownModules () {
      const pet = this.pet
      if (!pet) return
      pet.keyboard.detach()
      pet.mouse.detach()
      pet.hand.destroy()
      pet.voice.destroy()
      pet.actions.reset()
      pet.stage.destroy()
      this.pet = null
    },
  },
}
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// ============================================================
// 桌宠容器：视口左下角，left/bottom 各 20px
// ⚠ 尺寸不写在这里 —— 由配置（store 的 sizePx）通过内联 style 给
// ⚠ 容器不带任何底色/边框/占位：没加载出来时就是一块透明区域
// ============================================================
.blog-pet
  position fixed
  left 20px
  bottom 20px
  // 压在浮动按钮组（z-index 500）之下、正文之上
  z-index 400
  // 装饰件：不接收指针事件 —— 不会挡住页面上的点击与划选
  pointer-events none
  user-select none

  // 窄屏（侧栏已消失）→ 一起消失
  &.is-hidden
    display none

.blog-pet--canvas
  display block
  width 100%
  height 100%
  // 兜一层：画布本身绝不能有底色（透明交给 Pixi 的 backgroundAlpha，见 core/stage.js）
  background-color transparent

// ===== 动作选单：菲比右侧的 1/2/3 悬浮按钮 =====
.blog-pet--actions
  position absolute
  left 100%
  bottom 10px
  margin-left 10px
  display flex
  flex-direction column
  // ⚠ gap 必须带冒号：这份 Stylus 不认无冒号的 gap（会被当成选择器）
  gap: 8px
  // 容器整体是 pointer-events:none，这里单独打开（否则按钮点不动）
  pointer-events auto

.blog-pet--action
  width 30px
  height 30px
  padding 0
  // 白色细环：桌宠浮在横幅照片上，底图明暗不定，留一圈白边保证圆形轮廓清楚
  border 1px solid rgba(255, 255, 255, .55)
  border-radius 50%
  // 主题色实底 + 白字
  // ⚠ 原来是写死的「半透明黑底 + 白字」—— 与站点主题色无关，
  //   换色相 / 切昼夜它都不动。既然它是页面上的一个操作按钮，
  //   就跟着主题色走，和页面里其它实心按钮保持同一语言。
  background-color var(--theme-font-fst)
  color #fff
  box-shadow 0 4px 12px var(--theme-accent-glow)
  font-size $theme-fz.sm
  line-height 1
  cursor pointer
  transition all .15s ease

  &:hover
    background-color var(--theme-font-sec)
    transform scale(1.1)

  &:active
    transform scale(.94)
</style>
