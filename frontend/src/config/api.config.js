export default {
  // ── auth ──
  'login': {
    url: '/auth/login',
    method: 'POST',
    rsaKey: 'password',
    setToken: true
  },
  'register': {
    url: '/auth/register',
    method: 'POST',
    rsaKey: 'password',
    setToken: true
  },

  // ── profile ──
  'getProfile': {
    url: '/api/profile',
    method: 'GET',
    noMessage: true
  },
  'updateProfile': {
    url: '/api/profile',
    method: 'PUT',
    rsaKey: ['password', 'oldPassword']
  },

  // ── resource CRUD ──
  'createResource': {
    url: '/api/rest/{resource}',
    method: 'POST'
  },
  'queryResourceList': {
    url: '/api/rest/{resource}',
    method: 'GET'
  },
  'queryResourceDetail': {
    url: '/api/rest/{resource}/{id}',
    method: 'GET'
  },
  'updateResource': {
    url: '/api/rest/{resource}/{id}',
    method: 'PUT'
  },
  'deleteResource': {
    url: '/api/rest/{resource}/{id}',
    method: 'DELETE'
  },

  // ── articles ──
  'searchArticles': {
    url: '/articles/search',
    method: 'GET'
  },
  'getArticleReaction': {
    url: '/articles/likes/{id}',
    method: 'GET',
    noMessage: true
  },
  'likeArticle': {
    url: '/articles/likes/{id}',
    method: 'POST'
  },

  // ── comments ──
  'getArticleComments': {
    url: '/api/comments/article/{articleId}',
    method: 'GET',
    noMessage: true
  },
  'getCommentReplies': {
    url: '/api/comments/replies/{commentId}',
    method: 'GET',
    noMessage: true
  },
  'commentLike': {
    url: '/api/comments/like/{commentId}',
    method: 'POST'
  },

  // ── 留言墙 ──
  'getWallMessages': {
    url: '/api/wall/{userId}',
    method: 'GET',
    noMessage: true
  },
  'createWallMessage': {
    url: '/api/wall',
    method: 'POST'
  },
  'deleteWallMessage': {
    url: '/api/wall/{id}',
    method: 'DELETE'
  },

  // ── 用户公开资料（他人主页）──
  // ⚠ 这一条与 getProfile 的区别：它按 userId 取**别人**的公开档案，且**游客可读**
  //   （后端 app.js 的白名单放行了 GET /api/profile/:userId）。
  //   返回字段是后端挑过的白名单（_id/nickname/username/avatar/bio/socialLinks/friendLinks），
  //   **不含 email** —— 所以他人主页不能图省事去打通用 CRUD 的 /api/rest/users/:id。
  'getUserProfile': {
    url: '/api/profile/{userId}',
    method: 'GET',
    noMessage: true
  },

  // ── 时间线（「关于」页的展示内容）──
  // 读：按 userId 公开可读（后端 app.js 的白名单放行了 GET），
  //     没配置过返回 200 + 空结构而不是 404 —— 前端要区分「请求失败」与「还没配过」
  'getTimeline': {
    url: '/api/timeline/{userId}',
    method: 'GET',
    noMessage: true
  },
  // 写：整体覆盖式保存（后端按 owner 的唯一索引 upsert，一个用户只有一条时间线）
  'saveTimeline': {
    url: '/api/timeline',
    method: 'PUT'
  },

  // ── 管理端（管理导航里的三个页面）──
  // 权限全部在服务端判断（myapp/middleware/authz.js），这里只是接口清单：
  //   users  / status  admin+   用户列表、禁言封禁解禁（只能动等级更低的人）
  //   role   / delete  owner    任命管理员、注销账号（账号级操作只认站长）
  //   logs             admin+   最近操作记录
  'adminUserList': {
    url: '/api/admin/users',
    method: 'GET'
  },
  'adminSetStatus': {
    url: '/api/admin/users/{id}/status',
    method: 'PATCH'
  },
  'adminSetRole': {
    url: '/api/admin/users/{id}/role',
    method: 'PATCH'
  },
  // 站长重置他人密码：密码同样走 RSA（与登录/注册同一条管道），旧密码不需要
  'adminSetPassword': {
    url: '/api/admin/users/{id}/password',
    method: 'PATCH',
    rsaKey: 'password'
  },
  'adminDeleteUser': {
    url: '/api/admin/users/{id}',
    method: 'DELETE'
  },
  'adminLogList': {
    url: '/api/admin/logs',
    method: 'GET'
  },

  // ── upload ──
  // 秒传预检：用内容 hash 问服务端「有没有」，命中就不传文件体
  'uploadCheck': {
    url: '/upload/check',
    method: 'POST'
  },
  'upload': {
    url: '/upload/{classify}',
    method: 'POST'
  },

  // ── github ──
  'githubRepo': {
    url: '/api/github/repos/{owner}/{repo}',
    method: 'GET',
    noMessage: true
  },

  // ── keys ──
  'pubKey': {
    url: '/keys',
    method: 'GET'
  },

  // ── 内部：自动登录校验 ──
  'user': {
    url: '/index',
    method: 'GET'
  }
}
