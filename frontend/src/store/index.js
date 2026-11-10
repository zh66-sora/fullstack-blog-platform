import Vue from 'vue'
import Vuex from 'vuex'
import modal from './modules/modal'
import http from './modules/http'
import theme from './modules/theme'
import article from './modules/article'
import search from './modules/search'
// 桌宠开关（「扩展功能」里那个）
import pet from './modules/pet'
// 聊天室（WebSocket 连接 + 消息流 + 用户列表）
import chat from './modules/chat'
// 他人主页：当前访问对象的 id 与它的公开资料（缓存，唯一真相仍在路由上）
import visit from './modules/visit'

Vue.use(Vuex)

export default new Vuex.Store({
  modules: {
    modal, http, theme, article, search, pet, chat, visit
  }
})