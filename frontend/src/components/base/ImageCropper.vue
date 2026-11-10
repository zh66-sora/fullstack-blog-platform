<template>
  <!--
    图片裁剪弹窗 — 把「选好的一张图」裁成指定宽高比，产出 Blob

    迁移自 myBlog：
      结构  src/template/cropModal.hbs
      交互  app/components/imageCropper.js（cropImage(file, ratio) → Promise<Blob>）
      样式  src/styl/crop.styl

    与原实现的差异（两处，都是为了适配 Vue）：
      ① 原版把 HTML 塞进全局的 $('.blog-modal') 容器、再拿 jQuery 绑定事件；
         这里换成 el-dialog（拿它现成的遮罩 / 入场动画 / ESC / 滚动锁定），
         卡片本体仍是 .blog-crop_modal--wrap 那套，视觉不变。
      ② 原版是「一个函数返回 Promise」，这里拆成「父级置 visible + 监听 confirm/cancel」，
         因为 Vue 里弹窗的生命周期必须挂在组件上（cropper 实例的建/毁要跟组件对齐）。

    用法：
      <ImageCropper
        :visible.sync="cropVisible"   ← 本项目不用 .sync，父级监听 cancel/confirm 自己置回
        :file="cropFile"
        :ratio="1"
        @confirm="onCropped"
        @cancel="cropVisible = false"
      />
  -->
  <el-dialog
    :visible="visible"
    width="auto"
    top="0"
    :show-close="false"
    custom-class="blog-crop--dialog"
    append-to-body
    :before-close="handleBeforeClose"
    @opened="initCropper"
    @closed="handleClosed"
  >
    <div class="blog-crop_modal--wrap">
      <div class="blog-crop_modal--header">
        <span>裁剪图片</span>
        <button class="blog-crop_modal--close" type="button" @click="cancel">
          <i class="iconfont icon-guanbi"></i>
        </button>
      </div>

      <div class="blog-crop_modal--body">
        <img v-if="objectUrl" ref="image" :src="objectUrl" alt="裁剪图片">
      </div>

      <div class="blog-crop_modal--footer">
        <button class="blog-crop_modal--cancel" type="button" @click="cancel">
          取消
        </button>
        <button class="blog-crop_modal--confirm" type="button" @click="confirm">
          确认裁剪
        </button>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import Cropper from 'cropperjs'
// cropperjs 自带的样式（裁剪框、拖拽手柄、网格线）
import 'cropperjs/dist/cropper.css'

export default {
  name: 'ImageCropper',
  props: {
    // 弹窗显隐。父级用 @cancel / @confirm 把它置回 false
    visible: { type: Boolean, default: false },
    // 待裁剪的原图。⚠ 类型写 File 而不是 Object：File 不是 plain object，
    //   写 Object 会报 `Expected Object, got File`（同 FileUpload.vue 的坑）
    file: { type: File, default: null },
    // 裁剪宽高比（宽/高）：头像 1、背景图 2
    ratio: { type: Number, default: 1 },
  },
  data() {
    return {
      // 原图的本地预览地址（ObjectURL），关闭时释放
      objectUrl: '',
      // cropperjs 实例
      cropper: null,
    }
  },
  watch: {
    // 打开时才建 URL：跟 visible 走，"选了图 → 取消 → 再选" 也不会漏释放
    visible(val) {
      if (val) this.prepare()
      // 关闭不在这里清 —— 要等 @closed（离场动画结束）再销毁 cropper，
      // 否则 cropper 还原 DOM 的动作会跟动画撞上
    },
  },
  beforeDestroy() {
    // 兜底：父级直接销毁组件（没走完关闭动画）时 @closed 不会触发
    this.destroyCropper()
    this.releaseObjectUrl()
  },
  methods: {
    // ── 建 / 毁 ────────────────────────────────────────────────

    /** 把待裁剪的 File 换成 ObjectURL（上一次的先释放，避免泄漏） */
    prepare() {
      this.releaseObjectUrl()
      if (!this.file) return
      this.objectUrl = URL.createObjectURL(this.file)
    },

    /**
     * 初始化 cropperjs —— 挂在 @opened 上（入场动画结束后）
     * 那时弹窗内容一定已经渲染，图片也已经拿到 src
     */
    initCropper() {
      const image = this.$refs.image
      if (!image) {
        // 理论上不会走到这里，兜一层即可（不做递归重试，避免死循环）
        this.$nextTick(() => {
          if (this.$refs.image) this.createCropper(this.$refs.image)
        })
        return
      }
      this.createCropper(image)
    },

    /**
     * 创建 cropper 实例
     * ⚠ 必须等图片加载完：cropper 要读 naturalWidth/naturalHeight 算容器尺寸，
     *   图还没加载完就建，会得到一个 0×0 的裁剪区（原实现同样挂在 img.onload 上）
     */
    createCropper(image) {
      if (this.cropper) return
      const create = () => {
        this.cropper = new Cropper(image, {
          aspectRatio: this.ratio,
          viewMode: 1,        // 裁剪框限制在画布内
          dragMode: 'move',   // 拖拽移动的是图片而不是裁剪框
          autoCropArea: 1,    // 初始裁剪区域最大化
          background: false,  // 不显示网格背景
          responsive: true,
        })
      }
      if (image.complete && image.naturalWidth) create()
      else image.onload = create
    },

    destroyCropper() {
      if (this.cropper) {
        this.cropper.destroy()
        this.cropper = null
      }
    },

    releaseObjectUrl() {
      if (this.objectUrl) {
        URL.revokeObjectURL(this.objectUrl)
        this.objectUrl = ''
      }
    },

    // ── 关闭 / 确认 ────────────────────────────────────────────

    /**
     * 点蒙版 / 按 ESC（el-dialog 只会在这两种用户操作时调 before-close）
     *
     * done(false) —— 不让 el-dialog 自己隐藏：显隐的唯一真相在父级的 visible 上，
     * 交给父级统一置回，避免「弹窗自己关了、父级还以为开着」。
     */
    handleBeforeClose(done) {
      done(false)
      this.cancel()
    },

    // 离场动画结束：销毁 cropper + 释放 ObjectURL
    handleClosed() {
      this.destroyCropper()
      this.releaseObjectUrl()
    },

    cancel() {
      this.$emit('cancel')
    },

    /**
     * 确认裁剪 → 产出 Blob 交给父级
     *
     * ⚠ toBlob 是异步的，回调里不能再碰 this.cropper（父级可能在等待期间就把它关了），
     *   所以先把 canvas 取到手，回调里只做 emit。
     * maxWidth/maxHeight 1024 与原实现一致 —— 头像/背景图都远小于这个尺寸，
     * 正常不会二次缩放，只是给超大原图兜底。
     */
    confirm() {
      const cropper = this.cropper
      if (!cropper) return
      const canvas = cropper.getCroppedCanvas({ maxWidth: 1024, maxHeight: 1024 })
      canvas.toBlob((blob) => {
        if (!blob) {
          this.$toast.error('图片处理失败，请重试')
          return
        }
        this.$emit('confirm', blob)
      }, (this.file && this.file.type) || 'image/jpeg')
    },
  },
}
</script>

<style lang='stylus'>
@import '../../assets/css/themes.styl'

// ============================================================
// 图片裁剪弹窗
// 迁移自 myBlog/src/styl/crop.styl（.blog-crop_modal--* 类名原样保留，方便对照）
//
// ⚠ 声明统一写「属性: 值」带冒号形式（原因见 component.styl 顶部）
// ============================================================

// ===== el-dialog 削成纯容器 =====
// 与 assets/css/modal.styl 里的 .blog-modal--dialog 是同一套做法，
// 这里自带一份、不共用 —— 那个是登录弹窗的尺寸/定位语境，两边改动互不牵动
.blog-crop--dialog
  // 默认是 margin-top: 15vh（由 dialog 的 top 属性给），这里改成视口居中
  // ⚠ top 属性写成 "0" 才压得住：el-dialog 把 marginTop 写成了元素的行内样式
  position: fixed
  top: 50%
  left: 50%
  margin: 0
  transform: translate(-50%, -50%)
  // 白底 / 圆角 / 阴影都由卡片本体（.blog-crop_modal--wrap）提供
  background: transparent
  box-shadow: none
  border-radius: 0

  // el-dialog 默认把内边距分在 __body/__footer/__header 上，全部归零
  .el-dialog__header
    padding: 0

  .el-dialog__body
    padding: 0

  .el-dialog__footer
    padding: 0

// ===== 卡片本体 =====
.blog-crop_modal--wrap
  display: flex
  flex-direction: column
  width: 600px
  max-width: 90vw
  border-radius: $theme-radius.md
  background-color: var(--theme-bgc-card)
  overflow: hidden

.blog-crop_modal--header
  display: flex
  align-items: center
  justify-content: space-between
  flex-shrink: 0
  padding: $theme-spacing.base
  border-radius: $theme-radius.md $theme-radius.md 0 0
  background-color: var(--theme-bgc-deepBtn)
  color: var(--theme-font-fst)
  font-size: $theme-fz.lg
  font-weight: 700

.blog-crop_modal--close
  display: flex
  align-items: center
  justify-content: center
  flex-shrink: 0
  width: 36px
  height: 36px
  border: none
  border-radius: 50%
  // 写死 #fff 在深色下是弹窗头上一块白斑，图标对比度也只有 2.35 → 走主题卡片底
  background-color: var(--theme-bgc-card)
  color: var(--theme-font-fst)
  cursor: pointer
  transition: all 0.2s

  &:hover
    box-shadow: 4px 4px 12px rgba(0, 0, 0, 0.2)
    transform: translateY(-2px)

  i
    pointer-events: none

.blog-crop_modal--body
  padding: $theme-spacing.base
  max-height: 60vh
  overflow: hidden

  #crop-image
    display: block
    max-width: 100%

.blog-crop_modal--footer
  display: flex
  justify-content: flex-end
  flex-shrink: 0
  gap: $theme-spacing.base
  padding: $theme-spacing.base
  border-top: 1px solid var(--theme-border-light)

  button
    padding: $theme-spacing.sm $theme-spacing.lg
    border: none
    border-radius: $theme-radius.xs
    font-size: $theme-fz.base
    cursor: pointer
    transition: all 0.2s

  .blog-crop_modal--cancel
    // 原来是写死的 #f5f5f5 / #e8e8e8 / #666（浅灰三件套）——
    // 深色模式下会变成一块亮按钮，改用主题的小控件三档（常态→hover）
    background-color: var(--theme-bgc-chip)
    color: var(--theme-font-trd)

    &:hover
      background-color: var(--theme-bgc-lightBtn)

  .blog-crop_modal--confirm
    background-color: var(--theme-bgc-deepBtn)
    color: var(--theme-font-sec)
    font-weight: 700

    &:hover
      background-color: var(--theme-font-fst)
      color: #fff
</style>
