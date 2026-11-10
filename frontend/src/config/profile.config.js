/**
 * 个人中心（/info 修改个人资料）配置 — config 层
 * =========================================================================
 *
 * 迁移自 myBlog：
 *   结构   src/template/profile.hbs（156 行）
 *   数据   app/utils/profileViewModel.js → buildProfileViewModel()
 *   交互   app/actionControl.js 663-1084（profileAgency，422 行）
 *   校验   actionControl.js 858-924 的 PROFILE_FIELD_RULES
 *   上限   actionControl.js 里散落的 3（社媒）/ 20（友链）/ 5（滚动阈值）
 *
 * 本文件只放「不依赖运行时的声明」：字段表、上限、正则、校验规则。
 * 流程编排（拉数据 / 编辑态 / 保存 / 重置）留在 views/Info.vue。
 *
 * ⚠ 校验规则为什么不进 config/validate.config.js：
 *   validate.config.js 是给 BaseForm（el-form + :rules）用的 element-ui 规则格式，
 *   按字段名挂、要求「单字段自治」。而 oldPwd 是**跨字段**规则（新密码非空才必填），
 *   必须能读到同一份 form，写不进那张静态表。四条规则同源同改，
 *   拆两个文件反而更容易改漏，所以整组放这里。
 */

// ============================================================
// 一、正则（与后端 myapp/models/User.js 的校验保持一致）
// ============================================================

/** 昵称：1-8 位中英文数字下划线（对应 User.js 第 65 行） */
export const NICKNAME_RE = /^[0-9a-zA-Z一-龥_]{1,8}$/

/** 密码：8-12 位，必须含小写 + 大写 + 数字 */
export const PWD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d!.#*?&]{8,12}$/

// ============================================================
// 二、上限（迁移自 actionControl.js 里写死的数字）
// ============================================================

export const LIMITS = {
  /** 社交媒体最多 3 条 —— 与后端 socialLinks 的 enum 三个平台对应 */
  social: 3,
  /** 友情链接最多 20 条 —— 对应 profileViewModel.js 的 friendMax */
  friend: 20,
  /** 友情链接超过这个条数就给表格加滚动（对应 friendScroll: length > 5） */
  friendScroll: 5,
}

// ============================================================
// 三、表格 / 按钮 / 提示文案（原 profile.hbs 里写死的部分）
// ============================================================

export const PROFILE_TEXT = {
  title: '个人资料',
  backTip: '返回主页',
  editHint: '编辑状态下所有字段均可修改，保存后生效。密码如不修改请留空。',
  buttons: {
    edit: '编辑',
    reset: '重置',
    save: '保存',
  },
  /** 社交媒体表格的两列表头 */
  socialTable: ['媒体渠道', '内容'],
  /** 友情链接表格的两列表头 */
  friendTable: ['站点名称', '链接URL'],
}

// ============================================================
// 四、文本字段表（迁移自 profile.hbs 第 54-80 行 + 88-143 行的两张表）
// ============================================================

/**
 * 四个文本字段。**渲染顺序即数组顺序**。
 *
 *   name        字段名 —— 同时是 form 的键、规则表的键、气泡提示的 id 后缀
 *   label       左侧色块 label 文案
 *   type        input 的 type（password 走浏览器原生遮蔽）
 *   maxlength   有值的才写（原项目只有个签写了 maxlength="30"）
 *   placeholder / hint
 *               hint 同时是「常显的灰色说明」和「校验失败时的红色提示」——
 *               原项目就是同一个元素：默认 display:none，input 挂上 .input-err
 *               时由 `& + .blog-profile--input_hint` 显示出来。
 *   section     所属分区名。渲染时「与上一条不同」就打一句分区小标题
 *               （见 Info.vue 模板里的 <template v-for> + .blog-form--section_title）
 *
 * ⚠ 与 myBlog 原顺序的**唯一差异**：`bio`（个签）从最后挪到了 `nickname` 后面。
 *   原顺序是 昵称 / 旧密码 / 新密码 / 个签 —— 密码夹在中间，怎么切都只能切出
 *   「昵称单独一区、个签单独一区」这种碎分区；把个签提上来就能得到
 *   形象 / 基本资料 / 账号安全 / 社交与友链 四个干净的区。
 *   想还原成原顺序，把 bio 那一条搬回数组末尾即可（不影响校验，validateAll 与顺序无关）。
 */
export const PROFILE_TEXT_FIELDS = [
  {
    name: 'nickname',
    label: '昵称',
    type: 'text',
    section: '基本资料',
    placeholder: '1-8位中英文数字下划线',
    hint: '1-8位中英文数字下划线，不允许为空',
  },
  {
    name: 'bio',
    label: '个签',
    type: 'text',
    maxlength: 30,
    section: '基本资料',
    placeholder: '介绍一下自己（最多30字）',
    hint: '30字以内,不允许为空',
  },
  {
    name: 'oldPwd',
    label: '旧密码',
    type: 'password',
    section: '账号安全',
    placeholder: '如需修改密码请填写旧密码',
    hint: '修改密码时需填写旧密码',
  },
  {
    name: 'newPwd',
    label: '新密码',
    type: 'password',
    section: '账号安全',
    placeholder: '8-12位，含大小写字母和数字',
    hint: '8-12位，必须含大小写字母和数字',
  },
]

/** 顶部「形象」区（头像 / 背景图）与底部「社交与友链」区的分节标题 */
export const PROFILE_SECTIONS = {
  image: '形象',
  links: '社交与友链',
}

/**
 * 两个图片字段（原 profile.hbs 第 29-51 行，两块除三处外完全相同）
 *
 *   name        form 的键 / 上传后回写的字段名
 *   label       左侧 label 文案
 *   modifier    预览框的修饰类 —— 背景图更宽更扁（.is-banner）
 *   ratio       裁剪宽高比（宽/高）：头像 1:1，背景图 2:1
 *   fallback    没设置时的兜底图（原项目走的是后端给的默认值，
 *               这里头像落到内置默认头像，背景图没有兜底 —— 与原模板
 *               `{{#if data.banner}}` 的写法一致：没设置就整个不渲染 img）
 */
export const PROFILE_IMAGE_FIELDS = [
  {
    name: 'avatar',
    label: '头像',
    modifier: '',
    ratio: 1,
    fallback: require('@/assets/images/avator-default.jpg'),
  },
  {
    name: 'banner',
    label: '背景图',
    modifier: 'is-banner',
    ratio: 2,
    fallback: '',
  },
]

/**
 * 社交媒体平台选项（原 actionControl.js 第 76-80 行的 SOCIAL_PLATFORMS）
 *
 * ⚠ `value` 必须与后端 User.js 的 socialLinks.platform enum 完全一致：
 *   ['github', 'wechat', 'bilibili']。改这里就要同步改后端。
 */
export const SOCIAL_PLATFORMS = [
  { value: 'github', label: 'GitHub' },
  { value: 'wechat', label: '微信' },
  { value: 'bilibili', label: 'B站' },
]

// ============================================================
// 五、校验规则（迁移自 actionControl.js 858-865 行的 PROFILE_FIELD_RULES）
// ============================================================

/**
 * ⚠ 语义照搬原文，不要"改良"：`test(val, ctx)` 返回 **true 表示校验未通过**。
 *
 *   val  该字段 trim 后的值
 *   ctx  跨字段上下文，目前只有 newPwd（旧密码是否必填靠它判断）
 *
 * 与原文的差异只有一处：原文 oldPwd 的规则是 `(val, ctx) => ctx.newPwd && !val`，
 * 依赖调用方把 newPwd 塞进 ctx —— 这里保持同样的约定，由 Info.vue 组装 ctx。
 */
export const PROFILE_FIELD_RULES = {
  // 必填，1-8 位中英文数字下划线
  nickname: (val) => !val || !NICKNAME_RE.test(val),
  // 必填，最长 30 字
  bio: (val) => !val || val.length > 30,
  // 允许为空，非空时才校验格式
  newPwd: (val) => !!val && !PWD_RE.test(val),
  // 新密码非空 → 旧密码必填
  oldPwd: (val, ctx) => !!ctx.newPwd && !val,
}

export default {
  LIMITS,
  PROFILE_TEXT,
  PROFILE_TEXT_FIELDS,
  PROFILE_IMAGE_FIELDS,
  PROFILE_SECTIONS,
  SOCIAL_PLATFORMS,
  PROFILE_FIELD_RULES,
  NICKNAME_RE,
  PWD_RE,
}
