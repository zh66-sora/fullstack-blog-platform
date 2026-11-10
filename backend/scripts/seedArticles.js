/**
 * 数据库清理 + 10 篇含 GitHub 链接的种子文章
 * 用法：在 myapp 目录下执行 node scripts/seed.js
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const mongoose = require('mongoose')

// ---- 连接数据库 ----
mongoose.connect('mongodb://127.0.0.1:27017/test_db', {
  useUnifiedTopology: true,
  useNewUrlParser: true,
})

const Article = require('../models/Article')
const User = require('../models/User')
const Column = require('../models/Column')

// ---- 10 篇种子文章数据 ----
const SEED_ARTICLES = [
  {
    title: 'Vue 3 Composition API 实战指南',
    content: encodeURI('<h2>Setup 语法糖</h2><p>Vue 3 的 <code>&lt;script setup&gt;</code> 是最简洁的编写方式，编译时自动处理 props、emits 和暴露。</p><pre><code>const props = defineProps({ msg: String })\nconst emit = defineEmits([\'update\'])</code></pre><p>响应式数据通过 <code>ref</code> 和 <code>reactive</code> 创建，配合 <code>watchEffect</code> 自动追踪依赖。</p>'),
    gitHubUrl: 'https://github.com/vuejs/core',
  },
  {
    title: 'React Server Components 深度解析',
    content: encodeURI('<h2>RSC 原理</h2><p>React Server Components 允许组件在服务端运行，零客户端 JS 体积。与传统的 SSR 不同，RSC 不会水合（hydrate），而是通过流式协议将渲染结果发送到客户端。</p><blockquote><p>RSC + Suspense = 最优的渲染策略</p></blockquote><p>结合 Next.js App Router，可以实现页面级、布局级、组件级的渐进式渲染。</p>'),
    gitHubUrl: 'https://github.com/facebook/react',
  },
  {
    title: 'TypeScript 类型体操入门',
    content: encodeURI('<h2>从基础到进阶</h2><p>TypeScript 的类型系统是图灵完备的。通过泛型、条件类型、模板字面量类型，可以在类型层面完成复杂的逻辑操作。</p><pre><code>type DeepReadonly&lt;T&gt; = {\n  readonly [K in keyof T]: T[K] extends object\n    ? DeepReadonly&lt;T[K]&gt;\n    : T[K]\n}</code></pre><p>掌握类型体操不仅能写出更安全的代码，还能在编辑器中获得更精确的智能提示。</p>'),
    gitHubUrl: 'https://github.com/microsoft/TypeScript',
  },
  {
    title: 'Node.js Stream 流处理最佳实践',
    content: encodeURI('<h2>为什么需要 Stream</h2><p>在处理大文件或实时数据时，一次性加载到内存会导致 OOM。Stream 通过背压（backpressure）机制，保证数据以可控的速度流经管道。</p><ul><li>Readable — 数据源</li><li>Writable — 数据出口</li><li>Transform — 中间处理</li><li>Duplex — 双向流</li></ul><p><code>pipeline()</code> 函数是比 <code>.pipe()</code> 更安全的选择，它会自动处理错误和清理资源。</p>'),
    gitHubUrl: 'https://github.com/nodejs/node',
  },
  {
    title: 'CSS Container Queries 新时代响应式',
    content: encodeURI('<h2>超越 Media Queries</h2><p>Container Queries 让组件基于<strong>自身容器</strong>的尺寸来调整样式，而不是视口大小。这意味着同一个组件放在侧边栏和主内容区时，会自动呈现不同的布局。</p><pre><code>@container (min-width: 400px) {\n  .card { grid-template-columns: 1fr 1fr }\n}</code></pre><p>配合 <code>container-type: inline-size</code>，任何元素都可以成为查询容器。</p>'),
    gitHubUrl: 'https://github.com/w3c/csswg-drafts',
  },
  {
    title: 'Rust 所有权系统简明教程',
    content: encodeURI('<h2>无需 GC 的内存安全</h2><p>Rust 通过<em>所有权</em>（ownership）、<em>借用</em>（borrowing）、<em>生命周期</em>（lifetime）三大机制，在编译期保证内存安全，彻底消除悬垂指针、双重释放等 C/C++ 常见问题。</p><pre><code>fn main() {\n  let s1 = String::from("hello");\n  let s2 = s1;  // s1 移动到了 s2，s1 失效\n  println!("{}", s2);  // OK\n}</code></pre><p>理解所有权是 Rust 入门最关键的一步，之后的借用检查器（Borrow Checker）会强制你在编译期遵守这些规则。</p>'),
    gitHubUrl: 'https://github.com/rust-lang/rust',
  },
  {
    title: 'GraphQL vs REST 接口设计对比',
    content: encodeURI('<h2>选择合适的数据查询方案</h2><p>REST 以<strong>资源</strong>为中心，每个端点返回固定结构的数据，直观且利于缓存。GraphQL 以<strong>查询</strong>为中心，客户端精确指定所需字段，避免过度获取（over-fetching）。</p><table><tr><th>维度</th><th>REST</th><th>GraphQL</th></tr><tr><td>缓存</td><td>HTTP Cache 天然支持</td><td>需 Apollo/URQL 客户端</td></tr><tr><td>学习成本</td><td>低</td><td>中高</td></tr></table><p>对于简单的 CRUD 应用 REST 足够；复杂的数据图谱场景 GraphQL 更合适。</p>'),
    gitHubUrl: 'https://github.com/graphql/graphql-spec',
  },
  {
    title: 'Docker 多阶段构建优化镜像体积',
    content: encodeURI('<h2>从 1GB 到 50MB</h2><p>多阶段构建（multi-stage build）让编译依赖和运行依赖分离，最终镜像仅包含运行时必需的文件。</p><pre><code>FROM node:20 AS builder\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci\nCOPY . .\nRUN npm run build\n\nFROM node:20-alpine\nCOPY --from=builder /app/dist ./dist\nCMD ["node", "dist/main.js"]</code></pre><p>选用 <code>alpine</code> 基础镜像并配合 <code>.dockerignore</code>，可将 Node.js 应用镜像压缩到 50MB 以内。</p>'),
    gitHubUrl: 'https://github.com/docker/buildx',
  },
  {
    title: 'WebSocket 实时通信实践',
    content: encodeURI('<h2>从轮询到推送</h2><p>HTTP 请求-响应模型不适合实时场景。WebSocket 建立长连接，服务端可主动推送数据，延迟从秒级降到毫秒级。</p><pre><code>const ws = new WebSocket(\'wss://example.com/chat\')\nws.onmessage = (event) => {\n  renderMessage(JSON.parse(event.data))\n}\nws.send(JSON.stringify({ type: \'join\', room: \'general\' }))</code></pre><p>生产环境建议使用 Socket.IO（自动降级、自动重连、房间管理）或直接使用 ws 库构建轻量级服务。</p>'),
    gitHubUrl: 'https://github.com/websockets/ws',
  },
  {
    title: 'Git 工作流与 Commit 规范',
    content: encodeURI('<h2>Conventional Commits</h2><p>统一的 Commit 格式让版本管理和自动化发布成为可能：</p><pre><code>&lt;type&gt;(&lt;scope&gt;): &lt;description&gt;\n\nfeat(auth): add JWT refresh token\nfix(api): handle empty search result\nchore(deps): bump mongoose to 8.0</code></pre><p>结合 <code>semantic-release</code> 或 <code>changesets</code>，可以根据 Commit 类型自动生成 CHANGELOG 并决定版本号升级策略。</p>' + '<h2>Conventional Commits</h2><p>统一的 Commit 格式让版本管理和自动化发布成为可能：</p><pre><code>&lt;type&gt;(&lt;scope&gt;): &lt;description&gt;\n\nfeat(auth): add JWT refresh token\nfix(api): handle empty search result\nchore(deps): bump mongoose to 8.0</code></pre><p>结合 <code>semantic-release</code> 或 <code>changesets</code>，可以根据 Commit 类型自动生成 CHANGELOG 并决定版本号升级策略。</p>' + '<h2>Conventional Commits</h2><p>统一的 Commit 格式让版本管理和自动化发布成为可能：</p><pre><code>&lt;type&gt;(&lt;scope&gt;): &lt;description&gt;\n\nfeat(auth): add JWT refresh token\nfix(api): handle empty search result\nchore(deps): bump mongoose to 8.0</code></pre><p>结合 <code>semantic-release</code> 或 <code>changesets</code>，可以根据 Commit 类型自动生成 CHANGELOG 并决定版本号升级策略。</p>' + '<h2>Conventional Commits</h2><p>统一的 Commit 格式让版本管理和自动化发布成为可能：</p><pre><code>&lt;type&gt;(&lt;scope&gt;): &lt;description&gt;\n\nfeat(auth): add JWT refresh token\nfix(api): handle empty search result\nchore(deps): bump mongoose to 8.0</code></pre><p>结合 <code>semantic-release</code> 或 <code>changesets</code>，可以根据 Commit 类型自动生成 CHANGELOG 并决定版本号升级策略。</p>' + '<h2>Conventional Commits</h2><p>统一的 Commit 格式让版本管理和自动化发布成为可能：</p><pre><code>&lt;type&gt;(&lt;scope&gt;): &lt;description&gt;\n\nfeat(auth): add JWT refresh token\nfix(api): handle empty search result\nchore(deps): bump mongoose to 8.0</code></pre><p>结合 <code>semantic-release</code> 或 <code>changesets</code>，可以根据 Commit 类型自动生成 CHANGELOG 并决定版本号升级策略。</p>'),
    gitHubUrl: 'https://github.com/git/git',
  },
]

async function seed() {
  try {
    // ---- 1. 查找已有用户 ----
    const user = await User.findOne().lean()
    if (!user) {
      console.error('❌ 数据库中没有用户，请先注册一个账号')
      process.exit(1)
    }
    console.log(`✅ 找到用户: ${user.username} (${user._id})`)

    // ---- 2. 查找已有板块 ----
    const existingColumns = await Column.find().lean()
    if (existingColumns.length === 0) {
      console.log('⚠️  没有板块，创建默认板块…')
      await Column.insertMany([
        { name: 'Technology' },
        { name: 'Frontend' },
        { name: 'Backend' },
      ])
      console.log('✅ 已创建 Technology / Frontend / Backend 板块')
    }
    const columns = await Column.find().lean()
    const columnIds = columns.map((c) => c._id)
    console.log(`✅ 板块: ${columns.map((c) => c.name).join(', ')}`)

    // ---- 3. 清理旧文章 ----
    const deleteResult = await Article.deleteMany({})
    console.log(`🧹 已清理 ${deleteResult.deletedCount} 篇旧文章`)

    // ---- 4. 清理板块中的 articles 引用 ----
    await Column.updateMany({}, { $set: { articles: [] } })
    console.log('🧹 已清理板块文章引用')

    // ---- 5. 插入种子文章 ----
    const articlesToInsert = SEED_ARTICLES.map((a, i) => ({
      ...a,
      author: user._id,
      category: columnIds[i % columnIds.length], // 轮流分配到不同板块
      publishDate: new Date(Date.now() - (SEED_ARTICLES.length - i) * 86400000), // 每天一篇
      date: new Date(Date.now() - (SEED_ARTICLES.length - i) * 86400000),
    }))

    const inserted = await Article.insertMany(articlesToInsert)
    console.log(`✅ 成功插入 ${inserted.length} 篇文章`)

    // ---- 6. 更新板块的 articles 引用 ----
    for (const colId of columnIds) {
      const colArticles = inserted.filter((a) => a.category.equals(colId))
      if (colArticles.length > 0) {
        await Column.findByIdAndUpdate(colId, {
          $push: { articles: { $each: colArticles.map((a) => a._id) } },
          $set: { lastUpdated: new Date() },
        })
      }
    }
    console.log('✅ 板块文章引用已更新')

    // ---- 7. 汇总 ----
    console.log('\n📊 种子数据汇总:')
    console.log(`   用户: ${user.username} (${user._id})`)
    console.log(`   文章: ${inserted.length} 篇（均含 GitHub 链接，无封面图）`)
    const categories = columns.reduce((acc, c) => {
      acc[c.name] = inserted.filter((a) => a.category.equals(c._id)).length
      return acc
    }, {})
    console.log(`   板块分布: ${JSON.stringify(categories)}`)
  } catch (err) {
    console.error('❌ 执行失败:', err)
  } finally {
    await mongoose.disconnect()
    console.log('\n👋 数据库连接已关闭')
  }
}

seed()
