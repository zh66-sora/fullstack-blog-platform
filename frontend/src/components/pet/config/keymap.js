/**
 * 键位映射表 —— 桌宠模块的配置层
 * =========================================================================
 * 三张表，全部是纯数据（无副作用、无依赖），照搬原版并按「物理键位」口径统一：
 *
 *   HAND_KEYS / HAND_KEY_INDEX  —— 打字键 → 第几张手图
 *   ALT_MOTIONS                 —— Alt + 键 → 动作（模型动作组里的下标）
 *   ALT_EXPRESSIONS             —— Alt + 键 → 表情（切换型）
 *
 * ⚠ 一律用 KeyboardEvent.code（物理键位），不用 e.key：
 *   e.key 受输入法、大小写、Shift 影响（中文输入法下拿到的是 'Process'），
 *   桌宠会时灵时不灵 —— 这是迁移时踩过的坑之一。
 */

/* ── 叠加手：打字键 → 手图下标 ───────────────────────────────────────────────
 * 映射顺序与原版 config.json 的 standard.hand 数组一致（VK 码 → e.code）：
 *   0-4   1-5      5-9   QWERT    10-14  ASDFG    15 Enter
 *   16-20 ZXCVB    21    Space    22-24  Shift / Ctrl / Alt（不分左右）
 * 注意 Space(21) 之后才是三个修饰键，顺序不能重排 —— 手图是按这个下标出的。 */
export const HAND_KEYS = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5',
  'KeyQ', 'KeyW', 'KeyE', 'KeyR', 'KeyT',
  'KeyA', 'KeyS', 'KeyD', 'KeyF', 'KeyG',
  'Enter',
  'KeyZ', 'KeyX', 'KeyC', 'KeyV', 'KeyB',
  'Space',
]

export const HAND_KEY_INDEX = new Map([
  ...HAND_KEYS.map((code, i) => [code, i]),
  ['ShiftLeft', 22], ['ShiftRight', 22],
  ['ControlLeft', 23], ['ControlRight', 23],
  ['AltLeft', 24], ['AltRight', 24],
])

/* ── Alt + 键 → 动作 ────────────────────────────────────────────────────────
 * index 是 cat.model3.json 里 CAT_motion_lock 组的动作下标（顺序与模型文件一致）。
 * label 是给控制面板/提示文案用的（现在只有开关页，先留着，加面板时直接用）。
 * sound 引用 modelProfile.sounds 里的 key —— 表里不写资源路径，避免路径两处维护。 */
export const ALT_MOTIONS = {
  Digit1: { label: '戴墨镜', index: 0 },
  Digit2: { label: '摘墨镜', index: 1 },
  Digit3: { label: '墨镜消失', index: 2 },
  Digit4: { label: '书籍出现', index: 3 },
  Digit5: { label: '书籍消失', index: 4 },
  Digit6: { label: '光环出现', index: 5 },
  Digit7: { label: '光环消失', index: 6 },
  Equal: { label: '虎牙嘴出现', index: 7 },
  KeyQ: { label: '虎牙嘴消失', index: 8 },
  KeyW: { label: '难道说出现', index: 9 },
  KeyE: { label: '难道说消失', index: 10 },
  KeyR: { label: '问号出现', index: 11 },
  KeyT: { label: '问号消失', index: 12 },
  KeyY: { label: 'Ciallo~', index: 13 },
  KeyU: { label: '投降出现', index: 14 },
  KeyI: { label: '投降消失', index: 15 },
  KeyO: { label: '冲击波', index: 16 },
  KeyP: { label: '脸红出现', index: 17 },
  BracketLeft: { label: '脸红消失', index: 18 },
  BracketRight: { label: '脸黑出现', index: 19 },
  KeyA: { label: '脸黑消失', index: 20 },
  KeyS: { label: '捏脸', index: 21 },
  KeyD: { label: '菲比啾比♪', index: 22, sound: 'jiubi' },
}

/* ── Alt + 键 → 表情（切换型：再按一次回默认）───────────────────────────── */
export const ALT_EXPRESSIONS = {
  Digit8: '昏迷',
  Digit9: '生气',
  Digit0: '哭泣',
  Minus: '痴呆',
}

/* ── 键码 → 展示文案（面板/提示用）────────────────────────────────────────
 * 'KeyQ' → 'Q'、'BracketLeft' → '['、'Space' → '空格' …… */
export function codeToLabel(code) {
  return String(code || '')
    .replace(/^Key/, '').replace(/^Digit/, '')
    .replace('BracketLeft', '[').replace('BracketRight', ']')
    .replace('Semicolon', ';').replace('Quote', "'").replace('Backquote', '`')
    .replace('Minus', '-').replace('Equal', '=').replace('Comma', ',')
    .replace('Period', '.').replace('Slash', '/').replace('Backslash', '\\')
    .replace('Space', '空格').replace('Enter', '回车').replace('Escape', 'Esc')
}
