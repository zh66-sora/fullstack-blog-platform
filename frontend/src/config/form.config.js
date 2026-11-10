/**
 * 表单字段表 —— config 层（按 form type 索引，BaseForm 用 :type 取对应的字段数组）
 *
 * 迁移自原项目 myBlog 的表单定义。当前的使用情况：
 *   login / register  → AuthModal 的两块面板（有使用者）
 *   postColumn / info → ⚠ 暂无组件使用：AuthModal 只负责登录注册，
 *     这是原项目「添加分类」「个人信息」两个单面板弹窗的字段，
 *     等真的要做时另建一个单面板弹窗组件即可，字段照这里取，不用重写。
 *
 * 校验规则放在 validate.config.js，按字段名（username / email / password）挂，
 * 与 form type 无关 —— 所以任何表单里出现同名字段都会自动带上校验。
 */
export default {
  "login": [
    {
      label: "用户名",
      query: "username",
      type: "text",
      placeholder: "用户名: 6-8位 字母数字"
    },
    {
      label: "密码",
      query: "password",
      type: "password",
      placeholder: "密码: 8-12位 最少包含一位(数字/大小写字母)"
    }
  ],
  "postColumn": [
    {
      label: "分类名称",
      query: "name",
      type: "text",
      placeholder: "请填写分类名称"
    }
  ],
  "register": [
    {
      label: "用户名",
      query: "username",
      type: "text",
      placeholder: "用户名: 6-8位 字母数字"
    },
    {
      label: "邮箱",
      query: "email",
      type: "text",
      placeholder: "请输入邮箱地址"
    },
    {
      label: "密码",
      query: "password",
      type: "password",
      placeholder: "密码: 8-12位 最少包含一位(数字/大小写字母)"
    }
  ],
  "info": [
    {
      label: "用户名",
      query: "username",
      type: "text",
      placeholder: "用户名: 6-8位 字母数字"
    },
    {
      label: "昵称",
      query: "nikname",
      type: "text",
      placeholder: "请输入昵称"
    },
    {
      label: "邮箱",
      query: "email",
      type: "text",
      placeholder: "请输入邮箱地址"
    },
    {
      label: "签名",
      query: "signature",
      type: "txt",
      placeholder: "请输入你的个性签名"
    }
  ]
}