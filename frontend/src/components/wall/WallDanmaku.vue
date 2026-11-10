<template>
  <!--
    弹幕留言墙（侧栏「扩展功能」下面那张卡片，views/Aside.vue 挂载）

    ## 它是什么
    手机版 QQ 空间留言板那种形态：五条轨道，一条条弹幕从右往左飞过。
    每条弹幕 = 圆形头像 + 一段留言正文的气泡。

    ## 与需求对齐的硬规则
    ① **只飞顶层留言，不飞回复** —— 池子取自 GET /api/wall/:uid 的 list，
       那条接口本来就只返回顶层留言（回复嵌在各自的 replies 里），
       所以这里不用再过滤一遍（见 utils/wallUtils.js 的 buildDanmakuPool）。
    ② **弹幕上不带留言者的名字** —— 只有头像 + 正文。这条是在「视图模型」那一层
       就落实的（池子里根本没有 name 字段），模板里也就无从显示。
    ③ **发射时机错开** —— 五条轨道不是一起开工：第 n 条的首发延迟 = n × stagger + 随机，
       于是弹幕是「一条接一条」冒出来的，而不是一屏同时起飞。
    ④ **每次发射都从已有留言里随机抽** —— pick() 是纯随机，
       只多做一件事：同一条轨道不连着抽中同一条（否则看着像卡住了）。

    ## 什么时候不出现
    两个条件写在父级 Aside 的 showDanmaku 里：未登录、或当前就在留言路由上。
    后者顺带把「数据同步」这件事变成免费的 —— 离开留言板页时本组件被销毁、
    回来时重新挂载，池子自然是新的，不需要额外的事件总线去通知它重拉。

    ## ⚠ uid 是「后到」的（曾经这里有个真 bug）
    刷新页面时 vuex 里的 userInfo 是空的（内存态），要等 Head.vue 把
    GET /api/profile 拉回来才有 _id；而 mounted 那一刻它还是空的。
    如果此时直接放弃，表现就是：**板上明明有留言，卡片却一直显示空态**，
    一直要等到别的事情（比如自己在留言板上发一条）才把池子拉起来 ——
    看着就像「必须自己先留一句，弹幕才开始飞」。
    所以 fetchPool 只在拿得到 uid 时才发，并且 watch(wallOwnerId) 到位后补一次 init。

    ## ⚠ 运行时状态为什么不进 data
    计时器（loopTimers / removeTimers）、上一次抽中的下标（lastPick）、序号（seq）、
    调度是否在跑（running）都挂在 this 上而不进 data：它们只服务于调度、不进模板。
    放进 data 只会让 Vue 白做一层响应式 —— 而且按下标赋值（this.arr[i] = x）
    在 Vue 2 里本来就不响应，留着反而容易被误当成 bug 去查。
  -->
  <el-card
    id="blog-aside--danmaku"
    class="blog-card"
    shadow="never"
    @click.native="goWall"
  >
    <div slot="header" class="blog-card--header blog-danmaku--header">
      <h3>{{ danmaku.title }}</h3>
      <span class="blog-danmaku--entry">
        {{ danmaku.entry }}
        <i class="iconfont icon-right-1-copy"></i>
      </span>
    </div>

    <div class="blog-danmaku">
      <!-- 五条轨道：v-for 一定铺满 trackCount 条，轨道高度因此恒定 —— -->
      <!-- 空态是叠在轨道上方的（见 .blog-danmaku--empty），卡片不会因为「有/没有弹幕」跳高度 -->
      <div
        v-for="(items, track) in tracks"
        :key="track"
        class="blog-danmaku--track"
      >
        <div
          v-for="item in items"
          :key="item.key"
          class="blog-danmaku--item"
          :style="{ animationDuration: item.duration + 's' }"
        >
          <span class="blog-danmaku--avatar">
            <img :src="item.avatar" alt="" />
          </span>
          <span class="blog-danmaku--bubble">{{ item.content }}</span>
        </div>
      </div>

      <div v-if="loaded && !pool.length" class="blog-danmaku--empty">
        {{ danmaku.empty }}
      </div>
    </div>
  </el-card>
</template>

<script>
import { mapGetters } from "vuex";
import store from "store";
import { WALL_DANMAKU } from "@/config/wall.config";
import { buildDanmakuPool } from "@/utils/wallUtils";
// 「我现在看的是谁的主页」—— 他人主页下弹幕池换成被访问用户的留言板
import visitContext from "@/mixins/visitContext";

// 留言者没设过头像时的兜底（与 Aside / ChatBubble 用的是同一张图）
const DEFAULT_AVATAR = require("@/assets/images/avator-default.jpg");

/** [min, max] 内的随机整数（闭区间） */
function randInt([min, max]) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** [min, max] 内的随机小数，保留两位（时长精确到 0.01s 足够了） */
function randFloat([min, max]) {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

export default {
  name: "WallDanmaku",
  mixins: [visitContext],
  data() {
    return {
      danmaku: WALL_DANMAKU,
      // 五条轨道，每条一个「正在飞的弹幕」数组（同轨道同一时刻至多一条，见 schedule）
      tracks: Array.from({ length: WALL_DANMAKU.trackCount }, () => []),
      // 弹幕池：从自己留言板上拉回来的顶层留言
      pool: [],
      // 池子拉完了没有（决定空态什么时候出现 —— 拉的过程中不要闪一下「还没有人留言」）
      loaded: false
    };
  },
  computed: {
    ...mapGetters("http", ["userInfo"]),
    /**
     * 弹幕池取自谁的留言板
     *   他人主页 → 被访问用户；否则 → 登录用户自己
     * uid 优先取 localStorage（刷新后还在），回退 userInfo —— 与 Message.vue 同一口径
     */
    wallOwnerId() {
      const target = this.visitedUserId || store.get("uid") || this.userInfo?.data?._id;
      return target ? String(target) : "";
    }
  },
  watch: {
    /**
     * uid 到位了就把池子拉起来（理由见模板上方「uid 是后到的」那段）
     * ⚠ 只在第一次「从空到有」时会触发：之后 uid 不会再变
     *   （登出会让本组件整体销毁、换账号则重新挂载）
     */
    wallOwnerId(id) {
      if (id) this.init();
    }
  },
  created() {
    // 非响应式的运行时状态（理由见模板上方注释）
    this.loopTimers = [];
    this.removeTimers = [];
    this.lastPick = {};
    this.seq = 0;
    this.running = false;
  },
  mounted() {
    this.init();
  },
  beforeDestroy() {
    this.stop();
  },
  methods: {
    // ==================== 取弹幕池 ====================

    /** 拉池子 + 按池子内容决定要不要开调度（挂载时、uid 后到时各一次） */
    async init() {
      if (!this.wallOwnerId) return;
      await this.fetchPool();
      this.syncRunning();
    },

    async fetchPool() {
      try {
        const res = await this.$api({
          type: "getWallMessages",
          params: { userId: this.wallOwnerId },
          data: { page: 1, size: this.danmaku.poolSize }
        });
        this.pool = buildDanmakuPool(res?.data);
      } catch {
        // 接口配了 noMessage（失败是静默的）；这里退化成空态即可，
        // 侧栏其余部分照常工作 —— 弹幕墙本来就是个锦上添花的东西
      } finally {
        // ⚠ 失败也要置 true：否则一直停在「加载中」的空白态，
        //   和「板上一句话都没有」看起来一样，但用户根本没有可行动作
        this.loaded = true;
      }
    },

    // ==================== 发射调度 ====================

    /** 五条轨道依次开工（错峰），之后各飞各的 */
    start() {
      if (this.running) return;
      this.running = true;
      const { trackCount, stagger } = this.danmaku;
      for (let track = 0; track < trackCount; track++) {
        // track × stagger 拉开先后，再加一点随机，免得每次刷新都是同一个节奏
        this.schedule(track, track * stagger + randInt([0, stagger]));
      }
    },

    /**
     * 给某条轨道排下一发（自己排自己，形成循环）
     *
     * ⚠ 必须等上一条「飞完 + 一段随机空档」才发下一条：
     *   不等飞完就发，两条弹幕会在同一条轨道里追尾叠在一起。
     */
    schedule(track, delay) {
      this.loopTimers[track] = setTimeout(() => {
        const duration = this.launch(track);
        const gap = randInt(this.danmaku.trackGap);
        this.schedule(track, (duration || 0) * 1000 + gap);
      }, delay);
    },

    /**
     * 发一条
     * @returns {number|null} 这条的飞行时长（秒）；池子空了返回 null
     */
    launch(track) {
      const picked = this.pick(track);
      if (!picked) return null;

      const duration = randFloat(this.danmaku.flyDuration);
      const bullet = {
        key: `dm-${this.seq++}`,
        ...picked,
        avatar: picked.avatar || DEFAULT_AVATAR,
        duration
      };
      this.tracks[track].push(bullet);

      // 飞完就摘掉：省 DOM，也让「动画结束」和「数据生命周期」对齐。
      // ⚠ 晚 400ms 再摘：CSS 动画与 JS 计时器不保证同一帧，
      //   按 duration 准点摘会看到弹幕「没飞完就消失了」
      this.removeTimers.push(
        setTimeout(() => this.remove(track, bullet.key), duration * 1000 + 400)
      );

      return duration;
    },

    /** 随机抽一条留言（池子只有一条时自然会重复，这是预期内的） */
    pick(track) {
      const total = this.pool.length;
      if (!total) return null;
      let index = Math.floor(Math.random() * total);
      if (total > 1 && this.lastPick[track] === index) index = (index + 1) % total;
      this.lastPick[track] = index;
      return this.pool[index];
    },

    remove(track, key) {
      const list = this.tracks[track];
      const index = list.findIndex((item) => item.key === key);
      if (index > -1) list.splice(index, 1);
    },

    /** 清掉所有计时器（组件销毁、或池子空了要停机时） */
    stop() {
      this.loopTimers.forEach(clearTimeout);
      this.removeTimers.forEach(clearTimeout);
      this.loopTimers = [];
      this.removeTimers = [];
      this.running = false;
    },

    /** 清空五条轨道（池子空了：飞着的那几条对应的留言已经被删了） */
    clearTracks() {
      this.tracks = Array.from({ length: this.danmaku.trackCount }, () => []);
    },

    /**
     * 让「调度开关」和「池子有没有内容」对齐
     *   池子从无到有 → 把五条轨道开起来
     *   池子从有到无 → 停机并清空轨道（不然定时器就一直空转，launch 每次返回 null）
     */
    syncRunning() {
      if (this.pool.length) {
        this.start();
        return;
      }
      this.stop();
      this.clearTracks();
    },

    // ==================== 交互 ====================

    /** 点卡片 → 自己的留言板 */
    goWall() {
      // 他人主页下跳被访问用户的留言板（?uid=），否则跳自己的
      this.$router.push({
        name: "Message",
        query: this.visitedUserId ? { uid: this.visitedUserId } : {},
      });
    }
  }
};
</script>
