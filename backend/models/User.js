/**
 * User 用户模型
 * =========================================================================
 * 职责：存储用户账号信息，提供密码加密存储和格式校验
 *
 * 安全设计：
 *   - password 字段 select: false → 查询时默认不返回密码，防止泄露
 *   - setter 中自动加解密：前端传输时用 RSA 公钥加密 → 后端解密 → 校验格式 → bcrypt 加密存储
 *   - 密码永远不会以明文形式存入数据库
 *
 * 字段校验策略：
 *   - username：validator 校验，要求数字字母混合、6-8位
 *   - password：setter 中校验，要求大小写字母+数字、8-12位
 *     选择在 setter 而非 validator 校验密码的原因：
 *     setter 可以在 set 过程中完成"解密→校验→再加密"完整管道，
 *     validator 只能校验已赋值的值，无法在加密前检查明文格式
 *
 * 注意：
 *   加解密函数路径需与部署环境一致（测试/正式路径可能不同）
 */
const mongoose = require('mongoose')
// ⭐️ TODO 注意此处路径 测试和正式可能不同
const { encryptSync, decryptSync } = require('../core/util/util.js')

const schema = new mongoose.Schema({
  // ========== 必填字段 ==========
  username: {
    type: String,
    required: [true, '用户名必填'], // 必填
    unique: true, //唯一
    validate: { // 校验
      validator(val) {
        return /^(?!\d+$)(?![a-zA-Z]+$)[a-zA-Z0-9]{6,8}$/.test(val)
      },
      message: '用户名需使用数字、字母混合；长度6-8位'
    }
  },
  password: {
    type: String,
    required: [true, '密码必填'],
    select: false, // 查询结果中不可见
    // 不需要额外的 validate,错误在 setter 中抛出; mongoose 将setter内抛出的错误包装成验证错误
    // mongoose setter 不支持 async
    set(val) {
      // 前端注册的密码经过加密,需要先解密
      val = decryptSync(val)
      // 校验：大小写字母+数字，8-12位，允许部分特殊字符
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d!.#*?&]{8,12}$/.test(val)) {
        console.log('没通过')
        throw new Error('密码格式错误');
      }
      console.log(encryptSync(val))
      return encryptSync(val);
    }
  },
  // ========== 可选字段 ==========
  nickname: {
    type: String,
    unique: true, // 唯一
    sparse: true, // 允许 null/undefined 值不触发唯一索引冲突
    validate: { // 校验
      validator(val) {
        // 允许为空（已注册用户升级时无 nickname）
        if (val == null || val === '') return true
        return /^[0-9a-zA-Z一-龥_]{1,8}$/.test(val)
      },
      message: '昵称允许包含数字、字母、常见汉字、下划线的组合；长度1-8位'
    }
  },
  // ========== 可选字段 ==========
  avatar: {
    type: String, // URLString
    default: "http://example.com/images/avator-wheel.jpg"
  },
  banner: {
    type: String, // 背景图 URL
    default: ''
  },
  bio: {
    type: String, // 个签
    default: '',
    maxlength: [100, '个签不能超过100个字符']
  },
  socialLinks: [{ // 社交媒体链接
    platform: {
      type: String,
      enum: {
        values: ['github', 'wechat', 'bilibili'],
        message: '不支持的社交媒体平台'
      }
    },
    url: { type: String, default: '' }
  }],
  friendLinks: [{ // 友情链接
    title: { type: String },
    url: { type: String, default: '' }
  }],
  // ========== 业务元数据字段 ==========
  date: { // 最后编辑日期
    type: mongoose.SchemaTypes.Date,
    default: Date.now
  },

  // ========== 权限与账号状态 ==========
  // 三级角色：owner(站长) > admin(管理员) > user(普通用户)
  // 站长唯一，由 scripts/setOwner.js 设定；注册接口不接受客户端传 role
  role: {
    type: String,
    enum: ['owner', 'admin', 'user'],
    default: 'user',
    index: true
  },
  // active 正常 / muted 禁言 / banned 封禁 / deleted 已注销（软删，内容保留）
  status: {
    type: String,
    enum: ['active', 'muted', 'banned', 'deleted'],
    default: 'active',
    index: true
  },
  // 到期时间：null = 永久；到期后读取时「惰性」视为 active，不跑定时任务
  statusUntil: {
    type: mongoose.SchemaTypes.Date,
    default: null
  },
  // 处罚理由 / 操作人 不默认返回：通用 GET /api/rest/users 是公开读，别把管理备注带出去
  statusReason: { type: String, default: '', select: false },
  statusBy: { // 谁操作的，便于追责
    type: mongoose.SchemaTypes.ObjectId,
    ref: 'User',
    select: false
  },
  statusAt: { type: mongoose.SchemaTypes.Date }
})

module.exports = mongoose.model('User', schema)
