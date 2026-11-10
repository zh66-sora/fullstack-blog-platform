/**
 * 参数读写底座 —— 桌宠模块的 core 层
 * =========================================================================
 * 全模块**唯一**的「写模型参数」入口：键盘、鼠标、叠加手、口型都只走这里。
 * 独立出来的两个理由：
 *   ① 参数写错 id 只会静默失效（不同模型参数集不同，SDK 不抛错），必须收成一处才好排查；
 *   ② 参数取值范围（min/max）要现取 + 缓存，缓存的生命周期跟着「换模型」走，
 *      散在各处就会出现「换了模型还在用上一个模型的量程」。
 *
 * ⚠ 这里写的是 Live2D coreModel（每帧都会被调用），**不要**把这些值放进 Vue 的
 *   reactive/data —— 每帧触发响应式更新会直接把帧率打下来，语义上也不对。
 */

/**
 * @param {Function} getModel — 返回当前 Live2DModel（可能为 null）
 */
export function createParams(getModel) {
  // 参数 id → { min, max }；换模型时由调用方 clearRanges()
  const rangeCache = new Map()

  function core() {
    const model = getModel()
    return model && model.internalModel ? model.internalModel.coreModel : null
  }

  return {
    /**
     * 写参数（weight 固定 1）
     * 参数不存在时静默忽略 —— 不同模型参数集不同，这是预期行为而不是错误
     */
    set(id, value) {
      if (!id) return
      const c = core()
      if (!c) return
      try {
        c.setParameterValueById(id, value, 1)
      } catch (e) { /* 参数不存在：忽略 */ }
    },

    /**
     * 取参数量程（带缓存）
     * @returns {{min:number,max:number}|null} 参数不存在 / 量程非法时返回 null
     */
    range(id) {
      if (rangeCache.has(id)) return rangeCache.get(id)
      const c = core()
      if (!c) return null
      let range = null
      try {
        const idx = c.getParameterIndex(id)
        if (idx >= 0) {
          const min = c.getParameterMinimumValue(idx)
          const max = c.getParameterMaximumValue(idx)
          if (typeof min === 'number' && typeof max === 'number' && min !== max) {
            range = { min, max }
          }
        }
      } catch (e) { range = null }
      rangeCache.set(id, range)
      return range
    },

    /** 换模型后必须清一次：参数下标与量程都跟着模型走 */
    clearRanges() {
      rangeCache.clear()
    },
  }
}
