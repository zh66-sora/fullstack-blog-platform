/**
 * 时间线模块配置 — config 层
 * =========================================================================
 * 「关于」页（views/About.vue）与「时间线管理」页（views/Timeline.vue）共用这一份：
 *   · 两个页面读的是**同一份数据结构**（`{ backgroundImage, items[] }`）
 *   · 文案 / 裁剪比例 / 字数上限 / 校验规则 只能写在一处 ——
 *     否则迟早出现「管理页让存、展示页渲染不出」这种两头都对不上的问题
 *
 * 迁移与参照：
 *   骨架   config/profile.config.js（个人中心那份：字段表 + 上限 + 校验规则 + 文案）
 *   来源   Desktop/todo/计划.md 第 61-80 行（时间线模块需求）+ assets 里两张参考图
 *
 * ⚠ 字数上限与后端 `myapp/models/Timeline.js` 的 ITEM_MAX 同值：
 *   前端是即时提示（管住输入），后端是最后一道闸（挡住绕过前端的请求）。改一处要同步另一处。
 */

// ============================================================
// 一、文案
// ============================================================

export const TIMELINE_TEXT = {
  /** 展示页（顶栏文案 —— 页头那一格也叫「关于」，两处要一致） */
  about: {
    title: '关于',
    backTip: '返回主页'
  },
  /** 管理页 */
  manage: {
    title: '时间线管理',
    backTip: '返回主页'
  },
  sections: {
    cover: '整页面背景图',
    list: '时间轴列表'
  },
  buttons: {
    edit: '编辑',
    reset: '重置',
    save: '保存',
    add: '添加一条',
    remove: '删除'
  },
  /** 两个图片字段左侧的 label */
  imageLabels: {
    cover: '背景图',
    item: '图片'
  }
}

// ============================================================
// 二、字数上限（与后端 Timeline.ITEM_MAX 同值）
// ============================================================

export const ITEM_MAX = {
  title: 20,
  description: 60
}

// ============================================================
// 三、图片裁剪比例（宽 / 高）
// ============================================================

/**
 * ⚠ item 的 3:2 必须与 about.styl 里 `.blog-about--figure` 的 aspect-ratio 一致：
 *   展示时图片是 `object-fit: cover`，裁剪比例与盒子比例不同的话，
 *   用户裁好的构图会被二次裁掉一块。
 */
export const TIMELINE_RATIO = {
  /** 整页面背景图：铺满时间线视口，取常见宽屏比例 */
  cover: 16 / 9,
  /** 单项配图 */
  item: 3 / 2
}

// ============================================================
// 四、单项字段表
// ============================================================

/**
 * 时间轴的一条记录。
 *
 * **字段顺序即渲染顺序，也是错误提示里「第 N 个」的判读顺序。**
 *
 *   name        字段名 —— 同时是后端子文档的键、表单的键、规则表的键
 *   label       表单左侧的 label 文案
 *   type        text / date / textarea / image（image 走裁剪上传，不是原生输入框）
 *   maxlength   有值的才写（交给原生 maxlength，配合 ITEM_RULES 双重拦截）
 *   placeholder
 */
export const ITEM_FIELDS = [
  { name: 'backgroundImage', label: '图片', type: 'image' },
  {
    name: 'title',
    label: '标题',
    type: 'text',
    maxlength: ITEM_MAX.title,
    placeholder: `最多 ${ITEM_MAX.title} 个字`
  },
  {
    name: 'date',
    label: '年月日',
    type: 'date',
    placeholder: 'YYYY-MM-DD'
  },
  {
    name: 'description',
    label: '说明文字',
    type: 'textarea',
    maxlength: ITEM_MAX.description,
    placeholder: `最多 ${ITEM_MAX.description} 个字`
  }
]

// ============================================================
// 五、校验规则
// ============================================================

/** 年月日格式：与后端 routes/timeline.js 的 DATE_RE 是同一条 */
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * 计数用码点：emoji 是代理对，`.length` 会把一个表情算成两个字
 * （与后端 wall.js / timeline.js 的 `len` 同一口径 —— 两边数字必须一致）
 */
const len = (s) => [...(s || '')].length

/**
 * 单项的四条规则。
 *
 * ⚠ 语义照搬 profile.config.js 的 PROFILE_FIELD_RULES：**返回 true 表示校验未通过**。
 *   这样整表校验就是一句 `fields.some(f => ITEM_RULES[f.name](v))`，不用层层取反。
 *
 * 入参已经是 trim 过的字符串；image 字段传的是图片 URL（空串 = 还没传）。
 */
export const ITEM_RULES = {
  backgroundImage: (val) => !val,
  title: (val) => !val || len(val) > ITEM_MAX.title,
  date: (val) => !val || !DATE_RE.test(val),
  description: (val) => !val || len(val) > ITEM_MAX.description
}

/** 校验失败时字段下方那行红字（与 profile 的 hint 一个用法：常显的灰字 / 出错变红） */
export const ITEM_HINTS = {
  backgroundImage: '必填 —— 点击上传并裁剪',
  title: `必填，最多 ${ITEM_MAX.title} 个字`,
  date: '必填，格式 YYYY-MM-DD',
  description: `必填，最多 ${ITEM_MAX.description} 个字`
}

/** 整页面背景图：必填（与后端 PUT 里那句 assert 一致） */
export const COVER_RULE = (val) => !val

/** 整页面背景图的错误提示 */
export const COVER_HINT = '必填 —— 点击上传并裁剪'

export default {
  TIMELINE_TEXT,
  ITEM_MAX,
  TIMELINE_RATIO,
  ITEM_FIELDS,
  ITEM_RULES,
  ITEM_HINTS,
  COVER_RULE,
  COVER_HINT,
  DATE_RE
}
