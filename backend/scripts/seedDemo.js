/**
 * 演示数据 —— 账号 / 文章 / 评论 / 留言
 * =========================================================================
 * 用法：
 *   node scripts/seedDemo.js           写入演示数据（已存在就跳过，可重复执行）
 *   node scripts/seedDemo.js --reset   只删掉「示例」标记的文章、评论、留言与演示账号
 *
 * 造出来的账号（密码统一 Blog2024）：
 *   devuser1  站长    —— 原本就有的站长号，这里把密码重置为已知值，方便登录
 *   adm1234   管理员
 *   test01..test05  普通用户（林小满 / 陈默 / 苏晚 / 阿柚 / 周野）
 *
 * 数据归属（方便测权限）：
 *   12 篇文章分散在 7 个作者身上，站长 / 管理员 / 普通用户名下都有；
 *   评论同样如此，所以「管理员删普通用户评论」「站长删管理员评论」都有真实数据可点。
 *
 * ⚠ 演示文章统一打上 tags 里的「示例」标记 —— 这是 reset 的唯一依据，
 *   不要手动去掉，否则 --reset 会漏掉它们（或者反过来误删）。
 * ⚠ 密码走 RSA：User 的 setter 会先 decryptSync 再校验再加密，
 *   所以这里必须传 encryptSync(明文)，直接传明文会解密失败。
 */
const path = require('path')
process.chdir(path.resolve(__dirname, '..'))

const mongoose = require('mongoose')
const { encryptSync } = require('../core/util/util')
const config = require('../config')
const User = require('../models/User')
const Article = require('../models/Article')
const Comment = require('../models/Comment')
const WallMessage = require('../models/WallMessage')

const PASSWORD = 'Blog2024'
const SEED_TAG = '示例'
const DB = 'mongodb://127.0.0.1:27017/test_db'
const AVATAR = 'http://example.com/images/avator-wheel.jpg'

// 板块 _id 直接取 config.js 的固定字典（与前端 category.config.js 同源）
const CAT = Object.fromEntries(config.categories.map((c) => [c.name, c._id]))

// 封面图取 uploads/article 下已有的图，循环使用（都是本机静态资源，不依赖外网）
const COVERS = [
  'http://127.0.0.1:3000/article/bgc1_1784525744270.jpg',
  'http://127.0.0.1:3000/article/bgc1_1784526940717.jpg',
  'http://127.0.0.1:3000/article/bgc1_1784529913173.jpg',
  'http://127.0.0.1:3000/article/bgc1_1784703289736.jpg',
  'http://127.0.0.1:3000/article/bgc1_1785044811534.jpg',
  'http://127.0.0.1:3000/article/bgc1_1785045117495.jpg'
]

const ACCOUNTS = [
  { username: 'adm1234', nickname: '小柯', role: 'admin', bio: '写代码也写周报，管内容不管人。' },
  { username: 'test01', nickname: '林小满', role: 'user', bio: '前端开发，喜欢把复杂的东西讲简单。' },
  { username: 'test02', nickname: '陈默', role: 'user', bio: '远程工作者，白天写文档，晚上看云。' },
  { username: 'test03', nickname: '苏晚', role: 'user', bio: '写字的人，偶尔拍照。' },
  { username: 'test04', nickname: '阿柚', role: 'user', bio: '产品经理，正在学做饭。' },
  { username: 'test05', nickname: '周野', role: 'user', bio: '设计师，偏爱留白和灰。' }
]

// ===== 文章：12 篇，作者 / 板块 / 标签都铺开 =====
const ARTICLES = [
  {
    title: '用 Composition API 重写一个列表页，我踩到的四个坑',
    author: 'test01',
    cat: 'Technology',
    tags: ['Vue', '重构', '前端'],
    daysAgo: 2,
    viewNum: 386,
    likeNum: 42,
    html: `
<p>上个月把一个老列表页从 Options API 换成了 Composition API。功能没变，但写完之后回头看，真正花时间的不是改写本身，而是四件小事。</p>
<h2>一、状态拆得太碎</h2>
<p>一开始我把 loading、list、page、total 各写一个 ref，结果每个请求函数都要解构一堆东西。后来合成一个 reactive 对象，读起来顺很多。</p>
<h2>二、watch 的时机</h2>
<p>列表页要监听路由 query 变化重新拉数据。原来写在 created 里，改写后放在 setup 顶部，第一次进入页面会多发一次请求——加个 immediate 的判断就好了，但当时找了一会儿。</p>
<h2>三、解构会丢响应式</h2>
<p>从 reactive 里直接解构出来的值是普通变量，改它不会触发更新。这一点文档写过，但手写的时候还是会顺手写错。</p>
<h2>四、复用逻辑的边界</h2>
<p>抽 composable 很爽，但抽得太早就变成了「为了复用而复用」。我最后只抽了分页和请求两段，其余留在页面里。</p>
<p>结论：改写本身两天，找这些坑三天。但改完之后，同一个列表页加筛选条件只用了半小时。</p>`
  },
  {
    title: '在小城市远程工作的第三年',
    author: 'test02',
    cat: 'Life',
    tags: ['远程', '生活', '工作方式'],
    daysAgo: 5,
    viewNum: 512,
    likeNum: 67,
    html: `
<p>三年前的这个时候，我带着一台笔记本回到了老家。当时想的是「先试试半年」，结果一直做到了现在。</p>
<h2>好处比想象中具体</h2>
<ul>
<li>通勤从 70 分钟变成 0，这一项直接多出每天两小时；</li>
<li>房租是原来的四分之一，于是敢租一个带阳台的房子；</li>
<li>中午能自己做饭，一年下来体重反而降了。</li>
</ul>
<h2>代价也比想象中具体</h2>
<p>最难受的不是孤独，是「信息差」。公司里那些随口就能问到的上下文，远程要靠文档和会议补，补不齐就只能猜。</p>
<p>后来我们定了个笨办法：每个需求都写一页纸的背景，谁改了决策就在那页上加一行。半年后，这一页纸变成了团队最常打开的东西。</p>
<h2>还会继续吗</h2>
<p>会。但我现在每个月会回一次公司，待两天，只做一件事：跟人吃飯、聊天、听八卦。很多问题是在饭桌上解决的，不是在工作群里。</p>`
  },
  {
    title: '为什么我越来越喜欢写长文',
    author: 'test03',
    cat: 'Thoughts',
    tags: ['写作', '思考'],
    daysAgo: 8,
    viewNum: 274,
    likeNum: 31,
    html: `
<p>短内容让人上瘾，长文让人清醒。</p>
<p>写一条动态只要三十秒，写一篇长文要三个小时。但三十秒写出来的东西，往往也是三十秒想出来的；三个小时写出来的东西，会逼着我把逻辑走完一遍。</p>
<h2>写长文其实是在检查自己</h2>
<p>很多想法在脑子里是「通」的，落成句子就断了。断在哪里，说明哪里没想明白。这个过程不舒服，但很有用。</p>
<h2>不必给谁看</h2>
<p>我有一半的长文没有发出去。它们的作用不是传播，是让我把一件事想完整。发出去只是顺便。</p>
<p>如果你也在纠结要不要写，我的建议是：先写给自己，写完再决定要不要发。</p>`
  },
  {
    title: '《置身事内》读后：钱从哪来，花到哪去',
    author: 'test04',
    cat: 'Reading',
    tags: ['读书', '经济'],
    daysAgo: 12,
    viewNum: 431,
    likeNum: 55,
    html: `
<p>这本书最打动我的不是观点，而是它把「地方政府怎么运转」讲成了一件具体的事。</p>
<h2>理解地方政府的三条线</h2>
<p>收入从哪来、支出花在哪、债务怎么转。把这三条线捋清楚，很多看起来奇怪的现象就说得通了。</p>
<h2>几个印象深的点</h2>
<ul>
<li>土地不只是资产，还是融资工具；</li>
<li>招商引资的竞争，本质是税收和就业的竞争；</li>
<li>很多政策的效果，取决于地方怎么执行。</li>
</ul>
<p>书里有一句话我很喜欢：理解体制，不是为了评判，而是为了知道边界在哪里。</p>`
  },
  {
    title: '从 0 到 1 设计一个「收藏」功能',
    author: 'adm1234',
    cat: 'Product',
    tags: ['产品设计', '需求分析'],
    daysAgo: 15,
    viewNum: 623,
    likeNum: 88,
    html: `
<p>「收藏」看起来是最简单的功能之一：一个按钮，一张列表。真做起来，先要回答五个问题。</p>
<h2>一、收藏的是什么</h2>
<p>收藏文章、收藏评论、收藏别人的主页，是三种完全不同的东西。第一版我们只做文章，把范围压到最小。</p>
<h2>二、能不能分组</h2>
<p>能做，但第一版不做。分组意味着要设计「未分组」的默认状态、拖拽、重名，成本翻三倍，而使用频率很低。</p>
<h2>三、取消收藏放哪里</h2>
<p>放在列表里，不在详情页。用户想起来清理的时候，人在列表页。</p>
<h2>四、计数怎么算</h2>
<p>文章上的收藏数用冗余字段，收藏关系单独一张表。取消收藏时两边一起改，虽然有一致性风险，但读的性能更重要。</p>
<h2>五、空态写什么</h2>
<p>空态决定了用户会不会用第二次。我们写的是「还没收藏，看到好文章点右上角的书签」——比「暂无数据」有用得多。</p>`
  },
  {
    title: '界面留白：少即是多的三个误区',
    author: 'test05',
    cat: 'Design',
    tags: ['设计', '排版'],
    daysAgo: 18,
    viewNum: 198,
    likeNum: 24,
    html: `
<p>「留白」被说烂了，但真正做对的人不多。常见三个误区：</p>
<h2>误区一：留白 = 空</h2>
<p>留白不是把东西挪开，而是让剩下的东西有呼吸。判断标准是「看的时候眼睛累不累」，不是「空了多少」。</p>
<h2>误区二：所有间距都调大</h2>
<p>间距需要层级。全都调大等于没有层级。我一般用 4 的倍数做三档：8 / 16 / 32，只在分组之间用最大那档。</p>
<h2>误区三：留白是视觉的事</h2>
<p>它同时也是信息的事。删掉一半的说明文字，比加 8px 间距有用。</p>
<p>一句话：留白是为了让重要的东西更清楚，不是为了好看。</p>`
  },
  {
    title: '三个人做第一个版本，我们砍掉了 80% 的功能',
    author: 'devuser1',
    cat: 'Startup',
    tags: ['创业', 'MVP'],
    daysAgo: 22,
    viewNum: 845,
    likeNum: 132,
    html: `
<p>去年和两个朋友做了一个小工具。预算有限，时间有限，人只有三个，所以第一件事就是砍需求。</p>
<h2>怎么砍</h2>
<p>把所有想做的功能列出来，问一句：没有它，用户还能不能完成核心动作？不能的留下，能的全砍。</p>
<p>结果 30 个功能留下 6 个。砍完那一刻有点慌，觉得产品太单薄。上线之后发现，用户只用其中两个。</p>
<h2>砍完之后</h2>
<ul>
<li>两周上线，而不是两个月；</li>
<li>每个 bug 都能在一天内修完；</li>
<li>有人真的开始用，然后提了 40 条建议。</li>
</ul>
<p>那 40 条建议，就是我们第二版的路线图。第一版的价值不是功能，是让我们知道该做什么功能。</p>`
  },
  {
    title: '我常备的 12 个命令行小工具',
    author: 'test01',
    cat: 'Tools',
    tags: ['命令行', '效率'],
    daysAgo: 26,
    viewNum: 706,
    likeNum: 91,
    html: `
<p>不做工具测评，只说我自己每天真的会敲的那些。</p>
<h2>看文件和找东西</h2>
<pre><code>rg "关键字"        # 比 grep 快，且默认忽略 .gitignore
fd "文件名"        # find 的替代品，参数更好记
bat 文件           # cat 加高亮和行号</code></pre>
<h2>处理 JSON / 数据</h2>
<pre><code>jq '.data.list[] | .title'
yq '.services.web.image'</code></pre>
<h2>进程与端口</h2>
<pre><code>lsof -i :3000
htop</code></pre>
<p>最后一个是 tldr：忘了参数怎么写的时候，<code>tldr tar</code> 比 <code>man tar</code> 快十倍。</p>`
  },
  {
    title: '杂记：关于早睡这件事',
    author: 'test02',
    cat: 'Misc',
    tags: ['随笔'],
    daysAgo: 30,
    viewNum: 156,
    likeNum: 12,
    html: `
<p>试过很多办法，最后有用的只有一条：把手机放到另一个房间。</p>
<p>所有「早点睡」的技巧——褪黑素、白噪音、助眠播客——都不如物理隔离。因为晚睡的原因从来不是睡不着，是不想结束这一天。</p>
<p>白天过得太赶，晚上就想多留一点属于自己的时间。这件事靠自律解决不了，得靠白天少安排一件事。</p>
<p>最近把一个会挪到了早上，晚上那两小时突然就不那么珍贵了。十一点半能睡着。</p>`
  },
  {
    title: 'Vuex 还是 Pinia？一次真实项目的迁移记录',
    author: 'adm1234',
    cat: 'Technology',
    tags: ['Vue', '状态管理', '迁移'],
    daysAgo: 34,
    viewNum: 934,
    likeNum: 118,
    html: `
<p>项目是 Vue 2 + Vuex 3，一共 9 个 module。迁 Pinia 花了三天，下面是被问得最多的几个问题。</p>
<h2>值不值得迁</h2>
<p>如果项目还在活跃开发，值得。Pinia 的类型推导和 module 拆分体验明显更好，尤其是 TS 项目。</p>
<h2>怎么迁</h2>
<ul>
<li>先装 pinia，让两个状态库并存；</li>
<li>一个 module 一个 module 地搬，搬完就把旧 module 从 Vuex 里删掉；</li>
<li>最后换掉 main.js 里的 use(Vuex)。</li>
</ul>
<h2>踩到的坑</h2>
<p>最大的问题是 <code>this.$store</code> 的调用点太多。我们写了个兼容层，把 <code>this.$store.getters.xxx</code> 映射到新 store，改完再慢慢清理。</p>
<p>三天里有一天半在改调用点，真正搬逻辑只有一天。</p>`
  },
  {
    title: '周末去山里住了两天',
    author: 'test03',
    cat: 'Life',
    tags: ['旅行', '随笔'],
    daysAgo: 40,
    viewNum: 289,
    likeNum: 37,
    html: `
<p>没有信号的第二天，我才发现自己一直在摸口袋。</p>
<p>住的地方在半山腰，一间很旧的房子，窗户对着一片竹林。晚上很黑，黑到能看见星星。</p>
<h2>两件小事</h2>
<p>一是早上被鸟叫醒，不是被闹钟。醒来那一刻有点恍惚，不知道几点了，也不着急知道。</p>
<p>二是走了四十分钟山路，只为看一眼传说中的瀑布。到了发现水很小，但我们坐在石头上聊了一个小时，比瀑布好看。</p>
<p>回来之后没有「焕然一新」的感觉，只是睡得好了几天。</p>`
  },
  {
    title: '读《人月神话》：为什么加人反而更慢',
    author: 'test05',
    cat: 'Reading',
    tags: ['读书', '团队'],
    daysAgo: 46,
    viewNum: 402,
    likeNum: 49,
    html: `
<p>这本书写于 1975 年，但里面那些「反直觉」的结论，现在依然成立。</p>
<h2>核心那句</h2>
<p>「向进度落后的项目中增加人力，只会让它更落后。」原因有两个：沟通成本随人数平方增长；新人需要时间学习，这段时间里老人也被拖慢。</p>
<h2>我的体会</h2>
<p>带过一个小项目，临上线缺人，加了两个同事。结果一周里我有一半时间在讲背景，上线还是延了三天。当时觉得是他们不熟，现在明白是结构问题。</p>
<h2>那该怎么办</h2>
<p>书里的建议是：把任务拆到可以并行、又不依赖太多上下文。说白了，先想清楚边界，再谈加人。</p>`
  }
]

// ===== 评论：[文章标题关键词, 作者, 内容, 距今天数, 回复] =====
const COMMENTS = [
  ['Composition API', 'test02', '第三条我踩过，解构之后页面不更新，找了半小时才想起来是响应式丢了。', 1, [
    ['test01', 'test02', '对，我现在干脆不解构，写 store.xxx 麻烦一点但不会错。']
  ]],
  ['Composition API', 'adm1234', '抽 composable 的边界确实难，我们的经验是「第二个页面要用的时候再抽」。', 1, []],
  ['Composition API', 'test05', '请问分页那段抽出来的 composable 大概多少行？', 0, [
    ['test01', 'test05', '不到 40 行，主要是请求 + 页码 + 是否还有更多。']
  ]],

  ['远程工作', 'test03', '「信息差」那段太真实了，我们也是靠一页纸的背景文档撑过来的。', 3, []],
  ['远程工作', 'test04', '每月回一次公司这条我记下了，远程最缺的就是非正式沟通。', 2, [
    ['test02', 'test04', '对，很多决策是在茶水间定下来的，不在会议里。']
  ]],

  ['写长文', 'test01', '「写长文其实是在检查自己」这句说得好，我写文档也是这个感觉。', 6, []],
  ['写长文', 'test05', '一半不发出去，这个比例比我想的高，但也合理。', 5, []],

  ['置身事内', 'test02', '这本书我也在看，土地财政那章讲得最清楚。', 10, []],
  ['置身事内', 'adm1234', '推荐接着看《大国大城》，视角可以互补。', 9, []],

  ['收藏', 'test01', '「取消收藏放列表不放详情页」这个决策很对，我们上一次做反了，被用户吐槽。', 12, []],
  ['收藏', 'test04', '空态文案那段是干货，比「暂无数据」强太多。', 11, [
    ['adm1234', 'test04', '空态是我们改了五版才定下来的。']
  ]],
  ['收藏', 'test03', '不做分组是对的，第一版越简单越好。', 10, []],

  ['留白', 'test05', '三档间距这个做法我也在用，8/16/32 很好记。', 15, []],
  ['留白', 'test01', '「删掉一半说明文字比加间距有用」，这句我要贴到工位上。', 14, []],

  ['三个人', 'test02', '30 个砍到 6 个，这个决心不容易。', 20, []],
  ['三个人', 'adm1234', '砍需求最难的是说服自己，不是说服别人。', 19, [
    ['devuser1', 'adm1234', '同意，砍完那天我心里也没底，是上线之后才踏实的。']
  ]],

  ['命令行', 'test04', 'bat 和 fd 我一直在用，jq 还没上手，去试试。', 24, []],
  ['命令行', 'test05', 'tldr 确实好用，比 man 快多了。', 23, []],

  ['早睡', 'test03', '「不想结束这一天」这个描述太准确了。', 28, []],

  ['Pinia', 'test01', '兼容层那段能不能展开讲讲？我们也在纠结要不要迁。', 30, [
    ['adm1234', 'test01', '就是把 getters 用 computed 包一层，调用点不用改，后面慢慢替换。']
  ]],
  ['Pinia', 'test02', '三条路径很清晰，收藏了。', 29, []],

  ['山里', 'test04', '没有信号才摸口袋，太真实了哈哈。', 35, []],
  ['山里', 'test01', '四十分钟山路换一小时聊天，值。', 34, []],

  ['人月神话', 'test03', '加人反而更慢，我们组最近就验证了一次。', 42, []],
  ['人月神话', 'adm1234', '拆到能并行又不依赖上下文，说起来容易做起来难。', 41, []]
]

// ===== 留言：板主 → [留言者, 内容, 回复] =====
const WALLS = [
  ['test01', [
    ['test02', '来踩踩，页面挺好看的。', [['test01', '谢谢！模板还在改。']]],
    ['test03', '收藏夹那个功能什么时候上？', []],
    ['adm1234', '文章质量不错，继续保持。', [['test01', '谢谢管理员~']]],
    ['test05', '路过留个脚印。', []]
  ]],
  ['test02', [
    ['test01', '远程那篇写得好，转给我们组看了。', []],
    ['test04', '下次回来一起吃个饭。', [['test02', '好啊，月底回。']]]
  ]],
  ['test03', [
    ['test05', '山里那组照片还有吗？想看。', []],
    ['test02', '写长文那篇我存下来了。', []]
  ]]
]

function daysAgo(n, hour = 10) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(hour, Math.floor(Math.random() * 50), 0, 0)
  return d
}

async function ensureUser(acc) {
  const exist = await User.findOne({ username: acc.username })
  if (exist) {
    // 已存在：只补昵称 / 简介 / 角色（不改密码，避免覆盖用户自己改过的）
    let dirty = false
    if (acc.nickname && exist.nickname !== acc.nickname) {
      exist.nickname = acc.nickname
      dirty = true
    }
    if (acc.bio && exist.bio !== acc.bio) {
      exist.bio = acc.bio
      dirty = true
    }
    if (acc.role && exist.role !== acc.role) {
      exist.role = acc.role
      dirty = true
    }
    if (!exist.avatar) {
      exist.avatar = AVATAR
      dirty = true
    }
    if (dirty) await exist.save()
    return exist
  }
  return User.create({
    username: acc.username,
    password: encryptSync(PASSWORD),
    nickname: acc.nickname,
    avatar: AVATAR,
    bio: acc.bio,
    role: acc.role || 'user'
  })
}

async function resetOwnerPassword() {
  const owner = await User.findOne({ username: 'devuser1' })
  if (!owner) return null
  owner.password = encryptSync(PASSWORD)
  if (!owner.nickname || owner.nickname === 'devuser1') owner.nickname = '站长'
  if (!owner.avatar) owner.avatar = AVATAR
  await owner.save()
  return owner
}

async function reset() {
  const articles = await Article.find({ tags: SEED_TAG }).select('_id').lean()
  const ids = articles.map((a) => a._id)
  const cmts = await Comment.find({ article: { $in: ids } }).select('_id').lean()
  const cmtIds = cmts.map((c) => c._id)
  await Comment.deleteMany({ $or: [{ article: { $in: ids } }, { parentComment: { $in: cmtIds } }] })
  await Article.deleteMany({ _id: { $in: ids } })
  const users = await User.find({ username: { $in: ACCOUNTS.map((a) => a.username) } }).select('_id').lean()
  const uids = users.map((u) => u._id)
  await WallMessage.deleteMany({ $or: [{ wall: { $in: uids } }, { author: { $in: uids } }] })
  await User.deleteMany({ _id: { $in: uids } })
  console.log(`已清理：文章 ${ids.length} 篇 / 评论 ${cmtIds.length} 条 / 演示账号 ${uids.length} 个`)
}

async function seed() {
  const existing = await Article.countDocuments({ tags: SEED_TAG })
  if (existing > 0) {
    console.log(`已有 ${existing} 篇示例文章，跳过写入。要重来请先执行：node scripts/seedDemo.js --reset`)
    return
  }

  // ① 账号
  const users = {}
  const owner = await resetOwnerPassword()
  if (owner) users[owner.username] = owner
  for (const acc of ACCOUNTS) {
    users[acc.username] = await ensureUser(acc)
  }
  console.log('账号就绪：', Object.keys(users).join(' / '))

  // ② 文章
  const created = []
  for (let i = 0; i < ARTICLES.length; i += 1) {
    const a = ARTICLES[i]
    const author = users[a.author]
    const doc = await Article.create({
      title: a.title,
      content: a.html,
      coverImage: COVERS[i % COVERS.length],
      tags: [...a.tags, SEED_TAG],
      category: CAT[a.cat],
      author: author._id,
      viewNum: a.viewNum,
      likeNum: a.likeNum,
      dislikeNum: Math.floor(a.likeNum / 8),
      commentNum: 0,
      publishDate: daysAgo(a.daysAgo),
      date: daysAgo(a.daysAgo)
    })
    created.push({ doc, title: a.title })
  }
  console.log(`文章写入 ${created.length} 篇`)

  // ③ 评论：先按标题关键词找到文章，再写顶层评论与（可选的）一条回复
  let cmtCount = 0
  for (const [keyword, who, text, ago, replies] of COMMENTS) {
    const target = created.find((c) => c.title.includes(keyword))
    if (!target || !users[who]) continue

    const top = await Comment.create({
      content: text,
      author: users[who]._id,
      article: target.doc._id,
      parentComment: null,
      commentTime: daysAgo(ago, 14),
      date: daysAgo(ago, 14),
      likeNum: Math.floor(Math.random() * 12),
      ipLocation: '广东'
    })
    const ids = [top._id]
    cmtCount += 1

    for (const [rWho, rText] of replies) {
      if (!users[rWho]) continue
      const reply = await Comment.create({
        content: rText,
        author: users[rWho]._id,
        article: target.doc._id,
        parentComment: top._id,
        replyTo: users[who]._id,
        commentTime: daysAgo(Math.max(0, ago - 1), 16),
        date: daysAgo(Math.max(0, ago - 1), 16),
        ipLocation: '广东'
      })
      ids.push(reply._id)
      cmtCount += 1
    }

    await Article.updateOne(
      { _id: target.doc._id },
      { $inc: { commentNum: ids.length }, $push: { comments: { $each: ids } } }
    )
  }
  console.log(`评论写入 ${cmtCount} 条（含回复）`)

  // ④ 留言
  let wallCount = 0
  for (const [wallName, list] of WALLS) {
    const wallUser = users[wallName]
    if (!wallUser) continue
    for (const [who, text, replies] of list) {
      if (!users[who]) continue
      const top = await WallMessage.create({
        content: text,
        wall: wallUser._id,
        author: users[who]._id,
        parentMessage: null,
        createTime: daysAgo(3, 12)
      })
      wallCount += 1
      for (const [rWho, rText] of replies) {
        if (!users[rWho]) continue
        await WallMessage.create({
          content: rText,
          wall: wallUser._id,
          author: users[rWho]._id,
          parentMessage: top._id,
          replyTo: users[who]._id,
          createTime: daysAgo(2, 18)
        })
        wallCount += 1
      }
    }
  }
  console.log(`留言写入 ${wallCount} 条（含回复）`)

  console.log('\n===== 测试账号（密码统一 ' + PASSWORD + '）=====')
  console.log('  devuser1   站长')
  console.log('  adm1234    管理员')
  console.log('  test01     普通用户 · 林小满')
  console.log('  test02     普通用户 · 陈默')
  console.log('  test03     普通用户 · 苏晚')
  console.log('  test04     普通用户 · 阿柚')
  console.log('  test05     普通用户 · 周野')
  console.log('\n⚠ 文章 / 评论都打了「示例」标签；清掉它们：node scripts/seedDemo.js --reset')
}

;(async () => {
  await mongoose.connect(DB, { useUnifiedTopology: true, useNewUrlParser: true })
  try {
    if (process.argv.includes('--reset')) {
      await reset()
    } else {
      await seed()
    }
  } finally {
    await mongoose.disconnect()
  }
  process.exit(0)
})().catch((err) => {
  console.error('写入失败：', err)
  process.exit(1)
})
