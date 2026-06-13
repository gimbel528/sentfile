<template>
  <div class="download-card">
    <!-- 加载中 -->
    <div v-if="loading" class="loading">
      <div class="spinner"></div>
      <p>获取文件信息...</p>
    </div>

    <!-- 文件不存在 -->
    <div v-else-if="notFound" class="not-found">
      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <h2>文件不存在或已过期</h2>
      <p>该链接已失效，文件可能已过期或已被删除</p>
      <router-link to="/" class="btn-back">返回首页</router-link>
    </div>

    <!-- 需要输入密码 -->
    <div v-else-if="needPassword && !verified" class="password-section">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
      <h2>此文件需要密码</h2>
      <div class="password-form">
        <input v-model="password" type="text" placeholder="输入提取密码" class="input" @keyup.enter="verify" />
        <button class="btn-verify" :disabled="!password || verifying" @click="verify">
          {{ verifying ? '验证中...' : '验证' }}
        </button>
      </div>
      <p v-if="pwdError" class="error">{{ pwdError }}</p>
    </div>

    <!-- 文件信息 + 下载 -->
    <div v-else class="file-section">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
      <h2 class="filename">{{ fileInfo.filename }}</h2>
      <div class="meta">
        <span>{{ formatSize(fileInfo.size) }}</span>
        <span v-if="fileInfo.oneTime" class="badge">一次性</span>
      </div>
      <button class="btn-download" @click="download">
        下载文件
      </button>
      <p v-if="fileInfo.oneTime" class="warning">此文件仅可下载一次，下载后将立即删除</p>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'

const API = '/api'
const route = useRoute()
const fileId = route.params.id

const loading = ref(true)
const notFound = ref(false)
const needPassword = ref(false)
const verified = ref(false)
const password = ref('')
const verifying = ref(false)
const pwdError = ref('')
const fileInfo = ref({})

onMounted(async () => {
  try {
    const res = await fetch(`${API}/info/${fileId}`)
    if (!res.ok) {
      notFound.value = true
      return
    }
    const data = await res.json()
    fileInfo.value = data
    needPassword.value = data.hasPassword
    if (!data.hasPassword) verified.value = true
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
})

async function verify() {
  verifying.value = true
  pwdError.value = ''
  try {
    const res = await fetch(`${API}/verify/${fileId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: password.value }),
    })
    if (!res.ok) {
      const data = await res.json()
      pwdError.value = data.error || '密码错误'
      return
    }
    verified.value = true
  } catch {
    pwdError.value = '验证失败'
  } finally {
    verifying.value = false
  }
}

function download() {
  let url = `${API}/download/${fileId}`
  if (needPassword.value && password.value) {
    url += `?pwd=${encodeURIComponent(password.value)}`
  }
  window.location.href = url
}

function formatSize(bytes) {
  if (!bytes) return '0 B'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}
</script>

<style scoped>
.download-card {
  width: 100%;
  max-width: 480px;
  background: #1e293b;
  border-radius: 16px;
  padding: 40px 32px;
  text-align: center;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  color: #64748b;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid #334155;
  border-top-color: #38bdf8;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.not-found h2 {
  font-size: 20px;
  margin-top: 16px;
  color: #94a3b8;
}

.not-found p {
  color: #64748b;
  font-size: 14px;
  margin-top: 8px;
}

.btn-back {
  display: inline-block;
  margin-top: 20px;
  padding: 10px 24px;
  background: #334155;
  color: #e2e8f0;
  border-radius: 8px;
  text-decoration: none;
  font-size: 14px;
}

.btn-back:hover {
  background: #475569;
}

.password-section h2 {
  font-size: 20px;
  margin-top: 16px;
}

.password-form {
  display: flex;
  gap: 8px;
  margin-top: 20px;
}

.input {
  flex: 1;
  padding: 10px 14px;
  border: 1px solid #334155;
  border-radius: 8px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 14px;
  outline: none;
}

.input:focus {
  border-color: #38bdf8;
}

.btn-verify {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  background: #38bdf8;
  color: #0f172a;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.btn-verify:disabled {
  opacity: 0.5;
}

.file-section .filename {
  font-size: 20px;
  font-weight: 600;
  margin-top: 16px;
  word-break: break-all;
}

.meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
  color: #64748b;
  font-size: 14px;
}

.badge {
  background: #f59e0b;
  color: #0f172a;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
}

.btn-download {
  margin-top: 24px;
  padding: 14px 40px;
  border: none;
  border-radius: 10px;
  background: #38bdf8;
  color: #0f172a;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-download:hover {
  background: #7dd3fc;
}

.warning {
  margin-top: 12px;
  font-size: 12px;
  color: #f59e0b;
}

.error {
  color: #f87171;
  font-size: 14px;
  margin-top: 8px;
}
</style>
