<template>
  <!--
    注册用户列表（行2 左侧，比右侧聊天区窄）
    数据：store.chat.users —— 后端已按「在线 → 勿扰 → 离线」排好序，这里不再重排
  -->
  <div class="blog-chat--aside">
    <div class="blog-chat--aside_head">
      <span class="blog-chat--aside_title">注册用户</span>
      <span class="blog-chat--aside_count">{{ onlineCount }} 人在线</span>
    </div>

    <div class="blog-chat--aside_list">
      <ChatUserItem v-for="user in users" :key="user._id" :user="user" />
      <div v-if="!users.length" class="blog-chat--aside_empty">暂无用户</div>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import ChatUserItem from './ChatUserItem.vue'

export default {
  name: 'ChatUserList',
  components: { ChatUserItem },
  computed: {
    ...mapState('chat', ['users']),
    ...mapGetters('chat', ['onlineCount'])
  }
}
</script>
