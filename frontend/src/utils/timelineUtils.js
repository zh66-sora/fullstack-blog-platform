/**
 * 时间线工具函数 — utils 层（纯函数）
 * =========================================================================
 * 被两个页面共用：
 *   views/About.vue     看（把后端返回体整理成「节点列表」）
 *   views/Timeline.vue  改（把后端返回体整理成「可编辑表单」，提交前再收成 payload）
 *
 * 纯函数、无副作用、不碰 DOM / store —— 所以能脱离浏览器直接测（同 manageUtils / wallUtils）。
 *
 * ⚠ 排序口径必须与后端 `routes/timeline.js` 的 byDateAsc 完全一致：
 *   date 存的是定长补零的 'YYYY-MM-DD'，字典序 == 时间序，直接比字符串。
 *   不用 new Date()——ES 规范里 '2026-07-24' 这种「日期-only」串按 UTC 解析，
 *   东八区下会差一天（utils/dateUtils.js 里有同一处坑的说明）。
 */
import { DATE_RE } from '@/config/timeline.config'

/** 计数用码点（与 config/timeline.config.js、后端 timeline.js 同一口径） */
const len = (s) => [...(s || '')].length

/**
 * 字段值统一成字符串（表单里可能拿到 null / undefined / 数字）
 * @param {*} val
 * @returns {string}
 */
export function toText(val) {
  return val == null ? '' : String(val)
}

/**
 * 按年月日升序排一份副本（不改原数组）
 * ⚠ 日期不合法的条目排在最后，而不是被丢掉 ——
 *   丢数据比排错位置更难排查（脏数据只可能来自绕过前端的历史写入）
 */
export function sortByDateAsc(items) {
  const list = Array.isArray(items) ? [...items] : []
  return list.sort((a, b) => {
    const da = toText(a?.date)
    const db = toText(b?.date)
    const validA = DATE_RE.test(da)
    const validB = DATE_RE.test(db)
    if (validA && validB) return da.localeCompare(db)
    if (validA) return -1
    if (validB) return 1
    return 0
  })
}

/**
 * 'YYYY-MM-DD' → { year: '2001', monthDay: '11-02' }
 *
 * 展示页把年份放大字、月日放小字，所以要拆开。格式不对时整串都给 year，
 * monthDay 留空 —— 宁可少显示一行，也不要在页面上出现 "undefined"。
 */
export function splitDate(date) {
  const val = toText(date)
  if (!DATE_RE.test(val)) return { year: val, monthDay: '' }
  return { year: val.slice(0, 4), monthDay: val.slice(5) }
}

/**
 * 后端返回体 → 展示页的节点列表
 * 每项在四个原始字段之上多带 year / monthDay（模板里少调一次函数）
 */
export function buildTimelineNodes(data) {
  return sortByDateAsc(data?.items).map((item) => {
    const date = toText(item?.date)
    return {
      backgroundImage: toText(item?.backgroundImage),
      title: toText(item?.title),
      date,
      description: toText(item?.description),
      ...splitDate(date)
    }
  })
}

/**
 * 后端返回体 → 管理页的可编辑表单
 *
 * ⚠ 逐字段重建、不用展开拷贝：表单是「连行带值」的独立副本，
 *   直接把后端数组挂上去的话，编辑态里一改就把拉回来的原始数据也改了，
 *   「重置」也就无从回滚（与 Info.vue 的 buildFormFromProfile 同一个理由）。
 */
export function buildTimelineForm(data) {
  return {
    backgroundImage: toText(data?.backgroundImage),
    items: sortByDateAsc(data?.items).map((item) => ({
      backgroundImage: toText(item?.backgroundImage),
      title: toText(item?.title),
      date: toText(item?.date),
      description: toText(item?.description)
    }))
  }
}

/** 深拷一份表单（「重置」回填快照时用，避免快照被后续编辑改掉） */
export function cloneTimelineForm(form) {
  return {
    backgroundImage: toText(form?.backgroundImage),
    items: (Array.isArray(form?.items) ? form.items : []).map((item) => ({
      backgroundImage: toText(item?.backgroundImage),
      title: toText(item?.title),
      date: toText(item?.date),
      description: toText(item?.description)
    }))
  }
}

/**
 * 校验单条记录
 * @param {object} item — 表单里的一行
 * @returns {object} 字段名 → 是否未通过（false 表示通过）
 */
export function validateItem(item, rules) {
  const result = {}
  Object.keys(rules).forEach((name) => {
    // 图片字段存的是 URL，不 trim（URL 里不会有需要 trim 的东西，trim 反而可能改坏）；
    // 其余字段先 trim 再校验 ——「只敲了空格」应当等同于没填
    const raw = toText(item?.[name])
    const val = name === 'backgroundImage' ? raw : raw.trim()
    result[name] = !!rules[name](val)
  })
  return result
}

/**
 * 校验整张表单
 * @returns {{ ok: boolean, cover: boolean, items: Array<object> }}
 *   ok     整表是否通过
 *   cover  整页面背景图是否未通过
 *   items  每一条的错误表（下标与表单一致）
 */
export function validateForm(form, rules, coverRule) {
  const cover = !!coverRule(toText(form?.backgroundImage).trim())
  const items = (Array.isArray(form?.items) ? form.items : []).map((item) =>
    validateItem(item, rules)
  )
  const ok = !cover && items.length > 0 && items.every((row) => !Object.values(row).some(Boolean))
  return { ok, cover, items }
}

/**
 * 表单 → 提交体（只留后端认识的字段；顺带把首尾空白去掉）
 * ⚠ 提交顺序 = 表单顺序（不会重排）——「新加的一条先落在末尾」这条要求就落在这一步：
 *   重排只发生在保存成功后**重新拉取**那一次。
 */
export function toTimelinePayload(form) {
  return {
    backgroundImage: toText(form?.backgroundImage).trim(),
    items: (Array.isArray(form?.items) ? form.items : []).map((item) => ({
      backgroundImage: toText(item?.backgroundImage).trim(),
      title: toText(item?.title).trim(),
      date: toText(item?.date).trim(),
      description: toText(item?.description).trim()
    }))
  }
}

/**
 * 节点数量/字数的小结（管理页右下角那句「共 N 条」用）
 */
export function summarizeItems(items) {
  const list = Array.isArray(items) ? items : []
  return {
    count: list.length,
    chars: list.reduce((sum, item) => sum + len(item?.title) + len(item?.description), 0)
  }
}
