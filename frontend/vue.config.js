/**
 * Vue CLI 配置 —— 目前只有一条：让 babel 顺手转掉两个 ESM 依赖
 *
 * 背景：菲比桌宠用的是 PixiJS 8 + @jannchie/pixi-live2d-display 1.4.0。
 *   - pixi 8 是 ESM-only（package.json 的 `module` 指向 lib/index.mjs），
 *     webpack 4 认得 `module` 字段，解析没问题；
 *   - 但这两个包的产物里用了**可选链 `?.`**（ES2020，pixi.js/lib 实测 400 个文件里 44 个含），
 *     而 webpack 4 内置的 acorn 6 解析不了 —— 不转译就是 "Module parse failed"。
 *
 * vue-cli 默认只对 src/ 走 babel（node_modules 被 exclude），
 * 所以这里把它们列进 transpileDependencies，让 babel 用同一套 preset-env 转译。
 * 代价：首次编译/打包会慢一些（pixi 有 400+ 个 mjs 分片）。
 *
 * ⚠ 不要顺手加别的配置项 —— 本项目其余构建行为全部依赖 vue-cli 默认值。
 *
 * ⚠⚠ 改完这个文件**必须重启 dev server**（vue ui 里 stop → start，或重开 npm run serve）。
 *   webpack 配置只在启动时读一次，HMR 只重建模块、不重建配置 ——
 *   在一个「配置文件还不存在时」就已经跑着的服务里改文件，会一直报
 *   `Module parse failed: Unexpected token ... this._bindGroups[i]?.destroy()`
 *   （pixi 的 .mjs 没走 babel，被 webpack 4 的 acorn 解析到可选链就炸），
 *   很容易误以为配置写错了。
 */
module.exports = {
  transpileDependencies: ['pixi.js', '@jannchie/pixi-live2d-display'],
}
