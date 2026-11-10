import Vue from 'vue'
import App from './App.vue'
import './plugins/element.js'
// 引入 Element 主题适配层（把 Element 自带的主色/中性色接到 --theme-* 上）
// ⚠ 必须紧跟在 plugins/element.js **之后**、其余样式**之前**：
//    - 在 element 之后 → 才能压过它自带的默认值（同权重，靠注入顺序取胜）
//    - 在项目自有样式之前 → 同权重时让项目自己的写法优先
//   具体受影响的控件与原因见该文件头部注释
import './assets/css/element-theme.styl'
// 引入路由文件
import router from './router/index.js'
// 引入全局样式
import './assets/css/global.styl'
// 引入主题变量（颜色用 CSS 变量，便于后期一键切换主题色）
import './assets/css/themes.styl'
// 引入通用组件样式（卡片外壳 / 卡片头部等被多组件共用的类）
import './assets/css/component.styl'
// 引入表单基底样式（.blog-write--* 的卡片壳/顶栏/字段/按钮 —— Write.vue 与 Info.vue 共用）
import './assets/css/form.styl'
// 引入 markdown 正文排版（文章详情页的富文本内容，reset 之后需要恢复原生标签样式）
import './assets/css/markdown.styl'
// 引入模态框样式（登录/注册双面板 + el-dialog 默认样式的覆盖）
import './assets/css/modal.styl'
// 引入评论样式（评论区 + 楼中楼弹窗；被 comment/ 下多个组件共用，所以放全局而非组件内）
import './assets/css/comment.styl'
// 引入表情面板样式（评论区与聊天室共用 EmojiPanel.vue，同样放全局）
import './assets/css/emoji.styl'
// 引入留言墙样式（只写墙独有的几块；条目本身复用 comment.styl 的类）
import './assets/css/wall.styl'
// 引入博客管理样式（卡片壳 + 胶囊条目 + 展开行；顶栏复用 form.styl 的 .blog-write--header）
import './assets/css/manage.styl'
// 引入管理端样式（处罚管理 / 账号管理 / 操作记录三页共用；顶栏同样复用 form.styl）
import './assets/css/admin.styl'
// 引入聊天室样式（聊天室下所有组件共用）
import './assets/css/chat.styl'
// 引入图标字体
import './assets/fonts/iconfont.css'
// 引入隐藏类
import 'element-ui/lib/theme-chalk/display.css'
// 引入 vuex
import store from './store'
// 引入自定义http插件
import httpPlugin from './plugins/httpPlugin.js'
// 引入自定义toast插件
import toastPlugin from './plugins/toastPlugin.js'
// 锁定页面缩放（全站固定 125%，见 assets/css/global.styl）
import lockZoom from './utils/lockZoom.js'

Vue.use(httpPlugin)
Vue.use(toastPlugin)

// 尽早挂上：拦 Ctrl/⌘ + 滚轮与触摸板捏合改倍率
// ⚠ 不拦的话，用户自己的浏览器缩放会叠在写死的 1.25 上（1.25 × 1.25 = 156%），布局会被撑坏
lockZoom()

Vue.config.productionTip = false

const vm = new Vue({
  router,
  store,
  render: h => h(App),
})

// 必须先给 store 挂上根实例引用，再执行 $mount：
// $mount() 会同步渲染整棵组件树并在同一帧触发子组件的 mounted，
// 若写在 $mount 之后，子组件 mounted 里访问 this.$vm 会拿到 undefined
store.$vm = vm

// 主题落地：把本地存着的「白天/夜间 + 色相」写进 DOM（data-theme + 5 个强调色变量）
// ⚠ 必须在 $mount 之前 —— 首帧就用正确配色，否则深色用户会先看到一下浅色闪屏。
//   之后每次切模式/换色相都由 store 的 toggleMode / setHue 自己再调一次（见 store/modules/theme.js）
store.dispatch('theme/apply')

vm.$mount('#app')

// 聊天室：绑定 socket 事件；本地已有 token（刷新进入）时直接建立连接 ——
// 对齐需求「登录后直到关闭页面或退出登录，才关闭 WebSocket 会话标识」，
// 与弹窗开关无关（弹窗只是消费 store 里的消息流）。
// ⚠ 放在 $mount 之后：被顶号的处理里会用到 $route / $router
store.dispatch('chat/bootstrap')