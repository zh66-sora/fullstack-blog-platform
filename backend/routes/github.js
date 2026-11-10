/**
 * github.js — GitHub API 代理路由
 * =========================================================================
 * 职责：代理前端对 GitHub API 的请求，解决浏览器 CORS 限制
 *
 * 问题描述：
 *   - 浏览器直接请求 api.github.com 会因跨域限制被拒绝
 *   - 通过后端转发，浏览器只需请求同源路径 /api/github/repos/...
 *
 * 路由：
 *   GET /api/github/repos/:owner/:repo  — 获取指定仓库的公开信息
 *
 * 执行流程：
 *   ① 接收 owner/repo 参数 → ② 向 api.github.com 发起 HTTPS 请求 →
 *   ③ 解析 JSON 响应 → ④ 返回给前端
 *
 * 设计说明：
 *   - 使用原生 https 模块而非 axios/request，减少依赖
 *   - User-Agent 设置为 'myBlog'，GitHub API 要求所有请求必须携带 User-Agent header
 *   - 错误处理：GitHub 非 200 → 透传状态码；网络不可达 → 502
 */
const router = require('express').Router()
const https = require('https')

router.get('/repos/:owner/:repo', (req, res, next) => {
  const { owner, repo } = req.params

  // ① 构造 GitHub API 请求配置
  const opts = {
    hostname: 'api.github.com',
    path: `/repos/${owner}/${repo}`,
    method: 'GET',
    headers: {
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'myBlog', // GitHub API 要求必须设置 User-Agent
    },
  }

  // ② 发起 HTTPS 请求
  const ghReq = https.request(opts, (ghRes) => {
    let body = ''
    ghRes.on('data', chunk => body += chunk)
    ghRes.on('end', () => {
      // ③ 非 200 状态码 → 透传 GitHub 的错误信息
      if (ghRes.statusCode !== 200) {
        return res.status(ghRes.statusCode).send({ message: 'GitHub API error' })
      }
      // ④ 解析 JSON 响应
      try {
        res.send({ data: JSON.parse(body) })
      } catch {
        res.send({ data: null })
      }
    })
  })

  // 网络不可达等异常 → 502 Bad Gateway
  ghReq.on('error', () => res.status(502).send({ message: 'GitHub unreachable' }))
  ghReq.end()
})

module.exports = router
