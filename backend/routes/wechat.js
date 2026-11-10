/**
 * 微信二维码重定向路由
 *
 * 用途：扫码后打开的 HTTP 页面 → 重定向到 weixin://contacts/profile/{wechatId}
 *      微信内置浏览器支持 weixin:// scheme，可以直接跳转到联系人资料页
 *
 * 流程：
 *   用户扫描二维码（含 https://blog.com/wechat/redirect?to=wxid_xxx）
 *   → 微信内置浏览器打开此路由
 *   → HTML meta refresh + JS 双重跳转到 weixin://contacts/profile/wxid_xxx
 *   → 微信识别 scheme → 打开联系人资料页
 */
const express = require('express')
const router = express.Router()

router.get('/redirect', (req, res) => {
  const wechatId = (req.query.to || '').trim()
  if (!wechatId) return res.status(400).send('缺少微信号参数')

  const wechatUrl = 'weixin://contacts/profile/' + encodeURIComponent(wechatId)

  res.send(`<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=${wechatUrl}">
  <title>跳转到微信</title>
  <style>
    body { font-family: sans-serif; text-align: center; padding-top: 60px; color: #333; }
    .tip { color: #999; font-size: 14px; margin-top: 20px; }
  </style>
</head>
<body>
  <p>正在跳转到微信…</p>
  <p class="tip">如果没有自动跳转，请点击下方链接</p>
  <p><a href="${wechatUrl}" style="color: #68AEF4;">打开微信添加好友</a></p>
  <script>
    window.location.href = '${wechatUrl}'
  </script>
</body>
</html>`)
})

module.exports = router
