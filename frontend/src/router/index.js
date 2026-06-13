import { createRouter, createWebHistory } from 'vue-router'
import Upload from '../views/Upload.vue'
import Download from '../views/Download.vue'

const routes = [
  { path: '/', component: Upload },
  { path: '/f/:id', component: Download },
]

export default createRouter({
  history: createWebHistory(),
  routes,
})
