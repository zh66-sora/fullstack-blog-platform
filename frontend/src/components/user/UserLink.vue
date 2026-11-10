<template>
  <!--
    用户链接 —— 五个入口共用的「头像（+可选昵称）→ 进 TA 的主页」
      文章列表 / 文章详情 / 评论区 / 留言板 / 聊天室

    为什么要抽这一个组件（需求：「也许你可以把它们做公共复用组件」）：
      五处都要做同一件事（拿 id → 跳 /user/:id），但它们的 author 形态不一致
      （文章是 { _id, avatar, nickname }、评论/留言是 { id, name, avatar }、聊天室是 { _id, … }），
      各写一份迟早会对不上。这里统一交给 utils/userUtils.js 的 normalizeUser() 去读。

    ⚠ 模板里只认一种数据结构（normalizeUser 的产出），调用方不必关心源头长什么样。

    两种形态：
      show-name = true  列表 / 详情：新增「头像 + 昵称」一行
      show-name = false 评论 / 留言 / 聊天：只替换原来那个头像（昵称它们自己已有一套）
  -->
  <span
    class="blog-user--link"
    :class="[`is-${size}`, { 'is-clickable': clickable }]"
    :title="clickable ? `看看 ${name} 的主页` : ''"
    @click.stop="handleClick"
  >
    <el-image class="blog-user--avatar" :src="avatarSrc" fit="cover">
      <div slot="error" class="blog-user--avatar_fallback">
        <i class="iconfont icon-gerenzhongxin"></i>
      </div>
    </el-image>
    <span v-if="showName" class="blog-user--name">{{ name }}</span>
  </span>
</template>

<script>
import { normalizeUser, avatarOf } from "@/utils/userUtils";
import visitContext from "@/mixins/visitContext";

export default {
  name: "UserLink",
  mixins: [visitContext],
  props: {
    /**
     * 作者 / 用户，任意形态都收（见 utils/userUtils.js 的 normalizeUser）：
     *   { _id, avatar, nickname }  ｜ { id, name, avatar }  ｜ 裸 id 字符串  ｜ null
     */
    user: { type: [Object, String], default: null },

    /** 是否渲染昵称（列表/详情要，评论/留言/聊天它们自己已有昵称） */
    showName: { type: Boolean, default: false },

    /** 尺寸档位：xs 聊天气泡 / sm 列表与评论 / md 详情 */
    size: {
      type: String,
      default: "sm",
      validator: (v) => ["xs", "sm", "md"].includes(v),
    },
  },
  computed: {
    /** 统一后的三元组 */
    normalized() {
      return normalizeUser(this.user);
    },
    id() {
      return this.normalized.id;
    },
    name() {
      return this.normalized.name;
    },
    /** 没设头像 → 兜底图（评论/留言原来空头像是一片白，这里一并补上） */
    avatarSrc() {
      return avatarOf(this.normalized.avatar);
    },
    /**
     * 能不能点：拿不到 id 就不给点（不存在的作者、被删号的作者），
     * 此时它就是个纯展示的头像，不会跳到一个空的 /user/undefined
     */
    clickable() {
      return !!this.id;
    },
  },
  methods: {
    handleClick() {
      // 拿不到 id 的作者：点了也不跳（.stop 已经把冒泡挡掉了，不会误触父级的跳转）
      if (!this.clickable) return;
      this.openUserHome(this.id);
    },
  },
};
</script>

<style lang='styl'>
// 这个组件被 article / comment / wall / chat 四个目录引用，所以样式走全局文件，
// 不放组件内 —— 与 manage.styl / comment.styl 那几份是同一个做法。
@import '../../assets/css/user.styl'
</style>
