/**
 * 鼠标输入 —— 桌宠模块的 input 层（跟随鼠标 + 左右键）
 * =========================================================================
 * 算法照官方 Tauri 版 BongoCat（github.com/ayangweb/BongoCat）的
 * `src/composables/useModel.ts` + `useDevice.ts`，不自己拍脑袋：
 *
 *   ① 光标在视口里的比例 (0~1) → 按**每个参数自身的 min/max** 写入：
 *        X/Y 轴：value = max - ratio * (max - min)
 *        Z  轴：value = (1 - 2x) * (1 - 2y) * min
 *      写到 ParamMouseX/Y（爪随鼠标）、ParamAngleX/Y/Z（朝向）、ParamEyeBallX/Y（眼球）。
 *   ② 光标位置做**指数阻尼**平滑（DAMPING_DECAY = 0.75 @60fps，按 deltaMS 归一化）
 *      —— 这就是「跟随柔和、带轻微晃动」的来源。
 *   ③ 光标静止一会儿后叠加极小幅度的正弦待机摆动（「放那儿也在晃」）。
 *
 * ⚠ MOUSE_MIRROR 必须为 true：菲比这个模型 ParamAngleX 取**正值**时头朝屏幕右侧看，
 *   不镜像就是「鼠标在左、角色往右看」。换模型后方向反了，把它改回 false 即可。
 * ⚠ 参数取值范围一律用 coreModel 现取（params.range），不要写死 ±30。
 */

/** 与官方 useDevice.ts 一致 */
const DAMPING_DECAY = 0.75

/** 待机轻微晃动（单位与 ParamAngle 同系；±30 为满幅，这里只有 1~1.6 度）*/
const IDLE_SWAY = {
  ampZ: 1.6, periodZ: 5200,
  ampX: 1.0, periodX: 3700,
  delayMs: 1200, fadeInMs: 2500,
}

/**
 * @param {object}   options
 * @param {object}   options.profile  模型档案（params.follow / params.mouseLeftDown…）
 * @param {object}   options.params   core/params 实例
 * @param {boolean}  [options.mirror] 是否镜像 X/Z 轴（菲比要）
 */
export function createMouse({ profile, params, mirror = true }) {
  let target = null        // 最近一次光标位置（视口像素）
  let smoothed = null      // 阻尼平滑后的位置
  let idleSince = 0        // 光标最后移动时刻（用来算待机摆动何时淡入）

  function onMove(e) {
    target = { x: e.clientX, y: e.clientY }
    idleSince = performance.now()
  }

  function onDown(e) {
    if (e.button === 0) params.set(profile.params.mouseLeftDown, 1)
    if (e.button === 2) params.set(profile.params.mouseRightDown, 1)
  }

  function onUp(e) {
    if (e.button === 0) params.set(profile.params.mouseLeftDown, 0)
    if (e.button === 2) params.set(profile.params.mouseRightDown, 0)
  }

  /** 把平滑后的光标位置映射到各跟随参数 */
  function apply() {
    if (!smoothed) return
    const w = window.innerWidth || 1
    const h = window.innerHeight || 1
    const xRatio = Math.min(1, Math.max(0, smoothed.x / w))
    const yRatio = Math.min(1, Math.max(0, smoothed.y / h))

    const now = performance.now()
    const swayGain = Math.min(1, Math.max(0, (now - idleSince - IDLE_SWAY.delayMs) / IDLE_SWAY.fadeInMs))
    const swayZ = swayGain * IDLE_SWAY.ampZ * Math.sin((now / IDLE_SWAY.periodZ) * Math.PI * 2)
    const swayX = swayGain * IDLE_SWAY.ampX * Math.sin((now / IDLE_SWAY.periodX) * Math.PI * 2)

    profile.params.follow.forEach((id) => {
      const range = params.range(id)
      if (!range) return
      const isYAxis = id.endsWith('Y')
      const isZAxis = id.endsWith('Z')
      let value
      if (isZAxis) {
        value = (1 - 2 * xRatio) * (1 - 2 * yRatio) * range.min
      } else {
        value = range.max - (isYAxis ? yRatio : xRatio) * (range.max - range.min)
      }
      if (!isYAxis && mirror) value *= -1
      if (id === 'ParamAngleZ') value += swayZ
      else if (id === 'ParamAngleX') value += swayX
      params.set(id, value)
    })
  }

  return {
    attach() {
      if (!profile.capabilities.mouse) return
      window.addEventListener('mousemove', onMove, { passive: true })
      window.addEventListener('mousedown', onDown)
      window.addEventListener('mouseup', onUp)
    },
    detach() {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
    },

    /** 每帧：阻尼平滑 + 写参数（由舞台的帧循环调用）*/
    step(dtMS) {
      if (!profile.capabilities.mouse || !target) return
      const dt = Math.min(100, dtMS || 1000 / 60)
      const alpha = 1 - Math.pow(DAMPING_DECAY, dt / (1000 / 60))
      const cur = smoothed || target
      smoothed = {
        x: cur.x + (target.x - cur.x) * alpha,
        y: cur.y + (target.y - cur.y) * alpha,
      }
      apply()
    },

    /** 失焦/暂停复位：松掉左右键、丢掉平滑位置 */
    reset() {
      params.set(profile.params.mouseLeftDown, 0)
      params.set(profile.params.mouseRightDown, 0)
      smoothed = null
    },
  }
}
