/**
 * 动作 / 表情 —— 桌宠模块的 core 层（对外唯一的「命令」出口）
 * =========================================================================
 * 键盘（Alt 组合键）与将来的控制面板都调这里，不再各自摸 model：
 * 面板加按钮时只需要 `actions.motion('KeyY')`，不用知道动作组名和下标。
 *
 * 表情是**切换型**并且直写参数（不走 fork 的 ExpressionManager —— 它在 1.4.0 有每帧失效
 * 的问题，而参数直写能随 save/load 快照持久化，行为与 PC 版一致）。
 */

import { ALT_MOTIONS, ALT_EXPRESSIONS } from '../config/keymap'

/**
 * @param {object}   options
 * @param {object}   options.profile  模型档案（motion / params.expressions / sounds）
 * @param {Function} options.getModel 取当前模型
 * @param {Function} options.setParam 参数写入口
 * @param {object}   options.voice    core/voice.js 实例（动作带语音时用）
 */
export function createActions({ profile, getModel, setParam, voice }) {
  let currentExpression = null    // 当前生效的表情名（null = 默认）

  /** 把某个表情置 1、其余置 0 —— 这就是「切换型」的全部实现 */
  function applyExpression(name) {
    const table = profile.params.expressions
    Object.keys(table).forEach((exprName) => {
      setParam(table[exprName], name === exprName ? 1 : 0)
    })
  }

  return {
    get currentExpression() { return currentExpression },

    /** Alt + 键 → 触发动作；返回是否命中 */
    motion(code) {
      if (!profile.capabilities.motions) return false
      const item = ALT_MOTIONS[code]
      const model = getModel()
      if (!item || !model) return false
      // priority 3 = FORCE：确保覆盖当前状态
      model.motion(profile.motion.group, item.index, profile.motion.priority)
      if (item.sound) voice.play(profile.sounds[item.sound])
      return true
    },

    /** Alt + 键 → 切表情（再按一次回默认）；返回是否命中 */
    expression(code) {
      if (!profile.capabilities.expressions) return false
      const name = ALT_EXPRESSIONS[code]
      if (!name) return false
      const next = currentExpression === name ? '默认' : name
      applyExpression(next)
      currentExpression = next === '默认' ? null : next
      return true
    },

    /**
     * 控制面板用：**直接**置成某个表情（没有切换语义）
     * 配置页选「默认 / 昏迷 / 生气…」走这条 —— 用户点的是「我要这个」，
     * 不是「拨一下开关」，所以不能像 Alt 键那样「再点一次回默认」。
     */
    apply(name) {
      const next = name === '默认' ? '默认' : name
      applyExpression(next)
      currentExpression = next === '默认' ? null : next
    },

    /** 复位到默认表情（卸载时）*/
    reset() {
      currentExpression = null
      applyExpression('默认')
    },
  }
}
