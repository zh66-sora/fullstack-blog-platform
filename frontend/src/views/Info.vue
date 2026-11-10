<template>
  <!--
    个人中心 / 修改个人资料（/info）

    迁移自 myBlog：
      结构  src/template/profile.hbs（原页是 <form class="blog-write--editor blog-card">，
            所以卡片壳和字段样式都复用 form.styl 里的 .blog-write--*）
      数据  app/utils/profileViewModel.js → buildProfileViewModel()
      交互  app/actionControl.js 663-1084（profileAgency，422 行）
      样式  src/styl/profile.styl（→ assets/css/profile.styl）

    与原实现的对应关系（原代码里的 7 块职责 → 这里的位置）：
      ① 编辑按钮          → startEdit()
      ② 保存按钮          → handleSave()
      ③ focus/focusout 校验 → handleFocus() / handleBlur()
      ④ 重置按钮          → resetForm()
      ⑤ 头像/背景图       → pickImage() → ImageCropper → handleCropped()
      ⑥ 社交媒体 +/-      → addSocial() / removeSocial() + socialOptions()
      ⑦ 友情链接 +/-      → addFriend() / removeFriend() + isFriendScrollable

    两处「原实现有、这里不需要」的东西，不是漏迁：
      · profileBus.renderProfilePage —— 模板渲染那一步被这个 SFC 取代
      · profileBus.refreshAuthorCard  —— 49 行 jQuery DOM 操作，被 Vue 响应式取代：
        保存成功后把新资料 commit 回 store，Aside.vue / Home.vue 的 computed 自己会刷新
  -->
  <!-- is-editing：编辑态标记。profile.styl 里「hover 预览框才显示上传蒙版」
       这条规则挂的就是它（原项目是 jQuery addClass('is-editing')） -->
  <el-card
    class="blog-card blog-write--editor"
    :class="{ 'is-editing': isEditing }"
    shadow="never"
  >
    <!-- 顶栏：返回 + 标题（原 profile.hbs 第 20-23 行，复用 write 的顶栏） -->
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        :title="text.backTip"
        @click="goBack"
      ></span>
      <h3>{{ text.title }}</h3>
    </div>

    <div class="blog-profile--body">
      <!-- ═══════════ 分区①：形象 ═══════════ -->
      <h4 class="blog-form--section_title">{{ sections.image }}</h4>
      <!-- 两块结构完全相同（原模板也是复制两份），差别只有 label / is-banner / 裁剪比例，
           所以按配置表展开，不再抄两遍 -->
      <div
        v-for="item in imageFields"
        :key="item.name"
        class="blog-write--field blog-write--field_row"
      >
        <div class="blog-write--label blog-write--label_side">{{ item.label }}</div>
        <div
          class="blog-profile--image_preview"
          :class="item.modifier"
          @click="pickImage(item)"
        >
          <img v-if="imageSrc(item)" :src="imageSrc(item)" :alt="item.label">
          <div class="blog-profile--image_mask">
            <i class="iconfont icon-picfill"></i>
          </div>
        </div>
      </div>

      <!-- ═══════════ 分区②③：基本资料 / 账号安全 ═══════════
           分区小标题由配置表的 section 字段驱动：与上一条不同就打一句标题。
           ⚠ 用 <template v-for> 包住「标题 + 字段」两个兄弟节点，
             两边的 key 都要给（Vue 2 的 template v-for 不能只在外层挂 key） -->
      <template v-for="(item, index) in textFields">
        <h4
          v-if="index === 0 || textFields[index - 1].section !== item.section"
          :key="`section-${item.name}`"
          class="blog-form--section_title"
        >
          {{ item.section }}
        </h4>
        <div :key="item.name" class="blog-write--field">
          <label class="blog-write--label" :for="fieldId(item)">{{ item.label }}</label>
          <input
            :id="fieldId(item)"
            v-model.trim="form[item.name]"
            class="blog-write--input"
            :class="{
              'input-err': errors[item.name],
              'input-active': focused === item.name,
            }"
            :type="item.type"
            :placeholder="item.placeholder"
            :maxlength="item.maxlength"
            :disabled="!isEditing"
            @focus="handleFocus(item.name)"
            @blur="handleBlur(item.name)"
          >
          <!-- 常显的说明 + 校验失败时的红字，是同一个元素
               （原样照搬：默认 display:none，input 挂上 .input-err 才由 CSS 显示） -->
          <p class="blog-profile--input_hint">{{ item.hint }}</p>
        </div>
      </template>

      <!-- ═══════════ 分区④：社交与友链 ═══════════ -->
      <h4 class="blog-form--section_title">{{ sections.links }}</h4>
      <div class="blog-write--field">
        <div class="blog-profile--field_header">
          <span class="blog-write--label">社交媒体</span>
          <!-- ⚠ 原项目这个 +/- 工具栏**不分查看/编辑态**，一直显示，靠 handler 里的
               `if (!_isEditing) return` 早退。这里保持一致；想改成只编辑态显示，
               给这层加 v-if="isEditing" 即可 -->
          <span class="blog-profile--toolbar">
            <span class="profile--social_add" @click="addSocial">+</span>
            <span class="profile--social_remove" @click="removeSocial">−</span>
          </span>
        </div>
        <table class="blog-profile--table">
          <thead>
            <tr>
              <th class="blog-profile--table_icon">{{ text.socialTable[0] }}</th>
              <th>{{ text.socialTable[1] }}</th>
            </tr>
          </thead>
          <tbody class="blog-profile--social_body">
            <tr v-for="(row, index) in form.socialLinks" :key="index">
              <td>
                <!-- 渠道互斥：每行只能选没被其他行占用的平台
                     （原实现是 _refreshSocialDropdowns 手工重建 option 列表，
                       这里由 socialOptions(row) 直接算出来） -->
                <select
                  v-model="row.platform"
                  class="blog-profile--social_platform"
                  :disabled="!isEditing"
                >
                  <option
                    v-for="opt in socialOptions(row)"
                    :key="opt.value"
                    :value="opt.value"
                    :disabled="opt.disabled"
                  >
                    {{ opt.label }}
                  </option>
                </select>
              </td>
              <td>
                <input
                  v-model="row.url"
                  type="text"
                  class="blog-profile--social_url"
                  placeholder="链接或账号"
                  :disabled="!isEditing"
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ═══════════ 区域 8：友情链接 ═══════════ -->
      <div class="blog-write--field">
        <div class="blog-profile--field_header">
          <span class="blog-write--label">友情链接</span>
          <span class="blog-profile--toolbar">
            <span class="profile--link_add" @click="addFriend">+</span>
            <span class="profile--link_remove" @click="removeFriend">−</span>
          </span>
        </div>
        <!-- 超过 LIMITS.friendScroll 行给表格加滚动（原实现是行增删时手工 addClass） -->
        <table
          class="blog-profile--table"
          :class="{ 'blog-profile--table_scrollable': isFriendScrollable }"
        >
          <thead>
            <tr>
              <th class="blog-profile--table_icon">{{ text.friendTable[0] }}</th>
              <th>{{ text.friendTable[1] }}</th>
            </tr>
          </thead>
          <tbody class="blog-profile--link_body">
            <tr v-for="(row, index) in form.friendLinks" :key="index">
              <td>
                <input
                  v-model="row.title"
                  type="text"
                  class="blog-profile--link_title"
                  placeholder="站点名"
                  :disabled="!isEditing"
                >
              </td>
              <td>
                <input
                  v-model="row.url"
                  type="url"
                  class="blog-profile--link_url"
                  placeholder="https://"
                  :disabled="!isEditing"
                >
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- ═══════════ 末行：操作按钮 ═══════════ -->
      <!-- 原项目「重置 / 保存」类名完全一样、看不出主次；这里给「保存」加上
           .blog-write--submit（实心主色），与写博客页的「发表」用同一个类，
           两个页面的「提交」动作长得一样、也和「重置」区分得开 -->
      <div class="blog-write--actions">
        <button
          v-if="!isEditing"
          type="button"
          class="blog-write--btn"
          @click="startEdit"
        >
          {{ text.buttons.edit }}
        </button>
        <template v-else>
          <button type="button" class="blog-write--btn" @click="resetForm">
            {{ text.buttons.reset }}
          </button>
          <button
            type="button"
            class="blog-write--btn blog-write--submit"
            :disabled="submitting"
            @click="handleSave"
          >
            {{ text.buttons.save }}
          </button>
        </template>
      </div>
      <p v-if="isEditing" class="blog-profile--edit_hint">{{ text.editHint }}</p>
    </div>

    <!-- 选图用的隐藏 input（原项目每次点击动态 createElement，这里常驻一个复用） -->
    <input
      ref="filePicker"
      class="blog-profile--file_picker"
      type="file"
      accept="image/*"
      @change="handleFilePicked"
    >

    <!-- 裁剪弹窗：确认后拿到 Blob，暂存到 pendingImages，保存时才真正上传 -->
    <ImageCropper
      :visible="cropVisible"
      :file="cropFile"
      :ratio="cropRatio"
      @confirm="handleCropped"
      @cancel="closeCropper"
    />
  </el-card>
</template>

<script>
import { mapGetters, mapActions } from "vuex";
import {
  LIMITS,
  PROFILE_TEXT,
  PROFILE_TEXT_FIELDS,
  PROFILE_IMAGE_FIELDS,
  PROFILE_SECTIONS,
  SOCIAL_PLATFORMS,
  PROFILE_FIELD_RULES,
} from "@/config/profile.config";
import ImageCropper from "@/components/base/ImageCropper.vue";
import { uploadOne } from "@/utils/uploadFile";

export default {
  name: "Info",
  components: { ImageCropper },
  data() {
    // 图片的两个暂存表都按配置表建键：键在 data() 里就存在，后面 mutate 才是响应式的
    const pendingImages = {};
    const previewUrls = {};
    PROFILE_IMAGE_FIELDS.forEach((field) => {
      pendingImages[field.name] = null;
      previewUrls[field.name] = "";
    });

    return {
      // 配置（只读，放 data 是为了模板里少写几个 import 别名）
      text: PROFILE_TEXT,
      sections: PROFILE_SECTIONS,
      textFields: PROFILE_TEXT_FIELDS,
      imageFields: PROFILE_IMAGE_FIELDS,
      socialPlatforms: SOCIAL_PLATFORMS,

      // 编辑态：查看态下所有控件 disabled（原项目是 prop('disabled', true/false)）
      isEditing: false,
      submitting: false,

      // 表单数据。socialLinks / friendLinks 是「连行带值」的深拷贝，
      // 不直接引用 store 上的数组 —— 否则编辑态里一改就把 store 改了，「重置」也无从回滚
      form: {
        nickname: "",
        oldPwd: "",
        newPwd: "",
        bio: "",
        socialLinks: [],
        friendLinks: [],
      },
      // 进入编辑态时的快照（对应原 profileBus 里缓存的 _profileData）
      snapshot: null,

      // 已裁剪待上传的图（保存时才发请求，与原实现「先存 Blob，保存才上传」一致）
      pendingImages,
      // 未保存前的本地预览地址（ObjectURL）
      previewUrls,

      // 字段错误态 / 当前聚焦的字段（原实现靠 addClass/removeClass 直接改 DOM）
      errors: {},
      focused: "",

      // 裁剪弹窗
      cropVisible: false,
      cropFile: null,
      cropRatio: 1,
      // 这次裁剪是给哪个图片字段选的
      cropTarget: null,
    };
  },
  computed: {
    ...mapGetters("http", ["userInfo", "isLogin"]),

    /** 后端返回的用户资料（GET /api/profile 的 data 部分） */
    profile() {
      return this.userInfo?.data || {};
    },

    /**
     * 昵称的显示值
     * 迁移自 profileViewModel.js 第 32 行：迁移时 nickname 被自动设成 username，
     * 用户没主动改过就当「未设置」显示空 —— 而昵称是必填，于是逼用户填一次
     */
    displayNickname() {
      const { nickname = "", username = "" } = this.profile;
      return nickname && nickname !== username ? nickname : "";
    },

    /** 友链表是否要滚动（原实现：> 5 行加类） */
    isFriendScrollable() {
      return this.form.friendLinks.length > LIMITS.friendScroll;
    },
  },
  created() {
    // ⚠ userInfo 是内存态、刷新即空（见 store/modules/http.js 的注释），进页面补拉一次。
    //   Head.vue 的 mounted 也在拉 —— getUserInfo 内部有并发去重，不会打两次
    if (this.isLogin) this.getUserInfo();
    this.fillForm();
  },
  beforeDestroy() {
    // ObjectURL 不释放会一直占着内存（原实现靠 _clearProfileImageBlobs 收拾）
    this.clearPendingImages();
  },
  watch: {
    /**
     * 资料变化时刷新表单
     * 两种触发场景：
     *   ① 首次 getProfile 回来（created 时 userInfo 还是空的）
     *   ② 保存成功后我们把新资料 commit 回 store
     * ⚠ 编辑态里不能刷 —— 那会把用户正在改的内容冲掉
     */
    userInfo() {
      if (!this.isEditing) this.fillForm();
    },
    // 弹窗关掉之后清掉暂存的原图，避免下次误用上一次选的文件
    cropVisible(val) {
      if (!val) this.cropFile = null;
    },
  },
  methods: {
    ...mapActions("http", ["getUserInfo"]),

    // ═══════════ 表单数据 ↔ 页面 ═══════════

    /**
     * 从当前用户资料生成一份可编辑的表单数据（深拷贝）
     * 对应原实现：buildProfileViewModel() 的产出 + profile.hbs 里 {{#each}} 的展开
     */
    buildFormFromProfile() {
      const p = this.profile;
      return {
        nickname: this.displayNickname,
        // 密码永不回填（原模板就是 value=""），保存后也要求清空
        oldPwd: "",
        newPwd: "",
        bio: p.bio || "",
        socialLinks: (Array.isArray(p.socialLinks) ? p.socialLinks : []).map(
          (link) => ({ platform: link.platform || "", url: link.url || "" })
        ),
        friendLinks: (Array.isArray(p.friendLinks) ? p.friendLinks : []).map(
          (link) => ({ title: link.title || "", url: link.url || "" })
        ),
      };
    },

    /** 用资料重置整张表单（保留行结构，避免直接把 store 上的数组引用拿进来） */
    fillForm() {
      this.form = this.buildFormFromProfile();
      this.clearPendingImages();
      this.clearValidate();
    },

    // ═══════════ ① 编辑 / ④ 重置 ═══════════

    startEdit() {
      // 快照当前资料供「重置」回滚。
      // 原实现是页面渲染时就把 _profileData 存下来，这里在进入编辑态时取 ——
      // 项目里没有「取消编辑」这条路（只有重置/保存），两种时机等价
      this.snapshot = this.buildFormFromProfile();
      this.isEditing = true;
    },

    resetForm() {
      if (!this.snapshot) {
        return this.$toast.warning("无可恢复的数据");
      }
      // 先清未上传的图片（原实现 _clearProfileImageBlobs），再回填快照
      this.clearPendingImages();
      this.form = this.cloneForm(this.snapshot);
      this.clearValidate();
      // 重置也会退出编辑态（与原实现一致）
      this.isEditing = false;
      this.$toast.info("已重置为保存前的状态");
    },

    /** 深拷一份表单（避免回填后继续编辑把快照也改了） */
    cloneForm(source) {
      return {
        ...source,
        socialLinks: source.socialLinks.map((row) => ({ ...row })),
        friendLinks: source.friendLinks.map((row) => ({ ...row })),
      };
    },

    // ═══════════ ③ 字段级校验 ═══════════

    fieldId(item) {
      return `profile-${item.name}`;
    },

    /** 跨字段上下文：目前只有「旧密码是否必填」要看新密码 */
    buildCtx() {
      return { newPwd: (this.form.newPwd || "").trim() };
    },

    /**
     * 单字段校验（对应原 _validateProfileField）
     * @returns {boolean} true 表示未通过
     */
    checkField(name) {
      const rule = PROFILE_FIELD_RULES[name];
      if (!rule) return false;
      return !!rule((this.form[name] || "").trim(), this.buildCtx());
    },

    // 聚焦：清错误态、显示激活态（原实现绑定在 body 的 focus 委托上）
    handleFocus(name) {
      this.focused = name;
      this.$set(this.errors, name, false);
    },

    // 失焦：跑一次本字段校验（原实现用 focusout —— 因为 blur 不冒泡，
    // 而这里是模板上直接绑元素，用 blur 更直白）
    handleBlur(name) {
      this.focused = "";
      this.$set(this.errors, name, this.checkField(name));

      // 跨字段联动（原 _validateProfileField 里那段）：
      // 新密码一改，旧密码的错误态要跟着刷新，否则「先填旧密码、再把新密码清空」
      // 会在旧密码上留着一个永远不消的红框
      if (name === "newPwd") {
        this.$set(this.errors, "oldPwd", this.checkField("oldPwd"));
      }
    },

    /**
     * 整表校验（对应原 _validateProfileForm）
     * @returns {boolean} true 表示存在未通过项
     */
    validateAll() {
      let hasError = false;
      PROFILE_TEXT_FIELDS.forEach(({ name }) => {
        const bad = this.checkField(name);
        this.$set(this.errors, name, bad);
        if (bad) hasError = true;
      });
      return hasError;
    },

    clearValidate() {
      PROFILE_TEXT_FIELDS.forEach(({ name }) => this.$set(this.errors, name, false));
      this.focused = "";
    },

    // ═══════════ ② 保存 ═══════════

    async handleSave() {
      if (this.submitting) return;

      // ① 前端整表校验（不通过就不发请求）—— 原实现同款提示语
      if (this.validateAll()) {
        return this.$toast.warning("表单存在未通过校验的项，请修改后提交");
      }

      this.submitting = true;
      try {
        // ② 上传暂存的裁剪图（原实现：Blob → new File → POST /upload/user）
        //    任一失败就整次保存中止，避免只更新一半
        let avatar;
        let banner;
        try {
          avatar = await this.uploadImageOf("avatar");
          banner = await this.uploadImageOf("banner");
        } catch (err) {
          this.$toast.warning("图片上传失败，请重试");
          return;
        }

        // ③④ 收集文本字段 + 两张表
        //     文本 trim、表格里的值不 trim —— 与原实现逐字一致
        const payload = {
          nickname: (this.form.nickname || "").trim(),
          bio: (this.form.bio || "").trim(),
          avatar,
          banner,
          socialLinks: this.form.socialLinks
            .filter((row) => row.platform)
            .map((row) => ({ platform: row.platform, url: row.url || "" })),
          friendLinks: this.form.friendLinks
            .filter((row) => row.title)
            .map((row) => ({ title: row.title, url: row.url || "" })),
        };

        // 密码：仅当新密码非空才带上（后端会先验旧密码）
        // ⚠ rsaKey 已在 config/api.config.js 的 updateProfile 上配成
        //   ['password', 'oldPassword']，Http 层负责 RSA 加密，这里传明文
        const newPwd = (this.form.newPwd || "").trim();
        if (newPwd) {
          payload.password = newPwd;
          payload.oldPassword = (this.form.oldPwd || "").trim();
        }

        const res = await this.$api({ type: "updateProfile", data: payload });
        // 失败时 Http 层已经弹过 toast（它内部吞掉异常，只返回 undefined）
        if (!res) return;

        // ⑤ 成功后的收尾（对应原实现 success 分支那一整段）
        this.clearPendingImages();
        this.isEditing = false;
        this.clearValidate();
        this.form.oldPwd = "";
        this.form.newPwd = "";

        // 同步 store —— 原实现是 updateCachedProfile + 写 localStorage + refreshAuthorCard()；
        // 这里一次 commit 就够：Aside.vue 的作者卡/友情链接卡、Home.vue 的横幅读的都是
        // userInfo 的 computed，store 一变整站跟着刷
        // ⚠ 不能把密码写进 store（原实现也是 cleanPayload 剔掉 password/oldPassword 才落盘）。
        //   这里用 delete 而不是解构省略 —— eslint 的 no-unused-vars 会把
        //   `const { password, ...rest } = payload` 里的 password 判成未使用变量
        const cleanPayload = { ...payload };
        delete cleanPayload.password;
        delete cleanPayload.oldPassword;
        this.$store.commit("http/SET_USERINFO", {
          ...this.userInfo,
          data: { ...this.profile, ...cleanPayload },
        });

        this.$toast.success("保存成功");
      } finally {
        this.submitting = false;
      }
    },

    /**
     * 取某个图片字段「这次要提交的 URL」
     *   有暂存的裁剪图 → 上传，返回服务端 filePath
     *   没有           → 返回当前资料上的旧值（原实现读的是 data-image-url）
     * @returns {Promise<string|undefined>}
     */
    async uploadImageOf(name) {
      const blob = this.pendingImages[name];
      if (!blob) return this.profile[name] || undefined;

      // 原实现：new File([blob], 'avatar.jpg', { type: blob.type }) —— 文件名写死、
      // 类型沿用 Blob 自己的（裁剪是 canvas.toBlob(..., file.type)，所以类型是对的）
      const file = new File([blob], `${name}.jpg`, { type: blob.type });
      // 统一走 uploadOne：先算 hash 预检，已有同内容就直接秒传，不再传文件体
      const url = await uploadOne(this, file, "user");
      return url || this.profile[name] || undefined;
    },

    // ═══════════ ⑤ 头像 / 背景图 ═══════════

    /** 预览图取哪个地址：本地待保存的预览 > 资料上的值 > 兜底图 */
    imageSrc(item) {
      return this.previewUrls[item.name] || this.profile[item.name] || item.fallback;
    },

    // 点预览框 → 弹系统选图（查看态不可点，与原实现的 _isEditing 早退一致）
    pickImage(item) {
      if (!this.isEditing) return;
      this.cropTarget = item.name;
      // 清一次 value，否则「连续选同一个文件」不会再触发 change
      this.$refs.filePicker.value = "";
      this.$refs.filePicker.click();
    },

    handleFilePicked(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file || !this.cropTarget) return;

      const target = this.imageFields.find((item) => item.name === this.cropTarget);
      this.cropFile = file;
      this.cropRatio = target ? target.ratio : 1;
      this.cropVisible = true;
    },

    /** 裁剪确认：存 Blob + 换成新的本地预览（原实现同款：先存 Blob，保存才上传） */
    handleCropped(blob) {
      const name = this.cropTarget;
      this.closeCropper();
      if (!name) return;

      this.releasePreview(name);
      const file = new File([blob], `${name}.jpg`, { type: blob.type });
      this.pendingImages[name] = file;
      this.previewUrls[name] = URL.createObjectURL(file);
    },

    closeCropper() {
      this.cropVisible = false;
      this.cropFile = null;
      this.cropTarget = null;
    },

    releasePreview(name) {
      if (this.previewUrls[name]) {
        URL.revokeObjectURL(this.previewUrls[name]);
        this.previewUrls[name] = "";
      }
    },

    /** 释放所有未上传的图片（重置 / 保存成功 / 组件销毁时） */
    clearPendingImages() {
      Object.keys(this.previewUrls).forEach((name) => this.releasePreview(name));
      Object.keys(this.pendingImages).forEach((name) => {
        this.pendingImages[name] = null;
      });
    },

    // ═══════════ ⑥ 社交媒体 ═══════════

    /**
     * 某一行的渠道下拉选项：被其他行占用的平台置灰
     * 替代原实现的 _refreshSocialDropdowns（手工重建 option 的 innerHTML）
     */
    socialOptions(row) {
      const usedByOthers = this.form.socialLinks
        .filter((item) => item !== row && item.platform)
        .map((item) => item.platform);
      return SOCIAL_PLATFORMS.map((platform) => ({
        ...platform,
        disabled: usedByOthers.includes(platform.value),
      }));
    },

    addSocial() {
      if (!this.isEditing) return;
      const { social } = LIMITS;
      if (this.form.socialLinks.length >= social) {
        return this.$toast.warning(`最多添加 ${social} 个社交媒体`);
      }
      // 默认选中第一个还没被占用的渠道（原实现 + 分支里同款逻辑）
      const used = this.form.socialLinks.map((row) => row.platform);
      const next = SOCIAL_PLATFORMS.find((platform) => !used.includes(platform.value));
      this.form.socialLinks.push({ platform: next ? next.value : "", url: "" });
    },

    // 原实现是删掉最后一行（不是删哪行点哪行），这里保持一致
    removeSocial() {
      if (!this.isEditing) return;
      this.form.socialLinks.pop();
    },

    // ═══════════ ⑦ 友情链接 ═══════════

    addFriend() {
      if (!this.isEditing) return;
      const { friend } = LIMITS;
      if (this.form.friendLinks.length >= friend) {
        return this.$toast.warning(`最多添加 ${friend} 个友情链接`);
      }
      this.form.friendLinks.push({ title: "", url: "" });
    },

    removeFriend() {
      if (!this.isEditing) return;
      this.form.friendLinks.pop();
    },

    // ═══════════ 其它 ═══════════

    // 返回主页（原项目是顶栏的 data-route="index"）
    goBack() {
      this.$router.push({ name: "Index" });
    },
  },
};
</script>

<style lang='stylus'>
// profile 的样式单独成文件（对齐原项目的 src/styl/profile.styl），
// 但只在本组件里 @import —— 只有进 /info 才注入，不进 main.js 的全局层
@import '../assets/css/profile.styl'
</style>
