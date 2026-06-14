import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import axios from 'axios'

// 全局请求拦截，自动带上全局访问密码1
axios.interceptors.request.use((config) => {
  config.headers['X-Access-Pwd'] = '1'
  return config
}, (error) => {
  return Promise.reject(error)
})

const app = createApp(App)
app.use(router)
app.config.globalProperties.$axios = axios
app.mount('#app')
