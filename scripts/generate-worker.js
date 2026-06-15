// 生成集成版 Worker 代码（B2 + KV 方案）
// 运行方式：node scripts/generate-worker.js

const fs = require('fs');
const path = require('path');

// 读取构建产物
const distDir = path.join(__dirname, '../frontend/dist');
const assetsDir = path.join(distDir, 'assets');

const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf8');

// 查找 JS 和 CSS 文件
const assets = fs.readdirSync(assetsDir);
const jsFile = assets.find(f => f.endsWith('.js'));
const cssFile = assets.find(f => f.endsWith('.css'));

if (!jsFile || !cssFile) {
  console.error('找不到构建产物，请先运行 npm run build');
  process.exit(1);
}

const js = fs.readFileSync(path.join(assetsDir, jsFile), 'utf8');
const css = fs.readFileSync(path.join(assetsDir, cssFile), 'utf8');

// 修改 HTML 中的资源路径
const modifiedHtml = html
  .replace(`/assets/${jsFile}`, '/assets/index.js')
  .replace(`/assets/${cssFile}`, '/assets/index.css');

// 读取 Worker API 代码
const workerApi = fs.readFileSync(path.join(__dirname, '../worker/src/index.js'), 'utf8');

// 提取 API 逻辑（去掉 export default 和前端无关的部分）
// 我们直接把 API 代码和前端资源合并

const workerCode = `// Backblaze B2 + Cloudflare Workers 文件中转服务（集成版）
// 文件存储在 B2，元数据存储在 KV，前端页面内嵌

// ========== 前端静态资源（内嵌） ==========
const HTML = ${JSON.stringify(modifiedHtml)};
const JS = ${JSON.stringify(js)};
const CSS = ${JSON.stringify(css)};

// ========== API 逻辑 ==========
${workerApi.replace(/^export default \{/, 'const apiHandler = {').replace(/\};\s*$/, '};')}

// ========== 主入口 ==========
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // 静态资源
    if (url.pathname === '/assets/index.js') {
      return new Response(JS, {
        headers: { 'Content-Type': 'application/javascript', ...corsHeaders() },
      });
    }
    if (url.pathname === '/assets/index.css') {
      return new Response(CSS, {
        headers: { 'Content-Type': 'text/css', ...corsHeaders() },
      });
    }

    // API 接口
    if (request.method === 'POST' && url.pathname === '/api/upload') {
      return handleUpload(request, env);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/info/')) {
      return handleGetInfo(request, env);
    }
    if (request.method === 'POST' && url.pathname.startsWith('/api/verify/')) {
      return handleVerify(request, env);
    }
    if (request.method === 'GET' && url.pathname.startsWith('/api/download/')) {
      return handleDownload(request, env);
    }

    // 前端页面（所有其他路径都返回 index.html，由 Vue Router 处理）
    return new Response(HTML, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders() },
    });
  },

  async scheduled(event, env) {
    return apiHandler.scheduled(event, env);
  },
};
`;

// 写入文件
const outputPath = path.join(__dirname, '../worker/src/index-integrated.js');
fs.writeFileSync(outputPath, workerCode, 'utf8');

console.log('集成版 Worker 代码已生成：' + outputPath);
console.log('文件大小：' + (fs.statSync(outputPath).size / 1024).toFixed(1) + ' KB');
