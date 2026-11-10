<template>
  <!--
    聊天室末行：表情按钮 + 输入框 + 发送（纸飞机）
    与评论区的 CommentInput 共用同一个 EmojiPanel.vue，插入逻辑各自实现
    （这里是单行 input，取值/光标 API 与 textarea 不同）。
  -->
  <div class="blog-chat--foot">
    <span class="blog-emoji--wrap">
      <span
        class="blog-chat--tool"
        :class="{ 'is-active': showEmoji }"
        title="表情"
        @click="showEmoji = !showEmoji"
      >
        <i class="iconfont icon-biaoqing"></i>
      </span>
      <EmojiPanel :visible="showEmoji" @select="insertEmoji" @close="showEmoji = false" />
    </span>

    <el-input
      ref="input"
      v-model="content"
      class="blog-chat--input"
      placeholder="说点什么吧~"
      maxlength="200"
      :disabled="!connected"
      @keyup.enter.native="handleSend"
    ></el-input>

    <span
      class="blog-chat--send"
      :class="{ 'is-disabled': !canSend }"
      :title="connected ? '发送（Enter）' : '连接已断开'"
      @click="handleSend"
    >
      <i v-if="sending" class="el-icon-loading"></i>
      <i v-else class="el-icon-s-promotion"></i>
    </span>
  </div>
</template>

<script>
import { mapState, mapActions } from 'vuex'
import EmojiPanel from '@/components/base/EmojiPanel.vue'

export default {
  name: 'ChatInput',
  components: { EmojiPanel },
  data() {
    return {
      content: '',
      showEmoji: false
    }
  },
  computed: {
    ...mapState('chat', ['status', 'sending']),
    connected() {
      return this.status === 'open'
    },
    canSend() {
      return this.connected && !this.sending && Boolean(this.content.trim())
    }
  },
  methods: {
    ...mapActions('chat', ['send']),

    async handleSend(event) {
      // 中文输入法：按 Enter 是「确认候选词」，不是「发送」
      if (event && (event.isComposing || event.keyCode === 229)) return
      if (!this.canSend) {
        if (!this.connected) this.$toast.warning('连接已断开，请稍后重试')
        return
      }

      const ok = await this.send(this.content)
      if (ok) {
        this.content = ''
        this.showEmoji = false
      }
    },

    /**
     * 在光标处插入表情
     * ⚠ 必须手动插：v-model 只管值，不会维护光标 —— 直接 content += emoji
     *   会把表情加到末尾，用户在前半句打字时会很别扭。
     */
    insertEmoji(emoji) {
      const native = this.$refs.input && this.$refs.input.$refs.input
      if (!native) {
        this.content += emoji
        return
      }

      const start = native.selectionStart == null ? this.content.length : native.selectionStart
      const end = native.selectionEnd == null ? start : native.selectionEnd
      this.content = this.content.slice(0, start) + emoji + this.content.slice(end)

      this.$nextTick(() => {
        native.focus()
        const pos = start + emoji.length
        native.setSelectionRange(pos, pos)
      })
    }
  }
}
</script>
