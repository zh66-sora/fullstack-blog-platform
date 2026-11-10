import store from 'store'

/**
 * 侧栏 / 抽屉的导航动作 —— mixin
 * =========================================================================
 * 「页面导航」那张卡片的条目有两种：`route` 型（跳路由）与 `action` 型（调方法）。
 * 现在有两个宿主渲染同一份配置（`config/aside.config.js` 的 ASIDE_NAV）：
 *   · `views/Aside.vue`       大屏侧栏的导航卡片
 *   · `components/head/HeadDrawer.vue`  小屏汉堡抽屉
 * 所以这段分发逻辑必须只有一份 —— 尤其是 `logout`：它一次要清 5 样东西
 * （localStorage 的 token / uid、vuex 的 token / userInfo、聊天室连接），
 * 抄第二遍迟早会漏掉其中一两样。
 *
 * ⚠ 用它的组件必须保证 `handleNav` 里 `this[item.action]` 能取到方法 ——
 *   配置里出现的每个 action 名，这个 mixin 都要有同名方法。
 */

// token / uid 的存储键（与 store/modules/http.js、request/api/http.js 同一套）
const TOKEN_NAME = process.env.VUE_APP_BLOG_API_TOKEN_NAME
const UID_NAME = 'uid'

export default {
  methods: {
    /**
     * 当前项是否为「选中态」
     * 原项目靠点击时手动改行内样式（color:#68AEF4 + 加粗）高亮，
     * 这里改成跟路由实际所在页面走 —— 从别处跳进 /info、/write 也会正确高亮
     */
    isNavActive(item) {
      return !!item.route && this.$route.name === item.route.name
    },

    /**
     * 导航项点击分发（对应原项目 app/actionControl.js 1067-1082 行）
     *   route 型 → 直接跳路由
     *   action 型 → 按 action 名走下面的方法
     */
    handleNav(item) {
      if (item.action) {
        const handler = this[item.action]
        if (typeof handler === 'function') handler()
        return
      }
      // 已在目标路由上：vue-router 3 会抛 NavigationDuplicated，先挡掉
      if (this.isNavActive(item)) return
      this.$router.push(item.route)
    },

    /**
     * 退出登录
     * 原项目：store.remove('tokenKey') + store.remove('profileData') → 回 /index
     * 这里除了清持久化存储，还要把 vuex 里的登录态一起清掉 ——
     * isLogin 读的是 store 里的 token，不清的话导航卡片不会收回登录态
     * （uid 是评论区判断「这条评论是不是我发的」用的，一并清掉）
     */
    logout() {
      store.remove(TOKEN_NAME)
      store.remove(UID_NAME)
      this.$store.commit('http/SET_TOKEN', '')
      this.$store.commit('http/SET_USERINFO', {})
      // 退出登录 → 断掉聊天室 WebSocket（需求：退出登录才关闭会话标识）
      this.$store.dispatch('chat/disconnect')
      this.$toast.info('已退出登录')
      if (this.$route.name !== 'Index') {
        this.$router.push({ name: 'Index' })
      }
    },

    /**
     * 扩展功能 → 聊天室
     * 只切弹窗开关；WebSocket 连接由登录态驱动（见 store/modules/chat.js），
     * 关掉弹窗也不会断线。
     */
    chat() {
      this.$store.dispatch('chat/open')
    }
  }
}
