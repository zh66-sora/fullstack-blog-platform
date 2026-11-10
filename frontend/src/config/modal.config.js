/**
 * 登录 / 注册模态框的配置 —— config 层
 *
 * 迁移自原项目 myBlog/app/config/modal.config.js。原文件里还有 postColumn（添加分类）、
 * info（个人信息）等单面板弹窗的配置 —— 那些不属于 AuthModal 的职责，
 * 等将来真的要做时另建一个单面板弹窗组件（表单字段本身仍留在 form.config.js 里）。
 *
 * 两个 type 成对使用同一个 AuthModal 的两块面板：
 *   type = 'login'    → 滑块在左，露出登录面板
 *   type = 'register' → 滑块右移，容器归位，露出注册面板
 *
 * `btns[].targetName` 对应 AuthModal 上的同名方法：close / confirm / switch。
 * 配置只管「显示什么」，怎么切换、怎么提交由 AuthModal 决定。
 */
export default {
  "login": {
    title: '登录',
    btns: [
      // 切到注册面板（对应原项目的 data-btn-target="switch"）
      {
        targetName: 'switch',
        name: '注册'
      },
      // 提交 → store 的 http/login action（该 action 按 type 区分 login / register 接口）
      {
        targetName: 'confirm',
        name: '提交',
        isSubmit: true
      }
    ]
  },
  "register": {
    title: '注册',
    btns: [
      // 切回登录面板
      {
        targetName: 'switch',
        name: '登录'
      },
      {
        targetName: 'confirm',
        name: '注册',
        isSubmit: true
      }
    ]
  }
}
