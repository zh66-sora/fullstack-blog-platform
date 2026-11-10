import axios from 'axios'
import store from 'store'
const tokenName = process.env.VUE_APP_BLOG_API_TOKEN_NAME

const instance = axios.create({
  baseURL: process.env.VUE_APP_BLOG_API_BASE_URL,
  timeout: process.env.VUE_APP_BLOG_API_TIMEOUT
})

// 请求拦截器
instance.interceptors.request.use((config) => {
  const token = store.get(tokenName)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
}, (error) => Promise.reject(error)
)


// 响应拦截器
instance.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error)
)

export default instance