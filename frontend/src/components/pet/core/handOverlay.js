/**
 * PNG 叠加手 —— 桌宠模块的 core 层
 * =========================================================================
 * 还原 PC 版 standard 模式的手部机制：菲比模型的 `CatParamLeftHandDown = 1`
 * 会把键盘上的 Live2D 手**淡出**（部件切换），此时由 PNG 手图接管。
 *
 * 这是整个迁移里最容易出竞态的一处（SKILL 的第 4 个坑），所以单独成模块：
 *   · 25 张图是**异步逐张**加载的，加载期间用户可能已经在按键、甚至已经换了模型；
 *   · 原版用「全局 model 变量 + 代次令牌」解决，这里把令牌收进模块内部，
 *     外部拿不到全局模型，也就没机会挂错。
 *
 * 三条硬规则（改代码前先读）：
 *   ① 手图没加载完 → 不许把 Live2D 手藏起来（否则就是「按键后手消失了」）；
 *   ② 加载完 / 加载失败都用令牌判一次代次，旧结果直接丢；
 *   ③ 手图尺寸按 internalModel 的画布算（菲比 1400×1400），不要写死像素 —— 换模型就错位。
 */

import { Assets, Sprite } from 'pixi.js'
import { HAND_KEY_INDEX } from '../config/keymap'

/**
 * @param {object}   options
 * @param {object}   options.profile  模型档案（要 params.leftHandDown / hand）
 * @param {Function} options.setParam 参数写入口（core/params.js 的 set）
 */
export function createHandOverlay({ profile, setParam }) {
  let sprites = []
  let stack = []          // 按下中的手区键：栈顶决定显示哪张手
  let ready = false
  let token = 0           // 代次令牌：换模型 / 重新加载会 ++
  let model = null        // 这批手图挂在哪只模型上

  /**
   * 把「当前按键状态」刷到画面上 —— 显示哪张手 + Live2D 手要不要让位
   * 就绪前一律保持 Live2D 手可见（规则①）
   */
  function apply() {
    if (!ready) {
      setParam(profile.params.leftHandDown, 0)
      return
    }
    const topCode = stack.length ? stack[stack.length - 1] : null
    const index = topCode === null ? -1 : (HAND_KEY_INDEX.get(topCode) ?? -1)
    sprites.forEach((sp, i) => { sp.visible = i === index })
    setParam(profile.params.leftHandDown, index >= 0 ? 1 : 0)
  }

  return {
    get ready() { return ready },

    /**
     * 为某只模型加载手图（异步）
     * @param {object} targetModel Live2DModel
     */
    async init(targetModel) {
      const my = ++token
      const myModel = targetModel
      sprites = []
      stack = []
      ready = false
      model = myModel

      const mw = myModel.internalModel.width
      const mh = myModel.internalModel.height
      const loaded = []
      try {
        for (let i = 0; i < profile.hand.count; i++) {
          const texture = await Assets.load(`${profile.hand.dir}/${i}.png`)
          // 加载期间换了模型：这批结果作废（规则②）
          if (my !== token || model !== myModel) return
          const sp = new Sprite(texture)
          sp.width = mw          // 与模型画布同坐标系，天然对齐（规则③）
          sp.height = mh
          sp.visible = false
          myModel.addChild(sp)
          loaded.push(sp)
        }
        if (my !== token || model !== myModel) {
          loaded.forEach((sp) => sp.destroy())
          return
        }
        sprites = loaded
        ready = true
        apply()
      } catch (e) {
        // 加载失败保持 ready=false：Live2D 手照旧可见，桌宠不会「没手」
        console.warn('[pet] 叠加手加载失败：', e)
        ready = false
      }
    },

    /** 按下手区键 → 入栈（同一键长按重复触发时只入一次）*/
    press(code) {
      if (!HAND_KEY_INDEX.has(code)) return false
      if (!stack.includes(code)) stack.push(code)
      apply()
      return true
    },

    /** 松开手区键 → 出栈 */
    release(code) {
      const i = stack.indexOf(code)
      if (i < 0) return
      stack.splice(i, 1)
      apply()
    },

    /** 失焦 / 切路由：清空按下状态，否则手会卡在按下 */
    reset() {
      stack = []
      apply()
    },

    destroy() {
      token++            // 让在途的加载结果全部作废
      sprites.forEach((sp) => sp.destroy())
      sprites = []
      stack = []
      ready = false
      model = null
    },
  }
}
