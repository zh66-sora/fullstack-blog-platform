/**
 * 舞台 —— 桌宠模块的 core 层（PixiJS 应用 + Live2D 模型生命周期 + 单条帧循环）
 * =========================================================================
 * 职责边界：只负责「怎么把模型画出来」，不认识键盘鼠标，也不认识 Vue。
 *
 * 与原 BongoCat-Web/js/main.js 的差异（迁移时必要的重构，不是随手改）：
 *   ① 原版是模块顶层 `await app.init(...)` + 一堆模块级变量 —— 那是「一个页面只有一只桌宠」
 *      的写法。这里收成工厂函数：拿不到全局状态，也就不会有「组件销毁了监听器还在跑」。
 *   ② 原版 `resizeTo: window` + 全屏画布；桌面宠是页面左下角的一个小方块，
 *      用固定尺寸（profile.view.size）反而绕开了「Pixi 把 resize 排到 RAF、
 *      与页面 resize 时序不同步」那个坑。
 *   ③ 原版三条 `app.ticker.add()`（口型 / 鼠标阻尼 / FPS）各自注册。这里只有一个帧循环，
 *      业务按 addFrame 注册进去：销毁/暂停是**一处生效**，顺序也确定。
 *   ④ 模型 autoUpdate 挂在 app.ticker 上（原版挂 Ticker.shared）：共享时钟是全局的，
 *      这里一停 ticker 就整只桌宠停住，不会出现「画布停了、物理还在跑」。
 */

import { Application } from 'pixi.js'
// ⚠ 必须走 cubism4 专用构建、且写完整文件路径：
//    · 全量 index 构建在 import 时就会强制要求 Cubism 2 运行时（live2d.min.js），直接报错；
//    · 这个包没有 `module` 字段，webpack 4 也不认 package.json 的 `exports`
//      （那是 webpack 5 的能力），所以不能写 '@jannchie/pixi-live2d-display/cubism4'。
import { Live2DModel, cubism4Ready } from '@jannchie/pixi-live2d-display/dist/cubism4.es.js'

/**
 * @param {object}   options
 * @param {HTMLCanvasElement} options.canvas
 * @param {number}   options.size      画布边长（CSS 像素）
 * @param {number}   options.fitScale  适配后额外收缩的比例（留点边）
 * @param {Function} options.onStatus  状态回调：{ status: 'loading'|'ready'|'error', error? }
 */
export function createStage({ canvas, size, fitScale = 1, onStatus = () => {} }) {
  let app = null
  let model = null
  let destroyed = false
  const frames = new Set()

  /** 只有一个帧循环：把 dt(ms) 派发给注册进来的业务 */
  function onTick() {
    if (!app) return
    const dt = app.ticker.deltaMS || 1000 / 60
    frames.forEach((fn) => fn(dt))
  }

  /**
   * 适配尺寸 —— 按 internalModel 的绘制区域算 scale
   * ⚠ 不要用 model.width/height：那是缩放后的显示尺寸，拿来算会越算越小。
   * ⚠ 不要用 model.anchor.set()：fork 1.4.0 的 ObservablePoint 回调签名与 pixi 8 不匹配，
   *   居中只能手动算 position。
   */
  function fit() {
    if (!app || !model) return
    const mw = model.internalModel.width || 1
    const mh = model.internalModel.height || 1
    const scale = Math.min(app.screen.width / mw, app.screen.height / mh) * fitScale
    model.scale.set(scale)
    model.position.set((app.screen.width - mw * scale) / 2, (app.screen.height - mh * scale) / 2)
  }

  return {
    get app() { return app },
    get model() { return model },

    /** 初始化 Pixi（v8 的 init 是异步的）*/
    async init() {
      app = new Application()
      await app.init({
        canvas,
        width: size,
        height: size,
        // ── 透明底：桌宠要「贴」在页面上，不能是一块方布 ──
        // ⚠ 这三项要一起给，缺一个都可能出现「白色 / 不透明方块把页面内容挡住」：
        //   ① backgroundAlpha: 0 —— 清屏 alpha
        //   ② background 显式给色值 —— 不依赖默认值
        //   ③ preference: 'webgl' —— pixi 8 在支持 WebGPU 的浏览器上会自动挑 WebGPU，
        //      而 WebGPU 的 canvas 默认是**不透明合成**（alphaMode: 'opaque'），
        //      透明底会失效。本项目的整套栈（fork 1.4.0 + Core v5）本来就是按 WebGL 验证的。
        background: 0x000000,
        backgroundAlpha: 0,
        preference: 'webgl',
        antialias: true,
        autoDensity: true,
        // 高 DPI 屏上别无脑按 devicePixelRatio 放大，封顶 2（显存/性能）
        resolution: Math.min(window.devicePixelRatio || 1, 2),
      })
      if (destroyed) return null
      app.ticker.add(onTick)
      return app
    },

    /** 加载 / 切换模型（同一时刻只留一个）*/
    async load(path) {
      onStatus({ status: 'loading' })
      try {
        // 等 Cubism Core 的 WASM 就绪，避免「模型先到、Core 后到」的竞态
        await cubism4Ready()
        if (destroyed) return null

        if (model) {
          app.stage.removeChild(model)
          model.destroy()
          model = null
        }
        const next = await Live2DModel.from(path, {
          autoInteract: false,   // 鼠标交互由我们自己的参数驱动，不要 fork 内置的那套
          autoUpdate: true,      // 每帧更新：物理、眨眼、呼吸
          ticker: app.ticker,
        })
        // 加载期间组件被销毁：直接丢弃，别往已销毁的 stage 上挂
        if (destroyed) {
          next.destroy()
          return null
        }
        model = next
        app.stage.addChild(model)
        fit()
        onStatus({ status: 'ready' })
        return model
      } catch (error) {
        onStatus({ status: 'error', error })
        return null
      }
    },

    /**
     * 改画布尺寸（配置页切「大 / 中 / 小」时）
     * ⚠ 必须「renderer.resize + fit」一起做：
     *   只改 CSS 尺寸会把画面拉伸变形，只 fit 不 resize 则模型按旧画布算缩放。
     */
    resize(size) {
      if (!app) return
      app.renderer.resize(size, size)
      fit()
    },

    /** 注册每帧业务（鼠标阻尼、口型……）*/
    addFrame(fn) { frames.add(fn) },
    removeFrame(fn) { frames.delete(fn) },

    /**
     * 暂停 / 恢复渲染
     * 窄屏（侧栏消失）时调用 —— 画布已经被 CSS 藏起来，但没必要继续占 GPU/CPU。
     * 停的是 app.ticker：帧循环与模型 autoUpdate 都挂在它上面，一处停全停。
     */
    setPaused(paused) {
      if (!app) return
      if (paused) app.ticker.stop()
      else app.ticker.start()
    },

    /** ⚠ 必须由组件在 beforeDestroy 里调用：Pixi 的 GL 上下文不会自己回收 */
    destroy() {
      destroyed = true
      frames.clear()
      if (app) {
        app.ticker.remove(onTick)
        if (model) {
          app.stage.removeChild(model)
          model.destroy()
          model = null
        }
        app.destroy(true)
        app = null
      }
    },
  }
}
