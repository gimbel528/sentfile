import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import axios from 'axios'

// 全局请求拦截，自动带上全局访问密码
axios.interceptors.request.use((config) => {
  // 这里填你设置的全局登录密码，和Cloudflare环境变量ACCESS_PASSWORD完全一致
  config.headers['X-Access-Pwd'] = '1'
  return config
}, (error) => {
  return Promise.reject(error)
})

// 创建Vue实例挂载
const app = createApp(App)
app.use(router)
// 全局挂载axios，页面里可以用 this.$axios
app.config.globalProperties.$axios = axios
app.mount('#app')
