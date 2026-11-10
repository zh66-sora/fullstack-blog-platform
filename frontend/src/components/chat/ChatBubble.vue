<template>
  <!--
    单条消息气泡
      他人 → 左侧：头像在左，白底描边气泡
      自己 → 右侧：头像在右，主题色实底 + 白字
    布局靠 .is-mine 用 flex-direction: row-reverse 翻转，不复制一套的结构。
  -->
  <div class="blog-chat--bubble_row" :class="mine ? 'is-mine' : 'is-other'">
    <!--
      头像 → 进说话人的主页（他人主页的入口之一）
      ⚠ 这里传的是 `author` 原对象（聊天室里的形态是 `{ _id, nickname, avatar }`），
         normalizeUser 认得；不要传 `name`（那是「我对他的备注」，不是真实昵称）。
    -->
    <UserLink class="blog-chat--bubble_avatar" :user="author" size="xs" />

    <div class="blog-chat--bubble_box">
      <div class="blog-chat--bubble_meta">
        <!-- 自己的气泡不重复显示自己的名字（列表里就一个「我」） -->
        <span v-if="!mine" class="blog-chat--bubble_name">{{ name }}</span>
        <span class="blog-chat--bubble_time">{{ time }}</span>
      </div>
      <!-- 纯文本渲染（v-text 语义），不用 v-html：消息内容来自其他用户，防 XSS -->
      <div class="blog-chat--bubble">{{ item.content }}</div>
    </div>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex'
import { formatChatTime } from '@/utils/chatUtils'
// 头像 → 进说话人的主页（他人主页的入口之一）
import UserLink from '@/components/user/UserLink.vue'

const DEFAULT_AVATAR = require('@/assets/images/avator-default.jpg')

export default {
  name: 'ChatBubble',
  components: { UserLink },
  props: {
    item: { type: Object, required: true }
  },
  computed: {
    ...mapState('chat', ['me']),
    ...mapGetters('chat', ['isMine', 'nameOf']),
    mine() {
      return this.isMine(this.item)
    },
    author() {
      return this.item.author || {}
    },
    avatar() {
      return this.author.avatar || DEFAULT_AVATAR
    },
    name() {
      return this.nameOf(this.author)
    },
    time() {
      return formatChatTime(this.item.date)
    }
  }
}
</script>
