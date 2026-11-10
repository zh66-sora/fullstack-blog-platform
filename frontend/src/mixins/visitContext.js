import store from 'store'

/**
 * 访问上下文下要「带着被访问用户一起走」的页面（导航落点）。
 *
 * 「主页」不在这份清单里 —— 它在访问上下文下的落点不是 `/index?uid=`，
 * 而是「他人主页」形态 `/user/:id`（页头返回键 + 隐藏写博客 + aside 换人），
 * 见下面 visitRoute 的注释。
 */
const UID_CARRIER_ROUTES = ['Column', 'Message', 'About']

/**
 * 访问上下文 —— mixin
 * =========================================================================
 * 供 Home 的三棵子树（Head / Aside / 各个路由视图）共用，回答同一个问题：
 * **「我现在看的是谁的主页？」**
 *
 * 判定口径（唯一真相是路由，不存 store）：
 *   `/user/:id`（name: UserHome）→ `$route.params.id`
 *   其余路由（`index / column / about / message / article`）→ `?uid=`
 *
 * ⚠⚠ 为什么不能简单写 `$route.params.id || $route.query.uid`：
 *   文章详情页的路由是 `/article/:id`，它的 `params.id` 是**文章 id**、不是用户 id！
 *   直接取会把文章 id 当成访问对象，于是「看一篇文章」会被判成「进了某个人的主页」，
 *   页头少掉写博客、多出返回键。所以 params 只在 `name === 'UserHome'` 时才认。
 *
 * ⚠ 这里**只做判定**，不做取数：拉资料由 `store/modules/visit.js` 负责，
 *   由 `Home.vue` 在路由变化时 dispatch —— 判定与取数分开，各自都可测。
 */
export default {
  computed: {
    /**
     * 当前访问的用户 id（空串 = 没有访问对象）
     * —— 空串时所有页面的行为与改动前完全一致（自己的主页 / 全站）
     */
    visitedUserId() {
      const { name, params, query } = this.$route
      const fromParams = name === 'UserHome' ? String(params.id || '') : ''
      return fromParams || String(query.uid || '')
    },

    /** 是否处于「访问某个人」的上下文 */
    isVisitContext() {
      return !!this.visitedUserId
    },

    /** 当前登录用户的 id（未登录为空串） */
    selfUserId() {
      return (
        store.get('uid') ||
        this.$store.getters['http/userInfo']?.data?._id ||
        ''
      )
    },

    /** 是否已登录 */
    isLogin() {
      return this.$store.getters['http/isLogin']
    },

    /** 访问的是不是自己（在自己主页的「他人主页」路径上） */
    isVisitingSelf() {
      return !!this.visitedUserId && this.visitedUserId === String(this.selfUserId)
    },

    /** 被访问用户的公开资料（来自 store 的缓存；没有访问对象时为空对象） */
    visitedProfile() {
      return this.$store.getters['visit/profile'] || {}
    },
  },
  methods: {
    /**
     * 点某个人的头像 / 昵称 → 进他的主页
     *
     * ⚠ 点到**自己**时跳 `/index`（自己的主页，不带访问上下文），
     *   而不是 `/user/<自己的 id>` —— 后者会渲染成「他人主页」形态
     *   （少了写博客、多了返回键），看自己的主页不该是这个样子。
     *
     * @param {string} userId — 空串则什么都不做（拿不到 id 的作者不可点）
     */
    openUserHome(userId) {
      const id = String(userId || '')
      if (!id) return
      if (id === String(this.selfUserId)) {
        this.$router.push({ name: 'Index' }).catch(() => {})
        return
      }
      this.$router.push({ name: 'UserHome', params: { id } }).catch(() => {})
    },

    /**
     * 他人主页的返回键：回到**当前登录用户**的主页
     * （需求原文：「点击返回当前登录用户主页」）
     */
    backToSelfHome() {
      this.$router.push({ name: 'Index' }).catch(() => {})
    },

    /**
     * 把导航目标改写成「保持访问对象不变」的落点
     *
     * 访问上下文下点导航里的「主页 / 板块 / 留言 / 关于」，要带着被访问用户走 ——
     * 否则会掉回登录用户自己的主页（需求：保持访问用户不变）。
     *
     *   Index（主页）        → /user/:id（他人主页形态：返回键 + 隐藏写博客 + aside 换人）
     *   Column / Message / About → 原路由 + ?uid=<访问对象>
     *   其它（Write / Info / Manage / Timeline / Pet …）→ 原样返回
     *     —— 它们是「当前登录用户」自己的操作，与访问对象无关。
     *
     * @param {object} route — 配置表里的 { name } 或 { name, query } 路由对象
     */
    visitRoute(route) {
      if (!route || !route.name) return route
      if (!this.isVisitContext) return route
      if (route.name === 'Index') {
        return { name: 'UserHome', params: { id: this.visitedUserId } }
      }
      if (UID_CARRIER_ROUTES.includes(route.name)) {
        return { ...route, query: { ...(route.query || {}), uid: this.visitedUserId } }
      }
      return route
    },
  },
}
