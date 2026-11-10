<template>
  <div id="blog-form">
    <el-form :model="form"  ref="form">
      <el-form-item
        v-for="item in formData"
        :key="item.query"
        :label="item.label"
        :prop="item.query"
        :rules='validates[item.query]'
      >
        <!-- placeholder 取自 form.config.js —— 原项目的原生 <input> 就是靠它做输入提示的 -->
        <el-input
          v-model="form[item.query]"
          :type="item.type"
          :placeholder="item.placeholder"
        />
      </el-form-item>
    </el-form>
  </div>
</template>

<script>
  import formConfig from '@/config/form.config.js'
  import validateConfig from "@/config/validate.config.js"

  export default {
    name:'BaseForm',
    methods:{
      validate(callback){
        this.$refs.form.validate(callback)
      },
      /**
       * 清空输入值 + 清除校验状态（红框和报错文案）。
       *
       * 供 AuthModal 在弹窗「每次打开」时调用：el-dialog 是 v-show，关闭只是隐藏 DOM，
       * 组件实例和 form 数据都还在 —— 不清的话，上次输入的内容和
       * 「账号格式 数字+字母 6-8位」这类报错会一直留到下次打开。
       *
       * 清值用 form = {}（v-model 取不到值，el-input 就回落到 placeholder）；
       * 清校验用 clearValidate（它只改校验状态，不碰字段值，语义比 resetFields 直接 ——
       * resetFields 是按字段挂载时的快照回写，字段多起来后行为容易和直觉不符）。
       */
      reset(){
        this.form = {}
        this.$refs.form && this.$refs.form.clearValidate()
      }
    },
    data(){
      return {
        form:{}
      }
    },
    watch:{
      type:{
        // 表单类型变化（登录 ↔ 注册 ↔ 添加分类…）时也要清空，避免带着上一种表单的字段值去做校验
        immediate:true,
        handler(){
          this.reset()
        }
      }
    },
    computed:{
      formData(){
        return formConfig[this.type] ?? []
      },
      validates(){
        return validateConfig
      }
    },
    props:{
      type:{
        type:String
      }
    }
  }
</script>

<style>

</style>