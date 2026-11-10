<template>
  <!--
    博客管理：一条博客的简略信息（胶囊）+ 可展开的第二行小字

    结构（样式全在 assets/css/manage.styl）：
      第一行  左侧白色圆圈（所属板块的 iconfont）+ 标题 + 右侧三个按钮（下拉/编辑/删除）
      第二行  所属板块 / 发布时间 / 赞数 / 评论数 / 浏览数 —— **只读**，不带任何交互

    ⚠ 展开状态是**本组件自己的 data**，不是 props：
      允许多条同时展开（需求只说「再次点击下拉收起」，没要求手风琴），
      状态也就没有提升到 Manage 的必要 —— 提升了反而要处理「翻页后残留」。

    ⚠ 展开动效用 element 全局的 el-collapse-transition（不是自己写 max-height）：
      它按 scrollHeight 精确动画高度 + 上下 padding，不用猜一个够大的数值。
      项目里搜索面板（SearchPanel）用的就是这套，两处观感一致。
  -->
  <li class="blog-manage--item" :class="{ 'is-open': open }">
    <div class="blog-manage--row">
      <!-- 左：板块圆圈 -->
      <span class="blog-manage--badge" :title="item.categoryName">
        <i class="iconfont" :class="item.categoryIcon"></i>
      </span>

      <!-- 中：标题（超长省略，悬停出全文） -->
      <span class="blog-manage--title" :title="item.title">{{ item.title }}</span>

      <!-- 右：下拉 / 编辑 / 删除 -->
      <div class="blog-manage--actions">
        <button
          type="button"
          class="blog-manage--btn"
          :title="open ? '收起' : '展开'"
          @click="toggle"
        >
          <i class="iconfont icon-shang blog-manage--caret"></i>
        </button>
        <button
          type="button"
          class="blog-manage--btn"
          title="编辑"
          @click="$emit('edit', item)"
        >
          <i class="iconfont icon-xieboke"></i>
        </button>
        <button
          type="button"
          class="blog-manage--btn blog-manage--btn_danger"
          title="删除"
          @click="$emit('delete', item)"
        >
          <i class="iconfont icon-guanbi"></i>
        </button>
      </div>
    </div>

    <!-- 第二行：只读小字
         ⚠ 两层 div 是**必须**的：外层只负责「被 el-collapse-transition 动画高度」，
           它自己不能有 padding（padding 全在内层）。原因：
           el-collapse-transition 先把 padding 归零、量出 scrollHeight（= 纯内容高），
           再把 height 设成这个数；而本项目全局 box-sizing: border-box，
           于是「height = 内容高」会把 padding 挤进这个 height 之内 ——
           动画结束时清空行内 height，元素会瞬间跳到「内容 + padding」的真实高度。
           实测：内容 19 + padding 16 = 35 布局像素，动画停在 19，最后一帧直接跳 20 屏幕像素
           （这就是「展开到最后阶段很明显的卡顿感」）。
           壳上没有 padding 之后，height 与内容高 1:1，展开/收起两个方向都不会跳。
    -->
    <el-collapse-transition>
      <div v-show="open" class="blog-manage--meta">
        <div class="blog-manage--meta_inner">
          <span class="blog-manage--meta_item">
            <i class="iconfont icon-Category"></i>{{ item.categoryName }}
          </span>
          <span class="blog-manage--meta_item" :title="item.timeAgo">
            <i class="iconfont icon-faburiqi"></i>{{ item.publishDate }}
          </span>
          <span class="blog-manage--meta_item">
            <i class="iconfont icon-xihuan"></i>赞 {{ item.likeNum }}
          </span>
          <span class="blog-manage--meta_item">
            <i class="iconfont icon-pinglun"></i>评论 {{ item.commentNum }}
          </span>
          <span class="blog-manage--meta_item">
            <i class="iconfont icon-yuedu"></i>浏览 {{ item.viewNum }}
          </span>
        </div>
      </div>
    </el-collapse-transition>
  </li>
</template>

<script>
export default {
  name: "ManageItem",
  props: {
    // buildManageListViewModel 的产物
    item: { type: Object, required: true },
  },
  data() {
    return {
      open: false,
    };
  },
  methods: {
    toggle() {
      this.open = !this.open;
    },
  },
};
</script>
