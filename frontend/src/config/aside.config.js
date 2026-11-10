/**
 * 侧边栏配置 — config 层
 * =========================================================================
 *
 * 侧边栏（views/Aside.vue）里三张「列表卡片」的数据与文案全部收在这里：
 *
 *   ASIDE_NAV      「我的」卡片 —— 个人中心 / 博客管理 / 时间线管理 / 退出登录
 *   ASIDE_ADMIN    「管理导航」卡片 —— 处罚管理 / 账号管理 / 操作记录（按角色显隐）
 *   ASIDE_PRIVATE  私有定制卡片 —— 现在只有「菲比桌宠」一条（桌宠开关的入口）
 *   ASIDE_FRIENDS  友情链接卡片 —— 数据来自登录用户的资料，配置只放「标题 /
 *                  图标 / 折叠阈值」这些不随后端变的东西
 *
 * ⚠ ASIDE_NAV / ASIDE_ADMIN / ASIDE_PRIVATE 结构完全一样（都是「标题 + 一组 item」），
 *   Aside.vue 用一段 v-for 铺开这几张卡 —— 加卡 = 往 navCards 里加一条配置，
 *   不用再抄一遍卡片 markup。
 *
 * 迁移来源：myBlog
 *   结构  index.html 第 78-92 行（`#blog-aside--nav` 的卡片骨架）
 *   内容  app/routerControl.js 第 138-179 行（进入 /info 时把「目录」换成
 *         「页面导航」并塞进这三条 li）
 *   样式  src/styl/index.styl 第 142-166 行（.blog-cards--category）
 *   点击  app/actionControl.js 第 1067-1082 行（profile / write / logout 分发）
 *
 * ⚠ myBlog 里这三条是「进 /info 才拼出来的字符串」，图标直接写 &#xe614; 这种
 *   转义字形，路由和文案都埋在模板字符串里、改不了也测不了。
 *   新项目把它提成声明式配置：改导航 = 改这张表，Aside.vue 只负责渲染和分发。
 */

/**
 * 「我的」导航卡片
 *
 * 字段说明（Aside.vue#handleNav / isNavActive / canSeeNav 只认这几个）：
 *   key       v-for 的 :key，同时是「这条导航是谁」的稳定标识
 *   text      导航名称（li 左侧文字）
 *   iconName  导航图标（li 右侧方块里的字形）—— **iconfont 那套的 class 名**
 *             对应关系（与 myBlog 的转义字形一一对照）：
 *               个人中心 e614 → icon-gerenzhongxin
 *               博客管理 e603 → icon-xieboke
 *               退出登录 e66b → icon-denglu
 *   route     跳转目标，vue-router 的 { name } 写法，读的就是 router/index.js 里的 name
 *             与 action 二选一
 *   action    非跳转型动作名，由 Aside.vue#handleNav 分发（目前只有 logout：
 *             清 token / uid / userInfo 后回首页）
 *   itemClass 该项专属类名，挂在 li 上（退出登录的图标要大一号，靠它选中）
 *   roles     可见角色（数组）。不写 = 所有登录用户都能看见。
 *             ⚠ 只是**显隐**，不是权限 —— 真正的拦截在路由守卫 + 服务端 authz，
 *               漏写这里最多是「看不到入口」，不会变成「谁都能进」。
 *
 * ⚠ route 与 action 不要同时写 —— handleNav 先判 action，route 会被忽略。
 */
export const ASIDE_NAV = {
  title: '我的',
  items: [
    {
      key: 'profile',
      text: '个人中心',
      iconName: 'icon-gerenzhongxin',
      route: { name: 'Info' }
    },
    {
      key: 'write',
      text: '博客管理',
      iconName: 'icon-xieboke',
      // 指向 /manage（我的博客列表：展开看信息、编辑、删除），
      // ⚠ 不再是 /write（写博客页）——「管理」的动作发生在列表上，写只是它的一个出口。
      //   页头那五个导航里的「博客」仍指向 Write，那是「去写一篇」的入口，两者职责不同。
      route: { name: 'Manage' }
    },
    {
      key: 'timeline',
      text: '时间线管理',
      // iconfont 里没有「时间线」字形，取语义最近的 icon-riqi（日期）——
      // 时间线的每条记录本来就是按「年月日」排的
      iconName: 'icon-riqi',
      route: { name: 'Timeline' }
    },
    {
      key: 'logout',
      text: '退出登录',
      iconName: 'icon-denglu',
      itemClass: 'blog-aside--logout',
      action: 'logout'
    }
  ]
}

/**
 * 「管理导航」卡片（管理员 / 站长才出现）
 *
 * 与 ASIDE_NAV 同构，单独一张卡：上面那张是「我自己能管的东西」，
 * 这张是「我能管别人 / 管站点的东西」，混在一张卡里层级看不出来。
 *
 * 图标（iconfont 里没有警棍 / 法槌这类字形，按下述语义取最近的）：
 *   处罚管理 → icon-guanbi（禁止）  账号管理 → icon-shenfen（身份牌）  操作记录 → icon-liulan（浏览记录）
 *
 * ⚠ 三条都带 roles：管理员看不到「账号管理」（账号级操作只认站长）。
 *   全部被过滤掉时，Aside.vue 会整张卡不渲染 —— 别在这里判角色。
 */
export const ASIDE_ADMIN = {
  title: '管理导航',
  items: [
    {
      key: 'admin-punish',
      text: '处罚管理',
      // icon-guanbi 就是「禁止」那个字形，最贴禁言 / 封禁
      iconName: 'icon-guanbi',
      route: { name: 'AdminPunish' },
      roles: ['admin', 'owner']
    },
    {
      key: 'admin-account',
      text: '账号管理',
      // 身份牌：改角色 / 注销账号 / 重置密码，都是「账号身份」层面的事
      iconName: 'icon-shenfen',
      route: { name: 'AdminAccount' },
      roles: ['owner']
    },
    {
      key: 'admin-logs',
      text: '操作记录',
      iconName: 'icon-liulan',
      route: { name: 'AdminLogs' },
      roles: ['admin', 'owner']
    }
  ]
}

/**
 * 扩展功能卡片
 *
 * 与 ASIDE_NAV 完全同构（Aside.vue 里两张卡共用一段 v-for 渲染），
 * 位置夹在「页面导航」与「友情链接」之间。
 *
 * 从「私有定制」改名为「扩展功能」：这张卡早就不只是「私人定制项」了 ——
 * 里面的入口是「站点提供的额外玩法」（桌宠 / 聊天室），改个名才说得通。
 *
 * items：
 *   菲比桌宠 → /pet 控件页（route 型）
 *   聊天室   → 打开聊天室弹窗（action 型，见 Aside.vue#chat）
 * 以后要加「主题色 / 背景图 / 字体」这类选项，往 items 里加一条即可
 * （图标只能在 iconfont 现有字形里挑，清单见 assets/fonts/iconfont.css；
 *   桌宠用 icon-biaoqing，聊天室用 icon-xiaoxi-01）。
 *
 * ⚠ 两张卡片的显隐条件一致：未登录时不出现（里面的入口都要登录才能用）。
 *   条件写在 Aside.vue 的 navCards computed 里，不在这里 —— 配置只管内容。
 */
export const ASIDE_PRIVATE = {
  title: '扩展功能',
  // 卡片自己的 id（Aside.vue 把它绑到 el-card 上；纯 hook，样式不依赖它）
  id: 'blog-aside--private',
  items: [
    {
      key: 'pet',
      text: '菲比桌宠',
      iconName: 'icon-biaoqing',
      route: { name: 'Pet' }
    },
    {
      key: 'chat',
      text: '聊天室',
      iconName: 'icon-xiaoxi-01',
      action: 'chat'
    }
  ]
}

/**
 * 友情链接卡片
 *
 * 数据来源：GET /api/profile（config/api.config.js 的 getProfile）
 *           → store 的 userInfo.data.friendLinks = [{ title, url }]
 *           （后端字段定义见 myapp/models/User.js 第 94-97 行）
 *
 *   title           卡片标题
 *   iconName        每条链接右侧的图标 —— 站点图标（favicon）拿不到，
 *                   统一用一个「去往站外」的右箭头，与导航卡片的图标方块同款
 *   collapsedCount  默认展开前的条数；超过它就折叠 + 出「更多」行
 *   moreText        「更多」行的文案
 *
 * 显示规则（Aside.vue 的 computed）：
 *   一条都没有            → 整张卡片不渲染
 *   条数 ≤ collapsedCount → 全部平铺，没有「更多」行
 *   条数 >  collapsedCount → 先只显示前 collapsedCount 条 + 一条「更多」行，
 *                          点一次展开全部，同时「更多」行消失（单向，不再收起）
 */
export const ASIDE_FRIENDS = {
  title: '友情链接',
  iconName: 'icon-right-1-copy',
  collapsedCount: 3,
  moreText: '点击显示更多'
}

export default {
  nav: ASIDE_NAV,
  admin: ASIDE_ADMIN,
  private: ASIDE_PRIVATE,
  friends: ASIDE_FRIENDS
}
