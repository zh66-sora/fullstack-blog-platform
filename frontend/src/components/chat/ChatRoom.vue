<template>
  <!--
    聊天室弹窗
    =========================================================================
    三行结构（对应需求「聊天室组件」的三段）：
      行1  标题「聊天室」 + 右侧工具栏（清屏 / 勿扰 / 关闭）
      行2  左侧注册用户列表（窄） + 右侧聊天记录（宽）
      行3  表情按钮 + 输入框 + 发送（纸飞机）

    弹窗外壳沿用项目惯例：el-dialog + append-to-body + destroy-on-close，
    el-dialog 自己那层白底/内边距在 styles/chat.styl 里削平，视觉由 .blog-chat--wrap 提供。

    ⚠ 状态（消息 / 用户 / 连接）全部在 store/modules/chat.js，
      弹窗只是「视图」—— destroy-on-close 销毁它不会丢任何数据。
  -->
  <el-dialog
    :visible="visible"
    :show-close="false"
    append-to-body
    destroy-on-close
    custom-class="blog-chat--dialog"
    width="880px"
    @close="close"
  >
    <div class="blog-chat--wrap">
      <!-- ===== 行1：标题 + 工具栏 ===== -->
      <div class="blog-chat--head">
        <h3>聊天室</h3>

        <div class="blog-chat--tools">
          <span class="blog-chat--tool" title="清屏" @click="clearScreen">
            <i class="el-icon-delete"></i>
          </span>
          <span
            class="blog-chat--tool"
            :class="{ 'is-active': isDnd }"
            :title="isDnd ? '取消勿扰' : '勿扰'"
            @click="toggleDnd"
          >
            <i class="el-icon-bell"></i>
          </span>
          <span class="blog-chat--tool" title="关闭" @click="close">
            <i class="iconfont icon-guanbi"></i>
          </span>
        </div>
      </div>

      <!-- ===== 行2：用户列表 + 聊天记录 ===== -->
      <div class="blog-chat--body">
        <ChatUserList />
        <ChatMessageList />
      </div>

      <!-- ===== 行3：表情 + 输入 + 发送 ===== -->
      <ChatInput />
    </div>
  </el-dialog>
</template>

<script>
import { mapState, mapActions } from 'vuex'
import ChatUserList from './ChatUserList.vue'
import ChatMessageList from './ChatMessageList.vue'
import ChatInput from './ChatInput.vue'

export default {
  name: 'ChatRoom',
  components: { ChatUserList, ChatMessageList, ChatInput },
  computed: {
    ...mapState('chat', ['visible', 'myStatus']),
    isDnd() {
      return this.myStatus === 'dnd'
    }
  },
  methods: {
    ...mapActions('chat', ['close', 'clearScreen', 'toggleDnd'])
  }
}
</script>
