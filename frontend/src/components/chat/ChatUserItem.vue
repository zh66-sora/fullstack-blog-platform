<template>
  <!--
    单个用户行
      [头像 + 状态点]  在线/勿扰/离线（上）
                       昵称（下）              [笔状 icon]
    「昵称」优先显示我对他的备注（备注 > 昵称 > 用户名），备注存 localStorage。

    ⚠ `:key` 不要用 index：用户列表会因上线/离线整体重排，用 index 会让
      正在编辑备注的那一行「跳」到别人身上。
  -->
  <div class="blog-chat--user" :class="{ 'is-offline': user.status === 'offline' }">
    <!--
      头像 → 进这个人的主页（他人主页的入口之一）
      ⚠ 外层 .blog-chat--avatar 这个盒子**必须留着**：它是 34×34 的定位基准，
        状态点（.blog-chat--dot）靠它绝对定位到右下角。所以这里只在**内部**换掉
        图片那一块，不去动盒子和状态点。
    -->
    <span class="blog-chat--avatar">
      <UserLink :user="user" size="xs" />
      <!-- 状态点：颜色在 chat.styl 里按 is-online / is-dnd / is-offline 区分 -->
      <span class="blog-chat--dot" :class="`is-${user.status}`"></span>
    </span>

    <div class="blog-chat--user_info">
      <span class="blog-chat--user_status" :class="`is-${user.status}`">
        {{ statusText }}
      </span>

      <!-- 昵称行：常态是文字，点笔之后变成小输入框 -->
      <el-input
        v-if="editing"
        ref="remarkInput"
        v-model="draft"
        class="blog-chat--user_remark"
        size="mini"
        maxlength="20"
        placeholder="备注名，留空即删除"
        @keyup.enter.native="save"
        @keyup.esc.native="cancel"
        @blur="save"
      ></el-input>
      <span v-else class="blog-chat--user_name" :title="user.nickname">
        {{ displayName }}
      </span>
    </div>

    <span
      v-if="!editing"
      class="blog-chat--user_edit"
      :title="hasRemark ? '修改备注' : '添加备注'"
      @click="startEdit"
    >
      <i class="el-icon-edit-outline"></i>
    </span>
  </div>
</template>

<script>
import { mapGetters, mapState, mapActions } from 'vuex'
import { CHAT_STATUS_TEXT } from '@/utils/chatUtils'
// 头像 → 进这个人的主页（他人主页的入口之一）
import UserLink from '@/components/user/UserLink.vue'

export default {
  name: 'ChatUserItem',
  components: { UserLink },
  props: {
    user: { type: Object, required: true }
  },
  data() {
    return {
      editing: false,
      draft: ''
    }
  },
  computed: {
    ...mapGetters('chat', ['nameOf']),
    ...mapState('chat', ['remarks']),
    statusText() {
      return CHAT_STATUS_TEXT[this.user.status] || '离线'
    },
    hasRemark() {
      return Boolean(this.remarks[this.user._id])
    },
    displayName() {
      // 备注优先；没备注时我自己的行不额外标注（列表里只有我一个是「我」）
      return this.nameOf(this.user)
    }
  },
  methods: {
    ...mapActions('chat', ['saveRemark']),
    startEdit() {
      this.draft = this.remarks[this.user._id] || ''
      this.editing = true
      this.$nextTick(() => {
        if (this.$refs.remarkInput) this.$refs.remarkInput.focus()
      })
    },
    save() {
      if (!this.editing) return
      this.editing = false
      this.saveRemark({ uid: this.user._id, remark: this.draft })
    },
    cancel() {
      this.editing = false
    }
  }
}
</script>
