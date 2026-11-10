<template>
  <!--
    登录 / 注册模态框
      结构参照 myBlog/src/template/modal.hbs
      视觉基线 myBlog/src/styl/modal.styl，全部样式在 assets/css/modal.styl

    el-dialog 在这里只当「容器」——它自带遮罩、开合动画、滚动锁定、z-index 管理，
    以及点遮罩 / ESC 关闭；视觉由 .blog-modal--dialog 这条覆盖规则削平，卡片本体自己画。

    两块面板并排放在一个 3× 面板宽的容器里，容器默认左移 1×，
    让 2× 宽的可见区正好落在登录面板上；切到注册时容器归位 + 滑块右移。
  -->
  <el-dialog
    :visible="isShow"
    width="auto"
    :show-close="false"
    top="0"
    custom-class="blog-modal--dialog"
    @close="close"
  >
    <!-- transition 时机处理：isSwitching -->
    <div ref="wrap" class="blog-modal--wrap">
      <div
        class="blog-modal--picSlider"
        :class="{ transition: isSwitching, switchPic: isRegister }"
      >
        <img :src="sliderPic" alt="" />
      </div>

      <div
        ref="container"
        class="blog-modal--container"
        :class="{ transition: isSwitching, switchInput: isRegister }"
        @transitionend="endSwitch"
      >
        <!-- ① 注册面板（DOM 顺序在前，与原项目一致） -->
        <div class="blog-modal--element blog-modal--register">
          <div class="blog-modal--head">
            <h4>{{ registerConfig.title }}</h4>
            <span class="blog-modal--close" @click="close">
              <i class="iconfont icon-guanbi"></i>
            </span>
          </div>
          <div class="blog-modal--content">
            <BaseForm ref="registerForm" type="register" />
          </div>
          <div class="blog-modal--foot">
            <el-button
              v-for="btn in registerConfig.btns"
              :key="btn.name"
              :class="{ 'blog-btn--submit': btn.isSubmit }"
              @click="handleBtnClick(btn)"
            >
              {{ btn.name }}
            </el-button>
          </div>
        </div>

        <!-- ② 登录面板 -->
        <div class="blog-modal--element blog-modal--login">
          <div class="blog-modal--head">
            <h4>{{ loginConfig.title }}</h4>
            <span class="blog-modal--close" @click="close">
              <i class="iconfont icon-guanbi"></i>
            </span>
          </div>
          <div class="blog-modal--content">
            <BaseForm ref="loginForm" type="login" />
          </div>
          <div class="blog-modal--foot">
            <el-button
              v-for="btn in loginConfig.btns"
              :key="btn.name"
              :class="{ 'blog-btn--submit': btn.isSubmit }"
              @click="handleBtnClick(btn)"
            >
              {{ btn.name }}
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<script>
import { mapState, mapGetters, mapActions } from "vuex";
import modalConfig from "@/config/modal.config.js";
import { getThemeImage } from "@/config/theme.config";
import BaseForm from "@/components/base/BaseForm.vue";

// 与 modal.styl 里 `.blog-modal--wrap .transition { transition: 0.5s }` 对应，
// 只用来给 transitionend 兜底
const SWITCH_MS = 500;

export default {
  name: "AuthModal",
  components: { BaseForm },
  data() {
    return {
      // 是否正处于「点了切换按钮」的动画窗口期 —— 决定元素上挂不挂 .transition
      // （对应原项目 modalControl.js 里 jQuery 的 addClass/removeClass('transition')）
      isSwitching: false,
      switchTimer: null,
    };
  },
  computed: {
    // type 由 store 的 modal/open(type) 写入，这里只有 login / register 两种取值
    ...mapState("modal", ["isShow", "type"]),
    ...mapGetters("http", ["userInfo"]),
    ...mapGetters("theme", ["mode"]),

    // 当前停在注册面板？（两块面板的显隐、滑块位置都由它决定）
    isRegister() {
      return this.type === "register";
    },
    // 两块面板各自的文案与按钮（这两个 type 总是成对出现）
    loginConfig() {
      return modalConfig.login;
    },
    registerConfig() {
      return modalConfig.register;
    },
    // 左侧滑块图：随白天/夜间切换（bgi-slider-light / bgi-slider-dark）
    // 图片映射统一放在 config/theme.config.js，这里不写死文件名
    // ⚠ 昼夜切换现在只作用于这里（横幅已改由用户资料上的 banner 决定）
    sliderPic() {
      return getThemeImage(this.mode, "slider");
    },
  },
  beforeDestroy() {
    clearTimeout(this.switchTimer);
  },
  watch: {
    /**
     * 根据isShow决定登录/注册模态框是否显示。
     * watch侦听isShow，仅在打开模态框时，触发resetForms（放关闭会因淡出而内容闪烁）
     */
    isShow(val) {
      if (val) this.$nextTick(this.resetForms);
    },
  },
  methods: {
    ...mapActions("modal", ["close", "open"]),
    ...mapActions("http", ["login"]),

    // 按钮统一走事件分发：targetName 对应这里的方法名（close / confirm / switch）
    handleBtnClick(button) {
      const action = button.targetName;
      if (typeof this[action] === "function") {
        this[action]();
      }
    },

    // 登录 ↔ 注册切换（等价于原项目 Modal.switch()）
    // ⚠ 只换 type，不动 isShow —— 弹窗不重新挂载，CSS 过渡才走得出来
    switch() {
      const target = this.isRegister ? "login" : "register";

      // ① 先只挂 .transition，等它真的进到 DOM 之后再换面板 —— 顺序反了就量不到动画
      this.isSwitching = true;
      this.$nextTick(() => {
        // ② 强制一次样式计算，确保浏览器已经「看到」transition 这一条声明
        //    （否则 transition 和 transform 在同一帧里变，过渡不会触发）
        if (this.$refs.wrap) void this.$refs.wrap.offsetWidth;
        // ③ 这一步才会走 0.5s 过渡（滑块右移 / 移动端翻面）
        this.open(target);

        // ④ 兜底：万一 transitionend 没来（属性没实际变化、被中途打断等），也要摘掉类
        clearTimeout(this.switchTimer);
        this.switchTimer = setTimeout(this.endSwitch, SWITCH_MS + 150);
      });
    },

    // 动画结束 → 摘掉 .transition，恢复「一切变化都瞬时生效」
    // transitionend 会从子元素冒泡上来（例如 el-input 聚焦时 border-color 的 .2s 过渡），
    // 所以只认容器自己那一次
    endSwitch(event) {
      if (event && event.target !== this.$refs.container) return;
      this.isSwitching = false;
      clearTimeout(this.switchTimer);
      this.switchTimer = null;
    },

    // 当前该校验哪块表单：两块面板同时存在于 DOM 里，按 type 取
    currentForm() {
      return this.isRegister ? this.$refs.registerForm : this.$refs.loginForm;
    },

    // 清空两块表单的输入与校验状态（见上面 watch isShow）
    // 不能只清当前可见的那块 —— 否则「在注册面板填了内容 → 关闭 → 重开 → 点注册」
    // 还会看到上次的残留
    resetForms() {
      [this.$refs.loginForm, this.$refs.registerForm].forEach(
        (form) => form && form.reset()
      );
    },

    confirm() {
      const form = this.currentForm();
      if (!form) return;

      form.validate((valid) => {
        // 拦截前端校验未通过
        if (!valid) return;
        try {
          // 拼请求数据、发请求（login / register 共用 store 里的 login action，靠 type 区分）
          this.login({
            type: this.type,
            data: form.form,
          }).then(() => {
            this.close();
            const nickname = this.userInfo?.data?.nickname;
            if (nickname) {
              // 登录失败时 userInfo 是空的，避免弹出一句「欢迎，undefined。」
              this.$toast.success(`欢迎，${nickname}。`);
            }
          });
        } catch (err) {
          console.log(err);
        }
      });
    },
  },
};
</script>
