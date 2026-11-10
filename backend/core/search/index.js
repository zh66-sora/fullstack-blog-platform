/**
 * 全文索引 —— 内存倒排（阶段 3）
 * =========================================================================
 * 职责：把文章正文（富文本 HTML）变成「词 → 文档」的倒排表，供搜索路由查询
 *
 * 为什么自己写，而不是用现成的：
 *   - Mongo `$text`：中文按空格/标点切，一整句会变成一个词，几乎搜不出东西
 *   - Elasticsearch：JVM 堆建议 1G+，本机只有 1.6G，装不下
 *   - Meilisearch：能用，但要多养一个进程，还是在 1.6G 里抢内存
 *
 * 阶段 1：剥离 HTML + 分词 + 倒排召回（解决「搜得对」）
 * 阶段 2：BM25 排序 + 标题加权 + 高亮摘要（解决「排得对 / 看得清」）
 * 阶段 3：文章增删改的增量更新 + 每日全量重建兜底（解决「改完能立刻搜到」）
 *   - 压测与容量评估 → 阶段 4
 */
const { Jieba } = require('@node-rs/jieba')
const { dict } = require('@node-rs/jieba/dict')

// 词典加载有成本，实例化一次复用
const jieba = Jieba.withDict(dict)

// ===== BM25 参数 =====
// k1：词频饱和系数。tf 从 1→10 时权重只涨到约 2 倍而不是 10 倍，
//     避免「一篇文章把关键词刷 50 遍」就霸榜。
// b：文档长度归一化。=1 表示完全按长度折价，=0 表示不管长度；
//     0.75 是业界默认值（Lucene / Elasticsearch 同款），不用调。
const K1 = 1.2
const B = 0.75
// 标题命中的加权。标题是作者对文章内容的「一句话概括」，
// 命中的信息量高于正文里顺带提一句 —— 不加权时实测「响应式」会把《Vue常见库》排第一。
const TITLE_BOOST = 2.0

// 高频无意义词：切出来只会稀释分数
const STOPWORDS = new Set([
  '的', '了', '是', '在', '和', '与', '及', '等', '这', '那', '有', '就', '都', '而',
  '被', '把', '让', '给', '对', '从', '到', '为', '以', '于', '也', '很', '还', '但',
  '并', '或', '一个', '我们', '你们', '他们', '自己', '什么', '怎么', '这个', '那个',
  '可以', '没有', '不是', '如果', '因为', '所以', '然后', '就是', '这些', '那些'
])

/**
 * 富文本 → 纯文本
 *
 * ⚠ 这一步是整个改造的前提：`content` 存的是 HTML，不剥标签的话，
 *   搜 "div" / "h2" / "code" 命中其实是标签名，不是正文内容。
 *   （改造前实测：搜 h2 命中 11 篇，剥完只剩 5 篇正文真的提到）
 */
function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    // 解实体放在剥标签之后：&lt;div&gt; 是正文里的“代码文本”，要保留成 <div>
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 分词 + 清洗
 *
 * ⚠ 索引和查询必须走这同一个函数：如果索引时把「响应式」切成「响应 / 式」，
 *   查询时却按整词找，就永远匹配不上。同口径是能搜到的前提。
 */
function tokenize(text) {
  return jieba
    .cut(String(text || ''), true)
    .map((word) => word.trim().toLowerCase())
    .filter((word) => {
      if (!word) return false
      if (STOPWORDS.has(word)) return false
      // 纯空白 / 标点 / 符号丢掉
      if (/^[\s\p{P}\p{S}]+$/u.test(word)) return false
      return true
    })
}

/**
 * 构建倒排索引
 * @param {Array<{_id:any, title?:string, content?:string}>} articles
 * @returns {{postings: Map<string, Map<string, number>>, titleTerms: Map<string, Set<string>>, docLen: Map<string, number>, docCount: number, avgDocLen: number, builtAt: Date}}
 */
function buildIndex(articles) {
  const postings = new Map() // term -> Map(docId -> 词频)
  const titleTerms = new Map() // docId -> 标题里出现过的词（用于标题加权）
  const docLen = new Map() // docId -> 该文档词数
  let totalLen = 0

  for (const article of articles) {
    const docId = String(article._id)
    const titleWords = tokenize(article.title || '')
    const words = tokenize(`${article.title || ''} ${stripHtml(article.content)}`)

    docLen.set(docId, words.length)
    totalLen += words.length
    titleTerms.set(docId, new Set(titleWords))

    const tf = new Map()
    for (const word of words) tf.set(word, (tf.get(word) || 0) + 1)

    for (const [term, count] of tf) {
      let bucket = postings.get(term)
      if (!bucket) {
        bucket = new Map()
        postings.set(term, bucket)
      }
      bucket.set(docId, count)
    }
  }

  return {
    postings,
    titleTerms,
    docLen,
    // totalLen 必须留着：增量增删文档后要重算 avgDocLen，
    // 只存 avg 的话没法「减去一篇旧文档的长度」
    totalLen,
    docCount: articles.length,
    avgDocLen: articles.length ? totalLen / articles.length : 0,
    builtAt: new Date(),
    updatedAt: new Date()
  }
}

/**
 * 把一篇文档从索引里摘掉（内部用）
 * @returns {number|undefined} 被摘掉文档的原词数（不存在则 undefined）
 */
function detachDoc(index, docId) {
  // 倒排里没有「文档 → 词」的反向表，所以只能遍历词表逐个删。
  // 词表规模约 3 万（1 万篇时），一次更新 3 万次 Map.delete 在毫秒级，
  // 比再维护一份反向表（内存翻倍）划算。
  for (const [term, bucket] of index.postings) {
    if (bucket.delete(docId) && bucket.size === 0) index.postings.delete(term)
  }

  const oldLen = index.docLen.get(docId)
  if (oldLen !== undefined) {
    index.docLen.delete(docId)
    index.totalLen -= oldLen
    index.docCount -= 1
  }
  index.titleTerms.delete(docId)
  return oldLen
}

/**
 * 增量写入 / 更新一篇文档
 *
 * 为什么要有它：索引只在启动时建一次的话，新发的文章要重启服务才搜得到。
 * upsert 的语义是「先摘掉旧版本，再挂上新版本」—— 改标题后旧词必须立刻失效，
 * 否则会搜到一个已经不存在的标题。
 */
function upsertDoc(index, article) {
  const docId = String(article._id)
  detachDoc(index, docId)

  const title = article.title || ''
  const titleWords = tokenize(title)
  // ⚠ 分词口径必须和 buildIndex 完全一致（同一个 tokenize + 同样的拼接顺序）
  const words = tokenize(`${title} ${stripHtml(article.content)}`)

  index.docLen.set(docId, words.length)
  index.totalLen += words.length
  index.docCount += 1
  index.titleTerms.set(docId, new Set(titleWords))

  const tf = new Map()
  for (const word of words) tf.set(word, (tf.get(word) || 0) + 1)

  for (const [term, count] of tf) {
    let bucket = index.postings.get(term)
    if (!bucket) {
      bucket = new Map()
      index.postings.set(term, bucket)
    }
    bucket.set(docId, count)
  }

  index.avgDocLen = index.docCount ? index.totalLen / index.docCount : 0
  index.updatedAt = new Date()
  return index
}

/** 增量删除一篇文档 */
function removeDoc(index, docId) {
  detachDoc(index, docId)
  index.avgDocLen = index.docCount ? index.totalLen / index.docCount : 0
  index.updatedAt = new Date()
  return index
}

/**
 * 查询：返回按 BM25 相关度降序的 [{ docId, score }]
 *
 * BM25 公式（对每个查询词累加）：
 *   IDF   = ln(1 + (N - df + 0.5) / (df + 0.5))
 *   score = IDF · tf·(k1+1) / (tf + k1·(1 - b + b·|d|/avgdl))
 *
 * 为什么不用阶段 1 的 TF-IDF：
 *   TF-IDF 的 tf 是线性的、也没有长度归一化 —— 2273 词的长文只要「次数多」就能压过
 *   真正讲这件事的短文。实测搜「响应式」第一条是《Vue常见库》而不是《Vue基础语法》。
 *   BM25 的 k1 让词频饱和、b 按长度折价，正好治这两个毛病。
 *
 * ⚠ 覆盖度门槛（needed）：
 *   中文被切碎后，一个词会变成多个 term，例如「虚拟DOM」→ ["虚拟","dom"]、
 *   「响应式」→ ["响应","式"]。如果纯 OR（任一命中就算），搜「虚拟DOM」会召回
 *   所有只提到 dom 的文章（实测 8/11 篇），看起来就像"搜错了"。
 *   所以多词查询要求命中至少 60% 的 term（2 个词 → 必须全中，3 个词 → 至少 2 个）。
 */
function query(index, q) {
  const terms = [...new Set(tokenize(q))]
  if (!index || !terms.length) return { hits: [], terms: [], needed: 0 }

  const N = index.docCount
  const avgdl = index.avgDocLen || 1
  const scores = new Map()
  const matched = new Map() // docId -> 命中了几个不同的 term

  for (const term of terms) {
    const bucket = index.postings.get(term)
    if (!bucket) continue

    const df = bucket.size
    const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5))

    for (const [docId, tf] of bucket) {
      const dl = index.docLen.get(docId) || 1
      const denom = tf + K1 * (1 - B + (B * dl) / avgdl)
      let score = (idf * (tf * (K1 + 1))) / denom

      // 标题命中加权：同一篇文档里，标题出现这个词比正文出现更能代表主题
      if (index.titleTerms.get(docId)?.has(term)) score *= TITLE_BOOST

      scores.set(docId, (scores.get(docId) || 0) + score)
      matched.set(docId, (matched.get(docId) || 0) + 1)
    }
  }

  const needed = terms.length > 1 ? Math.ceil(terms.length * 0.6) : 1

  const hits = [...scores.entries()]
    .filter(([docId]) => (matched.get(docId) || 0) >= needed)
    .map(([docId, score]) => ({ docId, score }))
    .sort((a, b) => b.score - a.score)

  return { hits, terms, needed }
}

// ============================================================
// 高亮摘要
// ⚠ 只能在「纯文本」上做标记，绝不能在原 HTML 上 replace：
//   一旦命中的词落在标签内部（<h2> 里的 h2、style="…" 里的 style），
//   替换后标签被劈开，页面结构直接崩。
// ============================================================
const CJK_RE = /[\u4e00-\u9fa5]/

function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 从用户输入里取「要在摘要里标亮的词」
 *
 * 为什么要单独取一份，而不是直接用分词结果：分词会把「响应式」切成
 * ["响应","式"] —— 直接拿去标亮会得到「<mark>响应</mark>式」这种半截效果。
 * 所以先按空格/标点切出用户输入的原始词（整词优先标亮），再把分词结果作为补充
 * （应对「响应式布局」这种连写），最后按长度降序，保证长词先匹配。
 */
function extractKeywords(q) {
  const raw = String(q || '').trim()
  if (!raw) return []

  const keys = new Set()
  for (const part of raw.split(/[\s,，、;；|/]+/).filter(Boolean)) {
    keys.add(part)
    if (CJK_RE.test(part) && part.length > 2) {
      for (const token of tokenize(part)) {
        if (token.length >= 2) keys.add(token)
      }
    }
  }

  return [...keys].sort((a, b) => b.length - a.length)
}

/** 给纯文本里的关键词套 <mark>；非命中部分先转义，避免摘要里的 <div> 被当成标签 */
function markKeywords(text, keys) {
  const source = String(text || '')
  if (!source || !keys.length) return escapeHtml(source)

  const re = new RegExp(`(${keys.map(escapeRegExp).join('|')})`, 'gi')
  let html = ''
  let last = 0
  let match

  while ((match = re.exec(source)) !== null) {
    html += escapeHtml(source.slice(last, match.index))
    html += `<mark>${escapeHtml(match[0])}</mark>`
    last = match.index + match[0].length
    if (match[0].length === 0) re.lastIndex += 1
  }
  html += escapeHtml(source.slice(last))
  return html
}

/**
 * 围绕第一个命中词截一段摘要（前后各 radius 个字符），并对这段纯文本标亮
 * 返回的是「已转义 + 含 <mark>」的 HTML，前端可直接 v-html
 */
function buildSnippet(text, keys, radius = 60) {
  const plain = String(text || '')
  if (!plain) return ''
  if (!keys.length) {
    const head = plain.slice(0, radius * 2)
    return escapeHtml(head) + (plain.length > head.length ? '…' : '')
  }

  const lower = plain.toLowerCase()
  let first = -1
  let hitLen = 0
  for (const key of keys) {
    const at = lower.indexOf(key.toLowerCase())
    if (at !== -1 && (first === -1 || at < first)) {
      first = at
      hitLen = key.length
    }
  }

  // 一个关键词都没落在正文里（可能在标题里），就正常截开头
  if (first === -1) {
    const head = plain.slice(0, radius * 2)
    return escapeHtml(head) + (plain.length > head.length ? '…' : '')
  }

  const start = Math.max(0, first - radius)
  const end = Math.min(plain.length, first + hitLen + radius)
  const marked = markKeywords(plain.slice(start, end), keys)

  return `${start > 0 ? '…' : ''}${marked}${end < plain.length ? '…' : ''}`
}


// ============================================================
// 索引生命周期
// ⚠ 核心层不直接 require models —— 数据从哪来由调用方注入（app.js 里 setSource），
//   这样 core 可以脱离数据库单测，也不会和 models 形成双向依赖。
// ============================================================
let current = null
let building = null
let loadDocuments = null

/**
 * 注入「取全部待索引文档」的方法
 * @param {() => Promise<Array<{_id:any,title?:string,content?:string}>>} loader
 */
function setSource(loader) {
  loadDocuments = loader
}

async function rebuild() {
  if (building) return building
  if (!loadDocuments) {
    throw new Error('搜索索引未配置数据源：启动时应调用 setSource(() => Article.find()…)')
  }
  building = (async () => {
    const articles = await loadDocuments()
    current = buildIndex(articles)
    console.log(`[search] 索引构建完成：${articles.length} 篇 / ${current.postings.size} 个词`)
    return current
  })()
  try {
    return await building
  } finally {
    building = null
  }
}

async function getIndex() {
  if (current) return current
  return rebuild()
}

/**
 * 取「可用于写入」的索引
 * 全量重建正在进行时先等它跑完 —— 否则这次增量会写进 current 那个
 * 马上要被新对象替换掉的旧索引上，等于白写。
 */
async function readyIndex() {
  if (building) await building
  return getIndex()
}

/**
 * 增量更新一篇文档（模型钩子调用）
 * 失败只打日志不抛：搜索索引坏了不该让「保存文章」失败
 */
async function indexArticle(article) {
  if (!article || !article._id) return
  const index = await readyIndex()
  upsertDoc(index, {
    _id: article._id,
    title: article.title || '',
    content: article.content || ''
  })
}

/** 增量删除一篇文档 */
async function unindexArticle(id) {
  if (!id) return
  const index = await readyIndex()
  removeDoc(index, String(id))
}

/**
 * 每日全量重建兜底
 *
 * 为什么增量之外还要全量：updateMany / deleteMany / 直接改库这类操作绕过了
 * 模型钩子，索引会悄悄和库不一致。每天重建一次，最坏情况也就错一天。
 */
function scheduleAutoRebuild(intervalMs = 24 * 60 * 60 * 1000) {
  const timer = setInterval(() => {
    rebuild().catch((err) => console.warn('[search] 定时重建失败:', err.message))
  }, intervalMs)
  // unref：不因为这个定时器把进程吊着（pm2 重启时能正常退出）
  timer.unref()
  return timer
}

function stats() {
  if (!current) return null
  return {
    docs: current.docCount,
    terms: current.postings.size,
    avgDocLen: Math.round(current.avgDocLen),
    builtAt: current.builtAt,
    updatedAt: current.updatedAt
  }
}

module.exports = {
  stripHtml,
  tokenize,
  buildIndex,
  query,
  extractKeywords,
  markKeywords,
  buildSnippet,
  upsertDoc,
  removeDoc,
  setSource,
  rebuild,
  getIndex,
  indexArticle,
  unindexArticle,
  scheduleAutoRebuild,
  stats
}
