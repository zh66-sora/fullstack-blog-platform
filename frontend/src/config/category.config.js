/**
 * 板块分类配置 — config 层
 *
 * 迁移自原项目 myBlog/app/config/category.config.js
 *
 * 职责：集中维护板块的 _id ↔ 展示名/图标映射关系
 * 数据流向：utils/articleListViewModel.js → 文章列表渲染
 *
 * 架构说明：
 *   这是整个系统中唯一知道 _id ↔ 中文名 映射的地方。
 *   后端只存 _id（ObjectId），前端通过此配置表在渲染时转换为可读文案。
 *
 * 注意：_id 值需与后端 categories 集合的实际 _id 保持一致。
 *       新老项目对接的是同一个后端（http://127.0.0.1:3000），所以这些 _id 可直接沿用。
 */

const CATEGORIES = [
  { _id: '6a5a1b3064e65f517c9056bd', key: 'Technology', name: '技术', icon: 'icon-react' },
  { _id: '6a5a1b3064e65f517c9056c0', key: 'Life', name: '生活', icon: 'icon-shenghuo-' },
  { _id: '6a5a1b3064e65f517c9056c3', key: 'Thoughts', name: '思考', icon: 'icon-sikao' },
  { _id: '6a5a1b3064e65f517c9056c6', key: 'Reading', name: '阅读', icon: 'icon-yuedu' },
  { _id: '6a5a1b3064e65f517c9056c9', key: 'Product', name: '产品', icon: 'icon-chanpin' },
  { _id: '6a5a1b3064e65f517c9056cc', key: 'Design', name: '设计', icon: 'icon-sheji' },
  { _id: '6a5a1b3064e65f517c9056cf', key: 'Startup', name: '创业', icon: 'icon-chuangye2' },
  { _id: '6a5a1b3064e65f517c9056d2', key: 'Tools', name: '工具', icon: 'icon-gongju' },
  { _id: '6a5a1b3064e65f517c9056d5', key: 'Misc', name: '杂谈', icon: 'icon-zatan' },
]

/**
 * 根据 _id 获取展示名称（兼容 ObjectId / string）
 * 后端返回的 category 可能是 { _id, name } 对象，也可能是纯 _id 字符串
 * @param {string|ObjectId} id — 板块 _id
 * @returns {string} 中文展示名，未匹配时返回空字符串
 */
export function getCategoryNameById(id) {
  const sid = String(id ?? '')
  const found = CATEGORIES.find((c) => c._id === sid)
  return found ? found.name : ''
}

/**
 * 根据 key 获取展示名称
 * @param {string} key — 英文标识（如 'Technology'）
 * @returns {string} 中文展示名
 */
export function getCategoryNameByKey(key) {
  const found = CATEGORIES.find((c) => c.key === key)
  return found ? found.name : ''
}

export default CATEGORIES
