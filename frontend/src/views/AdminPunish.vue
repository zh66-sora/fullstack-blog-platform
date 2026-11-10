<template>
  <!--
    处罚管理（/admin/punish，管理员 + 站长）
    =========================================================================
    这里只做「管行为」的事：查账号、禁言 / 封禁 / 解禁。
      · 管理员只能动普通用户
      · 站长能动管理员和普通用户，但动不了自己（同级不满足「严格大于」）
      · 时长固定三档：一周 / 半个月 / 一个月（默认一周，最多一个月）
    「管身份」的事（改角色 / 注销 / 重置密码）在「账号管理」页，两类操作分开摆，
    按钮才不会混在一行里分不清轻重。

    ⚠ 按钮显隐只是「别让人点开一个注定 403 的操作」，真正的判断在服务端
      myapp/routes/admin.js + middleware/authz.js。
  -->
  <el-card
    id="admin-punish"
    class="blog-card blog-write--editor blog-admin--wrap"
    shadow="never"
  >
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        title="返回主页"
        @click="goBack"
      ></span>
      <h3>处罚管理</h3>
    </div>

    <div class="blog-write--body">
      <!-- 工具栏：搜索 + 角色 + 状态 + 查询。回车等同点「查询」 -->
      <div class="blog-admin--toolbar">
        <label class="blog-admin--search">
          <i class="iconfont icon-sousuo"></i>
          <input
            v-model.trim="filters.keyword"
            type="text"
            placeholder="搜索用户名 / 昵称"
            @keyup.enter="search"
          >
        </label>

        <BlogSelect v-model="filters.role" :options="roleOptions" placeholder="全部角色" />
        <BlogSelect v-model="filters.status" :options="statusOptions" placeholder="全部状态" />

        <button
          type="button"
          class="blog-write--btn blog-write--submit"
          :disabled="loading"
          @click="search"
        >
          查询
        </button>
      </div>

      <p class="blog-admin--summary">
        共 {{ total }} 个账号
        <span class="blog-admin--summary_role">当前身份：{{ actorLabel }}</span>
      </p>

      <!-- 列表 -->
      <ul v-if="list.length" class="blog-admin--list">
        <li v-for="user in list" :key="user._id" class="blog-admin--row">
          <div class="blog-admin--main">
            <el-image
              :src="user.avatar"
              fit="cover"
              class="blog-admin--avatar"
            ></el-image>

            <div class="blog-admin--who">
              <p class="blog-admin--name">
                {{ user.nickname || user.username }}
                <span class="blog-admin--username">@{{ user.username }}</span>
              </p>
              <p class="blog-admin--meta">
                <span class="blog-admin--tag" :class="'is-role-' + roleOf(user)">
                  {{ roleLabelOf(user) }}
                </span>
                <span
                  class="blog-admin--tag"
                  :class="'is-status-' + statusOf(user)"
                >{{ statusLabelOf(user) }}</span>
                <span v-if="untilText(user)" class="blog-admin--until">
                  {{ untilText(user) }}
                </span>
              </p>
              <p v-if="user.statusReason" class="blog-admin--reason">
                理由：{{ user.statusReason }}
              </p>
            </div>

            <div class="blog-admin--actions">
              <template v-if="canOperate(user)">
                <button type="button" class="blog-admin--btn" @click="startPunish(user, 'muted')">
                  禁言
                </button>
                <button type="button" class="blog-admin--btn is-danger" @click="startPunish(user, 'banned')">
                  封禁
                </button>
                <button
                  v-if="isRestricted(user)"
                  type="button"
                  class="blog-admin--btn"
                  @click="askRelease(user)"
                >
                  解除
                </button>
              </template>
              <span v-else class="blog-admin--hint">{{ opHint(user) }}</span>
            </div>
          </div>

          <!-- 处罚面板：展开在那一行下面，不弹新窗（与博客管理的展开行同一套交互）
               分两行排：① 时长  ② 理由 + 按钮 —— 挤成一行时「取消」会被顶到下一行最左边 -->
          <div v-if="editing && editing.id === user._id" class="blog-admin--panel">
            <div class="blog-admin--panel_row">
              <span class="blog-admin--panel_label">时长</span>
              <button
                v-for="opt in durationOptions"
                :key="opt.value"
                type="button"
                class="blog-admin--chip"
                :class="{ 'is-active': editing.days === opt.value }"
                @click="editing.days = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
            <div class="blog-admin--panel_row">
              <input
                v-model.trim="editing.reason"
                class="blog-admin--input blog-admin--input_reason"
                type="text"
                maxlength="100"
                placeholder="处罚理由（选填，最多 100 字）"
              >
              <button
                type="button"
                class="blog-write--btn blog-write--submit"
                :disabled="saving"
                @click="submitPunish"
              >
                {{ editing.status === 'muted' ? '确认禁言' : '确认封禁' }}
              </button>
              <button type="button" class="blog-write--btn" @click="editing = null">
                取消
              </button>
            </div>
          </div>
        </li>
      </ul>

      <p v-else-if="!loading" class="blog-admin--empty">
        没有匹配的账号
      </p>

      <div v-if="pages > 1" class="blog-admin--pager">
        <Pager :page="page" :pages="pages" @change="handlePageChange" />
      </div>
    </div>

    <ConfirmModal
      :visible="confirmVisible"
      title="解除限制"
      :message="confirmMessage"
      confirm-text="解除"
      @confirm="confirmRelease"
      @cancel="cancelRelease"
    />
  </el-card>
</template>

<script>
import { mapGetters } from "vuex";
import store from "store";
import Pager from "@/components/base/Pager.vue";
import ConfirmModal from "@/components/base/ConfirmModal.vue";
import BlogSelect from "@/components/base/BlogSelect.vue";
import {
  ROLE_LABEL,
  ROLE_OPTIONS,
  STATUS_LABEL,
  STATUS_OPTIONS,
  DURATION_OPTIONS,
  DEFAULT_DURATION,
  canManage,
} from "@/config/admin.config";

const PAGE_SIZE = 20;

export default {
  name: "AdminPunish",
  components: { Pager, ConfirmModal, BlogSelect },
  data() {
    return {
      roleOptions: ROLE_OPTIONS,
      statusOptions: STATUS_OPTIONS,
      durationOptions: DURATION_OPTIONS,
      filters: { keyword: "", role: "", status: "" },
      page: 1,
      pages: 1,
      total: 0,
      list: [],
      actor: { id: "", role: "user" },
      loading: false,
      saving: false,
      // 正在处罚的那一条：{ id, status: 'muted'|'banned', days, reason }
      editing: null,
      // 待解除的目标
      pendingRelease: null,
      confirmVisible: false,
    };
  },
  computed: {
    ...mapGetters("http", ["userInfo"]),
    // 当前登录账号 id：优先 localStorage 的 uid（刷新后还在），回退 userInfo
    actorId() {
      return this.actor.id || store.get("uid") || this.userInfo?.data?._id || "";
    },
    actorRole() {
      return this.actor.role || this.userInfo?.data?.role || "user";
    },
    actorLabel() {
      return ROLE_LABEL[this.actorRole] || "普通用户";
    },
    confirmMessage() {
      const target = this.pendingRelease;
      if (!target) return "";
      return `确认解除「${target.nickname || target.username}」的禁言 / 封禁？`;
    },
  },
  mounted() {
    this.fetchList(1);
  },
  methods: {
    goBack() {
      this.$router.push({ name: "Index" });
    },

    // ==================== 展示用小工具 ====================

    roleOf(user) {
      return user.role || "user";
    },
    roleLabelOf(user) {
      return ROLE_LABEL[this.roleOf(user)] || "普通用户";
    },
    // 到期后的禁言 / 封禁按「正常」显示：后端 effectiveStatus 已经做过惰性过期
    statusOf(user) {
      return user.effectiveStatus || user.status || "active";
    },
    statusLabelOf(user) {
      return STATUS_LABEL[this.statusOf(user)] || "正常";
    },
    isRestricted(user) {
      const s = this.statusOf(user);
      return s === "muted" || s === "banned";
    },
    untilText(user) {
      if (!this.isRestricted(user) || !user.statusUntil) return "";
      const d = new Date(user.statusUntil);
      if (Number.isNaN(d.getTime())) return "";
      const pad = (n) => String(n).padStart(2, "0");
      return `${this.statusOf(user) === "muted" ? "禁言至" : "封禁至"} ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    },
    /** 能不能对这个人动手：不是自己 + 等级严格更高 + 未注销 */
    canOperate(user) {
      if (!user || String(user._id) === String(this.actorId)) return false;
      if (this.statusOf(user) === "deleted") return false;
      return canManage(this.actorRole, this.roleOf(user));
    },
    /** 不能操作时给一句为什么，别让按钮凭空消失 */
    opHint(user) {
      if (String(user._id) === String(this.actorId)) return "不能操作自己";
      if (this.statusOf(user) === "deleted") return "账号已注销";
      return "级别不低于你，无法操作";
    },

    // ==================== 读 ====================

    async fetchList(page = 1) {
      this.loading = true;
      const res = await this.$api({
        type: "adminUserList",
        data: {
          keyword: this.filters.keyword,
          role: this.filters.role,
          status: this.filters.status,
          page,
          size: PAGE_SIZE,
        },
      });
      this.loading = false;
      // 请求失败时 $api 已经弹过 toast（并返回 undefined），这里保持原列表不动
      if (!res || !res.data) return;

      const data = res.data;
      this.list = data.list || [];
      this.total = data.total || 0;
      this.page = data.page || page;
      this.pages = Math.max(1, Math.ceil(this.total / (data.size || PAGE_SIZE)));
      // 服务端下发的 actor 是权威值（前端缓存的 role 可能已经过期）
      if (data.actor) this.actor = data.actor;
    },

    search() {
      this.editing = null;
      this.fetchList(1);
    },

    handlePageChange(page) {
      if (this.loading) return;
      this.editing = null;
      this.fetchList(page);
    },

    // ==================== 禁言 / 封禁 ====================

    /**
     * 展开处罚面板
     * 默认一周（需求），每次展开都重置回默认值 —— 上一次选的一个月不该粘到下一个账号上
     */
    startPunish(user, status) {
      this.editing = {
        id: user._id,
        status,
        days: DEFAULT_DURATION,
        reason: "",
      };
    },

    async submitPunish() {
      if (!this.editing || this.saving) return;
      this.saving = true;
      const { id, status, days, reason } = this.editing;
      const res = await this.$api({
        type: "adminSetStatus",
        params: { id },
        data: { status, days, reason },
      });
      this.saving = false;
      if (!res || !res.data) return;

      this.$toast.success(res.message || "操作成功");
      this.editing = null;
      this.fetchList(this.page);
    },

    // ==================== 解除 ====================

    askRelease(user) {
      this.pendingRelease = user;
      this.confirmVisible = true;
    },

    cancelRelease() {
      this.pendingRelease = null;
      this.confirmVisible = false;
    },

    async confirmRelease() {
      const target = this.pendingRelease;
      // 与删评论 / 删留言同一顺序：先把目标取到手、立刻关弹窗，再发请求
      this.cancelRelease();
      if (!target) return;

      const res = await this.$api({
        type: "adminSetStatus",
        params: { id: target._id },
        data: { status: "active" },
      });
      if (!res || !res.data) return;
      this.$toast.success(res.message || "已解除限制");
      this.fetchList(this.page);
    },
  },
};
</script>
