/**
 * 搜索模块 — Vuex
 * =========================================================================
 * ⚠ 这里**不存筛选条件**：筛选值的唯一来源是路由 query（见 utils/searchParams.js 顶部说明），
 *   否则 URL 与 store 会变成两个互相覆盖的来源。
 *
 * 本模块只管「搜索面板的 UI 状态」：面板展开 / 收起。
 * 原版它躺在 searchBus 的模块级闭包 _searchState.panelOpen 里，
 * 迁移后归位到 Vuex —— 面板是常驻首页的，展开与否属于跨组件（Head 搜索 → 面板要跟着展开）
 * 且刷新后希望保留的纯 UI 状态。
 *
 * 日历的临时状态（锚定月份 / 已选端点 / 编辑模式）不放这里：
 * 那是「打开一次用完就扔」的东西，归 CalendarModal 自己持有，关闭即重置。
 */

export default {
  namespaced: true,

  state: {
    // 面板 body 是否展开。默认收起：首页一进来先给用户看文章，筛选是按需打开的
    panelOpen: false,
  },

  getters: {
    panelOpen: (state) => state.panelOpen,
  },

  mutations: {
    SET_PANEL_OPEN(state, isOpen) {
      state.panelOpen = Boolean(isOpen);
    },
  },

  actions: {
    setPanelOpen({ commit }, isOpen) {
      commit("SET_PANEL_OPEN", isOpen);
    },
    togglePanel({ commit, state }) {
      commit("SET_PANEL_OPEN", !state.panelOpen);
    },
  },
};
