/**
 * chat 模块 — 聊天室的状态中枢
 * =========================================================================
 * 为什么消息/用户列表放 vuex 而不是组件里：
 *   WebSocket 连接是「登录即连、直到退出登录/关页面」的，**跟弹窗开关解绑**。
 *   消息可能在弹窗关着的时候到达（别人在说话），所以状态不能挂在弹窗组件上
 *   （弹窗用 destroy-on-close，一关就没了）。
 *
 * 与 utils/chatSocket.js 的分工：
 *   chatSocket 只管连接与收发；本模块在 bootstrap/connect 时把服务端事件桥接成
 *   下面的 mutations。桥接只挂一次（bound 标志），重复 connect 不会重复绑定。
 *
 * 备注（对某个用户的备注名）存 localStorage —— 复用项目已有的 `store` 包
 * （与 token / uid / petConfig 同一套），不上后端：它纯粹是「我个人视角的别名」。
 */
import store from 'store'
import {
  on,
  connect as openSocket,
  close as closeSocket,
  isConnected,
  isAuthError,
  sendMessage,
  loadHistory,
  setMyStatus
} from '@/utils/chatSocket'

const TOKEN_NAME = process.env.VUE_APP_BLOG_API_TOKEN_NAME
const UID_NAME = 'uid'
const REMARK_KEY = 'chatRemarks'
const MAX_CONTENT = 200

// 事件桥接只挂一次：bootstrap 与 connect 都可能被触发
let bound = false

function readRemarks() {
  const raw = store.get(REMARK_KEY)
  return raw && typeof raw === 'object' ? raw : {}
}

/**
 * socket 事件 → mutations 的桥接
 * @param {{commit: Function, dispatch: Function}} ctx 命名空间内的 action context
 */
function bindEvents({ commit, dispatch }) {
  if (bound) return
  bound = true

  on('connect', () => {
    commit('SET_ERROR', '')
    commit('SET_STATUS', 'open')
  })

  on('disconnect', (reason) => {
    // io client disconnect = 我们自己调的 close()（退出登录/被顶号），属正常收场
    commit('SET_STATUS', reason === 'io client disconnect' ? 'closed' : 'reconnecting')
  })

  on('connect_error', (err) => {
    const message = (err && err.message) || '连接失败'
    // 握手被拒（未登录/token 失效）：重连多少次都一样，直接停掉并提示
    if (isAuthError(message)) {
      closeSocket()
      commit('SET_STATUS', 'closed')
      commit('SET_ERROR', '登录状态已失效，请重新登录')
      return
    }
    commit('SET_STATUS', 'reconnecting')
    commit('SET_ERROR', message)
  })

  on('init', (data) => commit('INIT', data))
  on('message', (payload) => {
    if (payload && payload.message) commit('PUSH_MESSAGE', payload.message)
  })
  on('system', (payload) => {
    if (payload && payload.text) commit('PUSH_SYSTEM', payload)
  })
  on('users', (users) => commit('SET_USERS', users))
  on('kicked', () => dispatch('kicked'))
}

export default {
  namespaced: true,

  state: {
    // 弹窗开关
    visible: false,
    // closed | open | reconnecting
    status: 'closed',
    errorMessage: '',
    // 我自己的用户信息（服务端握手时回传）
    me: null,
    // 全部注册用户 + 实时状态（后端已按 在线 → 勿扰 → 离线 排好序）
    users: [],
    // 消息流（正序）。两种形态混排，靠 kind 区分：
    //   { kind: 'text',   _id, content, date, author: {...} }
    //   { kind: 'system', id, text, date }
    messages: [],
    // 还有更早的历史（上滑懒加载用）
    hasMore: true,
    loadingMore: false,
    sending: false,
    // 我自己的状态：online | dnd（offline 由连接状态决定，不在这里）
    myStatus: 'online',
    // { [uid]: 备注名 }
    remarks: readRemarks()
  },

  getters: {
    myId: (state) => (state.me ? state.me._id : ''),
    onlineCount: (state) => state.users.filter((u) => u.status !== 'offline').length,
    // 显示名：备注 > 昵称 > 用户名 > 匿名（与后端 displayName 口径一致）
    nameOf: (state) => (user) => {
      if (!user) return '匿名'
      return state.remarks[user._id] || user.nickname || user.username || '匿名'
    },
    // 这条消息是不是我发的（决定气泡在左还是在右、以及滑入方向）
    // author 正常是 populate 后的对象，兜底兼容只存了 id 字符串的情况
    isMine: (state) => (item) => {
      if (!state.me || !item || !item.author) return false
      const authorId = item.author._id || item.author
      return String(authorId) === state.me._id
    }
  },

  mutations: {
    SET_VISIBLE(state, visible) {
      state.visible = visible
    },
    SET_STATUS(state, status) {
      state.status = status
    },
    SET_ERROR(state, message) {
      state.errorMessage = message
    },
    SET_USERS(state, users) {
      state.users = Array.isArray(users) ? users : []
    },
    SET_MESSAGES(state, list) {
      state.messages = (list || []).map((m) => ({ kind: 'text', ...m }))
    },
    INIT(state, data) {
      if (!data) return
      state.me = data.me || null
      state.users = Array.isArray(data.users) ? data.users : []
      state.messages = (data.list || []).map((m) => ({ kind: 'text', ...m }))
      state.hasMore = Boolean(data.hasMore)
      state.myStatus = 'online'
    },
    PUSH_MESSAGE(state, message) {
      state.messages.push({ kind: 'text', ...message })
    },
    PUSH_SYSTEM(state, payload) {
      state.messages.push({
        kind: 'system',
        id: `${payload.kind}-${payload.date}-${state.messages.length}`,
        text: payload.text,
        date: payload.date || Date.now()
      })
    },
    PREPEND_MESSAGES(state, data) {
      const list = (data.list || []).map((m) => ({ kind: 'text', ...m }))
      state.messages = list.concat(state.messages)
      state.hasMore = Boolean(data.hasMore)
    },
    SET_HAS_MORE(state, hasMore) {
      state.hasMore = hasMore
    },
    SET_LOADING_MORE(state, loading) {
      state.loadingMore = loading
    },
    SET_SENDING(state, sending) {
      state.sending = sending
    },
    SET_MY_STATUS(state, status) {
      state.myStatus = status
    },
    CLEAR_MESSAGES(state) {
      state.messages = []
      // 清屏后不再自动翻回历史（否则滚到顶会立刻把清掉的内容拉回来）；
      // 关掉弹窗再打开会走 refresh → 重新拉最近一页
      state.hasMore = false
    },
    SET_REMARKS(state, remarks) {
      state.remarks = remarks
    },
    RESET(state) {
      state.me = null
      state.users = []
      state.messages = []
      state.hasMore = true
      state.loadingMore = false
      state.sending = false
      state.myStatus = 'online'
    }
  },

  actions: {
    /** 应用启动时调一次：绑定事件 + 若本地已有 token 就连接 */
    bootstrap(ctx) {
      bindEvents(ctx)
      if (ctx.rootGetters['http/isLogin']) ctx.dispatch('connect')
    },

    /** 登录成功后 / bootstrap 时调用 */
    connect(ctx) {
      bindEvents(ctx)
      const token = this.state.http.token || store.get(TOKEN_NAME)
      if (!token) return
      ctx.commit('SET_ERROR', '')
      ctx.commit('SET_STATUS', isConnected() ? 'open' : 'reconnecting')
      openSocket(token)
    },

    /** 主动退出登录 */
    disconnect({ commit, dispatch }) {
      closeSocket()
      commit('SET_STATUS', 'closed')
      commit('SET_VISIBLE', false)
      dispatch('reset')
    },

    /**
     * 被顶号（需求 4）：toast 提示 + 强制退出登录
     * 服务端已经把我们断开了（io server disconnect），这里只做本地收尾
     */
    kicked({ commit, dispatch }) {
      const vm = this.$vm
      if (vm && vm.$toast) vm.$toast.error('该账号已在其他地方登录，你已被挤下线')

      closeSocket()
      commit('SET_STATUS', 'closed')
      commit('SET_VISIBLE', false)

      store.remove(TOKEN_NAME)
      store.remove(UID_NAME)
      commit('http/SET_TOKEN', '', { root: true })
      commit('http/SET_USERINFO', {}, { root: true })
      dispatch('reset')

      if (vm && vm.$route && vm.$route.name !== 'Index') {
        vm.$router.replace({ name: 'Index' }).catch(() => {})
      }
    },

    reset({ commit }) {
      commit('RESET')
    },

    /** 打开/关闭弹窗 —— 只切 visible，不碰连接 */
    open({ commit, dispatch, state }) {
      commit('SET_VISIBLE', true)
      // 上次清过屏（列表空但还连着）→ 重新拉最近一页，免得开着空窗
      if (!state.messages.length && isConnected()) dispatch('refresh')
    },
    close({ commit }) {
      commit('SET_VISIBLE', false)
    },

    /** 发送消息：服务端校验 + 落库，成功后由广播回显（不做乐观渲染，避免重复/错位） */
    async send({ commit }, content) {
      const vm = this.$vm
      const text = String(content == null ? '' : content).trim()
      if (!text) {
        if (vm && vm.$toast) vm.$toast.info('消息不能为空')
        return false
      }
      if (text.length > MAX_CONTENT) {
        if (vm && vm.$toast) vm.$toast.warning(`消息不能超过 ${MAX_CONTENT} 个字符`)
        return false
      }

      commit('SET_SENDING', true)
      const res = await sendMessage(text)
      commit('SET_SENDING', false)

      if (!res.ok) {
        if (vm && vm.$toast) vm.$toast.error(res.message || '消息发送失败')
        return false
      }
      return true
    },

    /** 上滑加载更早的一页；返回本次新增条数，供调用方补偿滚动位置 */
    async loadMore({ commit, state }) {
      if (!state.hasMore || state.loadingMore || !isConnected()) return { added: 0 }

      // 游标 = 当前最早的一条「文本消息」的 _id（系统提示行没有 _id）
      const earliest = state.messages.find((m) => m.kind === 'text')
      commit('SET_LOADING_MORE', true)
      const res = await loadHistory(earliest ? earliest._id : null)
      commit('SET_LOADING_MORE', false)

      if (!res.ok || !res.data) {
        if (res.message && this.$vm && this.$vm.$toast) this.$vm.$toast.error(res.message)
        return { added: 0 }
      }
      commit('PREPEND_MESSAGES', res.data)
      return { added: res.data.list.length }
    },

    /** 重新拉最近一页（清屏后重开弹窗用） */
    async refresh({ commit }) {
      if (!isConnected()) return
      const res = await loadHistory(null)
      if (!res.ok || !res.data) return
      commit('SET_MESSAGES', res.data.list)
      commit('SET_HAS_MORE', res.data.hasMore)
    },

    /** 清屏：只清本地视图，不动服务端消息 */
    clearScreen({ commit }) {
      commit('CLEAR_MESSAGES')
      if (this.$vm && this.$vm.$toast) this.$vm.$toast.info('已清屏')
    },

    /** 切换勿扰（工具栏那个按钮）—— 状态会广播给所有人 */
    async toggleDnd({ commit, state }) {
      const next = state.myStatus === 'dnd' ? 'online' : 'dnd'
      const res = await setMyStatus(next)
      if (!res.ok) {
        if (this.$vm && this.$vm.$toast) this.$vm.$toast.error(res.message || '状态切换失败')
        return
      }
      commit('SET_MY_STATUS', next)
    },

    /** 保存对某人的备注（空字符串 = 删除备注） */
    saveRemark({ commit, state }, { uid, remark }) {
      if (!uid) return
      const text = String(remark || '').trim().slice(0, 20)
      const next = { ...state.remarks }
      if (text) next[uid] = text
      else delete next[uid]

      commit('SET_REMARKS', next)
      store.set(REMARK_KEY, next)
    }
  }
}
