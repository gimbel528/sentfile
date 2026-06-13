<template>
  <div class="upload-card">
    <h1 class="title">发送文件</h1>
    <p class="desc">选择文件，设置选项，生成分享链接</p>

    <!-- 文件选择 -->
    <div class="drop-zone" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop" @click="triggerFileInput">
      <input ref="fileInput" type="file" @change="onFileChange" hidden />
      <div v-if="!file" class="drop-hint">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="1.5"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
        <p>拖拽文件到此处，或点击选择</p>
        <p class="small">最大 25MB</p>
      </div>
      <div v-else class="file-info">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="1.5"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        <div>
          <p class="filename">{{ file.name }}</p>
          <p class="filesize">{{ formatSize(file.size) }}</p>
        </div>
        <button class="btn-remove" @click.stop="file = null">✕</button>
      </div>
    </div>

    <!-- 选项 -->
    <div class="options">
      <div class="option-row">
        <label>过期时间</label>
        <div class="btn-group">
          <button v-for="(label, key) in expiryOptions" :key="key" :class="{ active: expiry === key }" @click="expiry = key">{{ label }}</button>
        </div>
      </div>

      <div class="option-row">
        <label>密码保护</label>
        <div class="toggle-wrapper">
          <button class="toggle" :class="{ on: usePassword }" @click="usePassword = !usePassword">
            {{ usePassword ? '开' : '关' }}
          </button>
          <input v-if="usePassword" v-model="password" type="text" placeholder="输入密码" class="input" maxlength="32" />
        </div>
      </div>

      <div class="option-row">
        <label>一次性下载</label>
        <button class="toggle" :class="{ on: oneTime }" @click="oneTime = !oneTime">
          {{ oneTime ? '开' : '关' }}
        </button>
      </div>
    </div>

    <!-- 上传按钮 -->
    <button class="btn-upload" :disabled="!file || uploading" @click="upload">
      {{ uploading ? '上传中...' : '生成链接' }}
    </button>

    <!-- 进度条 -->
    <div v-if="uploading" class="progress-bar">
      <div class="progress-fill" :style="{ width: progress + '%' }"></div>
    </div>

    <!-- 结果 -->
    <div v-if="result" class="result">
      <p class="result-label">分享链接</p>
      <div class="link-box">
        <input :value="result.url" readonly class="link-input" @click="$event.target.select()" />
        <button class="btn-copy" @click="copyLink">{{ copied ? '已复制' : '复制' }}</button>
      </div>
      <p class="result-hint">链接在 {{ expiryOptions[expiry] }} 后失效{{ oneTime ? '，且仅可下载一次' : '' }}</p>
    </div>

    <!-- 错误 -->
    <p v-if="error" class="error">{{ error }}</p>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const API = '/api'

const file = ref(null)
const fileInput = ref(null)
const dragging = ref(false)
const expiry = ref('24h')
const usePassword = ref(false)
const password = ref('')
const oneTime = ref(false)
const uploading = ref(false)
const progress = ref(0)
const result = ref(null)
const error = ref('')
const copied = ref(false)

const expiryOptions = { '1h': '1 小时', '24h': '24 小时', '7d': '7 天' }

function triggerFileInput() {
  fileInput.value.click()
}

function onFileChange(e) {
  file.value = e.target.files[0] || null
  error.value = ''
  result.value = null
}

function onDrop(e) {
  dragging.value = false
  file.value = e.dataTransfer.files[0] || null
  error.value = ''
  result.value = null
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

async function upload() {
  if (!file.value) return
  uploading.value = true
  progress.value = 0
  error.value = ''
  result.value = null

  const formData = new FormData()
  formData.append('file', file.value)
  formData.append('expiry', expiry.value)
  if (usePassword.value && password.value) {
    formData.append('password', password.value)
  }
  formData.append('oneTime', oneTime.value.toString())

  try {
    const xhr = new XMLHttpRequest()
    const promise = new Promise((resolve, reject) => {
      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100)
      })
      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText))
        } else {
          try {
            reject(JSON.parse(xhr.responseText).error)
          } catch {
            reject('上传失败')
          }
        }
      })
      xhr.addEventListener('error', () => reject('网络错误'))
    })

    xhr.open('POST', `${API}/upload`)
    xhr.send(formData)
    const data = await promise
    result.value = data
  } catch (e) {
    error.value = typeof e === 'string' ? e : '上传失败'
  } finally {
    uploading.value = false
  }
}

async function copyLink() {
  if (!result.value) return
  try {
    await navigator.clipboard.writeText(result.value.url)
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
  } catch {
    // fallback
    const input = document.querySelector('.link-input')
    input.select()
    document.execCommand('copy')
    copied.value = true
    setTimeout(() => copied.value = false, 2000)
  }
}
</script>

<style scoped>
.upload-card {
  width: 100%;
  max-width: 520px;
  background: #1e293b;
  border-radius: 16px;
  padding: 32px;
}

.title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 4px;
}

.desc {
  color: #64748b;
  font-size: 14px;
  margin-bottom: 24px;
}

.drop-zone {
  border: 2px dashed #334155;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 20px;
}

.drop-zone:hover,
.drop-zone.dragging {
  border-color: #38bdf8;
  background: rgba(56, 189, 248, 0.05);
}

.drop-hint p {
  margin-top: 8px;
  color: #64748b;
}

.drop-hint .small {
  font-size: 12px;
  color: #475569;
}

.file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
}

.filename {
  font-weight: 500;
  word-break: break-all;
}

.filesize {
  font-size: 13px;
  color: #64748b;
}

.btn-remove {
  margin-left: auto;
  background: none;
  border: none;
  color: #64748b;
  font-size: 16px;
  cursor: pointer;
  padding: 4px 8px;
}

.btn-remove:hover {
  color: #f87171;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}

.option-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.option-row label {
  font-size: 14px;
  color: #94a3b8;
  white-space: nowrap;
}

.btn-group {
  display: flex;
  gap: 4px;
  background: #0f172a;
  border-radius: 8px;
  padding: 3px;
}

.btn-group button {
  padding: 6px 14px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #94a3b8;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-group button.active {
  background: #38bdf8;
  color: #0f172a;
  font-weight: 600;
}

.toggle-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toggle {
  padding: 6px 16px;
  border: none;
  border-radius: 6px;
  background: #0f172a;
  color: #64748b;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s;
}

.toggle.on {
  background: #38bdf8;
  color: #0f172a;
  font-weight: 600;
}

.input {
  padding: 6px 12px;
  border: 1px solid #334155;
  border-radius: 6px;
  background: #0f172a;
  color: #e2e8f0;
  font-size: 13px;
  outline: none;
  width: 140px;
}

.input:focus {
  border-color: #38bdf8;
}

.btn-upload {
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: #38bdf8;
  color: #0f172a;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.btn-upload:hover:not(:disabled) {
  background: #7dd3fc;
}

.btn-upload:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.progress-bar {
  height: 4px;
  background: #0f172a;
  border-radius: 2px;
  margin-top: 12px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: #38bdf8;
  border-radius: 2px;
  transition: width 0.2s;
}

.result {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid #334155;
}

.result-label {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 8px;
}

.link-box {
  display: flex;
  gap: 8px;
}

.link-input {
  flex: 1;
  padding: 10px 12px;
  border: 1px solid #334155;
  border-radius: 8px;
  background: #0f172a;
  color: #38bdf8;
  font-size: 14px;
  outline: none;
}

.btn-copy {
  padding: 10px 18px;
  border: none;
  border-radius: 8px;
  background: #334155;
  color: #e2e8f0;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}

.btn-copy:hover {
  background: #475569;
}

.result-hint {
  font-size: 12px;
  color: #475569;
  margin-top: 8px;
}

.error {
  color: #f87171;
  font-size: 14px;
  margin-top: 12px;
  text-align: center;
}
</style>
