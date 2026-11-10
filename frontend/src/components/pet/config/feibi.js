/**
 * 菲比-带表情版 · 模型档案（modelProfile） —— 桌宠模块的配置层
 * =========================================================================
 * 这是「换一个桌宠皮肤要改的唯一一个文件」：模型路径、参数名、动作组名、
 * 手图布局、语音、视图尺寸全部收在这里，其它层只认字段名，不写死任何菲比特有值。
 *
 * 字段来源：原 BongoCat-Web/js/main.js（535 行单文件版）里散落各处的硬编码，
 *   这里按「参数 / 动作 / 手图 / 语音 / 视图」五类归拢。
 *
 * ⚠ capabilities 这套开关**不要删**：现在只有菲比一个模型，四个开关全是 true，
 *   看起来像废话；但它是「以后接第二个模型」的唯一入口 —— 删了就得回到
 *   `if (当前是菲比)` 那种散落判断（原版就有 classic 猫与菲比两套分支，共 40 余行 if）。
 */

// vue-cli 注入的资源前缀（默认 '/'）。部署到子路径时它会自动带上，
// ⚠ 不要自己写死 '/'：model3.json 内部引用贴图用的是相对路径，只有入口路径要前缀。
const BASE = process.env.BASE_URL

export const FEIBI = {
  key: 'feibi',
  name: '菲比 · 带表情版',

  // ── 入口：Live2D 模型定义（moc3 + 贴图 + 物理，内部路径都是相对的）──
  modelPath: `${BASE}models/feibi/cat.model3.json`,

  // ── 能力开关 ──
  //   handOverlay：手按下是「部件切换」——Live2D 手淡出，让位给 PNG 叠加手（菲比特有）
  //   mouse       ：跟随鼠标（爪 + 头 + 眼球）
  //   expressions ：Alt + 数字键切换表情
  //   motions     ：Alt + 字母/符号键触发动作（含语音）
  capabilities: {
    handOverlay: true,
    mouse: true,
    expressions: true,
    motions: true,
  },

  // ── 参数名 ──
  //   ⚠ 一律用字符串 id 写参数，不用参数下标：模型换版本时下标会错位
  params: {
    // 叠加手显隐（=1 时 Live2D 自带的手会淡出，由 PNG 手接管）
    leftHandDown: 'CatParamLeftHandDown',
    // 鼠标左右键按下
    mouseLeftDown: 'ParamMouseLeftDown',
    mouseRightDown: 'ParamMouseRightDown',
    // 口型（语音频谱驱动）
    mouthOpen: 'ParamMouthOpenY',
    // 鼠标跟随参数：取值范围用 coreModel.getParameterMinimumValue/MaximumValue 现取，
    // ⚠ 不要写死 ±30 —— 不同模型量程不同
    follow: [
      'ParamMouseX', 'ParamMouseY',
      'ParamAngleX', 'ParamAngleY', 'ParamAngleZ',
      'ParamEyeBallX', 'ParamEyeBallY',
    ],
    // 表情 → 参数名（切换型：置 1 生效，其它置 0 复位）
    //   这里直写参数而不是走 fork 的 ExpressionManager —— 后者在 1.4.0 有每帧失效问题，
    //   而参数直写能随 save/load 快照持久化，行为与 PC 版一致
    expressions: {
      '昏迷': 'Param11',
      '生气': 'Param6',
      '哭泣': 'Param8',
      '痴呆': 'Param14',
    },
  },

  // ── 动作 ──
  //   group     ：cat.model3.json 里的动作组名
  //   priority  ：3 = FORCE，确保覆盖当前状态（与 SDK 的 MotionPriority 对齐）
  motion: { group: 'CAT_motion_lock', priority: 3 },

  // ── 叠加手（PNG）──
  //   dir   ：手图目录；文件名是 0.png … 24.png，顺序与原版 config.json 的 standard.hand 一致
  //   count ：25 张（22 个键位 + Shift/Ctrl/Alt 各一张，不分左右）
  hand: { dir: `${BASE}models/feibi/hand`, count: 25 },

  // ── 语音 ──
  //   ALT_MOTIONS 里用 sound: 'jiubi' 引用这个 key（键位表不写资源路径）
  sounds: { jiubi: `${BASE}sounds/feibi-jiubi.flac` },

  // ── 视图 ──
  //   只放「模型怎么塞进画布」这一件事：模型自带 1400×1400 的大画布，
  //   缩放后留 6% 边距。**画布大小不在这里** —— 那是用户偏好（大/中/小），
  //   住在 config/pet.config.js 的 PET_SIZES 里，别在两处各写一份尺寸。
  //   ⚠ 也不放 resize 逻辑：尺寸由用户显式改（core/stage.js 的 resize），
  //     没有「Pixi 按 window resize 与页面时序不同步」那个坑
  //     （原版用的是 resizeTo: window + 全屏画布）。
  view: { fitScale: 0.94 },
}
