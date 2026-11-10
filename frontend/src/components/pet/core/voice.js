/**
 * 语音 + 口型同步 —— 桌宠模块的 core 层
 * =========================================================================
 * 播 flac 的同时用 Web Audio 的频谱驱动 `ParamMouthOpenY`，让菲比「跟着唱」。
 *
 * 为什么独立成模块：AudioContext 是**浏览器级单例**（一个页面能创建的实例数有限），
 * 它跟 Pixi 的渲染生命周期毫无关系 —— 混在舞台里，组件卸载时就容易漏关，
 * 反复进出页面会攒下一堆 context 直到浏览器报错。
 *
 * ⚠ 自动播放策略：AudioContext 在用户手势之前是 suspended，`play()` 会被拒。
 *   这里只在「按键触发语音」这条路上调用（本身就是用户手势），所以直接 resume 即可。
 */

/**
 * @param {object}   options
 * @param {object}   options.profile  模型档案（params.mouthOpen）
 * @param {Function} options.setParam 参数写入口
 */
export function createVoice({ profile, setParam }) {
  let ctx = null
  let analyser = null
  let el = null
  let active = false      // 正在发声（口型要不要跟）
  let mouth = 0           // 平滑后的开口量
  let freq = null

  /** 懒建：没按过语音键就不该有 AudioContext（省一个音频设备占用）*/
  function ensure() {
    if (ctx) return
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return
    ctx = new AudioCtx()
    analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    freq = new Uint8Array(analyser.frequencyBinCount)
  }

  return {
    /** 播一段语音（url 来自 profile.sounds）并让口型跟着动 */
    async play(url) {
      if (!url) return
      try {
        ensure()
        if (!ctx) return
        if (ctx.state === 'suspended') await ctx.resume()
        if (!el) {
          el = new Audio(url)
          const src = ctx.createMediaElementSource(el)
          src.connect(analyser)
          analyser.connect(ctx.destination)
          el.onended = () => { active = false }
        }
        el.currentTime = 0
        await el.play()
        active = true
      } catch (e) {
        console.warn('[pet] 语音播放失败：', e)
      }
    },

    /** 每帧：读频谱 → 写口型参数（快开慢合，跟人说话的感觉）*/
    step() {
      if (!active || !analyser || !freq) return
      analyser.getByteFrequencyData(freq)
      let sum = 0
      for (let i = 0; i < freq.length; i++) sum += freq[i]
      const vol = sum / freq.length / 255
      mouth = Math.max(vol * 2.4, mouth * 0.82)
      setParam(profile.params.mouthOpen, Math.min(1, mouth))
    },

    /** 复位口型（失焦/暂停时）*/
    reset() {
      active = false
      mouth = 0
      setParam(profile.params.mouthOpen, 0)
    },

    destroy() {
      active = false
      mouth = 0
      if (el) {
        try { el.pause() } catch (e) { /* 忽略 */ }
        el = null
      }
      if (ctx) {
        try { ctx.close() } catch (e) { /* 忽略 */ }
        ctx = null
      }
      analyser = null
      freq = null
    },
  }
}
