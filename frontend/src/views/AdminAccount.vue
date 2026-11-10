<template>
  <!--
    账号管理（/admin/account，仅站长）

    这里放的是「账号级操作」—— 不按等级差判断，只认站长身份（需求：新增站长进行账号级操作的页面）：
      · 任命 / 撤销管理员
      · 注销账号（软删：status = deleted，文章 / 评论 / 留言都留着）

    ⚠ 与「处罚管理」的分工：
      处罚管理是「管行为」（禁言 / 封禁，管理员也能用）；
      这里是「管身份」（改角色 / 注销，只有站长能做）。两件事分开，按钮才不会混在一行。

    ⚠ 站长自己不出现在可操作范围里（后端也拦：不能改自己的角色、不能注销站长）。
  -->
  <el-card
    id="admin-account"
    class="blog-card blog-write--editor blog-admin--wrap"
    shadow="never"
  >
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        title="返回主页"
        @click="goBack"
      ></span>
      <h3>账号管理</h3>
    </div>

    <div class="blog-write--body">
      <div class="blog-admin--toolbar">
        <label class="blog-admin--search">
          <i class="iconfont icon-sousuo"></i>
          <input
            v-model.trim="keyword"
            type="text"
            placeholder="按用户名 / 昵称查找账号"
            @keyup.enter="search"
          >
        </label>
        <button
          type="button"
          class="blog-write--btn blog-write--submit"
          :disabled="loading"
          @click="search"
        >
          查找
        </button>
      </div>

      <p class="blog-admin--summary">共 {{ total }} 个账号</p>

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
                <span v-if="user.statusReason" class="blog-admin--until">
                  {{ user.statusReason }}
                </span>
              </p>
            </div>

            <div class="blog-admin--actions">
              <template v-if="canOperate(user)">
                <button
                  v-if="roleOf(user) === 'user'"
                  type="button"
                  class="blog-admin--btn"
                  @click="setRole(user, 'admin')"
                >
                  任命管理员
                </button>
                <button
                  v-else-if="roleOf(user) === 'admin'"
                  type="button"
                  class="blog-admin--btn"
                  @click="setRole(user, 'user')"
                >
                  撤销管理员
                </button>
                <button
                  type="button"
                  class="blog-admin--btn"
                  @click="startPassword(user)"
                >
                  重置密码
                </button>
                <button
                  type="button"
                  class="blog-admin--btn is-danger"
                  @click="startDelete(user)"
                >
                  注销账号
                </button>
              </template>
              <span v-else class="blog-admin--hint">{{ opHint(user) }}</span>
            </div>
          </div>

          <!-- 重置密码面板：站长不需要旧密码（用户忘了密码才来找站长），所以这里只填新密码 -->
          <div v-if="pendingPassword && pendingPassword.id === user._id" class="blog-admin--panel">
            <div class="blog-admin--panel_row">
              <span class="blog-admin--panel_label">新密码</span>
              <input
                v-model.trim="pendingPassword.password"
                class="blog-admin--input blog-admin--input_reason"
                type="text"
                maxlength="12"
                placeholder="8-12 位，含大写+小写+数字"
              >
              <button
                type="button"
                class="blog-write--btn blog-write--submit"
                :disabled="saving"
                @click="confirmPassword"
              >
                确认重置
              </button>
              <button type="button" class="blog-write--btn" @click="pendingPassword = null">
                取消
              </button>
            </div>
          </div>

          <!-- 注销面板：软删除不可逆（再登录回来是不可能的），所以要求填一句理由 -->
          <div v-if="pendingDelete && pendingDelete.id === user._id" class="blog-admin--panel">
            <div class="blog-admin--panel_row">
              <span class="blog-admin--panel_label">注销理由</span>
              <input
                v-model.trim="pendingDelete.reason"
                class="blog-admin--input blog-admin--input_reason"
                type="text"
                maxlength="100"
                placeholder="写清为什么注销（最多 100 字）"
              >
              <button
                type="button"
                class="blog-write--btn blog-write--submit"
                :disabled="saving"
                @click="confirmDelete"
              >
                确认注销
              </button>
              <button type="button" class="blog-write--btn" @click="pendingDelete = null">
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
  </el-card>
</template>

<script>
import { mapGetters } from "vuex";
import store from "store";
import Pager from "@/components/base/Pager.vue";
import { ROLE_LABEL, STATUS_LABEL, PASSWORD_RE } from "@/config/admin.config";

const PAGE_SIZE = 20;

export default {
  name: "AdminAccount",
  components: { Pager },
  data() {
    return {
      keyword: "",
      page: 1,
      pages: 1,
      total: 0,
      list: [],
      loading: false,
      saving: false,
      // 待注销：{ id, username, reason }
      pendingDelete: null,
      // 待重置密码：{ id, username, password }
      pendingPassword: null,
    };
  },
  computed: {
    ...mapGetters("http", ["userInfo"]),
    selfId() {
      return store.get("uid") || this.userInfo?.data?._id || "";
    },
  },
  mounted() {
    this.fetchList(1);
  },
  methods: {
    goBack() {
      this.$router.push({ name: "Index" });
    },

    roleOf(user) {
      return user.role || "user";
    },
    roleLabelOf(user) {
      return ROLE_LABEL[this.roleOf(user)] || "普通用户";
    },
    statusOf(user) {
      return user.effectiveStatus || user.status || "active";
    },
    statusLabelOf(user) {
      return STATUS_LABEL[this.statusOf(user)] || "正常";
    },
    /** 站长自己 + 已注销的账号不给操作入口 */
    canOperate(user) {
      if (!user) return false;
      if (String(user._id) === String(this.selfId)) return false;
      if (this.roleOf(user) === "owner") return false;
      if (this.statusOf(user) === "deleted") return false;
      return true;
    },
    opHint(user) {
      if (String(user._id) === String(this.selfId)) return "这是你自己";
      if (this.roleOf(user) === "owner") return "站长账号不可操作";
      return "账号已注销";
    },

    async fetchList(page = 1) {
      this.loading = true;
      const res = await this.$api({
        type: "adminUserList",
        data: { keyword: this.keyword, page, size: PAGE_SIZE },
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
      this.pendingDelete = null;
      this.pendingPassword = null;
      this.fetchList(1);
    },

    handlePageChange(page) {
      if (this.loading) return;
      this.pendingDelete = null;
      this.pendingPassword = null;
      this.fetchList(page);
    },

    // ==================== 角色 ====================

    async setRole(user, role) {
      this.saving = true;
      const res = await this.$api({
        type: "adminSetRole",
        params: { id: user._id },
        data: { role },
      });
      this.saving = false;
      if (!res || !res.data) return;

      this.$toast.success(res.message || "已更新角色");
      this.fetchList(this.page);
    },

    // ==================== 重置密码 ====================

    startPassword(user) {
      this.pendingDelete = null;
      this.pendingPassword = { id: user._id, username: user.username, password: "" };
    },

    async confirmPassword() {
      const target = this.pendingPassword;
      if (!target || this.saving) return;
      // 格式先在前端拦一道（与后端 setter 同一条正则），省一次注定失败的往返
      if (!PASSWORD_RE.test(target.password)) {
        this.$toast.info("密码需 8-12 位，且包含大写字母、小写字母和数字");
        return;
      }

      this.saving = true;
      const res = await this.$api({
        type: "adminSetPassword",
        params: { id: target.id },
        data: { password: target.password },
      });
      this.saving = false;
      if (!res || !res.data) return;

      this.pendingPassword = null;
      this.$toast.success(res.message || "密码已重置");
    },

    // ==================== 注销（软删）====================

    startDelete(user) {
      this.pendingDelete = { id: user._id, username: user.username, reason: "" };
    },

    async confirmDelete() {
      const target = this.pendingDelete;
      if (!target || this.saving) return;
      if (!target.reason) {
        this.$toast.info("请填写注销理由");
        return;
      }

      this.saving = true;
      const res = await this.$api({
        type: "adminDeleteUser",
        params: { id: target.id },
        data: { reason: target.reason },
      });
      this.saving = false;
      if (!res || !res.data) return;

      this.pendingDelete = null;
      this.$toast.success(res.message || "账号已注销");
      this.fetchList(this.page);
    },
  },
};
</script>
