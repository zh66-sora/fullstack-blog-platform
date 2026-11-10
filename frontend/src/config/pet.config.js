/**
 * 「私有定制 → 菲比桌宠」表单配置 —— config 层
 * =========================================================================
 * 这张表驱动三件事，页面里不写任何写死的分组/文案：
 *   ① 控件的取值域（大小、表情）
 *   ② 「定制化形象」的分组（两组触发按钮）
 *   ③ 「动作选单」的候选与上限（选中后生成桌宠右侧的 1/2/3 悬浮按钮）
 *
 * 与 profile.config.js 同一套思路：改选项 = 改这张表，组件不用动。
 *
 * ⚠ 所有 code 都是 **KeyboardEvent.code**，且必须存在于
 *   components/pet/config/keymap.js 的 ALT_MOTIONS 里（那里才是「键位 → 动作下标」的
 *   唯一真相）；这里只是「把其中一部分挑出来当控件用」，文案也从那边取（labelOf）。
 */

import { ALT_MOTIONS } from '@/components/pet/config/keymap'
import { FEIBI } from '@/components/pet/config/feibi'

/* ── 3.1 大小 ──────────────────────────────────────────────────────────────
 * 值 → 画布边长（CSS px）。模型自带 1400×1400 的大画布，缩放由 core/stage 的 fit 算，
 * 所以这里改的只是「桌宠在页面上占多大」。 */
export const PET_SIZES = {
  large: { label: '大', size: 320 },
  medium: { label: '中', size: 260 },
  small: { label: '小', size: 200 },
}
export const DEFAULT_SIZE = 'large'
export const SIZE_OPTIONS = Object.keys(PET_SIZES).map((value) => ({
  value,
  label: PET_SIZES[value].label,
}))

/* ── 3.2 表情 ──────────────────────────────────────────────────────────────
 * 「默认」= 四个表情参数全置 0；其余同理，直接写参数（不走 fork 的 ExpressionManager，
 * 原因见 core/actions.js 顶部）。
 * ⚠ 选项由模型档案的表情表推出来，不要在别处再抄一遍「昏迷/生气/哭泣/痴呆」 */
export const DEFAULT_EXPRESSION = '默认'
export const EXPRESSION_OPTIONS = [DEFAULT_EXPRESSION, ...Object.keys(FEIBI.params.expressions)]

/* ── 3.3 定制化形象 ────────────────────────────────────────────────────────
 * 两类控件，都是「点击即生效」（直接作用在运行中的桌宠身上）：
 *
 *   ① LOOK_MIRROR：墨镜三件套（戴 / 摘 / 消失）—— 三个按钮一组。
 *      它们互相排斥，是同一件「配饰」的三个状态，做成按钮比开关直观。
 *
 *   ② LOOK_TABLE：其余「出现 / 消失」成对的形象，**做成表格**（一行两个），
 *      每行一项：名称 + 一个开关，开关的两端就是「出现 / 消失」。
 *      ⚠ 「消失」= 模型的自然状态，所以默认就是不出现；开关关着时不需要重放任何动作。
 *
 * 整表加起来 3 + 8×2 = 19，加上动作选单的 4 个，正好覆盖 keymap 里的 23 个动作。 */
export const LOOK_MIRROR = {
  key: 'mirror',
  title: '墨镜',
  codes: ['Digit1', 'Digit2', 'Digit3'],
}

export const LOOK_TABLE = [
  { key: 'book', label: '书籍', on: 'Digit4', off: 'Digit5' },
  { key: 'halo', label: '光环', on: 'Digit6', off: 'Digit7' },
  { key: 'fang', label: '虎牙嘴', on: 'Equal', off: 'KeyQ' },
  { key: 'doubt', label: '难道说', on: 'KeyW', off: 'KeyE' },
  { key: 'ask', label: '问号', on: 'KeyR', off: 'KeyT' },
  { key: 'surrender', label: '投降', on: 'KeyU', off: 'KeyI' },
  { key: 'blush', label: '脸红', on: 'KeyP', off: 'BracketLeft' },
  { key: 'dark', label: '脸黑', on: 'BracketRight', off: 'KeyA' },
]

/* ── 3.4 动作选单 ──────────────────────────────────────────────────────────
 * 不属于上面任何一组形象的独立动作：Ciallo~ / 菲比啾比♪ / 捏脸 / 冲击波。
 * 选中的按加入顺序在桌宠右侧生成 1/2/3 悬浮按钮；**一次最多 3 个**、不可重复
 * —— 现在候选有 4 个，所以「上限」是真的会挡住的（第 4 个的「添加」按钮置灰）。 */
export const QUICK_ACTION_CANDIDATES = ['KeyY', 'KeyD', 'KeyS', 'KeyO']
export const QUICK_ACTION_MAX = 3

/** code → 展示文案（表里查不到就原样返回 code，方便发现漏配）*/
export function labelOf (code) {
  return (ALT_MOTIONS[code] && ALT_MOTIONS[code].label) || code
}
