/**
 * visit —— 「当前访问的是谁」
 * =========================================================================
 * 为什么要有这个模块：
 *   需求「他人主页」要求 Home 的**三棵子树**都感知同一个对象：
 *     Head（隐藏写博客 + 加返回键）、Aside（换成 TA 的资料 / 友链 / 留言墙）、
 *     router-view（Index / Column / About / Message 都按 TA 取数）。
 *   这三层里只有 router-view 那一层是「路由视图」，Head 与 Aside 挂在 Home 上、
 *   拿不到任何 props —— 所以必须有一处**跨组件共享**的存放地。
 *
 * ⚠ 这个模块**不是**访问对象的来源，只是它的缓存：
 *   · 唯一真相是**路由**（`/user/:id` 或 `?uid=`，由 mixins/visitContext.js 判定，
 *     由 Home.vue 在路由变化时 dispatch 进来）
 *   · 这里只缓存「那个 id 对应的资料对象」，避免 Aside / 友链 / 弹幕墙各自拉一次
 *   · 与 store/modules/search.js 开头那条约定不冲突：那条禁止的是「把筛选条件放 store」，
 *     而访问对象是**访问上下文**，不是用户主动设的筛选
 *
 * ⚠ 不做本地持久化：刷新后路由仍在、由 Home 重新 dispatch 一次即可。
 *   持久化反而会出现「URL 上没有 id、但 store 里还留着上次访问对象」的不一致。
 */
export default {
  namespaced: true,
  state: {
    /** 当前访问的用户 id（空串 = 没有访问对象，就是「自己的 / 全站」） */
    visitedId: '',
    /** 该 id 对应的公开资料；空对象表示还没拉到 */
    profile: {},
    /** 上一次请求是否失败（失败时 Aside 降级成默认展示，不弹 toast） */
    failed: false,
    /** 在途请求，避免并发重复打接口（同 store/modules/http.js 的 pendingUserInfo） */
    pending: null,
  },
  mutations: {
    SET_VISITED_ID(state, id) {
      state.visitedId = id || ''
    },
    SET_PROFILE(state, { profile, failed }) {
      state.profile = profile || {}
      state.failed = !!failed
    },
    SET_PENDING(state, promise) {
      state.pending = promise
    },
  },
  actions: {
    /**
     * 切换访问对象
     * @param {string} id — 空串表示回到「无访问对象」（自己的主页 / 全站）
     */
    async enter({ commit, state }, id) {
      const next = String(id || '')
      const previous = state.visitedId

      // 没有访问对象 → 立刻清空，不发请求
      if (!next) {
        commit('SET_PENDING', null)
        commit('SET_PROFILE', { profile: {}, failed: false })
        commit('SET_VISITED_ID', '')
        return
      }

      commit('SET_VISITED_ID', next)
      // 同一个人反复进入（例如从他人主页又点了一次 TA 的头像）不该再打一次接口
      if (next === previous && Object.keys(state.profile).length) return
      if (state.pending) return state.pending

      const task = this.$vm
        .$api({ type: 'getUserProfile', params: { userId: next } })
        .then((res) => commit('SET_PROFILE', { profile: res?.data, failed: !res?.data }))
        .catch(() => commit('SET_PROFILE', { profile: {}, failed: true }))
        // 无论成败都要清掉，否则一次失败会把后续调用永久卡在这个 Promise 上
        .finally(() => commit('SET_PENDING', null))

      commit('SET_PENDING', task)
      return task
    },
  },
  getters: {
    visitedId: (state) => state.visitedId,
    profile: (state) => state.profile,
    failed: (state) => state.failed,
    /** 资料到手了没（Aside 用它决定「显示 TA 的」还是「先空着」） */
    ready: (state) => !state.visitedId || Object.keys(state.profile).length > 0,
  },
}
