<template>
  <!--
    留言板上的一条留言（含它的全部回复）

    ⚠ 复用评论区的**样式类**（.blog-comment--item / --avatar / --meta / --reply…），
      不放进评论组件里改 flags —— 两者差异是「功能」层面的：
        留言墙：纯文字、30 字上限、只有回复与删除、**没有赞/踩**
        评论区：带图、无字数上限、有赞/踩与楼中楼弹窗
      硬塞进同一个组件会让两边都长满 v-if。所以样式共用、逻辑各写一份。

    ⚠ 权限位来自后端（canDelete / canReply），这里不再拿当前用户 id 自己比一遍 ——
      「谁能删 / 谁能回」的规则前后端必须一致，写在两处迟早对不上。
  -->
  <div class="blog-comment--item">
    <!-- 头像 → 进留言者的主页（他人主页的入口之一；与评论区同一尺寸） -->
    <!-- ⚠ size 必须是 md：外层 .blog-comment--avatar 是 40x40 的圆框，
         sm（32px）会让 el-image 变成 32x40 的椭圆 -->
    <UserLink class="blog-comment--avatar" :user="message.author" size="md" />

    <div class="blog-comment--body">
      <div class="blog-comment--meta">
        <div class="blog-comment--meta_top">
          <span class="blog-comment--nickname">{{ message.author.name }}</span>
          <template v-if="isOwner">
            <span class="blog-wall--badge">板主</span>
          </template>
          <el-button
            v-if="message.canDelete"
            class="blog-comment--delete"
            title="删除"
            @click="$emit('delete', message)"
          >
            <i class="iconfont icon-guanbi"></i>
          </el-button>
        </div>
      </div>

      <div class="blog-comment--content">
        <p>{{ message.content }}</p>
      </div>

      <div class="blog-comment--footer">
        <span class="blog-comment--time">{{ message.time }}</span>
        <div class="blog-comment--actions">
          <el-button
            v-if="message.canReply"
            class="blog-comment--action_btn"
            @click="$emit('reply', ownTarget)"
          >
            <i class="iconfont icon-pinglun"></i>回复
          </el-button>
        </div>
      </div>

      <!-- 回复列表：不分页（能说话的只有板主和作者两个人） -->
      <div v-if="message.replies.length" class="blog-comment--replies">
        <div
          v-for="reply in message.replies"
          :key="reply.id"
          class="blog-comment--reply"
        >
          <UserLink
            class="blog-comment--reply_avatar"
            :user="reply.author"
            size="sm"
          />

          <div class="blog-comment--reply_body">
            <div class="blog-comment--reply_meta">
              <div class="blog-comment--meta_top">
                <span class="blog-comment--reply_nickname">
                  {{ reply.author.name }}
                </span>
                <span v-if="reply.author.id === ownerId" class="blog-wall--badge">
                  板主
                </span>
                <template v-if="reply.replyTo">
                  <span class="blog-comment--reply_at">回复</span>
                  <span class="blog-comment--reply_at_name">
                    @{{ reply.replyTo.name }}
                  </span>
                </template>
                <el-button
                  v-if="reply.canDelete"
                  class="blog-comment--delete"
                  title="删除"
                  @click="$emit('delete', reply)"
                >
                  <i class="iconfont icon-guanbi"></i>
                </el-button>
              </div>
            </div>

            <div class="blog-comment--reply_content">
              <p>{{ reply.content }}</p>
            </div>

            <div class="blog-comment--reply_footer">
              <span class="blog-comment--time">{{ reply.time }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// 头像 → 进留言者的主页（他人主页的入口之一）
import UserLink from "@/components/user/UserLink.vue";

export default {
  name: "WallItem",
  components: { UserLink },
  props: {
    // 一条留言的 viewModel（buildWallListViewModel 的产物）
    message: { type: Object, required: true },
    // 板主 id（给板主的发言打一个「板主」标记）
    ownerId: { type: String, default: "" },
  },
  computed: {
    isOwner() {
      return !!this.ownerId && this.message.author.id === this.ownerId;
    },
    // 回复这条留言：parentId 就是它自己的 id
    ownTarget() {
      return {
        parentId: this.message.id,
        replyTo: this.message.author.id,
        name: this.message.author.name,
      };
    },
  },
};
</script>
