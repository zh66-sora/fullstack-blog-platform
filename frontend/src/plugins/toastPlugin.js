import toast from '@/utils/message.js'

export default {
  install(Vue) {
    Object.defineProperty(Vue.prototype, '$toast', {
      value: toast,
      writable: false,
      configurable: false
    })
  }
}