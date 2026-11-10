import Vue from 'vue'
import Element from 'element-ui'
import 'element-ui/lib/theme-chalk/index.css'
import '../element-variables.scss'

Vue.use(Element, {
  size: 'small',   // 全局组件尺寸
  zIndex: 3000     // 弹窗层级基数
})
