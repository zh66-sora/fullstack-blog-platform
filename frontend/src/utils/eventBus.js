/**
 * 全局事件总线 —— utils 层
 * =========================================================================
 * 就是「一个空的 Vue 实例」，只借用它的 $on / $emit / $off 三个方法：
 *   发送方：bus.$emit('事件名', 载荷)
 *   接收方：bus.$on('事件名', 回调) / bus.$off('事件名', 回调)
 *
 * 什么时候用总线、什么时候用 Vuex：
 *   Vuex 存「状态」—— 读的人任何时候来取都能拿到当前值（如 reactions 点赞态度），
 *     可追踪、可被多个组件同时订阅。
 *   总线传「一次性动作」—— 事件发出去就结束了，不留下任何值
 *     （如浮动按钮组让文章详情页「点个赞」「滚到评论框」）。
 *   把一次动作硬塞进 Vuex，就得多存一份状态、还得靠自增 seq 骗 watch 触发
 *     （原实现 article.floatAction = { seq, type } 就是这么绕的）；
 *   总线天然是一次性事件，连点两次点赞就会触发两次，不需要 seq。
 *
 * ⚠ 订阅方必须在 beforeDestroy 里 $off：总线是模块级单例，活得比任何组件都久，
 *   不摘的话组件销毁后回调还在队列里 —— 反复进出文章页会攒下一串重复回调，
 *   点一次赞触发 N 次。Article 目前没进 keep-alive，mounted / beforeDestroy
 *   成对执行即可；若将来被缓存住，要换成 activated / deactivated。
 */
import Vue from "vue";

/**
 * 事件名常量表：发送方与接收方都从这里取，避免两处手写字符串打错
 * （命名沿用原项目 app/bus/* 的 `域:动作` 习惯）
 */
export const EVENTS = {
  // 浮动按钮组（Home 层）→ 文章详情页（router-view 内）：点赞 / 跳到评论输入框
  FLOAT_LIKE: "float:like",
  FLOAT_COMMENT: "float:comment",

  // 菲比桌宠控件页（/pet）→ 运行中的桌宠（Home 层的 BongoCatPet）：
  // 触发一次动作。开关 / 大小 / 表情 / 动作选单走 Vuex（那是「状态」，要持久化），
  // 只有「点一下立刻在桌宠身上做一次」这类一次性动作用总线 —— 与 FLOAT_* 同一判断口径
  PET_MOTION: "pet:motion",
};

export default new Vue();
