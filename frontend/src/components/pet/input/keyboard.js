/**
 * 键盘输入 —— 桌宠模块的 input 层（事件 → 意图）
 * =========================================================================
 * 两条路：
 *   ① Alt + 键  → 动作 / 表情（要先判表情，再判动作 —— 键位表里有重叠的可能）
 *   ② 其它打字键 → 叠加手（把按下/松开交给 core/handOverlay 的栈）
 *
 * ⚠ 一律用 e.code（物理键位），不用 e.key：e.key 在中文输入法下是 'Process'，
 *   桌宠会时灵时不灵。
 *
 * ⚠⚠ 与「验证页」最大的不同 —— 这只桌宠是嵌在博客里的，键盘是**全局**的：
 *   原版 `js/main.js` 对每个打字键都 `e.preventDefault()`，那在独立页面里没问题，
 *   但我们这里用户随时可能在搜索框、登录框、Markdown 编辑器里打字 ——
 *   照搬就会「打字打不进去」。所以：
 *     · 焦点在可编辑元素上时**不 preventDefault**（让字符正常输入），但照样驱动手；
 *     · 焦点在页面上时保留 preventDefault，用来挡掉 Tab 切焦点 / Space 翻页这些默认行为。
 *   这一点靠 injected 的 isTypingTarget 判断，模块本身不认识 DOM 细节。
 */

import { ALT_MOTIONS, ALT_EXPRESSIONS, HAND_KEY_INDEX } from '../config/keymap'

/**
 * @param {object}   options
 * @param {object}   options.profile       模型档案
 * @param {object}   options.hand          core/handOverlay 实例（按下/松开/复位）
 * @param {object}   options.actions       core/actions 实例（动作/表情）
 * @param {Function} options.isTypingTarget (event) => boolean，焦点是否在输入控件里
 */
export function createKeyboard({ profile, hand, actions, isTypingTarget = () => false }) {
  function onKeyDown(e) {
    // ① Alt 组合键：表情 / 动作
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (e.code in ALT_MOTIONS || e.code in ALT_EXPRESSIONS) {
        // 这些组合可能是浏览器自己的快捷键（如 Alt+D），拦掉
        e.preventDefault()
        if (e.repeat) return          // 长按只触发一次
        if (actions.expression(e.code)) return
        actions.motion(e.code)
        return
      }
    }

    // ② 打字键 → 叠加手
    if (!profile.capabilities.handOverlay) return
    if (!HAND_KEY_INDEX.has(e.code)) return
    if (!isTypingTarget(e)) e.preventDefault()
    hand.press(e.code)
  }

  function onKeyUp(e) {
    if (!profile.capabilities.handOverlay) return
    hand.release(e.code)
  }

  return {
    attach() {
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
    },
    detach() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    },
    /** 失焦复位：清掉「按下」状态，否则手会卡在按下 */
    reset() {
      hand.reset()
    },
  }
}
