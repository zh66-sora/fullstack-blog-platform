import http from '@/request/api/http'

export default {
  install(Vue) {
    Object.defineProperty(Vue.prototype, '$api', {
      value: http,
      writable: false,
      configurable: false
    })
  }
}