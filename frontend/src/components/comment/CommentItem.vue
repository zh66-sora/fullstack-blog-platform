<template>
  <!--
    评论列表里的单条顶层评论
    两个形态（原项目 comment.hbs 的 item 段与 commentItem.hbs 是逐字重复的两份）：
      variant = 'list'  —— 列表页：显示内嵌回复预览 + 「查看更多回复」入口，可删除、可回复
      variant = 'modal' —— 弹窗里的父评论：不显示回复预览（弹窗自己就是完整列表），
                           也不给回复/删除入口（原项目那边只留了赞/踩）
  -->
  <div class="blog-comment--item">
    <!--
      头像 → 进这条评论作者的主页（他人主页的入口之一）
      ⚠ 原来这里写的是 `v-if="comment.author.avatar"`：没设头像的人**整个头像位是空的**，
         一片白。换成 UserLink 后由它统一兜底（默认头像），并且空 id 的作者不会变成可点。
    -->
    <UserLink class="blog-comment--avatar" :user="comment.author" size="md" />

    <div class="blog-comment--body">
      <CommentMeta
        :record="comment"
        :deletable="isList"
        @delete="$emit('delete', comment)"
      />

      <div class="blog-comment--content">
        <!--
          配图不再固定成方框裁切：el-image 的 img 是固有尺寸渲染的，
          max-width / max-height 会自动按原比例缩放（见 comment.styl）
        -->
        <el-image
          v-if="comment.image"
          class="blog-comment--content_img"
          :src="comment.image"
          :preview-src-list="[comment.image]"
        ></el-image>
        <p>{{ comment.content }}</p>
      </div>

      <div class="blog-comment--footer">
        <span class="blog-comment--time">{{ comment.time }}</span>
        <div class="blog-comment--actions">
          <el-button
            v-if="isList"
            class="blog-comment--action_btn"
            @click="$emit('reply', ownTarget)"
          >
            <i class="iconfont icon-pinglun"></i>回复
          </el-button>

          <!-- 赞/踩：公共组件（文章详情、文章列表用的是同一个） -->
          <HabitBar
            :likes="comment.likeNum"
            :dislikes="comment.dislikeNum"
            @like="$emit('like', comment)"
            @dislike="$emit('dislike', comment)"
          />
        </div>
      </div>

      <!-- 回复预览 + 查看更多：只在列表形态出现 -->
      <div v-if="isList && comment.replies.length" class="blog-comment--replies">
        <ReplyItem
          v-for="reply in comment.replies"
          :key="reply.id"
          :reply="reply"
          @reply="emitReplyTo(reply)"
          @like="$emit('like', $event)"
          @dislike="$emit('dislike', $event)"
        />

        <el-button
          v-if="comment.hasMoreReplies"
          class="blog-comment--view_all"
          @click="$emit('view-all', comment)"
        >
          查看更多回复（共 {{ comment.replyCount }} 条）
        </el-button>
      </div>
    </div>
  </div>
</template>

<script>
import CommentMeta from "./CommentMeta.vue";
import ReplyItem from "./ReplyItem.vue";
import HabitBar from "@/components/base/HabitBar.vue";
// 头像 → 进评论作者的主页（他人主页的入口之一）
import UserLink from "@/components/user/UserLink.vue";

export default {
  name: "CommentItem",
  components: { CommentMeta, ReplyItem, HabitBar, UserLink },
  props: {
    // 一条顶层评论的 viewModel
    comment: { type: Object, required: true },
    // 'list' | 'modal'
    variant: { type: String, default: "list" },
  },
  computed: {
    isList() {
      return this.variant === "list";
    },
    // 回复这条顶层评论：parentId 就是它自己的 id
    ownTarget() {
      return {
        parentId: this.comment.id,
        replyTo: this.comment.author.id,
        name: this.comment.author.name,
      };
    },
  },
  methods: {
    /**
     * 回复某条嵌套回复
     *
     * ⚠ parentId 必须是「所属顶层评论」的 id，不是被点的那条回复的 id ——
     * 后端靠 parentComment 把回复归到顶层评论下，replyTo 才指向具体的人。
     * ReplyItem 自己不知道自己挂在哪条顶层评论下，这个知识只能由这里补上
     * （原项目是靠 jQuery 的 .closest('.blog-comment--item') 从 DOM 里往上找的）。
     */
    emitReplyTo(reply) {
      this.$emit("reply", {
        parentId: this.comment.id,
        replyTo: reply.author.id,
        name: reply.author.name,
      });
    },
  },
};
</script>
