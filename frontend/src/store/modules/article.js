/**
 * 文章模块
 *   state.reactions
 *    { [文章 id]: { reaction, likeNum } }
 *    浮动按钮组按「当前路由 id」查（computed）
 *    文章列表 watch 它，把计数写回对应那张卡片
 *
 * ⚠ 本模块只存「状态」。浮动按钮组的「点赞 / 评论」是一次性动作、不留值，
 *   已改由事件总线传递（utils/eventBus.js 的 float:like / float:comment），
 *   不再放进 store —— 之前用 state.floatAction = { seq, type } 存过一版，
 *   Vuex 里没有「一次性事件」，只能靠自增 seq 骗 watch 触发，纯属绕路。
 */
export default {
  namespaced: true,

  state: {
    // 点赞态度 / 赞数的跨页共享：{ [文章 id]: { reaction, likeNum } }
    reactions: {},
  },

  mutations: {
    /**
     * 记下某篇文章最新的点赞态度
     * 整体替换而不是 state.reactions[id] = ...
     */
    SET_REACTION(state, { id, reaction, likeNum }) {
      state.reactions = {
        ...state.reactions,
        [id]: { reaction: reaction || "none", likeNum },
      };
    },
  },

  actions: {
    // 文章详情页：态度变了就同步给全站
    syncReaction({ commit }, payload) {
      commit("SET_REACTION", payload);
    },
  },
};
