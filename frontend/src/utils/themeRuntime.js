/**
 * 主题运行时 — utils 层
 * =========================================================================
 * 职责：把「当前模式 + 当前色相」落到 DOM 上。两件事：
 *   ① document.documentElement 挂 `data-theme="light|dark"`
 *      → 中性色（卡片底/文字/描边…）由 themes.styl 里 :root[data-theme='dark'] 接管
 *   ② 把 5 个**强调色**变量用 setProperty 写成行内样式
 *      → 色相由调色盘给，所以只能运行时算，没法写死在 CSS 里
 *
 * ## 为什么强调色是 JS 算而不是 CSS 变量再派生
 *   CSS 没有「只改色相、明度饱和度不变」的能力（hsl() 里各部分不能单独继承），
 *   要么把 5 个变量全展开写、要么在 JS 里算。这里选后者：
 *   一个基准色相 → 5 个变量，调色盘只需存/传一个数字。
 *
 * ## 分工（别把两边写重）
 *   中性色 → CSS（themes.styl 的 :root / :root[data-theme='dark']）
 *   强调色 → JS（本文件）
 *   所以 themes.styl 的 dark 块里**故意不写**那 5 个强调色变量。
 *
 * ## 锚点：基准色相 210（蓝）
 *   但下面那套 s / l **刻意不再等于 #68AEF4**：
 *   原来 s 取 86（文字色）/ 100（按钮底），任何色相都算出纯色，
 *   拖到绿 / 黄 / 红就变成一整片荧光色，很刺眼。
 *   现在统一压到中低饱和（理由见 LIGHT_ACCENTS 上方的说明）。
 *   ⚠ 所以 hue=210 的默认观感与 themes.styl 里那组「首帧兜底值」不再逐通道相同，
 *     这是有意为之 —— themes.styl 的注释里写明了运行时真值以本文件为准。
 */

/** 默认色相（蓝） */
export const DEFAULT_HUE = 210

/** 色带步长：0 / 5 / 10 … 355，共 72 档（需求：0~360 每 5 一格） */
export const HUE_STEP = 5

/** 色带可选色相列表 */
export const HUE_STOPS = (() => {
  const list = []
  for (let h = 0; h < 360; h += HUE_STEP) list.push(h)
  return list
})()

/** 把色相吸附到最近的档位（避免存进一个色带上不存在的值） */
export function snapHue(hue) {
  const n = Number(hue)
  if (!Number.isFinite(n)) return DEFAULT_HUE
  const wrapped = ((n % 360) + 360) % 360
  return Math.round(wrapped / HUE_STEP) * HUE_STEP % 360
}

/**
 * 强调色派生表
 *
 * dh = 相对基准色相的偏移（度）
 * s  = 饱和度 %，l = 明度 %
 *
 * ## 为什么 s 只有 50~58（而不是贴着纯色的 86 / 100）
 *   原来的 s 是 86（文字色）/ 100（按钮底），等于每个色相都取纯色：
 *   基准蓝还好看，一旦拖到绿 / 黄 / 红就是一整片荧光色，刺眼。
 *   现在整体压到中低饱和 —— 对齐 fuwari 那套柔彩
 *   (#DEF4ED / #E5F3E4 / #FAECDD / #F4EAFB，都是 s 43~74、l 91~95)。
 *   观感从「警示色」变成「柔彩」，代价是默认蓝比 #68AEF4 略柔一档。
 *
 *   ⚠ 这两个数是「所有色相的共同性格」，调它们等于调整个站点的气质；
 *     不要为了让某一个色相好看去单独改某一行的 s / l。
 *
 * ## 深色模式必须另有一套 s / l
 *   --theme-bgc-lightBtn / deepBtn 在浅色下是「接近白」的 93% / 88%，
 *   搬到深底上就是两团刺眼的亮色；深色下它们要变成
 *   「比卡片略亮一点的暗色块」—— 语义不变（仍是「浅底 / 深底按钮」），
 *   只是明度整体压下来。
 */
const LIGHT_ACCENTS = [
  { name: '--theme-font-fst', dh: 0, s: 58, l: 64 },
  { name: '--theme-font-sec', dh: 0, s: 58, l: 58 },
  { name: '--theme-bgc-lightBtn', dh: 1, s: 50, l: 93 },
  { name: '--theme-bgc-deepBtn', dh: 2, s: 56, l: 88 },
  { name: '--theme-bgc-btmBtn', dh: 21, s: 56, l: 72 },
  // 裸链 / 卡片上那些 <a>（文章列表的「评论」、信息行里的板块名）的颜色。
  // ⚠ 它以前是 themes.styl 里写死的 #16418a / #7FB2F0（永远是蓝的），
  //   所以「换了主题色，那几个字还是蓝的」—— 现在跟着色相一起派生：
  //   浅底上比正文色再压暗一档，深底上提亮一档。
  { name: '--theme-font-link', dh: 0, s: 55, l: 34 },
]

const DARK_ACCENTS = [
  // 主强调色：深底上要够亮才当得了「文字 / 图标色」
  { name: '--theme-font-fst', dh: 0, s: 50, l: 68 },
  // 次强调色：常被当作「深底按钮上的字形色」，所以比 fst 更亮
  { name: '--theme-font-sec', dh: 0, s: 44, l: 78 },
  // 浅色按钮底 → 深色下是「比卡片略亮一点」的暗色块（hover 底 / 「更多」行底）
  { name: '--theme-bgc-lightBtn', dh: 0, s: 26, l: 21 },
  // 深色按钮底 → 略强一点的暗色块（选中态 / 标签药丸底）
  { name: '--theme-bgc-deepBtn', dh: 0, s: 30, l: 29 },
  // 备用强调色（原项目的 btmBtn，目前未被使用，一起算出来保持一致）
  { name: '--theme-bgc-btmBtn', dh: 21, s: 38, l: 42 },
  // 裸链：深底上要提亮（对应浅色那侧的「压暗」）
  { name: '--theme-font-link', dh: 0, s: 42, l: 74 },
]

/**
 * 「浅色面」—— 页面底 / 只读输入框底 / 小控件底 / 链接卡底
 *
 * 这 4 个 token 以前在 themes.styl 里被写死成一组成对的冷调浅蓝
 * （#EAEFF5 / #F4F8FC / #EDF2F7 / #F7F7F7），跟主题色毫无关系。
 * 于是换色相时，页面底、只读态输入框、个人中心那两张表、写博客的板块选单
 * 全都还是淡蓝的 —— 而这几个是页面上**面积最大**的一层，不跟着走就很割裂。
 *
 * 现在按「最淡那一档的主题色变种」派生：色相取过来，饱和度和明度压到
 * 只够看出「这是主题色的那种浅」。
 *   - 页面底最淡（卡片要能在它上面浮起来）
 *   - 只读输入框 / 小控件底比页面底再实一点点（仍与页面底分得开）
 *
 * ⚠ 卡片底 --theme-bgc-card **不在**这里：它是纯中性（浅色下白 / 深色下近黑）、
 *   不带色相，所以留在 themes.styl 的 CSS 里。
 * ⚠ 深色下这 4 个只做很轻的色相偏移：深底大面积上色会发脏，
 *   保持近中性、但不再偏那一个固定的蓝。
 */
const LIGHT_SURFACES = [
  { name: '--theme-bgc-main', dh: 0, s: 46, l: 94 },
  { name: '--theme-bgc-input', dh: 1, s: 55, l: 96 },
  { name: '--theme-bgc-chip', dh: 1, s: 48, l: 93 },
  { name: '--theme-bgc-linkCard', dh: 0, s: 32, l: 96 },
]

const DARK_SURFACES = [
  { name: '--theme-bgc-main', dh: 0, s: 22, l: 10 },
  { name: '--theme-bgc-input', dh: 1, s: 18, l: 16 },
  { name: '--theme-bgc-chip', dh: 1, s: 18, l: 18 },
  { name: '--theme-bgc-linkCard', dh: 0, s: 17, l: 17 },
]

/**
 * 由基准色相算出 4 个「浅色面」
 * @param {number} hue — 0~355
 * @param {boolean} isDark — 是否深色模式
 * @returns {Record<string, string>} CSS 变量名 → #RRGGBB
 */
export function surfacePalette(hue, isDark = false) {
  const table = isDark ? DARK_SURFACES : LIGHT_SURFACES
  const h = snapHue(hue)
  const out = {}
  table.forEach(({ name, dh, s, l }) => {
    out[name] = hslToHex(h + dh, s, l)
  })
  return out
}

/** HSL → RGB（各通道 0~255 整数；h 可超出 0~360，内部取模；s / l 传百分数） */
export function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360
  const sat = Math.min(100, Math.max(0, s)) / 100
  const lig = Math.min(100, Math.max(0, l)) / 100

  const c = (1 - Math.abs(2 * lig - 1)) * sat
  const hp = hue / 60
  const x = c * (1 - Math.abs((hp % 2) - 1))
  let rgb
  if (hp < 1) rgb = [c, x, 0]
  else if (hp < 2) rgb = [x, c, 0]
  else if (hp < 3) rgb = [0, c, x]
  else if (hp < 4) rgb = [0, x, c]
  else if (hp < 5) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  const m = lig - c / 2
  return rgb.map((v) => Math.max(0, Math.min(255, Math.round((v + m) * 255))))
}

/** HSL → #RRGGBB（h 可超出 0~360，内部取模；s / l 传百分数） */
export function hslToHex(h, s, l) {
  return '#' + hslToRgb(h, s, l).map((n) => n.toString(16).padStart(2, '0')).join('')
}

/**
 * 半透明强调色（柔光 / 光圈 / 聚焦描边）
 *
 * 为什么单独拎出来：这些值带 alpha，没法用十六进制表示，
 * 而 CSS 里 `rgba()` 又不能直接吃一个 var() 颜色再去调透明度
 * （`rgba(var(--x), .3)` 不是合法写法）。
 * 于是用 JS 算出整串 rgba() 再写进变量 —— CSS 侧只要 `var(--theme-accent-glow)`。
 *
 * 它们以前在 5 个样式文件里被写死成 rgba(104, 174, 244, ·)（= 默认蓝），
 * 所以换了主题色之后，按钮柔光、输入框聚焦光圈、标题下沿的渐隐线
 * 全都还是蓝的 —— 现在跟着色相走。
 */
const GLOW_ALPHAS = [
  // 聚焦描边 / 渐隐线的起点：最实的一档
  { name: '--theme-accent-hi', alpha: 0.42 },
  // 渐隐线中段
  { name: '--theme-accent-mid', alpha: 0.1 },
  // 渐隐线的终点。
  // ⚠ 渐变的收尾不要写 CSS 的 `transparent`：它是 rgba(0,0,0,0)，
  //   虽然现代浏览器按预乘 alpha 插值不会发灰，但用「同色但 alpha=0」
  //   表达「这个颜色淡到没有」更准确，也不会在某天被改坏
  { name: '--theme-accent-none', alpha: 0 },
  // 实心按钮 / 自己那侧气泡的柔光
  { name: '--theme-accent-glow', alpha: 0.32 },
  // 输入框聚焦时的外光圈
  { name: '--theme-accent-ring', alpha: 0.16 },
]

/**
 * 由基准色相算出 4 个半透明强调色
 * @param {number} hue — 0~355
 * @param {boolean} isDark — 是否深色模式
 * @returns {Record<string, string>} CSS 变量名 → rgba() 字符串
 */
export function accentSoftPalette(hue, isDark = false) {
  const table = isDark ? DARK_ACCENTS : LIGHT_ACCENTS
  // 取「主强调色」那一行的 s / l 作为柔光的色基 —— 柔光本来就该跟主色同色
  const base = table[0]
  const [r, g, b] = hslToRgb(snapHue(hue) + base.dh, base.s, base.l)
  const out = {}
  GLOW_ALPHAS.forEach(({ name, alpha }) => {
    out[name] = `rgba(${r}, ${g}, ${b}, ${alpha})`
  })
  return out
}

/**
 * 由基准色相算出 5 个强调色变量
 * @param {number} hue — 0~355
 * @param {boolean} isDark — 是否深色模式
 * @returns {Record<string, string>} CSS 变量名 → 色值
 */
export function accentPalette(hue, isDark = false) {
  const base = snapHue(hue)
  const table = isDark ? DARK_ACCENTS : LIGHT_ACCENTS
  const out = {}
  table.forEach(({ name, dh, s, l }) => {
    out[name] = hslToHex(base + dh, s, l)
  })
  return out
}

/**
 * 把主题落到 DOM
 *
 * ⚠ 用 setProperty 写在 documentElement 的**行内样式**上：
 *   行内样式优先级高于样式表，所以切模式时不需要清掉旧值 ——
 *   每次都是「整套覆盖」，不会残留上一次的色相。
 * @param {{mode?: string, hue?: number}} theme
 */
export function applyThemeVars({ mode = 'light', hue = DEFAULT_HUE } = {}) {
  if (typeof document === 'undefined') return
  const root = document.documentElement

  root.dataset.theme = mode === 'dark' ? 'dark' : 'light'

  const isDark = mode === 'dark'
  const palette = {
    ...accentPalette(hue, isDark),
    ...accentSoftPalette(hue, isDark),
    ...surfacePalette(hue, isDark),
  }
  Object.entries(palette).forEach(([name, value]) => {
    root.style.setProperty(name, value)
  })
}

/** 当前生效的主题（给调试/兜底用） */
export function currentTheme() {
  if (typeof document === 'undefined') return { mode: 'light', hue: DEFAULT_HUE }
  return {
    mode: document.documentElement.dataset.theme || 'light',
    hue: DEFAULT_HUE,
  }
}
