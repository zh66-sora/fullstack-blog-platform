<template>
  <!--
    聊天记录窗口（行2 右侧）
      · 文本消息 → 左右气泡（ChatBubble）
      · 系统提示 → 灰色小字（xx 加入了聊天室 / xx 离开了聊天室）
      · 上滑到顶 → 懒加载更早的一页（只到「最近一个月」为止）

    ⚠ 用原生 div + @scroll，不用 el-scrollbar：
      懒加载要在 scrollTop === 0 的那一瞬间判断，el-scrollbar 把真实滚动容器包在
      内部（.el-scrollbar__wrap），拿它的 scrollTop 要连跳两层 ref，得不偿失。
  -->
  <div class="blog-chat--main">
    <!-- 连接状态提示条（正常时不渲染） -->
    <div v-if="connectText" class="blog-chat--net" :class="`is-${status}`">
      <i v-if="status === 'reconnecting'" class="el-icon-loading"></i>
      {{ connectText }}
    </div>

    <div ref="scroller" class="blog-chat--scroll" @scroll="handleScroll">
      <!-- 顶部：懒加载指示 / 到底提示 -->
      <div class="blog-chat--more">
        <span v-if="loadingMore"><i class="el-icon-loading"></i> 正在加载更早的消息…</span>
        <span v-else-if="!hasMore && messages.length">— 没有更早的消息了 —</span>
      </div>

      <!--
        ⚠ 外面这层 div 不是为了布局，是为了拿到一个可靠的类名挂载点：
          Vue 2 的 <transition-group> 只把 transition 相关的 props 透传给子节点，
          写在它自己身上的 class 不保证落到生成的元素上。样式判据（.is-restoring）
          挂在外层 div 上，与框架行为无关。
      -->
      <div class="blog-chat--list" :class="{ 'is-restoring': restoring }">
        <!--
          transition-group：只有**新插入**的节点会走 enter 动画，首屏渲染不会
          （Vue 的 appear 默认关闭）—— 正好对上「新消息加入才动效」。
          ⚠ 翻历史时用 .is-restoring 把动画关掉：那批是往上补的旧消息，
            再滑一次会像新消息一样从两侧飞进来，很吵。
        -->
        <transition-group tag="div" name="chat-msg">
          <div
            v-for="item in messages"
            :key="item._id || item.id"
            class="blog-chat--row"
            :class="{
              'is-mine': item.kind === 'text' && isMine(item),
              'is-system': item.kind === 'system'
            }"
          >
            <ChatBubble v-if="item.kind === 'text'" :item="item" />
            <div v-else class="blog-chat--system">{{ item.text }}</div>
          </div>
        </transition-group>
      </div>

      <div v-if="!messages.length" class="blog-chat--empty">
        {{ status === 'open' ? '还没有人说话，来打个招呼吧～' : '正在连接聊天室…' }}
      </div>
    </div>
  </div>
</template>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import ChatBubble from './ChatBubble.vue'
import { CHAT_CONNECT_TEXT } from '@/utils/chatUtils'

// 自动跟随底部的判定距离：用户滚到离底部 200px 以内就算「在看最新消息」
const FOLLOW_THRESHOLD = 200

export default {
  name: 'ChatMessageList',
  components: { ChatBubble },
  data() {
    return {
      // 正在补齐历史（期间不自动跟底、不播入动画）
      restoring: false
    }
  },
  computed: {
    ...mapState('chat', ['messages', 'hasMore', 'loadingMore', 'status']),
    ...mapGetters('chat', ['isMine']),
    connectText() {
      return CHAT_CONNECT_TEXT[this.status] || ''
    }
  },
  watch: {
    'messages.length'(next, prev) {
      if (next <= prev || this.restoring) return
      // 首屏（0 → N）：直接定位到最新一条
      if (prev === 0) {
        this.$nextTick(this.scrollToBottom)
        return
      }
      this.followBottom()
    }
  },
  mounted() {
    // 弹窗每次打开都是新实例（destroy-on-close），进来先看最新消息
    this.$nextTick(this.scrollToBottom)
  },
  methods: {
    ...mapActions('chat', ['loadMore']),

    scrollToBottom() {
      const el = this.$refs.scroller
      if (el) el.scrollTop = el.scrollHeight
    },

    /** 只有当用户本来就在底部附近时才自动跟随，避免打断翻旧消息 */
    followBottom() {
      this.$nextTick(() => {
        const el = this.$refs.scroller
        if (!el) return
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight
        if (distance < FOLLOW_THRESHOLD) el.scrollTop = el.scrollHeight
      })
    },

    handleScroll() {
      const el = this.$refs.scroller
      if (!el || el.scrollTop > 0) return
      if (!this.hasMore || this.loadingMore) return
      this.loadOlder()
    },

    /**
     * 上滑到头 → 加载更早的一页
     * ⚠ 前置插入后必须补偿滚动位置：不补的话新内容会把当前视口往下推，
     *   用户看到的是「一松手就跳了一屏」。补偿量 = 新增的高度。
     */
    async loadOlder() {
      const el = this.$refs.scroller
      if (!el) return
      const prevHeight = el.scrollHeight
      const prevTop = el.scrollTop

      this.restoring = true
      await this.loadMore()
      this.$nextTick(() => {
        el.scrollTop = el.scrollHeight - prevHeight + prevTop
        this.restoring = false
      })
    }
  }
}
</script>
