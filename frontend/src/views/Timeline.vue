<template>
  <!--
    时间线管理（/timeline）

    需求来源：Desktop/todo/计划.md 第 61-80 行「时间线模块」
      侧栏「页面导航」在「博客管理」与「退出登录」之间多一条入口，进来管两样东西：
        ① 整页面背景图（「关于」页那条时间线的整屏底图）
        ② 时间轴列表（每条：单项背景图 / 标题 / 年月日 / 说明文字）

    骨架参考 views/Info.vue（个人中心）：
      卡片壳复用 form.styl 的 `.blog-write--editor`（所以顶栏、字段、末行按钮都是现成的），
      交互也照它那套「编辑 / 重置 / 保存」三态 + 字段级校验 + 裁剪后暂存、保存才上传。

    与 Info.vue 的两处不同，都是需求直接要求的：
      ① 列表项自带「删除」（Info 的社媒/友链是删最后一行，这里要能删指定的某一条）
      ② 条目没有上限 —— 列表在本区域内滚动（不是整页滚动）

    保存：**整页一个 PUT**（`{ backgroundImage, items[] }` 整体覆盖），
      成功后重新拉一次数据 —— 于是「表格按年月日重新升序排列」是后端排好、前端照单渲染，
      不是前端自己再排一遍（口径见 myapp/routes/timeline.js）。
  -->
  <el-card
    id="timeline"
    class="blog-card blog-write--editor blog-timeline--wrap"
    :class="{ 'is-editing': isEditing }"
    shadow="never"
  >
    <!-- 顶栏：返回 + 标题（复用全局 .blog-write--header） -->
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        :title="text.backTip"
        @click="goBack"
      ></span>
      <h3>{{ text.title }}</h3>
    </div>

    <div class="blog-write--body">
      <!-- ═══════════ 分区①：整页面背景图 ═══════════ -->
      <h4 class="blog-form--section_title">{{ sections.cover }}</h4>
      <div class="blog-write--field blog-write--field_row">
        <div class="blog-write--label blog-write--label_side">{{ imageLabels.cover }}</div>
        <div class="blog-timeline--cover_field">
          <div
            class="blog-timeline--cover"
            :class="{ 'is-empty': !coverSrc, 'is-error': coverError }"
            @click="pickCover"
          >
            <img v-if="coverSrc" :src="coverSrc" :alt="imageLabels.cover">
            <div v-else class="blog-timeline--placeholder">
              <i class="iconfont icon-picfill"></i>
            </div>
            <div class="blog-timeline--mask">
              <i class="iconfont icon-picfill"></i>
            </div>
          </div>
          <!-- 整页面背景图是必填项：只在没填时报错（这条是错误提示，不是常显说明） -->
          <p v-if="coverError" class="blog-timeline--hint is-error">
            {{ coverHint }}
          </p>
        </div>
      </div>

      <!-- ═══════════ 分区②：时间轴列表 ═══════════ -->
      <div class="blog-timeline--section_head">
        <h4 class="blog-form--section_title">{{ sections.list }}</h4>
        <button
          type="button"
          class="blog-timeline--add"
          :disabled="!isEditing"
          @click="addItem"
        >
          <i class="iconfont icon-aa"></i>
          {{ buttons.add }}
        </button>
      </div>

      <!-- 空列表：给一句话说明怎么开始（不再是「表格空着」） -->
      <p v-if="!form.items.length" class="blog-timeline--empty">
        还没有任何记录，点右上角「{{ buttons.add }}」开始。
      </p>

      <!-- 列表本体：固定高 + 内部滚动（需求：条目没有上限，反正在容器里滚） -->
      <ul v-else class="blog-timeline--list">
        <li v-for="(item, index) in form.items" :key="item.key" class="blog-timeline--item">
          <div class="blog-timeline--item_head">
            <span class="blog-timeline--item_no">{{ String(index + 1).padStart(2, '0') }}</span>
            <span class="blog-timeline--item_date">{{ item.date || '年月日未填' }}</span>
            <button
              type="button"
              class="blog-timeline--item_remove"
              :disabled="!isEditing"
              @click="removeItem(index)"
            >
              <i class="iconfont icon-guanbi"></i>
              {{ buttons.remove }}
            </button>
          </div>

          <div class="blog-timeline--item_body">
            <!-- 单项背景图：缩略图即上传入口（点了就直接选图 → 裁剪） -->
            <div
              class="blog-timeline--thumb"
              :class="{ 'is-empty': !itemSrc(item), 'is-error': fieldError(index, 'backgroundImage') }"
              @click="pickItemImage(index)"
            >
              <img v-if="itemSrc(item)" :src="itemSrc(item)" :alt="imageLabels.item">
              <div v-else class="blog-timeline--placeholder">
                <i class="iconfont icon-picfill"></i>
              </div>
              <div class="blog-timeline--mask">
                <i class="iconfont icon-picfill"></i>
              </div>
            </div>

            <!-- 其余三个字段：由 config/timeline.config.js 的 ITEM_FIELDS 驱动
                 （图片那一条由上面的缩略图承担，所以这里滤掉 type === 'image'） -->
            <div class="blog-timeline--fields">
              <div
                v-for="field in textFields"
                :key="field.name"
                class="blog-timeline--field"
              >
                <label class="blog-timeline--field_label" :for="fieldId(index, field)">
                  {{ field.label }}
                </label>

                <textarea
                  v-if="field.type === 'textarea'"
                  :id="fieldId(index, field)"
                  v-model="item[field.name]"
                  class="blog-timeline--input blog-timeline--textarea"
                  :class="{ 'input-err': fieldError(index, field.name) }"
                  :maxlength="field.maxlength"
                  :placeholder="field.placeholder"
                  :disabled="!isEditing"
                ></textarea>

                <input
                  v-else
                  :id="fieldId(index, field)"
                  v-model="item[field.name]"
                  class="blog-timeline--input"
                  :class="{ 'input-err': fieldError(index, field.name) }"
                  :type="field.type"
                  :maxlength="field.maxlength"
                  :placeholder="field.placeholder"
                  :disabled="!isEditing"
                >

                <!-- 说明文字与个人中心那份同一个做法：默认不显示，出错了才由 CSS 亮出来 -->
                <p
                  class="blog-timeline--hint"
                  :class="{ 'is-error': fieldError(index, field.name) }"
                >
                  {{ itemHints[field.name] }}
                </p>
              </div>
            </div>
          </div>
        </li>
      </ul>

      <!-- ═══════════ 末行：操作按钮 ═══════════ -->
      <div class="blog-write--actions">
        <span v-if="form.items.length" class="blog-timeline--count">
          共 {{ summary.count }} 条 · 约 {{ summary.chars }} 字
        </span>
        <button
          v-if="!isEditing"
          type="button"
          class="blog-write--btn"
          @click="startEdit"
        >
          {{ buttons.edit }}
        </button>
        <template v-else>
          <button type="button" class="blog-write--btn" @click="resetForm">
            {{ buttons.reset }}
          </button>
          <button
            type="button"
            class="blog-write--btn blog-write--submit"
            :disabled="submitting"
            @click="handleSave"
          >
            {{ buttons.save }}
          </button>
        </template>
      </div>
    </div>

    <!-- 选图用的隐藏 input（与 Info.vue 一样：常驻一个复用，不在每次点击时 createElement） -->
    <input
      ref="filePicker"
      class="blog-timeline--file_picker"
      type="file"
      accept="image/*"
      @change="handleFilePicked"
    >

    <!-- 裁剪弹窗：确认后拿到 Blob 暂存，保存时才真正上传 -->
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
import store from "store";
import {
  TIMELINE_TEXT,
  TIMELINE_RATIO,
  ITEM_FIELDS,
  ITEM_RULES,
  ITEM_HINTS,
  COVER_RULE,
  COVER_HINT,
} from "@/config/timeline.config";
import {
  buildTimelineForm,
  cloneTimelineForm,
  validateForm,
  toTimelinePayload,
  summarizeItems,
} from "@/utils/timelineUtils";
import { goLost } from "@/utils/lost";
import ImageCropper from "@/components/base/ImageCropper.vue";
import { uploadOne } from "@/utils/uploadFile";

let uidSeed = 0;
/** 给每个条目一个稳定的客户端 key —— 裁剪/上传的暂存表都按它建键（下标会因为增删而错位） */
const nextKey = () => `timeline-item-${Date.now()}-${(uidSeed += 1)}`;

/** 新建一条空白记录（只有 key 是「有值」的，其余交给校验逼用户填） */
const blankItem = () => ({
  key: nextKey(),
  backgroundImage: "",
  title: "",
  date: "",
  description: "",
});

export default {
  name: "Timeline",
  components: { ImageCropper },
  data() {
    return {
      // 配置（只读，放 data 是为了模板里少写几个 import 别名）
      // ⚠ 顶栏的标题与返回键提示分「关于」/「时间线管理」两套，所以 text 取的是
      //   `TIMELINE_TEXT.manage` 这一支 —— 写 `TIMELINE_TEXT` 整份的话，
      //   `text.title` / `text.backTip` 都取不到值，顶栏会只剩一个返回键、标题是空的（已经踩过一次）。
      text: TIMELINE_TEXT.manage,
      sections: TIMELINE_TEXT.sections,
      buttons: TIMELINE_TEXT.buttons,
      imageLabels: TIMELINE_TEXT.imageLabels,
      itemHints: ITEM_HINTS,
      /** 整页面背景图没填时的提示（= config 的 COVER_HINT，只在错误态显示） */
      coverHint: COVER_HINT,
      /** 表单项（滤掉图片那一条 —— 图片由缩略图承担） */
      textFields: ITEM_FIELDS.filter((field) => field.type !== "image"),

      // 编辑态：查看态下所有控件 disabled（与 Info.vue 一致）
      isEditing: false,
      submitting: false,

      /** 表单：整页面背景图 + 时间轴列表（连行带值的独立副本，不直接引用后端返回的数组） */
      form: { backgroundImage: "", items: [] },
      /** 进入编辑态时的快照（「重置」回滚用） */
      snapshot: null,

      /** 校验态 */
      errors: { cover: false, items: [] },

      // 已裁剪待上传的图（保存时才发请求）
      pendingCover: null,
      pendingItems: {},
      // 未保存前的本地预览地址（ObjectURL）
      previewCover: "",
      previewItems: {},

      // 裁剪弹窗
      cropVisible: false,
      cropFile: null,
      cropRatio: 1,
      /** 这次裁剪是给谁选的：{ type: 'cover' } 或 { type: 'item', key } */
      cropTarget: null,
    };
  },
  computed: {
    ...mapGetters("http", ["userInfo", "isLogin"]),

    /**
     * 当前用户 id：优先 localStorage 的 uid（刷新后还在），回退 userInfo
     * —— 与 Manage.vue / About.vue 同一口径
     */
    currentUserId() {
      return store.get("uid") || this.userInfo?.data?._id || null;
    },

    /** 整页面背景图的显示地址：本地待保存的预览 > 已存下来的 URL */
    coverSrc() {
      return this.previewCover || this.form.backgroundImage;
    },

    /** 整页面背景图是不是错误态（模板里用它，省得在模板里写 errors.cover） */
    coverError() {
      return !!this.errors.cover;
    },

    /** 右下角那句「共 N 条 · 约 M 字」 */
    summary() {
      return summarizeItems(this.form.items);
    },
  },
  async mounted() {
    // ⚠ 刷新后 userInfo 是空的，先把 uid 补出来（顺序不能反，否则这一页会空跑一次请求）
    if (!this.currentUserId && this.isLogin) await this.getUserInfo();
    if (!this.currentUserId) return goLost(this, "loadFailed");

    await this.fetchTimeline(this.currentUserId);
  },
  beforeDestroy() {
    // ObjectURL 不释放会一直占着内存（与 Info.vue 的 clearPendingImages 同理）
    this.clearPendingImages();
  },
  watch: {
    // 弹窗关掉之后清掉暂存的原图，避免下次误用上一次选的文件
    cropVisible(val) {
      if (!val) this.cropFile = null;
    },
  },
  methods: {
    ...mapActions("http", ["getUserInfo"]),

    // ═══════════ 读 ═══════════

    /**
     * 拉当前用户的时间线（GET /api/timeline/:userId）
     *
     * ⚠ 「还没配过」（200 + 空 items）在这里**不跳兜底页**：
     *   管理页正是用来创建第一条记录的地方，跳走就等于没有入口了。
     *   空数据只体现在表单本身（空列表 + 一句引导），兜底页留给展示页。
     */
    async fetchTimeline(uid) {
      const res = await this.$api({ type: "getTimeline", params: { userId: String(uid) } });
      if (!res?.data) return goLost(this, "loadFailed");

      const form = buildTimelineForm(res.data);
      form.items = form.items.map((item) => ({ ...item, key: nextKey() }));
      this.form = form;

      this.isEditing = false;
      this.clearPendingImages();
      this.clearValidate();
    },

    // ═══════════ 编辑 / 重置 ═══════════

    startEdit() {
      // 快照当前数据供「重置」回滚（与 Info.vue 在进入编辑态时取快照同一个做法）
      this.snapshot = cloneTimelineForm(this.form);
      this.isEditing = true;
    },

    resetForm() {
      if (!this.snapshot) return this.$toast.warning("无可恢复的数据");

      this.clearPendingImages();
      // 快照里没有 key（cloneTimelineForm 只留后端的四个字段），重新挂一份，
      // 否则裁剪暂存表会拿着新 key、而快照里是旧 key，两边对不上
      this.form = {
        backgroundImage: this.snapshot.backgroundImage,
        items: this.snapshot.items.map((item) => ({ ...item, key: nextKey() })),
      };
      this.clearValidate();
      this.isEditing = false;
      this.$toast.info("已重置为保存前的状态");
    },

    // ═══════════ 列表增删 ═══════════

    /**
     * 添加一条
     * 需求：「添加的列表项前端暂时直接放在末尾」—— 这里就是 push 到队尾，
     * 不做「按年月日插到中间」的预排；重排只发生在保存成功后重新拉取那一次。
     */
    addItem() {
      if (!this.isEditing) return;
      this.form.items.push(blankItem());
      // 新行没有任何校验态，补一个空错误表占位（模板按下标取）
      this.$set(this.errors.items, this.form.items.length - 1, {});
    },

    /** 删除指定的那一条（不是删最后一行 —— 需求要的是「可以删除」任意一条） */
    removeItem(index) {
      if (!this.isEditing) return;
      const [removed] = this.form.items.splice(index, 1);
      this.errors.items.splice(index, 1);
      // 顺手把它未上传的暂存图清掉（不然会留在内存里、还可能被下一次误用）
      if (removed) this.releasePreview("item", removed.key);
    },

    // ═══════════ 校验 ═══════════

    fieldId(index, field) {
      return `timeline-${index}-${field.name}`;
    },

    /** 某一行的某个字段是否处于错误态（模板里用它，好处是能把「深层取值」收在一处） */
    fieldError(index, name) {
      const row = this.errors.items[index];
      return !!(row && row[name]);
    },

    /** 跑一次整表校验并把结果铺进 errors（字段由 utils/timelineUtils.js 的 validateForm 算） */
    runValidate() {
      const result = validateForm(this.form, ITEM_RULES, COVER_RULE);
      this.errors = { cover: result.cover, items: result.items };
      return result.ok;
    },

    clearValidate() {
      this.errors = { cover: false, items: this.form.items.map(() => ({})) };
    },

    // ═══════════ 保存 ═══════════

    async handleSave() {
      if (this.submitting) return;

      // ① 前端整表校验（不通过就不发请求）
      if (!this.runValidate()) {
        return this.$toast.warning("存在未通过校验的项，请修改后提交");
      }

      this.submitting = true;
      try {
        // ② 上传暂存的裁剪图（整页面背景图 + 每条待换的配图）
        //    任一失败就整次保存中止，避免只更新一半
        let backgroundImage;
        let itemImages;
        try {
          backgroundImage = await this.uploadImageOf("cover");
          itemImages = await Promise.all(
            this.form.items.map((item) => this.uploadImageOf("item", item.key))
          );
        } catch (err) {
          return this.$toast.warning("图片上传失败，请重试");
        }
        if (!backgroundImage) return this.$toast.warning("整页面背景图上传失败，请重试");

        // ③ 组装提交体（顺序 = 表单顺序）
        const payload = toTimelinePayload({
          backgroundImage,
          items: this.form.items.map((item, index) => ({
            ...item,
            backgroundImage: itemImages[index] || item.backgroundImage,
          })),
        });

        const res = await this.$api({ type: "saveTimeline", data: payload });
        // 失败时 Http 层已经弹过 toast（它内部吞掉异常，只返回 undefined）
        if (!res) return;

        this.$toast.success("保存成功");

        // ④ 重新拉一次：后端把 items 按年月日升序排好再落库，这里照单重建表单 ——
        //    「保存后表格重新升序排列」就是这一步的结果，不是前端自己又排一遍
        await this.fetchTimeline(this.currentUserId);
      } finally {
        this.submitting = false;
      }
    },

    /**
     * 取某张图「这次要提交的 URL」
     *   有暂存的裁剪图 → 上传，返回服务端 filePath
     *   没有           → 返回表单上已有的值（编辑态里没换图就是原值）
     * @param {'cover'|'item'} kind
     * @param {string} [key] — kind 为 item 时的条目 key
     * @returns {Promise<string|undefined>}
     */
    async uploadImageOf(kind, key) {
      const blob = kind === "cover" ? this.pendingCover : this.pendingItems[key];
      if (!blob) {
        return kind === "cover" ? this.form.backgroundImage : undefined;
      }

      const file = new File([blob], `${kind}.jpg`, { type: blob.type });
      // 统一走 uploadOne：同内容第二次直接秒传，不再重复落盘
      return (await uploadOne(this, file, "timeline")) || undefined;
    },

    // ═══════════ 图片：预览 / 选图 / 裁剪 ═══════════

    itemSrc(item) {
      return this.previewItems[item.key] || item.backgroundImage || "";
    },

    pickCover() {
      if (!this.isEditing) return;
      this.openPicker({ type: "cover" });
    },

    pickItemImage(index) {
      if (!this.isEditing) return;
      const item = this.form.items[index];
      if (!item) return;
      this.openPicker({ type: "item", key: item.key });
    },

    openPicker(target) {
      this.cropTarget = target;
      // 清一次 value，否则「连续选同一个文件」不会再触发 change
      this.$refs.filePicker.value = "";
      this.$refs.filePicker.click();
    },

    handleFilePicked(event) {
      const file = event.target.files && event.target.files[0];
      event.target.value = "";
      if (!file || !this.cropTarget) return;

      // 裁剪比例：整页面背景图 16:9、单项配图 3:2（后者与展示页的盒子比例一致）
      this.cropRatio =
        this.cropTarget.type === "cover" ? TIMELINE_RATIO.cover : TIMELINE_RATIO.item;
      this.cropFile = file;
      this.cropVisible = true;
    },

    /** 裁剪确认：存 Blob + 换成本地预览（与原项目「先存 Blob，保存才上传」一致） */
    handleCropped(blob) {
      const target = this.cropTarget;
      this.closeCropper();
      if (!target) return;

      const file = new File([blob], "cropped.jpg", { type: blob.type });
      if (target.type === "cover") {
        this.releasePreview("cover");
        this.pendingCover = file;
        this.previewCover = URL.createObjectURL(file);
        // 刚补上的必填项，顺手清掉它的错误态
        this.$set(this.errors, "cover", false);
        return;
      }

      this.releasePreview("item", target.key);
      this.$set(this.pendingItems, target.key, file);
      this.$set(this.previewItems, target.key, URL.createObjectURL(file));

      const index = this.form.items.findIndex((item) => item.key === target.key);
      if (index !== -1 && this.errors.items[index]) {
        this.$set(this.errors.items[index], "backgroundImage", false);
      }
    },

    closeCropper() {
      this.cropVisible = false;
      this.cropFile = null;
      this.cropTarget = null;
    },

    releasePreview(kind, key) {
      if (kind === "cover") {
        if (this.previewCover) {
          URL.revokeObjectURL(this.previewCover);
          this.previewCover = "";
        }
        return;
      }
      if (this.previewItems[key]) {
        URL.revokeObjectURL(this.previewItems[key]);
        this.$set(this.previewItems, key, "");
        this.$delete(this.pendingItems, key);
      }
    },

    /** 释放所有未上传的图（重置 / 保存成功 / 组件销毁时） */
    clearPendingImages() {
      this.releasePreview("cover");
      Object.keys(this.previewItems).forEach((key) => this.releasePreview("item", key));
      this.pendingCover = null;
      this.pendingItems = {};
      this.previewItems = {};
    },

    // ═══════════ 其它 ═══════════

    // 返回主页（与博客管理 / 个人中心的返回键一致）
    goBack() {
      this.$router.push({ name: "Index" });
    },
  },
};
</script>

<style lang='styl'>
// 时间线管理页的样式只在这一页用（与 Info.vue 引 profile.styl 同一个做法）
@import '../assets/css/timeline.styl'
</style>
