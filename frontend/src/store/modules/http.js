import store from 'store'
const TOKEN_NAME = process.env.VUE_APP_BLOG_API_TOKEN_NAME

// 并发去重：多个组件同时要用户资料时只发一次请求，后来者复用同一个 Promise。
// 刷新后 Head.vue 与 CommentSection.vue 都会调它，少了这层会打出两个一模一样的 getProfile。
let pendingUserInfo = null


/**
 * 登录成功后自动离开兜底页（Lost / NotFound）
 *
 * 为什么必须离开：路由守卫只在「跳转」时执行。用户没登录时访问 requiresAuth 的页面会被
 * 丢到 /lost?state=forbidden&from=<原目标>，如果登录完还停在这一页 ——
 * 守卫不会再跑一次，页面就卡在「需要先登录」上，再点那颗「去登录」还会又弹一个登录框
 * （用户明明已经登录了）。
 *
 * 去向与兜底页自己的按钮口径一致（见 Lost.vue#runAction 的 retry / reload 分支）：
 * 有 ?from= 就回出事那一页，没有就回首页。
 *
 * ⚠ catch 掉 NavigationDuplicated：from 恰好是当前路径时 vue-router 3 会抛未捕获的 rejection
 */
function leaveFallbackPage(vm) {
  const { name, query } = vm.$route
  if (name !== 'Lost' && name !== 'NotFound') return
  vm.$router.replace(query.from || { name: 'Index' }).catch(() => {})
}


export default {
  namespaced: true,
  state: {
    token: store.get(TOKEN_NAME) ?? '',
    // ⚠ 内存态：刷新即空（token 会从存储恢复，userInfo 不会）。
    //   所以刷新后 isLogin 为 true 但 userInfo 为空，需要的地方得自己补拉
    userInfo: {}
  },
  mutations: {
    SET_TOKEN(state, token) {
      state.token = token
    },
    SET_USERINFO(state, userInfo) {
      state.userInfo = userInfo
    }
  },
  actions: {
    async login({ commit, dispatch }, { type, data, params }) {
      // 1. type 由调用方传入，区分 login / register
      console.log('vuex http', this.$vm)
      const res = await this.$vm.$api({ type, data, params })

      // 2. http 内部已写完 localStorage，这里读回 token
      commit('SET_TOKEN', store.get([TOKEN_NAME]))

      // 3. 拉取用户信息
      await dispatch('getUserInfo')

      // 4. 如果这次登录是在兜底页上完成的，自动离开（否则会卡在「请先登录」那一页）
      // ⚠ 判定标准取「存储里真的拿到 token 了」而不是「没抛异常」：
      //    http.js 内部把错误 catch 掉了（只返回 undefined，不 rethrow），
      //    账号密码错时上面这几行照样往下走，光看有没有异常会把失败也当成成功
      if (store.get(TOKEN_NAME)) leaveFallbackPage(this.$vm)

      // 5. 登录成功 → 建立聊天室 WebSocket（未登录不连；见 store/modules/chat.js）
      if (store.get(TOKEN_NAME)) dispatch('chat/connect', null, { root: true })

      return res
    },
    async getUserInfo({ commit }) {
      // 已有在途请求 → 直接复用，避免并发重复请求
      if (pendingUserInfo) return pendingUserInfo

      pendingUserInfo = this.$vm
        .$api({ type: 'getProfile' })
        .then((res) => commit('SET_USERINFO', res))
        // 无论成功失败都要清掉，否则一次失败会把后续调用永久卡在这个 Promise 上
        .finally(() => {
          pendingUserInfo = null
        })

      return pendingUserInfo
    }
  },
  getters: {
    isLogin: state => !!state.token,
    userInfo: state => state.userInfo
  }
}

