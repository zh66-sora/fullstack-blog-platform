import { Notification } from 'element-ui'

const DURATION = 1000 // 统一持续时间，2 秒
const OFFSET = 70   // 出现位置距离顶部 100px，按需调整

const notify = {
  error(message, title = '错误') {
    Notification.error({ title, message, duration: DURATION, offset: OFFSET })
  },
  success(message, title = '成功') {
    Notification.success({ title, message, duration: DURATION, offset: OFFSET })
  },
  warning(message, title = '警告') {
    Notification.warning({ title, message, duration: DURATION, offset: OFFSET })
  },
  info(message, title = '提示') {
    Notification.info({ title, message, duration: DURATION, offset: OFFSET })
  }
}

export default notify