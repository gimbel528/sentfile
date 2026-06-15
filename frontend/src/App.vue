<template>
  <div class="app">
    <header class="header">
      <router-link to="/" class="logo">Send</router-link>
      <span class="subtitle">临时文件中转</span>
    </header>
    <main class="main">
      <router-view />
    </main>
    <footer class="footer">
      文件最大 100MB · 自动过期 · 端到端加密传输
    </footer>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background: #0f172a;
  color: #e2e8f0;
  min-height: 100vh;
}

.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 24px;
  border-bottom: 1px solid #1e293b;
}

.logo {
  font-size: 24px;
  font-weight: 700;
  color: #38bdf8;
  text-decoration: none;
}

.subtitle {
  font-size: 14px;
  color: #64748b;
}

.main {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.footer {
  text-align: center;
  padding: 16px;
  font-size: 12px;
  color: #475569;
  border-top: 1px solid #1e293b;
}
</style>
