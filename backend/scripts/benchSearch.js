/**
 * 搜索压测脚本（阶段 4）
 * 用法：node --expose-gc scripts/benchSearch.js --docs=10000
 *
 * 只压「搜索核心」（buildIndex / query / upsertDoc），不连数据库：
 *   - 建索引耗时、查询 P50/P99、索引内存增量、Recall@10、单篇增量更新耗时
 *   - 语料是可控生成的：每篇由固定词表采样拼成，ground truth 用「字符串同时包含
 *     全部查询词」判定，不依赖人工标注，但口径可复现
 *
 * ⚠ 一次只压一个量级，1k/5k/10k 分别跑三个独立进程 —— 同一个进程里压三档，
 *   上一档的内存不会还给系统，测出来的增量会串。
 */
const { buildIndex, query, upsertDoc, tokenize } = require('../core/search')

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.split('=')[1]) : fallback
}

const DOCS = arg('docs', 10000)
// 每篇平均字数（真实博客长文约 4000~12000 字，短篇压测用 1200）
const AVG_CHARS = arg('chars', 1200)

// ===== 语料生成 =====
// 真实技术博客的倒排规模由两件事决定：文档数 × 每篇去重词数。
// 只有几十个词的假语料会把「一个词命中几千篇」放大，查询耗时不真实，
// 所以这里用「常见汉字随机组词」造一个几千词的中文词表，再按 Zipf 分布采样成文。
// 查询走同一个分词器，所以即使某个两字组合被切开，索引与查询也仍然一致。
const TECH_TERMS = (
  '组件 通信 生命周期 响应式 路由 守卫 渲染 模板 指令 事件 绑定 计算属性 侦听器 插值 ' +
  '表达式 过滤器 混入 插件 依赖 注入 作用域 插槽 异步组件 缓存 挂载 卸载 虚拟 dom diff ' +
  '算法 补丁 节点 遍历 递归 栈 队列 链表 哈希 索引 倒排 分词 词频 文档 查询 召回 排序 ' +
  '权重 阈值 分页 游标 命中 穿透 雪崩 限流 降级 熔断 幂等 事务 进程 线程 事件循环 微任务 ' +
  '宏任务 回调 异步 同步 阻塞 内存 堆 垃圾回收 引用 上传 下载 文件 分片 秒传 校验 签名 ' +
  '加密 解密 公钥 私钥 令牌 会话 权限 鉴权 越权 部署 服务器 反向代理 负载均衡 容器 镜像 ' +
  '日志 监控 告警 备份 恢复 迁移 版本 发布 回滚 测试 单元 集成 冒烟 压测 基准 覆盖率 断言 ' +
  '模拟 边界 异常 超时 重试 补偿 接口 参数 响应 状态码 错误 中间件 拦截器 客户端 服务端 ' +
  '协议 请求 连接 断开 架构 分层 模块 耦合 内聚 重构 设计模式 工厂 单例 观察者 策略 适配器'
).split(/\s+/)

// 常用汉字池（约 500 字），用于合成中文词
const CHARS = (
  '的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工' +
  '也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小' +
  '物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形' +
  '相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建' +
  '月公无系军很情者最立代想已通并提直题程展五果料象员革位入常文总次品式活设及管特件长求' +
  '老头基资边流路级少图山统接知较将组见计别她手角期根论运农指几九区强放决西被干做必战先' +
  '回则任取据处队南给色光门即保治北造百规热领七海口东导器压志世金增争济阶油思术极交受联' +
  '什认六共权收证改清己美再采转更单风切打白教速花带安场身车例真务具万每目至达走积示议声' +
  '报斗完类八离华名确才科张信马节话米整空元况今集温传土许步群广石记需段研界拉林律叫且究' +
  '观越织装影算低持音众书布复容儿须际商非验连断深难近千周委素技备半办青省列习响约支般史' +
  '感劳便团往酸历市克何除消构府称太准精值号率族维划选标写存候毛亲快效斯院查江型眼王按格'
)

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20261109)

// 词表：8000 个合成的两字词 + 200 个技术词（技术词按低概率混入，模拟长尾）
// ⚠ 合成的两字词必须自己就是一个 token（`tokenize(w).length === 1`）：
//   否则「的了」这种组合会被切成两个停用词，查询直接变空，指标全是噪声。
const VOCAB = (() => {
  const set = new Set(TECH_TERMS)
  let guard = 0
  while (set.size < 8000 && guard < 200000) {
    guard += 1
    const a = CHARS[Math.floor(rand() * CHARS.length)]
    const b = CHARS[Math.floor(rand() * CHARS.length)]
    const w = a + b
    const tokens = tokenize(w)
    if (tokens.length === 1 && tokens[0] === w) set.add(w)
  }
  return [...set]
})()

const pickTerm = () => {
  // Zipf：平方后取整，让少数词高频、大量词低频
  const idx = Math.floor(Math.pow(rand(), 2) * VOCAB.length)
  return VOCAB[Math.min(idx, VOCAB.length - 1)]
}

function makeDocs(n) {
  const docs = []
  for (let i = 0; i < n; i++) {
    const title = [pickTerm(), pickTerm(), pickTerm()].join(' ')
    // 正文长度围绕 AVG_CHARS 波动（0.5x~1.5x）
    const target = Math.max(200, Math.floor(AVG_CHARS * (0.5 + rand())))
    const body = []
    const titleTerms = new Set(title.split(' '))
    const terms = new Set(titleTerms)
    let len = 0
    while (len < target) {
      const w = pickTerm()
      body.push(w)
      terms.add(w)
      len += w.length + 1
    }
    docs.push({
      _id: 'bench' + i,
      title,
      content: `<p>${title}。${body.join('，')}。</p>`,
      // 生成时就知道这篇「真的包含哪些词」—— 用它当 ground truth，
      // 不依赖分词结果，避免「切词把词切开导致被判成不相关」
      _terms: terms,
      // 两个词都出现在标题里 = 高相关（grade 2）；只在正文 = 相关（grade 1）
      _titleTerms: titleTerms,
    })
  }
  return docs
}

// ===== 指标工具 =====
const pct = (arr, p) => {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}
const ms = (ns) => (Number(ns) / 1e6).toFixed(1)

function heapMB() {
  return process.memoryUsage().heapUsed / 1024 / 1024
}

// ===== 跑 =====
;(async () => {
  if (global.gc) global.gc()
  const docs = makeDocs(DOCS)
  if (global.gc) global.gc()
  const heapAfterGen = heapMB()

  // 1. 全量建索引
  const t0 = process.hrtime.bigint()
  const index = buildIndex(docs)
  const buildNs = process.hrtime.bigint() - t0
  if (global.gc) global.gc()
  const heapAfterIndex = heapMB()

  // 2. 查询集：30 条两词查询，相关文档数控制在 3~300 之间
  //    （相关文档太少的查询没有区分度，太多则 recall@10 天然上不去）
  //    一半查询取自某篇的真实标题 —— 这样「标题里含查询词」的高相关文档一定存在，
  //    才测得出排序好坏（否则全是 grade 1，nDCG 恒等于 1）
  const queries = []
  for (let attempt = 0; attempt < 500 && queries.length < 30; attempt++) {
    let words
    if (attempt % 2 === 0) {
      const doc = docs[Math.floor(rand() * docs.length)]
      const titleWords = [...doc._titleTerms]
      if (titleWords.length < 2) continue
      words = [titleWords[0], titleWords[titleWords.length - 1]]
    } else {
      words = [pickTerm(), pickTerm()]
    }
    if (words[0] === words[1]) continue
    const relevant = docs.filter((d) => words.every((w) => d._terms.has(w)))
    if (relevant.length >= 3 && relevant.length <= 300) {
      queries.push({ q: words.join(' '), words, relevant })
    }
  }

  const samples = []
  let totalHits = 0
  for (const { q } of queries) {
    for (let rep = 0; rep < 20; rep++) {
      const s = process.hrtime.bigint()
      const res = query(index, q)
      samples.push(Number(process.hrtime.bigint() - s))
      if (rep === 0) totalHits += res.hits.length
    }
  }

  // 3. 召回质量：top10 覆盖了多少比例的相关文档
  //    ⚠ 不报 nDCG / P@1：这份语料的相关集是「按生成词精确判定的」，
  //      命中集合与相关集合几乎重合，P@1 恒为 1、nDCG 恒为 1，报出来是自欺欺人。
  //      排序好坏改用真实语料抽查（见压测报告里那张 6 条查询的表）。
  let relSum = 0
  let recallSum = 0
  for (const { q, relevant } of queries) {
    const top = query(index, q).hits.slice(0, 10).map((h) => h.docId)
    const relevantIds = new Set(relevant.map((d) => d._id))
    relSum += relevantIds.size
    recallSum += top.filter((id) => relevantIds.has(id)).length / relevantIds.size
  }

  // 4. 增量更新：改 100 篇的正文（每次都要先从倒排里摘旧词）
  const updateTimes = []
  for (let i = 0; i < 100; i++) {
    const target = docs[i]
    const s = process.hrtime.bigint()
    upsertDoc(index, {
      ...target,
      content: target.content + '，补充说明',
    })
    updateTimes.push(Number(process.hrtime.bigint() - s))
  }

  const result = {
    docs: DOCS,
    avgChars: AVG_CHARS,
    terms: index.postings.size,
    tokens: index.totalLen,
    postings: [...index.postings.values()].reduce((sum, b) => sum + b.size, 0),
    avgDocLen: Math.round(index.avgDocLen),
    buildMs: ms(buildNs),
    indexMB: Number((heapAfterIndex - heapAfterGen).toFixed(1)),
    queryP50ms: Number((pct(samples, 50) / 1e6).toFixed(2)),
    queryP99ms: Number((pct(samples, 99) / 1e6).toFixed(2)),
    queryAvgHits: Math.round(totalHits / queries.length),
    avgRelevant: Math.round(relSum / queries.length),
    recallAt10: Number((recallSum / queries.length).toFixed(3)),
    upsertP50ms: Number((pct(updateTimes, 50) / 1e6).toFixed(2)),
    upsertP99ms: Number((pct(updateTimes, 99) / 1e6).toFixed(2)),
    queries: queries.length,
  }

  console.log('BENCH_JSON ' + JSON.stringify(result))
  process.exit(0)
})().catch((err) => {
  console.error('失败:', err.stack)
  process.exit(1)
})
