<template>
  <!--
    表情面板（评论区与聊天室共用）
    =========================================================================
    纯展示 + 抛事件，自己不管「插到哪个输入框」——插入逻辑留给调用方，
    因为 textarea 和单行 input 的光标 API 虽然一样，但取值方式不同。

    用法（父组件把「触发按钮 + 本面板」一起包在 .blog-emoji--wrap 里）：
      <span class="blog-emoji--wrap">
        <button @click="showEmoji = !showEmoji">表情</button>
        <EmojiPanel :visible="showEmoji" @select="insertEmoji" @close="showEmoji = false" />
      </span>

    ⚠ 面板是 position: absolute 且朝**上**弹出（bottom: 100%）：
      聊天室的输入行在弹窗最底部，朝下弹会被弹窗/视口裁掉。
      外层 .blog-emoji--wrap 带 z-index，用来压过后面才渲染的兄弟节点（如评论列表卡片）。
  -->
  <div v-show="visible" class="blog-emoji--panel" @mousedown.prevent>
    <div class="blog-emoji--tabs">
      <span
        v-for="group in groups"
        :key="group.key"
        class="blog-emoji--tab"
        :class="{ 'is-active': group.key === activeKey }"
        @click="activeKey = group.key"
      >
        {{ group.name }}
      </span>
    </div>

    <div class="blog-emoji--grid">
      <span
        v-for="(emoji, index) in currentList"
        :key="`${activeKey}-${index}`"
        class="blog-emoji--item"
        :title="emoji"
        @click="$emit('select', emoji)"
      >
        {{ emoji }}
      </span>
    </div>
  </div>
</template>

<script>
import { EMOJI_GROUPS } from '@/config/emoji.config'

export default {
  name: 'EmojiPanel',
  props: {
    visible: { type: Boolean, default: false }
  },
  data() {
    return {
      groups: EMOJI_GROUPS,
      activeKey: EMOJI_GROUPS[0].key
    }
  },
  computed: {
    currentList() {
      const group = this.groups.find((item) => item.key === this.activeKey)
      return group ? group.list : []
    }
  },
  watch: {
    visible(visible) {
      // 打开时挂全局监听、关闭时摘掉 —— 常驻监听没必要，且会拖慢整页点击
      if (visible) {
        document.addEventListener('mousedown', this.handleOutside)
        document.addEventListener('keydown', this.handleKeydown)
      } else {
        this.teardown()
      }
    }
  },
  beforeDestroy() {
    this.teardown()
  },
  methods: {
    teardown() {
      document.removeEventListener('mousedown', this.handleOutside)
      document.removeEventListener('keydown', this.handleKeydown)
    },
    /**
     * 点面板外面就收起
     * ⚠ 判据是「整块 .blog-emoji--wrap」而不是面板自己 —— 触发按钮也在里面，
     *   只判面板的话，点按钮会先关（这里）再开（按钮的 click），面板就点不开了。
     */
    handleOutside(event) {
      const wrap = this.$el.parentNode
      if (wrap && wrap.contains(event.target)) return
      this.$emit('close')
    },
    handleKeydown(event) {
      if (event.key === 'Escape') this.$emit('close')
    }
  }
}
</script>
