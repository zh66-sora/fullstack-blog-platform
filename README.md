# fullstack-blog-platform

个人博客全栈项目（前后端分离）。

- **前端** `frontend/`：Vue 2 + Vue CLI + Element UI + Vuex + Vue Router + socket.io-client
- **后端** `backend/`：Node + Express + MongoDB + Mongoose + Socket.IO + JWT(RSA)

## 功能

- 文章 / 评论 / 留言墙 / 时间线 / 聊天室 / Live2D 桌宠
- **全文搜索**：内存倒排索引 + jieba 中文分词 + BM25 排序 + 标题加权 + 高亮摘要；文章增删改增量更新 + 每日全量重建兜底
- **文件秒传**：内容 SHA-256 去重，同内容同分类只存一份，前端算 hash 预检命中即不传文件体
- **角色权限**：站长(owner) / 管理员(admin) / 普通用户(user)；禁言/封禁(7/15/30 天)、解禁、任命管理员、账号软删、操作审计日志

## 运行

```bash
# 后端（MongoDB 需先跑在 27017）
cd backend
npm install
npm start                 # 首次启动自动生成 auth/ 下的 RSA 密钥
# 空库初始化（按顺序；管理员账号与密码由运行者指定，不内置默认值）：
node scripts/createAdmin.js <用户名> <密码>
node scripts/seedKey.js
node scripts/seedFixedColumns.js
node scripts/seedVueNotes.js

# 前端
cd frontend
npm install
npm run serve             # 开发；npm run build 产出 dist
```

## 目录

```
backend/    Express 后端（app.js 入口，routes/ models/ plugins/ core/ middleware/ scripts/）
frontend/   Vue 前端（src/views src/components src/store src/config 等）
```

## 注意

- `auth/`（RSA 密钥，首次运行自动生成）、`uploads/`（用户上传文件）、`node_modules/`、`dist/` 均不入库
- 前端 `.env.production` 与后端 `config.js` 里的 `example.com` 是占位域名，部署时换成你自己的地址
