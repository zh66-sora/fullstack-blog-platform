<template>
  <!--
    通用确认弹窗（el-dialog 承载，视觉按本项目自己的弹窗语言画）
    用来替换 element 自带的 this.$confirm —— 那个是 MessageBox 的灰白盒子，
    跟本项目「主题色头部 + 幽灵/实心按钮」的弹窗风格对不上。
    用法与 $confirm 一致：父组件给 visible，@confirm / @cancel 各自处理。
  -->
  <el-dialog
    :visible="visible"
    width="380px"
    top="26vh"
    append-to-body
    :show-close="false"
    destroy-on-close
    custom-class="blog-confirm--dialog"
    @close="$emit('cancel')"
  >
    <!-- 头部：与登录/注册弹窗同一套主题色头 -->
    <div slot="title" class="blog-confirm--head">
      <span>{{ title }}</span>
      <button type="button" class="blog-confirm--close" @click="$emit('cancel')">
        <i class="iconfont icon-guanbi"></i>
      </button>
    </div>

    <div class="blog-confirm--body">
      <!-- iconfont 里没有警告类图标，用 element 自带的 outline 图标 -->
      <i class="el-icon-warning-outline blog-confirm--icon"></i>
      <p class="blog-confirm--message">{{ message }}</p>
    </div>

    <!-- 底部：取消=幽灵按钮，确定=实心主按钮（与登录表单的按钮组一致） -->
    <div class="blog-confirm--foot">
      <el-button class="blog-btn--ghost" @click="$emit('cancel')">
        {{ cancelText }}
      </el-button>
      <el-button class="blog-btn--submit" @click="$emit('confirm')">
        {{ confirmText }}
      </el-button>
    </div>
  </el-dialog>
</template>

<script>
export default {
  name: "ConfirmModal",
  props: {
    visible: { type: Boolean, default: false },
    title: { type: String, default: "提示" },
    message: { type: String, default: "" },
    confirmText: { type: String, default: "确定" },
    cancelText: { type: String, default: "取消" },
  },
};
</script>
