/**
 * 主题图片映射 —— config 层
 *
 * 命名约定（资源在 src/assets/images/ 下）：
 *   bgi-light.jpg         bgi-dark.jpg          → 全屏背景图（横幅的兜底图，见下）
 *   bgi-slider-light.jpg  bgi-slider-dark.jpg   → 登录 / 注册模态框左侧滑块图
 *
 * 白天模式（light）取带 light 的一套，夜间模式（dark）取带 dark 的一套。
 * 映射只在这里声明一次：Head 的切换按钮负责改 store 里的 mode，
 * AuthModal 用 computed 从 mode 取滑块图，两处不重复写文件名。
 *
 * ⚠ 横幅（banner）现在**不再随昼夜模式切换**：
 *   它由「用户资料上的 banner」决定，没设置才回落到下面这张固定的 DEFAULT_BANNER。
 *   也就是点昼夜切换按钮只换登录框的滑块图，不再换大背景图。
 */

// 可切换的主题模式
export const THEME_MODES = ['light', 'dark']

// 兜底模式：store 里的值非法（或首次进入、本地没存过）时用它
export const DEFAULT_MODE = 'light'

// 每种模式对应的图片，键名即用途
const THEME_IMAGES = {
  light: {
    banner: require('@/assets/images/bgi-light.jpg'),
    slider: require('@/assets/images/bgi-slider-light.jpg'),
  },
  dark: {
    banner: require('@/assets/images/bgi-dark.jpg'),
    slider: require('@/assets/images/bgi-slider-dark.jpg'),
  },
}

/**
 * 横幅兜底图 —— 不跟昼夜模式走
 *
 * 取的是默认模式那张，而不是「当前模式」那张：
 *   登录用户设过背景图 → 用他的（各比例都行，容器锁了 16:9 + cover）
 *   没设置             → 回落到这张固定图
 * 口径与原项目 refreshAuthorCard 一致（`userData.banner || 默认图`）。
 * dark.banner 仍留在表里：将来真要做深色模式（todo/todo.md）时横幅也要跟着换，
 * 到时候把 Home.vue 的 bannerSrc 换回 getThemeImage(mode, 'banner') 即可。
 */
export const DEFAULT_BANNER = THEME_IMAGES[DEFAULT_MODE].banner

/**
 * 取某模式下的某张主题图
 * @param {'light'|'dark'} mode 当前模式
 * @param {'banner'|'slider'} name 用途
 * @returns {string} 图片 URL（webpack 处理后的）
 */
export function getThemeImage(mode, name) {
  const set = THEME_IMAGES[mode] || THEME_IMAGES[DEFAULT_MODE]
  return set[name]
}

export default THEME_IMAGES
