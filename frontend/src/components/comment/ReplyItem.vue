<template>
  <!--
    一条回复
    两种形态共用同一个组件（原项目是 4 份 hbs 里各抄一遍）：
      列表预览 —— showIp = false，只显示昵称与「回复 @xxx」
      弹窗列表 —— showIp = true，多显示 IP 属地
    「该不该显示 @xxx」在 viewModel 里就算好了（isNestedReply），组件不做判断。
  -->
  <div class="blog-comment--reply">
    <!-- 头像 → 进这条回复作者的主页（与顶层评论同一写法、同尺寸） -->
    <UserLink class="blog-comment--reply_avatar" :user="reply.author" size="sm" />

    <div class="blog-comment--reply_body">
      <CommentMeta :record="reply" variant="reply" :show-ip="showIp" />

      <div class="blog-comment--reply_content">
        <!-- 与评论配图同样按原比例缩放，不做方框裁切 -->
        <el-image
          v-if="reply.image"
          class="blog-comment--reply_img"
          :src="reply.image"
          :preview-src-list="[reply.image]"
        ></el-image>
        <!--
          ⚠ 必须是块级元素（<p>），不能是 <span>：
          配图是 inline-block，后面跟 inline 的文字时两者会排在同一行，
          图片就「贴着文字」而不是独占一行（评论区用 <p> 所以没问题）。
          改块级后，配图自己形成一个匿名块，文字另起一行 —— 两处观感一致。
        -->
        <p>{{ reply.content }}</p>
      </div>

      <div class="blog-comment--reply_footer">
        <span class="blog-comment--time">{{ reply.time }}</span>
        <div class="blog-comment--reply_actions">
          <el-button class="blog-comment--action_btn" @click="$emit('reply', reply)">
            <i class="iconfont icon-pinglun"></i>回复
          </el-button>

          <HabitBar
            :likes="reply.likeNum"
            :dislikes="reply.dislikeNum"
            @like="$emit('like', reply)"
            @dislike="$emit('dislike', reply)"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import CommentMeta from "./CommentMeta.vue";
import HabitBar from "@/components/base/HabitBar.vue";
// 头像 → 进回复作者的主页（他人主页的入口之一）
import UserLink from "@/components/user/UserLink.vue";

export default {
  name: "ReplyItem",
  components: { CommentMeta, HabitBar, UserLink },
  props: {
    // 一条回复的 viewModel
    reply: { type: Object, required: true },
    // 列表预览不显示 IP 属地，弹窗里显示
    showIp: { type: Boolean, default: false },
  },
};
</script>
