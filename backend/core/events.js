/**
 * 进程内事件总线
 * =========================================================================
 * 只做一件事：让「模型」和「关心模型变化的人」互不认识。
 *
 * 为什么需要它：
 *   搜索索引要在文章增删改后同步，但 models 层不该 require 搜索服务（分层规则里
 *   models 只负责 Schema）。于是模型只广播「文章变了」，谁关心由启动层（app.js）
 *   去订阅 —— 依赖方向变成 models → 事件总线 ← plugins，两边都不认识对方。
 *
 * ⚠ 只在单进程内有效：pm2 cluster / 多实例时，别的进程收不到事件。
 *   这也是「每日全量重建」始终要保留的原因之一。
 */
const { EventEmitter } = require('events')

const bus = new EventEmitter()
// 监听器多了 Node 会打 MaxListenersExceededWarning，放宽一些
bus.setMaxListeners(50)

module.exports = bus
