import localStore from 'store'
import { THEME_MODES, DEFAULT_MODE } from '@/config/theme.config'
import { applyThemeVars, DEFAULT_HUE, snapHue } from '@/utils/themeRuntime'

/**
 * 主题模块 —— 管「白天 / 夜间」+「调色盘色相」两个状态，并负责把它们落到 DOM。
 *
 * ## 两个状态
 *   mode —— 'light' | 'dark'，决定**中性色**（卡片底 / 文字 / 描边 …）
 *   hue  —— 0~355 的基准色相（步长 5），决定**强调色那 5 个变量**
 *   两者正交：换色相不影响亮暗，切模式也保留当前色相。
 *
 * ## 落到 DOM 的动作在 actions 里，不在 mutations 里
 *   mutations 只改 state + 写 localStorage（纯数据）。
 *   真正碰 DOM 的（挂 data-theme、写 5 个强调色变量）统一走 `apply` 这个 action：
 *   这样「谁改了主题」和「谁把它画出来」分开，也不会有 mutation 里偷偷动 DOM 的隐式副作用。
 *   ⚠ 新增调用点时记得 commit 之后 dispatch('apply') —— 只 commit 不改 DOM。
 *
 * ## 启动时机
 *   main.js 在 $mount **之前** dispatch('theme/apply')，这样首帧就是正确的配色，
 *   不会先闪一下浅色再变深色。
 *
 * ## 横幅图不受这里影响
 *   .blog-banner--full 由用户资料上的 banner 决定，不跟 mode 走；
 *   目前只有登录/注册模态框的滑块图还按 mode 取图（config/theme.config.js）。
 */

// localStorage 的键名
const MODE_KEY = 'themeMode'
const HUE_KEY = 'themeHue'

// 👇 注意：这里 import 的 `store` 是 npm 包 store（localStorage 封装），
//    不是 Vuex 的 store —— 与 store/modules/http.js 里取 token 是同一个用法。
//    刷新时 Vuex state 会重建，所以初值写成「去本地存储读一次」，
//    这样切换过的模式/色相在刷新后还在，不会突然跳回默认。
function readMode() {
  const saved = localStore.get(MODE_KEY)
  return THEME_MODES.includes(saved) ? saved : DEFAULT_MODE
}

function readHue() {
  const saved = localStore.get(HUE_KEY)
  // 没存过 → 用默认色相；存过 → 吸附到色带上存在的档位（防止旧数据/手改 localStorage 塞进怪值）
  return saved === undefined || saved === null ? DEFAULT_HUE : snapHue(saved)
}

export default {
  namespaced: true,

  state: {
    mode: readMode(),
    hue: readHue(),
  },

  getters: {
    mode: (state) => state.mode,
    isDark: (state) => state.mode === 'dark',
    hue: (state) => state.hue,
    // 是否还在默认色相上（调色盘据此决定「重置」按钮要不要置灰）
    isDefaultHue: (state) => state.hue === DEFAULT_HUE,
  },

  mutations: {
    SET_MODE(state, mode) {
      state.mode = THEME_MODES.includes(mode) ? mode : DEFAULT_MODE
      localStore.set(MODE_KEY, state.mode)
    },
    SET_HUE(state, hue) {
      state.hue = snapHue(hue)
      localStore.set(HUE_KEY, state.hue)
    },
  },

  actions: {
    /**
     * 把当前 state 落到 DOM。
     * 启动时（main.js）与「切模式 / 换色相」之后各跑一遍。
     */
    apply({ state }) {
      applyThemeVars({ mode: state.mode, hue: state.hue })
    },

    // 白天 ⇄ 夜间
    toggleMode({ commit, dispatch, state }) {
      commit('SET_MODE', state.mode === 'dark' ? 'light' : 'dark')
      dispatch('apply')
    },
    // 直接指定模式（预留给以后的三态切换 / 跟随系统）
    setMode({ commit, dispatch }, mode) {
      commit('SET_MODE', mode)
      dispatch('apply')
    },

    // 换基准色相（调色盘拖动 / 点击色带）
    setHue({ commit, dispatch }, hue) {
      commit('SET_HUE', hue)
      dispatch('apply')
    },
    // 重置回默认主题色
    resetHue({ dispatch }) {
      dispatch('setHue', DEFAULT_HUE)
    },
  },
}
