<template>
  <div class="blog-header-avatar">
    <el-image v-show="avatarPic" :src="avatarPic" fit="cover"></el-image>
  </div>
</template>

<script>
import { mapGetters } from 'vuex/dist/vuex.common.js';

export default {
  computed:{
    ...mapGetters("http", ["userInfo"]), 
    avatarPic(){
      return this.userInfo?.data?.avatar
    }
  }
}
</script>

<style lang='stylus'>
.blog-header-avatar 
  height 100%
  width auto
</style>