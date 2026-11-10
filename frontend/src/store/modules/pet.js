/**
 * 桌宠模块 —— 「私有定制 → 菲比桌宠」那一页的全部配置
 * =========================================================================
 * 存放位置：**前端本地**（localStorage 一个键存整份配置），刷新/重开浏览器都记得住。
 * 为什么不进后端：这些是「这台设备上我想怎么看桌宠」的私人偏好，
 * 与账号资料（/api/profile）是两回事 —— 换个设备本来就该重新调。
 *
 * 为什么走 Vuex 中转（而不是页面直接读写 localStorage）：
 *   配置页（/pet）与桌宠本体（挂在 Home.vue）是两棵互不相邻的组件树，
 *   中间隔着一层响应式状态最省事：页面改 → store 变 → 桌宠的 computed 自己响应。
 *   ⚠ 也正因为如此，store 里存的是「配置」而不是「桌宠实例」
 *     （实例是重型对象，只属于 BongoCatPet 组件，见那里的说明）。
 *
 * 与 theme 模块同一套做法：state 初值「去本地读一次」，mutation 里顺手写回。
 */

import localStore from 'store'
import {
  PET_SIZES,
  DEFAULT_SIZE,
  DEFAULT_EXPRESSION,
  EXPRESSION_OPTIONS,
  QUICK_ACTION_CANDIDATES,
  QUICK_ACTION_MAX,
  LOOK_MIRROR,
  LOOK_TABLE,
} from '@/config/pet.config'

// localStorage 键名（与 themeMode 一样的裸键名）
const CONFIG_KEY = 'petConfig'
// 上一版只存了开关一个布尔值，留着兼容：老数据不该把用户刚开的桌宠关回去
const LEGACY_ENABLED_KEY = 'petEnabled'

function defaultConfig () {
  return {
    // 开关：默认关（模型 24MB，用户没表态就不该自动下载）
    enabled: false,
    // 大小（PET_SIZES 的 key）
    size: DEFAULT_SIZE,
    // 表情（EXPRESSION_OPTIONS 里的一项）
    expression: DEFAULT_EXPRESSION,
    // 动作选单：最多 QUICK_ACTION_MAX 个、不可重复；数组顺序 = 悬浮按钮上的 1/2/3
    quickActions: [],
    // 定制化形象：
    //   mirror —— 墨镜组最后选的那一个（null = 没动过）
    //   items  —— 表格里每项的状态 { book: 'on' | 'off' }（没动过的项不存）
    // 进站时按它重放一次，形象跟上次一致 —— 见 BongoCatPet#applyConfigToModel
    look: { mirror: null, items: {} },
  }
}

/**
 * 读本地配置 + 兜底
 * ⚠ localStorage 是用户能随手改的，脏值一律回默认：宁可回到出厂设置，也不能把界面带崩
 */
function readConfig () {
  const saved = localStore.get(CONFIG_KEY)
  const cfg = Object.assign(defaultConfig(), saved && typeof saved === 'object' ? saved : {})

  if (!PET_SIZES[cfg.size]) cfg.size = DEFAULT_SIZE
  if (!EXPRESSION_OPTIONS.includes(cfg.expression)) cfg.expression = DEFAULT_EXPRESSION
  cfg.enabled = !!cfg.enabled

  const allowed = new Set(QUICK_ACTION_CANDIDATES)
  const picked = Array.isArray(cfg.quickActions) ? cfg.quickActions : []
  // 去重 + 白名单 + 上限，一次过
  cfg.quickActions = picked
    .filter((code) => allowed.has(code))
    .filter((code, i, arr) => arr.indexOf(code) === i)
    .slice(0, QUICK_ACTION_MAX)

  const look = Object.assign({ mirror: null, items: {} }, cfg.look)
  if (!LOOK_MIRROR.codes.includes(look.mirror)) look.mirror = null
  const cleanItems = {}
  const savedItems = look.items && typeof look.items === 'object' ? look.items : {}
  LOOK_TABLE.forEach((item) => {
    const value = savedItems[item.key]
    if (value === 'on' || value === 'off') cleanItems[item.key] = value
  })
  look.items = cleanItems
  cfg.look = look

  if (!saved && localStore.get(LEGACY_ENABLED_KEY) === true) cfg.enabled = true
  return cfg
}

/** 整份写回（配置项会越加越多，逐字段存容易漏，不如一次写全） */
function persist (state) {
  localStore.set(CONFIG_KEY, {
    enabled: state.enabled,
    size: state.size,
    expression: state.expression,
    quickActions: state.quickActions,
    look: state.look,
  })
}

export default {
  namespaced: true,

  state: readConfig(),

  getters: {
    isEnabled: (state) => state.enabled,
    size: (state) => state.size,
    // 实际像素边长：桌宠容器与画布都用它，避免两处各查一次表
    sizePx: (state) => (PET_SIZES[state.size] || PET_SIZES[DEFAULT_SIZE]).size,
    expression: (state) => state.expression,
    quickActions: (state) => state.quickActions,
    look: (state) => state.look,
  },

  mutations: {
    SET_ENABLED (state, enabled) {
      state.enabled = !!enabled
      persist(state)
    },
    SET_SIZE (state, size) {
      if (!PET_SIZES[size]) return
      state.size = size
      persist(state)
    },
    SET_EXPRESSION (state, name) {
      if (!EXPRESSION_OPTIONS.includes(name)) return
      state.expression = name
      persist(state)
    },
    /** 加进动作选单：重复/超上限直接忽略（界面上按钮置灰，这里再兜一层）*/
    ADD_QUICK_ACTION (state, code) {
      if (!QUICK_ACTION_CANDIDATES.includes(code)) return
      if (state.quickActions.includes(code)) return
      if (state.quickActions.length >= QUICK_ACTION_MAX) return
      state.quickActions.push(code)
      persist(state)
    },
    REMOVE_QUICK_ACTION (state, code) {
      const i = state.quickActions.indexOf(code)
      if (i < 0) return
      state.quickActions.splice(i, 1)
      persist(state)
    },
    /** 墨镜组：记下最后选的那一个（不在表里的值一律当「没选」）*/
    SET_LOOK_MIRROR (state, code) {
      state.look.mirror = LOOK_MIRROR.codes.includes(code) ? code : null
      persist(state)
    },

    /** 定制化形象表格里的一项：'on' = 出现，'off' = 消失 */
    SET_LOOK_ITEM (state, payload) {
      const item = LOOK_TABLE.find((i) => i.key === payload.key)
      if (!item) return
      if (payload.value !== 'on' && payload.value !== 'off') return
      // 整体换一个新对象：别原地改 items 的属性（Vue 2 的响应式对「后加键」不友好）
      state.look.items = Object.assign({}, state.look.items, { [item.key]: payload.value })
      persist(state)
    },
  },

  actions: {
    setEnabled ({ commit }, enabled) { commit('SET_ENABLED', enabled) },
    toggle ({ commit, state }) { commit('SET_ENABLED', !state.enabled) },
    setSize ({ commit }, size) { commit('SET_SIZE', size) },
    setExpression ({ commit }, name) { commit('SET_EXPRESSION', name) },
    addQuickAction ({ commit }, code) { commit('ADD_QUICK_ACTION', code) },
    removeQuickAction ({ commit }, code) { commit('REMOVE_QUICK_ACTION', code) },
    setLookMirror ({ commit }, code) { commit('SET_LOOK_MIRROR', code) },
    setLookItem ({ commit }, payload) { commit('SET_LOOK_ITEM', payload) },
  },
}
