// Backblaze B2 + Cloudflare Workers 文件中转服务
// 文件存储在 B2，元数据存储在 KV

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB（Workers 请求体限制）
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

// B2 API 认证：获取 authorizationToken
async function b2Authorize(env) {
  // 使用缓存避免频繁认证
  if (env._b2Auth && env._b2Auth.expireAt > Date.now()) {
    return env._b2Auth;
  }

  const credentials = btoa(`${env.B2_KEY_ID}:${env.B2_APP_KEY}`);
  const res = await fetch('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    headers: { 'Authorization': `Basic ${credentials}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`B2 auth failed: ${res.status} ${text}`);
  }

  const data = await res.json();
  env._b2Auth = {
    authorizationToken: data.authorizationToken,
    apiUrl: data.apiUrl,
    downloadUrl: data.downloadUrl,
    expireAt: Date.now() + 23 * 60 * 60 * 1000, // 23小时后过期
  };
  return env._b2Auth;
}

// B2 上传文件
async function b2UploadFile(env, fileId, fileBuffer, contentType, filename) {
  const auth = await b2Authorize(env);

  // 获取上传 URL
  const uploadUrlRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ bucketId: env.B2_BUCKET_ID }),
  });

  if (!uploadUrlRes.ok) {
    const text = await uploadUrlRes.text();
    throw new Error(`B2 get upload URL failed: ${uploadUrlRes.status} ${text}`);
  }

  const { uploadUrl, authorizationToken } = await uploadUrlRes.json();

  // 上传文件
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': authorizationToken,
      'X-Bz-File-Name': encodeURIComponent(fileId),
      'Content-Type': contentType || 'b2/x-auto',
      'X-Bz-Content-Sha1': 'do_not_verify',
      'Content-Length': fileBuffer.byteLength.toString(),
    },
    body: fileBuffer,
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`B2 upload failed: ${uploadRes.status} ${text}`);
  }

  return await uploadRes.json();
}

// B2 下载文件
async function b2DownloadFile(env, fileId) {
  const auth = await b2Authorize(env);

  const downloadRes = await fetch(
    `${auth.downloadUrl}/b2api/v2/b2_download_file_by_id?fileId=${encodeURIComponent(await b2GetFileId(env, fileId))}`,
    {
      headers: { 'Authorization': auth.authorizationToken },
    }
  );

  if (!downloadRes.ok) {
    throw new Error(`B2 download failed: ${downloadRes.status}`);
  }

  return downloadRes;
}

// B2 通过文件名下载（更简单，不需要先查 fileId）
async function b2DownloadByName(env, fileId) {
  const auth = await b2Authorize(env);

  const downloadRes = await fetch(
    `${auth.downloadUrl}/file/${env.B2_BUCKET_NAME}/${encodeURIComponent(fileId)}`,
    {
      headers: { 'Authorization': auth.authorizationToken },
    }
  );

  if (!downloadRes.ok) {
    throw new Error(`B2 download failed: ${downloadRes.status}`);
  }

  return downloadRes;
}

// B2 删除文件
async function b2DeleteFile(env, fileId) {
  const auth = await b2Authorize(env);

  // 先获取文件的 fileId 和 fileName
  const listRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bucketId: env.B2_BUCKET_ID,
      prefix: fileId,
      maxFileCount: 1,
    }),
  });

  if (!listRes.ok) return;

  const listData = await listRes.json();
  if (listData.files && listData.files.length > 0) {
    const file = listData.files[0];
    await fetch(`${auth.apiUrl}/b2api/v2/b2_delete_file_version`, {
      method: 'POST',
      headers: {
        'Authorization': auth.authorizationToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fileId: file.fileId,
        fileName: file.fileName,
      }),
    });
  }
}

// 辅助函数：获取 B2 文件 ID（暂不使用，改用 by name 下载）
async function b2GetFileId(env, fileName) {
  const auth = await b2Authorize(env);
  const listRes = await fetch(`${auth.apiUrl}/b2api/v2/b2_list_file_names`, {
    method: 'POST',
    headers: {
      'Authorization': auth.authorizationToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      bucketId: env.B2_BUCKET_ID,
      prefix: fileName,
      maxFileCount: 1,
    }),
  });

  if (!listRes.ok) throw new Error('Failed to list B2 files');
  const data = await listRes.json();
  if (!data.files || data.files.length === 0) throw new Error('File not found in B2');
  return data.files[0].fileId;
}

// KV 存储结构：每个文件用一个 key 存元数据
// {fileId}:meta -> JSON 元数据
// 文件内容存储在 B2，key 为 fileId

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
      if (key.name.endsWith(':meta')) {
        try {
          const metaStr = await env.STORE.get(key.name, 'text');
          if (metaStr) {
            const meta = JSON.parse(metaStr);
            if (meta.expiresAt && now > meta.expiresAt) {
              const fileId = key.name.replace(':meta', '');
              // 删除 B2 中的文件
              await b2DeleteFile(env, fileId);
              // 删除 KV 中的元数据
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
    return jsonResponse({ error: '文件超过 100MB 限制' }, 400);
  }

  const expirySeconds = EXPIRY_OPTIONS[expiry] || EXPIRY_OPTIONS['24h'];
  const expiresAt = Date.now() + expirySeconds * 1000;
  const fileId = generateId();

  try {
    // 上传文件到 B2
    const fileBuffer = await file.arrayBuffer();
    await b2UploadFile(env, fileId, fileBuffer, file.type || 'application/octet-stream', file.name);

    // 存储元数据到 KV
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
  } catch (e) {
    return jsonResponse({ error: `上传失败: ${e.message}` }, 500);
  }
}

async function handleGetInfo(request, env) {
  const fileId = request.url.split('/api/info/')[1];
  if (!fileId) return jsonResponse({ error: '无效链接' }, 400);

  const metaStr = await env.STORE.get(`${fileId}:meta`, 'text');
  if (!metaStr) return jsonResponse({ error: '文件不存在或已过期' }, 404);

  const meta = JSON.parse(metaStr);
  if (meta.expiresAt && Date.now() > meta.expiresAt) {
    await b2DeleteFile(env, fileId);
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
    await b2DeleteFile(env, fileId);
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

  try {
    // 从 B2 下载文件
    const b2Response = await b2DownloadByName(env, fileId);

    // 一次性下载：先删除再返回
    if (meta.oneTime) {
      await b2DeleteFile(env, fileId);
      await env.STORE.delete(`${fileId}:meta`);
    }

    const headers = new Headers();
    headers.set('Content-Type', meta.contentType || 'application/octet-stream');
    headers.set('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(meta.filename || 'download')}`);
    if (meta.size) headers.set('Content-Length', meta.size.toString());
    Object.entries(corsHeaders()).forEach(([k, v]) => headers.set(k, v));

    return new Response(b2Response.body, { headers });
  } catch (e) {
    return jsonResponse({ error: `下载失败: ${e.message}` }, 500);
  }
}
