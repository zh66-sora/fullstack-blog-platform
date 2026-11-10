/**
 * 锁定页面缩放倍率 — utils 层
 *
 * 背景：全站尺寸靠 `body { zoom: 1.25 }`（assets/css/global.styl）写死放大。
 * 倍率既然是固定的，用户在页面上再滚一下滚轮就会把浏览器自己的缩放叠加上去
 * （1.25 × 1.25 = 156%），布局会被撑坏。所以这里把「用滚轮改倍率」这条路堵掉。
 *
 * 拦掉的是：
 *   Ctrl / ⌘ + 滚轮   —— 桌面浏览器最常见的缩放手势
 *   触摸板双指捏合     —— Chrome 把它合成为 wheel + ctrlKey 一起冒泡上来，
 *                        所以上面那条监听顺带就拦住了
 *   Safari 的 gesture 事件 —— 老 Safari 捏合不走 wheel，另有一套 gesture* 事件
 *
 * ⚠ 两个代价，写在这里免得日后被当成 bug：
 *   ① 监听器必须 passive: false 才能 preventDefault，而 passive: false 的 wheel
 *      监听会让浏览器「滚动前先等这个回调跑完」。所以回调里除了那个 if 什么都别做。
 *   ② 浏览器菜单里的「缩放」项、以及 Ctrl + / Ctrl - 快捷键都拦不住（它们发生在
 *      页面之外，页面拿不到）。需求里说的「滚轮」就是上面这两类手势。
 */
export default function lockZoom() {
  window.addEventListener(
    'wheel',
    (e) => {
      // 只关心「带修饰键的滚轮」= 缩放；普通滚轮立刻返回，不干扰页面滚动
      if (!e.ctrlKey) return
      e.preventDefault()
    },
    { passive: false }
  )

  // Safari：捏合手势不走 wheel
  ;['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
    document.addEventListener(type, (e) => e.preventDefault(), { passive: false })
  })
}
