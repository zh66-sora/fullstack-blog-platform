/**
 * Timeline 时间线模型
 * =========================================================================
 * 职责：存「关于」页要展示的那条时间线 —— 一张整页面背景图 + 一组时间轴节点。
 *
 * 为什么单独成表，而不是往 User 上加字段？
 *   User 上已经有 socialLinks / friendLinks 两个数组子文档，再加一条时间轴也能塞得下；
 *   但时间线是**一页完整的展示内容**（整页背景图 + 若干带图的节点），
 *   与「账号资料」不是一回事，塞进 User 会让那个模型越滚越大。
 *   单独成表还有个直接好处：GET 可以按 userId 公开读，
 *   下一步的「他人主页」不用改任何模型就能复用。
 *
 * 命名约定（与全项目一致）：
 *   - 不用 timestamps，手动写 `date` 字段（默认 Date.now）
 *   - 不用 toJSON / 虚拟字段
 *   - 数组子文档直接内联（先例：User.socialLinks / User.friendLinks）
 *
 * ⚠ `owner` 上的 unique 是「一个用户一条时间线」这条业务规则的落点：
 *   保存接口靠它做 findOneAndUpdate({ owner }, …, { upsert: true })，
 *   不用先查再判断，也不会因为并发存出两条。
 *
 * ⚠ 模型层**不做必填校验**（只给 default 与最大长度兜底）：
 *   「每个字段都必填」这条规则的提示语要带「第 N 条」的序号，
 *   而 mongoose 的子文档校验错误 key 是 `items.0.title` 这种，
 *   经 app.js 的 QUE_MAP 转出来只能得到一串看不懂的英文路径。
 *   所以必填判断写在 routes/timeline.js 里，那里能给出人话提示。
 */
const mongoose = require('mongoose')

/** 单项的字数上限（前端 config/timeline.config.js 里有一份同值口径） */
const ITEM_MAX = {
  title: 20,
  description: 60
}

const schema = new mongoose.Schema({
  // ========== 归属 ==========
  owner: {
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'User',
    required: [true, '时间线必须归属到某用户'],
    unique: true
  },

  // ========== 整页面背景图 ==========
  backgroundImage: {
    type: String, // 时间线视口的整屏背景图 URL
    default: ''
  },

  // ========== 时间轴节点列表 ==========
  // 每项：单项背景图 / 标题 / 年月日 / 说明文字
  items: [{
    backgroundImage: {
      type: String, // 该节点的配图 URL
      default: ''
    },
    title: {
      type: String,
      default: '',
      maxlength: [ITEM_MAX.title, `标题不能超过 ${ITEM_MAX.title} 个字符`]
    },
    // ⚠ 存 'YYYY-MM-DD' 字符串而不是 Date：
    //   ① 它是用户手填的「年月日」，不是系统时间，不需要时区语义；
    //   ② 定长补零的字符串，字典序 == 时间序，前后端排序都是直接 localeCompare；
    //   ③ 模型里 `date` 已被「最后编辑时间」占用（全项目惯例），
    //      这里若也用 Date 会与那条编辑时间语义打架。
    date: {
      type: String,
      default: ''
    },
    description: {
      type: String,
      default: '',
      maxlength: [ITEM_MAX.description, `说明不能超过 ${ITEM_MAX.description} 个字符`]
    }
  }],

  // ========== 业务元数据 ==========
  date: { // 最后编辑日期
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  }
})

module.exports = mongoose.model('Timeline', schema)
// 附加常量导出（先例：WallMessage.MAX_LEN）
module.exports.ITEM_MAX = ITEM_MAX
