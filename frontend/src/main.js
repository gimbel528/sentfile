import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

// 全局请求拦截，自动带上 localStorage 保存的访问密码
const originalFetch = window.fetch
window.fetch = (url, options = {}) => {
  const pwd = localStorage.getItem('accessPwd')
  if (pwd) {
    options.headers = options.headers || {}
    if (options.headers instanceof Headers) {
      options.headers.set('X-Access-Pwd', pwd)
    } else {
      options.headers['X-Access-Pwd'] = pwd
    }
  }
  return originalFetch(url, options)
}

const app = createApp(App)
app.use(router)
app.mount('#app')