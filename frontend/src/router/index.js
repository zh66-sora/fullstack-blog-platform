import Vue from 'vue'
import VueRouter from 'vue-router'
import Index from '@/views/Index.vue'
import Article from '@/views/Article.vue'
import Column from '@/views/Column.vue'
import Write from '@/views/Write.vue'
import ArticleEdit from '@/views/ArticleEdit.vue'
import Manage from '@/views/Manage.vue'
import Home from '@/views/Home.vue'
import UserHome from '@/views/UserHome.vue'
import Message from '@/views/Message.vue'
import Info from '@/views/Info.vue'
import About from '@/views/About.vue'
import Timeline from '@/views/Timeline.vue'
import Pet from '@/views/Pet.vue'
// 管理端三个页面（入口在侧栏「管理导航」，按角色显隐）
import AdminPunish from '@/views/AdminPunish.vue'
import AdminAccount from '@/views/AdminAccount.vue'
import AdminLogs from '@/views/AdminLogs.vue'
import Lost from '@/components/column/Lost.vue'
import store from '@/store'
import { scrollToContentTop, afterPageSwap } from '@/utils/scroll'
import NProgress from 'nprogress'
import 'nprogress/nprogress.css'

Vue.use(VueRouter)

const routes = [
  {
    path: '/',
    component: Home,
    children: [
      {
        // 根路径 '/' 本身
        // ⚠ `redirect: '/index'` 不能写在父记录上：vue-router 3（本项目 3.5.1）是
        //   **子路由先于父路由参与匹配**，末尾那条 catch-all 会把 '/' 一起抢走，
        //   父记录上的 redirect 就永远轮不到 —— 表现为「打开站点根路径直接显示 404 页」。
        //   所以在 children 最前面显式声明一个「空路径子路由」把 '/' 接回去。
        //   实测：resolve('/') → Index ✓、resolve('/nope') → NotFound ✓
        path: '',
        redirect: '/index'
      },
      {
        // 导航-主页:文章列表
        path: 'index',
        name: 'Index',
        meta: { requiresAuth: false },
        component: Index
      },
      {
        // 他人主页：某个人发表过的博客（入口在文章列表/详情/评论/留言/聊天室的头像上）
        //
        // ⚠ 组件是 views/UserHome.vue 这层壳，不能直接指向 Index ——
        //   Home.vue 的 `<keep-alive include="Index,Write">` 按组件的 name 匹配，
        //   直接复用 Index 会让「他人主页」与自己的 /index 共用同一个缓存实例。
        //   理由与做法见 UserHome.vue 顶部的注释。
        //
        // ⚠ requiresAuth: false —— 游客也能看别人的主页（需求：游客可访问他人主页）。
        //   从这儿派生的「关于 / 留言 / 板块」用 ?uid= 携带访问对象，各自再按自己的要求鉴权；
        //   判定统一走 mixins/visitContext.js。
        path: 'user/:id',
        name: 'UserHome',
        meta: { requiresAuth: false },
        component: UserHome
      },
      {
        // 导航-写博客页
        path: 'write',
        name: 'Write',
        meta: { requiresAuth: true },
        component: Write
      },
      {
        // 编辑某篇博客（从博客管理页的「编辑」进来）
        // ⚠ 指向的不是 Write.vue 本身，而是套在外面那层薄壳 —— 理由见 ArticleEdit.vue
        //   的注释：Write 在 keep-alive 的 include 里，直接用同一条路由会让编辑
        //   和「写博客写到一半的草稿」共用同一个组件实例，草稿会被冲掉。
        path: 'write/:id',
        name: 'ArticleEdit',
        meta: { requiresAuth: true },
        component: ArticleEdit
      },
      {
        // 导航-博客管理（当前用户发表过的博客，可展开看信息 / 编辑 / 删除）
        path: 'manage',
        name: 'Manage',
        meta: { requiresAuth: true },
        component: Manage
      },
      {
        // 导航-板块快捷导航页
        path: 'column',
        name: 'Column',
        meta: { requiresAuth: false },
        component: Column
      },
      {
        // 导航-留言页
        path: 'message',
        name: 'Message',
        meta: { requiresAuth: true },
        component: Message
      },
      {
        // 导航-关于（当前用户的「时间线」展示页）
        // ⚠ 这一条顶替的原本是页头的「个人」→ /info：
        //   个人资料编辑页从此只由侧栏「页面导航 → 个人中心」进入（见 config/aside.config.js），
        //   页头腾出来的这一格改成「关于」——它是「读」的一面（看自己的时间线）。
        // ⚠ requiresAuth 从 true 改成 false（需求：游客新增可访问时间线）。
        //   游客直接访问 /about 时**没有 uid、也没有 ?uid=**，此时由组件自己判断
        //   「看谁」—— 取不到访问对象就落到兜底页，而不是跳 forbidden。
        //   游客要看某个人的时间线，走的是他人主页那条路（/about?uid=xxx）。
        path: 'about',
        name: 'About',
        meta: { requiresAuth: false },
        component: About
      },
      {
        // 侧栏-时间线管理（整页面背景图 + 时间轴列表的增删改）
        path: 'timeline',
        name: 'Timeline',
        meta: { requiresAuth: true },
        component: Timeline
      },
      {
        // 管理导航-处罚管理（管理员 + 站长）：查账号、禁言 / 封禁 / 解禁
        // meta.manager 表示「至少要这个角色」，由 beforeEach 统一拦（服务端还会再判一次）
        path: 'admin/punish',
        name: 'AdminPunish',
        meta: { requiresAuth: true, manager: 'admin' },
        component: AdminPunish
      },
      {
        // 管理导航-账号管理（仅站长）：任命 / 撤销管理员、注销账号（软删）
        // 账号级操作不看等级差，只认 owner —— 与后端 routes/admin.js 一致
        path: 'admin/account',
        name: 'AdminAccount',
        meta: { requiresAuth: true, manager: 'owner' },
        component: AdminAccount
      },
      {
        // 管理导航-操作记录（管理员 + 站长）：AdminLog 的最近操作
        path: 'admin/logs',
        name: 'AdminLogs',
        meta: { requiresAuth: true, manager: 'admin' },
        component: AdminLogs
      },
      {
        // 导航-个人介绍页
        path: 'info',
        name: 'Info',
        meta: { requiresAuth: true },
        component: Info
      },
      {
        // 私有定制-菲比桌宠控件页（侧栏「私有定制」卡片的入口）
        // ⚠ 要登录：桌宠是「个人」的东西，与个人中心 / 写博客同级
        path: 'pet',
        name: 'Pet',
        meta: { requiresAuth: true },
        component: Pet
      },
      {
        // 博客具体详情页
        path: 'article/:id',
        name: 'Article',
        meta: { requiresAuth: false },
        component: Article
      },
      {
        // 兜底页-板块下没有文章（板块导航页点空板块时跳入，带 ?category=<板块 _id>）
        path: 'lost',
        name: 'Lost',
        meta: { requiresAuth: false },
        component: Lost
      },
      {
        // 兜底页-地址没匹配上（通用 404）。⚠ 必须放在 children 的最后
        path: '*',
        name: 'NotFound',
        meta: { requiresAuth: false },
        component: Lost
      },
    ]
  }
]

const router = new VueRouter({
  mode: 'hash',
  routes
})

/**
 * 角色等级 —— 与 myapp/core/roles.js 的 LEVEL 同值
 * 只用来决定「能不能进这一页」，真正的权限判断始终在服务端。
 */
const MANAGER_LEVEL = { user: 1, admin: 2, owner: 3 }

/**
 * 确保拿到当前用户的资料（含 role）
 *
 * 为什么需要：角色**不放在 token 里**（后端故意为之，降级/封禁立即生效），
 * 而 userInfo 是内存态 —— 刷新后是空的。直接从空对象读 role 会把站长判成普通用户。
 * 所以管理页进来时先补拉一次（http store 里有在途去重，不会重复打请求）。
 */
async function ensureUserInfo() {
  const cached = store.getters['http/userInfo']
  if (cached && cached.data) return cached

  /**
   * ⚠ 首屏那一次导航发生在 $mount 之前 —— vue-router 在根组件的 beforeCreate 里就开始了
   * 首次 transition，此时 main.js 里的 `store.$vm = vm` 还没执行，而 getUserInfo 是
   * 通过 `this.$vm.$api` 发请求的，会直接抛错 → userInfo 一直是空 → 站长被当普通用户踢进兜底页。
   * 实测症状：「刷新直接打开 /admin/punish 被拦」，但从别的页面点链接进来又是正常的。
   * 所以这里先等 $vm 挂上（正常情况下就是下一个宏任务，最多几十毫秒）。
   */
  for (let i = 0; i < 30 && !store.$vm; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 16))
  }

  try {
    await store.dispatch('http/getUserInfo')
  } catch (err) {
    // 拉不到就按普通用户处理：宁可进不去，也不能让游客钻进来
  }
  return store.getters['http/userInfo']
}

router.beforeEach(async (to, from, next) => {
  NProgress.start()
  const isLogin = store.getters['http/isLogin']
  // 兜底页自身不参与鉴权拦截（防循环：万一将来给它加上 requiresAuth，会自己跳自己）
  const isLostPage = to.name === 'Lost' || to.name === 'NotFound'
  /**
   * 需要登录但未登录 → 交给全局兜底页的 forbidden 状态（config/lost.config.js）
   *
   * 与原实现的差异：不再弹 toast 说「登录后才能查看该页」——
   * 兜底页上写得更清楚，两个一起响反而吵。
   * from 带出去，兜底页上的「去登录 / 返回」才有上下文。
   */
  if (to.meta.requiresAuth && !isLogin && !isLostPage) {
    NProgress.done()
    next({ name: 'Lost', query: { state: 'forbidden', from: to.fullPath } })
    return
  }

  /**
   * 管理页的角色闸门（meta.manager = 'admin' | 'owner'）
   * ⚠ 前端拦这一道只是为了「别让人进去看到一半报 403」，
   *   权限本身由服务端 middleware/authz.js 兜底 —— 绕过路由守卫也做不了任何事。
   */
  if (to.meta.manager && !isLostPage) {
    const info = await ensureUserInfo()
    const role = info?.data?.role || 'user'
    const required = MANAGER_LEVEL[to.meta.manager] || MANAGER_LEVEL.admin
    if ((MANAGER_LEVEL[role] || MANAGER_LEVEL.user) < required) {
      NProgress.done()
      next({ name: 'Lost', query: { state: 'noPermission', from: to.fullPath } })
      return
    }
  }

  // 不需要登录或已登录，直接放行
  next()
})

// 是否还是「页面刚加载完」的第一次导航（见下面的说明）
let isFirstNavigation = true

router.afterEach((to) => {
  NProgress.done()

  /**
   * ⚠ 首次导航跳过归位：页面刚加载完（F5 / 兜底页的「重新加载」）时，
   *   浏览器自己会**恢复上一次的滚动位置**；我们再滚一下，就会「先到内容顶、
   *   再被浏览器拽回去」——看着就是进页面时闪一下。
   *   首次把滚动交给浏览器，之后的站内跳转才由我们统一归位（口径见 utils/scroll.js）。
   */
  if (isFirstNavigation) {
    isFirstNavigation = false
    return
  }

  /**
   * 每次路由切换把正文滚回最上方（口径见 utils/scroll.js）
   * 对应原项目 routerControl.routeHandler 里的 window.scrollTo(0, 0)。
   *
   * ⚠ 文章列表页（Index）是唯一例外：它有自己的滚动位置记录
   *   （beforeRouteLeave 存 / activated 取，见 Index.vue），进列表页要还原上次看到的位置 ——
   *   在这里抹掉的话，「从详情页返回列表仍在原地」就没了。
   *
   * ⚠ 用 nextTick 而不是立刻滚：此刻新页面的 DOM 还没渲染，文档高度还是旧的，
   *   滚下去会被浏览器按旧高度夹断。
   *
   * ⚠ 还要再等 afterPageSwap：nextTick 只保证「重新渲染过了」，而 out-in 过渡下
   *   这一帧旧页面才开始 leave（还在、透明度还是 1）—— 在这时候滚，用户看到的就是
   *   「滚动条先跳一下，然后才淡出淡入」。等退场结束再滚，那一刻两端都看不见。
   */
  if (to.name === 'Index') return
  Vue.nextTick(() => afterPageSwap(scrollToContentTop))
})

export default router