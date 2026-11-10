<template>
  <!--
    GitHub 仓库卡片（迁移自原项目 app/components/githubCard.js + src/template/githubCard.hbs）
    四种状态：
      ① hidden  作者没填 github 链接 → 整块不渲染
      ② loading 请求进行中          → 「卡片加载中…」
      ③ error   请求失败            → 「连接错误」
      ④ ready   拿到仓库信息        → 毛玻璃卡片
    ②③④ 共用一个容器，靠 min-height 锁住高度 —— 从「卡片加载中」切到真实卡片时
    整张卡片高度不变，详情页下面的正文不会被顶上顶下。
  -->
  <div v-if="state !== 'hidden'" class="blog-article--githubCard">
    <!-- ④ 已拿到仓库信息 -->
    <a
      v-if="state === 'ready'"
      :href="url"
      target="_blank"
      class="gh-card-link"
    >
      <div class="gh-card-header">
        <span class="gh-card-name">
          <i class="iconfont icon-github"></i>{{ repo.full_name }}
        </span>
      </div>
      <div class="gh-card-desc">{{ repo.description }}</div>
      <div class="gh-card-meta">
        <span v-if="repo.language" class="gh-stat"
          ><i class="gh-dot"></i>{{ repo.language }}</span
        >
        <span v-if="repo.hasStars" class="gh-stat"
          ><i>★</i>{{ repo.stars }}</span
        >
        <span v-if="repo.hasForks" class="gh-stat"
          ><i>⑂</i>{{ repo.forks }}</span
        >
      </div>
    </a>

    <!-- ②③ 加载中 / 连接错误（is-loading 只影响文字动画，不改文案也不改高度） -->
    <p
      v-else
      class="gh-card-placeholder"
      :class="{ 'is-loading': state === 'loading' }"
    >
      {{ placeholder }}
    </p>
  </div>
</template>

<script>
/**
 * 从 GitHub URL 解析 owner / repo
 * 支持 https://github.com/owner/repo、带 .git 后缀、以及 /issues/1 这类后续路径
 * （与原项目 app/components/githubCard.js 的 parseGitHubUrl 一致）
 *
 * @param {string} url
 * @returns {{ owner: string, repo: string } | null}
 */
function parseGithubUrl(url) {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+)\/([^/\s?#]+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

export default {
  name: "GitHubCard",
  props: {
    // 文章的 gitHubUrl，空字符串表示作者没设置
    url: {
      type: String,
      default: "",
    },
  },
  data() {
    return {
      // 'hidden' 没填链接（整块不渲染）| 'loading' 请求中 | 'error' 请求失败 | 'ready' 已拿到数据
      state: "hidden",
      repo: null,
    };
  },
  computed: {
    // 只有 loading / error 会用到占位文案（ready 渲染真实卡片、hidden 不渲染）
    placeholder() {
      return this.state === "loading" ? "卡片加载中…" : "连接错误";
    },
  },
  watch: {
    // 详情页之间互跳（/article/A → /article/B）时本组件会被复用，
    // 所以要盯着 url 重新取数；immediate 让首次挂载也会跑一遍
    url: {
      immediate: true,
      handler() {
        this.load();
      },
    },
  },
  methods: {
    // 取仓库信息：走后端代理，避免前端直连 GitHub API 被跨域拦住
    async load() {
      this.repo = null;
      const parsed = parseGithubUrl(this.url);

      // ① 作者没填链接 → 整块隐藏（不发请求、也不占位）
      if (!parsed) {
        this.state = "hidden";
        return;
      }

      // ② 请求中
      this.state = "loading";
      try {
        const res = await this.$api({
          type: "githubRepo",
          params: { owner: parsed.owner, repo: parsed.repo },
        });
        const data = res?.data;
        // 没拿到数据（接口被限流、仓库不存在等）同样算连接失败
        if (!data) {
          this.state = "error";
          return;
        }
        // 拼接请求成功时的数据结构
        this.repo = {
          full_name: data.full_name,
          description: data.description || "",
          language: data.language || "",
          stars: data.stargazers_count ?? 0,
          forks: data.forks_count ?? 0,
          hasStars: data.stargazers_count != null,
          hasForks: data.forks_count != null,
        };
        // ④ 更新成功状态
        this.state = "ready";
      } catch (err) {
        // ③ 失败（超时 / 网络错误）
        this.state = "error";
      }
    },
  },
};
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// ============================================================
// GitHub 仓库卡片
// 迁移自原项目 src/styl/article.styl 的 .blog-article--githubCard 一节
//
// ⚠ 本文件所有声明统一写成「属性: 值」的带冒号形式。
// Stylus 对「无冒号 + 值是多段」的声明有歧义：紧跟缩进更深的嵌套块时
// 会被当成选择器解析、整条静默丢失（详见 component.styl 顶部说明）。
//
// ⚠⚠ 尺寸约束：loading / error / ready 三态高度必须都是 162px（min-height 锁住），
//   所以下面所有装饰都只用「绝对定位的伪元素」和「不改变高度的属性」
//   （背景、边框、阴影、颜色、水平内边距）。改样式时别引入垂直方向的 padding /
//   border / margin，也别改字号行高，否则卡片会变高、详情页会跳。
//   颜色的 rgba 值都取自 themes.styl 的主题色（注释里标了来源），不引新色系。
// ============================================================

.blog-article--githubCard
  position: relative
  // 纵向 flex：占位文案靠 margin:auto 居中，真实卡片自然从顶部铺开
  display: flex
  flex-direction: column
  // ⚠ loading / error / ready 共用的固定高度（真实卡片自然高度 161.19px 向上取整）
  min-height: 162px
  border-radius: $theme-radius.lg
  box-sizing: border-box
  padding: $theme-spacing.lg
  // 玻璃边缘用亮色而不是灰线，才有"一块玻璃盖在页面上"的感觉
  border: 1px solid rgba(255, 255, 255, 0.75)
  // 上下都留 24px，与信息行、正文各自拉开
  margin-bottom: $theme-spacing.lg
  // 玻璃本身：主题浅蓝的两段渐变（#E2F0FF → #C6E1FF 的半透明版本）
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.86) 0%,
    rgba(226, 240, 255, 0.62) 52%,
    rgba(198, 225, 255, 0.5) 100%
  )
  // 磨砂：blur 拉开背后内容的模糊度，saturate 提一点通透感
  backdrop-filter: blur(16px) saturate(180%)
  -webkit-backdrop-filter: blur(16px) saturate(180%)
  // 阴影三层：主题色外投影 + 上沿内高光 + 下沿内暗边，
  // 内高光是玻璃拟态的关键，没有它整块会显得是"贴纸"而不是"玻璃"
  // （外投影原来写死 rgba(104,174,244,0.1)，换色相后仍是蓝的 → 改成随主题派生）
  box-shadow: 0 4px 16px var(--theme-accent-mid),
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    inset 0 -1px 0 rgba(255, 255, 255, 0.45)
  color: var(--theme-font-light)
  // 裁掉右上角那团高光斑（下面 &::before）超出圆角的部分
  overflow: hidden
  transition: background 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease,
    transform 0.25s ease

  // 右上角一团柔光，给玻璃加"打光"的层次（绝对定位，不占尺寸）
  &::before
    position: absolute
    top: -46px
    right: -34px
    width: 132px
    height: 132px
    content: ''
    border-radius: 50%
    background: radial-gradient(
      circle,
      var(--theme-accent-ring) 0%,
      var(--theme-accent-none) 70%
    )
    pointer-events: none

  &:hover
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.94) 0%,
      rgba(222, 238, 255, 0.72) 52%,
      rgba(190, 220, 255, 0.6) 100%
    )
    border-color: var(--theme-accent-hi)
    box-shadow: 0 10px 28px var(--theme-accent-ring),
      inset 0 1px 0 rgba(255, 255, 255, 0.95),
      inset 0 -1px 0 rgba(255, 255, 255, 0.5)
    transform: translateY(-2px)

  // ===== ②③ 占位 =====
  .gh-card-placeholder
    // flex 容器里 margin:auto 就是水平垂直双居中
    margin: auto
    font-size: $theme-fz.sm
    color: var(--theme-font-trd)

  // 加载中：文字缓慢呼吸，暗示"正在请求"，不用额外加转圈元素（不占位、不改文案）
  .gh-card-placeholder.is-loading
    animation: gh-card-breath 1.4s ease-in-out infinite

  // ===== ④ 真实仓库卡片 =====
  .gh-card-link
    display: block
    width: 100%
    color: inherit
    text-decoration: none

  .gh-card-header
    position: relative
    display: flex
    justify-content: space-between
    align-items: center
    font-weight: 700
    font-size: $theme-fz.lg
    margin-bottom: $theme-spacing.sm

    // 标题与正文之间的分区线：渐隐的主题色细线。
    // 用绝对定位落在 8px 的 margin 里，不占高度，卡片总高不变。
    &::after
      position: absolute
      left: 0
      right: 0
      bottom: -4px
      height: 1px
      content: ''
      background: linear-gradient(
        to right,
        var(--theme-accent-hi) 0%,
        var(--theme-accent-mid) 62%,
        var(--theme-accent-none) 100%
      )

  // 仓库名保持单行：换行会让 header 变高，三态高度就不一致了
  .gh-card-name
    display: inline-flex
    align-items: center
    min-width: 0
    overflow: hidden
    text-overflow: ellipsis
    white-space: nowrap
    color: var(--theme-font-light)

    // 标题前的 GitHub 图标：给这一行一个视觉锚点（字体图标，不占额外高度）
    i
      margin-right: 6px
      font-size: 0.9em
      color: var(--theme-font-fst)

  .gh-card-desc
    font-size: $theme-fz.base
    line-height: 1.6
    margin-bottom: $theme-spacing.sm
    // 描述比标题浅一档，层次上退到第二层
    color: var(--theme-font-trd)
    // 固定占两行高度（1.6 × 2 = 3.2em）：描述只有一行甚至为空时卡片不会变矮，
    // 超过两行则截断 —— 两头都是为了锁住卡片高度
    min-height: 3.2em
    display: -webkit-box
    -webkit-line-clamp: 2
    -webkit-box-orient: vertical
    overflow: hidden

  .gh-card-meta
    display: flex
    align-items: center
    // 8px：比原来 12px 紧一点，配合下面的胶囊内边距才不至于散开
    gap: $theme-spacing.sm
    font-size: $theme-fz.sm
    // 语言/星数/分叉可能一个都没有，行高兜底同样是为了锁高度
    min-height: 1.5em

  // 元数据做成小胶囊，和数据主体（标题+描述）在形式上分开
  // ⚠ 只加水平内边距：垂直方向一加就会把卡片顶高
  .gh-stat
    display: inline-flex
    align-items: center
    gap: 4px
    height: 1.5em
    padding: 0 $theme-spacing.sm
    border-radius: 999px
    color: var(--theme-font-trd)
    background-color: rgba(255, 255, 255, 0.6)
    box-shadow: inset 0 0 0 1px var(--theme-accent-ring)

    i
      font-style: normal
      color: var(--theme-font-fst)
      display: inline-flex
      align-items: center

  .gh-dot
    width: 8px
    height: 8px
    border-radius: 50%
    background-color: var(--theme-font-fst)
    flex-shrink: 0

@keyframes gh-card-breath
  0%, 100%
    opacity: 0.5
  50%
    opacity: 1

// ============================================================
// 深色模式：把这块「亮玻璃」翻成暗玻璃
// ------------------------------------------------------------
// 这张卡的设计前提是「一块盖在页面上的亮玻璃」：底色是接近白的主题浅蓝渐变
// （还叠了 backdrop-filter），但里面的文字吃的是主题 token
// （--theme-font-light / --theme-font-trd）。深色模式下 token 变成浅色字，
// 压在浅色玻璃上 → 实测对比度 1.07，整块读不出来。
//
// 两种修法：① 把文字钉死成深色；② 把玻璃翻成暗色。
// 选 ②：文字继续跟着 token 走（只有一个来源），卡片也仍然是「玻璃」，
// 而不是深色页面上突兀贴一块白纸。
// ============================================================
:root[data-theme='dark'] .blog-article--githubCard
  // 玻璃本身：深蓝灰渐变（对应浅色那套的 #E2F0FF → #C6E1FF）
  border-color: rgba(255, 255, 255, 0.1)
  background: linear-gradient(
    135deg,
    rgba(54, 63, 75, 0.88) 0%,
    rgba(41, 51, 63, 0.68) 52%,
    rgba(33, 43, 55, 0.56) 100%
  )
  // 深色下内外高光都要压淡，否则玻璃上会浮一层白雾
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3),
    inset 0 1px 0 rgba(255, 255, 255, 0.08),
    inset 0 -1px 0 rgba(0, 0, 0, 0.2)

  // 右上角那团「打光」
  &::before
    background: radial-gradient(
      circle,
      var(--theme-accent-glow) 0%,
      var(--theme-accent-none) 70%
    )

  &:hover
    border-color: var(--theme-accent-hi)
    background: linear-gradient(
      135deg,
      rgba(62, 72, 86, 0.94) 0%,
      rgba(47, 58, 72, 0.74) 52%,
      rgba(37, 48, 61, 0.6) 100%
    )
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.38),
      inset 0 1px 0 rgba(255, 255, 255, 0.1),
      inset 0 -1px 0 rgba(0, 0, 0, 0.22)

  // 元数据小胶囊：浅色下是「白底胶囊」，深色下改成「半透明白 + 主题色细边」
  .gh-stat
    background-color: rgba(255, 255, 255, 0.08)
    box-shadow: inset 0 0 0 1px var(--theme-accent-ring)
</style>
