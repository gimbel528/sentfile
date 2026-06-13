const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB（KV 单值上限）
const EXPIRY_OPTIONS = {
  '1h': 3600,
  '24h': 86400,
  '7d': 604800,
};

function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const segments = [8, 4, 4];
  return segments.map(len =>
    Array.from(crypto.getRandomValues(new Uint8Array(len)))
      .map(b => chars[b % chars.length])
      .join('')
  ).join('-');
}

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

// KV 存储结构：每个文件用两个 key
// {fileId}       -> 文件二进制内容
// {fileId}:meta  -> JSON 元数据

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    // 上传接口
    if (request.method === 'POST' && url.pathname === '/api/upload') {
      return handleUpload(request, env);
    }

    // 获取文件信息
    if (request.method === 'GET' && url.pathname.startsWith('/api/info/')) {
      return handleGetInfo(request, env);
    }

    // 验证密码
    if (request.method === 'POST' && url.pathname.startsWith('/api/verify/')) {
      return handleVerify(request, env);
    }

    // 下载文件
    if (request.method === 'GET' && url.pathname.startsWith('/api/download/')) {
      return handleDownload(request, env);
    }

    return new Response('Not Found', { status: 404 });
  },

  // 定时清理过期文件
  async scheduled(event, env) {
    const list = await env.STORE.list({ prefix: '' });
    const now = Date.now();
    for (const key of list.keys) {
      // 只处理 meta key，从中判断是否过期
      if (key.name.endsWith(':meta')) {
        try {
          const metaStr = await env.STORE.get(key.name, 'text');
          if (metaStr) {
            const meta = JSON.parse(metaStr);
            if (meta.expiresAt && now > meta.expiresAt) {
              const fileId = key.name.replace(':meta', '');
              await env.STORE.delete(fileId);
              await env.STORE.delete(key.name);
            }
          }
        } catch { /* 忽略解析错误 */ }
      }
    }
  },
};

async function handleUpload(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  const expiry = formData.get('expiry') || '24h';
  const password = formData.get('password') || '';
  const oneTime = formData.get('oneTime') === 'true';

  if (!file) {
    return jsonResponse({ error: '未选择文件' }, 400);
  }

  if (file.size > MAX_FILE_SIZE) {
    return jsonResponse({ error: '文件超过 25MB 限制' }, 400);
  }

  const expirySeconds = EXPIRY_OPTIONS[expiry] || EXPIRY_OPTIONS['24h'];
  const expiresAt = Date.now() + expirySeconds * 1000;
  const fileId = generateId();

  // 存储文件内容
  const fileBuffer = await file.arrayBuffer();
  await env.STORE.put(fileId, fileBuffer);

  // 存储元数据
  const metadata = {
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    size: file.size,
    expiresAt,
    oneTime,
    hasPassword: password !== '',
    passwordHash: password ? await hashPassword(password) : '',
  };
  await env.STORE.put(`${fileId}:meta`, JSON.stringify(metadata));

  return jsonResponse({
    id: fileId,
    url: `https://send.liuqingyun.top/f/${fileId}`,
    expiresAt,
  });
}

async function handleGetInfo(request, env) {
  const fileId = request.url.split('/api/info/')[1];
  if (!fileId) return jsonResponse({ error: '无效链接' }, 400);

  const metaStr = await env.STORE.get(`${fileId}:meta`, 'text');
  if (!metaStr) return jsonResponse({ error: '文件不存在或已过期' }, 404);

  const meta = JSON.parse(metaStr);
  if (meta.expiresAt && Date.now() > meta.expiresAt) {
    await env.STORE.delete(fileId);
    await env.STORE.delete(`${fileId}:meta`);
    return jsonResponse({ error: '文件已过期' }, 404);
  }

  return jsonResponse({
    filename: meta.filename || '未知文件',
    size: meta.size || 0,
    contentType: meta.contentType,
    hasPassword: meta.hasPassword,
    oneTime: meta.oneTime,
  });
}

async function handleVerify(request, env) {
  const fileId = request.url.split('/api/verify/')[1];
  if (!fileId) return jsonResponse({ error: '无效链接' }, 400);

  const { password } = await request.json();
  const metaStr = await env.STORE.get(`${fileId}:meta`, 'text');
  if (!metaStr) return jsonResponse({ error: '文件不存在或已过期' }, 404);

  const meta = JSON.parse(metaStr);
  if (meta.passwordHash) {
    const hash = await hashPassword(password || '');
    if (hash !== meta.passwordHash) {
      return jsonResponse({ error: '密码错误' }, 403);
    }
  }

  return jsonResponse({ valid: true });
}

async function handleDownload(request, env) {
  const url = new URL(request.url);
  const fileId = url.pathname.split('/api/download/')[1];
  const password = url.searchParams.get('pwd') || '';

  if (!fileId) return jsonResponse({ error: '无效链接' }, 400);

  const metaStr = await env.STORE.get(`${fileId}:meta`, 'text');
  if (!metaStr) return jsonResponse({ error: '文件不存在或已过期' }, 404);

  const meta = JSON.parse(metaStr);

  // 检查过期
  if (meta.expiresAt && Date.now() > meta.expiresAt) {
    await env.STORE.delete(fileId);
    await env.STORE.delete(`${fileId}:meta`);
    return jsonResponse({ error: '文件已过期' }, 404);
  }

  // 检查密码
  if (meta.passwordHash) {
    const hash = await hashPassword(password);
    if (hash !== meta.passwordHash) {
      return jsonResponse({ error: '密码错误' }, 403);
    }
  }

  // 获取文件内容
  const fileData = await env.STORE.get(fileId, 'arrayBuffer');
  if (!fileData) return jsonResponse({ error: '文件不存在或已过期' }, 404);

  // 一次性下载：先删除再返回
  if (meta.oneTime) {
    await env.STORE.delete(fileId);
    await env.STORE.delete(`${fileId}:meta`);
  }

  const headers = new Headers();
  headers.set('Content-Type', meta.contentType || 'application/octet-stream');
  headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.filename || 'download')}`);
  headers.set('Content-Length', (meta.size || fileData.byteLength).toString());
  Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

  return new Response(fileData, { headers });
}
