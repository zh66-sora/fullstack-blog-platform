<template>
  <!--
    操作记录（/admin/logs，管理员 + 站长）
    =========================================================================
    数据源：AdminLog（myapp/models/AdminLog.js）—— 管理端的每一次「删内容 / 禁言 / 封禁 /
    改角色 / 重置密码 / 注销」都会落一条。

    ⚠ 只记管理端动作：作者删自己的文章、自己改资料这类不算「管理」，不入库
      （理由见 myapp/routes/bus.js 的 DELETE 分支）。

    版式说明：之前是「时间 | 动作 | 人 → 对象 | 说明」挤成一行，靠箭头串起来看，
    一条条扫下来很累；这里改成四列（时间 / 操作人 / 操作 / 对象 / 说明），
    列头固定在上方，动作用小胶囊按「删除 / 处罚 / 解除」三类上色，扫一眼就知道这行是哪种事。
  -->
  <el-card
    id="admin-logs"
    class="blog-card blog-write--editor blog-admin--wrap"
    shadow="never"
  >
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        title="返回主页"
        @click="goBack"
      ></span>
      <h3>操作记录</h3>
    </div>

    <div class="blog-write--body">
      <div class="blog-admin--toolbar">
        <BlogSelect
          v-model="action"
          class="blog-admin--filter"
          :options="actionOptions"
          placeholder="全部操作"
        />
        <button
          type="button"
          class="blog-write--btn blog-write--submit"
          :disabled="loading"
          @click="search"
        >
          筛选
        </button>
      </div>

      <p class="blog-admin--summary">共 {{ total }} 条记录，最近的在最上面</p>

      <div v-if="list.length" class="blog-log--table">
        <div class="blog-log--head">
          <span>时间</span>
          <span>操作人</span>
          <span>操作</span>
          <span>对象</span>
          <span>说明</span>
        </div>
        <div v-for="log in list" :key="log._id" class="blog-log--row">
          <span class="blog-log--time">{{ formatTime(log.createdAt) }}</span>
          <span class="blog-log--actor">{{ log.actorName || '（未知）' }}</span>
          <span class="blog-log--action" :class="actionClass(log.action)">
            {{ actionLabel(log.action) }}
          </span>
          <span class="blog-log--target">{{ log.targetName || '（已删除内容）' }}</span>
          <span class="blog-log--detail">{{ log.detail || '—' }}</span>
        </div>
      </div>

      <p v-else-if="!loading" class="blog-admin--empty">
        还没有任何操作记录
      </p>

      <div v-if="pages > 1" class="blog-admin--pager">
        <Pager :page="page" :pages="pages" @change="handlePageChange" />
      </div>
    </div>
  </el-card>
</template>

<script>
import Pager from "@/components/base/Pager.vue";
import BlogSelect from "@/components/base/BlogSelect.vue";
import { ACTION_OPTIONS, actionLabel } from "@/config/admin.config";

const PAGE_SIZE = 30;

export default {
  name: "AdminLogs",
  components: { Pager, BlogSelect },
  data() {
    return {
      actionOptions: ACTION_OPTIONS,
      // 当前筛选的 action（'' = 全部）
      action: "",
      page: 1,
      pages: 1,
      total: 0,
      list: [],
      loading: false,
    };
  },
  mounted() {
    this.fetchList(1);
  },
  methods: {
    goBack() {
      this.$router.push({ name: "Index" });
    },
    actionLabel,

    /**
     * 动作标签的配色：只分三类，多了反而看不出重点
     *   删 / 改（delete、role、password）→ 常规强调色
     *   处罚（mute、ban）               → 橙
     *   解除（unmute、unban）           → 绿
     */
    actionClass(action) {
      const act = String(action || "");
      if (act.endsWith(".delete")) return "is-danger";
      if (act === "user.mute" || act === "user.ban") return "is-warn";
      if (act === "user.unmute" || act === "user.unban") return "is-ok";
      return "";
    },

    formatTime(value) {
      if (!value) return "";
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    async fetchList(page = 1) {
      this.loading = true;
      const res = await this.$api({
        type: "adminLogList",
        data: { action: this.action, page, size: PAGE_SIZE },
      });
      this.loading = false;
      if (!res || !res.data) return;

      const data = res.data;
      this.list = data.list || [];
      this.total = data.total || 0;
      this.page = data.page || page;
      this.pages = Math.max(1, Math.ceil(this.total / (data.size || PAGE_SIZE)));
    },

    search() {
      this.fetchList(1);
    },

    handlePageChange(page) {
      if (this.loading) return;
      this.fetchList(page);
    },
  },
};
</script>
