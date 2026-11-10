<template>
  <!--
    写博客页 / 编辑博客页（同一份表单，两种模式）
      <FileUpload>  选封面图（只暂存 File，不发请求）
      <RichEditor>  wangEditor（含编辑器内图片的暂存）
    结构照搬原项目 src/template/write.hbs

    ## 两个模式（需求「点击编辑页，复用写博客」）
      新建 —— 路由 /write，本组件直接由 router-view 渲染，在 keep-alive 里缓存
      编辑 —— 路由 /write/:id，由 views/ArticleEdit.vue 套一层渲染本组件并传 articleId
    差别只有四处：填充初始值 / 锁标题与板块 / 重置回快照 / 提交走 PUT。
    表单本身一分钱没改 —— 这就是「复用」而不是「再写一遍」的意思。

    ⚠ 编辑模式下**只锁板块**（标题可改）：
      手法照搬已有的「锁定板块」（Lost 页带 ?category= 进来那套）——
      视觉暗示（.is-locked 降透明）+ pointer-events + 提交时不把 category 放进 body，
      而不是只把输入框置灰了事。
      板块另有第二道保险：后端的可改字段白名单（POP_PUT_MAP）里根本没有 category。
      标题在后端白名单里，编辑提交时一并带上（原来故意不传，导致「编辑改不了标题」）。
  -->
  <el-card class="blog-card blog-write--editor" shadow="never">
    <!-- 顶栏：返回 + 标题。放 el-card 的 header 插槽，做成贴着卡片上沿的整条色块 -->
    <div slot="header" class="blog-write--header">
      <span
        class="blog-write--back iconfont icon-huitui"
        title="返回主页"
        @click="goBack"
      ></span>
      <h3>{{ isEdit ? "编辑这篇博客" : "开始写一篇博客吧" }}</h3>
    </div>

    <div class="blog-write--body">
      <!-- ═══════════ 分区①：文章信息 ═══════════ -->
      <!-- 分区小标题的样式在 assets/css/form.styl（与个人中心共用同一套版式） -->
      <h4 class="blog-form--section_title">文章信息</h4>

      <!-- 博客标题（编辑态也可改：后端 revisable 白名单里本来就有 title） -->
      <div class="blog-write--field">
        <label class="blog-write--label" for="write-title">博客标题</label>
        <input
          id="write-title"
          v-model.trim="form.title"
          type="text"
          class="blog-write--input"
          placeholder="必填:文章标题"
        />
      </div>

      <!-- github 链接 -->
      <div class="blog-write--field">
        <label class="blog-write--label" for="write-github">github链接</label>
        <input
          id="write-github"
          v-model.trim="form.github"
          type="url"
          class="blog-write--input"
          placeholder="非必填：文章主要参考项目的github链接"
        />
      </div>

      <!-- 板块 + 标签（小屏时标签区整体换行） -->
      <div
        class="blog-write--field blog-write--field_row blog-write--field_rowTags"
      >
        <!-- ⚠ 这个 label 里**不能**放「编辑时不可修改」这类长文案：
             label_side 是 flex-shrink: 0 的左侧固定列，多出来的字会让整列变宽，
             并把右边的选单、标签一起往右推。实测编辑态它宽到 208px（正常只有 70px），
             结果标签输入框被顶出卡片右边界（1440 宽就溢出 34px）。
             提示改挂在选单**下方**（见 .blog-write--lock_note），左边这一列因此恒为「板块」二字宽。 -->
        <div class="blog-write--label blog-write--label_side">板块</div>
        <!-- is-locked：编辑态、或从兜底页「去写一篇」跳来时（对应原项目 .blog-write--category.is-locked） -->
        <div
          class="blog-write--category"
          :class="{ 'is-locked': isCategoryLocked }"
        >
          <ul ref="categoryList" class="blog-write--category_list">
            <li
              v-for="item in categories"
              :key="item._id"
              :class="{ selected: item._id === form.category }"
              @click="selectCategory(item)"
            >
              {{ item.name }}
            </li>
          </ul>
          <!-- 锁定提示：贴着被锁的选单，而不是跟着左侧那个固定宽的 label 列 -->
          <p v-if="isEdit" class="blog-write--lock_note">编辑时不可修改</p>
        </div>

        <div class="blog-write--tags_wrapper">
          <div class="blog-write--label blog-write--label_side">标签</div>
          <div class="blog-write--tags" :class="{ 'is-full': isTagsFull }">
            <div class="blog-write--tags_inputRow">
              <input
                v-model="tagInput"
                type="text"
                class="blog-write--tags_input"
                placeholder="输入标签（最多8字）"
                maxlength="8"
                @keyup.enter="addTag"
              />
              <button
                type="button"
                class="blog-write--tags_add"
                @click="addTag"
              >
                添加标签
              </button>
            </div>
            <div class="blog-write--tags_list">
              <span
                v-for="(tag, index) in form.tags"
                :key="tag"
                class="blog-write--tag_chip"
              >
                <span class="blog-write--tag_chip_text">{{ tag }}</span>
                <span class="blog-write--tag_close" @click="removeTag(index)"
                  >×</span
                >
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- 封面图（子组件）
           ⚠ 编辑态把已有封面通过 existing-value 传进去（不是 v-model）：
             v-model 的类型是 File，而回填来的是 URL 字符串，混在一起会触发 prop 类型告警。
             它只负责让按钮进入「✓ 已选择」态 —— 与手选封面后看到的完全一样。 -->
      <div class="blog-write--field blog-write--field_row">
        <div class="blog-write--label blog-write--label_side">封面图</div>
        <FileUpload
          v-model="form.coverFile"
          :existing-value="form.coverUrl"
          button-text="上传封面图"
        />
      </div>

      <!-- ═══════════ 分区②：正文 ═══════════ -->
      <!-- 正文原来是一个 .blog-write--label 色块（和「博客标题」同级），
           编辑器跟其它字段挤成一条平铺的流。这里升成分区小标题，
           「字段标签」与「分区标题」的层级就分开了 -->
      <h4 class="blog-form--section_title">正文</h4>
      <div class="blog-write--field">
        <RichEditor ref="editor" />
      </div>

      <!-- 末行：清空（编辑态是「重置」）/ 发表（编辑态是「保存」）
           ⚠ 按钮文案固定不变：原来提交时会换成「发表中…」，按钮变宽、这一行又是右对齐，
             两个按钮会整体向左跳一下。进行中的反馈交给禁用态 + toast，不靠文字变化 -->
      <div class="blog-write--actions">
        <button
          type="button"
          class="blog-write--btn"
          :disabled="submitting"
          @click="handleReset"
        >
          {{ isEdit ? "重置" : "清空" }}
        </button>
        <button
          type="button"
          class="blog-write--btn blog-write--submit"
          :disabled="submitting"
          @click="handleSubmit"
        >
          {{ isEdit ? "保存" : "发表" }}
        </button>
      </div>
    </div>
  </el-card>
</template>

<script>
import { mapGetters } from "vuex";
import mixins from "@/mixins";
import CATEGORIES from "@/config/category.config";
import FileUpload from "@/components/base/FileUpload.vue";
import RichEditor from "@/components/write/RichEditor.vue";
// 编辑态拉文章详情失败 → 跳全局兜底页（可重试），而不是停在一张空表单上
import { goLost } from "@/utils/lost";
import { uploadMany } from "@/utils/uploadFile";

// 标签上限（原项目 writeFormAgency 里写死 3，列表卡片也只展示 3 个）
const MAX_TAGS = 3;

export default {
  name: "Write",
  components: { FileUpload, RichEditor },
  // 复用项目里的 openDialog（未登录点发表时弹登录框）
  mixins: [mixins],
  props: {
    /**
     * 编辑态的文章 id —— **只有 views/ArticleEdit.vue 会传**。
     * 传了 = 编辑（拉详情回填 + 锁标题板块 + 提交走 PUT）；不传 = 新建（一切照旧）。
     * ⚠ 为什么不直接读 $route.params.id：本组件也被 /write 复用，
     *   显式 prop 才能让「两个模式」在代码里一眼分得开。
     */
    articleId: { type: String, default: "" },
  },
  data() {
    return {
      // 板块列表来自配置表（与后端 categories 集合的 _id 对应）
      categories: CATEGORIES,
      form: {
        title: "",
        github: "",
        category: "",
        tags: [],
        // 封面图：选中的 File（只暂存，提交时才和编辑器里的图一起上传）
        coverFile: null,
        // 已存在的封面 URL（编辑态回填；新建态恒为空串）
        // ⚠ 与 coverFile 分开存：一个是「这次新选的 File」，一个是「上一版存的 URL」。
        //   提交时前者优先，没选新图才沿用后者 —— 两者类型不同（File / String），
        //   挤在一个字段里迟早写错。
        coverUrl: "",
      },
      // 标签输入框的当前内容
      tagInput: "",
      // 发表中：按钮禁用，避免连点提交两篇
      submitting: false,
      // 编辑态：从后端拉回来的那一份原文（含正文 HTML）。
      // 点「重置」回到这里，而不是回到空白 —— 需求：「重置到这个填充的初始状态」
      initialSnapshot: null,
    };
  },
  computed: {
    ...mapGetters("http", ["isLogin"]),
    // 是否编辑态
    isEdit() {
      return !!this.articleId;
    },
    isTagsFull() {
      return this.form.tags.length >= MAX_TAGS;
    },
    // 兜底页「去写一篇」跳来时带的板块 id（原项目是 routerControl 的 req.body.categoryId）
    lockedCategoryId() {
      return this.$route.query.category || "";
    },
    /**
     * 是否处于「锁定板块」状态（对应原项目给容器加的 .is-locked）
     * ⚠ 两个来源：编辑态**恒定锁定**（需求：编辑时锁标题与板块）；
     *   新建态只在带着 ?category= 从兜底页进来时锁定。
     */
    isCategoryLocked() {
      return this.isEdit || !!this.lockedCategoryId;
    },
  },
  created() {
    if (this.isEdit) this.loadArticle();
    else this.syncLockedCategory();
  },
  /**
   * keep-alive 把本页重新塞回页面之后，补一次「选中板块滚进可视区」
   *
   * ⚠ 必须在这里补：watch 那一次触发时组件可能还没回到文档，量不到尺寸（详见
   *   scrollCategoryIntoView 的说明）。而 activated 是在元素真正回到 DOM 之后才触发的。
   * ⚠ 重复调用是幂等的：已经对齐时算出来的位移就是 0；
   *   被夹在滚动上限的那些（选单只有 3 行高，末尾几项本来就只能停在底部）再加也还是上限。
   */
  activated() {
    if (this.form.category) this.scrollCategoryIntoView();
  },
  watch: {
    /**
     * ⚠ 本页被 keep-alive 缓存（Home.vue 的 include="Index,Write"）：
     *   从 /write 去兜底页、再带 ?category= 回来时，组件实例不会重建、created 不会重跑，
     *   只有 watch 能接住这个变化。反过来 query 消失（点了「清空」）就自动解锁。
     */
    lockedCategoryId() {
      this.syncLockedCategory();
    },
    /**
     * ⚠ 编辑态换文章（/write/A → /write/B）命中的是**同一条路由记录**，
     *   组件实例被复用、created 不会重跑 —— 不 watch 的话会停在上一篇的内容上。
     *   （与 CommentSection 必须 watch articleId 是同一个坑）
     * ⚠ ArticleEdit 不进 keep-alive，所以这条 watch 只在「编辑页之间互跳」时起作用；
     *   从 /write 过来是**另一个实例**，走的是 created 那条路。
     */
    articleId() {
      if (this.isEdit) this.loadArticle();
    },
  },
  methods: {
    /**
     * 同步「锁定板块」：有 ?category= 就预选上，并把它滚进可视区
     *
     * 原项目是 articleBus._lockCategory()（373-389 行）：延迟 150ms 等 res.render
     * 出来的 DOM，再给 li 加 selected、给容器加 is-locked、最后 scrollIntoView。
     * Vue 里 DOM 由数据驱动，不需要那 150ms —— form.category 一改，选中态自己就出来了。
     */
    syncLockedCategory() {
      const id = this.lockedCategoryId;
      if (!id) return;
      this.form.category = id;
      this.scrollCategoryIntoView();
    },

    /**
     * 把选中的板块滚进选单可视区
     *
     * 被锁的板块要出现在选单的**最上方**（原项目只求 scrollIntoView 让它露出来）。
     * 直接改选单自己的 scrollTop：下方行数不够时浏览器会自动夹住，
     * 该板块就自然落在中间/下面 —— 正是要的效果。
     * ⚠ 不用 scrollIntoView({ block:'start' })：那会连带滚动外层窗口，把整页位置也带跑。
     *
     * ⚠⚠ 这里必须把「已缩放」的 rect 差值**换算回布局像素**再用，不能直接相减：
     *   全站 body 上有 zoom: 1.25（见 global.styl），于是
     *     getBoundingClientRect() → 返回**缩放后**的屏幕像素
     *     scrollTop              → 收的是**未缩放**的布局像素
     *   两者混算会把位移放大 1.25 倍。选单总共才 116 布局像素高，
     *   多滚出去的那几十像素足以把选中项顶到可视区**外面** ——
     *   实测：编辑《Docker 多阶段构建优化镜像体积》（板块 = 创业，第 7 项）时，
     *   应滚 304 却被算成 380，撞到上限 344，选中项落在可视区上方 49px，整条看不见。
     *   折算比例用「rect 高度 ÷ offsetHeight」现算，不在代码里硬写 1.25
     *   （改主题、改缩放都不用回来动这里）。
     */
    scrollCategoryIntoView() {
      this.$nextTick(() => {
        const list = this.$refs.categoryList;
        if (!list) return;
        // ⚠ 本页在 keep-alive 里（见 Home.vue）：带 ?category= 从别处切回来时，
        //   watch 触发的那一刻组件可能**还没被塞回文档**（刚才是缓存的、已从 DOM 摘掉）。
        //   那时元素没有布局 —— offsetHeight 是 0、rect 全是 0，
        //   于是「rect 高度 ÷ offsetHeight」算出 NaN（NaN || 1 又会把它悄悄变成 1），
        //   位移成 0、滚动静默失效。这种情况交给 activated() 补一次，这里直接退出。
        if (!list.offsetHeight) return;
        const selected = list.querySelector("li.selected");
        if (!selected) return;
        const listRect = list.getBoundingClientRect();
        const scale = listRect.height / list.offsetHeight;
        list.scrollTop +=
          (selected.getBoundingClientRect().top - listRect.top) / scale;
      });
    },

    // 选板块：锁定态下点不动（CSS 已经 pointer-events: none，这里再兜一层）
    selectCategory(item) {
      if (this.isCategoryLocked) return;
      this.form.category = item._id;
    },

    // 返回主页（原项目是 data-route="index" → 路由跳转）
    goBack() {
      this.$router.push({ name: "Index" });
    },

    // ---- 标签：添加 / 删除 ----
    // 规则与原项目一致：空值忽略、去重、最多 MAX_TAGS 个（满了按钮置灰）
    addTag() {
      const label = this.tagInput.trim();
      if (!label || this.isTagsFull) return;
      if (this.form.tags.includes(label)) {
        this.tagInput = "";
        return;
      }
      this.form.tags.push(label);
      this.tagInput = "";
    },
    removeTag(index) {
      this.form.tags.splice(index, 1);
    },

    // ---- 清空 ----
    // 把状态复位（含编辑器与图片暂存）
    // 两个调用点：用户点「清空」按钮（新建态），以及发表成功之后（见 handleSubmit 里那段说明）
    handleClean() {
      this.form = {
        title: "",
        github: "",
        category: "",
        tags: [],
        coverFile: null,
        coverUrl: "",
      };
      this.tagInput = "";
      if (this.$refs.editor) {
        this.$refs.editor.clearPendingFiles();
        this.$refs.editor.setHtml("<p><br></p>");
      }
    },

    // ==================== 编辑态：拉原文、回填、快照 ====================

    /**
     * 拉这篇文章的详情并回填表单
     *
     * ⚠ 带 `skipView: 1`：详情接口默认会给 viewNum +1（后端 POP_GET_MAP 的后置操作），
     *   而「作者点开编辑页」是读自己的稿子、不是读者在看文章 ——
     *   不加这个参数的话，每进一次编辑页就给自己刷一次浏览量，
     *   而这个数字就显示在博客管理的展开行里，一眼能看出来。
     */
    async loadArticle() {
      const id = this.articleId;
      if (!id) return;
      try {
        const res = await this.$api({
          type: "queryResourceDetail",
          params: { resource: "articles", id },
          data: { skipView: 1 },
        });
        const doc = res?.data;
        // 文章不存在 / 被删了 / 请求失败 —— 整页就靠这一次请求，直接去兜底页（能重试）
        if (!doc?._id) return goLost(this, "loadFailed");
        this.fillForm(doc);
      } catch (err) {
        goLost(this, "loadFailed");
      }
    },

    /**
     * 把后端文档填进表单，并记下「初始快照」
     *
     * ⚠ 快照必须在这里存一次：需求要求编辑态的「重置」回到
     *   **填充后的初始状态**，而不是清空 —— 没有快照就只能清空。
     * ⚠ 正文要等编辑器就绪（$nextTick）：setHtml 是 RichEditor 暴露的方法，
     *   editor 实例在它自己的 mounted 里建，父组件 created 阶段还不能用。
     */
    fillForm(doc) {
      this.form = {
        title: doc.title || "",
        github: doc.gitHubUrl || "",
        // category 兼容 populate 后的 { _id, name } 与裸 _id 字符串
        category: String(doc.category?._id ?? doc.category ?? ""),
        tags: Array.isArray(doc.tags) ? [...doc.tags] : [],
        // 这次还没选新封面；把已有的 URL 交给 FileUpload 显示「已选择」
        coverFile: null,
        coverUrl: doc.coverImage || "",
      };
      this.tagInput = "";

      const html = doc.content || "<p><br></p>";
      this.$nextTick(() => {
        if (this.$refs.editor) {
          this.$refs.editor.clearPendingFiles();
          this.$refs.editor.setHtml(html);
        }
        this.scrollCategoryIntoView();
      });

      // 浅拷贝存快照：tags 是数组，不复制会跟着表单一起被改
      this.initialSnapshot = {
        form: { ...this.form, tags: [...this.form.tags] },
        html,
      };
    },

    /** 编辑态点「重置」：回到刚拉回来的那一份（不是回到空白） */
    restoreInitial() {
      const snap = this.initialSnapshot;
      if (!snap) return this.handleClean();
      this.form = { ...snap.form, tags: [...snap.form.tags] };
      this.tagInput = "";
      if (this.$refs.editor) {
        this.$refs.editor.clearPendingFiles();
        this.$refs.editor.setHtml(snap.html);
      }
    },

    /**
     * 用户点「清空 / 重置」
     *
     * 新建态：复位表单，并顺手解除板块锁定。
     *   原项目的「清空」是跳 /write/clean → resetWritePage() → 重新加载写页（不带 categoryId），
     *   锁定态因此一并消失。这里等价地做：把 query 去掉，watch 接住后解锁 ——
     *   否则从兜底页进来锁定后，用户再也换不了板块。
     *   （发表成功走的是 handleClean，不带这一步：它马上就跳去详情页了）
     * 编辑态：回到快照，**不动路由**（板块本来就该一直锁着）。
     */
    handleReset() {
      if (this.isEdit) return this.restoreInitial();
      this.handleClean();
      if (this.lockedCategoryId) {
        this.$router.replace({ name: "Write" });
      }
    },

    // ==================== 提交 ====================

    /**
     * 图片上传：封面 + 编辑器里暂存的图，合并成一次 POST /upload/article
     *
     * 两条提交路径（新建 / 编辑）共用这一段 —— 差异只在最后存库调哪个接口。
     * 副作用：编辑器里还是 blob 预览地址的图，会被换成真实地址（否则存进库里的是本地 blob）。
     *
     * @param {object} editor — RichEditor 实例
     * @returns {string|null} 封面的真实 URL；**没有选新封面时返回空串**；
     *                        上传失败返回 null（调用方据此中止提交）
     */
    async uploadImages(editor) {
      const pending = editor ? editor.getPendingFiles() : [];
      const coverFile = this.form.coverFile;
      const files = (coverFile ? [coverFile] : []).concat(
        pending.map((item) => item.file)
      );
      if (!files.length) return "";

      // 逐文件上传（内部并发上限 3）：每个文件独立走「算 hash → 预检 → 上传」，
      // 返回值顺序与 files 严格一致，不再依赖「一次请求返回数组的下标」——
      // 那样一旦部分文件命中秒传、返回数组变短，就会静默把 A 的图配给 B。
      const urls = await uploadMany(this, files, "article");
      if (urls.some((url) => !url)) {
        this.$toast.error("图片上传失败，请重试");
        return null;
      }

      // 用 File → URL 的映射配对（与改造前同一套，只是 url 来源变了）
      const urlMap = new Map(files.map((file, index) => [file, urls[index]]));
      const coverImage = coverFile ? urlMap.get(coverFile) || "" : "";

      if (pending.length) {
        let nextHtml = editor.getHtml();
        pending.forEach((item) => {
          nextHtml = nextHtml.replaceAll(
            item.blobUrl,
            urlMap.get(item.file) || item.blobUrl
          );
        });
        editor.setHtml(nextHtml);
        editor.clearPendingFiles();
      }
      return coverImage;
    },

    // ---- 提交入口：按模式分流 ----
    //   校验（快速失败，别白传一遍图片）→ 未登录先弹登录框 → 交给对应那条路
    async handleSubmit() {
      if (this.submitting) return;

      const editor = this.$refs.editor;
      const html = editor ? editor.getHtml() : "";
      const { title, category } = this.form;

      if (!html.replace(/<[^>]*>/g, "").replace(/\s|&nbsp;/g, "")) {
        return this.$toast.warning("文章内容不能为空");
      }
      // 标题两种模式都要校验（编辑态已可改）
      if (!title) return this.$toast.warning("标题不能为空");
      // 板块只有新建态才选：编辑态它锁着，值是从后端回填的
      if (!this.isEdit && !category) return this.$toast.warning("请选择文章板块");

      // 未登录：和点赞一样先弹登录框（接口要 JWT，不拦只会看到一句报错）
      if (!this.isLogin) {
        this.openDialog("login");
        return;
      }

      return this.isEdit ? this.submitEdit() : this.submitCreate();
    },

    // ---- 发表（新建）----
    //   图片合并成一次上传 → 编辑器内 blob 地址换成真实 URL → POST 建文章 → 跳详情
    async submitCreate() {
      const editor = this.$refs.editor;
      const { title, github, category, tags } = this.form;

      this.submitting = true;
      try {
        const coverImage = await this.uploadImages(editor);
        if (coverImage === null) return;

        // 通用 REST 接口，resource 用 articles（与原项目 submitArticle 一致）
        //    content 直接存编辑器产出的 HTML：库里的历史数据就是这个格式，详情页也是原样 v-html
        const res = await this.$api({
          type: "createResource",
          params: { resource: "articles" },
          data: {
            title,
            content: editor.getHtml(),
            gitHubUrl: github,
            publishDate: new Date(),
            category,
            tags,
            coverImage,
          },
        });

        // 成功的显式反馈 + 跳去新文章的详情页
        //    ⚠ 创建接口返回的是 { message: '创建成功', _id }：_id 在信封顶层，不在 data 里
        const id = res?._id;
        if (!id) return this.$toast.error("发表失败，请重试");
        this.$toast.success("发表成功");

        // ⚠ 本页被 keep-alive 缓存了（见 Home.vue），跳走再回来不会重建 ——
        //   不主动复位的话，下次进来编辑器里还是刚发表的那一篇
        //   （原项目跳详情页是整页重载，天然就是空的）。
        this.handleClean();
        this.$router.push({ name: "Article", params: { id } });
      } finally {
        this.submitting = false;
      }
    },

    // ---- 保存（编辑）----
    //   图片上传同新建 → PUT 更新 → 回博客管理
    async submitEdit() {
      const editor = this.$refs.editor;

      this.submitting = true;
      try {
        const coverImage = await this.uploadImages(editor);
        if (coverImage === null) return;

        const res = await this.$api({
          type: "updateResource",
          params: { resource: "articles", id: this.articleId },
          data: {
            // 标题可改：后端 revisable 里本来就有 title，之前是前端故意不传
            title: this.form.title,
            content: editor.getHtml(),
            // 没选新封面就沿用原来那张（coverUrl 是回填进来的既有 URL）
            coverImage: coverImage || this.form.coverUrl || "",
            gitHubUrl: this.form.github,
            tags: this.form.tags,
            // ⚠ **不要**把 category 放进 body：后端 revisable 里没有它，传了也会被过滤
          },
        });
        if (!res) return;

        this.$toast.success("保存成功");
        // 回到来处（博客管理）—— 那边不在 keep-alive 里，会重拉一次，
        // 展开行里的数字、标题都是更新后的
        this.$router.push({ name: "Manage" });
      } finally {
        this.submitting = false;
      }
    },
  },
};
</script>

<style lang='stylus'>
@import '../assets/css/themes.styl'

// ============================================================
// 写博客页 —— 只留本页独有的样式
//
// ⚠ 表单基底（卡片壳 / 顶栏 / --body / --field / --label / --input /
//   --field_row / --actions / --btn）已提到 assets/css/form.styl ——
//   个人中心（Info.vue）用的是同一套壳（原 profile.hbs 就是
//   <form class="blog-write--editor blog-card">），两边共用，由 main.js 全局引入。
//   本文件只放写博客页独有的两块：板块选单 + 标签。
//
// ⚠ 声明统一写「属性: 值」带冒号形式：Stylus 对「无冒号 + 值是多段」有歧义，
//   紧跟缩进更深的嵌套块时会被当成选择器解析、整条静默丢失（详见 component.styl）。
// ============================================================

// ===== 板块选单 =====
// 迁移自 myBlog/src/styl/write.styl —— 注意原文件里同名规则写了**两遍**
// （第 54-97 行一处；第 145-166 行把 `&_list` 嵌套在 .blog-write--category 下，又一处），
// 两者权重相同、后者在后 → 后者覆盖前者。下面给的是两处叠加后的**实际生效值**：
// 于是会有「height: 50px 配 line-height: 36px」这种产物 —— 是原样保留的，不是笔误。
.blog-write--category
  flex: 1
  padding-right: $theme-spacing.base

.blog-write--category_list
  // 原项目是固定 150px 宽（不是撑满容器）
  width: 150px
  // 原项目写的是 height: 150px + max-height: 116px —— 实际高度由 max-height 决定
  // （一次露出 3 行多一点：36px * 3 + 8px）
  max-height: 116px
  margin: 0
  padding: $theme-spacing.xs 0
  overflow-y: auto
  overflow-x: hidden
  list-style: none
  border: 1px solid var(--theme-border)
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-card)
  box-shadow: $theme-shadows.sm
  -webkit-overflow-scrolling: touch
  // 细滚动条（原项目自定义的那套）
  scrollbar-width: thin
  scrollbar-color: #c1c1c1 transparent

  &::-webkit-scrollbar
    width: 5px

  &::-webkit-scrollbar-track
    background: transparent
    margin: 4px 0

  &::-webkit-scrollbar-thumb
    background: #c1c1c1
    border-radius: 3px

    &:hover
      background: #a0a0a0

  li
    // height / 边框 / 居中 / 灰底都来自前一处，行高被后一处覆盖成 36px
    height: 50px
    line-height: 50px
    padding: 0 $theme-spacing.base
    text-align: center
    // 原项目这里是 #EEEEEE 底 + #9ca38e 字（一个偏橄榄的灰），和主题蓝放在一起很脏，
    // 改走表单那套冷调 token，与输入框的只读态一个观感
    background-color: var(--theme-bgc-input)
    color: var(--theme-font-trd)
    border-bottom: 1px solid var(--theme-border-light)
    cursor: pointer

    &:hover
      background-color: var(--theme-bgc-lightBtn)
      color: var(--theme-font-light)

    // 选中项：比 hover（浅蓝）再深一档，两级状态就分得开了
    // （原项目 hover 用 #E2F0FF、选中用 #E8F0FE，两者肉眼几乎一样）
    // 放在 hover 之后：选中项被 hover 时保持选中底色
    &.selected
      background-color: var(--theme-bgc-deepBtn)
      color: var(--theme-font-fst)
      font-weight: 700

// ===== 锁定态：板块 / 标题 =====
// 迁移自 myBlog/src/styl/write.styl 第 309-319 行
// 原实现是「三层保障」：CSS pointer-events:none + JS 事件早退 + opacity 视觉暗示。
// 后两者分别是 selectCategory() 里的早退，和这里的 opacity
.blog-write--category.is-locked
  opacity: 0.7

  .blog-write--category_list
    pointer-events: none

    li
      cursor: default

      &:hover
        background-color: transparent

      &.selected
        cursor: default

// 编辑态的标题：与板块锁定同一套手法（视觉暗示 + 只读 + 提交时不带上它）
// ⚠ 用原生 readonly 而不是 disabled：disabled 的输入框拿不到焦点、文字也选不中，
//   用户想复制一下自己的标题都不行；readonly 只是不能改。
.blog-write--field.is-locked
  opacity: 0.7

  .blog-write--input
    cursor: not-allowed

    &:focus
      border-color: var(--theme-border)

// 「编辑时不可修改」那行小字：跟在 label 后面，不抢眼
// ⚠ 只给「博客标题」那种**独占一行**的 label 用（它往右长不影响谁）。
//   板块那一行的 label 是固定宽的左侧列，长文案会把整行往右推，改用 .blog-write--lock_note。
.blog-write--lock_tip
  margin-left: $theme-spacing.sm
  color: var(--theme-font-trd)
  font-size: $theme-fz.sm
  font-weight: 400

// 板块的锁定提示：挂在选单正下方（贴边左对齐，与选单同一条竖线）
.blog-write--lock_note
  margin: $theme-spacing.xs 0 0
  color: var(--theme-font-trd)
  font-size: $theme-fz.sm
  font-weight: 400
  white-space: nowrap

// ===== 标签 =====
// ⚠ 「板块 + 标签」这一行允许换行：窄屏时把「标签」整块掉到下一行，
//   而不是让它里面的输入框横着顶出卡片（换行的触发点在下面 tags_wrapper 的 min-width）。
.blog-write--field_rowTags
  flex-wrap: wrap

.blog-write--tags_wrapper
  display: flex
  flex: 1
  // ⚠ 注意这个 min-width 的作用是**换行触发点**，不是「不许小于」：
  //   行内宽度放不下「板块列 + 标签列」时（约 560px 以下），标签列整块换行；
  //   放得下时它对分配毫无影响（flex 分配看的是 flex-basis，不是 min-width）。
  //   取值 ≈「标签」label + 间距 + 一个还能正常输入的框。
  min-width: 250px
  align-items: flex-start
  gap: $theme-spacing.base

.blog-write--tags
  flex: 1
  // ⚠ 原来这里是 min-width: 200px —— 它就是「标签输入框顶出卡片」的直接原因：
  //   200px 是硬下限，容器被挤到不够时它不缩、只溢出。
  //   现在「要不要换行」交给外层 wrapper 的 min-width 判，这里允许自由收缩。
  min-width: 0

.blog-write--tags_inputRow
  position: relative

.blog-write--tags_input
  display: block
  box-sizing: border-box
  width: 100%
  margin: 0
  // 右侧留出「添加标签」按钮的位置
  padding: 0 80px 0 $theme-spacing.base
  line-height: 33px
  border: 1px solid var(--theme-border)
  border-radius: $theme-radius.xs
  // 这是可编辑输入框，跟主表单口径一致：白底 = 可改
  background-color: var(--theme-bgc-input-edit)
  color: var(--theme-font-light)
  font-size: $theme-fz.sm
  outline: none

  &::placeholder
    color: var(--theme-font-placeholder)

  &:focus
    outline: none
    border-color: var(--theme-font-fst)

.blog-write--tags_add
  position: absolute
  right: 4px
  top: 50%
  transform: translateY(-50%)
  padding: 4px 10px
  border: none
  border-radius: $theme-radius.md
  background-color: var(--theme-font-fst)
  color: #fff
  font-size: 13px
  white-space: nowrap
  cursor: pointer
  transition: all 0.2s ease

  &:hover
    background-color: var(--theme-font-sec)

.blog-write--tags_list
  display: flex
  flex-wrap: wrap
  gap: $theme-spacing.sm
  margin-top: $theme-spacing.base

  // 没有标签时不占位置
  &:empty
    display: none

// 满 3 个：置灰且点不动
.blog-write--tags.is-full .blog-write--tags_add
  pointer-events: none
  opacity: 0.5

.blog-write--tag_chip
  display: inline-flex
  align-items: center
  gap: 6px
  padding: 4px 10px
  border-radius: 0
  background: linear-gradient(to right, var(--theme-font-fst), var(--theme-bgc-deepBtn))
  color: #fff
  font-size: $theme-fz.sm
  line-height: 1.5

// 溢出才省略：max-width 放在文字上，chip 本身按内容自然撑开
.blog-write--tag_chip_text
  max-width: 160px
  overflow: hidden
  text-overflow: ellipsis
  white-space: nowrap

.blog-write--tag_close
  flex-shrink: 0
  font-size: 15px
  line-height: 1
  opacity: 0.8
  cursor: pointer
  transition: opacity 0.15s

  &:hover
    opacity: 1

// 末行按钮（.blog-write--actions / .blog-write--btn）与「发表」的实心主色
// （.blog-write--submit）都已提到 assets/css/form.styl —— 个人中心的「保存」
// 现在也用同一个类，两个页面的提交按钮长得一样。
// ⚠ 提上去之后不再依赖「本组件样式后注入」来压过基底：form.styl 里那条
//   `.blog-write--btn.blog-write--submit` 权重 (0,2,0)，稳压基底的 (0,1,0)。
</style>
